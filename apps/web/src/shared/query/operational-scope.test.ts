import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CanceledError } from "axios";
import { authUserDataSchema } from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "./query-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  readOperationalScope,
  useOperationalScope,
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
const client = createQueryClient();
beforeEach(() => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, id);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account());
});
afterEach(() => {
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
