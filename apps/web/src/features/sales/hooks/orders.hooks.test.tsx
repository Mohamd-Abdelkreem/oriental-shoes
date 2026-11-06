import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  salesOrderListQuerySchema,
  salesOrderSummarySchema,
  salesOrderRevisionDataSchema,
  type SalesOrderData,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import {
  orderFixture,
  draftFixture,
  p03Session,
  p03Ids,
  p03Instant,
  p03Pagination,
} from "@/test/p03-fixtures";
import {
  orderKeys,
  orderDetailOptions,
  orderEditorOptions,
  useSalesOrders,
  useSalesOrder,
  useSalesOrderTracking,
  useSalesActivity,
  useSalesOrderActivity,
  useSalesOrderRevision,
} from "./orders.hooks";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  dashboard: vi.fn(),
  get: vi.fn(),
  editor: vi.fn(),
  tracking: vi.fn(),
  activity: vi.fn(),
  orderActivity: vi.fn(),
  revision: vi.fn(),
}));
vi.mock("../api/orders.api", () => ({ ordersApi: mocks }));
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const scope = () => {
  const current = readOperationalScope(client);
  if (!current) throw new Error("Expected scope");
  return current;
};
const list = (page = 1, total = 1) => ({
  items: [
    {
      kind: "submitted",
      order: salesOrderSummarySchema
        .strip()
        .parse({ ...orderFixture(), returnInfo: null }),
    },
  ],
  pagination: {
    ...p03Pagination,
    page,
    total,
    totalPages: total > 0 ? 1 : 0,
    hasPreviousPage: page > 1,
  },
  totalOrders: total,
  totalPieces: total,
  statusCounts: {
    DRAFT: 0,
    AWAITING_APPROVAL: total,
    RETURNED: 0,
    APPROVED: 0,
    READY_FOR_DELIVERY: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERY_FAILED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  },
});
it("normalizes every list filter and invalidates the exact fresh shrink destination", async () => {
  const current = scope(),
    base = salesOrderListQuerySchema.parse({}),
    destination = orderKeys.list(current, base);
  client.setQueryData(destination, list());
  const keys = [
    base,
    { ...base, search: "SM" },
    { ...base, type: "REPAIR" as const },
    { ...base, status: "RETURNED" as const },
    { ...base, customerId: p03Ids.customer },
    { ...base, page: 2 },
  ].map((query) => JSON.stringify(orderKeys.list(current, query)));
  expect(new Set(keys).size).toBe(6);
  mocks.list.mockResolvedValue(list(3));
  const view = renderHook(() => useSalesOrders({ page: "3" }), { wrapper });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(client.getQueryState(destination)?.isInvalidated).toBe(true);
  expect(view.result.current.data?.pagination.total).toBe(1);
  expect(mocks.list).toHaveBeenCalledWith(
    { page: 3, limit: 25, search: undefined },
    expect.any(AbortSignal),
  );
  view.unmount();
});
it("preserves monotonic detail and promotion and rejects a mismatched resource", async () => {
  const current = scope();
  mocks.get.mockResolvedValue({ order: orderFixture(3) });
  await client.fetchQuery(orderDetailOptions(client, current, p03Ids.order));
  mocks.get.mockResolvedValue({ order: orderFixture(2) });
  await client.fetchQuery({
    ...orderDetailOptions(client, current, p03Ids.order),
    staleTime: 0,
  });
  expect(
    client.getQueryData(orderKeys.detail(current, p03Ids.order)),
  ).toMatchObject({ order: { version: 3 } });
  mocks.get.mockResolvedValue({
    order: { ...orderFixture(), id: p03Ids.actor },
  });
  await expect(
    client.fetchQuery({
      ...orderDetailOptions(client, current, p03Ids.order),
      staleTime: 0,
    }),
  ).rejects.toBeInstanceOf(ApiContractError);
  mocks.editor.mockResolvedValue({ kind: "draft", draft: draftFixture() });
  await client.fetchQuery(orderEditorOptions(client, current, p03Ids.order));
  mocks.editor.mockResolvedValue({ kind: "submitted", order: orderFixture(2) });
  await client.fetchQuery({
    ...orderEditorOptions(client, current, p03Ids.order),
    staleTime: 0,
  });
  expect(
    client.getQueryData(orderKeys.editor(current, p03Ids.order)),
  ).toMatchObject({ kind: "submitted" });
  mocks.editor.mockResolvedValue({ kind: "draft", draft: draftFixture(3) });
  await client.fetchQuery({
    ...orderEditorOptions(client, current, p03Ids.order),
    staleTime: 0,
  });
  expect(
    client.getQueryData(orderKeys.editor(current, p03Ids.order)),
  ).toMatchObject({ kind: "submitted" });
});
it("rejects a late account detail and never publishes to current private keys", async () => {
  let resolve!: (data: SalesOrderData) => void;
  mocks.get.mockReturnValue(
    new Promise<SalesOrderData>((done) => {
      resolve = done;
    }),
  );
  const current = scope(),
    view = renderHook(() => useSalesOrder(p03Ids.order), { wrapper });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  act(() => {
    beginAuthSessionEpoch("confirmed-ending");
    resolve({ order: orderFixture() });
  });
  await waitFor(() => {
    expect(view.result.current.data).toBeUndefined();
  });
  expect(
    client.getQueryData(orderKeys.detail(current, p03Ids.order)),
  ).toBeUndefined();
  view.unmount();
});
it("keeps order activity disabled without a selected order and global activity keys free of operation filters", async () => {
  mocks.activity.mockResolvedValue({ events: [], pagination: p03Pagination });
  const disabled = renderHook(() => useSalesOrderActivity(null, {}), {
    wrapper,
  });
  expect(mocks.activity).not.toHaveBeenCalled();
  expect(mocks.orderActivity).not.toHaveBeenCalled();
  disabled.unmount();
  const global = renderHook(() => useSalesActivity({ page: 1, limit: 25 }), {
    wrapper,
  });
  await waitFor(() => {
    expect(global.result.current.isSuccess).toBe(true);
  });
  expect(orderKeys.activity(scope(), 1, 25)).toEqual([
    "customer-drafts",
    p03Ids.actor,
    1,
    scope().epoch,
    "orders",
    "activity",
    1,
    25,
  ]);
  global.unmount();
});
const revision = () =>
  salesOrderRevisionDataSchema.parse({
    event: {
      id: p03Ids.command,
      orderId: p03Ids.order,
      orderVersion: 1,
      businessNumber: "SHOP-2026-0001",
      operation: "SUBMIT_NEW_ORDER",
      pieceIds: [p03Ids.piece],
      actor: {
        id: p03Ids.actor,
        fullName: "Sales",
        role: "USER",
        department: "SALES",
      },
      occurredAt: p03Instant,
      notes: null,
      changedFields: ["status"],
      paidChange: null,
    },
    before: null,
    after: orderFixture(),
  });
