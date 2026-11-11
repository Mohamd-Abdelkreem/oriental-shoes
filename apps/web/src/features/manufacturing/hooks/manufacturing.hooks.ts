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
} from "@tanstack/react-query";
import {
  salesUuidSchema,
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  manufacturingActivityQuerySchema,
  manufacturingOrderHistoryQuerySchema,
  manufacturingOrderDataSchema,
  manufacturingDashboardDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHistoryDataSchema,
  type ManufacturingDepartment,
  type ManufacturingOrdersQuery,
  type ManufacturingPiecesQuery,
  type ManufacturingActivityQuery,
  type ManufacturingOrderHistoryQuery,
  type ManufacturingOrdersQueryInput,
  type ManufacturingPiecesQueryInput,
  type ManufacturingActivityQueryInput,
  type ManufacturingOrderHistoryQueryInput,
  type ManufacturingOrderSummary,
  type ManufacturingOrderData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentManufacturingOperationalScope,
  manufacturingScopeKey,
  useManufacturingOperationalScope,
  type ManufacturingOperationalScope,
} from "@/shared/query/operational-scope";
import { manufacturingApi } from "../api/manufacturing.api";
import {
  toManufacturingGroup,
  type ManufacturingGroupDetailState,
} from "../model/manufacturing-view.model";
import { manufacturingFailureMessage } from "../model/manufacturing-form.model";

const deptKey = (scope: ManufacturingOperationalScope) =>
  [...manufacturingScopeKey(scope), scope.department] as const;
export const manufacturingKeys = {
  root: manufacturingScopeKey,
  department: deptKey,
  dashboard: (scope: ManufacturingOperationalScope) =>
    [...deptKey(scope), "dashboard"] as const,
  orders: (
    scope: ManufacturingOperationalScope,
    query: ManufacturingOrdersQuery,
  ) =>
    [
      ...deptKey(scope),
      "orders",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.page,
      query.limit,
    ] as const,
  pieces: (
    scope: ManufacturingOperationalScope,
    query: ManufacturingPiecesQuery,
  ) =>
    [
      ...deptKey(scope),
      "pieces",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.orderId ?? null,
      query.page,
      query.limit,
    ] as const,
  order: (scope: ManufacturingOperationalScope, id: string) =>
    [...deptKey(scope), "order", id] as const,
  activity: (
    scope: ManufacturingOperationalScope,
    query: ManufacturingActivityQuery,
  ) =>
    [
      ...deptKey(scope),
      "activity",
      query.actor ?? null,
      query.page,
      query.limit,
    ] as const,
  orderHistory: (
    scope: ManufacturingOperationalScope,
    id: string,
    query: ManufacturingOrderHistoryQuery,
  ) =>
    [
      ...deptKey(scope),
      "order-history",
      id,
      query.pieceId ?? null,
      query.page,
      query.limit,
    ] as const,
};
const useContext = (department: ManufacturingDepartment) => {
  const client = useQueryClient(),
    current = useManufacturingOperationalScope(department);
  return {
    client,
    current,
    scope: current ?? { actorId: "", accessVersion: 0, epoch: -1, department },
  };
};
const read = async <T>(
  client: QueryClient,
  scope: ManufacturingOperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentManufacturingOperationalScope(client, scope);
  try {
    const result = await fetch();
    assertCurrentManufacturingOperationalScope(client, scope);
    return result;
  } catch (error: unknown) {
    assertCurrentManufacturingOperationalScope(client, scope);
    await reconcileBusinessDenial(client, error, scope);
    assertCurrentManufacturingOperationalScope(client, scope);
    throw error;
  }
};
const publication =
  <T extends { department: ManufacturingDepartment }>(
    client: QueryClient,
    scope: ManufacturingOperationalScope,
    schema: ZodType<T>,
  ) =>
  (previous: unknown, incoming: unknown): T => {
    assertCurrentManufacturingOperationalScope(client, scope);
    const next = schema.parse(incoming);
    if (next.department !== scope.department) throw new ApiContractError();
    return replaceEqualDeep(previous, next);
  };
