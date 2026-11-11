import { createHash, randomUUID } from "node:crypto";
import {
  manufacturingCommandBodySchema,
  manufacturingCommandOutcomeSchema,
  manufacturingDepartmentSchema,
  salesUuidSchema,
  type ManufacturingCommandBody,
  type ManufacturingCommandData,
  type ManufacturingCommandOutcome,
  type ManufacturingDepartment,
  type ManufacturingPieceOutcome,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ValidationException } from "../../core/errors/validation.error.js";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
} from "../sales-commands/sales-command.errors.js";
import { OrderVersionConflictError } from "../sales-orders/sales-orders.errors.js";
import {
  isManufacturingCommandIdConflict,
  ManufacturingCommandConflictError,
  ManufacturingCommandNotFoundError,
  ManufacturingSelectionConflictError,
  ManufacturingTransactionConflictError,
  ManufacturingWorkUnchangedError,
} from "./manufacturing.errors.js";
import {
  MANUFACTURING_COMMAND_SELECT,
  mapManufacturingCommandResult,
} from "./manufacturing.mapper.js";
import { lockManufacturingOrders } from "./manufacturing.queries.js";
import {
  canonicalManufacturingOrders,
  isCurrentManufacturingWork,
  nextManufacturingStage,
} from "./manufacturing.rules.js";
import { openManufacturingVisit } from "./manufacturing-work.lifecycle.js";
import type {
  LockedManufacturingOrder,
  ManufacturingCommandExecution,
  ManufacturingPieceContextRecord,
} from "./manufacturing.types.js";

