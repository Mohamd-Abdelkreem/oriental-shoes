"use client";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { invalidateAdministrationReads } from "@/features/administration/hooks/administration.hooks";
import { useEffect, useRef } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  warehouseOrderDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  salesUuidSchema,
  type WarehouseCommandBody,
  type WarehouseCommandData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { approvalKeys } from "@/features/approval/hooks/approval.hooks";
import { salesContactKeys } from "@/features/sales/hooks/sales-contact.hooks";
import { orderPaperKeys } from "@/features/printing/hooks/order-paper.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentWarehouseOperationalScope,
  isCurrentWarehouseOperationalScope,
  warehouseScopeKey,
  readManufacturingOperationalScope,
  readQualityOperationalScope,
  qualityScopeKey,
  readOperationalScope,
  readP04OperationalScope,
  p04ScopeKey,
  useWarehouseOperationalScope,
  type WarehouseOperationalScope,
} from "@/shared/query/operational-scope";
import { warehouseApi } from "../api/warehouse.api";
import { bindWarehouseCommandResult } from "../model/warehouse-command-binding.model";
import {
  warehouseCommandSessionSchema,
  WarehouseLocalCommandError,
  WarehouseSynchronizationError,
  isUnknownWarehouseWrite,
  type WarehouseCommandState,
} from "../model/warehouse-command-state";
import {
  fetchWarehouseOrder,
  warehouseKeys,
  invalidateWarehouseReads,
} from "./warehouse.hooks";
import { qualityKeys } from "@/features/manufacturing/hooks/quality.hooks";
import { manufacturingKeys } from "@/features/manufacturing/hooks/manufacturing.hooks";

