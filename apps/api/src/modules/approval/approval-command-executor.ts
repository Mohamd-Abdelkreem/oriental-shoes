import {
  lockApprovalCommandIds,
  persistApprovalCommand,
} from "./approval-command.writer.js";
import { createHash } from "node:crypto";
import type {
  ApprovalCommandData,
  ApprovalCommandOperation,
} from "@template/contracts";
import { Department, Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { DepartmentAccessDeniedError } from "../auth/auth.errors.js";
import {
  isSalesCommandIdConflict,
  isSalesLockTimeout,
  isSalesTransactionConflict,
} from "../sales-commands/sales-command.errors.js";
import {
  ApprovalCommandConflictError,
  ApprovalCommandNotFoundError,
  ApprovalTransactionConflictError,
} from "./approval.errors.js";
import {
  APPROVAL_COMMAND_SELECT,
  mapApprovalCommandResult,
  type ApprovalCommandRecord,
} from "./approval.mapper.js";
import type {
  ApprovalCommandExecution,
  ApprovalCommandHashIntent,
} from "./approval.types.js";

const canonicalPayload = (intent: ApprovalCommandHashIntent): unknown => {
  switch (intent.operation) {
    case "APPROVE_INITIAL":
      return {};
    case "RETURN_INITIAL":
    case "REPORT_ISSUE":
      return { reason: intent.payload.reason, notes: intent.payload.notes };
    case "RESOLVE_ISSUE": {
      const body = intent.payload;
      return body.decision === "CANCEL"
        ? {
            decision: body.decision,
            reason: body.reason,
            confirmed: body.confirmed,
          }
        : { decision: body.decision, target: body.target, notes: body.notes };
    }
    case "SUBMIT_CONTACT": {
      const body = intent.payload;
      if (body.kind === "CANCEL_REQUEST")
        return { kind: body.kind, contactNotes: body.contactNotes };
      const changes = Object.fromEntries(
        (["model", "size", "leatherBase", "sole"] as const)
          .filter((key) => body.changes[key] !== undefined)
          .map((key) => [key, body.changes[key]]),
      );
      return { kind: body.kind, contactNotes: body.contactNotes, changes };
    }
    case "REVIEW_CONTACT": {
      const body = intent.payload;
      switch (body.decision) {
        case "ACCEPT":
          return { decision: body.decision, notes: body.notes };
        case "RETURN_TO_SALES":
          return { decision: body.decision, reason: body.reason };
        case "CANCEL":
          return {
            decision: body.decision,
            reason: body.reason,
            confirmed: body.confirmed,
          };
      }
    }
  }
};
export const hashApprovalCommandIntent = (
  intent: ApprovalCommandHashIntent,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        operation: intent.operation,
        orderId: intent.orderId,
        pieceId: "pieceId" in intent ? intent.pieceId : null,
        issueId: "issueId" in intent ? intent.issueId : null,
        proposalId: "proposalId" in intent ? intent.proposalId : null,
        expectedVersion: intent.expectedVersion,
        payload: canonicalPayload(intent),
      }),
    )
    .digest("hex");

const assertOperationAuthority = (
  actor: AuthorityAccount,
  operation: ApprovalCommandOperation,
) => {
  if (operation === "SUBMIT_CONTACT")
    assertBusinessAuthority(actor, Department.SALES);
  else if (operation === "REPORT_ISSUE") assertBusinessAuthority(actor);
  else assertBusinessAuthority(actor, Department.APPROVAL);
};
const matchesIntent = (
  retained: ApprovalCommandRecord,
  input: ApprovalCommandExecution,
) =>
  retained.actorId === input.actorId &&
  retained.operation === input.operation &&
  retained.orderId === input.orderId &&
  retained.expectedVersion === input.expectedVersion &&
  retained.payloadHash === input.payloadHash &&
  (!("pieceId" in input) || retained.pieceId === input.pieceId) &&
  (!("issueId" in input) || retained.issueId === input.issueId) &&
  (!("proposalId" in input) || retained.proposalId === input.proposalId);

export class ApprovalCommandExecutor {
  constructor(private readonly database: DatabaseClient) {}
  async execute(input: ApprovalCommandExecution): Promise<ApprovalCommandData> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
            await lockAccountRows(tx, [input.actorId], "read");
            const actor = await loadIdentityAccount(tx, input.actorId);
            assertOperationAuthority(actor, input.operation);
            await lockApprovalCommandIds(tx, [input.commandId]);
            const retained = await tx.approvalCommand.findUnique({
              where: { commandId: input.commandId },
              select: APPROVAL_COMMAND_SELECT,
            });
            if (retained !== null) {
              if (!matchesIntent(retained, input))
                throw new ApprovalCommandConflictError();
              await this.requireReceiptAuthority(tx, actor, retained);
              return mapApprovalCommandResult(retained, true);
            }
            const occurredAt = new Date(),
              result = await input.work(tx, actor, occurredAt);
            return persistApprovalCommand(tx, {
              execution: input,
              actor,
              occurredAt,
              result,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: unknown) {
        if (isSalesLockTimeout(error))
          throw new ApprovalTransactionConflictError();
        if (
          isSalesTransactionConflict(error) ||
          isSalesCommandIdConflict(error)
        ) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new ApprovalTransactionConflictError();
        }
        throw error;
      }
    }
  }
  async observe(
    actorId: string,
    commandId: string,
  ): Promise<ApprovalCommandData> {
    return this.database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
        await lockAccountRows(tx, [actorId], "read");
        const actor = await loadIdentityAccount(tx, actorId);
        assertBusinessAuthority(actor);
        const retained = await tx.approvalCommand.findUnique({
          where: { commandId },
          select: APPROVAL_COMMAND_SELECT,
        });
        if (retained === null || retained.actorId !== actor.id)
          throw new ApprovalCommandNotFoundError();
        await this.requireReceiptAuthority(tx, actor, retained);
        return mapApprovalCommandResult(retained, true);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
  private async requireReceiptAuthority(
    tx: Prisma.TransactionClient,
    actor: AuthorityAccount,
    command: ApprovalCommandRecord,
  ): Promise<void> {
    assertOperationAuthority(actor, command.operation);
    if (command.operation === "REPORT_ISSUE") {
      const issue =
        command.issueId === null
          ? null
          : await tx.manufacturingIssue.findUnique({
              where: { id: command.issueId },
              select: { sourceDepartment: true },
            });
      if (issue === null) throw new ApprovalCommandNotFoundError();
      if (actor.role !== "ADMIN" && actor.department !== issue.sourceDepartment)
        throw new DepartmentAccessDeniedError();
      return;
    }
    const root = await tx.salesDraft.findFirst({
      where: {
        id: command.orderId,
        status: "SUBMITTED",
        ...(command.operation === "SUBMIT_CONTACT"
          ? { ownerId: actor.id }
          : {}),
      },
      select: { id: true },
    });
    if (root === null) throw new ApprovalCommandNotFoundError();
  }
}
