"use client";
import { z } from "zod";
import {
  queryOptions,
  replaceEqualDeep,
  skipToken,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  salesUuidSchema,
  administrationDashboardDataSchema,
  administrationFilterOptionsQuerySchema,
  administrationFilterOptionsDataSchema,
  administrationOrdersQuerySchema,
  administrationOrdersDataSchema,
  administrationOrderDataSchema,
  administrationOrderHistoryQuerySchema,
  administrationApprovalsQuerySchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsQuerySchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationDeliveryExceptionsDataSchema,
  administrationActivityQuerySchema,
  administrationActivityDataSchema,
  administrationReportQuerySchema,
  administrationReportDataSchema,
  administrationReportPrintQuerySchema,
  administrationReportPrintDataSchema,
  type AdministrationOrderData,
  type AdministrationOrdersQuery,
  type AdministrationOrderFilters,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentAdministrationOperationalScope,
  administrationScopeKey,
  useAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import { administrationApi } from "../api/administration.api";

type Scope = AdministrationOperationalScope;
const filterTuple = (query: AdministrationOrderFilters) =>
  [
    query.search ?? "",
    query.status ?? null,
    query.type ?? null,
    query.department ?? null,
    query.exception ?? null,
    query.salespersonId ?? null,
    query.period,
    query.from ?? null,
    query.to ?? null,
  ] as const;
export const administrationKeys = {
  root: administrationScopeKey,
  dashboard: (scope: Scope) =>
    [...administrationScopeKey(scope), "dashboard"] as const,
  filterOptions: (
    scope: Scope,
    query: z.output<typeof administrationFilterOptionsQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "filter-options",
      query.salespersonName ?? null,
    ] as const,
  orders: (scope: Scope, query: AdministrationOrdersQuery) =>
    [
      ...administrationScopeKey(scope),
      "orders",
      ...filterTuple(query),
      query.page,
      query.limit,
    ] as const,
  order: (scope: Scope, id: string) =>
    [...administrationScopeKey(scope), "order", id] as const,
  orderHistory: (
    scope: Scope,
    id: string,
    query: z.output<typeof administrationOrderHistoryQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "order-history",
      id,
      query.page,
      query.limit,
    ] as const,
  approvals: (
    scope: Scope,
    query: z.output<typeof administrationApprovalsQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "approvals",
      query.tab,
      query.search ?? "",
      query.page,
      query.limit,
    ] as const,
  corrections: (
    scope: Scope,
    query: z.output<typeof administrationCorrectionsQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "corrections",
      query.tab,
      query.search ?? "",
      query.page,
      query.limit,
    ] as const,
  deliveryExceptions: (
    scope: Scope,
    query: z.output<typeof administrationDeliveryExceptionsQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "delivery-exceptions",
      query.tab,
      query.search ?? "",
      query.page,
      query.limit,
    ] as const,
  activity: (
    scope: Scope,
    query: z.output<typeof administrationActivityQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "activity",
      query.orderId ?? null,
      query.search ?? "",
      query.page,
      query.limit,
    ] as const,
  report: (
    scope: Scope,
    query: z.output<typeof administrationReportQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "report",
      ...filterTuple(query),
      query.page,
      query.limit,
    ] as const,
  reportPrint: (
    scope: Scope,
    query: z.output<typeof administrationReportPrintQuerySchema>,
  ) =>
    [
      ...administrationScopeKey(scope),
      "report-print",
      ...filterTuple(query),
    ] as const,
};
const read = async <T>(
  client: QueryClient,
  scope: Scope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentAdministrationOperationalScope(client, scope);
  try {
    const received = await fetch();
    assertCurrentAdministrationOperationalScope(client, scope);
    return received;
  } catch (error: unknown) {
    await reconcileBusinessDenial(client, error, scope);
    assertCurrentAdministrationOperationalScope(client, scope);
    throw error;
  }
};
const sameQuery = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const detailId = (detail: AdministrationOrderData) =>
  detail.kind === "draft" ? detail.draft.id : detail.order.id;
const detailVersion = (detail: AdministrationOrderData) =>
  detail.kind === "draft" ? detail.draft.version : detail.order.version;
const publishDetail = (
  context: { client: QueryClient; scope: Scope; id: string },
  previous: unknown,
  incoming: unknown,
): AdministrationOrderData => {
  const { client, scope, id } = context;
  assertCurrentAdministrationOperationalScope(client, scope);
  const next = administrationOrderDataSchema.safeParse(incoming),
    prior =
      previous === undefined
        ? undefined
        : administrationOrderDataSchema.safeParse(previous);
  if (
    !next.success ||
    (prior !== undefined && !prior.success) ||
    detailId(next.data) !== id ||
    (prior?.success && detailId(prior.data) !== id)
  )
    throw new ApiContractError();
  const saved = prior?.data;
  return replaceEqualDeep(
    saved,
    saved !== undefined &&
      ((saved.kind === "submitted" && next.data.kind === "draft") ||
        detailVersion(saved) > detailVersion(next.data))
      ? saved
      : next.data,
  );
};
export const administrationOrderOptions = (
  client: QueryClient,
  scope: Scope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions({
    queryKey: administrationKeys.order(scope, id),
    queryFn: target.success
      ? ({ signal }) =>
          read(client, scope, () => administrationApi.order(id, signal))
      : skipToken,
    structuralSharing: (previous: unknown, incoming: unknown) =>
      publishDetail({ client, scope, id }, previous, incoming),
  });
};
export const fetchAdministrationOrder = async (
  client: QueryClient,
  scope: Scope,
  orderId: string,
): Promise<AdministrationOrderData> => {
  const id = salesUuidSchema.parse(orderId),
    options = administrationOrderOptions(client, scope, id);
  await client.fetchQuery({ ...options, staleTime: 0 });
  assertCurrentAdministrationOperationalScope(client, scope);
  const published = administrationOrderDataSchema.safeParse(
    client.getQueryData(options.queryKey),
  );
  if (!published.success || detailId(published.data) !== id)
    throw new ApiContractError();
  return published.data;
};
type ReadDefinition<T> = {
  key: QueryKey;
  schema: z.ZodType<T>;
  fetch: (signal: AbortSignal) => Promise<T>;
  bind: (received: T) => boolean;
  detailId?: string;
};
const useAdministrationRead = <Q, T>(
  resource: string,
  input: unknown,
  schema: z.ZodType<Q>,
  definition: (scope: Scope, query: Q) => ReadDefinition<T>,
) => {
  const client = useQueryClient(),
    current = useAdministrationOperationalScope();
  const scope: Scope = current ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION",
  };
  const parsed = schema.safeParse(input),
    spec = parsed.success ? definition(scope, parsed.data) : null;
  const result = useQuery<T>({
    queryKey: spec?.key ?? [
      ...administrationScopeKey(scope),
      resource,
      "invalid",
    ],
    queryFn:
      current !== null && spec !== null
        ? ({ signal }) => read(client, scope, () => spec.fetch(signal))
        : skipToken,
    ...(resource === "report-print" ? { staleTime: 0, gcTime: 0 } : {}),
    structuralSharing:
      spec === null
        ? false
        : (previous: unknown, incoming: unknown) => {
            assertCurrentAdministrationOperationalScope(client, scope);
            const next = spec.schema.safeParse(incoming),
              prior =
                previous === undefined
                  ? undefined
                  : spec.schema.safeParse(previous);
            if (
              !next.success ||
              (prior !== undefined && !prior.success) ||
              !spec.bind(next.data) ||
              (prior?.success && !spec.bind(prior.data))
            )
              throw new ApiContractError();
            if (spec.detailId !== undefined)
              return publishDetail(
                { client, scope, id: spec.detailId },
                previous,
                incoming,
              );
            return replaceEqualDeep(prior?.data, next.data);
          },
  });
  const visible = spec?.schema.safeParse(result.data);
  const invalidCache =
    current !== null &&
    spec !== null &&
    result.data !== undefined &&
    (visible?.success !== true || !spec.bind(visible.data));
  return {
    ...result,
    data:
      current !== null && spec !== null && visible?.success && !invalidCache
        ? visible.data
        : undefined,
    isError: result.isError || invalidCache,
    isSuccess: result.isSuccess && !invalidCache,
    status: invalidCache ? ("error" as const) : result.status,
    error: invalidCache ? new ApiContractError() : result.error,
  };
};
export const useAdministrationDashboard = () =>
  useAdministrationRead("dashboard", {}, z.object({}).strict(), (scope) => ({
    key: administrationKeys.dashboard(scope),
    schema: administrationDashboardDataSchema,
    fetch: (signal) => administrationApi.dashboard(signal),
    bind: () => true,
  }));
