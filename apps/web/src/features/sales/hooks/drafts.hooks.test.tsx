import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  draftCaptureSchema,
  draftDataSchema,
  draftListQuerySchema,
  type DraftData,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import {
  draftDetailOptions,
  draftKeys,
  useDraft,
  useDraftList,
  useDraftActivity,
  useDraftChanges,
} from "./drafts.hooks";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  changes: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("../api/drafts.api", () => ({ draftsApi: mocks }));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  pieceId = "33333333-3333-4333-8333-333333333333",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const detail = (version = 1): DraftData => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [{ id: pieceId }],
  });
  const { customerId: _customerId, ...fields } = capture;
  return draftDataSchema.parse({
    draft: {
      ...fields,
      id,
      version,
      status: "DRAFT",
      owner: { id: actor, fullName: "Sales" },
      customer: null,
      pieces: capture.pieces.map((piece) => ({
        ...piece,
        position: 1,
        quantity: 1,
      })),
      createdAt: instant,
      updatedAt: instant,
      pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
      submission: { available: false, reason: "P03_NOT_READY" },
    },
  });
};
const session = (subject = actor) =>
  authUserDataSchema.parse({
    user: {
      id: subject,
      fullName: "Sales",
      email: "sales@example.test",
      phone: null,
      role: "USER",
      status: "ACTIVE",
      department: "SALES",
      staffApprovedAt: instant,
      emailVerifiedAt: instant,
      accessVersion: 1,
      createdAt: instant,
      updatedAt: instant,
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const scope = () => {
  const value = readOperationalScope(client);
  if (value === null) throw new Error("Expected scope");
  return value;
};
it("separates every accepted list selector and uses server totals/page without local filtering", async () => {
  const current = scope(),
    base = draftListQuerySchema.parse({});
  const keys = [
    base,
    { ...base, search: "name" },
    { ...base, customerId: id },
    { ...base, type: "REPAIR" as const },
    { ...base, page: 2 },
  ].map((query) => JSON.stringify(draftKeys.list(current, query)));
  expect(new Set(keys).size).toBe(5);
  mocks.list.mockResolvedValue({
    drafts: [],
    totalDrafts: 30,
    totalPieces: 51,
    pagination: {
      page: 2,
      limit: 25,
      total: 30,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    },
  });
  const view = renderHook(() => useDraftList({ page: 2, customerId: id }), {
    wrapper,
  });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(view.result.current.data?.totalPieces).toBe(51);
  expect(view.result.current.data?.pagination.page).toBe(2);
  expect(mocks.list).toHaveBeenCalledWith(
    { page: 2, limit: 25, customerId: id },
    expect.any(AbortSignal),
  );
  view.unmount();
});
it("reuses one monotonic detail owner for observers and explicit refresh", async () => {
  const captured = scope();
  let resolve: (value: DraftData) => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.get.mockReturnValue(
    new Promise<DraftData>((done) => {
      resolve = done;
    }),
  );
  const pending = client.fetchQuery({
    ...draftDetailOptions(client, captured, id),
    staleTime: 0,
  });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  client.setQueryData(draftKeys.detail(captured, id), detail(3));
  resolve(detail(1));
  await pending;
  expect(client.getQueryData(draftKeys.detail(captured, id))).toEqual(
    detail(3),
  );
  mocks.get.mockResolvedValue({
    ...detail(3),
    draft: {
      ...detail(3).draft,
      owner: { id: actor, fullName: "Current profile" },
    },
  });
  await client.fetchQuery({
    ...draftDetailOptions(client, captured, id),
    staleTime: 0,
  });
  expect(
    client.getQueryData<DraftData>(draftKeys.detail(captured, id))?.draft.owner
      .fullName,
  ).toBe("Current profile");
});
it("keeps global activity literal and history bounded while disabling invalid detail targets", async () => {
  const data = {
    changes: [],
    pagination: {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  mocks.activity.mockResolvedValue(data);
  mocks.changes.mockResolvedValue(data);
  const activity = renderHook(() => useDraftActivity({}), { wrapper }),
    changes = renderHook(() => useDraftChanges(id, {}), { wrapper }),
    invalid = renderHook(() => useDraft("bad-id"), { wrapper });
  await waitFor(() => {
    expect(
      activity.result.current.isSuccess && changes.result.current.isSuccess,
    ).toBe(true);
  });
  expect(mocks.activity).toHaveBeenCalledWith(
    { page: 1, limit: 25 },
    expect.any(AbortSignal),
  );
  expect(mocks.changes).toHaveBeenCalledWith(
    id,
    { page: 1, limit: 25 },
    expect.any(AbortSignal),
  );
  expect(mocks.get).not.toHaveBeenCalled();
  expect(invalid.result.current.fetchStatus).toBe("idle");
  activity.unmount();
  changes.unmount();
  invalid.unmount();
});
it.each(["same", "other"] as const)(
  "suppresses delayed replies across %s actor credential changes",
  async (kind) => {
    const first = scope();
    let resolve: (value: DraftData) => void = () => {
      throw new Error("Uninitialized response");
    };
    mocks.get.mockReturnValue(
      new Promise<DraftData>((done) => {
        resolve = done;
      }),
    );
    const view = renderHook(() => useDraft(id), { wrapper });
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledTimes(1);
    });
    act(() => {
      const epoch = beginAuthSessionEpoch("credential-login");
      const subject =
        kind === "same" ? actor : "44444444-4444-4444-8444-444444444444";
      acceptCredentialLogin("replacement", epoch, subject);
      client.setQueryData(AUTH_SESSION_QUERY_KEY, session(subject));
      view.rerender();
    });
    const current = scope();
    client.setQueryData(draftKeys.detail(current, id), detail(4));
    resolve(detail(1));
    await waitFor(() => {
      expect(client.getQueryData(draftKeys.detail(first, id))).toBeUndefined();
    });
    expect(client.getQueryData(draftKeys.detail(current, id))).toEqual(
      detail(4),
    );
    view.unmount();
  },
);
it("does not turn read errors into empty or new drafts", async () => {
  mocks.get.mockRejectedValue(new Error("foreign or missing"));
  const view = renderHook(() => useDraft(id), { wrapper });
  await waitFor(() => {
    expect(view.result.current.isError).toBe(true);
  });
  expect(view.result.current.data).toBeUndefined();
  view.unmount();
});
