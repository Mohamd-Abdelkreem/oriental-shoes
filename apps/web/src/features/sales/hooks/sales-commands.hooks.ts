"use client";

import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { invalidateAdministrationReads } from "@/features/administration/hooks/administration.hooks";
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
  salesOrderDataSchema,
  salesOrderEditorDataSchema,
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
import {
  orderDetailOptions,
  orderEditorOptions,
  orderKeys,
} from "./orders.hooks";
import { ordersApi } from "../api/orders.api";
import { draftKeys } from "./drafts.hooks";

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
      await synchronizeOrderEditor(client, scope, result);
    }
    await client.invalidateQueries({ queryKey: root }, { throwOnError: true });
    assertCurrentOperationalScope(client, scope);
    const administration = readAdministrationOperationalScope(client);
    if (administration !== null) {
      await invalidateAdministrationReads(
        client,
        administration,
        result.kind === "customer" ? null : [id],
      );
      assertCurrentOperationalScope(client, scope);
    }
  } catch (error: unknown) {
    if (error instanceof SalesSynchronizationError) throw error;
    throw new SalesSynchronizationError(
      result,
      axios.isCancel(error) ? null : getApiError(error),
    );
  }
};
const synchronizeOrderEditor = async (
  client: QueryClient,
  scope: OperationalScope,
  result: SalesCommandData,
) => {
  const id = result.receipt.resourceId;
  const received = await client.fetchQuery({
    ...orderEditorOptions(client, scope, id),
    staleTime: 0,
  });
  assertCurrentOperationalScope(client, scope);
  const current = salesOrderEditorDataSchema.parse(
    client.getQueryData(orderKeys.editor(scope, id)),
  );
  const resource = received.kind === "draft" ? received.draft : received.order,
    published = current.kind === "draft" ? current.draft : current.order;
  if (
    resource.id !== id ||
    published.id !== id ||
    resource.version < result.receipt.afterVersion ||
    published.version < result.receipt.afterVersion
  )
    throw new ApiContractError();
  if (current.kind === "submitted") {
    client.removeQueries({
      queryKey: draftKeys.detail(scope, id),
      exact: true,
    });
    const detail = await client.fetchQuery({
      ...orderDetailOptions(client, scope, id),
      staleTime: 0,
    });
    assertCurrentOperationalScope(client, scope);
    const cached = salesOrderDataSchema.parse(
      client.getQueryData(orderKeys.detail(scope, id)),
    );
    if (
      detail.order.id !== id ||
      detail.order.version < published.version ||
      cached.order.version < published.version
    )
      throw new ApiContractError();
  } else {
    if (result.kind !== "draft") throw new ApiContractError();
    client.setQueryData(draftKeys.detail(scope, id), (prior: unknown) => {
      const previous = draftDataSchema.safeParse(prior);
      return previous.success &&
        previous.data.draft.version > current.draft.version
        ? previous.data
        : { draft: current.draft };
    });
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
    case "SUBMIT_NEW_ORDER":
    case "SUBMIT_DRAFT":
      return ordersApi.submit(command.body);
    case "RESUBMIT_ORDER":
      return ordersApi.resubmit(command.orderId, command.body);
    case "SET_ORDER_PAID":
      return ordersApi.setPaid(command.orderId, command.body);
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
  const draft =
    command.operation === "CREATE_DRAFT" || command.operation === "SAVE_DRAFT";
  const creation =
    command.operation === "CREATE_CUSTOMER" ||
    command.operation === "CREATE_DRAFT" ||
    command.operation === "SUBMIT_NEW_ORDER";
  const expectedVersion = creation ? null : command.body.expectedVersion;
  const target =
    command.operation === "UPDATE_CUSTOMER"
      ? command.customerId
      : command.operation === "SAVE_DRAFT"
        ? command.draftId
        : command.operation === "SUBMIT_DRAFT"
          ? command.body.draftId
          : command.operation === "RESUBMIT_ORDER" ||
              command.operation === "SET_ORDER_PAID"
            ? command.orderId
            : null;
  if (
    result.kind !== (customer ? "customer" : draft ? "draft" : "order") ||
    receipt.operation !== command.operation ||
    receipt.commandId !== command.body.commandId ||
    receipt.actor.id !== scope.actorId ||
    (target !== null && receipt.resourceId !== target) ||
    receipt.beforeVersion !== expectedVersion ||
    receipt.afterVersion !==
      (expectedVersion === null ? 1 : expectedVersion + 1)
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
      if (
        variables.command.operation === "SET_ORDER_PAID" &&
        getApiError(error).code === "ORDER_PAID_UNCHANGED" &&
        isCurrentOperationalScope(client, variables.scope)
      )
        await client.invalidateQueries({
          queryKey: customerKeys.root(variables.scope),
        });
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
