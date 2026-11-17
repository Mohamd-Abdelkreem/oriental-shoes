"use client";

import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { invalidateAdministrationReads } from "@/features/administration/hooks/administration.hooks";
import { invalidateWarehouseReads } from "@/features/warehouse/hooks/warehouse.hooks";
import { readWarehouseOperationalScope } from "@/shared/query/operational-scope";
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
  qualityOrderDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  salesUuidSchema,
  type QualityCommandBody,
  type QualityCommandData,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { customerKeys } from "@/features/customers/hooks/customers.hooks";
import { approvalKeys } from "@/features/approval/hooks/approval.hooks";
import { salesContactKeys } from "@/features/sales/hooks/sales-contact.hooks";
import { orderPaperKeys } from "@/features/printing/hooks/order-paper.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import {
  assertCurrentQualityOperationalScope,
  isCurrentQualityOperationalScope,
  qualityScopeKey,
  readManufacturingOperationalScope,
  readOperationalScope,
  readP04OperationalScope,
  p04ScopeKey,
  useQualityOperationalScope,
  type QualityOperationalScope,
} from "@/shared/query/operational-scope";
import { qualityApi, bindQualityCommandResult } from "../api/quality.api";
import {
  qualityCommandSessionSchema,
  QualityLocalCommandError,
  QualitySynchronizationError,
  isUnknownQualityWrite,
  type QualityCommandState,
} from "../model/quality-command-state";
import { fetchQualityOrder, qualityKeys } from "./quality.hooks";
import { manufacturingKeys } from "./manufacturing.hooks";

