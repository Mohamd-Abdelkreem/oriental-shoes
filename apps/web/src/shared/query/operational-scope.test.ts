import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  QueryClientProvider,
  useQuery,
  skipToken,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CanceledError } from "axios";
import { authUserDataSchema } from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  apiClient,
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "./query-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  readOperationalScope,
  useOperationalScope,
  readP04OperationalScope,
  isCurrentP04OperationalScope,
  assertCurrentP04OperationalScope,
  useP04OperationalScope,
  p04ScopeKey,
  type P04Capability,
  readManufacturingOperationalScope,
  manufacturingScopeKey,
  isCurrentManufacturingOperationalScope,
  assertCurrentManufacturingOperationalScope,
  useManufacturingOperationalScope,
  readQualityOperationalScope,
  qualityScopeKey,
  isCurrentQualityOperationalScope,
  assertCurrentQualityOperationalScope,
  useQualityOperationalScope,
} from "./operational-scope";

const id = "11111111-1111-4111-8111-111111111111";
const account = (overrides: Record<string, unknown> = {}) =>
  authUserDataSchema.parse({
    user: {
      id,
      fullName: "Sales",
      email: "sales@example.test",
      phone: null,
      role: "USER",
      status: "ACTIVE",
      department: "SALES",
      staffApprovedAt: "2026-11-01T00:00:00.000Z",
      emailVerifiedAt: "2026-11-01T00:00:00.000Z",
      accessVersion: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      ...overrides,
    },
  });
const client = createQueryClient(),
  originalAdapter = apiClient.defaults.adapter;
beforeEach(() => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, id);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account());
});
afterEach(() => {
  if (originalAdapter === undefined) delete apiClient.defaults.adapter;
  else apiClient.defaults.adapter = originalAdapter;
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("admits only current parsed eligible SALES or ADMIN accounts", () => {
  expect(readOperationalScope(client)).toMatchObject({
    actorId: id,
    accessVersion: 1,
  });
  for (const change of [{ status: "SUSPENDED" }, { department: "QUALITY" }]) {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, account(change));
    expect(readOperationalScope(client)).toBeNull();
  }
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ role: "ADMIN", department: null, staffApprovedAt: null }),
  );
  expect(readOperationalScope(client)?.actorId).toBe(id);
});
it("rejects cached-success data when the session query is errored or malformed", () => {
  client
    .getQueryCache()
    .find({ queryKey: AUTH_SESSION_QUERY_KEY })
    ?.setState({ status: "error", error: new Error("session failed") });
  expect(readOperationalScope(client)).toBeNull();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, { user: { id } });
  expect(readOperationalScope(client)).toBeNull();
});
it("invalidates captured accessVersion and same-actor credential epoch without touching current data", () => {
  const first = readOperationalScope(client);
  if (first === null) throw new Error("Expected scope");
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account({ accessVersion: 2 }));
  expect(isCurrentOperationalScope(client, first)).toBe(false);
  expect(() => {
    assertCurrentOperationalScope(client, first);
  }).toThrow(CanceledError);
  const second = readOperationalScope(client);
  if (second === null) throw new Error("Expected updated scope");
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("new-synthetic", epoch, id);
  expect(isCurrentOperationalScope(client, second)).toBe(false);
  expect(readOperationalScope(client)?.epoch).toBe(epoch);
});

it("cleans only the obsolete root when the same actor signs in under a new epoch", async () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const view = renderHook(() => useOperationalScope(), { wrapper });
  const first = view.result.current;
  if (first === null) throw new Error("Expected initial scope");
  const oldKey = ["customer-drafts", id, 1, first.epoch, "customers"];
  client.setQueryData(oldKey, "obsolete");
  let currentKey: (string | number)[] = [];
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("same-actor-new-credential", epoch, id);
    currentKey = ["customer-drafts", id, 1, epoch, "customers"];
    client.setQueryData(currentKey, "current");
    client.setQueryData(AUTH_SESSION_QUERY_KEY, account());
    view.rerender();
  });
  await waitFor(() => {
    expect(client.getQueryData(oldKey)).toBeUndefined();
  });
  expect(client.getQueryData(currentKey)).toBe("current");
  view.unmount();
  expect(client.getQueryData(currentKey)).toBe("current");
});

