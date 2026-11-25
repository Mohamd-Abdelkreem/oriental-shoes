"use client";

import { useEffect, useRef } from "react";
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  salesUuidSchema,
  approvalOrderDataSchema,
  salesOrderDataSchema,
  manufacturingOrderDataSchema,
  qualityOrderDataSchema,
  warehouseOrderDataSchema,
  type AdministrationCommandBody,
  type AdministrationCommandData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentAdministrationOperationalScope as assertScope,
  isCurrentAdministrationOperationalScope as isCurrentScope,
  administrationScopeKey,
  useAdministrationOperationalScope,
  readOperationalScope,
  readP04OperationalScope,
  p04ScopeKey,
  readManufacturingOperationalScope,
  readQualityOperationalScope,
  readWarehouseOperationalScope,
  qualityScopeKey,
  warehouseScopeKey,
  type AdministrationOperationalScope as Scope,
} from "@/shared/query/operational-scope";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import {
  orderKeys,
  orderDetailOptions,
} from "@/features/sales/hooks/orders.hooks";
import { draftKeys } from "@/features/sales/hooks/drafts.hooks";
import {
  approvalKeys,
  approvalOrderOptions,
} from "@/features/approval/hooks/approval.hooks";
import {
  salesContactKeys,
  salesContactOrderOptions,
} from "@/features/sales/hooks/sales-contact.hooks";
import {
  manufacturingKeys,
  fetchManufacturingOrder,
} from "@/features/manufacturing/hooks/manufacturing.hooks";
import {
  qualityKeys,
  fetchQualityOrder,
} from "@/features/manufacturing/hooks/quality.hooks";
import {
  warehouseKeys,
  fetchWarehouseOrder,
} from "@/features/warehouse/hooks/warehouse.hooks";
import { orderPaperKeys } from "@/features/printing/hooks/order-paper.hooks";
import { administrationApi } from "../api/administration.api";
import { bindAdministrationCommandResult } from "../model/administration-command-binding.model";
import {
  administrationCommandSessionSchema,
  AdministrationLocalCommandError,
  AdministrationSynchronizationError,
  isUnknownAdministrationWrite,
  type AdministrationCommandState,
} from "../model/administration-command-state";
import {
  invalidateAdministrationReads,
  fetchAdministrationOrder,
} from "./administration.hooks";

const idle = Object.freeze({ phase: "idle" } as const);
type Entry = Exclude<AdministrationCommandState, { phase: "idle" }>;
const sessionKey = (scope: Scope) =>
  [...administrationScopeKey(scope), "command-session"] as const;
const activityKey = (scope: Scope) =>
  [...administrationScopeKey(scope), "command-activity"] as const;
