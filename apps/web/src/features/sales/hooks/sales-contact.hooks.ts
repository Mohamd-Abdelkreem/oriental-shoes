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
  salesContactQuerySchema,
  salesContactDataSchema,
  approvalOrderDataSchema,
  type SalesContactQuery,
  type SalesContactQueryInput,
  type SalesContactData,
  type ApprovalOrderData,
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
import { salesContactApi } from "../api/sales-contact.api";

export const salesContactKeys = {
  list: (scope: P04OperationalScope, query: SalesContactQuery) =>
    [
      ...p04ScopeKey(scope),
      "contact-list",
      query.search ?? "",
      query.type ?? null,
      query.state ?? null,
      query.page,
      query.limit,
    ] as const,
  order: (scope: P04OperationalScope, id: string) =>
    [...p04ScopeKey(scope), "contact-order", id] as const,
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
const useContactContext = () => {
  const client = useQueryClient(),
    current = useP04OperationalScope("SALES_CONTACT");
  const scope: P04OperationalScope = current ?? {
    capability: "SALES_CONTACT",
    actorId: "",
    accessVersion: 0,
    epoch: -1,
  };
  return { client, current, scope };
};
export const salesContactOrderOptions = (
  client: QueryClient,
  scope: P04OperationalScope,
  orderId: string,
) => {
  const target = salesUuidSchema.safeParse(orderId),
    id = target.success ? target.data : "";
  return queryOptions<ApprovalOrderData, unknown>({
    queryKey: salesContactKeys.order(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => salesContactApi.order(id, signal));
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
export const useSalesContactOrder = (orderId: string | null) => {
  const { client, current, scope } = useContactContext(),
    target = salesUuidSchema.safeParse(orderId);
  return useQuery({
    ...salesContactOrderOptions(
      client,
      scope,
      target.success ? target.data : "",
    ),
    enabled: current !== null && target.success,
  });
};
export const useSalesContactQueue = (options: SalesContactQueryInput) => {
  const { client, current, scope } = useContactContext(),
    query = salesContactQuerySchema.parse(options);
  return useQuery<SalesContactData>({
    queryKey: salesContactKeys.list(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await salesContactApi.list(query, signal);
        assertCurrentP04OperationalScope(client, scope);
        const destination = Math.max(1, received.pagination.totalPages);
        if (query.page > destination)
          await client.invalidateQueries({
            queryKey: salesContactKeys.list(scope, {
              ...query,
              page: destination,
            }),
            exact: true,
            refetchType: "none",
          });
        assertCurrentP04OperationalScope(client, scope);
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? replaceEqualDeep(previous, salesContactDataSchema.parse(incoming))
        : previous,
  });
};
