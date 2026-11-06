import { createHash } from "node:crypto";
import type {
  CustomerCommandData,
  DraftCommandData,
  SalesCommandData,
} from "@template/contracts";
import {
  Department,
  Prisma,
  UserRole,
  type DatabaseClient,
} from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isSalesCommandIdConflict,
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesCommandConflictError,
  SalesCommandNotFoundError,
  SalesTransactionConflictError,
} from "./sales-command.errors.js";
import {
  mapSalesCommandResult,
  SALES_COMMAND_SELECT,
  type SalesCommandRecord,
} from "./sales-command.mapper.js";
import type {
  CustomerCommandExecution,
  DraftCommandExecution,
  SalesCommandExecution,
  SalesCommandHashIntent,
} from "./sales-command.types.js";

export const hashSalesCommandIntent = (
  input: SalesCommandHashIntent,
): string => {
  let payload: unknown;
  if (input.operation === "CREATE_CUSTOMER") {
    const value = input.payload;
    payload = {
      name: value.name,
      phone: value.phone,
      email: value.email,
      address: value.address,
      notes: value.notes,
    };
  } else if (input.operation === "UPDATE_CUSTOMER") {
    const patch: Record<string, string | null> = {};
    for (const key of ["name", "phone", "email", "address", "notes"] as const) {
      const value = input.payload[key];
      if (value !== undefined) patch[key] = value;
    }
    payload = patch;
  } else {
    const value = input.payload;
    payload = {
      type: value.type,
      customerId: value.customerId,
      deliveryDate: value.deliveryDate,
      generalNotes: value.generalNotes,
      responsibleSignature: value.responsibleSignature,
      repairNote: value.repairNote,
      adjustmentRequested: value.adjustmentRequested,
      adjustmentReason: value.adjustmentReason,
      adjustmentActionTaken: value.adjustmentActionTaken,
      paidAmount: value.paidAmount,
      pieces: value.pieces.map((piece) => ({
        id: piece.id,
        model: piece.model,
        size: piece.size,
        leatherBase: piece.leatherBase,
        decoration: piece.decoration,
        decorationColor: piece.decorationColor,
        faceRight: piece.faceRight,
        faceLeft: piece.faceLeft,
        mixing: piece.mixing,
        face: piece.face,
        sole: piece.sole,
        soleAddition: piece.soleAddition,
        soleColor: piece.soleColor,
        additions: piece.additions,
        aField: piece.aField,
        fField: piece.fField,
        sideNotes: piece.sideNotes,
      })),
    };
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation: input.operation,
        targetId: input.targetId,
        expectedVersion: input.expectedVersion,
        payload,
      }),
    )
    .digest("hex");
};

export class SalesCommandExecutor {
  constructor(private readonly database: DatabaseClient) {}

  execute(input: CustomerCommandExecution): Promise<CustomerCommandData>;
  execute(input: DraftCommandExecution): Promise<DraftCommandData>;
  async execute(input: SalesCommandExecution): Promise<SalesCommandData> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
            await lockAccountRows(tx, [input.actorId], "read");
            const actor = await loadIdentityAccount(tx, input.actorId);
            assertBusinessAuthority(actor, Department.SALES);
            const hex = createHash("sha256")
              .update(`p02-sales-command:${input.commandId}`)
              .digest("hex")
              .slice(0, 16);
            const keyString = BigInt.asIntN(64, BigInt(`0x${hex}`)).toString();
            await tx.$queryRaw<
              Array<{ locked: number }>
            >`SELECT 1 AS locked FROM pg_advisory_xact_lock(${keyString}::bigint)`;
            const retained = await tx.salesCommand.findUnique({
              where: { commandId: input.commandId },
              select: SALES_COMMAND_SELECT,
            });
            if (retained !== null) {
              if (
                retained.actorId !== input.actorId ||
                retained.operation !== input.operation ||
                retained.requestTargetId !== input.targetId ||
                retained.expectedVersion !== input.expectedVersion ||
                retained.payloadHash !== input.payloadHash
              ) {
                throw new SalesCommandConflictError();
              }
              await this.requireVisibleResource(tx, actor, retained);
              return mapSalesCommandResult(retained, true);
            }
            const occurredAt = new Date();
            const result = await input.work(tx, actor, occurredAt);
            const stored = await tx.salesCommand.create({
              data: {
                commandId: input.commandId,
                operation: input.operation,
                actorId: actor.id,
                actorFullName: actor.fullName,
                actorRole: actor.role,
                actorDepartment: actor.department,
                requestTargetId: input.targetId,
                customerId: input.kind === "customer" ? result.after.id : null,
                draftId: input.kind === "draft" ? result.after.id : null,
                expectedVersion: input.expectedVersion,
                beforeVersion: result.before?.version ?? null,
                afterVersion: result.after.version,
                payloadHash: input.payloadHash,
                before: result.before === null ? Prisma.DbNull : result.before,
                after: result.after,
                occurredAt,
              },
              select: SALES_COMMAND_SELECT,
            });
            const mapped = mapSalesCommandResult(stored, false);
            if (mapped.kind !== input.kind)
              throw new InternalServerError(
                "A command returned an incompatible result.",
              );
            return mapped;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new SalesTransactionConflictError();
        if (
          isSalesTransactionConflict(error) ||
          isSalesCommandIdConflict(error)
        ) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new SalesTransactionConflictError();
        }
        throw error;
      }
    }
  }

  private async requireVisibleResource(
    tx: Prisma.TransactionClient,
    actor: AuthorityAccount,
    command: SalesCommandRecord,
  ): Promise<void> {
    if (command.draftId !== null) {
      const draft = await tx.salesDraft.findFirst({
        where: {
          id: command.draftId,
          ...(actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id }),
        },
        select: { id: true },
      });
      if (draft === null) throw new SalesCommandNotFoundError();
    } else if (command.customerId !== null) {
      const customer = await tx.customer.findUnique({
        where: { id: command.customerId },
        select: { id: true },
      });
      if (customer === null) throw new SalesCommandNotFoundError();
    } else {
      throw new SalesCommandNotFoundError();
    }
  }
}
