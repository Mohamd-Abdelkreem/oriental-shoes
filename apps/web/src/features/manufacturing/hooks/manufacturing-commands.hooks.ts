"use client";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { invalidateAdministrationReads } from "@/features/administration/hooks/administration.hooks";
import { invalidateQualityReads } from "./quality-commands.hooks";
import { useEffect } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  manufacturingCommandDataSchema,
  approvalCommandDataSchema,
  salesUuidSchema,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { approvalKeys } from "@/features/approval/hooks/approval.hooks";
import { salesContactKeys } from "@/features/sales/hooks/sales-contact.hooks";
import { orderPaperKeys } from "@/features/printing/hooks/order-paper.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentManufacturingOperationalScope,
  isCurrentManufacturingOperationalScope,
  manufacturingScopeKey,
  readManufacturingOperationalScope,
  readQualityOperationalScope,
  readOperationalScope,
  readP04OperationalScope,
  p04ScopeKey,
  useManufacturingOperationalScope,
  type ManufacturingOperationalScope,
} from "@/shared/query/operational-scope";
import {
  manufacturingApi,
  bindManufacturingWorkResult,
} from "../api/manufacturing.api";
import {
  manufacturingCommandIntentSchema,
  manufacturingCommandSessionSchema,
  ManufacturingLocalCommandError,
  ManufacturingSynchronizationError,
  isUnknownManufacturingWrite,
  type ManufacturingCommandIntent,
  type ManufacturingCommandResult,
  type ManufacturingCommandState,
} from "../model/manufacturing-command-state";
import {
  fetchManufacturingOrder,
  manufacturingKeys,
} from "./manufacturing.hooks";

const idle = Object.freeze({ phase: "idle" } as const);
type Entry = Exclude<ManufacturingCommandState, { phase: "idle" }>;
const sessionKey = (scope: ManufacturingOperationalScope) =>
  [...manufacturingScopeKey(scope), "command-session"] as const;
