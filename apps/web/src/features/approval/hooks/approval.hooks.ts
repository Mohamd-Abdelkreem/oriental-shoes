"use client";
import {
  queryOptions,
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  approvalOrdersQuerySchema,
  approvalIssuesQuerySchema,
  approvalHistoryQuerySchema,
  approvalOrderHistoryQuerySchema,
  approvalOrdersDataSchema,
  approvalIssuesDataSchema,
  approvalHistoryDataSchema,
  approvalOrderHistoryDataSchema,
  approvalOrderDataSchema,
  approvalDashboardDataSchema,
  approvalEventDataSchema,
  salesUuidSchema,
  type ApprovalOrdersQueryInput,
  type ApprovalIssuesQueryInput,
  type ApprovalHistoryQueryInput,
  type ApprovalOrderHistoryQueryInput,
  type ApprovalOrdersQuery,
  type ApprovalIssuesQuery,
  type ApprovalHistoryQuery,
  type ApprovalOrderData,
  type ApprovalOrdersData,
  type ApprovalIssuesData,
  type ApprovalHistoryData,
  type ApprovalOrderHistoryData,
  type ApprovalDashboardData,
  type ApprovalEventData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  p04ScopeKey,
  assertCurrentP04OperationalScope,
  isCurrentP04OperationalScope,
  useP04OperationalScope,
  type P04OperationalScope,
} from "@/shared/query/operational-scope";
import { approvalApi } from "../api/approval.api";

export type ApprovalHistoryCapability = "APPROVAL" | "SALES_CONTACT";
const useApprovalContext = (
  capability: ApprovalHistoryCapability = "APPROVAL",
) => {
  const client = useQueryClient(),
    current = useP04OperationalScope(capability);
  return {
    client,
    current,
    scope: current ?? { capability, actorId: "", accessVersion: 0, epoch: -1 },
  };
};
const read = async <T>(
  client: QueryClient,
  scope: P04OperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentP04OperationalScope(client, scope);
  try {
    const received = await fetch();
    assertCurrentP04OperationalScope(client, scope);
    return received;
  } catch (error: unknown) {
    assertCurrentP04OperationalScope(client, scope);
    await reconcileBusinessDenial(client, error, scope);
    assertCurrentP04OperationalScope(client, scope);
    throw error;
  }
};
const invalidateDestination = (client: QueryClient, key: QueryKey) =>
  client.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
