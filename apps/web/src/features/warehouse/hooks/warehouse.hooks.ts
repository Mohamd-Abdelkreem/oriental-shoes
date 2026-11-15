"use client";
import type { ZodType } from "zod";
import {
  queryOptions,
  replaceEqualDeep,
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  salesUuidSchema,
  warehouseDashboardQuerySchema,
  type WarehouseDashboardQuery,
  type WarehouseDashboardQueryInput,
  warehouseOrdersQuerySchema,
  warehousePiecesQuerySchema,
  warehouseActivityQuerySchema,
  warehouseOrderHistoryQuerySchema,
  warehouseOrderDataSchema,
  warehouseDashboardDataSchema,
  warehouseOrdersDataSchema,
  warehousePiecesDataSchema,
  warehouseActivityDataSchema,
  warehouseOrderHistoryDataSchema,
  type WarehouseOrdersQuery,
  type WarehousePiecesQuery,
  type WarehouseActivityQuery,
  type WarehouseOrderHistoryQuery,
  type WarehouseOrdersQueryInput,
  type WarehousePiecesQueryInput,
  type WarehouseActivityQueryInput,
  type WarehouseOrderHistoryQueryInput,
  type WarehouseOrderSummary,
  type WarehouseOrderData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentWarehouseOperationalScope,
  warehouseScopeKey,
  useWarehouseOperationalScope,
  type WarehouseOperationalScope,
} from "@/shared/query/operational-scope";
import { warehouseApi } from "../api/warehouse.api";
import {
  toWarehouseGroup,
  type WarehouseGroupDetailState,
} from "../model/warehouse-view.model";

const warehouseReadFailure = (error: unknown, action: string): string => {
  const reference = getApiError(error)
    .requestId.replace(/[^\w.-]/g, "")
    .slice(0, 128);
  return `تعذر ${action}. أعد المحاولة لتحديث بيانات المستودع.${reference ? ` المرجع: ${reference}` : ""}`;
};

export const warehouseKeys = {
  root: warehouseScopeKey,
  dashboard: (
    scope: WarehouseOperationalScope,
    query: WarehouseDashboardQuery,
  ) =>
    [
      ...warehouseScopeKey(scope),
      "dashboard",
      query.search ?? "",
      query.type ?? null,
    ] as const,
  orders: (scope: WarehouseOperationalScope, query: WarehouseOrdersQuery) =>
    [
      ...warehouseScopeKey(scope),
      "orders",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.page,
      query.limit,
    ] as const,
  pieces: (scope: WarehouseOperationalScope, query: WarehousePiecesQuery) =>
    [
      ...warehouseScopeKey(scope),
      "pieces",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.orderId ?? null,
      query.page,
      query.limit,
    ] as const,
  order: (scope: WarehouseOperationalScope, id: string) =>
    [...warehouseScopeKey(scope), "order", id] as const,
  activity: (scope: WarehouseOperationalScope, query: WarehouseActivityQuery) =>
    [...warehouseScopeKey(scope), "activity", query.page, query.limit] as const,
  orderHistory: (
    scope: WarehouseOperationalScope,
    id: string,
    query: WarehouseOrderHistoryQuery,
  ) =>
    [
      ...warehouseScopeKey(scope),
      "order-history",
      id,
      query.pieceId ?? null,
      query.page,
      query.limit,
    ] as const,
};
const useContext = () => {
  const client = useQueryClient(),
    current = useWarehouseOperationalScope();
  const scope: WarehouseOperationalScope = current ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    department: "WAREHOUSE",
  };
  return { client, current, scope };
};
const read = async <T>(
  client: QueryClient,
  scope: WarehouseOperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentWarehouseOperationalScope(client, scope);
  try {
    const result = await fetch();
    assertCurrentWarehouseOperationalScope(client, scope);
    return result;
  } catch (error: unknown) {
    assertCurrentWarehouseOperationalScope(client, scope);
    await reconcileBusinessDenial(client, error, scope);
    assertCurrentWarehouseOperationalScope(client, scope);
    throw error;
  }
};
const publication =
  <T>(
    client: QueryClient,
    scope: WarehouseOperationalScope,
    schema: ZodType<T>,
  ) =>
  (previous: unknown, incoming: unknown): T => {
    assertCurrentWarehouseOperationalScope(client, scope);
    const next = schema.safeParse(incoming),
      prior = previous === undefined ? undefined : schema.safeParse(previous);
    if (!next.success || (prior !== undefined && !prior.success))
      throw new ApiContractError();
    return replaceEqualDeep(prior?.data, next.data);
  };
