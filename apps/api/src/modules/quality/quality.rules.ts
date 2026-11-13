import type {
  QualityCommandBody,
  QualityInspectionSummary,
  QualityPieceContext,
} from "@template/contracts";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type {
  CanonicalQualityOrder,
  QualityPieceContextRecord,
} from "./quality.types.js";

export const canonicalQualityOrders = (
  body: QualityCommandBody,
): CanonicalQualityOrder[] =>
  body.orders
    .map((group) => {
      if ("decisions" in group) {
        const decisions = [...group.decisions].sort((a, b) =>
          a.pieceId.localeCompare(b.pieceId),
        );
        return {
          orderId: group.orderId,
          expectedVersion: group.expectedVersion,
          pieceIds: decisions.map((decision) => decision.pieceId),
          decisions,
          inspectorNote: group.inspectorNote,
          packing: group.packing,
        };
      }
      return {
        orderId: group.orderId,
        expectedVersion: group.expectedVersion,
        pieceIds: [...group.pieceIds].sort(),
        decisions: null,
        inspectorNote: null,
        packing: null,
      };
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId));

export const isCurrentQualityWork = (
  record: QualityPieceContextRecord,
): boolean => {
  const { piece, visit } = record;
  if (
    record.orderStatus !== "APPROVED" ||
    piece.stage !== "QUALITY" ||
    piece.issueId !== null ||
    piece.receivedAt !== null ||
    piece.cancelledAt !== null ||
    piece.cancellationReason !== null ||
    piece.currentWorkVisitId !== null
  )
    return false;
  if (piece.workState === "INCOMING")
    return visit === null || visit.endedAt !== null;
  return (
    piece.workState === "IN_PROGRESS" &&
    visit !== null &&
    visit.endedAt === null &&
    visit.pieceId === piece.id &&
    visit.orderId === piece.orderId
  );
};
export const qualityActionHints = (
  record: QualityPieceContextRecord,
  actor: Pick<AuthorityAccount, "id" | "role" | "department">,
): QualityPieceContext["allowedActions"] => {
  const eligible =
    (actor.role === "ADMIN" || actor.department === "QUALITY") &&
    isCurrentQualityWork(record);
  const incoming = eligible && record.piece.workState === "INCOMING";
  const working = eligible && record.piece.workState === "IN_PROGRESS";
  return {
    canReceiveAndStart: incoming,
    canContinue: working && record.lastAction?.actorId !== actor.id,
    canInspect: working,
    canReportIssue: eligible,
  };
};
export const qualityQueueMembership = (
  record: QualityPieceContextRecord,
  latestInspection: QualityInspectionSummary | null,
) => {
  const notCancelled =
    record.piece.stage !== "CANCELLED" && record.piece.cancelledAt === null;
  const current = isCurrentQualityWork(record);
  return {
    incoming: current && record.piece.workState === "INCOMING",
    inspection: current && record.piece.workState === "IN_PROGRESS",
    accepted: notCancelled && latestInspection?.decision === "ACCEPT",
    corrections: notCancelled && record.correction?.state === "OPEN",
  };
};
