"use client";
import {
  queryOptions,
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  salesUuidSchema,
  officialOrderPaperDataSchema,
  type OfficialOrderPaperData,
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
import { orderPaperApi } from "../api/order-paper.api";

export const orderPaperKeys = {
  order: (scope: P04OperationalScope, id: string) =>
    [...p04ScopeKey(scope), "official-paper", id] as const,
};
export const officialOrderPaperOptions = (
  client: QueryClient,
  scope: P04OperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions<OfficialOrderPaperData, unknown>({
    queryKey: orderPaperKeys.order(scope, id),
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      assertCurrentP04OperationalScope(client, scope);
      try {
        const received = await orderPaperApi.get(id, signal);
        assertCurrentP04OperationalScope(client, scope);
        return received;
      } catch (error: unknown) {
        assertCurrentP04OperationalScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertCurrentP04OperationalScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentP04OperationalScope(client, scope)) return previous;
      const next = officialOrderPaperDataSchema.parse(incoming);
      if (next.order.id !== id) throw new ApiContractError();
      return replaceEqualDeep(previous, next);
    },
  });
};
export const useOfficialOrderPaper = (orderId: string | null) => {
  const client = useQueryClient(),
    current = useP04OperationalScope("OFFICIAL_PAPER"),
    scope: P04OperationalScope = current ?? {
      capability: "OFFICIAL_PAPER",
      actorId: "",
      accessVersion: 0,
      epoch: -1,
    },
    target = salesUuidSchema.safeParse(orderId);
  return useQuery({
    ...officialOrderPaperOptions(
      client,
      scope,
      target.success ? target.data : "",
    ),
    enabled: current !== null && target.success,
  });
};
