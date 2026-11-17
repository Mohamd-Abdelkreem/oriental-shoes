import { createHash } from "node:crypto";
import {
  approvalEventFactsSchema,
  type ApprovalCommandData,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { OrderVersionConflictError } from "../sales-orders/sales-orders.errors.js";
import {
  APPROVAL_COMMAND_SELECT,
  mapApprovalCommandResult,
} from "./approval.mapper.js";
import type { ApprovalCommandWrite } from "./approval.types.js";

export const persistApprovalCommand = async (
  tx: Prisma.TransactionClient,
  { execution: input, actor, occurredAt, result }: ApprovalCommandWrite,
): Promise<ApprovalCommandData> => {
  const before = approvalEventFactsSchema.safeParse(result.beforeFacts),
    after = approvalEventFactsSchema.safeParse(result.afterFacts);
  if (
    !before.success ||
    !after.success ||
    result.outcome.orderId !== input.orderId ||
    result.outcome.orderVersion !== input.expectedVersion + 1 ||
    ("pieceId" in input && result.pieceId !== input.pieceId) ||
    ("issueId" in input && result.issueId !== input.issueId) ||
    ("proposalId" in input && result.proposalId !== input.proposalId)
  )
    throw new InternalServerError(
      "An approval command produced inconsistent facts.",
    );
  const stored = await tx.approvalCommand.create({
    data: {
      commandId: input.commandId,
      operation: input.operation,
      actorId: actor.id,
      actorFullName: actor.fullName,
      actorRole: actor.role,
      actorDepartment: actor.department,
      orderId: input.orderId,
      pieceId: result.pieceId,
      issueId: result.issueId,
      proposalId: result.proposalId,
      expectedVersion: input.expectedVersion,
      beforeVersion: input.expectedVersion,
      afterVersion: input.expectedVersion + 1,
      payloadHash: input.payloadHash,
      decision: result.decision,
      decisionNotes: result.decisionNotes,
      beforeFacts: before.data,
      afterFacts: after.data,
      outcome: result.outcome,
      occurredAt,
    },
    select: APPROVAL_COMMAND_SELECT,
  });
  return mapApprovalCommandResult(stored, false);
};
export const lockApprovalCommandIds = async (
  tx: Prisma.TransactionClient,
  commandIds: readonly string[],
): Promise<void> => {
  for (const commandId of [...commandIds].sort()) {
    const hex = createHash("sha256")
      .update("p04-approval-command:" + commandId)
      .digest("hex")
      .slice(0, 16);
    const key = BigInt.asIntN(64, BigInt("0x" + hex)).toString();
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
  }
};
export const advanceApprovalOrderVersion = async (
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    expectedVersion: number;
    occurredAt: Date;
    notes?: Readonly<{ before: string | null; after: string | null }>;
  },
): Promise<number> => {
  const changed = await tx.salesDraft.updateMany({
    where: {
      id: input.orderId,
      status: "SUBMITTED",
      version: input.expectedVersion,
      ...(input.notes ? { generalNotes: input.notes.before } : {}),
    },
    data: {
      version: { increment: 1 },
      updatedAt: input.occurredAt,
      ...(input.notes ? { generalNotes: input.notes.after } : {}),
    },
  });
  if (changed.count !== 1) throw new OrderVersionConflictError();
  return input.expectedVersion + 1;
};
