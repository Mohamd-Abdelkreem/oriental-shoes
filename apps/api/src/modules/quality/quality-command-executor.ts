import type { ApprovalIssueReportResult } from "../approval/approval.types.js";
import { createHash, randomUUID } from "node:crypto";
import {
  qualityCommandBodySchema,
  qualityCommandOutcomeSchema,
  salesUuidSchema,
  type QualityCommandBody,
  type QualityCommandData,
  type QualityCommandOutcome,
  type QualityPieceOutcome,
  type QualityInspectionDecision,
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
import { isSalesLockTimeout } from "../sales-commands/sales-command.errors.js";
import {
  advanceApprovalOrderVersion,
  lockApprovalCommandIds,
  persistApprovalCommand,
} from "../approval/approval-command.writer.js";
import { hashApprovalCommandIntent } from "../approval/approval-command-executor.js";
import { writeApprovalIssueReport } from "../approval/approval-issue-report.writer.js";
import { openQualityCorrectionVisit } from "../manufacturing/manufacturing-work.lifecycle.js";
import {
  isQualityCommandIdConflict,
  isQualityTransactionConflict,
  QualityCommandConflictError,
  QualityCommandNotFoundError,
  QualitySelectionConflictError,
  QualityTransactionConflictError,
  QualityWorkUnchangedError,
} from "./quality.errors.js";
import {
  QUALITY_COMMAND_SELECT,
  mapQualityCommandResult,
} from "./quality.mapper.js";
import { lockQualityOrders } from "./quality.queries.js";
import {
  canonicalQualityOrders,
  isCurrentQualityWork,
} from "./quality.rules.js";
import { startQualityVisit } from "./quality-work.lifecycle.js";
import type {
  CanonicalQualityOrder,
  LockedQualityOrder,
  QualityCommandExecution,
  QualityPieceContextRecord,
  PendingQualityPieceEvent,
} from "./quality.types.js";

export const hashQualityCommandIntent = (input: QualityCommandBody): string => {
  const body = qualityCommandBodySchema.parse(input);
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation: body.operation,
        orders: canonicalQualityOrders(body),
        ...(body.operation === "REPORT_ISSUES"
          ? { reason: body.reason, notes: body.notes }
          : {}),
      }),
    )
    .digest("hex");
};
const commandLock = async (
  tx: Prisma.TransactionClient,
  commandId: string,
): Promise<void> => {
  const prefix = createHash("sha256")
    .update("p06-quality-command:" + commandId)
    .digest("hex")
    .slice(0, 16);
  const key = BigInt.asIntN(64, BigInt("0x" + prefix)).toString();
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
};
const parseBody = (body: QualityCommandBody): QualityCommandBody => {
  const parsed = qualityCommandBodySchema.safeParse(body);
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
  orders: readonly LockedQualityOrder[],
  actor: AuthorityAccount,
  operation: QualityCommandBody["operation"],
): void => {
  for (const order of orders)
    for (const record of order.pieces) {
      if (!isCurrentQualityWork(record))
        throw new QualitySelectionConflictError();
      if (
        operation !== "REPORT_ISSUES" &&
        record.piece.workState !==
          (operation === "RECEIVE_AND_START" ? "INCOMING" : "IN_PROGRESS")
      )
        throw new QualitySelectionConflictError();
      if (
        record.piece.workState === "IN_PROGRESS" &&
        (record.visit === null ||
          record.visit.sourceCorrectionId !== (record.correction?.id ?? null))
      )
        throw new QualitySelectionConflictError();
      if (operation === "CONTINUE" && record.lastAction?.actorId === actor.id)
        throw new QualityWorkUnchangedError();
    }
};
type WorkContext = Readonly<{
  actor: AuthorityAccount;
  body: QualityCommandBody;
  occurredAt: Date;
  childIds: ReadonlyMap<string, string>;
  nextCycles: ReadonlyMap<string, number>;
}>;
type PieceResult = {
  outcome: QualityPieceOutcome;
  event: PendingQualityPieceEvent;
};
export class QualityCommandExecutor {
  constructor(private readonly database: DatabaseClient) {}
  async execute(input: QualityCommandExecution): Promise<QualityCommandData> {
    const body = parseBody(input.body),
      payloadHash = hashQualityCommandIntent(body),
      groups = canonicalQualityOrders(body),
      childIds = new Map<string, string>();
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, input.actorId);
      await commandLock(tx, body.commandId);
      const retained = await tx.qualityCommand.findUnique({
        where: { commandId: body.commandId },
        select: QUALITY_COMMAND_SELECT,
      });
      if (retained !== null) {
        if (
          retained.actorId !== actor.id ||
          retained.operation !== body.operation ||
          retained.payloadHash !== payloadHash
        )
          throw new QualityCommandConflictError();
        return mapQualityCommandResult(retained, true);
      }
      if (body.operation === "REPORT_ISSUES") {
        if (childIds.size === 0)
          for (const group of groups)
            for (const id of group.pieceIds) childIds.set(id, randomUUID());
        await lockApprovalCommandIds(tx, [...childIds.values()]);
      }
      const orders = await lockQualityOrders(tx, {
        actor,
        operation: body.operation,
        orders: groups,
      });
      requireSelection(orders, actor, body.operation);
      const nextCycles = await this.nextCycles(tx, groups);
      const context = {
        actor,
        body,
        occurredAt: new Date(),
        childIds,
        nextCycles,
      };
      const outcome: QualityCommandOutcome = { orders: [] },
        events: PendingQualityPieceEvent[] = [];
      for (const order of orders) {
        const group = groups.find((g) => g.orderId === order.id);
        if (group === undefined)
          throw new InternalServerError(
            "A locked quality selection lost its confirmed group.",
          );
        const applied = await this.applyOrder(tx, order, group, context);
        outcome.orders.push(applied.outcome);
        events.push(...applied.events);
      }
      return this.persist(tx, {
        context,
        payloadHash,
        outcome,
        events,
        groups,
      });
    });
  }
  async observe(
    actorId: string,
    commandId: string,
  ): Promise<QualityCommandData> {
    const identity = salesUuidSchema.parse(commandId);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      await commandLock(tx, identity);
      const retained = await tx.qualityCommand.findUnique({
        where: { commandId: identity },
        select: QUALITY_COMMAND_SELECT,
      });
      if (retained === null || retained.actorId !== actor.id)
        throw new QualityCommandNotFoundError();
      return mapQualityCommandResult(retained, true);
    });
  }
  private async lockActor(
    tx: Prisma.TransactionClient,
    actorId: string,
  ): Promise<AuthorityAccount> {
    await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
    await lockAccountRows(tx, [actorId], "read");
    const actor = await loadIdentityAccount(tx, actorId);
    assertBusinessAuthority(actor, "QUALITY");
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
          throw new QualityTransactionConflictError();
        if (
          isQualityTransactionConflict(error) ||
          isQualityCommandIdConflict(error)
        ) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new QualityTransactionConflictError();
        }
        throw error;
      }
    }
  }
  private async nextCycles(
    tx: Prisma.TransactionClient,
    groups: readonly CanonicalQualityOrder[],
  ): Promise<ReadonlyMap<string, number>> {
    const rejected = groups.flatMap(
      (g) =>
        g.decisions
          ?.filter((d) => d.decision === "REJECT")
          .map((d) => d.pieceId) ?? [],
    );
    if (rejected.length === 0) return new Map();
    const previous = await tx.$queryRaw<
      Array<{ pieceId: string; cycle: number }>
    >(
      Prisma.sql`SELECT DISTINCT ON(piece_id) piece_id AS "pieceId",cycle FROM quality_correction_cycles WHERE piece_id IN (${Prisma.join(rejected.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY piece_id,cycle DESC`,
    );
    const maxima = new Map(previous.map((c) => [c.pieceId, c.cycle]));
    const next = new Map(rejected.map((id) => [id, (maxima.get(id) ?? 0) + 1]));
    if ([...next.values()].some((cycle) => cycle > 2147483647))
      throw new QualitySelectionConflictError();
    return next;
  }
  private async applyOrder(
    tx: Prisma.TransactionClient,
    order: LockedQualityOrder,
    group: CanonicalQualityOrder,
    context: WorkContext,
  ): Promise<{
    outcome: QualityCommandOutcome["orders"][number];
    events: PendingQualityPieceEvent[];
  }> {
    const pieces: QualityPieceOutcome[] = [],
      events: PendingQualityPieceEvent[] = [];
    let currentRoot: ApprovalIssueReportResult["root"] = order.root;
    for (const [index, record] of order.pieces.entries()) {
      if (context.body.operation === "REPORT_ISSUES") {
        const applied = await this.reportPiece(tx, {
          order,
          record,
          root: currentRoot,
          ordinal: index + 1,
          context,
        });
        currentRoot = applied.root;
        pieces.push(applied.outcome);
        events.push(applied.event);
      } else {
        const applied = await this.applyWorkPiece(
          tx,
          record,
          group,
          context,
          order.version,
        );
        pieces.push(applied.outcome);
        events.push(applied.event);
      }
    }
    const afterVersion =
      context.body.operation === "REPORT_ISSUES"
        ? order.version + pieces.length
        : await advanceApprovalOrderVersion(tx, {
            orderId: order.id,
            expectedVersion: order.version,
            occurredAt: context.occurredAt,
          });
    return {
      outcome: {
        eventId: randomUUID(),
        orderId: order.id,
        beforeVersion: order.version,
        afterVersion,
        pieces,
        packingGroupId: group.packing === null ? null : randomUUID(),
      },
      events,
    };
  }
  private async reportPiece(
    tx: Prisma.TransactionClient,
    input: {
      order: LockedQualityOrder;
      record: QualityPieceContextRecord;
      root: ApprovalIssueReportResult["root"];
      ordinal: number;
      context: WorkContext;
    },
  ): Promise<PieceResult & { root: ApprovalIssueReportResult["root"] }> {
    const { order, record, root, ordinal, context } = input,
      body = context.body;
    if (body.operation !== "REPORT_ISSUES")
      throw new InternalServerError(
        "A report writer requires its confirmed operation.",
      );
    const commandId = context.childIds.get(record.piece.id);
    if (commandId === undefined)
      throw new InternalServerError("A selected report has no child identity.");
    const expectedVersion = order.version + ordinal - 1;
    const written = await writeApprovalIssueReport(tx, {
      actor: context.actor,
      root,
      pieceId: record.piece.id,
      commandId,
      expectedVersion,
      reason: body.reason,
      notes: body.notes,
      occurredAt: context.occurredAt,
    });
    const result = written.command;
    await persistApprovalCommand(tx, {
      actor: context.actor,
      occurredAt: context.occurredAt,
      result,
      execution: {
        actorId: context.actor.id,
        commandId,
        operation: "REPORT_ISSUE",
        orderId: order.id,
        pieceId: record.piece.id,
        expectedVersion,
        payloadHash: hashApprovalCommandIntent({
          operation: "REPORT_ISSUE",
          orderId: order.id,
          pieceId: record.piece.id,
          expectedVersion,
          payload: {
            commandId,
            expectedVersion,
            reason: body.reason,
            notes: body.notes,
          },
        }),
      },
    });
    await tx.qualityApprovalReport.create({
      data: {
        commandId: body.commandId,
        orderId: order.id,
        pieceId: record.piece.id,
        approvalCommandId: commandId,
        ordinal,
      },
    });
    const visitId =
      record.piece.workState === "IN_PROGRESS"
        ? (record.visit?.id ?? null)
        : null;
    return {
      root: written.root,
      outcome: {
        pieceId: record.piece.id,
        visitId,
        decision: null,
        stage: "QUALITY",
        workState: "BLOCKED",
        correctionId: record.correction?.id ?? null,
        issueId: result.issueId,
      },
      event: {
        id: randomUUID(),
        commandId: body.commandId,
        orderId: order.id,
        pieceId: record.piece.id,
        visitId,
        decision: null,
        correctionId: record.correction?.id ?? null,
        issueId: result.issueId,
        approvalCommandId: commandId,
        beforeStage: record.piece.stage,
        beforeWorkState: record.piece.workState,
        afterStage: "QUALITY",
        afterWorkState: "BLOCKED",
      },
    };
  }
  private async applyWorkPiece(
    tx: Prisma.TransactionClient,
    record: QualityPieceContextRecord,
    group: CanonicalQualityOrder,
    context: WorkContext,
    expectedVersion: number,
  ): Promise<PieceResult> {
    const { piece } = record,
      eventId = randomUUID();
    let visitId = record.visit?.id ?? null,
      correctionId = record.correction?.id ?? null;
    let decision: QualityInspectionDecision | null = null,
      stage: QualityPieceOutcome["stage"] = "QUALITY";
    if (context.body.operation === "RECEIVE_AND_START") {
      visitId = (
        await startQualityVisit(tx, {
          orderId: piece.orderId,
          pieceId: piece.id,
          commandId: context.body.commandId,
          occurredAt: context.occurredAt,
          productionArrival: record.productionArrival,
          correctionId,
        })
      ).visitId;
      await this.changePiece(tx, record, {
        stage: "QUALITY",
        workState: "IN_PROGRESS",
      });
    } else if (context.body.operation === "INSPECT") {
      decision = group.decisions?.find((d) => d.pieceId === piece.id) ?? null;
      if (decision === null || visitId === null)
        throw new InternalServerError(
          "A validated inspection lost its decision or visit.",
        );
      stage = decision.decision === "ACCEPT" ? "WAREHOUSE" : decision.target;
      await this.endInspection(tx, {
        record,
        eventId,
        decision: decision.decision,
        occurredAt: context.occurredAt,
      });
      if (decision.decision === "REJECT") {
        const next = context.nextCycles.get(piece.id);
        if (next === undefined)
          throw new InternalServerError("A rejection has no next cycle.");
        correctionId = randomUUID();
        await tx.qualityCorrectionCycle.create({
          data: {
            id: correctionId,
            orderId: piece.orderId,
            pieceId: piece.id,
            cycle: next,
            rejectionEventId: eventId,
            target: decision.target,
            reason: decision.reason,
            instructions: decision.instructions,
            state: "OPEN",
          },
        });
        await openQualityCorrectionVisit(tx, {
          actor: context.actor,
          orderId: piece.orderId,
          pieceId: piece.id,
          expectedVersion,
          target: decision.target,
          correctionId,
          correctionCycle: next,
          instructions: decision.instructions,
          occurredAt: context.occurredAt,
        });
      } else
        await this.changePiece(tx, record, {
          stage: "WAREHOUSE",
          workState: "INCOMING",
        });
    }
    if (visitId === null)
      throw new InternalServerError("Validated quality work has no visit.");
    const workState =
      context.body.operation === "INSPECT" ? "INCOMING" : "IN_PROGRESS";
    return {
      outcome: {
        pieceId: piece.id,
        visitId,
        decision: decision?.decision ?? null,
        stage,
        workState,
        correctionId,
        issueId: null,
      },
      event: {
        id: eventId,
        commandId: context.body.commandId,
        orderId: piece.orderId,
        pieceId: piece.id,
        visitId,
        decision: decision?.decision ?? null,
        correctionId,
        issueId: null,
        approvalCommandId: null,
        beforeStage: piece.stage,
        beforeWorkState: piece.workState,
        afterStage: stage,
        afterWorkState: workState,
      },
    };
  }
  private async endInspection(
    tx: Prisma.TransactionClient,
    input: {
      record: QualityPieceContextRecord;
      eventId: string;
      decision: "ACCEPT" | "REJECT";
      occurredAt: Date;
    },
  ): Promise<void> {
    const { record, eventId, decision, occurredAt } = input;
    if (record.visit === null)
      throw new InternalServerError("An inspection has no visit.");
    const ended = await tx.qualityWorkVisit.updateMany({
      where: {
        id: record.visit.id,
        pieceId: record.piece.id,
        orderId: record.piece.orderId,
        endedAt: null,
      },
      data: {
        endedAt: occurredAt,
        endReason:
          decision === "ACCEPT" ? "INSPECT_ACCEPTED" : "INSPECT_REJECTED",
        endQualityEventId: eventId,
      },
    });
    if (ended.count !== 1) throw new QualitySelectionConflictError();
    if (record.correction !== null) {
      const resolved = await tx.qualityCorrectionCycle.updateMany({
        where: {
          id: record.correction.id,
          pieceId: record.piece.id,
          orderId: record.piece.orderId,
          state: "OPEN",
        },
        data: {
          state: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
          resolvedAt: occurredAt,
          resolutionQualityEventId: eventId,
        },
      });
      if (resolved.count !== 1) throw new QualitySelectionConflictError();
    }
  }
  private async changePiece(
    tx: Prisma.TransactionClient,
    record: QualityPieceContextRecord,
    after: {
      stage: "QUALITY" | "WAREHOUSE";
      workState: "INCOMING" | "IN_PROGRESS";
    },
  ): Promise<void> {
    const changed = await tx.salesOrderPiece.updateMany({
      where: {
        id: record.piece.id,
        orderId: record.piece.orderId,
        stage: "QUALITY",
        workState: record.piece.workState,
        issueId: null,
        receivedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        currentWorkVisitId: null,
      },
      data: after,
    });
    if (changed.count !== 1) throw new QualitySelectionConflictError();
  }
  private async persist(
    tx: Prisma.TransactionClient,
    input: {
      context: WorkContext;
      payloadHash: string;
      outcome: QualityCommandOutcome;
      events: PendingQualityPieceEvent[];
      groups: readonly CanonicalQualityOrder[];
    },
  ): Promise<QualityCommandData> {
    const { context, payloadHash, outcome, events, groups } = input,
      parsed = qualityCommandOutcomeSchema.safeParse(outcome);
    if (!parsed.success)
      throw new InternalServerError(
        "A quality command produced invalid safe outcome facts.",
      );
    const stored = await tx.qualityCommand.create({
      data: {
        commandId: context.body.commandId,
        operation: context.body.operation,
        actorId: context.actor.id,
        actorFullName: context.actor.fullName,
        actorRole: context.actor.role,
        actorDepartment: context.actor.department,
        payloadHash,
        outcome: parsed.data,
        occurredAt: context.occurredAt,
      },
      select: QUALITY_COMMAND_SELECT,
    });
    await tx.qualityCommandOrder.createMany({
      data: parsed.data.orders.map((o) => ({
        commandId: context.body.commandId,
        orderId: o.orderId,
        eventId: o.eventId,
        beforeVersion: o.beforeVersion,
        afterVersion: o.afterVersion,
        pieceIds: o.pieces.map((p) => p.pieceId),
        inspectorNote:
          groups.find((g) => g.orderId === o.orderId)?.inspectorNote ?? null,
      })),
    });
    await tx.qualityPieceEvent.createMany({ data: events });
    for (const order of parsed.data.orders) {
      const groupId = order.packingGroupId;
      if (groupId === null) continue;
      const packing = groups.find((g) => g.orderId === order.orderId)?.packing;
      if (packing === null || packing === undefined)
        throw new InternalServerError(
          "An accepted packing group has no confirmed carton text.",
        );
      await tx.qualityPackingGroup.create({
        data: {
          id: groupId,
          commandId: context.body.commandId,
          orderId: order.orderId,
          cartonCount: packing.cartonCount,
          cartonNumbers: packing.cartonNumbers,
        },
      });
      await tx.qualityPackingPiece.createMany({
        data: order.pieces
          .filter((p) => p.decision === "ACCEPT")
          .map((p) => ({
            groupId,
            commandId: context.body.commandId,
            orderId: order.orderId,
            pieceId: p.pieceId,
          })),
      });
    }
    return mapQualityCommandResult(stored, false);
  }
}