it("fetches one lazy historical revision into a separate cache while current order stays newer", async () => {
  const current = scope();
  client.setQueryData(orderKeys.detail(current, p03Ids.order), {
    order: orderFixture(4),
  });
  mocks.revision.mockResolvedValue(revision());
  const initialSelection: { eventId: string | null } = { eventId: null };
  const view = renderHook(
    ({ eventId }: { eventId: string | null }) =>
      useSalesOrderRevision(p03Ids.order, eventId),
    { wrapper, initialProps: initialSelection },
  );
  expect(mocks.revision).not.toHaveBeenCalled();
  view.rerender({ eventId: p03Ids.command });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(view.result.current.data?.after.version).toBe(1);
  expect(
    client.getQueryData(orderKeys.detail(current, p03Ids.order)),
  ).toMatchObject({ order: { version: 4 } });
  view.unmount();
});
it("rejects wrong event identity and prevents tracking from going backwards", async () => {
  mocks.revision.mockResolvedValue({
    ...revision(),
    event: { ...revision().event, id: p03Ids.actor },
  });
  const history = renderHook(
    () => useSalesOrderRevision(p03Ids.order, p03Ids.command),
    { wrapper },
  );
  await waitFor(() => {
    expect(history.result.current.error).toBeInstanceOf(ApiContractError);
  });
  expect(history.result.current.data).toBeUndefined();
  history.unmount();
  const facts = (version: number) => ({
    orderId: p03Ids.order,
    orderVersion: version,
    counts: orderFixture().counts,
    pieces: orderFixture().pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
  });
  mocks.tracking.mockResolvedValue(facts(3));
  const tracking = renderHook(() => useSalesOrderTracking(p03Ids.order), {
    wrapper,
  });
  await waitFor(() => {
    expect(tracking.result.current.isSuccess).toBe(true);
  });
  mocks.tracking.mockResolvedValue(facts(2));
  await act(async () => {
    await tracking.result.current.refetch();
  });
  expect(tracking.result.current.data?.orderVersion).toBe(3);
  tracking.unmount();
});
