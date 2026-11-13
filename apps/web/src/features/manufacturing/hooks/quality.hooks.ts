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
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  qualityActivityQuerySchema,
  qualityOrderHistoryQuerySchema,
  qualityOrderDataSchema,
  qualityDashboardDataSchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
  type QualityOrdersQuery,
  type QualityPiecesQuery,
  type QualityActivityQuery,
  type QualityOrderHistoryQuery,
  type QualityOrdersQueryInput,
  type QualityPiecesQueryInput,
  type QualityActivityQueryInput,
  type QualityOrderHistoryQueryInput,
  type QualityOrderSummary,
  type QualityOrderData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentQualityOperationalScope,
  qualityScopeKey,
  useQualityOperationalScope,
  type QualityOperationalScope,
} from "@/shared/query/operational-scope";
import { qualityApi } from "../api/quality.api";
import {
  toQualityGroup,
  type QualityGroupDetailState,
} from "../model/quality-view.model";
import { qualityFailureMessage } from "../model/quality-form.model";

export const qualityKeys = {
  root: qualityScopeKey,
  dashboard: (scope: QualityOperationalScope) =>
    [...qualityScopeKey(scope), "dashboard"] as const,
  orders: (scope: QualityOperationalScope, query: QualityOrdersQuery) =>
    [
      ...qualityScopeKey(scope),
      "orders",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.page,
      query.limit,
    ] as const,
  pieces: (scope: QualityOperationalScope, query: QualityPiecesQuery) =>
    [
      ...qualityScopeKey(scope),
      "pieces",
      query.view,
      query.search ?? "",
      query.type ?? null,
      query.orderId ?? null,
      query.page,
      query.limit,
    ] as const,
  order: (scope: QualityOperationalScope, id: string) =>
    [...qualityScopeKey(scope), "order", id] as const,
  activity: (scope: QualityOperationalScope, query: QualityActivityQuery) =>
    [...qualityScopeKey(scope), "activity", query.page, query.limit] as const,
  orderHistory: (
    scope: QualityOperationalScope,
    id: string,
    query: QualityOrderHistoryQuery,
  ) =>
    [
      ...qualityScopeKey(scope),
      "order-history",
      id,
      query.pieceId ?? null,
      query.page,
      query.limit,
    ] as const,
};
const useContext = () => {
  const client = useQueryClient(),
    current = useQualityOperationalScope();
  const scope: QualityOperationalScope = current ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    department: "QUALITY",
  };
  return { client, current, scope };
};
const read = async <T>(
  client: QueryClient,
  scope: QualityOperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentQualityOperationalScope(client, scope);
  try {
    const result = await fetch();
    assertCurrentQualityOperationalScope(client, scope);
    return result;
  } catch (error: unknown) {
    assertCurrentQualityOperationalScope(client, scope);
    await reconcileBusinessDenial(client, error, scope);
    assertCurrentQualityOperationalScope(client, scope);
    throw error;
  }
};
const publication =
  <T extends { department: "QUALITY" }>(
    client: QueryClient,
    scope: QualityOperationalScope,
    schema: ZodType<T>,
  ) =>
  (previous: unknown, incoming: unknown): T => {
    assertCurrentQualityOperationalScope(client, scope);
    const next = schema.safeParse(incoming),
      prior = previous === undefined ? undefined : schema.safeParse(previous);
    if (!next.success || (prior !== undefined && !prior.success))
      throw new ApiContractError();
    return replaceEqualDeep(prior?.data, next.data);
  };