const idle = Object.freeze({ phase: "idle" } as const);
type Entry = Exclude<WarehouseCommandState, { phase: "idle" }>;
const sessionKey = (scope: WarehouseOperationalScope) =>
  [...warehouseScopeKey(scope), "command-session"] as const;
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
const selectSession = (
  client: QueryClient,
  scope: WarehouseOperationalScope,
): WarehouseCommandState => {
  const raw = client.getQueryData(sessionKey(scope));
  if (raw === undefined) return idle;
  const parsed = warehouseCommandSessionSchema.safeParse(raw);
  if (!parsed.success) throw new WarehouseLocalCommandError("INVARIANT");
  const entry = parsed.data;
  if (entry.phase === "idle") return idle;
  if (
    entry.originScope.actorId !== scope.actorId ||
    entry.originScope.accessVersion !== scope.accessVersion ||
    entry.originScope.epoch !== scope.epoch
  )
    throw new WarehouseLocalCommandError("INVARIANT");
  if (!isCurrentWarehouseOperationalScope(client, entry.originScope))
    return idle;
  return frozenCopy(entry);
};
const refreshRead = async (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  input: { queryKey: QueryKey; staleOnly?: boolean },
) => {
  assertCurrentWarehouseOperationalScope(client, scope);
  await client.cancelQueries({ queryKey: input.queryKey });
  assertCurrentWarehouseOperationalScope(client, scope);
  await client.invalidateQueries(
    {
      queryKey: input.queryKey,
      refetchType: input.staleOnly ? "none" : "active",
    },
    { throwOnError: true },
  );
  assertCurrentWarehouseOperationalScope(client, scope);
};
export const synchronizeWarehouseCommand = async (
  client: QueryClient,
  scope: WarehouseOperationalScope,
  result: WarehouseCommandData,
): Promise<void> => {
  try {
    assertCurrentWarehouseOperationalScope(client, scope);
    const saved = warehouseCommandDataSchema.parse(result);
    if (saved.receipt.actor.id !== scope.actorId) throw new ApiContractError();
    const orders = saved.outcome.orders;
    await invalidateWarehouseReads(
      client,
      scope,
      orders.map((order) => order.orderId),
    );
    for (const order of orders) {
      const cached = client.getQueryData(
        warehouseKeys.order(scope, order.orderId),
      );
      if (cached !== undefined) {
        // A receipt is historical; only an authoritative detail can advance the displayed order.
        const detail = warehouseOrderDataSchema.parse(cached);
        if (detail.summary.version < order.afterVersion) {
          const refreshed = await fetchWarehouseOrder(
            client,
            scope,
            order.orderId,
          );
          assertCurrentWarehouseOperationalScope(client, scope);
          if (refreshed.summary.version < order.afterVersion)
            throw new ApiContractError();
        }
      }
    }
    for (const department of ["CUTTING", "PRODUCTION"] as const) {
      const permitted = readManufacturingOperationalScope(client, department);
      if (permitted === null) continue;
      for (const resource of [
        "dashboard",
        "orders",
        "pieces",
        "activity",
      ] as const)
        await refreshRead(client, scope, {
          queryKey: [...manufacturingKeys.department(permitted), resource],
        });
      for (const order of orders) {
        await refreshRead(client, scope, {
          queryKey: manufacturingKeys.order(permitted, order.orderId),
        });
        await refreshRead(client, scope, {
          queryKey: [
            ...manufacturingKeys.department(permitted),
            "order-history",
            order.orderId,
          ],
        });
      }
    }
    const quality = readQualityOperationalScope(client);
    if (quality !== null) {
      for (const resource of [
        "dashboard",
        "orders",
        "pieces",
        "activity",
      ] as const)
        await refreshRead(client, scope, {
          queryKey: [...qualityScopeKey(quality), resource],
        });
      for (const order of orders) {
        await refreshRead(client, scope, {
          queryKey: qualityKeys.order(quality, order.orderId),
        });
        await refreshRead(client, scope, {
          queryKey: [
            ...qualityScopeKey(quality),
            "order-history",
            order.orderId,
          ],
        });
      }
    }
    const sales = readOperationalScope(client);
    if (sales !== null) {
      await refreshRead(client, scope, {
        queryKey: [...customerKeys.root(sales), "orders"],
      });
      await refreshRead(client, scope, {
        queryKey: [...customerKeys.root(sales), "customers", "orders"],
      });
    }
    const approval = readP04OperationalScope(client, "APPROVAL");
    if (approval !== null) {
      await refreshRead(client, scope, {
        queryKey: approvalKeys.dashboard(approval),
      });
      for (const resource of ["orders", "issues", "history"])
        await refreshRead(client, scope, {
          queryKey: [...p04ScopeKey(approval), resource],
        });
      for (const order of orders) {
        await refreshRead(client, scope, {
          queryKey: approvalKeys.order(approval, order.orderId),
        });
        await refreshRead(client, scope, {
          queryKey: [...p04ScopeKey(approval), "order-history", order.orderId],
        });
      }
    }
    const contact = readP04OperationalScope(client, "SALES_CONTACT");
    if (contact !== null) {
      await refreshRead(client, scope, {
        queryKey: [...p04ScopeKey(contact), "contact-list"],
      });
      for (const order of orders)
        await refreshRead(client, scope, {
          queryKey: salesContactKeys.order(contact, order.orderId),
        });
    }
    const paper = readP04OperationalScope(client, "OFFICIAL_PAPER");
    if (paper !== null)
      for (const order of orders)
        await refreshRead(client, scope, {
          queryKey: orderPaperKeys.order(paper, order.orderId),
          staleOnly: true,
        });
    const administration = readAdministrationOperationalScope(client);
    if (administration !== null) {
      await invalidateAdministrationReads(
        client,
        administration,
        orders.map((order) => order.orderId),
      );
      assertCurrentWarehouseOperationalScope(client, scope);
    }
  } catch (error: unknown) {
    throw new WarehouseSynchronizationError(result, getApiError(error));
  }
};
export const useWarehouseCommandReceipt = (
  commandId: string | null,
  originScope: WarehouseOperationalScope | null,
) => {
  const client = useQueryClient(),
    scope: WarehouseOperationalScope = originScope ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      department: "WAREHOUSE",
    };
  const target = salesUuidSchema.safeParse(commandId),
    id = target.success ? target.data : null;
  return useQuery({
    queryKey: [...warehouseScopeKey(scope), "command-receipt", id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (originScope === null || id === null)
        throw new WarehouseLocalCommandError("MISMATCH");
      assertCurrentWarehouseOperationalScope(client, scope);
      try {
        const result = await warehouseApi.observe(id, signal);
        assertCurrentWarehouseOperationalScope(client, scope);
        if (result.receipt.actor.id !== scope.actorId)
          throw new ApiContractError();
        return result;
      } catch (error: unknown) {
        assertCurrentWarehouseOperationalScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertCurrentWarehouseOperationalScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (_previous: unknown, incoming: unknown) => {
      assertCurrentWarehouseOperationalScope(client, scope);
      const result = warehouseCommandDataSchema.parse(incoming);
      if (
        result.receipt.commandId !== id ||
        result.receipt.actor.id !== scope.actorId
      )
        throw new ApiContractError();
      return frozenCopy(result);
    },
  });
};
export const useWarehouseCommand = () => {
  const client = useQueryClient(),
    current = useWarehouseOperationalScope(),
    scope: WarehouseOperationalScope = current ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      department: "WAREHOUSE",
    };
  const subscriber = useQuery({
    queryKey: sessionKey(scope),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  void subscriber.data;
  const state = current === null ? idle : selectSession(client, scope),
    receipt = useWarehouseCommandReceipt(
      state.phase === "idle" ? null : state.body.commandId,
      state.phase === "idle" ? null : state.originScope,
    );
  const mutation = useMutation({
      retry: false,
      gcTime: 0,
      mutationFn: (intent: Pick<Entry, "originScope" | "body">) => {
        assertCurrentWarehouseOperationalScope(client, intent.originScope);
        return warehouseApi.command(intent.body);
      },
    }),
    { reset } = mutation,
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reset();
    };
  }, [reset, scope.actorId, scope.accessVersion, scope.epoch]);
  const reread = (entry: Entry): Entry => {
    assertCurrentWarehouseOperationalScope(client, entry.originScope);
    const stored = selectSession(client, entry.originScope);
    if (
      stored.phase === "idle" ||
      stored.body.commandId !== entry.body.commandId ||
      JSON.stringify(stored.body) !== JSON.stringify(entry.body)
    )
      throw new WarehouseLocalCommandError("MISMATCH");
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
      cache = client.getQueryCache(),
      query = cache.find({ queryKey: key, exact: true });
    if (query === undefined) return;
    query.reset();
    if (
      isCurrentWarehouseOperationalScope(client, entry.originScope) &&
      cache.find({ queryKey: key, exact: true }) === query &&
      query.state.data === undefined
    )
      client.removeQueries({ queryKey: key, exact: true });
  };
  const sync = async (entry: Entry): Promise<void> => {
    const stored = reread(entry);
    if (stored.phase === "synchronized") return;
    if (stored.phase !== "confirmed")
      throw new WarehouseLocalCommandError("MISMATCH");
    try {
      await synchronizeWarehouseCommand(
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
      if (isCurrentWarehouseOperationalScope(client, stored.originScope)) {
        const latest = reread(stored);
        if (latest.phase === "confirmed")
          publish(latest, {
            ...latest,
            syncError:
              error instanceof WarehouseSynchronizationError
                ? error.syncError
                : getApiError(error),
          });
      }
      throw error;
    }
  };
  const execute = async (
    entry: Entry,
    mode: "initial" | "replay",
  ): Promise<WarehouseCommandData> => {
    let result: WarehouseCommandData;
    try {
      reread(entry);
      result = await mutation.mutateAsync(entry);
      reread(entry);
      bindWarehouseCommandResult(result, entry.body, entry.originScope.actorId);
    } catch (error: unknown) {
      if (isCurrentWarehouseOperationalScope(client, entry.originScope)) {
        const latest = reread(entry);
        if ("result" in latest) {
          await sync(latest);
          return latest.result;
        }
        if (mode === "replay" || isUnknownWarehouseWrite(error))
          publish(entry, {
            phase: "unknown",
            originScope: entry.originScope,
            body: entry.body,
            failure: getApiError(error),
          });
        else clear(entry, "pending");
        await reconcileBusinessDenial(client, error, entry.originScope);
      }
      throw error;
    }
    const confirmed = {
      phase: "confirmed" as const,
      originScope: entry.originScope,
      body: entry.body,
      result,
    };
    publish(entry, confirmed);
    await sync(confirmed);
    return result;
  };
  const issued: { entry: Entry | null } = { entry: null };
  const bound = () => {
    const entry = state.phase === "idle" ? issued.entry : state;
    if (entry === null) throw new WarehouseLocalCommandError("MISMATCH");
    return reread(entry);
  };
  return {
    state,
    submit: async (
      input: WarehouseCommandBody,
    ): Promise<WarehouseCommandData> => {
      assertCurrentWarehouseOperationalScope(client, scope);
      if (!mounted.current) throw new WarehouseLocalCommandError("MISMATCH");
      if (selectSession(client, scope).phase !== "idle")
        throw new WarehouseLocalCommandError("BUSY");
      if (issued.entry !== null || state.phase !== "idle")
        throw new WarehouseLocalCommandError("MISMATCH");
      const entry = frozenCopy({
        phase: "pending" as const,
        originScope: scope,
        body: warehouseCommandBodySchema.parse(input),
      });
      issued.entry = entry;
      client.setQueryData(sessionKey(scope), entry);
      return execute(entry, "initial");
    },
    observe: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new WarehouseLocalCommandError("MISMATCH");
      if (
        client.getQueryState([
          ...warehouseScopeKey(entry.originScope),
          "command-receipt",
          entry.body.commandId,
        ])?.fetchStatus === "fetching"
      )
        throw new WarehouseLocalCommandError("BUSY");
      try {
        const observed = await receipt.refetch({
          throwOnError: true,
          cancelRefetch: false,
        });
        reread(entry);
        if (observed.data === undefined) throw new ApiContractError();
        bindWarehouseCommandResult(
          observed.data,
          entry.body,
          entry.originScope.actorId,
        );
        const confirmed = {
          phase: "confirmed" as const,
          originScope: entry.originScope,
          body: entry.body,
          result: observed.data,
        };
        publish(entry, confirmed);
        await sync(confirmed);
      } catch (error: unknown) {
        if (
          isCurrentWarehouseOperationalScope(client, entry.originScope) &&
          reread(entry).phase === "unknown"
        )
          publish(entry, { ...entry, failure: getApiError(error) });
        throw error;
      }
    },
    retrySame: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new WarehouseLocalCommandError("MISMATCH");
      const pending = {
        phase: "pending" as const,
        originScope: entry.originScope,
        body: entry.body,
      };
      publish(entry, pending);
      await execute(pending, "replay");
    },
    synchronize: async (): Promise<void> => {
      await sync(bound());
    },
    acknowledge: (): void => {
      if (!mounted.current) throw new WarehouseLocalCommandError("MISMATCH");
      const entry = bound();
      if (entry.phase !== "synchronized")
        throw new WarehouseLocalCommandError("MISMATCH");
      clear(entry, "synchronized");
    },
  };
};
