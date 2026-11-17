import type { OrderCancellationSource } from "../approval/order-cancellation.writer.js";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { MANUFACTURING_PHYSICAL_PIECE_SELECT } from "../manufacturing/manufacturing.mapper.js";
import { QualitySelectionConflictError } from "./quality.errors.js";
import type { QualityArrivalRecord } from "./quality.types.js";

type EndInput = Readonly<{
  orderId: string;
  pieceId: string;
  approvalCommandId: string;
  occurredAt: Date;
}>;
export const startQualityVisit = async (
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orderId: string;
    pieceId: string;
    commandId: string;
    occurredAt: Date;
    productionArrival: QualityArrivalRecord | null;
    correctionId: string | null;
  }>,
): Promise<{ visitId: string }> => {
  const piece = await tx.salesOrderPiece.findFirst({
    where: { id: input.pieceId, orderId: input.orderId },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  const open = await tx.qualityWorkVisit.findFirst({
    where: { pieceId: input.pieceId, orderId: input.orderId, endedAt: null },
    select: { id: true },
  });
  if (
    piece === null ||
    piece.stage !== "QUALITY" ||
    piece.workState !== "INCOMING" ||
    piece.issueId !== null ||
    piece.receivedAt !== null ||
    piece.cancelledAt !== null ||
    piece.cancellationReason !== null ||
    piece.currentWorkVisitId !== null ||
    open !== null
  )
    throw new QualitySelectionConflictError();
  const previous = await tx.qualityWorkVisit.aggregate({
    where: { pieceId: input.pieceId, orderId: input.orderId },
    _max: { sequence: true },
  });
  const sequence = (previous._max.sequence ?? 0) + 1;
  if (sequence > 2147483647) throw new QualitySelectionConflictError();
  const arrival = input.productionArrival;
  if (
    arrival !== null &&
    (arrival.pieceId !== input.pieceId || arrival.orderId !== input.orderId)
  )
    throw new InternalServerError(
      "The quality arrival does not match its selected piece.",
    );
  const visit = await tx.qualityWorkVisit.create({
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      pieceId: input.pieceId,
      sequence,
      originKind: arrival === null ? "LEGACY_BASELINE" : "PRODUCTION_ARRIVAL",
      sourceProductionEventId: arrival?.eventId ?? null,
      sourceCorrectionId: input.correctionId,
      enteredAt: arrival?.occurredAt ?? null,
      receivedAt: input.occurredAt,
      startedAt: input.occurredAt,
      startedCommandId: input.commandId,
      legacyUnknownStart: false,
    },
    select: { id: true },
  });
  return { visitId: visit.id };
};
export const endQualityVisitForIssue = async (
  tx: Prisma.TransactionClient,
  input: EndInput,
): Promise<{ visitId: string | null }> => {
  const piece = await tx.salesOrderPiece.findFirst({
    where: { id: input.pieceId, orderId: input.orderId },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  if (
    piece === null ||
    piece.workState !== "BLOCKED" ||
    piece.issueId === null ||
    piece.receivedAt !== null ||
    piece.cancelledAt !== null
  )
    throw new InternalServerError(
      "The approval report has not established its physical hold.",
    );
  const visit = await tx.qualityWorkVisit.findFirst({
    where: { pieceId: input.pieceId, orderId: input.orderId, endedAt: null },
    select: { id: true },
  });
  const issue = await tx.manufacturingIssue.findFirst({
    where: {
      id: piece.issueId,
      pieceId: input.pieceId,
      orderId: input.orderId,
      reportedCommandId: input.approvalCommandId,
    },
    select: { sourceStage: true, sourceWorkState: true },
  });
  if (issue === null || issue.sourceStage !== piece.stage)
    throw new InternalServerError(
      "The physical hold has no matching approval report.",
    );
  const needsVisit =
    piece.stage === "QUALITY" && issue.sourceWorkState === "IN_PROGRESS";
  if (!needsVisit) {
    if (visit !== null)
      throw new InternalServerError(
        "Unstarted or non-quality work has an open quality visit.",
      );
    return { visitId: null };
  }
  if (visit === null)
    throw new InternalServerError(
      "Held quality inspection has no matching open visit.",
    );
  const ended = await tx.qualityWorkVisit.updateMany({
    where: {
      id: visit.id,
      orderId: input.orderId,
      pieceId: input.pieceId,
      endedAt: null,
    },
    data: {
      endedAt: input.occurredAt,
      endReason: "ISSUE_REPORTED",
      endApprovalCommandId: input.approvalCommandId,
    },
  });
  if (ended.count !== 1) throw new QualitySelectionConflictError();
  return { visitId: visit.id };
};
export const cancelQualityCorrection = async (
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orderId: string;
    pieceId: string;
    source: OrderCancellationSource;
    occurredAt: Date;
  }>,
): Promise<void> => {
  const piece = await tx.salesOrderPiece.findFirst({
    where: { id: input.pieceId, orderId: input.orderId },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  if (
    piece === null ||
    piece.stage !== "CANCELLED" ||
    piece.workState !== "BLOCKED" ||
    piece.cancelledAt === null ||
    piece.cancelledAt.getTime() !== input.occurredAt.getTime() ||
    piece.cancellationReason === null ||
    (input.source.kind === "approval" && piece.receivedAt !== null) ||
    piece.issueId !== null
  )
    throw new InternalServerError(
      "The approval command has not established its cancellation.",
    );
  const openVisit = await tx.qualityWorkVisit.findFirst({
    where: { pieceId: input.pieceId, orderId: input.orderId, endedAt: null },
    select: { id: true },
  });
  if (openVisit !== null) {
    if (input.source.kind !== "administration")
      throw new InternalServerError(
        "Cancelled work retains an open quality visit.",
      );
    const ended = await tx.qualityWorkVisit.updateMany({
      where: {
        id: openVisit.id,
        orderId: input.orderId,
        pieceId: input.pieceId,
        endedAt: null,
        endQualityEventId: null,
        endApprovalCommandId: null,
        endAdministrationCommandId: null,
      },
      data: {
        endedAt: input.occurredAt,
        endReason: "CANCELLED",
        endAdministrationCommandId: input.source.commandId,
      },
    });
    if (ended.count !== 1) throw new QualitySelectionConflictError();
  }
  const cycle = await tx.qualityCorrectionCycle.findFirst({
    where: { pieceId: input.pieceId, orderId: input.orderId, state: "OPEN" },
    select: { id: true },
  });
  if (cycle === null) return;
  const changed = await tx.qualityCorrectionCycle.updateMany({
    where: {
      id: cycle.id,
      orderId: input.orderId,
      pieceId: input.pieceId,
      state: "OPEN",
      resolutionQualityEventId: null,
      resolutionApprovalCommandId: null,
      resolutionAdministrationCommandId: null,
    },
    data: {
      state: "CANCELLED",
      resolvedAt: input.occurredAt,
      resolutionApprovalCommandId:
        input.source.kind === "approval" ? input.source.commandId : null,
      resolutionAdministrationCommandId:
        input.source.kind === "administration" ? input.source.commandId : null,
    },
  });
  if (changed.count !== 1) throw new QualitySelectionConflictError();
};
