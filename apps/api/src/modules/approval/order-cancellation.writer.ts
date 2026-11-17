import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { cancelManufacturingVisit } from "../manufacturing/manufacturing-work.lifecycle.js";
import { cancelQualityCorrection } from "../quality/quality-work.lifecycle.js";

export type OrderCancellationSource = Readonly<{
  kind: "approval" | "administration";
  commandId: string;
}>;

// Caller owns authority, selected identities, root lock/version, money and status.
export const applyRetainedPieceCancellation = async (
  tx: Prisma.TransactionClient,
  input: Readonly<{
    orderId: string;
    pieceIds: readonly string[];
    reason: string;
    occurredAt: Date;
    source: OrderCancellationSource;
  }>,
): Promise<void> => {
  if (
    input.pieceIds.length === 0 ||
    new Set(input.pieceIds).size !== input.pieceIds.length
  )
    throw new InternalServerError(
      "Cancellation requires exact selected physical identities.",
    );
  for (const pieceId of input.pieceIds) {
    const piece = await tx.salesOrderPiece.findFirst({
      where: { id: pieceId, orderId: input.orderId },
      select: {
        stage: true,
        workState: true,
        issueId: true,
        currentWorkVisitId: true,
        receivedAt: true,
        cancelledAt: true,
        cancellationReason: true,
      },
    });
    if (
      piece === null ||
      piece.stage === "CANCELLED" ||
      piece.cancelledAt !== null ||
      piece.cancellationReason !== null
    )
      throw new InternalServerError("The selected cancellation state changed.");
    const changed = await tx.salesOrderPiece.updateMany({
      where: { id: pieceId, orderId: input.orderId, ...piece },
      data: {
        stage: "CANCELLED",
        workState: "BLOCKED",
        issueId: null,
        ...(input.source.kind === "administration"
          ? { currentWorkVisitId: null }
          : {}),
        cancelledAt: input.occurredAt,
        cancellationReason: input.reason,
      },
    });
    if (changed.count !== 1)
      throw new InternalServerError("The selected cancellation state changed.");
    const terminal = {
      orderId: input.orderId,
      pieceId,
      source: input.source,
      occurredAt: input.occurredAt,
    };
    await cancelManufacturingVisit(tx, terminal);
    await cancelQualityCorrection(tx, terminal);
    if (piece.issueId !== null) {
      const issue = await tx.manufacturingIssue.findFirst({
        where: {
          id: piece.issueId,
          orderId: input.orderId,
          pieceId,
          state: { not: "RESOLVED" },
        },
        select: { state: true, latestProposalId: true, resumeTarget: true },
      });
      if (issue === null)
        throw new InternalServerError(
          "Cancellation has no matching current issue.",
        );
      const resolved = await tx.manufacturingIssue.updateMany({
        where: {
          id: piece.issueId,
          orderId: input.orderId,
          pieceId,
          ...issue,
          resolvedAt: null,
          resolutionCommandId: null,
          resolutionAdministrationCommandId: null,
        },
        data: {
          state: "RESOLVED",
          resolvedAt: input.occurredAt,
          updatedAt: input.occurredAt,
          resolutionCommandId:
            input.source.kind === "approval" ? input.source.commandId : null,
          resolutionAdministrationCommandId:
            input.source.kind === "administration"
              ? input.source.commandId
              : null,
        },
      });
      if (resolved.count !== 1)
        throw new InternalServerError(
          "The selected issue changed during cancellation.",
        );
    }
  }
};
