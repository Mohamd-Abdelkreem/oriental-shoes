import { endQualityVisitForIssue } from "../quality/quality-work.lifecycle.js";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { DepartmentAccessDeniedError } from "../auth/auth.errors.js";
import {
  OrderNotFoundError,
  OrderStateConflictError,
} from "../sales-orders/sales-orders.errors.js";
import { interruptManufacturingVisit } from "../manufacturing/manufacturing-work.lifecycle.js";
import { ApprovalIssueConflictError } from "./approval.errors.js";
import {
  APPROVAL_FACTS_ORDER_SELECT,
  CURRENT_ISSUE_SELECT,
  mapApprovalFacts,
} from "./approval.mapper.js";
import { advanceApprovalOrderVersion } from "./approval-command.writer.js";
import type {
  ApprovalIssueReportResult,
  ApprovalIssueReportWrite,
} from "./approval.types.js";

export const writeApprovalIssueReport = async (
  tx: Prisma.TransactionClient,
  input: ApprovalIssueReportWrite,
): Promise<ApprovalIssueReportResult> => {
  const { root, actor, pieceId, occurredAt } = input;
  const orderId = root.id;
  const selected = root.pieces.find((piece) => piece.id === pieceId);
  if (selected === undefined) throw new OrderNotFoundError();
  const physical = selected.orderPiece;
  if (physical === null)
    throw new InternalServerError("A submitted piece has no physical record.");
  if (
    root.order?.status !== "APPROVED" ||
    (physical.stage !== "CUTTING" &&
      physical.stage !== "PRODUCTION" &&
      physical.stage !== "QUALITY") ||
    physical.receivedAt !== null ||
    physical.cancelledAt !== null
  )
    throw new OrderStateConflictError();
  if (actor.role !== "ADMIN" && actor.department !== physical.stage)
    throw new DepartmentAccessDeniedError();
  if (physical.issueId !== null) throw new ApprovalIssueConflictError();
  if (physical.workState !== "INCOMING" && physical.workState !== "IN_PROGRESS")
    throw new OrderStateConflictError();
  const beforeFacts = mapApprovalFacts(root, actor, {
    returnNotes: null,
    pieceId,
    issue: null,
  });
  const last = await tx.manufacturingIssue.findFirst({
    where: { pieceId },
    orderBy: { cycle: "desc" },
    select: { cycle: true },
  });
  if (last !== null && last.cycle >= 2147483647)
    throw new ApprovalIssueConflictError();
  const issueId = randomUUID();
  const issue = await tx.manufacturingIssue.create({
    data: {
      id: issueId,
      orderId,
      pieceId,
      cycle: (last?.cycle ?? 0) + 1,
      state: "APPROVAL_REVIEW",
      sourceDepartment: physical.stage,
      sourceStage: physical.stage,
      sourceWorkState: physical.workState,
      reporterId: actor.id,
      reporterFullName: actor.fullName,
      reporterRole: actor.role,
      reporterDepartment: actor.department,
      reason: input.reason,
      notes: input.notes,
      reportedAt: occurredAt,
      updatedAt: occurredAt,
      reportedCommandId: input.commandId,
    },
    select: CURRENT_ISSUE_SELECT,
  });
  await tx.salesOrderPiece.update({
    where: { id: pieceId },
    data: { workState: "BLOCKED", issueId },
  });
  await interruptManufacturingVisit(tx, {
    orderId,
    pieceId,
    approvalCommandId: input.commandId,
    occurredAt,
  });
  await endQualityVisitForIssue(tx, {
    orderId,
    pieceId,
    approvalCommandId: input.commandId,
    occurredAt,
  });
  const orderVersion = await advanceApprovalOrderVersion(tx, {
    orderId,
    expectedVersion: input.expectedVersion,
    occurredAt,
  });
  const after = await tx.salesDraft.findUniqueOrThrow({
    where: { id: orderId },
    select: APPROVAL_FACTS_ORDER_SELECT,
  });
  return {
    root: after,
    command: {
      pieceId,
      issueId,
      proposalId: null,
      decision: null,
      decisionNotes: null,
      beforeFacts,
      afterFacts: mapApprovalFacts(after, actor, {
        returnNotes: null,
        pieceId,
        issue,
      }),
      outcome: {
        orderId,
        orderVersion,
        orderStatus: "APPROVED",
        pieceId,
        pieceStage: physical.stage,
        pieceWorkState: "BLOCKED",
        issueId,
        issueState: "APPROVAL_REVIEW",
        proposalId: null,
      },
    },
  };
};
