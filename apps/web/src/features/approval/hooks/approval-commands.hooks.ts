"use client";

import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { invalidateAdministrationReads } from "@/features/administration/hooks/administration.hooks";
import { invalidateWarehouseReads } from "@/features/warehouse/hooks/warehouse.hooks";
import { readWarehouseOperationalScope } from "@/shared/query/operational-scope";
import { invalidateQualityReads } from "@/features/manufacturing/hooks/quality-commands.hooks";
import { invalidateManufacturingReads } from "@/features/manufacturing/hooks/manufacturing.hooks";

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type Query,
} from "@tanstack/react-query";
import {
  approvalCommandDataSchema,
  approvalOrderDataSchema,
  salesUuidSchema,
  type ApprovalCommandData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { salesContactApi } from "@/features/sales/api/sales-contact.api";
import { salesContactOrderOptions } from "@/features/sales/hooks/sales-contact.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentP04OperationalScope,
  isCurrentP04OperationalScope,
  p04ScopeKey,
  readManufacturingOperationalScope,
  readOperationalScope,
  readP04OperationalScope,
  readQualityOperationalScope,
  useP04OperationalScope,
} from "@/shared/query/operational-scope";
import { approvalApi } from "../api/approval.api";
import { approvalCommandsApi } from "../api/approval-commands.api";
import {
  approvalCommandCapability,
  approvalCommandIntentSchema,
  approvalCommandSessionSchema,
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
  isUnknownApprovalWrite,
  type ApprovalCommandCapability,
  type ApprovalCommandIntent,
  type ApprovalCommandScope,
  type ApprovalCommandState,
  type ApprovalCommandVariables,
} from "../model/approval-command-state";
import { approvalOrderOptions } from "./approval.hooks";

const sessionKey = (scope: ApprovalCommandScope, orderId: string) =>
  [...p04ScopeKey(scope), "command-session", orderId] as const;
const capabilities: readonly ApprovalCommandCapability[] = [
  "APPROVAL",
  "SALES_CONTACT",
];
const idle: ApprovalCommandState = Object.freeze({ phase: "idle" });
const sameScope = (a: ApprovalCommandScope, b: ApprovalCommandScope) =>
  a.capability === b.capability &&
  a.actorId === b.actorId &&
  a.accessVersion === b.accessVersion &&
  a.epoch === b.epoch;
