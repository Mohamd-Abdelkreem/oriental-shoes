import type {
  ManufacturingCommandBody,
  ManufacturingDepartment,
  ManufacturingDepartmentPath,
  ManufacturingPieceContext,
} from "@template/contracts";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type { ManufacturingPieceContextRecord } from "./manufacturing.types.js";

export const toManufacturingDepartment = (
  path: ManufacturingDepartmentPath,
): ManufacturingDepartment => (path === "cutting" ? "CUTTING" : "PRODUCTION");
export const nextManufacturingStage = (
  department: ManufacturingDepartment,
): "PRODUCTION" | "QUALITY" =>
  department === "CUTTING" ? "PRODUCTION" : "QUALITY";

export const canonicalManufacturingOrders = (
  orders: ManufacturingCommandBody["orders"],
): ManufacturingCommandBody["orders"] =>
  orders
    .map((order) => ({
      orderId: order.orderId,
      expectedVersion: order.expectedVersion,
      pieceIds: [...order.pieceIds].sort(),
    }))
    .sort((left, right) => left.orderId.localeCompare(right.orderId));

export const isCurrentManufacturingWork = (
  record: ManufacturingPieceContextRecord,
  department: ManufacturingDepartment,
): boolean => {
  const { piece, visit } = record;
  return (
    record.orderStatus === "APPROVED" &&
    piece.stage === department &&
    (piece.workState === "INCOMING" || piece.workState === "IN_PROGRESS") &&
    piece.issueId === null &&
    piece.receivedAt === null &&
    piece.cancelledAt === null &&
    piece.cancellationReason === null &&
    visit !== null &&
    visit.department === department &&
    visit.endedAt === null &&
    piece.currentWorkVisitId === visit.id &&
    visit.pieceId === piece.id &&
    visit.orderId === piece.orderId
  );
};

export const manufacturingActionHints = (
  record: ManufacturingPieceContextRecord,
  actor: Pick<AuthorityAccount, "id" | "role" | "department">,
  department: ManufacturingDepartment,
): ManufacturingPieceContext["allowedActions"] => {
  const eligible =
    (actor.role === "ADMIN" || actor.department === department) &&
    isCurrentManufacturingWork(record, department);
  const incoming = eligible && record.piece.workState === "INCOMING";
  const working = eligible && record.piece.workState === "IN_PROGRESS";
  return {
    canReceiveAndStart: incoming,
    canContinue: working && record.lastAction?.actorId !== actor.id,
    canCompleteTransfer: working,
    canReportIssue: eligible,
  };
};

export const isReturnedManufacturingWork = (
  record: ManufacturingPieceContextRecord,
  department: ManufacturingDepartment,
): boolean =>
  record.piece.stage !== "CANCELLED" &&
  ((record.issue !== null &&
    record.issue.id === record.piece.issueId &&
    record.issue.state !== "RESOLVED" &&
    record.issue.sourceDepartment === department) ||
    (isCurrentManufacturingWork(record, department) &&
      record.visit !== null &&
      (record.visit.originKind === "APPROVAL_RETURN" ||
        record.visit.originKind === "QUALITY_CORRECTION")));