export const manufacturingOrderOptions = (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions({
    queryKey: manufacturingKeys.order(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () =>
        manufacturingApi.order(scope.department, id, signal),
      );
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): ManufacturingOrderData => {
      assertCurrentManufacturingOperationalScope(client, scope);
      const next = manufacturingOrderDataSchema.parse(incoming),
        prior =
          previous === undefined
            ? undefined
            : manufacturingOrderDataSchema.parse(previous);
      if (
        next.paper.order.id !== id ||
        next.department !== scope.department ||
        (prior !== undefined &&
          (prior.paper.order.id !== id ||
            prior.department !== scope.department))
      )
        throw new ApiContractError();
      return replaceEqualDeep(
        prior,
        prior && prior.paper.order.version > next.paper.order.version
          ? prior
          : next,
      );
    },
  });
};
export const useManufacturingOrder = (
  department: ManufacturingDepartment,
  orderId: string | null,
) => {
  const { client, current, scope } = useContext(department);
  return useQuery({
    ...manufacturingOrderOptions(client, scope, orderId ?? ""),
    enabled: current !== null && orderId !== null,
  });
};
export const fetchManufacturingOrder = async (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
  orderId: string,
): Promise<ManufacturingOrderData> => {
  const options = manufacturingOrderOptions(client, scope, orderId);
  await client.fetchQuery({ ...options, staleTime: 0 });
  assertCurrentManufacturingOperationalScope(client, scope);
  // Query.fetch returns the transport result, even when structuralSharing kept a newer value.
  const published = manufacturingOrderDataSchema.parse(
    client.getQueryData(options.queryKey),
  );
  if (
    published.paper.order.id !== salesUuidSchema.parse(orderId) ||
    published.department !== scope.department
  )
    throw new ApiContractError();
  return published;
};
export const useManufacturingDashboard = (
  department: ManufacturingDepartment,
) => {
  const { client, current, scope } = useContext(department);
  return useQuery({
    queryKey: manufacturingKeys.dashboard(scope),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => manufacturingApi.dashboard(department, signal)),
    structuralSharing: publication(
      client,
      scope,
      manufacturingDashboardDataSchema,
    ),
  });
};
export const useManufacturingOrders = (
  department: ManufacturingDepartment,
  input: ManufacturingOrdersQueryInput | null,
) => {
  const { client, current, scope } = useContext(department),
    query = input === null ? null : manufacturingOrdersQuerySchema.parse(input);
  const result = useQuery({
    queryKey: query
      ? manufacturingKeys.orders(scope, query)
      : [...deptKey(scope), "orders", "inactive"],
    enabled: current !== null && query !== null,
    structuralSharing: publication(
      client,
      scope,
      manufacturingOrdersDataSchema,
    ),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await manufacturingApi.orders(
                  department,
                  query,
                  signal,
                ),
                destination = Math.max(1, page.pagination.totalPages);
              if (query.page > destination)
                await client.invalidateQueries({
                  queryKey: manufacturingKeys.orders(scope, {
                    ...query,
                    page: destination,
                  }),
                  exact: true,
                  refetchType: "none",
                });
              return page;
            }),
  });
  return {
    ...result,
    data: query === null || current === null ? undefined : result.data,
  };
};
export const useManufacturingPieces = (
  department: ManufacturingDepartment,
  input: ManufacturingPiecesQueryInput | null,
) => {
  const { client, current, scope } = useContext(department),
    query = input === null ? null : manufacturingPiecesQuerySchema.parse(input);
  const result = useQuery({
    queryKey: query
      ? manufacturingKeys.pieces(scope, query)
      : [...deptKey(scope), "pieces", "inactive"],
    enabled: current !== null && query !== null,
    structuralSharing: publication(
      client,
      scope,
      manufacturingPiecesDataSchema,
    ),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await manufacturingApi.pieces(
                  department,
                  query,
                  signal,
                ),
                destination = Math.max(1, page.pagination.totalPages);
              if (query.page > destination)
                await client.invalidateQueries({
                  queryKey: manufacturingKeys.pieces(scope, {
                    ...query,
                    page: destination,
                  }),
                  exact: true,
                  refetchType: "none",
                });
              return page;
            }),
  });
  return {
    ...result,
    data: query === null || current === null ? undefined : result.data,
  };
};
export const useManufacturingActivity = (
  department: ManufacturingDepartment,
  input: ManufacturingActivityQueryInput,
) => {
  const { client, current, scope } = useContext(department),
    query = manufacturingActivityQuerySchema.parse(input);
  return useQuery({
    queryKey: manufacturingKeys.activity(scope, query),
    enabled: current !== null,
    structuralSharing: publication(
      client,
      scope,
      manufacturingActivityDataSchema,
    ),
    queryFn: ({ signal }) =>
      read(client, scope, () =>
        manufacturingApi.activity(department, query, signal),
      ),
  });
};
export const useManufacturingOrderHistory = (
  department: ManufacturingDepartment,
  orderId: string | null,
  input: ManufacturingOrderHistoryQueryInput,
) => {
  const { client, current, scope } = useContext(department),
    query = manufacturingOrderHistoryQuerySchema.parse(input),
    target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return useQuery({
    queryKey: manufacturingKeys.orderHistory(scope, id, query),
    enabled: current !== null && orderId !== null,
    structuralSharing: publication(
      client,
      scope,
      manufacturingOrderHistoryDataSchema,
    ),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () =>
        manufacturingApi.orderHistory(department, id, query, signal),
      );
    },
  });
};
export const useManufacturingGroupDetails = (
  department: ManufacturingDepartment,
  summaries: readonly ManufacturingOrderSummary[],
  requestedOrderIds: readonly string[],
): ReadonlyMap<string, ManufacturingGroupDetailState> => {
  const { client, current, scope } = useContext(department);
  const demanded = [...new Set(requestedOrderIds)]
    .toSorted()
    .map((id) => summaries.find((summary) => summary.id === id));
  if (demanded.length > 10 || demanded.some((summary) => summary === undefined))
    throw new ApiContractError();
  const valid = demanded.filter((summary) => summary !== undefined);
  const results = useQueries({
    queries:
      current === null
        ? []
        : valid.map((summary) =>
            manufacturingOrderOptions(client, scope, summary.id),
          ),
  });
  return new Map(
    valid.map((summary, index): [string, ManufacturingGroupDetailState] => {
      const result = results[index];
      if (!result || !result.data)
        return [
          summary.id,
          result?.isError
            ? {
                phase: "error",
                group: null,
                failure: manufacturingFailureMessage(
                  result.error,
                  "تحميل قطع الطلب",
                ),
              }
            : { phase: "loading", group: null, failure: null },
        ];
      if (
        summary.version !== result.data.paper.order.version ||
        summary.matchingPieceIds.some(
          (id) => !result.data.work.some((work) => work.pieceId === id),
        )
      )
        return [
          summary.id,
          {
            phase: "error",
            group: null,
            failure: "تغير إصدار الطلب. حدّث البيانات وراجع القطع المختارة.",
          },
        ];
      return [
        summary.id,
        {
          phase: result.isFetching ? "refreshing" : "ready",
          group: toManufacturingGroup(summary, result.data),
          failure: result.isError
            ? manufacturingFailureMessage(result.error, "تحديث قطع الطلب")
            : null,
        },
      ];
    }),
  );
};
