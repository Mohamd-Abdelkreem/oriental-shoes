"use client";

import axios from "axios";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  salesCommandDataSchema,
  salesCommandParamsSchema,
  customerDataSchema,
  draftDataSchema,
  type SalesCommandData,
} from "@template/contracts";
import { customersApi } from "@/features/customers/api/customers.api";
import {
  customerDetailOptions,
  customerKeys,
} from "@/features/customers/hooks/customers.hooks";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  useOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import { draftsApi } from "../api/drafts.api";
import { salesCommandsApi } from "../api/sales-commands.api";
import {
  SalesSynchronizationError,
  type SalesCommandVariables,
} from "../model/sales-command-state";
import { draftDetailOptions, draftKeys } from "./drafts.hooks";

export const synchronizeSalesCommand = async (
  client: QueryClient,
  scope: OperationalScope,
  result: SalesCommandData,
): Promise<void> => {
  try {
    assertCurrentOperationalScope(client, scope);
    const root = customerKeys.root(scope),
      id = result.receipt.resourceId;
    await client.cancelQueries({ queryKey: root });
    assertCurrentOperationalScope(client, scope);
    if (result.kind === "customer") {
      const current = await client.fetchQuery({
        ...customerDetailOptions(client, scope, id),
        staleTime: 0,
      });
      assertCurrentOperationalScope(client, scope);
      const parsed = customerDataSchema.safeParse(current);
      const published = customerDataSchema.safeParse(
        client.getQueryData(customerKeys.detail(scope, id)),
      );
      if (
        !parsed.success ||
        !published.success ||
        parsed.data.customer.id !== id ||
        parsed.data.customer.version < result.receipt.afterVersion ||
        published.data.customer.version < result.receipt.afterVersion
      )
        throw new ApiContractError();
      client.removeQueries({
        queryKey: [...root, "customers", "phone"],
        predicate: (query) => {
          const resolved = customerDataSchema.safeParse(query.state.data);
          return (
            resolved.success &&
            resolved.data.customer.id === id &&
            resolved.data.customer.phone !== parsed.data.customer.phone
          );
        },
      });
    } else {
      const current = await client.fetchQuery({
        ...draftDetailOptions(client, scope, id),
        staleTime: 0,
      });
      assertCurrentOperationalScope(client, scope);
      const parsed = draftDataSchema.safeParse(current);
      const published = draftDataSchema.safeParse(
        client.getQueryData(draftKeys.detail(scope, id)),
      );
      if (
        !parsed.success ||
        !published.success ||
        parsed.data.draft.id !== id ||
        parsed.data.draft.version < result.receipt.afterVersion ||
        published.data.draft.version < result.receipt.afterVersion
      )
        throw new ApiContractError();
    }
    await client.invalidateQueries({ queryKey: root }, { throwOnError: true });
    assertCurrentOperationalScope(client, scope);
  } catch (error: unknown) {
    if (error instanceof SalesSynchronizationError) throw error;
    throw new SalesSynchronizationError(
      result,
      axios.isCancel(error) ? null : getApiError(error),
    );
  }
};
const dispatch = async ({
  command,
}: SalesCommandVariables): Promise<SalesCommandData> => {
  switch (command.operation) {
    case "CREATE_CUSTOMER":
      return customersApi.create(command.body);
    case "UPDATE_CUSTOMER":
      return customersApi.update(command.customerId, command.body);
    case "CREATE_DRAFT":
      return draftsApi.create(command.body);
    case "SAVE_DRAFT":
      return draftsApi.save(command.draftId, command.body);
  }
};
const assertResult = (
  result: SalesCommandData,
  { scope, command }: SalesCommandVariables,
): void => {
  const { receipt } = result;
  const customer =
    command.operation === "CREATE_CUSTOMER" ||
    command.operation === "UPDATE_CUSTOMER";
  if (
    result.kind !== (customer ? "customer" : "draft") ||
    receipt.operation !== command.operation ||
    receipt.commandId !== command.body.commandId ||
    receipt.actor.id !== scope.actorId ||
    (command.operation === "UPDATE_CUSTOMER" &&
      receipt.resourceId !== command.customerId) ||
    (command.operation === "SAVE_DRAFT" &&
      receipt.resourceId !== command.draftId)
  )
    throw new ApiContractError();
};
export const useSalesCommand = (): UseMutationResult<
  SalesCommandData,
  unknown,
  SalesCommandVariables,
  OperationalScope
> => {
  const client = useQueryClient();
  return useMutation<
    SalesCommandData,
    unknown,
    SalesCommandVariables,
    OperationalScope
  >({
    retry: false,
    onMutate: async (variables) => {
      assertCurrentOperationalScope(client, variables.scope);
      await client.cancelQueries({
        queryKey: customerKeys.root(variables.scope),
      });
      assertCurrentOperationalScope(client, variables.scope);
      return variables.scope;
    },
    mutationFn: async (variables) => {
      assertCurrentOperationalScope(client, variables.scope);
      const parsed = salesCommandDataSchema.safeParse(
        await dispatch(variables),
      );
      if (!parsed.success) throw new ApiContractError();
      assertResult(parsed.data, variables);
      return parsed.data;
    },
    onSuccess: async (result, variables) => {
      await synchronizeSalesCommand(client, variables.scope, result);
    },
    onError: async (error, variables) => {
      if (!(error instanceof SalesSynchronizationError))
        await reconcileBusinessDenial(client, error, variables.scope);
    },
  });
};
export const useSalesCommandReceipt = (commandId: string | null) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? { actorId: "", accessVersion: 0, epoch: -1 };
  const selected = salesCommandParamsSchema.safeParse({ commandId }),
    id = selected.success ? selected.data.commandId : "";
  return useQuery<SalesCommandData, unknown>({
    queryKey: [...customerKeys.root(scope), "commands", id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      assertCurrentOperationalScope(client, scope);
      if (!selected.success) throw new ApiContractError();
      try {
        const data = await salesCommandsApi.get(id, signal);
        assertCurrentOperationalScope(client, scope);
        if (
          data.receipt.commandId !== id ||
          data.receipt.actor.id !== scope.actorId
        )
          throw new ApiContractError();
        return data;
      } catch (error: unknown) {
        await reconcileBusinessDenial(client, error, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      const data = salesCommandDataSchema.safeParse(incoming);
      if (
        !data.success ||
        data.data.receipt.commandId !== id ||
        data.data.receipt.actor.id !== scope.actorId
      )
        throw new ApiContractError();
      return data.data;
    },
  });
};
