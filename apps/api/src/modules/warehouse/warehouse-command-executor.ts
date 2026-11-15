import { createHash, randomUUID } from "node:crypto";
import {
  salesUuidSchema,
  warehouseCommandBodySchema,
  type WarehouseCommandBody,
  type WarehouseCommandData,
  type WarehouseOrderOutcome,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import { ValidationException } from "../../core/errors/validation.error.js";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { isSalesLockTimeout } from "../sales-commands/sales-command.errors.js";
import {
  isWarehouseCommandIdConflict,
  isWarehouseTransactionConflict,
  WarehouseCommandConflictError,
  WarehouseCommandNotFoundError,
  WarehouseTransactionConflictError,
} from "./warehouse.errors.js";
import {
  WAREHOUSE_COMMAND_SELECT,
  mapWarehouseCommandResult,
} from "./warehouse.mapper.js";
import {
  assertWarehouseSelection,
  canonicalWarehouseOrders,
} from "./warehouse.rules.js";
import { lockWarehouseOrders } from "./warehouse.queries.js";
import type {
  LockedWarehouseOrder,
  WarehouseCommandExecution,
  CanonicalWarehouseOrder,
} from "./warehouse.types.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { advanceApprovalOrderVersion } from "../approval/approval-command.writer.js";
import { WarehouseSelectionConflictError } from "./warehouse.errors.js";
import { parseDateOnly } from "../../core/date-only.js";

const parseBody = (body: WarehouseCommandBody): WarehouseCommandBody => {
  const parsed = warehouseCommandBodySchema.safeParse(body);
  if (!parsed.success)
    throw new ValidationException(
      parsed.error.issues.map((issue) => ({
        field: ["body", ...issue.path].join("."),
        message: issue.message,
      })),
    );
  return parsed.data;
};
export const hashWarehouseCommandIntent = (
  input: WarehouseCommandBody,
): string => {
  const body = parseBody(input);
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation: body.operation,
        orders: canonicalWarehouseOrders(body),
      }),
    )
    .digest("hex");
};
const commandLock = async (
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<void> => {
  const prefix = createHash("sha256")
    .update("p07-warehouse-command:" + commandId)
    .digest("hex")
    .slice(0, 16);
  const key = BigInt.asIntN(64, BigInt("0x" + prefix)).toString();
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
};

type OrderEffect = Readonly<{
  commandId: string;
  occurredAt: Date;
  result: WarehouseOrderOutcome;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isSelectionUnique = (
  error: Prisma.PrismaClientKnownRequestError,
): boolean => {
  if (error.code !== "P2002") return false;
  const meta = error.meta,
    adapter = meta?.["driverAdapterError"];
  if (!isRecord(adapter) || !isRecord(adapter["cause"])) return false;
  const constraint = adapter["cause"]["constraint"];
  if (!isRecord(constraint) || !Array.isArray(constraint["fields"]))
    return false;
  const fields: unknown[] = constraint["fields"];
  const key = fields.every((field) => typeof field === "string")
    ? [...fields].sort().join(",")
    : "";
  switch (meta?.["modelName"]) {
    case "WarehouseReceiptPiece":
      return key === "piece_id";
    case "WarehouseDeliveryAttempt":
      return (
        key === "number,order_id" ||
        key === "predecessor_retry_id" ||
        key === "order_id,predecessor_retry_id"
      );
    case "WarehouseDeliveryOutcome":
    case "WarehouseDeliveryRetry":
      return key === "attempt_id" || key === "attempt_id,order_id";
    default:
      return false;
  }
};

export class WarehouseCommandExecutor {
  constructor(private readonly database: DatabaseClient) {}

  async execute(
    input: WarehouseCommandExecution,
  ): Promise<WarehouseCommandData> {
    const body = parseBody(input.body),
      groups = canonicalWarehouseOrders(body),
      payloadHash = hashWarehouseCommandIntent(body);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, input.actorId);
      await commandLock(tx, body.commandId);
      const retained = await tx.warehouseCommand.findUnique({
        where: { commandId: body.commandId },
        select: WAREHOUSE_COMMAND_SELECT,
      });
      if (retained !== null) {
        if (
          retained.actorId !== actor.id ||
          retained.operation !== body.operation ||
          retained.payloadHash !== payloadHash
        )
          throw new WarehouseCommandConflictError();
        return mapWarehouseCommandResult(retained, true);
      }
      const orders = await lockWarehouseOrders(tx, {
        actor,
        body,
        orders: groups,
      });
      assertWarehouseSelection({ operation: body.operation, orders });
      const occurredAt = new Date(),
        outcome = { orders: orders.map((order) => this.planOutcome(order)) };
      const stored = await tx.warehouseCommand.create({
        data: {
          commandId: body.commandId,
          operation: body.operation,
          actorId: actor.id,
          actorFullName: actor.fullName,
          actorRole: actor.role,
          actorDepartment: actor.department,
          payloadHash,
          occurredAt,
          outcome,
        },
        select: WAREHOUSE_COMMAND_SELECT,
      });
      for (const [index, order] of orders.entries()) {
        const result = outcome.orders[index];
        if (result === undefined || order.root.order === null)
          throw new InternalServerError(
            "A locked warehouse group lost its planned result.",
          );
        await tx.warehouseCommandOrder.create({
          data: {
            commandId: body.commandId,
            orderId: order.root.id,
            eventId: result.eventId,
            beforeVersion: result.beforeVersion,
            afterVersion: result.afterVersion,
            beforeStatus: order.root.order.status,
            afterStatus: result.status,
            pieceIds: result.pieceIds,
          },
        });
        await this.applyOrder(tx, order, {
          commandId: body.commandId,
          occurredAt,
          result,
        });
        const updated = await tx.salesOrder.updateMany({
          where: { id: order.root.id, status: order.root.order.status },
          data: { status: result.status },
        });
        if (updated.count !== 1) throw new WarehouseSelectionConflictError();
        await advanceApprovalOrderVersion(tx, {
          orderId: order.root.id,
          expectedVersion: order.root.version,
          occurredAt,
        });
      }
      return mapWarehouseCommandResult(stored, false);
    });
  }

  private planOutcome(order: LockedWarehouseOrder): WarehouseOrderOutcome {
    const group = order.reviewed;
    const common = {
      eventId: randomUUID(),
      orderId: order.root.id,
      beforeVersion: order.root.version,
      afterVersion: order.root.version + 1,
      pieceIds: [...group.pieceIds],
      receiptGroupId: null,
      attemptId: null,
      retryId: null,
    };
    switch (group.operation) {
      case "RECEIVE":
        return {
          ...common,
          status:
            order.counts.active ===
              order.counts.received + group.pieceIds.length &&
            !order.hasActiveBlocker
              ? "READY_FOR_DELIVERY"
              : "APPROVED",
          receiptGroupId: randomUUID(),
        };
      case "DISPATCH":
        return {
          ...common,
          status: "OUT_FOR_DELIVERY",
          attemptId: randomUUID(),
        };
      case "CONFIRM_DELIVERY":
        return { ...common, status: "DELIVERED", attemptId: group.attemptId };
      case "FAIL_DELIVERY":
        return {
          ...common,
          status: "DELIVERY_FAILED",
          attemptId: group.attemptId,
        };
      case "RETRY_DELIVERY":
        return {
          ...common,
          status: "READY_FOR_DELIVERY",
          attemptId: group.attemptId,
          retryId: randomUUID(),
        };
    }
  }

  private async applyOrder(
    tx: Prisma.TransactionClient,
    order: LockedWarehouseOrder,
    effect: OrderEffect,
  ): Promise<void> {
    const group = order.reviewed;
    switch (group.operation) {
      case "RECEIVE": {
        const groupId = effect.result.receiptGroupId;
        if (groupId === null)
          throw new InternalServerError(
            "A receipt lost its planned arrival group.",
          );
        await tx.warehouseReceiptGroup.create({
          data: {
            id: groupId,
            commandId: effect.commandId,
            orderId: order.root.id,
            cartonCount: group.receipt.cartonCount,
            storageLocation: group.receipt.storageLocation,
            notes: group.receipt.notes,
          },
        });
        for (const piece of order.physical) {
          const source = order.acceptedByPiece.get(piece.id);
          if (source === undefined)
            throw new InternalServerError(
              "A validated physical receipt lost its acceptance source.",
            );
          await tx.warehouseReceiptPiece.create({
            data: {
              pieceId: piece.id,
              orderId: order.root.id,
              origin: "COMMAND",
              groupId,
              qualityEventId: source.id,
              receivedAt: effect.occurredAt,
            },
          });
          const updated = await tx.salesOrderPiece.updateMany({
            where: {
              id: piece.id,
              orderId: order.root.id,
              stage: "WAREHOUSE",
              workState: "INCOMING",
              receivedAt: null,
              cancelledAt: null,
              cancellationReason: null,
              issueId: null,
              currentWorkVisitId: null,
            },
            data: { workState: "COMPLETED", receivedAt: effect.occurredAt },
          });
          if (updated.count !== 1) throw new WarehouseSelectionConflictError();
        }
        return;
      }
      case "DISPATCH":
        return this.dispatch(tx, order, group, effect);
      case "CONFIRM_DELIVERY":
        return this.confirmDelivery(tx, order, group, effect);
      case "FAIL_DELIVERY":
        return this.failDelivery(tx, order, group, effect);
      case "RETRY_DELIVERY":
        return this.retryDelivery(tx, order, group, effect);
    }
  }

  private async dispatch(
    tx: Prisma.TransactionClient,
    order: LockedWarehouseOrder,
    group: Extract<CanonicalWarehouseOrder, { operation: "DISPATCH" }>,
    effect: OrderEffect,
  ): Promise<void> {
    const attemptId = effect.result.attemptId;
    if (attemptId === null)
      throw new InternalServerError("A dispatch lost its planned attempt.");
    await tx.warehouseDeliveryAttempt.create({
      data: {
        id: attemptId,
        orderId: order.root.id,
        commandId: effect.commandId,
        number: (order.latestAttempt?.number ?? 0) + 1,
        deliveryNote: group.deliveryNote,
        predecessorRetryId: order.latestAttempt?.retry?.id ?? null,
      },
    });
    await tx.warehouseDeliveryAttemptMember.createMany({
      data: group.pieceIds.map((pieceId) => ({
        attemptId,
        orderId: order.root.id,
        pieceId,
      })),
    });
  }

  private async confirmDelivery(
    tx: Prisma.TransactionClient,
    order: LockedWarehouseOrder,
    group: Extract<CanonicalWarehouseOrder, { operation: "CONFIRM_DELIVERY" }>,
    effect: OrderEffect,
  ): Promise<void> {
    await tx.warehouseDeliveryOutcome.create({
      data: {
        id: randomUUID(),
        attemptId: group.attemptId,
        orderId: order.root.id,
        commandId: effect.commandId,
        kind: "DELIVERED",
        recipient: group.recipient,
        deliveredAt:
          group.deliveredAt === null ? null : new Date(group.deliveredAt),
        reason: null,
        notes: group.notes,
        returnedToWarehouse: false,
      },
    });
  }

  private async failDelivery(
    tx: Prisma.TransactionClient,
    order: LockedWarehouseOrder,
    group: Extract<CanonicalWarehouseOrder, { operation: "FAIL_DELIVERY" }>,
    effect: OrderEffect,
  ): Promise<void> {
    await tx.warehouseDeliveryOutcome.create({
      data: {
        id: randomUUID(),
        attemptId: group.attemptId,
        orderId: order.root.id,
        commandId: effect.commandId,
        kind: "FAILED",
        recipient: null,
        deliveredAt: null,
        reason: group.reason,
        notes: group.notes,
        returnedToWarehouse: true,
      },
    });
  }

  private async retryDelivery(
    tx: Prisma.TransactionClient,
    order: LockedWarehouseOrder,
    group: Extract<CanonicalWarehouseOrder, { operation: "RETRY_DELIVERY" }>,
    effect: OrderEffect,
  ): Promise<void> {
    const retryId = effect.result.retryId,
      outcome = order.latestAttempt?.outcome;
    if (
      retryId === null ||
      outcome === null ||
      outcome === undefined ||
      outcome.kind !== "FAILED"
    )
      throw new InternalServerError(
        "A retry lost its validated failed outcome.",
      );
    await tx.warehouseDeliveryRetry.create({
      data: {
        id: retryId,
        attemptId: group.attemptId,
        orderId: order.root.id,
        outcomeId: outcome.id,
        commandId: effect.commandId,
        retryDate:
          group.retryDate === null ? null : parseDateOnly(group.retryDate),
        notes: group.notes,
      },
    });
  }

  async observe(
    actorId: string,
    commandId: string,
  ): Promise<WarehouseCommandData> {
    const identity = salesUuidSchema.parse(commandId);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      await commandLock(tx, identity);
      const retained = await tx.warehouseCommand.findUnique({
        where: { commandId: identity },
        select: WAREHOUSE_COMMAND_SELECT,
      });
      if (retained === null || retained.actorId !== actor.id)
        throw new WarehouseCommandNotFoundError();
      return mapWarehouseCommandResult(retained, true);
    });
  }

  private async lockActor(
    tx: Prisma.TransactionClient,
    actorId: string,
  ): Promise<AuthorityAccount> {
    await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
    await lockAccountRows(tx, [actorId], "read");
    const actor = await loadIdentityAccount(tx, actorId);
    assertBusinessAuthority(actor, "WAREHOUSE");
    return actor;
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error: unknown) {
        if (isSalesLockTimeout(error))
          throw new WarehouseTransactionConflictError();
        if (
          isWarehouseTransactionConflict(error) ||
          isWarehouseCommandIdConflict(error)
        ) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new WarehouseTransactionConflictError();
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (isSelectionUnique(error))
            throw new WarehouseSelectionConflictError();
          const failure = new InternalServerError(
            "The warehouse operation could not be saved.",
          );
          const adapter = error.meta?.["driverAdapterError"],
            cause = isRecord(adapter) ? adapter["cause"] : null;
          const sqlState =
            isRecord(cause) &&
            typeof cause["originalCode"] === "string" &&
            /^[0-9A-Z]{5}$/u.test(cause["originalCode"])
              ? cause["originalCode"]
              : null;
          failure.cause = { databaseCode: error.code, sqlState };
          throw failure;
        }
        throw error;
      }
    }
  }
}