it.each([
  { department: "SALES", allowed: ["SALES_CONTACT", "OFFICIAL_PAPER"] },
  { department: "APPROVAL", allowed: ["APPROVAL", "OFFICIAL_PAPER"] },
  { department: "CUTTING", allowed: [] },
  { department: "PRODUCTION", allowed: [] },
  { department: "QUALITY", allowed: [] },
  { department: "WAREHOUSE", allowed: [] },
])(
  "keeps the P04 capability allowlist explicit for $department",
  ({ department, allowed }) => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, account({ department }));
    for (const capability of [
      "APPROVAL",
      "SALES_CONTACT",
      "OFFICIAL_PAPER",
    ] as const)
      expect(readP04OperationalScope(client, capability) !== null).toBe(
        allowed.includes(capability),
      );
    if (department === "APPROVAL")
      expect(readOperationalScope(client)).toBeNull();
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      account({ role: "ADMIN", department: null, staffApprovedAt: null }),
    );
    for (const capability of [
      "APPROVAL",
      "SALES_CONTACT",
      "OFFICIAL_PAPER",
    ] as const)
      expect(readP04OperationalScope(client, capability)?.capability).toBe(
        capability,
      );
  },
);
it("rejects malformed, suspended, errored and obsolete P04 sessions without making current tuples interchangeable", () => {
  const scope = readP04OperationalScope(client, "SALES_CONTACT");
  if (scope === null) throw new Error("Expected contact scope");
  expect(p04ScopeKey(scope)).toEqual([
    "p04",
    "SALES_CONTACT",
    id,
    1,
    scope.epoch,
  ]);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account({ status: "SUSPENDED" }));
  expect(readP04OperationalScope(client, "OFFICIAL_PAPER")).toBeNull();
  expect(isCurrentP04OperationalScope(client, scope)).toBe(false);
  expect(() => {
    assertCurrentP04OperationalScope(client, scope);
  }).toThrow(CanceledError);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, { user: { id } });
  expect(readP04OperationalScope(client, "APPROVAL")).toBeNull();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account());
  client
    .getQueryCache()
    .find({ queryKey: AUTH_SESSION_QUERY_KEY })
    ?.setState({ status: "error", error: new Error("Session unavailable") });
  expect(readP04OperationalScope(client, "SALES_CONTACT")).toBeNull();
});
it.each([false, true])(
  "notifies both disabled ADMIN subscribers on origin authority loss and preserves replacement=%s",
  async (replace) => {
    let transportCalls = 0;
    apiClient.defaults.adapter = () => {
      transportCalls++;
      return Promise.reject(new Error("Unexpected scope-cleanup transport"));
    };
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      account({ role: "ADMIN", department: null, staffApprovedAt: null }),
    );
    const origin = readP04OperationalScope(client, "SALES_CONTACT");
    if (origin === null) throw new Error("Expected admin contact scope");
    const key = [
      ...p04ScopeKey(origin),
      "command-session",
      "owned-order",
    ] as const;
    const privateEntry = { privateNote: "Old contact notes" },
      replacement = { privateNote: "Replacement contact notes" };
    client.setQueryData(key, privateEntry);
    const readKey = [...p04ScopeKey(origin), "contact-order", "owned-order"];
    client.setQueryData(readKey, { privateNote: "Old order" });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const useSubscriber = (capability: P04Capability) => {
      useP04OperationalScope(capability);
      return useQuery({
        queryKey: key,
        queryFn: skipToken,
        enabled: false,
        gcTime: Infinity,
      });
    };
    const a = renderHook(() => useSubscriber("APPROVAL"), { wrapper }),
      b = renderHook(() => useSubscriber("SALES_CONTACT"), { wrapper });
    expect(a.result.current.data).toEqual(privateEntry);
    expect(b.result.current.data).toEqual(privateEntry);
    const stop = client.getQueryCache().subscribe((event) => {
      if (
        replace &&
        event.type === "updated" &&
        event.query.queryHash === JSON.stringify(key) &&
        event.query.state.data === undefined
      )
        client.setQueryData(key, replacement);
    });
    act(() => {
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        account({ department: "APPROVAL", accessVersion: 2 }),
      );
      a.rerender();
      b.rerender();
    });
    await waitFor(() => {
      expect(a.result.current.data).toEqual(replace ? replacement : undefined);
      expect(b.result.current.data).toEqual(replace ? replacement : undefined);
    });
    expect(client.getQueryData(key)).toEqual(replace ? replacement : undefined);
    expect(client.getQueryData(readKey)).toBeUndefined();
    expect(transportCalls).toBe(0);
    stop();
    a.unmount();
    b.unmount();
  },
);

it("keeps a captured prefix that becomes current again while cancellation is settling", async () => {
  const scope = readP04OperationalScope(client, "SALES_CONTACT");
  if (scope === null) throw new Error("Expected scope");
  const key = [...p04ScopeKey(scope), "contact-order", "same-order"];
  client.setQueryData(key, "current replacement");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const view = renderHook(() => useP04OperationalScope("SALES_CONTACT"), {
    wrapper,
  });
  act(() => {
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      account({ department: "APPROVAL" }),
    );
    view.rerender();
  });
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, account());
    view.rerender();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(client.getQueryData(key)).toBe("current replacement");
  view.unmount();
});