const markDestination = async (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  page: { page: number; totalPages: number; key: (page: number) => QueryKey },
) => {
  const destination = Math.max(1, page.totalPages);
  if (page.page <= destination) return;
  assertCurrentWarehouseOperationalScope(client, scope);
  await client.invalidateQueries({
    queryKey: page.key(destination),
    exact: true,
    refetchType: "none",
  });
  assertCurrentWarehouseOperationalScope(client, scope);
};
export const warehouseOrderOptions = (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions({
    queryKey: warehouseKeys.order(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => warehouseApi.order(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): WarehouseOrderData => {
      assertCurrentWarehouseOperationalScope(client, scope);
      const next = warehouseOrderDataSchema.safeParse(incoming),
        prior =
          previous === undefined
            ? undefined
            : warehouseOrderDataSchema.safeParse(previous);
      if (
        !next.success ||
        (prior !== undefined && !prior.success) ||
        next.data.summary.id !== id ||
        (prior?.data !== undefined && prior.data.summary.id !== id)
      )
        throw new ApiContractError();
      return replaceEqualDeep(
        prior?.data,
        prior?.data !== undefined &&
          prior.data.summary.version > next.data.summary.version
          ? prior.data
          : next.data,
      );
    },
  });
};
export const fetchWarehouseOrder = async (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  orderId: string,
): Promise<WarehouseOrderData> => {
  const options = warehouseOrderOptions(client, scope, orderId);
  await client.fetchQuery({ ...options, staleTime: 0 });
  assertCurrentWarehouseOperationalScope(client, scope);
  const published = warehouseOrderDataSchema.safeParse(
    client.getQueryData(options.queryKey),
  );
  if (
    !published.success ||
    published.data.summary.id !== salesUuidSchema.parse(orderId)
  )
    throw new ApiContractError();
  return published.data;
};
export const useWarehouseOrder = (orderId: string | null) => {
  const { client, current, scope } = useContext();
  const result = useQuery({
    ...warehouseOrderOptions(client, scope, orderId ?? ""),
    enabled:
      current !== null &&
      orderId !== null &&
      salesUuidSchema.safeParse(orderId).success,
  });
  return {
    ...result,
    data: current === null || orderId === null ? undefined : result.data,
  };
};
export const useWarehouseDashboard = (input: WarehouseDashboardQueryInput) => {
  const { client, current, scope } = useContext(),
    query = warehouseDashboardQuerySchema.parse(input);
  const result = useQuery({
    queryKey: warehouseKeys.dashboard(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => warehouseApi.dashboard(query, signal)),
    structuralSharing: publication(client, scope, warehouseDashboardDataSchema),
  });
  return { ...result, data: current === null ? undefined : result.data };
};
export const useWarehouseOrders = (input: WarehouseOrdersQueryInput | null) => {
  const { client, current, scope } = useContext(),
    query = input === null ? null : warehouseOrdersQuerySchema.parse(input);
  const result = useQuery({
    queryKey:
      query === null
        ? [...warehouseScopeKey(scope), "orders", "inactive"]
        : warehouseKeys.orders(scope, query),
    enabled: current !== null && query !== null,
    structuralSharing: publication(client, scope, warehouseOrdersDataSchema),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await warehouseApi.orders(query, signal);
              await markDestination(client, scope, {
                page: query.page,
                totalPages: page.pagination.totalPages,
                key: (destination) =>
                  warehouseKeys.orders(scope, { ...query, page: destination }),
              });
              return page;
            }),
  });
  return {
    ...result,
    data: current === null || query === null ? undefined : result.data,
  };
};
export const useWarehousePieces = (input: WarehousePiecesQueryInput | null) => {
  const { client, current, scope } = useContext(),
    query = input === null ? null : warehousePiecesQuerySchema.parse(input);
  const result = useQuery({
    queryKey:
      query === null
        ? [...warehouseScopeKey(scope), "pieces", "inactive"]
        : warehouseKeys.pieces(scope, query),
    enabled: current !== null && query !== null,
    structuralSharing: publication(client, scope, warehousePiecesDataSchema),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await warehouseApi.pieces(query, signal);
              await markDestination(client, scope, {
                page: query.page,
                totalPages: page.pagination.totalPages,
                key: (destination) =>
                  warehouseKeys.pieces(scope, { ...query, page: destination }),
              });
              return page;
            }),
  });
  return {
    ...result,
    data: current === null || query === null ? undefined : result.data,
  };
};
export const useWarehouseActivity = (input: WarehouseActivityQueryInput) => {
  const { client, current, scope } = useContext(),
    query = warehouseActivityQuerySchema.parse(input);
  const result = useQuery({
    queryKey: warehouseKeys.activity(scope, query),
    enabled: current !== null,
    structuralSharing: publication(client, scope, warehouseActivityDataSchema),
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const page = await warehouseApi.activity(query, signal);
        await markDestination(client, scope, {
          page: query.page,
          totalPages: page.pagination.totalPages,
          key: (destination) =>
            warehouseKeys.activity(scope, { ...query, page: destination }),
        });
        return page;
      }),
  });
  return { ...result, data: current === null ? undefined : result.data };
};
export const useWarehouseOrderHistory = (
  orderId: string | null,
  input: WarehouseOrderHistoryQueryInput,
) => {
  const { client, current, scope } = useContext(),
    query = warehouseOrderHistoryQuerySchema.parse(input),
    target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  const result = useQuery({
    queryKey: warehouseKeys.orderHistory(scope, id, query),
    enabled:
      current !== null &&
      orderId !== null &&
      salesUuidSchema.safeParse(orderId).success,
    structuralSharing: publication(
      client,
      scope,
      warehouseOrderHistoryDataSchema,
    ),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, async () => {
        const page = await warehouseApi.orderHistory(id, query, signal);
        await markDestination(client, scope, {
          page: query.page,
          totalPages: page.pagination.totalPages,
          key: (destination) =>
            warehouseKeys.orderHistory(scope, id, {
              ...query,
              page: destination,
            }),
        });
        return page;
      });
    },
  });
  return {
    ...result,
    data: current === null || orderId === null ? undefined : result.data,
  };
};
export const useWarehouseGroupDetails = (
  summaries: readonly WarehouseOrderSummary[],
  requestedOrderIds: readonly string[],
): ReadonlyMap<string, WarehouseGroupDetailState> => {
  const { client, current, scope } = useContext(),
    demanded = [...new Set(requestedOrderIds)]
      .toSorted()
      .map((id) => summaries.find((summary) => summary.id === id));
  if (demanded.length > 10 || demanded.some((summary) => summary === undefined))
    throw new ApiContractError();
  const valid = demanded.filter((summary) => summary !== undefined),
    results = useQueries({
      queries:
        current === null
          ? []
          : valid.map((summary) =>
              warehouseOrderOptions(client, scope, summary.id),
            ),
    });
  return new Map(
    valid.map((summary, index): [string, WarehouseGroupDetailState] => {
      const result = results[index];
      if (current === null)
        return [summary.id, { phase: "loading", group: null, failure: null }];
      if (result?.data === undefined)
        return [
          summary.id,
          result?.isError
            ? {
                phase: "error",
                group: null,
                failure: warehouseReadFailure(result.error, "تحميل قطع الطلب"),
              }
            : { phase: "loading", group: null, failure: null },
        ];
      try {
        return [
          summary.id,
          {
            phase: result.isFetching ? "refreshing" : "ready",
            group: toWarehouseGroup(summary, result.data),
            failure: result.isError
              ? warehouseReadFailure(result.error, "تحديث قطع الطلب")
              : null,
          },
        ];
      } catch (error: unknown) {
        return [
          summary.id,
          {
            phase: "error",
            group: null,
            failure: warehouseReadFailure(
              error,
              "مراجعة إصدار الطلب والقطع المحددة",
            ),
          },
        ];
      }
    }),
  );
};

export const invalidateWarehouseReads = async (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  orderIds: readonly string[],
): Promise<void> => {
  const ids = new Set(orderIds.map((id) => salesUuidSchema.parse(id))),
    prefix = warehouseScopeKey(scope);
  const filter = {
    queryKey: prefix,
    predicate: (query: { queryKey: readonly unknown[] }) => {
      const resource = query.queryKey[prefix.length],
        id = query.queryKey[prefix.length + 1];
      return (
        resource === "dashboard" ||
        resource === "orders" ||
        resource === "pieces" ||
        resource === "activity" ||
        ((resource === "order" || resource === "order-history") &&
          typeof id === "string" &&
          ids.has(id))
      );
    },
  };
  assertCurrentWarehouseOperationalScope(client, scope);
  await client.cancelQueries(filter);
  assertCurrentWarehouseOperationalScope(client, scope);
  await client.invalidateQueries(
    { ...filter, refetchType: "active" },
    { throwOnError: true },
  );
  assertCurrentWarehouseOperationalScope(client, scope);
};
