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
  salesOrderParamsSchema,
  salesOrderDataSchema,
  salesOrderEditorDataSchema,
  salesOrderListDataSchema,
  salesOrderListQuerySchema,
  salesDashboardDataSchema,
  salesOrderTrackingDataSchema,
  salesOrderActivityQuerySchema,
  salesOrderActivityDataSchema,
  salesOrderRevisionDataSchema,
  type SalesOrderData,
  type SalesOrderEditorData,
  type SalesOrderListQuery,
  type SalesOrderListQueryInput,
  type SalesOrderActivityQueryInput,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  useOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import { ordersApi } from "../api/orders.api";

const disabledScope: OperationalScope = {
  actorId: "",
  accessVersion: 0,
  epoch: -1,
};
export const orderKeys = {
  list: (scope: OperationalScope, query: SalesOrderListQuery) =>
    [
      ...customerKeys.root(scope),
      "orders",
      "list",
      query.search ?? "",
      query.type ?? null,
      query.status ?? null,
      query.customerId ?? null,
      query.page,
      query.limit,
    ] as const,
  dashboard: (scope: OperationalScope) =>
    [...customerKeys.root(scope), "orders", "dashboard"] as const,
  detail: (scope: OperationalScope, id: string) =>
    [...customerKeys.root(scope), "orders", "detail", id] as const,
  editor: (scope: OperationalScope, id: string) =>
    [...customerKeys.root(scope), "orders", "editor", id] as const,
  tracking: (scope: OperationalScope, id: string) =>
    [...customerKeys.root(scope), "orders", "tracking", id] as const,
  activity: (scope: OperationalScope, page: number, limit: number) =>
    [...customerKeys.root(scope), "orders", "activity", page, limit] as const,
  orderActivity: (
    scope: OperationalScope,
    id: string,
    page: number,
    limit: number,
  ) =>
    [
      ...customerKeys.root(scope),
      "orders",
      "activity",
      id,
      page,
      limit,
    ] as const,
  revision: (scope: OperationalScope, id: string, eventId: string) =>
    [...customerKeys.root(scope), "orders", "revision", id, eventId] as const,
};
const read = async <T>(
  client: QueryClient,
  scope: OperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentOperationalScope(client, scope);
  try {
    const received = await fetch();
    assertCurrentOperationalScope(client, scope);
    return received;
  } catch (error: unknown) {
    await reconcileBusinessDenial(client, error, scope);
    throw error;
  }
};
const useReadContext = () => {
  const client = useQueryClient(),
    current = useOperationalScope();
  return { client, current, scope: current ?? disabledScope };
};
export const orderDetailOptions = (
  client: QueryClient,
  scope: OperationalScope,
  orderId: string,
) => {
  const target = salesOrderParamsSchema.safeParse({ orderId }),
    id = target.success ? target.data.orderId : "";
  return queryOptions<SalesOrderData, unknown>({
    queryKey: orderKeys.detail(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => ordersApi.get(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): SalesOrderData | undefined => {
      if (!isCurrentOperationalScope(client, scope))
        return previous === undefined
          ? undefined
          : salesOrderDataSchema.parse(previous);
      const next = salesOrderDataSchema.parse(incoming),
        prior =
          previous === undefined
            ? undefined
            : salesOrderDataSchema.parse(previous);
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
const editorResource = (entry: SalesOrderEditorData) =>
  entry.kind === "draft" ? entry.draft : entry.order;
export const orderEditorOptions = (
  client: QueryClient,
  scope: OperationalScope,
  orderId: string,
) => {
  const target = salesOrderParamsSchema.safeParse({ orderId }),
    id = target.success ? target.data.orderId : "";
  return queryOptions<SalesOrderEditorData, unknown>({
    queryKey: orderKeys.editor(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => ordersApi.editor(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): SalesOrderEditorData | undefined => {
      if (!isCurrentOperationalScope(client, scope))
        return previous === undefined
          ? undefined
          : salesOrderEditorDataSchema.parse(previous);
      const next = salesOrderEditorDataSchema.parse(incoming),
        prior =
          previous === undefined
            ? undefined
            : salesOrderEditorDataSchema.parse(previous);
      if (
        editorResource(next).id !== id ||
        (prior !== undefined && editorResource(prior).id !== id)
      )
        throw new ApiContractError();
      if (prior?.kind === "submitted" && next.kind === "draft") return prior;
      return replaceEqualDeep(
        previous,
        prior !== undefined &&
          editorResource(prior).version > editorResource(next).version
          ? prior
          : next,
      );
    },
  });
};
export const useOrderEditor = (orderId: string | null) => {
  const { client, current, scope } = useReadContext(),
    target = salesOrderParamsSchema.safeParse({ orderId });
  return useQuery({
    ...orderEditorOptions(
      client,
      scope,
      target.success ? target.data.orderId : "",
    ),
    enabled: current !== null && target.success,
  });
};
export const useSalesOrder = (orderId: string | null) => {
  const { client, current, scope } = useReadContext(),
    target = salesOrderParamsSchema.safeParse({ orderId });
  return useQuery({
    ...orderDetailOptions(
      client,
      scope,
      target.success ? target.data.orderId : "",
    ),
    enabled: current !== null && target.success,
  });
};
const staleDestination = async (client: QueryClient, key: QueryKey) => {
  await client.invalidateQueries({
    queryKey: key,
    exact: true,
    refetchType: "none",
  });
};
export const useSalesOrders = (options: SalesOrderListQueryInput) => {
  const { client, current, scope } = useReadContext(),
    query = salesOrderListQuerySchema.parse(options);
  return useQuery({
    queryKey: orderKeys.list(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await ordersApi.list(query, signal);
        assertCurrentOperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await staleDestination(
            client,
            orderKeys.list(scope, { ...query, page: destination }),
          );
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, salesOrderListDataSchema.parse(incoming))
        : previous,
  });
};
export const useSalesDashboard = () => {
  const { client, current, scope } = useReadContext();
  return useQuery({
    queryKey: orderKeys.dashboard(scope),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => ordersApi.dashboard(signal)),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, salesDashboardDataSchema.parse(incoming))
        : previous,
  });
};
export const useSalesOrderTracking = (orderId: string | null) => {
  const { client, current, scope } = useReadContext(),
    target = salesOrderParamsSchema.safeParse({ orderId }),
    id = target.success ? target.data.orderId : "";
  return useQuery({
    queryKey: orderKeys.tracking(scope, id),
    enabled: current !== null && target.success,
    queryFn: ({ signal }) =>
      read(client, scope, () => ordersApi.tracking(id, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      const next = salesOrderTrackingDataSchema.parse(incoming),
        prior =
          previous === undefined
            ? undefined
            : salesOrderTrackingDataSchema.parse(previous);
      if (next.orderId !== id || (prior !== undefined && prior.orderId !== id))
        throw new ApiContractError();
      return replaceEqualDeep(
        previous,
        prior !== undefined && prior.orderVersion > next.orderVersion
          ? prior
          : next,
      );
    },
  });
};
export const useSalesActivity = (options: SalesOrderActivityQueryInput) =>
  useOrderActivityQuery({ kind: "global" }, options);
export const useSalesOrderActivity = (
  orderId: string | null,
  options: SalesOrderActivityQueryInput,
) => useOrderActivityQuery({ kind: "order", orderId }, options);
const useOrderActivityQuery = (
  selection: { kind: "global" } | { kind: "order"; orderId: string | null },
  options: SalesOrderActivityQueryInput,
) => {
  const orderId = selection.kind === "order" ? selection.orderId : null;
  const { client, current, scope } = useReadContext(),
    query = salesOrderActivityQuerySchema.parse(options),
    target = salesOrderParamsSchema.safeParse({ orderId }),
    id = target.success ? target.data.orderId : null;
  const key = (page: number) =>
    id === null
      ? orderKeys.activity(scope, page, query.limit)
      : orderKeys.orderActivity(scope, id, page, query.limit);
  return useQuery({
    queryKey: key(query.page),
    enabled: current !== null && (selection.kind === "global" || id !== null),
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received =
          id === null
            ? await ordersApi.activity(query, signal)
            : await ordersApi.orderActivity(id, query, signal);
        assertCurrentOperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await staleDestination(client, key(destination));
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(
            previous,
            salesOrderActivityDataSchema.parse(incoming),
          )
        : previous,
  });
};
export const useSalesOrderRevision = (
  orderId: string,
  eventId: string | null,
) => {
  const { client, current, scope } = useReadContext(),
    target = salesOrderParamsSchema.safeParse({ orderId }),
    event = salesOrderParamsSchema.safeParse({ orderId: eventId }),
    id = target.success ? target.data.orderId : "",
    selected = event.success ? event.data.orderId : "";
  return useQuery({
    queryKey: orderKeys.revision(scope, id, selected),
    enabled: current !== null && target.success && event.success,
    staleTime: 0,
    queryFn: ({ signal }) =>
      read(client, scope, () => ordersApi.revision(id, selected, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      const revision = salesOrderRevisionDataSchema.parse(incoming);
      if (
        revision.event.id !== selected ||
        revision.event.orderId !== id ||
        revision.after.id !== id ||
        revision.after.version !== revision.event.orderVersion
      )
        throw new ApiContractError();
      return replaceEqualDeep(previous, revision);
    },
  });
};