const isScopedRead = (query: Query, scope: ApprovalCommandScope) => {
  const key = query.queryKey;
  return (
    key[0] === "p04" &&
    key[2] === scope.actorId &&
    key[3] === scope.accessVersion &&
    key[4] === scope.epoch &&
    key[5] !== "command-session" &&
    key[5] !== "command-receipt"
  );
};
const assertBinding = (
  result: ApprovalCommandData,
  scope: ApprovalCommandScope,
  command: ApprovalCommandIntent,
) => {
  const { receipt, outcome } = approvalCommandDataSchema.parse(result);
  if (
    receipt.actor.id !== scope.actorId ||
    receipt.commandId !== command.body.commandId ||
    receipt.operation !== command.operation ||
    receipt.orderId !== command.orderId ||
    receipt.beforeVersion !== command.body.expectedVersion ||
    receipt.afterVersion !== command.body.expectedVersion + 1 ||
    approvalCommandCapability(receipt.operation) !== scope.capability ||
    ("pieceId" in command &&
      (outcome.pieceId !== command.pieceId ||
        outcome.issueId !== command.issueId)) ||
    (command.operation === "REVIEW_CONTACT" &&
      outcome.proposalId !== command.body.proposalId)
  )
    throw new ApiContractError();
};
// The cache is the only slot owner. Every read validates its immutable binding.
const selectSession = (
  client: QueryClient,
  scope: ApprovalCommandScope,
  orderId: string,
): ApprovalCommandState => {
  let selected: ApprovalCommandState = idle;
  for (const capability of capabilities) {
    const origin = { ...scope, capability };
    const raw = client.getQueryData(sessionKey(origin, orderId));
    if (raw === undefined) continue;
    const parsed = approvalCommandSessionSchema.safeParse(raw);
    if (!parsed.success) throw new ApprovalLocalCommandError("INVARIANT");
    const value = parsed.data;
    if (
      !sameScope(value.originScope, origin) ||
      value.command.orderId !== orderId ||
      approvalCommandCapability(value.command.operation) !== capability
    )
      throw new ApprovalLocalCommandError("INVARIANT");
    if (!isCurrentP04OperationalScope(client, origin)) continue;
    if (value.phase === "confirmed" || value.phase === "synchronized") {
      try {
        assertBinding(value.result, origin, value.command);
      } catch {
        throw new ApprovalLocalCommandError("INVARIANT");
      }
    }
    if (selected.phase !== "idle")
      throw new ApprovalLocalCommandError("INVARIANT");
    selected = frozenCopy(value);
  }
  return selected;
};
const frozenCopy = <T>(value: T): T => {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
};
export const synchronizeApprovalCommand = async (
  client: QueryClient,
  scope: ApprovalCommandScope,
  result: ApprovalCommandData,
): Promise<void> => {
  try {
    assertCurrentP04OperationalScope(client, scope);
    if (
      approvalCommandCapability(result.receipt.operation) !==
        scope.capability ||
      result.receipt.actor.id !== scope.actorId
    )
      throw new ApiContractError();
    await client.cancelQueries({
      predicate: (query) => isScopedRead(query, scope),
    });
    assertCurrentP04OperationalScope(client, scope);
    const id = result.receipt.orderId;
    await client.invalidateQueries({
      predicate: (query) =>
        isScopedRead(query, scope) &&
        query.queryKey[5] === "official-paper" &&
        query.queryKey[6] === id,
      refetchType: "none",
    });
    assertCurrentP04OperationalScope(client, scope);
    const options =
      scope.capability === "SALES_CONTACT"
        ? salesContactOrderOptions(client, scope, id)
        : approvalOrderOptions(client, scope, id);
    const received = await client.fetchQuery({ ...options, staleTime: 0 });
    assertCurrentP04OperationalScope(client, scope);
    const published = approvalOrderDataSchema.parse(
      client.getQueryData(options.queryKey),
    );
    if (
      received.order.id !== id ||
      published.order.id !== id ||
      received.order.version < result.receipt.afterVersion ||
      published.order.version < result.receipt.afterVersion
    )
      throw new ApiContractError();
    await client.invalidateQueries(
      {
        predicate: (query) =>
          isScopedRead(query, scope) &&
          query.queryKey[5] !== "official-paper" &&
          (query.queryKey[1] === "APPROVAL" ||
            query.queryKey[1] === "SALES_CONTACT") &&
          readP04OperationalScope(client, query.queryKey[1]) !== null,
      },
      { throwOnError: true },
    );
    assertCurrentP04OperationalScope(client, scope);
    for (const department of ["CUTTING", "PRODUCTION"] as const) {
      const affectsDepartment =
        result.outcome.pieceId !== null ||
        (result.receipt.operation === "APPROVE_INITIAL" &&
          department === "CUTTING");
      if (!affectsDepartment) continue;
      const manufacturing = readManufacturingOperationalScope(
        client,
        department,
      );
      if (manufacturing !== null) {
        await invalidateManufacturingReads(client, manufacturing, id);
        assertCurrentP04OperationalScope(client, scope);
      }
    }
    if (result.outcome.pieceStage === "CANCELLED") {
      const warehouse = readWarehouseOperationalScope(client);
      if (warehouse !== null) {
        assertCurrentP04OperationalScope(client, scope);
        await invalidateWarehouseReads(client, warehouse, [id]);
        assertCurrentP04OperationalScope(client, scope);
      }
    }
    const quality = readQualityOperationalScope(client);
    if (quality) {
      await invalidateQualityReads(client, quality, [id]);
      assertCurrentP04OperationalScope(client, scope);
    }
    const sales = readOperationalScope(client);
    if (
      sales !== null &&
      sales.actorId === scope.actorId &&
      sales.accessVersion === scope.accessVersion &&
      sales.epoch === scope.epoch
    ) {
      await client.invalidateQueries(
        { queryKey: customerKeys.root(sales) },
        { throwOnError: true },
      );
      assertCurrentP04OperationalScope(client, scope);
    }
    const administration = readAdministrationOperationalScope(client);
    if (administration !== null) {
      await invalidateAdministrationReads(client, administration, [id]);
      assertCurrentP04OperationalScope(client, scope);
    }
  } catch (error: unknown) {
    if (error instanceof ApprovalSynchronizationError) throw error;
    throw new ApprovalSynchronizationError(result, getApiError(error));
  }
};
export const useApprovalCommandReceipt = (
  commandId: string | null,
  originScope: ApprovalCommandScope | null,
) => {
  const client = useQueryClient();
  const scope: ApprovalCommandScope = originScope ?? {
    capability: "APPROVAL",
    actorId: "",
    accessVersion: 0,
    epoch: -1,
  };
  const target = salesUuidSchema.safeParse(commandId),
    id = target.success ? target.data : "";
  const validate = (input: unknown) => {
    assertCurrentP04OperationalScope(client, scope);
    const result = approvalCommandDataSchema.parse(input);
    if (
      result.receipt.commandId !== id ||
      result.receipt.actor.id !== scope.actorId ||
      approvalCommandCapability(result.receipt.operation) !== scope.capability
    )
      throw new ApiContractError();
    return result;
  };
  return useQuery<ApprovalCommandData, unknown>({
    queryKey: [...p04ScopeKey(scope), "command-receipt", id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!target.success || originScope === null)
        throw new ApprovalLocalCommandError("MISMATCH");
      assertCurrentP04OperationalScope(client, scope);
      try {
        return validate(await approvalCommandsApi.get(id, signal));
      } catch (error: unknown) {
        assertCurrentP04OperationalScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertCurrentP04OperationalScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentP04OperationalScope(client, scope)
        ? validate(incoming)
        : previous,
  });
};
const dispatch = ({
  command,
}: ApprovalCommandVariables): Promise<ApprovalCommandData> => {
  switch (command.operation) {
    case "APPROVE_INITIAL":
      return approvalApi.approve(command.orderId, command.body);
    case "RETURN_INITIAL":
      return approvalApi.return(command.orderId, command.body);
    case "RESOLVE_ISSUE":
      return approvalApi.resolve(
        command.orderId,
        command.pieceId,
        command.issueId,
        command.body,
      );
    case "SUBMIT_CONTACT":
      return salesContactApi.submit(
        command.orderId,
        command.pieceId,
        command.issueId,
        command.body,
      );
    case "REVIEW_CONTACT":
      return approvalApi.review(
        command.orderId,
        command.pieceId,
        command.issueId,
        command.body,
      );
  }
};
// reset notifies disabled observers; identity/data guards preserve synchronous replacements.
const clearSession = (
  client: QueryClient,
  entry: Exclude<ApprovalCommandState, { phase: "idle" }>,
  phase: "pending" | "synchronized",
) => {
  const key = sessionKey(entry.originScope, entry.command.orderId);
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const current = client.getQueryData<ApprovalCommandState>(key);
  if (
    !query ||
    !current ||
    current.phase !== phase ||
    current.command.body.commandId !== entry.command.body.commandId ||
    !isCurrentP04OperationalScope(client, entry.originScope)
  )
    return;
  query.reset();
  if (
    client.getQueryCache().find({ queryKey: key, exact: true }) === query &&
    query.state.data === undefined
  )
    client.removeQueries({ queryKey: key, exact: true });
};
export const useApprovalCommand = (
  orderId: string,
  capability: ApprovalCommandCapability,
) => {
  const client = useQueryClient(),
    current = useP04OperationalScope(capability);
  const scope: ApprovalCommandScope =
    current === null
      ? { capability, actorId: "", accessVersion: 0, epoch: -1 }
      : { ...current, capability };
  // Both subscriptions must remain mounted even when only one capability is writable.
  const approvalSession = useQuery({
    queryKey: sessionKey({ ...scope, capability: "APPROVAL" }, orderId),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  const contactSession = useQuery({
    queryKey: sessionKey({ ...scope, capability: "SALES_CONTACT" }, orderId),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  // Reading data registers notifications on both observer results.
  void approvalSession.data;
  void contactSession.data;
  const state = current === null ? idle : selectSession(client, scope, orderId);
  const receipt = useApprovalCommandReceipt(
    state.phase === "idle" ? null : state.command.body.commandId,
    state.phase === "idle" ? null : state.originScope,
  );
  const mutation = useMutation({ mutationFn: dispatch, retry: false });
  const reread = (entry: Exclude<ApprovalCommandState, { phase: "idle" }>) => {
    assertCurrentP04OperationalScope(client, entry.originScope);
    const stored = selectSession(client, entry.originScope, orderId);
    if (
      stored.phase === "idle" ||
      stored.command.body.commandId !== entry.command.body.commandId ||
      !sameScope(stored.originScope, entry.originScope)
    )
      throw new ApprovalLocalCommandError("MISMATCH");
    return stored;
  };
  const publish = (
    entry: Exclude<ApprovalCommandState, { phase: "idle" }>,
    next: Exclude<ApprovalCommandState, { phase: "idle" }>,
  ) => {
    reread(entry);
    client.setQueryData(sessionKey(entry.originScope, orderId), next);
  };
  const synchronize = async (
    entry: Exclude<ApprovalCommandState, { phase: "idle" }>,
  ) => {
    const stored = reread(entry);
    if (stored.phase !== "confirmed")
      throw new ApprovalLocalCommandError("MISMATCH");
    try {
      await synchronizeApprovalCommand(
        client,
        stored.originScope,
        stored.result,
      );
      const latest = reread(stored);
      if (latest.phase === "synchronized") return;
      if (latest.phase !== "confirmed")
        throw new ApprovalLocalCommandError("MISMATCH");
      publish(stored, {
        originScope: stored.originScope,
        command: stored.command,
        result: stored.result,
        phase: "synchronized",
      });
    } catch (error: unknown) {
      const failure =
        error instanceof ApprovalSynchronizationError
          ? error
          : new ApprovalSynchronizationError(stored.result, getApiError(error));
      if (isCurrentP04OperationalScope(client, stored.originScope)) {
        const latest = reread(stored);
        if (latest.phase === "synchronized") return;
        if (latest.phase === "confirmed")
          publish(latest, { ...latest, syncError: failure.syncError });
      }
      throw failure;
    }
  };
  const finishKnown = async (
    entry: Extract<
      ApprovalCommandState,
      { phase: "confirmed" | "synchronized" }
    >,
  ): Promise<ApprovalCommandData> => {
    if (entry.phase === "confirmed") await synchronize(entry);
    const latest = reread(entry);
    if (latest.phase !== "synchronized")
      throw new ApprovalLocalCommandError("MISMATCH");
    return latest.result;
  };
  const execute = async (
    entry: Exclude<ApprovalCommandState, { phase: "idle" }>,
    wasUnknown: boolean,
  ) => {
    reread(entry);
    let result: ApprovalCommandData;
    try {
      result = await mutation.mutateAsync({
        scope: entry.originScope,
        command: entry.command,
      });
      reread(entry);
      assertBinding(result, entry.originScope, entry.command);
    } catch (error: unknown) {
      if (!isCurrentP04OperationalScope(client, entry.originScope)) throw error;
      const latest = reread(entry);
      if (latest.phase === "confirmed" || latest.phase === "synchronized")
        return finishKnown(latest);
      if (wasUnknown || isUnknownApprovalWrite(error))
        publish(entry, {
          ...entry,
          phase: "unknown",
          failure: getApiError(error),
        });
      else clearSession(client, entry, "pending");
      await reconcileBusinessDenial(client, error, entry.originScope);
      throw error;
    }
    const latest = reread(entry);
    if (latest.phase === "confirmed" || latest.phase === "synchronized")
      return finishKnown(latest);
    const confirmed = { ...entry, phase: "confirmed" as const, result };
    publish(entry, confirmed);
    await synchronize(confirmed);
    reread(confirmed);
    return result;
  };
  const selected = () => {
    if (current === null) throw new ApprovalLocalCommandError("MISMATCH");
    assertCurrentP04OperationalScope(client, scope);
    return selectSession(client, scope, orderId);
  };
  // This render's submit and acknowledgement share only their immutable binding.
  // The QueryClient remains the sole command-state authority.
  const issued: {
    entry: Exclude<ApprovalCommandState, { phase: "idle" }> | null;
  } = { entry: null };
  const bound = () => {
    const binding = state.phase === "idle" ? issued.entry : state;
    if (binding === null) throw new ApprovalLocalCommandError("MISMATCH");
    return reread(binding);
  };
  return {
    state,
    submit: async (
      input: ApprovalCommandIntent,
    ): Promise<ApprovalCommandData> => {
      const command = approvalCommandIntentSchema.parse(input);
      if (
        command.orderId !== orderId ||
        approvalCommandCapability(command.operation) !== capability
      )
        throw new ApprovalLocalCommandError("MISMATCH");
      if (selected().phase !== "idle")
        throw new ApprovalLocalCommandError("BUSY");
      if (issued.entry !== null || state.phase !== "idle")
        throw new ApprovalLocalCommandError("MISMATCH");
      const entry = frozenCopy({
        phase: "pending" as const,
        originScope: scope,
        command,
      });
      issued.entry = entry;
      client.setQueryData(sessionKey(scope, orderId), entry);
      return execute(entry, false);
    },
    observe: async (): Promise<void> => {
      const entry = bound();
      if (
        entry.phase !== "unknown" ||
        state.phase === "idle" ||
        state.command.body.commandId !== entry.command.body.commandId ||
        !sameScope(state.originScope, entry.originScope)
      )
        throw new ApprovalLocalCommandError("MISMATCH");
      try {
        const observed = await receipt.refetch({ throwOnError: true });
        const latest = reread(entry);
        if (latest.phase === "confirmed" || latest.phase === "synchronized") {
          await finishKnown(latest);
          return;
        }
        if (!observed.data) throw new ApiContractError();
        assertBinding(observed.data, entry.originScope, entry.command);
        const confirmed = {
          ...entry,
          phase: "confirmed" as const,
          result: observed.data,
        };
        publish(entry, confirmed);
        await synchronize(confirmed);
      } catch (error: unknown) {
        if (
          isCurrentP04OperationalScope(client, entry.originScope) &&
          reread(entry).phase === "unknown"
        )
          publish(entry, { ...entry, failure: getApiError(error) });
        throw error;
      }
    },
    retrySame: async (): Promise<void> => {
      const entry = bound();
      if (state.phase !== "unknown" || entry.phase !== "unknown")
        throw new ApprovalLocalCommandError("MISMATCH");
      const pending = { ...entry, phase: "pending" as const };
      publish(entry, pending);
      await execute(pending, true);
    },
    synchronize: async (): Promise<void> => {
      const entry = bound();
      if (state.phase !== "confirmed" || entry.phase !== "confirmed")
        throw new ApprovalLocalCommandError("MISMATCH");
      await synchronize(entry);
    },
    acknowledge: (): void => {
      const entry = bound();
      if (entry.phase !== "synchronized")
        throw new ApprovalLocalCommandError("MISMATCH");
      clearSession(client, entry, "synchronized");
    },
  };
};