const markDestination = async (
  client: QueryClient,
  scope: QualityOperationalScope,
  page: { page: number; totalPages: number; key: (page: number) => QueryKey },
) => {
  const destination = Math.max(1, page.totalPages);
  if (page.page <= destination) return;
  assertCurrentQualityOperationalScope(client, scope);
  await client.invalidateQueries({
    queryKey: page.key(destination),
    exact: true,
    refetchType: "none",
  });
  assertCurrentQualityOperationalScope(client, scope);
};
export const qualityOrderOptions = (
  client: QueryClient,
  scope: QualityOperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions({
    queryKey: qualityKeys.order(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => qualityApi.order(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): QualityOrderData => {
      assertCurrentQualityOperationalScope(client, scope);
      const next = qualityOrderDataSchema.safeParse(incoming),
        prior =
          previous === undefined
            ? undefined
            : qualityOrderDataSchema.safeParse(previous);
      if (
        !next.success ||
        (prior !== undefined && !prior.success) ||
        next.data.paper.order.id !== id ||
        (prior?.data !== undefined && prior.data.paper.order.id !== id)
      )
        throw new ApiContractError();
      return replaceEqualDeep(
        prior?.data,
        prior?.data !== undefined &&
          prior.data.paper.order.version > next.data.paper.order.version
          ? prior.data
          : next.data,
      );
    },
  });
};
export const fetchQualityOrder = async (
  client: QueryClient,
  scope: QualityOperationalScope,
  orderId: string,
): Promise<QualityOrderData> => {
  const options = qualityOrderOptions(client, scope, orderId);
  await client.fetchQuery({ ...options, staleTime: 0 });
  assertCurrentQualityOperationalScope(client, scope);
  const published = qualityOrderDataSchema.safeParse(
    client.getQueryData(options.queryKey),
  );
  if (
    !published.success ||
    published.data.paper.order.id !== salesUuidSchema.parse(orderId)
  )
    throw new ApiContractError();
  return published.data;
};
export const useQualityOrder = (orderId: string | null) => {
  const { client, current, scope } = useContext();
  const result = useQuery({
    ...qualityOrderOptions(client, scope, orderId ?? ""),
    enabled: current !== null && orderId !== null,
  });
  return {
    ...result,
    data: current === null || orderId === null ? undefined : result.data,
  };
};
export const useQualityDashboard = () => {
  const { client, current, scope } = useContext();
  const result = useQuery({
    queryKey: qualityKeys.dashboard(scope),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => qualityApi.dashboard(signal)),
    structuralSharing: publication(client, scope, qualityDashboardDataSchema),
  });
  return { ...result, data: current === null ? undefined : result.data };
};
export const useQualityOrders = (input: QualityOrdersQueryInput | null) => {
  const { client, current, scope } = useContext(),
    query = input === null ? null : qualityOrdersQuerySchema.parse(input);
  const result = useQuery({
    queryKey:
      query === null
        ? [...qualityScopeKey(scope), "orders", "inactive"]
        : qualityKeys.orders(scope, query),
    enabled: current !== null && query !== null,
    structuralSharing: publication(client, scope, qualityOrdersDataSchema),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await qualityApi.orders(query, signal);
              await markDestination(client, scope, {
                page: query.page,
                totalPages: page.pagination.totalPages,
                key: (destination) =>
                  qualityKeys.orders(scope, { ...query, page: destination }),
              });
              return page;
            }),
  });
  return {
    ...result,
    data: current === null || query === null ? undefined : result.data,
  };
};
export const useQualityPieces = (input: QualityPiecesQueryInput | null) => {
  const { client, current, scope } = useContext(),
    query = input === null ? null : qualityPiecesQuerySchema.parse(input);
  const result = useQuery({
    queryKey:
      query === null
        ? [...qualityScopeKey(scope), "pieces", "inactive"]
        : qualityKeys.pieces(scope, query),
    enabled: current !== null && query !== null,
    structuralSharing: publication(client, scope, qualityPiecesDataSchema),
    queryFn:
      query === null
        ? skipToken
        : ({ signal }) =>
            read(client, scope, async () => {
              const page = await qualityApi.pieces(query, signal);
              await markDestination(client, scope, {
                page: query.page,
                totalPages: page.pagination.totalPages,
                key: (destination) =>
                  qualityKeys.pieces(scope, { ...query, page: destination }),
              });
              return page;
            }),
  });
  return {
    ...result,
    data: current === null || query === null ? undefined : result.data,
  };
};
export const useQualityActivity = (input: QualityActivityQueryInput) => {
  const { client, current, scope } = useContext(),
    query = qualityActivityQuerySchema.parse(input);
  const result = useQuery({
    queryKey: qualityKeys.activity(scope, query),
    enabled: current !== null,
    structuralSharing: publication(client, scope, qualityActivityDataSchema),
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const page = await qualityApi.activity(query, signal);
        await markDestination(client, scope, {
          page: query.page,
          totalPages: page.pagination.totalPages,
          key: (destination) =>
            qualityKeys.activity(scope, { ...query, page: destination }),
        });
        return page;
      }),
  });
  return { ...result, data: current === null ? undefined : result.data };
};
export const useQualityOrderHistory = (
  orderId: string | null,
  input: QualityOrderHistoryQueryInput,
) => {
  const { client, current, scope } = useContext(),
    query = qualityOrderHistoryQuerySchema.parse(input),
    target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  const result = useQuery({
    queryKey: qualityKeys.orderHistory(scope, id, query),
    enabled: current !== null && orderId !== null,
    structuralSharing: publication(
      client,
      scope,
      qualityOrderHistoryDataSchema,
    ),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, async () => {
        const page = await qualityApi.orderHistory(id, query, signal);
        await markDestination(client, scope, {
          page: query.page,
          totalPages: page.pagination.totalPages,
          key: (destination) =>
            qualityKeys.orderHistory(scope, id, {
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
export const useQualityGroupDetails = (
  summaries: readonly QualityOrderSummary[],
  requestedOrderIds: readonly string[],
): ReadonlyMap<string, QualityGroupDetailState> => {
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
              qualityOrderOptions(client, scope, summary.id),
            ),
    });
  return new Map(
    valid.map((summary, index): [string, QualityGroupDetailState] => {
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
                failure: qualityFailureMessage(
                  result.error,
                  "تحميل قطع الطلب",
                  undefined,
                  "read",
                ),
              }
            : { phase: "loading", group: null, failure: null },
        ];
      try {
        return [
          summary.id,
          {
            phase: result.isFetching ? "refreshing" : "ready",
            group: toQualityGroup(summary, result.data),
            failure: result.isError
              ? qualityFailureMessage(
                  result.error,
                  "تحديث قطع الطلب",
                  undefined,
                  "read",
                )
              : null,
          },
        ];
      } catch (error: unknown) {
        return [
          summary.id,
          {
            phase: "error",
            group: null,
            failure: qualityFailureMessage(
              error,
              "مراجعة إصدار الطلب والقطع المحددة",
              undefined,
              "read",
            ),
          },
        ];
      }
    }),
  );
};
