"use client";
import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  replaceEqualDeep,
} from "@tanstack/react-query";
import {
  catalogDataSchema,
  catalogQuoteDataSchema,
  type CatalogData,
  type CatalogQuoteData,
  type CatalogQuoteBody,
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
import { catalogsApi } from "../api/catalogs.api";
import {
  catalogQuoteKey,
  parseQuotePieces,
  type OrderQuoteInput,
} from "../model/catalog-paper.model";

export type { OrderQuoteInput } from "../model/catalog-paper.model";
const disabledScope: OperationalScope = {
  actorId: "",
  accessVersion: 0,
  epoch: -1,
};
export class CatalogSourceChangedError extends Error {
  constructor() {
    super("The catalog source changed. Review the current source and quote.");
    this.name = "CatalogSourceChangedError";
  }
}
export const catalogKeys = {
  active: (scope: OperationalScope) =>
    [...customerKeys.root(scope), "catalogs", "active"] as const,
  quote: (scope: OperationalScope, input: OrderQuoteInput) =>
    [
      ...customerKeys.root(scope),
      "orders",
      "quote",
      catalogQuoteKey(input),
    ] as const,
};
export const useCatalog = () => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  return useQuery({
    queryKey: catalogKeys.active(scope),
    enabled: current !== null,
    queryFn: async ({ signal }) => {
      assertCurrentOperationalScope(client, scope);
      try {
        const catalog = await catalogsApi.get(signal);
        assertCurrentOperationalScope(client, scope);
        return catalog;
      } catch (error: unknown) {
        await reconcileBusinessDenial(client, error, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, catalogDataSchema.parse(incoming))
        : previous,
  });
};
const assertQuoteCorrelation = (
  input: CatalogQuoteBody,
  quote: CatalogQuoteData,
  catalog: Extract<CatalogData, { availability: "available" }>,
) => {
  if (
    quote.requestId !== input.requestId ||
    quote.items.length !== input.pieces.length
  )
    throw new ApiContractError();
  quote.items.forEach((item, index) => {
    const piece = input.pieces[index];
    if (piece?.id !== item.pieceId) throw new ApiContractError();
    if (item.availability === "unavailable") return;
    const matches = catalog.entries.filter(
      (entry) =>
        entry.kind === "decoration" && entry.displayValue === piece.decoration,
    );
    const requested = piece.catalogSelections?.decoration;
    if (
      item.decoration !== piece.decoration ||
      !matches.some((entry) => entry.id === item.decorationEntryId) ||
      (requested == null
        ? matches.length !== 1
        : requested !== item.decorationEntryId)
    )
      throw new ApiContractError();
  });
};
export const useOrderQuote = (input: OrderQuoteInput | null) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope,
    catalog = useCatalog();
  const key = input === null ? "" : catalogQuoteKey(input);
  const [correlation, setCorrelation] = useState(() => ({
    key,
    requestId: crypto.randomUUID(),
  }));
  let selected = correlation;
  if (correlation.key !== key) {
    selected = { key, requestId: crypto.randomUUID() };
    setCorrelation(selected);
  }
  const body =
    input === null ? null : parseQuotePieces(input, selected.requestId);
  return useQuery({
    queryKey:
      input === null
        ? [...customerKeys.root(scope), "orders", "quote", null]
        : catalogKeys.quote(scope, input),
    enabled:
      current !== null &&
      body !== null &&
      catalog.data?.availability === "available" &&
      catalog.data.sourceId === input?.sourceId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      assertCurrentOperationalScope(client, scope);
      if (
        body === null ||
        input === null ||
        catalog.data?.availability !== "available"
      )
        throw new ApiContractError();
      try {
        const quote = catalogQuoteDataSchema.parse(
          await catalogsApi.quote(body, signal),
        );
        assertCurrentOperationalScope(client, scope);
        if (quote.sourceId !== null && quote.sourceId !== input.sourceId) {
          await client.invalidateQueries({
            queryKey: catalogKeys.active(scope),
            exact: true,
          });
          throw new CatalogSourceChangedError();
        }
        assertQuoteCorrelation(body, quote, catalog.data);
        return quote;
      } catch (error: unknown) {
        await reconcileBusinessDenial(client, error, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      const quote = catalogQuoteDataSchema.parse(incoming),
        active = catalogDataSchema.safeParse(
          client.getQueryData(catalogKeys.active(scope)),
        );
      if (
        body === null ||
        input === null ||
        !active.success ||
        active.data.availability !== "available" ||
        active.data.sourceId !== input.sourceId
      )
        throw new CatalogSourceChangedError();
      assertQuoteCorrelation(body, quote, active.data);
      return replaceEqualDeep(previous, quote);
    },
  });
};
