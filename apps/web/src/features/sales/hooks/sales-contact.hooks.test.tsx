import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  salesContactQuerySchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
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
  salesContactKeys,
  salesContactOrderOptions,
  useSalesContactQueue,
  useSalesContactOrder,
} from "./sales-contact.hooks";

const transport = vi.hoisted(() => ({ list: vi.fn(), order: vi.fn() }));
vi.mock("../api/sales-contact.api", () => ({ salesContactApi: transport }));
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
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: false, reason: "NOT_APPROVED" },
      issues: [],
    },
  });
const scope = () => {
  const current = readP04OperationalScope(client, "SALES_CONTACT");
  if (current === null) throw new Error("Expected contact scope");
  return current;
};
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
it("keeps omitted versus selected contact states and server shrink paging separate", async () => {
  const current = scope(),
    base = salesContactQuerySchema.parse({});
  expect(
    new Set(
      [
        base,
        { ...base, state: "SALES_CONTACT" as const },
        { ...base, state: "REAPPROVAL" as const },
      ].map((query) => JSON.stringify(salesContactKeys.list(current, query))),
    ).size,
  ).toBe(3);
  const destination = salesContactKeys.list(current, base);
  client.setQueryData(destination, { items: [], pagination: p03Pagination });
  transport.list.mockResolvedValue({
    items: [],
    pagination: { ...p03Pagination, page: 4, hasPreviousPage: true },
  });
  const view = renderHook(() => useSalesContactQueue({ page: "4" }), {
    wrapper,
  });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  expect(client.getQueryState(destination)?.isInvalidated).toBe(true);
  expect(transport.list).toHaveBeenCalledTimes(1);
  expect(transport.list).toHaveBeenCalledWith(
    { page: 4, limit: 25, search: undefined },
    expect.any(AbortSignal),
  );
});
it("preserves higher canonical context and keeps failed refresh visible without authorizing a response", async () => {
  const current = scope();
  transport.order.mockResolvedValue(detail(4));
  await client.fetchQuery(
    salesContactOrderOptions(client, current, p03Ids.order),
  );
  transport.order.mockResolvedValue(detail(2));
  await client.fetchQuery({
    ...salesContactOrderOptions(client, current, p03Ids.order),
    staleTime: 0,
  });
  const view = renderHook(
    () => {
      const query = useSalesContactOrder(p03Ids.order);
      return {
        data: query.data,
        isError: query.isError,
        refetch: query.refetch,
      };
    },
    { wrapper },
  );
  transport.order.mockRejectedValue(new Error("Refresh failed"));
  await act(async () => {
    await view.result.current.refetch();
  });
  await waitFor(() => {
    expect(view.result.current.isError).toBe(true);
  });
  expect(view.result.current.data?.order.version).toBe(4);
  expect(view.result.current.data?.workflow.issues).toEqual([]);
});
it("admits ADMIN broader reads but gates other departments and drops a late old-epoch result", async () => {
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p03Session().user, department: "APPROVAL" },
  });
  const denied = renderHook(() => useSalesContactOrder(p03Ids.order), {
    wrapper,
  });
  expect(denied.result.current.fetchStatus).toBe("idle");
  expect(transport.order).not.toHaveBeenCalled();
  denied.unmount();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: {
      ...p03Session().user,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    },
  });
  const current = scope();
  let resolve: (value: ReturnType<typeof detail>) => void = () => {
    throw new Error("Missing response");
  };
  transport.order.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = client
    .fetchQuery(salesContactOrderOptions(client, current, p03Ids.order))
    .catch((error: unknown) => error);
  await waitFor(() => {
    expect(transport.order).toHaveBeenCalledTimes(1);
  });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("replacement", epoch, p03Ids.customer);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session(p03Ids.customer));
  resolve(detail(9));
  await pending;
  expect(
    client.getQueryData(salesContactKeys.order(current, p03Ids.order)),
  ).toBeUndefined();
});