export const hashManufacturingCommandIntent = (input: {
  department: ManufacturingDepartment;
  body: ManufacturingCommandBody;
}): string => {
  const body = manufacturingCommandBodySchema.parse(input.body);
  return createHash("sha256")
    .update(
      JSON.stringify({
        department: manufacturingDepartmentSchema.parse(input.department),
        operation: body.operation,
        orders: canonicalManufacturingOrders(body.orders),
      }),
    )
    .digest("hex");
};
const commandLock = async (
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<void> => {
  const prefix = createHash("sha256")
    .update(`p05-manufacturing-command:${commandId}`)
    .digest("hex")
    .slice(0, 16);
  const key = BigInt.asIntN(64, BigInt(`0x${prefix}`)).toString();
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
};
const parseCommandBody = (
  body: ManufacturingCommandBody,
): ManufacturingCommandBody => {
  const parsed = manufacturingCommandBodySchema.safeParse(body);
  if (!parsed.success)
    throw new ValidationException(
      parsed.error.issues.map((issue) => ({
        field: ["body", ...issue.path].join("."),
        message: issue.message,
      })),
    );
  return parsed.data;
};
const requireSelection = (
  orders: readonly LockedManufacturingOrder[],
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  operation: ManufacturingCommandBody["operation"],
): void => {
  for (const order of orders)
    for (const record of order.pieces) {
      if (
        !isCurrentManufacturingWork(record, department) ||
        record.visit === null
      )
        throw new ManufacturingSelectionConflictError();
      if (
        record.piece.workState !==
        (operation === "RECEIVE_AND_START" ? "INCOMING" : "IN_PROGRESS")
      )
        throw new ManufacturingSelectionConflictError();
      if (operation === "CONTINUE" && record.lastAction?.actorId === actor.id)
        throw new ManufacturingWorkUnchangedError();
    }
};

type WorkContext = Readonly<{
  department: ManufacturingDepartment;
  operation: ManufacturingCommandBody["operation"];
  commandId: string;
  occurredAt: Date;
}>;
type PendingPieceEvent = Prisma.ManufacturingPieceEventCreateManyInput;

export class ManufacturingCommandExecutor {
  constructor(private readonly database: DatabaseClient) {}

  async execute(
    input: ManufacturingCommandExecution,
  ): Promise<ManufacturingCommandData> {
    const body = parseCommandBody(input.body),
      payloadHash = hashManufacturingCommandIntent({
        department: input.department,
        body,
      });
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, input.actorId);
      assertBusinessAuthority(actor, input.department);
      await commandLock(tx, body.commandId);
      const retained = await tx.manufacturingCommand.findUnique({
        where: { commandId: body.commandId },
        select: MANUFACTURING_COMMAND_SELECT,
      });
      if (retained !== null) {
        if (
          retained.actorId !== actor.id ||
          retained.department !== input.department ||
          retained.operation !== body.operation ||
          retained.payloadHash !== payloadHash
        )
          throw new ManufacturingCommandConflictError();
        return mapManufacturingCommandResult(retained, true);
      }
      const orders = await lockManufacturingOrders(tx, {
        actor,
        department: input.department,
        orders: body.orders,
      });
      requireSelection(orders, actor, input.department, body.operation);
      const context: WorkContext = {
        department: input.department,
        operation: body.operation,
        commandId: body.commandId,
        occurredAt: new Date(),
      };
      const { outcome, events } = await this.applyOrders(tx, orders, context);
      return this.persistCommand(tx, {
        actor,
        context,
        payloadHash,
        outcome,
        events,
      });
    });
  }

  async observe(
    actorId: string,
    commandId: string,
  ): Promise<ManufacturingCommandData> {
    const identity = salesUuidSchema.parse(commandId);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      assertBusinessAuthority(actor);
      await commandLock(tx, identity);
      const retained = await tx.manufacturingCommand.findUnique({
        where: { commandId: identity },
        select: MANUFACTURING_COMMAND_SELECT,
      });
      if (retained === null || retained.actorId !== actor.id)
        throw new ManufacturingCommandNotFoundError();
      const department = manufacturingDepartmentSchema.safeParse(
        retained.department,
      );
      if (!department.success)
        throw new InternalServerError(
          "A manufacturing command has an unsupported source department.",
        );
      assertBusinessAuthority(actor, department.data);
      return mapManufacturingCommandResult(retained, true);
    });
  }

  private async lockActor(
    tx: Prisma.TransactionClient,
    actorId: string,
  ): Promise<AuthorityAccount> {
    await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
    await lockAccountRows(tx, [actorId], "read");
    return loadIdentityAccount(tx, actorId);
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
          throw new ManufacturingTransactionConflictError();
        if (
          isSalesTransactionConflict(error) ||
          isManufacturingCommandIdConflict(error)
        ) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new ManufacturingTransactionConflictError();
        }
        throw error;
      }
    }
  }

  private async applyOrders(
    tx: Prisma.TransactionClient,
    orders: readonly LockedManufacturingOrder[],
    context: WorkContext,
  ): Promise<{
    outcome: ManufacturingCommandOutcome;
    events: PendingPieceEvent[];
  }> {
    const events: PendingPieceEvent[] = [],
      outcome: ManufacturingCommandOutcome = { orders: [] };
    for (const order of orders) {
      const pieces: ManufacturingPieceOutcome[] = [];
      for (const record of order.pieces) {
        const accepted = await this.applyPiece(tx, record, context);
        pieces.push(accepted.outcome);
        events.push(accepted.event);
      }
      const changed = await tx.salesDraft.updateMany({
        where: { id: order.id, status: "SUBMITTED", version: order.version },
        data: { version: { increment: 1 }, updatedAt: context.occurredAt },
      });
      if (changed.count !== 1) throw new OrderVersionConflictError();
      outcome.orders.push({
        eventId: randomUUID(),
        orderId: order.id,
        beforeVersion: order.version,
        afterVersion: order.version + 1,
        pieces,
      });
    }
    return { outcome, events };
  }

  private async persistCommand(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthorityAccount;
      context: WorkContext;
      payloadHash: string;
      outcome: ManufacturingCommandOutcome;
      events: PendingPieceEvent[];
    },
  ): Promise<ManufacturingCommandData> {
    const { actor, context, payloadHash, outcome, events } = input;
    const parsed = manufacturingCommandOutcomeSchema.safeParse(outcome);
    if (!parsed.success)
      throw new InternalServerError(
        "A manufacturing command produced invalid safe outcome facts.",
      );
    const stored = await tx.manufacturingCommand.create({
      data: {
        commandId: context.commandId,
        operation: context.operation,
        department: context.department,
        actorId: actor.id,
        actorFullName: actor.fullName,
        actorRole: actor.role,
        actorDepartment: actor.department,
        payloadHash,
        outcome: parsed.data,
        occurredAt: context.occurredAt,
      },
      select: MANUFACTURING_COMMAND_SELECT,
    });
    const orderRows = await tx.manufacturingCommandOrder.createMany({
      data: parsed.data.orders.map((order) => ({
        commandId: context.commandId,
        orderId: order.orderId,
        eventId: order.eventId,
        beforeVersion: order.beforeVersion,
        afterVersion: order.afterVersion,
        pieceIds: order.pieces.map((piece) => piece.pieceId),
      })),
    });
    const eventRows = await tx.manufacturingPieceEvent.createMany({
      data: events,
    });
    if (
      orderRows.count !== parsed.data.orders.length ||
      eventRows.count !== events.length
    )
      throw new InternalServerError(
        "A manufacturing command did not retain every selected event.",
      );
    return mapManufacturingCommandResult(stored, false);
  }

  private async applyPiece(
    tx: Prisma.TransactionClient,
    record: ManufacturingPieceContextRecord,
    context: WorkContext,
  ): Promise<{ outcome: ManufacturingPieceOutcome; event: PendingPieceEvent }> {
    const { piece, visit } = record;
    if (visit === null)
      throw new InternalServerError("Validated work has no current visit.");
    const eventId = randomUUID();
    let nextVisitId: string | null = null;
    const stage =
      context.operation === "COMPLETE_TRANSFER"
        ? nextManufacturingStage(context.department)
        : context.department;
    const workState =
      context.operation === "COMPLETE_TRANSFER" ? "INCOMING" : "IN_PROGRESS";
    if (context.operation === "RECEIVE_AND_START") {
      const started = await tx.manufacturingWorkVisit.updateMany({
        where: {
          id: visit.id,
          orderId: piece.orderId,
          pieceId: piece.id,
          endedAt: null,
          startedAt: null,
          receivedAt: visit.receivedAt,
        },
        data: {
          ...(visit.receivedAt === null
            ? {
                receivedAt: context.occurredAt,
                receivedCommandId: context.commandId,
              }
            : {}),
          startedAt: context.occurredAt,
          startedCommandId: context.commandId,
        },
      });
      if (started.count !== 1) throw new ManufacturingSelectionConflictError();
      await this.changePiece(tx, record, {
        stage,
        workState,
        currentWorkVisitId: visit.id,
      });
    } else if (context.operation === "COMPLETE_TRANSFER") {
      const ended = await tx.manufacturingWorkVisit.updateMany({
        where: {
          id: visit.id,
          orderId: piece.orderId,
          pieceId: piece.id,
          endedAt: null,
        },
        data: {
          endedAt: context.occurredAt,
          endReason: "TRANSFERRED",
          endManufacturingCommandId: context.commandId,
          endApprovalCommandId: null,
          destination: stage,
        },
      });
      if (ended.count !== 1) throw new ManufacturingSelectionConflictError();
      await this.changePiece(tx, record, {
        stage,
        workState,
        currentWorkVisitId: null,
      });
      if (context.department === "CUTTING")
        nextVisitId = (
          await openManufacturingVisit(tx, {
            orderId: piece.orderId,
            pieceId: piece.id,
            target: "PRODUCTION",
            origin: { kind: "DEPARTMENT_TRANSFER", transferEventId: eventId },
            occurredAt: context.occurredAt,
          })
        ).visitId;
    }
    return {
      outcome: {
        pieceId: piece.id,
        visitId: visit.id,
        nextVisitId,
        stage,
        workState,
      },
      event: {
        id: eventId,
        commandId: context.commandId,
        orderId: piece.orderId,
        pieceId: piece.id,
        visitId: visit.id,
        operation: context.operation,
        beforeStage: piece.stage,
        beforeWorkState: piece.workState,
        afterStage: stage,
        afterWorkState: workState,
      },
    };
  }

  private async changePiece(
    tx: Prisma.TransactionClient,
    record: ManufacturingPieceContextRecord,
    after: {
      stage: ManufacturingPieceOutcome["stage"];
      workState: ManufacturingPieceOutcome["workState"];
      currentWorkVisitId: string | null;
    },
  ): Promise<void> {
    const piece = record.piece;
    const changed = await tx.salesOrderPiece.updateMany({
      where: {
        id: piece.id,
        orderId: piece.orderId,
        stage: piece.stage,
        workState: piece.workState,
        currentWorkVisitId: piece.currentWorkVisitId,
        issueId: null,
        receivedAt: null,
        cancelledAt: null,
        cancellationReason: null,
      },
      data: after,
    });
    if (changed.count !== 1) throw new ManufacturingSelectionConflictError();
  }
}
