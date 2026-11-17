import { approvalOrderDataSchema } from "@template/contracts";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import { approvalKeys } from "@/features/approval/hooks/approval.hooks";
import { salesContactKeys } from "@/features/sales/hooks/sales-contact.hooks";
import { AxiosError, AxiosHeaders } from "axios";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  administrationScopeKey,
  readAdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import {
  p08AdminSession,
  p08CorrectionCommandFixture,
  p08DetailFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Envelope, orderFixture } from "@/test/p03-fixtures";
import { administrationCommandSessionSchema } from "../model/administration-command-state";
import { administrationKeys } from "./administration.hooks";
import { useAdministrationCommand } from "./administration-commands.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const scope = () => {
  const current = readAdministrationOperationalScope(client);
  if (!current) throw new Error("Expected admin scope");
  return current;
};
const sessionKey = () => [
  ...administrationScopeKey(scope()),
  "command-session",
];
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const httpError = (status: number, code: string) => {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Boundary failure", undefined, config, undefined, {
    status,
    statusText: "Failure",
    headers: {},
    config,
    data: {
      success: false,
      statusCode: status,
      message: "Failure",
      code,
      requestId: "synthetic-request",
      errors: [],
      timestamp: "2026-11-16T00:00:00.000Z",
      path: "/api/v1/administration-commands",
    },
  });
};
const unknown = () => {
  const { body } = p08CorrectionCommandFixture();
  client.setQueryData(
    sessionKey(),
    administrationCommandSessionSchema.parse({
      phase: "unknown",
      originScope: scope(),
      body,
      failure: {
        message: "Unknown",
        statusCode: 0,
        code: "NETWORK_ERROR",
        requestId: "",
        fieldErrors: {},
      },
    }),
  );
  return body;
};
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  transport.post.mockResolvedValue(
    p03Envelope(p08CorrectionCommandFixture().result),
  );
  transport.get.mockImplementation((path) => {
    if (path.includes("administration-commands"))
      return Promise.resolve(p03Envelope(p08CorrectionCommandFixture().result));
    return Promise.resolve(p03Envelope(p08DetailFixture(2)));
  });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("publishes confirmation before required reads, retains sync failure and repairs without another write", async () => {
  const detail = deferred<unknown>();
  transport.get.mockReturnValueOnce(detail.promise);
  const hook = renderHook(useAdministrationCommand, { wrapper });
  let pending: Promise<unknown>;
  act(() => {
    pending = hook.result.current.submit(p08CorrectionCommandFixture().body);
  });
  await waitFor(() => {
    expect(hook.result.current.state.phase).toBe("confirmed");
  });
  expect(hook.result.current.busy).toBe(true);
  detail.resolve(p03Envelope(p08DetailFixture(1)));
  await act(async () => {
    await expect(pending).rejects.toThrow();
  });
  await waitFor(() => {
    expect(hook.result.current.state.phase).toBe("confirmed");
    const state = hook.result.current.state;
    if (state.phase === "confirmed") expect(state.syncError).toBeTruthy();
  });
  await act(async () => {
    await hook.result.current.synchronize();
  });
  await waitFor(() => {
    expect(hook.result.current.state.phase).toBe("synchronized");
  });
  expect(transport.post).toHaveBeenCalledTimes(1);
  act(() => {
    hook.result.current.acknowledge();
  });
  await waitFor(() => {
    expect(hook.result.current.state.phase).toBe("idle");
  });
});
it.each(["observe", "retrySame"] as const)(
  "%s finds the original receipt and never posts",
  async (action) => {
    unknown();
    const hook = renderHook(useAdministrationCommand, { wrapper });
    await act(async () => {
      await hook.result.current[action]();
    });
    expect(transport.get.mock.calls[0]?.[0]).toBe(
      `/administration-commands/${p03Ids.command}`,
    );
    expect(transport.post).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(hook.result.current.state.phase).toBe("synchronized");
    });
  },
);
it("fresh exact404 admits one byte-for-byte original retry after observation", async () => {
  const original = unknown();
  transport.get.mockRejectedValueOnce(
    httpError(404, "ADMINISTRATION_COMMAND_NOT_FOUND"),
  );
  const hook = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await hook.result.current.retrySame();
  });
  expect(transport.get.mock.invocationCallOrder[0]).toBeLessThan(
    transport.post.mock.invocationCallOrder[0] ?? 0,
  );
  expect(transport.post.mock.calls).toEqual([
    ["/administration/commands", original],
  ]);
  await waitFor(() => {
    expect(hook.result.current.state.phase).toBe("synchronized");
  });
});
it("Observe404 remains unknown and a later retry observes afresh instead of using cached404", async () => {
  unknown();
  const hook = renderHook(useAdministrationCommand, { wrapper });
  transport.get.mockRejectedValueOnce(
    httpError(404, "ADMINISTRATION_COMMAND_NOT_FOUND"),
  );
  await act(async () => {
    await expect(hook.result.current.observe()).rejects.toThrow();
  });
  expect(hook.result.current.state.phase).toBe("unknown");
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.retrySame();
  });
  expect(
    transport.get.mock.calls.filter(([path]) =>
      path.includes("administration-commands"),
    ),
  ).toHaveLength(2);
  expect(transport.post).not.toHaveBeenCalled();
});
it.each([
  [404, "OTHER_NOT_FOUND"],
  [500, "SERVER_ERROR"],
  [422, "VALIDATION_FAILED"],
] as const)("observation failure %s/%s sends no POST", async (status, code) => {
  unknown();
  transport.get.mockRejectedValueOnce(httpError(status, code));
  const hook = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await expect(hook.result.current.retrySame()).rejects.toThrow();
  });
  expect(hook.result.current.state.phase).toBe("unknown");
  expect(transport.post).not.toHaveBeenCalled();
});
it("malformed or foreign found receipt never authorizes retry", async () => {
  unknown();
  const receipt = p08CorrectionCommandFixture().result;
  transport.get.mockResolvedValueOnce(
    p03Envelope({
      ...receipt,
      receipt: {
        ...receipt.receipt,
        commandId: "90000000-0000-4000-8000-000000000001",
      },
    }),
  );
  const hook = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await expect(hook.result.current.retrySame()).rejects.toThrow();
  });
  expect(hook.result.current.state.phase).toBe("unknown");
  expect(transport.post).not.toHaveBeenCalled();
});
it("shared MutationCache guard rejects competing hook actions through observation and synchronization", async () => {
  unknown();
  const observation = deferred<unknown>();
  transport.get.mockReturnValueOnce(observation.promise);
  const hook = renderHook(
    () => ({
      first: useAdministrationCommand(),
      second: useAdministrationCommand(),
    }),
    { wrapper },
  );
  let pending: Promise<void>;
  act(() => {
    pending = hook.result.current.first.observe();
  });
  await act(async () => {
    await expect(hook.result.current.second.retrySame()).rejects.toMatchObject({
      code: "BUSY",
    });
    await expect(hook.result.current.second.observe()).rejects.toMatchObject({
      code: "BUSY",
    });
    await expect(
      hook.result.current.second.submit(p08CorrectionCommandFixture().body),
    ).rejects.toMatchObject({ code: "BUSY" });
  });
  expect(transport.get).toHaveBeenCalledTimes(1);
  expect(transport.post).not.toHaveBeenCalled();
  observation.resolve(p03Envelope(p08CorrectionCommandFixture().result));
  await act(async () => {
    await pending;
  });
});
it.each(["body", "account"] as const)(
  "late404 after changed %s sends no POST or result",
  async (change) => {
    unknown();
    const key = sessionKey(),
      observation = deferred<unknown>();
    transport.get.mockReturnValueOnce(observation.promise);
    const hook = renderHook(useAdministrationCommand, { wrapper });
    let pending: Promise<void>;
    act(() => {
      pending = hook.result.current.retrySame();
    });
    await waitFor(() => {
      expect(transport.get).toHaveBeenCalledTimes(1);
    });
    act(() => {
      if (change === "account") {
        beginAuthSessionEpoch("confirmed-ending");
        client.removeQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
      } else {
        const body = p08CorrectionCommandFixture().body;
        client.setQueryData(
          key,
          administrationCommandSessionSchema.parse({
            phase: "unknown",
            originScope: scope(),
            body: { ...body, reason: "Changed intent" },
            failure: {
              message: "Unknown",
              code: "NETWORK_ERROR",
              statusCode: 0,
              requestId: "",
              fieldErrors: {},
            },
          }),
        );
      }
    });
    observation.resolve(
      Promise.reject(httpError(404, "ADMINISTRATION_COMMAND_NOT_FOUND")),
    );
    await act(async () => {
      await expect(pending).rejects.toThrow();
    });
    expect(transport.post).not.toHaveBeenCalled();
  },
);
it("replay conflict preserves original unknown intent and an unmounted dialog can recover it", async () => {
  const original = unknown();
  transport.get.mockRejectedValueOnce(
    httpError(404, "ADMINISTRATION_COMMAND_NOT_FOUND"),
  );
  transport.post.mockRejectedValueOnce(
    httpError(409, "ADMINISTRATION_VERSION_CONFLICT"),
  );
  const first = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await expect(first.result.current.retrySame()).rejects.toThrow();
  });
  expect(first.result.current.state).toMatchObject({
    phase: "unknown",
    body: original,
  });
  first.unmount();
  const recovery = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await recovery.result.current.observe();
  });
  expect(recovery.result.current.state.phase).toBe("synchronized");
  expect(transport.post).toHaveBeenCalledTimes(1);
});
it("invalidates paper without fetching it and never replaces newer order detail with the receipt", async () => {
  unknown();
  client.setQueryData(
    administrationKeys.order(scope(), p03Ids.order),
    p08DetailFixture(8),
  );
  const paper = [
    "p08",
    scope().actorId,
    scope().accessVersion,
    scope().epoch,
    "report-print",
    "current",
  ];
  client.setQueryData(paper, { retained: "print" });
  const hook = renderHook(useAdministrationCommand, { wrapper });
  await act(async () => {
    await hook.result.current.observe();
  });
  expect(
    client.getQueryData(administrationKeys.order(scope(), p03Ids.order)),
  ).toMatchObject({ order: { version: 8 } });
  expect(client.getQueryState(paper)?.isInvalidated).toBe(true);
  expect(
    transport.get.mock.calls.some(([path]) => path.includes("report-print")),
  ).toBe(false);
});