export const approvalKeys = {
  dashboard: (scope: P04OperationalScope) =>
    [...p04ScopeKey(scope), "dashboard"] as const,
  orders: (scope: P04OperationalScope, query: ApprovalOrdersQuery) =>
    [
      ...p04ScopeKey(scope),
      "orders",
      query.search ?? "",
      query.type ?? null,
      query.page,
      query.limit,
    ] as const,
  issues: (scope: P04OperationalScope, query: ApprovalIssuesQuery) =>
    [
      ...p04ScopeKey(scope),
      "issues",
      query.search ?? "",
      query.type ?? null,
      query.state ?? null,
      query.page,
      query.limit,
    ] as const,
  history: (scope: P04OperationalScope, query: ApprovalHistoryQuery) =>
    [...p04ScopeKey(scope), "history", query.page, query.limit] as const,
  order: (scope: P04OperationalScope, id: string) =>
    [...p04ScopeKey(scope), "order", id] as const,
  orderHistory: (
    scope: P04OperationalScope,
    id: string,
    page: number,
    limit: number,
  ) => [...p04ScopeKey(scope), "order-history", id, page, limit] as const,
  event: (scope: P04OperationalScope, id: string, eventId: string) =>
    [...p04ScopeKey(scope), "event", id, eventId] as const,
};
export const approvalOrderOptions = (
  client: QueryClient,
  scope: P04OperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions<ApprovalOrderData, unknown>({
    queryKey: approvalKeys.order(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => approvalApi.order(id, signal));
    },
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentP04OperationalScope(client, scope)) return previous;
      const next = approvalOrderDataSchema.parse(incoming),
        prior =
          previous === undefined
            ? undefined
            : approvalOrderDataSchema.parse(previous);
      if (
        next.order.id !== id ||
        (prior !== undefined && prior.order.id !== id)
      )
        throw new ApiContractError();
      return replaceEqualDeep(
        previous,
        prior !== undefined && prior.order.version > next.order.version
          ? prior
          : next,
      );
    },
  });
};
export const useApprovalOrder = (orderId: string | null) => {
  const { client, current, scope } = useApprovalContext(),
    target = salesUuidSchema.safeParse(orderId);
  return useQuery({
    ...approvalOrderOptions(client, scope, target.success ? target.data : ""),
    enabled: current !== null && target.success,
  });
};
export const useApprovalDashboard = () => {
  const { client, current, scope } = useApprovalContext();
  return useQuery<ApprovalDashboardData>({
    queryKey: approvalKeys.dashboard(scope),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => approvalApi.dashboard(signal)),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(
            previous,
            approvalDashboardDataSchema.parse(incoming),
          )
        : previous,
  });
};
export const useApprovalOrders = (options: ApprovalOrdersQueryInput) => {
  const { client, current, scope } = useApprovalContext(),
    query = approvalOrdersQuerySchema.parse(options);
  return useQuery<ApprovalOrdersData>({
    queryKey: approvalKeys.orders(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await approvalApi.orders(query, signal);
        assertCurrentP04OperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await invalidateDestination(
            client,
            approvalKeys.orders(scope, { ...query, page: destination }),
          );
        assertCurrentP04OperationalScope(client, scope);
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(previous, approvalOrdersDataSchema.parse(incoming))
        : previous,
  });
};
export const useApprovalIssues = (options: ApprovalIssuesQueryInput) => {
  const { client, current, scope } = useApprovalContext(),
    query = approvalIssuesQuerySchema.parse(options);
  return useQuery<ApprovalIssuesData>({
    queryKey: approvalKeys.issues(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await approvalApi.issues(query, signal);
        assertCurrentP04OperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await invalidateDestination(
            client,
            approvalKeys.issues(scope, { ...query, page: destination }),
          );
        assertCurrentP04OperationalScope(client, scope);
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(previous, approvalIssuesDataSchema.parse(incoming))
        : previous,
  });
};
export const useApprovalHistory = (options: ApprovalHistoryQueryInput) => {
  const { client, current, scope } = useApprovalContext(),
    query = approvalHistoryQuerySchema.parse(options);
  return useQuery<ApprovalHistoryData>({
    queryKey: approvalKeys.history(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await approvalApi.history(query, signal);
        assertCurrentP04OperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await invalidateDestination(
            client,
            approvalKeys.history(scope, { ...query, page: destination }),
          );
        assertCurrentP04OperationalScope(client, scope);
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(previous, approvalHistoryDataSchema.parse(incoming))
        : previous,
  });
};
export const useApprovalOrderHistory = (
  orderId: string | null,
  options: ApprovalOrderHistoryQueryInput,
  capability: ApprovalHistoryCapability = "APPROVAL",
) => {
  const { client, current, scope } = useApprovalContext(capability),
    query = approvalOrderHistoryQuerySchema.parse(options),
    target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return useQuery<ApprovalOrderHistoryData>({
    queryKey: approvalKeys.orderHistory(scope, id, query.page, query.limit),
    enabled: current !== null && target.success,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await approvalApi.orderHistory(id, query, signal);
        assertCurrentP04OperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await invalidateDestination(
            client,
            approvalKeys.orderHistory(scope, id, destination, query.limit),
          );
        assertCurrentP04OperationalScope(client, scope);
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(
            previous,
            approvalOrderHistoryDataSchema.parse(incoming),
          )
        : previous,
  });
};
export const useApprovalEvent = (
  orderId: string,
  eventId: string | null,
  capability: ApprovalHistoryCapability = "APPROVAL",
) => {
  const { client, current, scope } = useApprovalContext(capability),
    target = salesUuidSchema.safeParse(orderId),
    event = salesUuidSchema.safeParse(eventId),
    id = target.success ? target.data : "",
    selected = event.success ? event.data : "";
  return useQuery<ApprovalEventData>({
    queryKey: approvalKeys.event(scope, id, selected),
    enabled: current !== null && target.success && event.success,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      read(client, scope, () => approvalApi.event(id, selected, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentP04OperationalScope(client, scope)) return previous;
      const parsed = approvalEventDataSchema.parse(incoming);
      if (parsed.event.orderId !== id || parsed.event.id !== selected)
        throw new ApiContractError();
      return replaceEqualDeep(previous, parsed);
    },
  });
};