export const useAdministrationFilterOptions = (
  input: z.input<typeof administrationFilterOptionsQuerySchema> | null,
) =>
  useAdministrationRead(
    "filter-options",
    input,
    administrationFilterOptionsQuerySchema,
    (scope, query) => ({
      key: administrationKeys.filterOptions(scope, query),
      schema: administrationFilterOptionsDataSchema,
      fetch: (signal) => administrationApi.filterOptions(query, signal),
      bind: (received) => sameQuery(received.context.query, query),
    }),
  );
export const useAdministrationOrders = (
  input: z.input<typeof administrationOrdersQuerySchema> | null,
) =>
  useAdministrationRead(
    "orders",
    input,
    administrationOrdersQuerySchema,
    (scope, query) => ({
      key: administrationKeys.orders(scope, query),
      schema: administrationOrdersDataSchema,
      fetch: (signal) => administrationApi.orders(query, signal),
      bind: (received) => sameQuery(received.context.query, query),
    }),
  );
export const useAdministrationOrder = (orderId: string | null) =>
  useAdministrationRead("order", orderId, salesUuidSchema, (scope, id) => ({
    key: administrationKeys.order(scope, id),
    schema: administrationOrderDataSchema,
    fetch: (signal) => administrationApi.order(id, signal),
    bind: (received) => detailId(received) === id,
    detailId: id,
  }));
