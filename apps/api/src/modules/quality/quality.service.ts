import { isSalesLockTimeout } from "../sales-commands/sales-command.errors.js";
import type {
  QualityOrdersQuery,
  QualityPiecesQuery,
  QualityActivityQuery,
  QualityOrderHistoryQuery,
  QualityCommandBody,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isQualityTransactionConflict,
  QualityTransactionConflictError,
} from "./quality.errors.js";
import type { QualityCommandExecutor } from "./quality-command-executor.js";
import {
  findQualityDashboard,
  findQualityOrders,
  findQualityPieces,
  findQualityOrder,
  findQualityActivity,
  findQualityOrderHistory,
} from "./quality.queries.js";

export class QualityService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: QualityCommandExecutor,
  ) {}
  dashboard(actorId: string) {
    return this.read(actorId, (tx, actor) => findQualityDashboard(tx, actor));
  }
  listOrders(actorId: string, query: QualityOrdersQuery) {
    return this.read(actorId, (tx, actor) =>
      findQualityOrders(tx, actor, query),
    );
  }
  listPieces(actorId: string, query: QualityPiecesQuery) {
    return this.read(actorId, (tx, actor) =>
      findQualityPieces(tx, actor, query),
    );
  }
  getOrder(actorId: string, orderId: string) {
    return this.read(actorId, (tx, actor) =>
      findQualityOrder(tx, actor, orderId),
    );
  }
  activity(actorId: string, query: QualityActivityQuery) {
    return this.read(actorId, (tx, actor) =>
      findQualityActivity(tx, actor, query),
    );
  }
  orderHistory(
    actorId: string,
    orderId: string,
    query: QualityOrderHistoryQuery,
  ) {
    return this.read(actorId, (tx, actor) =>
      findQualityOrderHistory(tx, actor, orderId, query),
    );
  }
  execute(actorId: string, body: QualityCommandBody) {
    return this.commands.execute({ actorId, body });
  }
  observe(actorId: string, commandId: string) {
    return this.commands.observe(actorId, commandId);
  }
  private async read<T>(
    actorId: string,
    work: (tx: Prisma.TransactionClient, actor: AuthorityAccount) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, "QUALITY");
            return work(tx, actor);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: unknown) {
        if (isSalesLockTimeout(error))
          throw new QualityTransactionConflictError();
        if (isQualityTransactionConflict(error)) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new QualityTransactionConflictError();
        }
        throw error;
      }
    }
  }
}
