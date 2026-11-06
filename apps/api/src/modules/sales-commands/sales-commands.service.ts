import type { SalesCommandData } from "@template/contracts";
import {
  Department,
  Prisma,
  UserRole,
  type DatabaseClient,
} from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
} from "../auth/account-authority.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesCommandNotFoundError,
  SalesTransactionConflictError,
} from "./sales-command.errors.js";
import {
  mapSalesCommandResult,
  SALES_COMMAND_SELECT,
} from "./sales-command.mapper.js";

export class SalesCommandsService {
  constructor(private readonly database: DatabaseClient) {}
  async get(actorId: string, commandId: string): Promise<SalesCommandData> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, Department.SALES);
            const command = await tx.salesCommand.findUnique({
              where: { commandId },
              select: SALES_COMMAND_SELECT,
            });
            if (command === null || command.actorId !== actor.id)
              throw new SalesCommandNotFoundError();
            if (command.draftId !== null) {
              const parent = await tx.salesDraft.findFirst({
                where: {
                  id: command.draftId,
                  ...(actor.role === UserRole.ADMIN
                    ? {}
                    : { ownerId: actor.id }),
                },
                select: { id: true },
              });
              if (parent === null) throw new SalesCommandNotFoundError();
            } else if (command.customerId !== null) {
              const customer = await tx.customer.findUnique({
                where: { id: command.customerId },
                select: { id: true },
              });
              if (customer === null) throw new SalesCommandNotFoundError();
            } else {
              throw new SalesCommandNotFoundError();
            }
            return mapSalesCommandResult(command, true);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new SalesTransactionConflictError();
        if (isSalesTransactionConflict(error)) {
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
}