const historyInputSchema = z
  .object({
    orderId: salesUuidSchema,
    query: administrationOrderHistoryQuerySchema,
  })
  .strict();
export const useAdministrationOrderHistory = (
  orderId: string | null,
  input: z.input<typeof administrationOrderHistoryQuerySchema>,
) =>
  useAdministrationRead(
    "order-history",
    orderId === null ? null : { orderId, query: input },
    historyInputSchema,
    (scope, { orderId: id, query }) => ({
      key: administrationKeys.orderHistory(scope, id, query),
      schema: administrationActivityDataSchema,
      fetch: (signal) => administrationApi.orderHistory(id, query, signal),
      bind: (received) =>
        "orderId" in received.context &&
        received.context.orderId === id &&
        sameQuery(received.context.query, query) &&
        received.pagination.page === query.page &&
        received.pagination.limit === query.limit,
    }),
  );
export const useAdministrationApprovals = (
  input: z.input<typeof administrationApprovalsQuerySchema> | null,
) =>
  useAdministrationRead(
    "approvals",
    input,
    administrationApprovalsQuerySchema,
    (scope, query) => ({
      key: administrationKeys.approvals(scope, query),
      schema: administrationApprovalsDataSchema,
      fetch: (signal) => administrationApi.approvals(query, signal),
      bind: (received) => sameQuery(received.context.query, query),
    }),
  );
export const useAdministrationCorrections = (
  input: z.input<typeof administrationCorrectionsQuerySchema> | null,
) =>
  useAdministrationRead(
    "corrections",
    input,
    administrationCorrectionsQuerySchema,
    (scope, query) => ({
      key: administrationKeys.corrections(scope, query),
      schema: administrationCorrectionsDataSchema,
      fetch: (signal) => administrationApi.corrections(query, signal),
      bind: (received) => sameQuery(received.context.query, query),
    }),
  );
export const useAdministrationDeliveryExceptions = (
  input: z.input<typeof administrationDeliveryExceptionsQuerySchema> | null,
) =>
  useAdministrationRead(
    "delivery-exceptions",
    input,
    administrationDeliveryExceptionsQuerySchema,
    (scope, query) => ({
      key: administrationKeys.deliveryExceptions(scope, query),
      schema: administrationDeliveryExceptionsDataSchema,
      fetch: (signal) => administrationApi.deliveryExceptions(query, signal),
      bind: (received) => sameQuery(received.context.query, query),
    }),
  );