const idle = Object.freeze({ phase: "idle" } as const);
type Entry = Exclude<QualityCommandState, { phase: "idle" }>;
const sessionKey = (scope: QualityOperationalScope) =>
  [...qualityScopeKey(scope), "command-session"] as const;
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
  scope: QualityOperationalScope,
): QualityCommandState => {
  const raw = client.getQueryData(sessionKey(scope));
  if (raw === undefined) return idle;
  const parsed = qualityCommandSessionSchema.safeParse(raw);
  if (!parsed.success) throw new QualityLocalCommandError("INVARIANT");
  const entry = parsed.data;
  if (entry.phase === "idle") return idle;
  if (
    entry.originScope.actorId !== scope.actorId ||
    entry.originScope.accessVersion !== scope.accessVersion ||
    entry.originScope.epoch !== scope.epoch
  )
    throw new QualityLocalCommandError("INVARIANT");
  if (!isCurrentQualityOperationalScope(client, entry.originScope)) return idle;
  return frozenCopy(entry);
};
const refreshRead = async (
  client: QueryClient,
  scope: QualityOperationalScope,
  input: { queryKey: QueryKey; staleOnly?: boolean },
) => {
  assertCurrentQualityOperationalScope(client, scope);
  await client.cancelQueries({ queryKey: input.queryKey });
  assertCurrentQualityOperationalScope(client, scope);
  await client.invalidateQueries(
    {
      queryKey: input.queryKey,
      refetchType: input.staleOnly ? "none" : "active",
    },
    { throwOnError: true },
  );
  assertCurrentQualityOperationalScope(client, scope);
};
export const invalidateQualityReads = async (
  client: QueryClient,
  scope: QualityOperationalScope,
  orderIds: readonly string[],
): Promise<void> => {
  const prefix = qualityScopeKey(scope);
  for (const resource of ["dashboard", "orders", "pieces", "activity"] as const)
    await refreshRead(client, scope, { queryKey: [...prefix, resource] });
  for (const id of [...new Set(orderIds)].toSorted()) {
    salesUuidSchema.parse(id);
    await refreshRead(client, scope, {
      queryKey: qualityKeys.order(scope, id),
    });
    await refreshRead(client, scope, {
      queryKey: [...prefix, "order-history", id],
    });
  }
};
export const synchronizeQualityCommand = async (
  client: QueryClient,
  scope: QualityOperationalScope,
  result: QualityCommandData,
): Promise<void> => {
  try {
    assertCurrentQualityOperationalScope(client, scope);
    const saved = qualityCommandDataSchema.parse(result);
    if (saved.receipt.actor.id !== scope.actorId) throw new ApiContractError();
    const orders = saved.outcome.orders;
    await invalidateQualityReads(
      client,
      scope,
      orders.map((order) => order.orderId),
    );
    for (const order of orders) {
      const cached = client.getQueryData(
        qualityKeys.order(scope, order.orderId),
      );
      if (cached !== undefined) {
        // A receipt is historical; only an authoritative detail can advance the displayed order.
        const detail = qualityOrderDataSchema.parse(cached);
        if (detail.paper.order.version < order.afterVersion) {
          const refreshed = await fetchQualityOrder(
            client,
            scope,
            order.orderId,
          );
          assertCurrentQualityOperationalScope(client, scope);
          if (refreshed.paper.order.version < order.afterVersion)
            throw new ApiContractError();
        }
      }
    }
    if (saved.receipt.operation === "INSPECT") {
      const affected = orders
        .filter((order) =>
          order.pieces.some((piece) => piece.decision === "ACCEPT"),
        )
        .map((order) => order.orderId);
      const warehouse = readWarehouseOperationalScope(client);
      if (warehouse !== null && affected.length > 0) {
        assertCurrentQualityOperationalScope(client, scope);
        await invalidateWarehouseReads(client, warehouse, affected);
        assertCurrentQualityOperationalScope(client, scope);
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
      assertCurrentQualityOperationalScope(client, scope);
    }
  } catch (error: unknown) {
    throw new QualitySynchronizationError(result, getApiError(error));
  }
};
export const useQualityCommandReceipt = (
  commandId: string | null,
  originScope: QualityOperationalScope | null,
) => {
  const client = useQueryClient(),
    scope: QualityOperationalScope = originScope ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      department: "QUALITY",
    };
  const target = salesUuidSchema.safeParse(commandId),
    id = target.success ? target.data : null;
  return useQuery({
    queryKey: [...qualityScopeKey(scope), "command-receipt", id],
    enabled: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (originScope === null || id === null)
        throw new QualityLocalCommandError("MISMATCH");
      assertCurrentQualityOperationalScope(client, scope);
      try {
        const result = await qualityApi.observe(id, signal);
        assertCurrentQualityOperationalScope(client, scope);
        if (result.receipt.actor.id !== scope.actorId)
          throw new ApiContractError();
        return result;
      } catch (error: unknown) {
        assertCurrentQualityOperationalScope(client, scope);
        await reconcileBusinessDenial(client, error, scope);
        assertCurrentQualityOperationalScope(client, scope);
        throw error;
      }
    },
    structuralSharing: (_previous: unknown, incoming: unknown) => {
      assertCurrentQualityOperationalScope(client, scope);
      const result = qualityCommandDataSchema.parse(incoming);
      if (
        result.receipt.commandId !== id ||
        result.receipt.actor.id !== scope.actorId
      )
        throw new ApiContractError();
      return frozenCopy(result);
    },
  });
};
export const useQualityCommand = () => {
  const client = useQueryClient(),
    current = useQualityOperationalScope(),
    scope: QualityOperationalScope = current ?? {
      actorId: "",
      accessVersion: 0,
      epoch: -1,
      department: "QUALITY",
    };
  const subscriber = useQuery({
    queryKey: sessionKey(scope),
    queryFn: skipToken,
    enabled: false,
    gcTime: Infinity,
  });
  void subscriber.data;
  const state = current === null ? idle : selectSession(client, scope),
    receipt = useQualityCommandReceipt(
      state.phase === "idle" ? null : state.body.commandId,
      state.phase === "idle" ? null : state.originScope,
    );
  const mutation = useMutation({
      retry: false,
      gcTime: 0,
      mutationFn: (body: QualityCommandBody) => qualityApi.command(body),
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
    assertCurrentQualityOperationalScope(client, entry.originScope);
    const stored = selectSession(client, entry.originScope);
    if (
      stored.phase === "idle" ||
      stored.body.commandId !== entry.body.commandId ||
      JSON.stringify(stored.body) !== JSON.stringify(entry.body)
    )
      throw new QualityLocalCommandError("MISMATCH");
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
      isCurrentQualityOperationalScope(client, entry.originScope) &&
      cache.find({ queryKey: key, exact: true }) === query &&
      query.state.data === undefined
    )
      client.removeQueries({ queryKey: key, exact: true });
  };
  const sync = async (entry: Entry): Promise<void> => {
    const stored = reread(entry);
    if (stored.phase === "synchronized") return;
    if (stored.phase !== "confirmed")
      throw new QualityLocalCommandError("MISMATCH");
    try {
      await synchronizeQualityCommand(
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
      if (isCurrentQualityOperationalScope(client, stored.originScope)) {
        const latest = reread(stored);
        if (latest.phase === "confirmed")
          publish(latest, {
            ...latest,
            syncError:
              error instanceof QualitySynchronizationError
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
  ): Promise<QualityCommandData> => {
    let result: QualityCommandData;
    try {
      reread(entry);
      result = await mutation.mutateAsync(entry.body);
      reread(entry);
      bindQualityCommandResult(result, entry.body, entry.originScope.actorId);
    } catch (error: unknown) {
      if (isCurrentQualityOperationalScope(client, entry.originScope)) {
        const latest = reread(entry);
        if ("result" in latest) {
          await sync(latest);
          return latest.result;
        }
        if (mode === "replay" || isUnknownQualityWrite(error))
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
    if (entry === null) throw new QualityLocalCommandError("MISMATCH");
    return reread(entry);
  };
  return {
    state,
    submit: async (input: QualityCommandBody): Promise<QualityCommandData> => {
      assertCurrentQualityOperationalScope(client, scope);
      if (!mounted.current) throw new QualityLocalCommandError("MISMATCH");
      if (selectSession(client, scope).phase !== "idle")
        throw new QualityLocalCommandError("BUSY");
      if (issued.entry !== null || state.phase !== "idle")
        throw new QualityLocalCommandError("MISMATCH");
      const entry = frozenCopy({
        phase: "pending" as const,
        originScope: scope,
        body: qualityCommandBodySchema.parse(input),
      });
      issued.entry = entry;
      client.setQueryData(sessionKey(scope), entry);
      return execute(entry, "initial");
    },
    observe: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new QualityLocalCommandError("MISMATCH");
      try {
        const observed = await receipt.refetch({ throwOnError: true });
        reread(entry);
        if (observed.data === undefined) throw new ApiContractError();
        bindQualityCommandResult(
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
          isCurrentQualityOperationalScope(client, entry.originScope) &&
          reread(entry).phase === "unknown"
        )
          publish(entry, { ...entry, failure: getApiError(error) });
        throw error;
      }
    },
    retrySame: async (): Promise<void> => {
      const entry = bound();
      if (entry.phase !== "unknown")
        throw new QualityLocalCommandError("MISMATCH");
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
      if (!mounted.current) throw new QualityLocalCommandError("MISMATCH");
      const entry = bound();
      if (entry.phase !== "synchronized")
        throw new QualityLocalCommandError("MISMATCH");
      clear(entry, "synchronized");
    },
  };
};