const frozenCopy = <T>(input: T): T => {
  const copy = structuredClone(input);
  const freeze = (entry: unknown): void => {
    if (entry !== null && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
  };
  freeze(copy);
  return copy;
};
const bindResult = (
  result: ManufacturingCommandResult,
  scope: ManufacturingOperationalScope,
  intent: ManufacturingCommandIntent,
): void => {
  if (
    result.kind !== intent.kind ||
    result.data.receipt.actor.id !== scope.actorId
  )
    throw new ApiContractError();
  if (result.kind === "work" && intent.kind === "work") {
    bindManufacturingWorkResult(
      manufacturingCommandDataSchema.parse(result.data),
      scope.department,
      intent.body,
    );
    return;
  }
  if (result.kind !== "report" || intent.kind !== "report")
    throw new ApiContractError();
  const { receipt, outcome } = approvalCommandDataSchema.parse(result.data);
  if (
    receipt.commandId !== intent.body.commandId ||
    receipt.operation !== "REPORT_ISSUE" ||
    receipt.orderId !== intent.orderId ||
    receipt.beforeVersion !== intent.body.expectedVersion ||
    receipt.afterVersion !== intent.body.expectedVersion + 1 ||
    outcome.orderId !== intent.orderId ||
    outcome.pieceId !== intent.pieceId ||
    outcome.issueId === null ||
    outcome.pieceStage !== scope.department ||
    outcome.pieceWorkState !== "BLOCKED" ||
    outcome.issueState !== "APPROVAL_REVIEW" ||
    (receipt.actor.role !== "ADMIN" &&
      receipt.actor.department !== scope.department)
  )
    throw new ApiContractError();
};
const selectSession = (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
): ManufacturingCommandState => {
  const raw = client.getQueryData(sessionKey(scope));
  if (raw === undefined) return idle;
  const parsed = manufacturingCommandSessionSchema.safeParse(raw);
  if (!parsed.success) throw new ManufacturingLocalCommandError("INVARIANT");
  const entry = parsed.data;
  if (entry.phase === "idle") return idle;
  if (
    entry.originScope.actorId !== scope.actorId ||
    entry.originScope.accessVersion !== scope.accessVersion ||
    entry.originScope.epoch !== scope.epoch
  )
    throw new ManufacturingLocalCommandError("INVARIANT");
  if (!isCurrentManufacturingOperationalScope(client, entry.originScope))
    return idle;
  if ("result" in entry)
    bindResult(entry.result, entry.originScope, entry.intent);
  return frozenCopy(entry);
};
const affectedOrders = (result: ManufacturingCommandResult) =>
  result.kind === "work"
    ? result.data.outcome.orders.map((order) => ({
        id: order.orderId,
        version: order.afterVersion,
      }))
    : [
        {
          id: result.data.receipt.orderId,
          version: result.data.receipt.afterVersion,
        },
      ];
export const synchronizeManufacturingCommand = async (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
  result: ManufacturingCommandResult,
): Promise<void> => {
  const assert = () => {
    assertCurrentManufacturingOperationalScope(client, scope);
  };
  const refresh = async (queryKey: QueryKey, staleOnly = false) => {
    assert();
    await client.cancelQueries({ queryKey });
    assert();
    await client.invalidateQueries(
      { queryKey, refetchType: staleOnly ? "none" : "active" },
      { throwOnError: true },
    );
    assert();
  };
  try {
    assert();
    if (result.data.receipt.actor.id !== scope.actorId)
      throw new ApiContractError();
    const orders = affectedOrders(result);
    const paper = readP04OperationalScope(client, "OFFICIAL_PAPER");
    if (paper)
      for (const order of orders)
        await refresh(orderPaperKeys.order(paper, order.id), true);
    for (const department of ["CUTTING", "PRODUCTION"] as const) {
      const permitted = readManufacturingOperationalScope(client, department);
      if (!permitted) continue;
      for (const resource of [
        "dashboard",
        "orders",
        "pieces",
        "activity",
      ] as const)
        await refresh([...manufacturingKeys.department(permitted), resource]);
      for (const order of orders) {
        await refresh(manufacturingKeys.order(permitted, order.id));
        await refresh([
          ...manufacturingKeys.department(permitted),
          "order-history",
          order.id,
        ]);
        const published = client.getQueryData<{
          paper: { order: { version: number } };
        }>(manufacturingKeys.order(permitted, order.id));
        if (published && published.paper.order.version < order.version) {
          // Flat-row preparation can cache a detail without mounting an observer.
          const refreshed = await fetchManufacturingOrder(
            client,
            permitted,
            order.id,
          );
          if (refreshed.paper.order.version < order.version)
            throw new ApiContractError();
        }
      }
    }
    const quality = readQualityOperationalScope(client);
    if (quality) {
      await invalidateQualityReads(
        client,
        quality,
        orders.map((order) => order.id),
      );
      assert();
    }
    const sales = readOperationalScope(client);
    if (sales) {
      await refresh([...customerKeys.root(sales), "orders"]);
      await refresh([...customerKeys.root(sales), "customers", "orders"]);
    }
    const approval = readP04OperationalScope(client, "APPROVAL");
    if (approval) {
      await refresh(approvalKeys.dashboard(approval));
      for (const resource of ["orders", "issues", "history"])
        await refresh([...p04ScopeKey(approval), resource]);
      for (const order of orders) {
        await refresh(approvalKeys.order(approval, order.id));
        await refresh([...p04ScopeKey(approval), "order-history", order.id]);
      }
    }
    const contact = readP04OperationalScope(client, "SALES_CONTACT");
    if (contact) {
      await refresh([...p04ScopeKey(contact), "contact-list"]);
      for (const order of orders)
        await refresh(salesContactKeys.order(contact, order.id));
    }
    const administration = readAdministrationOperationalScope(client);
    if (administration !== null) {
      await invalidateAdministrationReads(
        client,
        administration,
        orders.map((order) => order.id),
      );
      assert();
    }
  } catch (error: unknown) {
    throw new ManufacturingSynchronizationError(result, getApiError(error));
  }
};
export const useManufacturingCommandReceipt = (
  kind: "work" | "report" | null,
  commandId: string | null,
  originScope: ManufacturingOperationalScope | null,
) => {
  const client = useQueryClient(),
    scope = originScope ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      department: "CUTTING" as const,
    };
  const target = salesUuidSchema.safeParse(commandId),
    id = target.success ? target.data : null;
  return useQuery({
    queryKey: [...manufacturingScopeKey(scope), "command-receipt", kind, id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<ManufacturingCommandResult> => {
      if (!kind || !originScope || id === null)
        throw new ManufacturingLocalCommandError("MISMATCH");
      assertCurrentManufacturingOperationalScope(client, scope);
      try {
        const result: ManufacturingCommandResult =
          kind === "work"
            ? { kind, data: await manufacturingApi.observeWork(id, signal) }
            : { kind, data: await manufacturingApi.observeReport(id, signal) };
        assertCurrentManufacturingOperationalScope(client, scope);
        if (
          result.data.receipt.actor.id !== scope.actorId ||
          (result.kind === "work" &&
            result.data.receipt.department !== scope.department) ||
          (result.kind === "report" &&
            (result.data.receipt.operation !== "REPORT_ISSUE" ||
              result.data.outcome.pieceStage !== scope.department))
        )
          throw new ApiContractError();
        return result;
      } catch (error: unknown) {
        assertCurrentManufacturingOperationalScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertCurrentManufacturingOperationalScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (previous: unknown, incoming: unknown) => {
      assertCurrentManufacturingOperationalScope(client, scope);
      return incoming;
    },
  });
};
export const useManufacturingCommand = (
  department: ManufacturingOperationalScope["department"],
) => {
  const client = useQueryClient(),
    current = useManufacturingOperationalScope(department),
    scope = current ?? { actorId: "", accessVersion: 0, epoch: -1, department };
  const subscriber = useQuery({
    queryKey: sessionKey(scope),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  void subscriber.data;
  const state = current === null ? idle : selectSession(client, scope);
  const receipt = useManufacturingCommandReceipt(
    state.phase === "idle" ? null : state.intent.kind,
    state.phase === "idle" ? null : state.intent.body.commandId,
    state.phase === "idle" ? null : state.originScope,
  );
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async (
      intent: ManufacturingCommandIntent,
    ): Promise<ManufacturingCommandResult> =>
      intent.kind === "work"
        ? {
            kind: "work",
            data: await manufacturingApi.command(
              intent.department,
              intent.body,
            ),
          }
        : {
            kind: "report",
            data: await manufacturingApi.reportIssue(
              intent.orderId,
              intent.pieceId,
              intent.body,
            ),
          },
  });
  const { reset } = mutation;
  useEffect(
    () => () => {
      reset();
    },
    [reset, scope.actorId, scope.accessVersion, scope.epoch],
  );
  const reread = (entry: Entry): Entry => {
    assertCurrentManufacturingOperationalScope(client, entry.originScope);
    const stored = selectSession(client, entry.originScope);
    if (
      stored.phase === "idle" ||
      stored.intent.body.commandId !== entry.intent.body.commandId ||
      stored.originScope.department !== entry.originScope.department
    )
      throw new ManufacturingLocalCommandError("MISMATCH");
    return stored;
  };
  const publish = (entry: Entry, next: Entry) => {
    reread(entry);
    client.setQueryData(sessionKey(entry.originScope), frozenCopy(next));
  };
  const clear = (entry: Entry, phase: "pending" | "synchronized") => {
    const stored = reread(entry);
    if (stored.phase !== phase) return;
    const key = sessionKey(entry.originScope),
      query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) return;
    query.reset();
    if (
      client.getQueryCache().find({ queryKey: key, exact: true }) === query &&
      query.state.data === undefined
    )
      client.removeQueries({ queryKey: key, exact: true });
  };
  const sync = async (entry: Entry): Promise<void> => {
    const stored = reread(entry);
    if (stored.phase === "synchronized") return;
    if (stored.phase !== "confirmed")
      throw new ManufacturingLocalCommandError("MISMATCH");
    try {
      await synchronizeManufacturingCommand(
        client,
        stored.originScope,
        stored.result,
      );
      publish(stored, {
        originScope: stored.originScope,
        intent: stored.intent,
        result: stored.result,
        phase: "synchronized",
      });
    } catch (error: unknown) {
      if (isCurrentManufacturingOperationalScope(client, stored.originScope)) {
        const latest = reread(stored);
        if (latest.phase === "confirmed")
          publish(latest, { ...latest, syncError: getApiError(error) });
      }
      throw error;
    }
  };
  const execute = async (
    entry: Entry,
    replay: boolean,
  ): Promise<ManufacturingCommandResult> => {
    let result: ManufacturingCommandResult;
    try {
      reread(entry);
      result = await mutation.mutateAsync(entry.intent);
      reread(entry);
      bindResult(result, entry.originScope, entry.intent);
    } catch (error: unknown) {
      if (isCurrentManufacturingOperationalScope(client, entry.originScope)) {
        const latest = reread(entry);
        if ("result" in latest) {
          await sync(latest);
          return latest.result;
        }
        if (replay || isUnknownManufacturingWrite(error))
          publish(entry, {
            ...entry,
            phase: "unknown",
            failure: getApiError(error),
          });
        else clear(entry, "pending");
        await reconcileBusinessDenial(client, error, entry.originScope);
      }
      throw error;
    }
    const confirmed = {
      originScope: entry.originScope,
      intent: entry.intent,
      phase: "confirmed" as const,
      result,
    };
    publish(entry, confirmed);
    await sync(confirmed);
    return result;
  };
  const issued: { entry: Entry | null } = { entry: null };
  const bound = () => {
    const entry = state.phase === "idle" ? issued.entry : state;
    if (!entry) throw new ManufacturingLocalCommandError("MISMATCH");
    return reread(entry);
  };
  return {
    state,
    submit: async (
      input: ManufacturingCommandIntent,
    ): Promise<ManufacturingCommandResult> => {
      assertCurrentManufacturingOperationalScope(client, scope);
      if (selectSession(client, scope).phase !== "idle")
        throw new ManufacturingLocalCommandError("BUSY");
      if (issued.entry || state.phase !== "idle")
        throw new ManufacturingLocalCommandError("MISMATCH");
      const intent = manufacturingCommandIntentSchema.parse(input);
      if (intent.department !== department)
        throw new ManufacturingLocalCommandError("MISMATCH");
      const entry = frozenCopy({
        phase: "pending" as const,
        originScope: scope,
        intent,
      });
      issued.entry = entry;
      client.setQueryData(sessionKey(scope), entry);
      return execute(entry, false);
    },
    observe: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new ManufacturingLocalCommandError("MISMATCH");
      try {
        const observed = await receipt.refetch({ throwOnError: true });
        reread(entry);
        if (!observed.data) throw new ApiContractError();
        bindResult(observed.data, entry.originScope, entry.intent);
        const confirmed = {
          originScope: entry.originScope,
          intent: entry.intent,
          phase: "confirmed" as const,
          result: observed.data,
        };
        publish(entry, confirmed);
        await sync(confirmed);
      } catch (error: unknown) {
        if (
          isCurrentManufacturingOperationalScope(client, entry.originScope) &&
          reread(entry).phase === "unknown"
        )
          publish(entry, { ...entry, failure: getApiError(error) });
        throw error;
      }
    },
    retrySame: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new ManufacturingLocalCommandError("MISMATCH");
      const pending = {
        originScope: entry.originScope,
        intent: entry.intent,
        phase: "pending" as const,
      };
      publish(entry, pending);
      await execute(pending, true);
    },
    synchronize: async (): Promise<void> => {
      await sync(bound());
    },
    acknowledge: (): void => {
      const entry = bound();
      if (entry.phase !== "synchronized")
        throw new ManufacturingLocalCommandError("MISMATCH");
      clear(entry, "synchronized");
    },
  };
};