const selectSession = (
  client: QueryClient,
  scope: Scope,
): AdministrationCommandState => {
  const raw = client.getQueryData(sessionKey(scope));
  if (raw === undefined) return idle;
  const parsed = administrationCommandSessionSchema.safeParse(raw);
  if (!parsed.success) throw new AdministrationLocalCommandError("INVARIANT");
  const entry = parsed.data;
  if (entry.phase === "idle") return idle;
  if (JSON.stringify(entry.originScope) !== JSON.stringify(scope))
    throw new AdministrationLocalCommandError("INVARIANT");
  return isCurrentScope(client, scope) ? entry : idle;
};
const refreshRead = async (
  client: QueryClient,
  scope: Scope,
  target: { key: QueryKey; staleOnly?: boolean },
) => {
  assertScope(client, scope);
  await client.cancelQueries({ queryKey: target.key });
  assertScope(client, scope);
  await client.invalidateQueries(
    { queryKey: target.key, refetchType: target.staleOnly ? "none" : "active" },
    { throwOnError: true },
  );
  assertScope(client, scope);
};
export const synchronizeAdministrationCommand = async (
  client: QueryClient,
  scope: Scope,
  input: AdministrationCommandData,
): Promise<void> => {
  try {
    assertScope(client, scope);
    const saved = administrationCommandDataSchema.parse(input),
      id = saved.receipt.orderId,
      version = saved.receipt.afterVersion;
    if (saved.receipt.actor.id !== scope.actorId) throw new ApiContractError();
    await invalidateAdministrationReads(client, scope, [id]);
    assertScope(client, scope);
    const admin = await fetchAdministrationOrder(client, scope, id);
    assertScope(client, scope);
    if (admin.kind !== "submitted" || admin.order.version < version)
      throw new ApiContractError();
    const sales = readOperationalScope(client);
    if (sales !== null) {
      for (const key of [
        [...customerKeys.root(sales), "orders"],
        [...customerKeys.root(sales), "customers", "orders"],
        [...customerKeys.root(sales), "customers", "order-measurements"],
        [...customerKeys.root(sales), "customers", "measurements"],
        [...draftKeys.root(sales), "drafts"],
      ])
        await refreshRead(client, scope, { key });
      const cached = client.getQueryData(orderKeys.detail(sales, id));
      if (
        cached !== undefined &&
        salesOrderDataSchema.parse(cached).order.version < version
      ) {
        const options = orderDetailOptions(client, sales, id);
        await client.fetchQuery({ ...options, staleTime: 0 });
        assertScope(client, scope);
        if (
          salesOrderDataSchema.parse(client.getQueryData(options.queryKey))
            .order.version < version
        )
          throw new ApiContractError();
      }
    }
    for (const department of ["CUTTING", "PRODUCTION"] as const) {
      const permitted = readManufacturingOperationalScope(client, department);
      if (permitted === null) continue;
      const root = manufacturingKeys.department(permitted);
      for (const key of [
        ...["dashboard", "orders", "pieces", "activity"].map((resource) => [
          ...root,
          resource,
        ]),
        manufacturingKeys.order(permitted, id),
        [...root, "order-history", id],
      ])
        await refreshRead(client, scope, { key });
      const cached = client.getQueryData(
        manufacturingKeys.order(permitted, id),
      );
      if (
        cached !== undefined &&
        manufacturingOrderDataSchema.parse(cached).paper.order.version < version
      ) {
        const fresh = await fetchManufacturingOrder(client, permitted, id);
        assertScope(client, scope);
        if (fresh.paper.order.version < version) throw new ApiContractError();
      }
    }
    const quality = readQualityOperationalScope(client);
    if (quality !== null) {
      const root = qualityScopeKey(quality);
      for (const key of [
        ...["dashboard", "orders", "pieces", "activity"].map((resource) => [
          ...root,
          resource,
        ]),
        qualityKeys.order(quality, id),
        [...root, "order-history", id],
      ])
        await refreshRead(client, scope, { key });
      const cached = client.getQueryData(qualityKeys.order(quality, id));
      if (
        cached !== undefined &&
        qualityOrderDataSchema.parse(cached).paper.order.version < version
      ) {
        const fresh = await fetchQualityOrder(client, quality, id);
        assertScope(client, scope);
        if (fresh.paper.order.version < version) throw new ApiContractError();
      }
    }
    const warehouse = readWarehouseOperationalScope(client);
    if (warehouse !== null) {
      const root = warehouseScopeKey(warehouse);
      for (const key of [
        ...["dashboard", "orders", "pieces", "activity"].map((resource) => [
          ...root,
          resource,
        ]),
        warehouseKeys.order(warehouse, id),
        [...root, "order-history", id],
      ])
        await refreshRead(client, scope, { key });
      const cached = client.getQueryData(warehouseKeys.order(warehouse, id));
      if (
        cached !== undefined &&
        warehouseOrderDataSchema.parse(cached).summary.version < version
      ) {
        const fresh = await fetchWarehouseOrder(client, warehouse, id);
        assertScope(client, scope);
        if (fresh.summary.version < version) throw new ApiContractError();
      }
    }
    const approval = readP04OperationalScope(client, "APPROVAL");
    if (approval !== null) {
      for (const key of [
        approvalKeys.dashboard(approval),
        ...["orders", "issues", "history"].map((resource) => [
          ...p04ScopeKey(approval),
          resource,
        ]),
        approvalKeys.order(approval, id),
        [...p04ScopeKey(approval), "order-history", id],
      ])
        await refreshRead(client, scope, { key });
      const options = approvalOrderOptions(client, approval, id);
      const cached = client.getQueryData(options.queryKey);
      if (
        cached !== undefined &&
        approvalOrderDataSchema.parse(cached).order.version < version
      ) {
        await client.fetchQuery({ ...options, staleTime: 0 });
        assertScope(client, scope);
        if (
          approvalOrderDataSchema.parse(client.getQueryData(options.queryKey))
            .order.version < version
        )
          throw new ApiContractError();
      }
    }
    const contact = readP04OperationalScope(client, "SALES_CONTACT");
    if (contact !== null) {
      await refreshRead(client, scope, {
        key: [...p04ScopeKey(contact), "contact-list"],
      });
      await refreshRead(client, scope, {
        key: salesContactKeys.order(contact, id),
      });
      const options = salesContactOrderOptions(client, contact, id);
      const cached = client.getQueryData(options.queryKey);
      if (
        cached !== undefined &&
        approvalOrderDataSchema.parse(cached).order.version < version
      ) {
        await client.fetchQuery({ ...options, staleTime: 0 });
        assertScope(client, scope);
        if (
          approvalOrderDataSchema.parse(client.getQueryData(options.queryKey))
            .order.version < version
        )
          throw new ApiContractError();
      }
    }
    const paper = readP04OperationalScope(client, "OFFICIAL_PAPER");
    if (paper !== null)
      await refreshRead(client, scope, {
        key: orderPaperKeys.order(paper, id),
        staleOnly: true,
      });
  } catch (error: unknown) {
    throw new AdministrationSynchronizationError(input, getApiError(error));
  }
};
export const useAdministrationCommandReceipt = (
  commandId: string | null,
  originScope: Scope | null,
) => {
  const client = useQueryClient(),
    scope: Scope = originScope ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      capability: "ADMINISTRATION",
    };
  const parsed = salesUuidSchema.safeParse(commandId),
    id = parsed.success ? parsed.data : null;
  return useQuery({
    queryKey: [...administrationScopeKey(scope), "command-receipt", id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (originScope === null || id === null)
        throw new AdministrationLocalCommandError("MISMATCH");
      assertScope(client, scope);
      try {
        const result = await administrationApi.observe(id, signal);
        assertScope(client, scope);
        if (result.receipt.actor.id !== scope.actorId)
          throw new ApiContractError();
        return result;
      } catch (error: unknown) {
        assertScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (_previous: unknown, incoming: unknown) => {
      assertScope(client, scope);
      const result = administrationCommandDataSchema.parse(incoming);
      if (
        result.receipt.commandId !== id ||
        result.receipt.actor.id !== scope.actorId
      )
        throw new ApiContractError();
      return result;
    },
  });
};
type Action =
  | { kind: "submit"; body: AdministrationCommandBody }
  | { kind: "observe" | "retry" | "synchronize"; entry: Entry };
export const useAdministrationCommand = () => {
  const client = useQueryClient(),
    current = useAdministrationOperationalScope();
  const scope: Scope = current ?? {
    actorId: "",
    accessVersion: 0,
    epoch: -1,
    capability: "ADMINISTRATION",
  };
  const subscriber = useQuery({
    queryKey: sessionKey(scope),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  void subscriber.data;
  const state = current === null ? idle : selectSession(client, scope);
  const receipt = useAdministrationCommandReceipt(
    state.phase === "idle" ? null : state.body.commandId,
    state.phase === "idle" ? null : state.originScope,
  );
  const mounted = useRef(false);
  const reread = (entry: Entry, phase: Entry["phase"]): Entry => {
    assertScope(client, entry.originScope);
    const stored = selectSession(client, entry.originScope);
    if (
      stored.phase === "idle" ||
      stored.phase !== phase ||
      JSON.stringify(stored.body) !== JSON.stringify(entry.body)
    )
      throw new AdministrationLocalCommandError("MISMATCH");
    return stored;
  };
  const publish = (entry: Entry, next: Entry) => {
    reread(entry, entry.phase);
    client.setQueryData(
      sessionKey(entry.originScope),
      administrationCommandSessionSchema.parse(next),
    );
  };
  const clear = (entry: Entry) => {
    reread(entry, entry.phase);
    client.setQueryData(sessionKey(entry.originScope), idle);
  };
  const sync = async (entry: Entry): Promise<void> => {
    const stored = reread(entry, "confirmed");
    if (stored.phase !== "confirmed")
      throw new AdministrationLocalCommandError("MISMATCH");
    try {
      await synchronizeAdministrationCommand(
        client,
        stored.originScope,
        stored.result,
      );
      publish(stored, {
        phase: "synchronized",
        originScope: stored.originScope,
        body: stored.body,
        result: stored.result,
      });
    } catch (error: unknown) {
      if (isCurrentScope(client, stored.originScope)) {
        reread(stored, "confirmed");
        publish(stored, {
          ...stored,
          syncError:
            error instanceof AdministrationSynchronizationError
              ? error.syncError
              : getApiError(error),
        });
      }
      throw error;
    }
  };
  const confirm = async (entry: Entry, result: AdministrationCommandData) => {
    reread(entry, entry.phase);
    const bound = bindAdministrationCommandResult(
      result,
      entry.body,
      entry.originScope.actorId,
    );
    const confirmed = {
      phase: "confirmed" as const,
      originScope: entry.originScope,
      body: entry.body,
      result: bound,
    };
    publish(entry, confirmed);
    await sync(confirmed);
    return bound;
  };
  const execute = async (entry: Entry, mode: "initial" | "replay") => {
    let result: AdministrationCommandData;
    try {
      reread(entry, "pending");
      result = await administrationApi.command(entry.body);
      reread(entry, "pending");
      bindAdministrationCommandResult(
        result,
        entry.body,
        entry.originScope.actorId,
      );
    } catch (error: unknown) {
      if (isCurrentScope(client, entry.originScope)) {
        reread(entry, "pending");
        if (mode === "replay" || isUnknownAdministrationWrite(error))
          publish(entry, {
            ...entry,
            phase: "unknown",
            failure: getApiError(error),
          });
        else clear(entry);
        await reconcileBusinessDenial(client, error, entry.originScope);
        assertScope(client, entry.originScope);
      }
      throw error;
    }
    return confirm(entry, result);
  };
  const observe = async (entry: Entry, action: "observe" | "retry") => {
    reread(entry, "unknown");
    let observed: AdministrationCommandData;
    try {
      const response = await receipt.refetch({
        throwOnError: true,
        cancelRefetch: false,
      });
      reread(entry, "unknown");
      if (response.data === undefined) throw new ApiContractError();
      observed = bindAdministrationCommandResult(
        response.data,
        entry.body,
        entry.originScope.actorId,
      );
    } catch (error: unknown) {
      if (!isCurrentScope(client, entry.originScope)) throw error;
      reread(entry, "unknown");
      const failure = getApiError(error);
      if (
        action === "retry" &&
        failure.statusCode === 404 &&
        failure.code === "ADMINISTRATION_COMMAND_NOT_FOUND"
      ) {
        const pending = {
          phase: "pending" as const,
          originScope: entry.originScope,
          body: entry.body,
        };
        publish(entry, pending);
        await execute(pending, "replay");
        return;
      }
      publish(entry, { ...entry, phase: "unknown", failure });
      throw error;
    }
    await confirm(entry, observed);
  };
  const activity = useMutation({
    mutationKey: activityKey(scope),
    retry: false,
    gcTime: 0,
    mutationFn: async (
      action: Action,
    ): Promise<AdministrationCommandData | undefined> => {
      assertScope(client, scope);
      if (action.kind === "submit") {
        if (selectSession(client, scope).phase !== "idle")
          throw new AdministrationLocalCommandError("BUSY");
        const entry = administrationCommandSessionSchema.parse({
          phase: "pending",
          originScope: scope,
          body: action.body,
        });
        if (entry.phase !== "pending")
          throw new AdministrationLocalCommandError("INVARIANT");
        client.setQueryData(sessionKey(scope), entry);
        return execute(entry, "initial");
      }
      if (action.kind === "synchronize") await sync(action.entry);
      else await observe(action.entry, action.kind);
      return undefined;
    },
  });
  const { reset } = activity;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reset();
    };
  }, [reset, scope.actorId, scope.accessVersion, scope.epoch]);
  const busy =
    useIsMutating({ mutationKey: activityKey(scope), exact: true }) > 0;
  const admit = () => {
    assertScope(client, scope);
    if (!mounted.current) throw new AdministrationLocalCommandError("MISMATCH");
    if (client.isMutating({ mutationKey: activityKey(scope), exact: true }) > 0)
      throw new AdministrationLocalCommandError("BUSY");
  };
  const bound = (phase: Entry["phase"]): Entry => {
    admit();
    if (state.phase === "idle")
      throw new AdministrationLocalCommandError("MISMATCH");
    return reread(state, phase);
  };
  return {
    state,
    busy,
    submit: async (
      input: AdministrationCommandBody,
    ): Promise<AdministrationCommandData> => {
      admit();
      if (
        state.phase !== "idle" ||
        selectSession(client, scope).phase !== "idle"
      )
        throw new AdministrationLocalCommandError("BUSY");
      const parsed = administrationCommandBodySchema.parse(input);
      const result = await activity.mutateAsync({
        kind: "submit",
        body: parsed,
      });
      if (result === undefined)
        throw new AdministrationLocalCommandError("INVARIANT");
      return result;
    },
    observe: async (): Promise<void> => {
      await activity.mutateAsync({ kind: "observe", entry: bound("unknown") });
    },
    retrySame: async (): Promise<void> => {
      await activity.mutateAsync({ kind: "retry", entry: bound("unknown") });
    },
    synchronize: async (): Promise<void> => {
      await activity.mutateAsync({
        kind: "synchronize",
        entry: bound("confirmed"),
      });
    },
    acknowledge: (): boolean => {
      if (!mounted.current || state.phase !== "synchronized")
        throw new AdministrationLocalCommandError("MISMATCH");
      const latest = selectSession(client, state.originScope);
      if (
        latest.phase !== "synchronized" ||
        latest.body.commandId !== state.body.commandId
      )
        return false;
      clear(latest);
      return true;
    },
  };
};