it.each(["APPROVAL", "SALES_CONTACT"] as const)(
  "requires an inactive %s detail to reach the saved version before synchronized",
  async (capability) => {
    unknown();
    const permitted = readP04OperationalScope(client, capability);
    if (!permitted) throw new Error("Expected permitted scope");
    const key =
      capability === "APPROVAL"
        ? approvalKeys.order(permitted, p03Ids.order)
        : salesContactKeys.order(permitted, p03Ids.order);
    const detail = (version: number) =>
      approvalOrderDataSchema.parse({
        order: orderFixture(version),
        workflow: {
          initialApproval: null,
          currentReturn: null,
          allowedActions: { canApproveInitial: false, canReturnInitial: false },
          printEligibility: { allowed: false, reason: "NOT_APPROVED" },
          issues: [],
        },
      });
    client.setQueryData(key, detail(1));
    let freshVersion = 1;
    transport.get.mockImplementation((path) =>
      Promise.resolve(
        p03Envelope(
          path.includes("administration-commands")
            ? p08CorrectionCommandFixture().result
            : path.startsWith("/administration/")
              ? p08DetailFixture(2)
              : detail(freshVersion),
        ),
      ),
    );
    const hook = renderHook(useAdministrationCommand, { wrapper });
    await act(async () => {
      await expect(hook.result.current.observe()).rejects.toThrow();
    });
    await waitFor(() => {
      expect(hook.result.current.state.phase).toBe("confirmed");
    });
    expect(client.getQueryData(key)).toMatchObject({ order: { version: 1 } });
    freshVersion = 2;
    await act(async () => {
      await hook.result.current.synchronize();
    });
    await waitFor(() => {
      expect(hook.result.current.state.phase).toBe("synchronized");
    });
    expect(client.getQueryData(key)).toMatchObject({ order: { version: 2 } });
    expect(transport.post).not.toHaveBeenCalled();
  },
);