it("admits the exact factory department and revokes stale authority", () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "CUTTING" }),
  );
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  expect(scope).not.toBeNull();
  expect(readManufacturingOperationalScope(client, "PRODUCTION")).toBeNull();
  if (!scope) throw new Error("Expected factory scope");
  expect(manufacturingScopeKey(scope)).toEqual(["p05", id, 1, scope.epoch]);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "CUTTING", accessVersion: 2 }),
  );
  expect(isCurrentManufacturingOperationalScope(client, scope)).toBe(false);
  expect(() => {
    assertCurrentManufacturingOperationalScope(client, scope);
  }).toThrow(CanceledError);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "CUTTING", status: "SUSPENDED" }),
  );
  expect(readManufacturingOperationalScope(client, "CUTTING")).toBeNull();
});
it.each([false, true])(
  "cleans mounted factory observers and preserves synchronous replacement=%s",
  async (replace) => {
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      account({ role: "ADMIN", department: null, staffApprovedAt: null }),
    );
    const scope = readManufacturingOperationalScope(client, "CUTTING");
    if (!scope) throw new Error("Expected factory scope");
    const key = [...manufacturingScopeKey(scope), "command-session"];
    client.setQueryData(key, "private");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const view = renderHook(
      ({ department }: { department: "CUTTING" | "PRODUCTION" }) => {
        useManufacturingOperationalScope(department);
        return useQuery({
          queryKey: key,
          queryFn: skipToken,
          enabled: false,
          gcTime: Infinity,
        });
      },
      { wrapper, initialProps: { department: "CUTTING" } },
    );
    act(() => {
      view.rerender({ department: "PRODUCTION" });
    });
    expect(view.result.current.data).toBe("private");
    const stop = client.getQueryCache().subscribe((event) => {
      if (
        replace &&
        event.type === "updated" &&
        event.query.queryHash === JSON.stringify(key) &&
        event.query.state.data === undefined
      )
        client.setQueryData(key, "replacement");
    });
    act(() => {
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        account({ department: "CUTTING", accessVersion: 2 }),
      );
      view.rerender({ department: "PRODUCTION" });
    });
    await waitFor(() => {
      expect(view.result.current.data).toBe(
        replace ? "replacement" : undefined,
      );
    });
    stop();
    view.unmount();
  },
);

it("admits only current QUALITY or ADMIN scope and rejects stale access, session and epoch", () => {
  expect(readQualityOperationalScope(client)).toBeNull();
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "QUALITY" }),
  );
  const scope = readQualityOperationalScope(client);
  if (!scope) throw new Error("Expected quality scope");
  expect(qualityScopeKey(scope)).toEqual(["p06", id, 1, scope.epoch]);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "QUALITY", accessVersion: 2 }),
  );
  expect(isCurrentQualityOperationalScope(client, scope)).toBe(false);
  expect(() => {
    assertCurrentQualityOperationalScope(client, scope);
  }).toThrow(CanceledError);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ department: "QUALITY", status: "SUSPENDED" }),
  );
  expect(readQualityOperationalScope(client)).toBeNull();
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    account({ role: "ADMIN", department: null, staffApprovedAt: null }),
  );
  expect(readQualityOperationalScope(client)?.department).toBe("QUALITY");
  beginAuthSessionEpoch("confirmed-ending");
  expect(readQualityOperationalScope(client)).toBeNull();
});
it.each([false, true])(
  "clears mounted private quality observers without deleting a synchronous replacement=%s",
  async (replace) => {
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      account({ department: "QUALITY" }),
    );
    const scope = readQualityOperationalScope(client);
    if (!scope) throw new Error("Expected quality scope");
    const key = [...qualityScopeKey(scope), "command-session"],
      receipt = [...qualityScopeKey(scope), "command-receipt", "original"];
    client.setQueryData(key, "private");
    client.setQueryData(receipt, "private receipt");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const view = renderHook(
      () => {
        useQualityOperationalScope();
        return useQuery({
          queryKey: key,
          queryFn: skipToken,
          enabled: false,
          gcTime: Infinity,
        });
      },
      { wrapper },
    );
    view.rerender();
    expect(view.result.current.data).toBe("private");
    const stop = client.getQueryCache().subscribe((event) => {
      if (
        replace &&
        event.type === "updated" &&
        event.query.queryHash === JSON.stringify(key) &&
        event.query.state.data === undefined
      )
        client.setQueryData(key, "replacement");
    });
    act(() => {
      client.setQueryData(
        AUTH_SESSION_QUERY_KEY,
        account({ department: "CUTTING", accessVersion: 2 }),
      );
      view.rerender();
    });
    await waitFor(() => {
      expect(view.result.current.data).toBe(
        replace ? "replacement" : undefined,
      );
    });
    expect(client.getQueryData(receipt)).toBeUndefined();
    stop();
    view.unmount();
  },
);
