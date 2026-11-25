import { administrationCommandDataSchema } from "@template/contracts";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { advanceApprovalOrderVersion } from "../approval/approval-command.writer.js";
import { applyRetainedPieceCancellation } from "../approval/order-cancellation.writer.js";
import { ADMINISTRATION_ORDER_SELECT } from "./administration.mapper.js";
import { mapAdministrationCommandFacts } from "./administration.rules.js";
import { writeAdministrationPaper } from "./administration-paper-correction.js";
import type {
  AdministrationCancellationPlan,
  AdministrationCorrectionPlan,
  AdministrationRootRecord,
} from "./administration.types.js";

type AdministrationPlan =
  AdministrationCancellationPlan | AdministrationCorrectionPlan;
export const lockAdministrationCommandIds = async (
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<void> => {
  for (const id of [...new Set(ids)].sort()) {
    const hex = createHash("sha256")
      .update("p08-administration-command:" + id)
      .digest("hex")
      .slice(0, 16);
    const key = BigInt.asIntN(64, BigInt("0x" + hex)).toString();
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
  }
};
export const persistAdministrationCommand = async (
  tx: Prisma.TransactionClient,
  input: Readonly<{
    plan: AdministrationPlan;
    actor: AuthorityAccount;
    occurredAt: Date;
    payloadHash: string;
  }>,
): Promise<void> => {
  const { plan, actor, occurredAt, payloadHash } = input;
  await tx.administrationCommand.create({
    data: {
      commandId: plan.body.commandId,
      operation: plan.body.operation,
      actorId: actor.id,
      actorFullName: actor.fullName,
      actorRole: actor.role,
      actorDepartment: actor.department,
      orderId: plan.body.orderId,
      expectedVersion: plan.body.expectedVersion,
      beforeVersion: plan.before.version,
      afterVersion: plan.after.version,
      payloadHash,
      reason: plan.reason,
      scope: plan.body.operation === "ADMIN_CANCEL" ? plan.body.scope : null,
      pieceIds: plan.result.pieceIds,
      beforeFacts: plan.before,
      afterFacts: plan.after,
      outcome: administrationCommandDataSchema.parse({
        receipt: {
          commandId: plan.body.commandId,
          operation: plan.body.operation,
          orderId: plan.body.orderId,
          beforeVersion: plan.before.version,
          afterVersion: plan.after.version,
          actor: {
            id: actor.id,
            fullName: actor.fullName,
            role: actor.role,
            department: actor.department,
          },
          occurredAt: occurredAt.toISOString(),
        },
        replayed: false,
        result: plan.result,
        before: plan.before,
        after: plan.after,
      }),
      occurredAt,
    },
    select: { commandId: true },
  });
};
const advanceRoot = async (
  tx: Prisma.TransactionClient,
  root: AdministrationRootRecord,
  plan: AdministrationPlan,
  occurredAt: Date,
): Promise<void> => {
  await advanceApprovalOrderVersion(tx, {
    orderId: root.id,
    expectedVersion: root.version,
    occurredAt,
    ...(plan.before.correction.generalNotes !==
    plan.after.correction.generalNotes
      ? {
          notes: {
            before: plan.before.correction.generalNotes,
            after: plan.after.correction.generalNotes,
          },
        }
      : {}),
  });
  const proof = plan.after.returnProof;
  const header = await tx.salesOrder.updateMany({
    where: {
      id: root.id,
      status: plan.before.status,
      totalAmount: plan.before.money.total,
      paidAmount: plan.before.money.paidAmount,
    },
    data: {
      status: plan.after.status,
      totalAmount: plan.after.money.total,
      currentReturnDecisionId: proof?.decisionId ?? null,
      currentReturnOrderVersion: proof?.version ?? null,
      currentReturnReason: proof?.reason ?? null,
      currentReturnedAt: proof ? new Date(proof.returnedAt) : null,
    },
  });
  if (header.count !== 1)
    throw new InternalServerError(
      "The current order facts changed during administration.",
    );
  const after = await tx.salesDraft.findUniqueOrThrow({
    where: { id: root.id },
    select: ADMINISTRATION_ORDER_SELECT,
  });
  const { paper: _paper, ...correction } = plan.after.correction;
  if (
    !isDeepStrictEqual(mapAdministrationCommandFacts(after), {
      ...plan.after,
      correction,
    })
  )
    throw new InternalServerError(
      "The administration write differs from its retained plan.",
    );
};
export const applyAdministrativeCancellation = async (
  tx: Prisma.TransactionClient,
  {
    root,
    plan,
  }: Readonly<{
    root: AdministrationRootRecord;
    plan: AdministrationCancellationPlan;
  }>,
): Promise<void> => {
  const parent = await tx.administrationCommand.findUniqueOrThrow({
    where: { commandId: plan.body.commandId },
    select: { occurredAt: true },
  });
  for (const pieceId of plan.result.pieceIds) {
    const before = plan.before.pieces.find((piece) => piece.id === pieceId),
      after = plan.after.pieces.find((piece) => piece.id === pieceId);
    if (!before || !after)
      throw new InternalServerError(
        "The retained cancellation member is missing.",
      );
    await tx.administrationCancelledPiece.create({
      data: {
        commandId: plan.body.commandId,
        orderId: root.id,
        pieceId,
        beforeFacts: before,
        afterFacts: after,
      },
      select: { pieceId: true },
    });
  }
  await applyRetainedPieceCancellation(tx, {
    orderId: root.id,
    pieceIds: plan.result.pieceIds,
    reason: plan.reason,
    occurredAt: parent.occurredAt,
    source: { kind: "administration", commandId: plan.body.commandId },
  });
  await advanceRoot(tx, root, plan, parent.occurredAt);
};
export const applyAdministrativeCorrection = async (
  tx: Prisma.TransactionClient,
  {
    root,
    plan,
  }: Readonly<{
    root: AdministrationRootRecord;
    plan: AdministrationCorrectionPlan;
  }>,
): Promise<void> => {
  const parent = await tx.administrationCommand.findUniqueOrThrow({
    where: { commandId: plan.body.commandId },
    select: { occurredAt: true },
  });
  await tx.administrationOrderCorrection.create({
    data: {
      commandId: plan.body.commandId,
      orderId: root.id,
      afterVersion: plan.after.version,
      customerName: plan.after.correction.customerName,
      customerPhone: plan.after.correction.customerPhone,
      customerEmail: plan.after.correction.customerEmail,
      customerAddress: plan.after.correction.customerAddress,
      beforeValues: plan.before.correction,
      afterValues: plan.after.correction,
      changedFields: [...plan.changedFields],
    },
    select: { commandId: true },
  });
  const beforePaper = plan.before.correction.paper;
  const afterPaper = plan.after.correction.paper;
  if (beforePaper && afterPaper)
    await writeAdministrationPaper(tx, {
      orderId: root.id,
      before: beforePaper,
      after: afterPaper,
      occurredAt: parent.occurredAt,
    });
  await advanceRoot(tx, root, plan, parent.occurredAt);
};