export const useAdministrationActivity = (
  input: z.input<typeof administrationActivityQuerySchema> | null,
) =>
  useAdministrationRead(
    "activity",
    input,
    administrationActivityQuerySchema,
    (scope, query) => ({
      key: administrationKeys.activity(scope, query),
      schema: administrationActivityDataSchema,
      fetch: (signal) => administrationApi.activity(query, signal),
      bind: (received) =>
        !("orderId" in received.context) &&
        sameQuery(received.context.query, query) &&
        received.pagination.page === query.page &&
        received.pagination.limit === query.limit,
    }),
  );
const reportFilters = (
  query: z.output<typeof administrationReportQuerySchema>,
) => {
  const { page: _page, limit: _limit, ...filters } = query;
  return filters;
};
export const useAdministrationReport = (
  input: z.input<typeof administrationReportQuerySchema> | null,
) =>
  useAdministrationRead(
    "report",
    input,
    administrationReportQuerySchema,
    (scope, query) => ({
      key: administrationKeys.report(scope, query),
      schema: administrationReportDataSchema,
      fetch: (signal) => administrationApi.report(query, signal),
      bind: (received) =>
        sameQuery(received.meta.filters, reportFilters(query)) &&
        received.orders.pagination.page === query.page &&
        received.orders.pagination.limit === query.limit,
    }),
  );
export const useAdministrationReportPrint = (
  input: z.input<typeof administrationReportPrintQuerySchema> | null,
) =>
  useAdministrationRead(
    "report-print",
    input,
    administrationReportPrintQuerySchema,
    (scope, query) => ({
      key: administrationKeys.reportPrint(scope, query),
      schema: administrationReportPrintDataSchema,
      fetch: (signal) => administrationApi.reportPrint(query, signal),
      bind: (received) => sameQuery(received.meta.filters, query),
    }),
  );

const readFilter = (scope: Scope, orderIds: readonly string[] | null) => {
  const ids =
      orderIds === null
        ? null
        : new Set(orderIds.map((id) => salesUuidSchema.parse(id))),
    prefix = administrationScopeKey(scope);
  return {
    queryKey: prefix,
    predicate: (query: { queryKey: QueryKey }) => {
      const resource = query.queryKey[prefix.length],
        id = query.queryKey[prefix.length + 1];
      return (
        resource === "dashboard" ||
        resource === "filter-options" ||
        resource === "orders" ||
        resource === "approvals" ||
        resource === "corrections" ||
        resource === "delivery-exceptions" ||
        resource === "activity" ||
        resource === "report" ||
        resource === "report-print" ||
        ((resource === "order" || resource === "order-history") &&
          (ids === null || (typeof id === "string" && ids.has(id))))
      );
    },
  };
};
export const invalidateAdministrationReads = async (
  client: QueryClient,
  scope: Scope,
  orderIds: readonly string[] | null,
): Promise<void> => {
  const filter = readFilter(scope, orderIds),
    prefix = administrationScopeKey(scope);
  assertCurrentAdministrationOperationalScope(client, scope);
  await client.cancelQueries(filter);
  assertCurrentAdministrationOperationalScope(client, scope);
  await client.invalidateQueries({
    ...filter,
    predicate: (query) =>
      filter.predicate(query) &&
      query.queryKey[prefix.length] === "report-print",
    refetchType: "none",
  });
  assertCurrentAdministrationOperationalScope(client, scope);
  await client.invalidateQueries(
    {
      ...filter,
      predicate: (query) =>
        filter.predicate(query) &&
        query.queryKey[prefix.length] !== "report-print",
      refetchType: "active",
    },
    { throwOnError: true },
  );
  assertCurrentAdministrationOperationalScope(client, scope);
};
export const markAdministrationReadsStale = async (
  client: QueryClient,
  scope: Scope,
  orderIds: readonly string[] | null,
): Promise<void> => {
  const filter = readFilter(scope, orderIds);
  assertCurrentAdministrationOperationalScope(client, scope);
  await client.cancelQueries(filter);
  assertCurrentAdministrationOperationalScope(client, scope);
  await client.invalidateQueries({ ...filter, refetchType: "none" });
  assertCurrentAdministrationOperationalScope(client, scope);
};
