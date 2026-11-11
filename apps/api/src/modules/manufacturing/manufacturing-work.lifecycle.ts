import { randomUUID } from "node:crypto";
import {
  nonEmptyBoundedString,
  salesUuidSchema,
  salesVersionSchema,
  type ManufacturingDepartment,
} from "@template/contracts";
import { Department, type Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { OrderVersionConflictError } from "../sales-orders/sales-orders.errors.js";
import { ManufacturingSelectionConflictError } from "./manufacturing.errors.js";
import { MANUFACTURING_PHYSICAL_PIECE_SELECT } from "./manufacturing.mapper.js";
import type {
  ApprovalReturnOrigin,
  DepartmentTransferOrigin,
  InitialApprovalOrigin,
} from "./manufacturing.types.js";

type QualityOrigin = Readonly<{
  kind: "QUALITY_CORRECTION";
  correctionId: string;
  correctionCycle: number;
  sourceOrderVersion: number;
  instructions: string;
}>;
type OpenVisitInput = Readonly<{
  orderId: string;
  pieceId: string;
  target: ManufacturingDepartment;
  origin:
    InitialApprovalOrigin | ApprovalReturnOrigin | DepartmentTransferOrigin;
  occurredAt: Date;
}>;
type EndVisitInput = Readonly<{
  orderId: string;
  pieceId: string;
  approvalCommandId: string;
  occurredAt: Date;
}>;
const qualityInstructionsSchema = nonEmptyBoundedString(4000);

const originColumns = (origin: OpenVisitInput["origin"] | QualityOrigin) => {
  const empty = {
    sourceApprovalCommandId: null,
    sourceTransferEventId: null,
    sourceIssueId: null,
    sourceReferenceId: null,
    sourceCorrectionCycle: null,
    sourceOrderVersion: null,
    instructions: null,
  };
  switch (origin.kind) {
    case "INITIAL_APPROVAL":
      return {
        ...empty,
        originKind: origin.kind,
        sourceDepartment: Department.APPROVAL,
        sourceApprovalCommandId: origin.approvalCommandId,
      };
    case "APPROVAL_RETURN":
      return {
        ...empty,
        originKind: origin.kind,
        sourceDepartment: Department.APPROVAL,
        sourceApprovalCommandId: origin.approvalCommandId,
        sourceIssueId: origin.issueId,
        instructions: origin.instructions,
      };
    case "DEPARTMENT_TRANSFER":
      return {
        ...empty,
        originKind: origin.kind,
        sourceDepartment: Department.CUTTING,
        sourceTransferEventId: origin.transferEventId,
      };
    case "QUALITY_CORRECTION":
      return {
        ...empty,
        originKind: origin.kind,
        sourceDepartment: Department.QUALITY,
        sourceReferenceId: origin.correctionId,
        sourceCorrectionCycle: origin.correctionCycle,
        sourceOrderVersion: origin.sourceOrderVersion,
        instructions: origin.instructions,
      };
  }
};

// The caller owns the actor/root locks, root version step and source command transaction.
const createVisit = async (
  tx: Prisma.TransactionClient,
  input: Omit<OpenVisitInput, "origin"> & {
    origin: OpenVisitInput["origin"] | QualityOrigin;
  },
): Promise<{ visitId: string }> => {
  const piece = await tx.salesOrderPiece.findFirst({
    where: { id: input.pieceId, orderId: input.orderId },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  if (
    piece === null ||
    piece.stage !== input.target ||
    piece.workState !== "INCOMING" ||
    piece.issueId !== null ||
    piece.receivedAt !== null ||
    piece.cancelledAt !== null ||
    piece.cancellationReason !== null ||
    piece.currentWorkVisitId !== null
  )
    throw new ManufacturingSelectionConflictError();
  const previous = await tx.manufacturingWorkVisit.aggregate({
    where: { pieceId: input.pieceId, orderId: input.orderId },
    _max: { sequence: true },
  });
  const sequence = (previous._max.sequence ?? 0) + 1;
  if (sequence > 2147483647) throw new ManufacturingSelectionConflictError();
  const visit = await tx.manufacturingWorkVisit.create({
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      pieceId: input.pieceId,
      department: input.target,
      sequence,
      ...originColumns(input.origin),
      enteredAt: input.occurredAt,
      legacyUnknownStart: false,
    },
    select: { id: true },
  });
  const linked = await tx.salesOrderPiece.updateMany({
    where: {
      id: input.pieceId,
      orderId: input.orderId,
      stage: input.target,
      workState: "INCOMING",
      issueId: null,
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      currentWorkVisitId: null,
    },
    data: { currentWorkVisitId: visit.id },
  });
  if (linked.count !== 1) throw new ManufacturingSelectionConflictError();
  return { visitId: visit.id };
};

export const openManufacturingVisit = (
  tx: Prisma.TransactionClient,
  input: OpenVisitInput,
): Promise<{ visitId: string }> => createVisit(tx, input);

const endVisit = async (
  tx: Prisma.TransactionClient,
  input: EndVisitInput & { reason: "ISSUE_REPORTED" | "CANCELLED" },
): Promise<void> => {
  const piece = await tx.salesOrderPiece.findFirst({
    where: { id: input.pieceId, orderId: input.orderId },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  if (piece === null)
    throw new InternalServerError(
      "The source operation has no physical piece.",
    );
  if (
    piece.workState !== "BLOCKED" ||
    piece.receivedAt !== null ||
    (input.reason === "ISSUE_REPORTED"
      ? piece.issueId === null || piece.cancelledAt !== null
      : piece.stage !== "CANCELLED" || piece.cancelledAt === null)
  )
    throw new InternalServerError(
      "The source operation has not established its hold or cancellation.",
    );
  if (piece.currentWorkVisitId === null) {
    if (input.reason === "CANCELLED" || piece.stage === "QUALITY") return;
    throw new InternalServerError(
      "A current manufacturing hold has no work visit.",
    );
  }
  const visit = await tx.manufacturingWorkVisit.findFirst({
    where: {
      id: piece.currentWorkVisitId,
      orderId: input.orderId,
      pieceId: input.pieceId,
      endedAt: null,
    },
    select: { id: true, department: true },
  });
  if (
    visit === null ||
    (input.reason === "ISSUE_REPORTED" && visit.department !== piece.stage)
  )
    throw new InternalServerError(
      "The source operation has no matching open work visit.",
    );
  const ended = await tx.manufacturingWorkVisit.updateMany({
    where: {
      id: visit.id,
      orderId: input.orderId,
      pieceId: input.pieceId,
      endedAt: null,
    },
    data: {
      endedAt: input.occurredAt,
      endReason: input.reason,
      endApprovalCommandId: input.approvalCommandId,
      endManufacturingCommandId: null,
      destination: null,
    },
  });
  const cleared = await tx.salesOrderPiece.updateMany({
    where: {
      id: input.pieceId,
      orderId: input.orderId,
      currentWorkVisitId: visit.id,
      stage: piece.stage,
      workState: "BLOCKED",
    },
    data: { currentWorkVisitId: null },
  });
  if (ended.count !== 1 || cleared.count !== 1)
    throw new ManufacturingSelectionConflictError();
};

export const interruptManufacturingVisit = (
  tx: Prisma.TransactionClient,
  input: EndVisitInput,
): Promise<void> => endVisit(tx, { ...input, reason: "ISSUE_REPORTED" });
export const cancelManufacturingVisit = (
  tx: Prisma.TransactionClient,
  input: EndVisitInput,
): Promise<void> => endVisit(tx, { ...input, reason: "CANCELLED" });

export const openQualityCorrectionVisit = async (
  tx: Prisma.TransactionClient,
  input: Readonly<{
    actor: AuthorityAccount;
    orderId: string;
    pieceId: string;
    expectedVersion: number;
    target: ManufacturingDepartment;
    correctionId: string;
    correctionCycle: number;
    instructions: string;
    occurredAt: Date;
  }>,
): Promise<{ visitId: string }> => {
  assertBusinessAuthority(input.actor, Department.QUALITY);
  const root = await tx.salesDraft.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      version: true,
      order: { select: { status: true } },
    },
  });
  if (
    root === null ||
    root.version !== input.expectedVersion ||
    root.version >= 2147483647
  )
    throw new OrderVersionConflictError();
  if (
    root.status !== "SUBMITTED" ||
    root.order?.status !== "APPROVED" ||
    !salesVersionSchema.safeParse(input.correctionCycle).success ||
    !salesUuidSchema.safeParse(input.correctionId).success ||
    !qualityInstructionsSchema.safeParse(input.instructions).success
  )
    throw new ManufacturingSelectionConflictError();
  const changed = await tx.salesOrderPiece.updateMany({
    where: {
      id: input.pieceId,
      orderId: input.orderId,
      stage: "QUALITY",
      workState: "IN_PROGRESS",
      issueId: null,
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      currentWorkVisitId: null,
    },
    data: { stage: input.target, workState: "INCOMING" },
  });
  if (changed.count !== 1) throw new ManufacturingSelectionConflictError();
  return createVisit(tx, {
    orderId: input.orderId,
    pieceId: input.pieceId,
    target: input.target,
    occurredAt: input.occurredAt,
    origin: {
      kind: "QUALITY_CORRECTION",
      correctionId: input.correctionId,
      correctionCycle: input.correctionCycle,
      sourceOrderVersion: input.expectedVersion + 1,
      instructions: input.instructions,
    },
  });
};
