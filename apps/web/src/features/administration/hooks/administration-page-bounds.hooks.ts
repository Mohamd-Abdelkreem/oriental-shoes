"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  hashKey,
  notifyManager,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { z } from "zod";
import {
  paginationMetaSchema,
  administrationOrdersDataSchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsDataSchema,
  administrationActivityDataSchema,
  administrationReportDataSchema,
  type AdministrationOrdersQuery,
  type AdministrationOrdersData,
  type AdministrationApprovalsQuery,
  type AdministrationApprovalsData,
  type AdministrationCorrectionsQuery,
  type AdministrationCorrectionsData,
  type AdministrationDeliveryExceptionsQuery,
  type AdministrationDeliveryExceptionsData,
  type AdministrationActivityQuery,
  type AdministrationActivityData,
  type AdministrationOrderHistoryQuery,
  type AdministrationReportQuery,
  type AdministrationReportData,
} from "@template/contracts";
import {
  isCurrentAdministrationOperationalScope,
  type AdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import { administrationKeys } from "./administration.hooks";

type QueryMap = {
  orders: AdministrationOrdersQuery;
  approvals: AdministrationApprovalsQuery;
  corrections: AdministrationCorrectionsQuery;
  "delivery-exceptions": AdministrationDeliveryExceptionsQuery;
  activity: AdministrationActivityQuery;
  "order-history": { orderId: string; query: AdministrationOrderHistoryQuery };
  report: AdministrationReportQuery;
};
type DataMap = {
  orders: AdministrationOrdersData;
  approvals: AdministrationApprovalsData;
  corrections: AdministrationCorrectionsData;
  "delivery-exceptions": AdministrationDeliveryExceptionsData;
  activity: AdministrationActivityData;
  "order-history": AdministrationActivityData;
  report: AdministrationReportData;
};
export type AdministrationPageBoundsInput = {
  [R in keyof QueryMap]: Readonly<{
    resource: R;
    query: QueryMap[R];
    currentKey: QueryKey;
    current: Readonly<{
      data: DataMap[R] | undefined;
      status: "pending" | "success" | "error";
      fetchStatus: "fetching" | "paused" | "idle";
    }>;
    onNavigate: (page: number) => void;
    scope: AdministrationOperationalScope;
  }>;
}[keyof QueryMap];
export type AdministrationPageBounds = Readonly<{
  page: number;
  total: number | null;
  totalPages: number | null;
  pending: boolean;
  navigate: (page: number) => void;
}>;
type Metadata = z.output<typeof paginationMetaSchema>;
const currentPage = (input: AdministrationPageBoundsInput) =>
  input.resource === "order-history"
    ? input.query.query.page
    : input.query.page;
const currentLimit = (input: AdministrationPageBoundsInput) =>
  input.resource === "order-history"
    ? input.query.query.limit
    : input.query.limit;
const requestedKey = (input: AdministrationPageBoundsInput): QueryKey => {
  switch (input.resource) {
    case "orders":
      return administrationKeys.orders(input.scope, input.query);
    case "approvals":
      return administrationKeys.approvals(input.scope, input.query);
    case "corrections":
      return administrationKeys.corrections(input.scope, input.query);
    case "delivery-exceptions":
      return administrationKeys.deliveryExceptions(input.scope, input.query);
    case "activity":
      return administrationKeys.activity(input.scope, input.query);
    case "order-history":
      return administrationKeys.orderHistory(
        input.scope,
        input.query.orderId,
        input.query.query,
      );
    case "report":
      return administrationKeys.report(input.scope, input.query);
  }
};
const sameQuery = (actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const boundMetadata = <T>(definition: {
  schema: z.ZodType<T>;
  raw: unknown;
  actualKey: QueryKey;
  expectedKey: QueryKey;
  bind: (data: T) => boolean;
  pagination: (data: T) => Metadata;
}): Metadata | null => {
  if (hashKey(definition.actualKey) !== hashKey(definition.expectedKey))
    return null;
  const parsed = definition.schema.safeParse(definition.raw);
  if (!parsed.success || !definition.bind(parsed.data)) return null;
  const pagination = paginationMetaSchema.safeParse(
    definition.pagination(parsed.data),
  );
  return pagination.success &&
    pagination.data.page ===
      definition.actualKey[definition.actualKey.length - 2] &&
    pagination.data.limit ===
      definition.actualKey[definition.actualKey.length - 1]
    ? pagination.data
    : null;
};
const metadata = (
  input: AdministrationPageBoundsInput,
  raw: unknown,
  key: QueryKey,
): Metadata | null => {
  if (hashKey(input.currentKey) !== hashKey(requestedKey(input))) return null;
  const page = key[key.length - 2],
    limit = key[key.length - 1];
  if (
    typeof page !== "number" ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    limit !== currentLimit(input)
  )
    return null;
  switch (input.resource) {
    case "orders": {
      const query = { ...input.query, page };
      return boundMetadata({
        schema: administrationOrdersDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.orders(input.scope, query),
        bind: (data) => sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "approvals": {
      const query = { ...input.query, page };
      return boundMetadata({
        schema: administrationApprovalsDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.approvals(input.scope, query),
        bind: (data) => sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "corrections": {
      const query = { ...input.query, page };
      return boundMetadata({
        schema: administrationCorrectionsDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.corrections(input.scope, query),
        bind: (data) => sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "delivery-exceptions": {
      const query = { ...input.query, page };
      return boundMetadata({
        schema: administrationDeliveryExceptionsDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.deliveryExceptions(input.scope, query),
        bind: (data) => sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "activity": {
      const query = { ...input.query, page };
      return boundMetadata({
        schema: administrationActivityDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.activity(input.scope, query),
        bind: (data) =>
          !("orderId" in data.context) && sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "order-history": {
      const query = { ...input.query.query, page },
        id = input.query.orderId;
      return boundMetadata({
        schema: administrationActivityDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.orderHistory(input.scope, id, query),
        bind: (data) =>
          "orderId" in data.context &&
          data.context.orderId === id &&
          sameQuery(data.context.query, query),
        pagination: (data) => data.pagination,
      });
    }
    case "report": {
      const query = { ...input.query, page };
      const { page: _page, limit: _limit, ...filters } = query;
      return boundMetadata({
        schema: administrationReportDataSchema,
        raw,
        actualKey: key,
        expectedKey: administrationKeys.report(input.scope, query),
        bind: (data) => sameQuery(data.meta.filters, filters),
        pagination: (data) => data.orders.pagination,
      });
    }
  }
};
type RememberedKey = Readonly<{ context: string; key: QueryKey }>;
export const useAdministrationPageBounds = (
  input: AdministrationPageBoundsInput,
): AdministrationPageBounds => {
  const client = useQueryClient(),
    page = currentPage(input),
    limit = currentLimit(input),
    canonical = requestedKey(input),
    canonicalHash = hashKey(canonical),
    context = hashKey([...canonical.slice(0, -2), limit]);
  const [remembered, setRemembered] = useState<RememberedKey | null>(null);
  const readMetadata = (raw: unknown, key: QueryKey) =>
    isCurrentAdministrationOperationalScope(client, input.scope)
      ? metadata(input, raw, key)
      : null;
  const current =
    input.current.status === "success"
      ? readMetadata(input.current.data, input.currentKey)
      : null;
  const activeScope = isCurrentAdministrationOperationalScope(
    client,
    input.scope,
  );
  const previousKey =
    activeScope && remembered?.context === context ? remembered : null;
  if (!activeScope && remembered !== null) setRemembered(null);
  else if (
    current !== null &&
    (!previousKey || hashKey(previousKey.key) !== canonicalHash)
  )
    setRemembered({ context, key: canonical });
  else if (remembered !== null && remembered.context !== context)
    setRemembered(null);
  const rememberedHash = previousKey ? hashKey(previousKey.key) : null;
  const subscribe = useCallback(
    (changed: () => void) => {
      if (rememberedHash === null) return () => {};
      const notify = notifyManager.batchCalls(changed);
      return client
        .getQueryCache()
        .subscribe((event: { type: string; query: { queryKey: QueryKey } }) => {
          if (
            (event.type === "added" ||
              event.type === "updated" ||
              event.type === "removed") &&
            hashKey(event.query.queryKey) === rememberedHash
          )
            notify();
        });
    },
    [client, rememberedHash],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      if (!previousKey) return "unavailable";
      const saved = readMetadata(
        client.getQueryData(previousKey.key),
        previousKey.key,
      );
      return saved ? JSON.stringify(saved) : "unavailable";
    },
    () => "unavailable",
  );
  const previous =
    current ??
    (snapshot === "unavailable" || !previousKey
      ? null
      : readMetadata(client.getQueryData(previousKey.key), previousKey.key));
  useEffect(() => {
    if (
      current === null ||
      input.current.fetchStatus !== "idle" ||
      page <= Math.max(1, current.totalPages)
    )
      return;
    let active = true;
    const destination = Math.max(1, current.totalPages),
      key = [...canonical.slice(0, -2), destination, limit];
    // This is local cache invalidation only; no network refetch runs before URL recovery.
    void client
      .invalidateQueries({ queryKey: key, exact: true, refetchType: "none" })
      .then(() => {
        if (
          !active ||
          !isCurrentAdministrationOperationalScope(client, input.scope)
        )
          return;
        const latest = metadata(
          input,
          client.getQueryData(input.currentKey),
          input.currentKey,
        );
        if (latest && page > Math.max(1, latest.totalPages))
          input.onNavigate(Math.max(1, latest.totalPages));
      });
    return () => {
      active = false;
    };
  }, [client, input, page, limit, canonical, current]);
  const navigate = (requested: number): void => {
    if (!isCurrentAdministrationOperationalScope(client, input.scope)) return;
    const present = readMetadata(
        client.getQueryData(input.currentKey),
        input.currentKey,
      ),
      saved = previousKey
        ? readMetadata(client.getQueryData(previousKey.key), previousKey.key)
        : null,
      navigation = present ?? saved;
    if (!navigation) {
      setRemembered(null);
      return;
    }
    if (
      !Number.isSafeInteger(requested) ||
      requested < 1 ||
      requested > Math.max(1, navigation.totalPages) ||
      requested === page
    )
      return;
    if (present) setRemembered({ context, key: canonical });
    input.onNavigate(requested);
  };
  return {
    page,
    total: previous?.total ?? null,
    totalPages: previous?.totalPages ?? null,
    pending:
      input.current.status === "pending" ||
      input.current.fetchStatus !== "idle",
    navigate,
  };
};
