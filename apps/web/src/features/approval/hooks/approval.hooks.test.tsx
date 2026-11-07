import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  approvalOrdersQuerySchema,
  approvalIssuesQuerySchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import {
  orderFixture,
  p03Ids,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import {
  approvalKeys,
  approvalOrderOptions,
  useApprovalOrder,
  useApprovalOrders,
  useApprovalIssues,
  useApprovalHistory,
  useApprovalOrderHistory,
} from "./approval.hooks";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  orders: vi.fn(),
  issues: vi.fn(),
  history: vi.fn(),
  orderHistory: vi.fn(),
  dashboard: vi.fn(),
  event: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({ approvalApi: transport }));
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
const detail = (version = 1) =>
  approvalOrderDataSchema.parse({
    order: orderFixture(version),
    workflow: {
      initialApproval: null,
      currentReturn: null,
      allowedActions: { canApproveInitial: true, canReturnInitial: true },
      printEligibility: { allowed: false, reason: "NOT_APPROVED" },
      issues: [],
    },
  });
const session = (department = "APPROVAL") => {
  const original = p03Session();
  return { ...original, user: { ...original.user, department } };
};
const scope = () => {
  const current = readP04OperationalScope(client, "APPROVAL");
  if (current === null) throw new Error("Expected approval scope");
  return current;
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("keeps normalized full-server filters distinct and invalidates an out-of-range destination without fetching it", async () => {
  const current = scope(),
    base = approvalOrdersQuerySchema.parse({});
  expect(
    new Set(
      [
        base,
        { ...base, page: 2 },
        { ...base, search: "SM" },
        { ...base, type: "REPAIR" as const },
      ].map((query) => JSON.stringify(approvalKeys.orders(current, query))),
    ).size,
  ).toBe(4);
  expect(
    approvalKeys.issues(
      current,
      approvalIssuesQuerySchema.parse({ state: "REAPPROVAL" }),
    ),
  ).not.toEqual(
    approvalKeys.issues(
      current,
      approvalIssuesQuerySchema.parse({ state: "SALES_CONTACT" }),
    ),
  );
  const destination = approvalKeys.orders(current, base);
  client.setQueryData(destination, { items: [], pagination: p03Pagination });
  transport.orders.mockResolvedValue({
    items: [],
    pagination: { ...p03Pagination, page: 4, hasPreviousPage: true },
  });
  const view = renderHook(() => useApprovalOrders({ page: "4", search: " " }), {
    wrapper,
  });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(view.result.current.data?.pagination.page).toBe(4);
  expect(client.getQueryState(destination)?.isInvalidated).toBe(true);
  expect(transport.orders).toHaveBeenCalledTimes(1);
  expect(transport.orders).toHaveBeenCalledWith(
    { page: 4, limit: 25, search: undefined },
    expect.any(AbortSignal),
  );
});
it("preserves newer current wrappers and turns a failed refresh into an error with retained context", async () => {
  const current = scope();
  transport.order.mockResolvedValue(detail(3));
  await client.fetchQuery(approvalOrderOptions(client, current, p03Ids.order));
  transport.order.mockResolvedValue(detail(2));
  await client.fetchQuery({
    ...approvalOrderOptions(client, current, p03Ids.order),
    staleTime: 0,
  });
  expect(
    client.getQueryData(approvalKeys.order(current, p03Ids.order)),
  ).toMatchObject({ order: { version: 3 } });
  const view = renderHook(
    () => {
      const query = useApprovalOrder(p03Ids.order);
      return {
        data: query.data,
        isError: query.isError,
        refetch: query.refetch,
      };
    },
    { wrapper },
  );
  transport.order.mockRejectedValue(new Error("Read failed"));
  await act(async () => {
    await view.result.current.refetch();
  });
  await waitFor(() => {
    expect(view.result.current.isError).toBe(true);
  });
  expect(view.result.current.data?.order.version).toBe(3);
  transport.order.mockResolvedValue({
    ...detail(),
    order: { ...detail().order, id: p03Ids.customer },
  });
  await expect(
    client.fetchQuery({
      ...approvalOrderOptions(client, current, p03Ids.order),
      staleTime: 0,
    }),
  ).rejects.toThrow(ApiContractError);
});
it("defaults history to approval authority while explicitly admitting an owner contact capability", async () => {
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  transport.orderHistory.mockResolvedValue({
    events: [],
    pagination: p03Pagination,
  });
  const denied = renderHook(() => useApprovalOrderHistory(p03Ids.order, {}), {
    wrapper,
  });
  expect(denied.result.current.fetchStatus).toBe("idle");
  expect(transport.orderHistory).not.toHaveBeenCalled();
  const allowed = renderHook(
    () => useApprovalOrderHistory(p03Ids.order, {}, "SALES_CONTACT"),
    { wrapper },
  );
  await waitFor(() => {
    expect(allowed.result.current.isSuccess).toBe(true);
  });
  expect(transport.orderHistory).toHaveBeenCalledWith(
    p03Ids.order,
    { page: 1, limit: 25 },
    expect.any(AbortSignal),
  );
});
it("keeps empty issue/decision histories truthful and suppresses a delayed old-account projection", async () => {
  transport.issues.mockResolvedValue({ items: [], pagination: p03Pagination });
  transport.history.mockResolvedValue({
    events: [],
    pagination: p03Pagination,
  });
  const lists = renderHook(
    () => ({
      issues: useApprovalIssues({ state: "REAPPROVAL" }),
      history: useApprovalHistory({}),
    }),
    { wrapper },
  );
  await waitFor(() => {
    expect(
      lists.result.current.issues.isSuccess &&
        lists.result.current.history.isSuccess,
    ).toBe(true);
  });
  expect(lists.result.current.issues.data?.items).toEqual([]);
  let release: (value: ReturnType<typeof detail>) => void = () => {
    throw new Error("Deferred response missing");
  };
  const delayed = new Promise<ReturnType<typeof detail>>((resolve) => {
    release = resolve;
  });
  transport.order
    .mockReturnValueOnce(delayed)
    .mockReturnValue(new Promise(() => {}));
  const first = scope(),
    view = renderHook(() => useApprovalOrder(p03Ids.order), { wrapper });
  await waitFor(() => {
    expect(transport.order).toHaveBeenCalledTimes(1);
  });
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("new", epoch, p03Ids.customer);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...session().user, id: p03Ids.customer },
    });
    view.rerender();
  });
  await act(async () => {
    release(detail(9));
    await Promise.resolve();
  });
  expect(
    client.getQueryData(approvalKeys.order(first, p03Ids.order)),
  ).toBeUndefined();
  expect(view.result.current.data).toBeUndefined();
});
