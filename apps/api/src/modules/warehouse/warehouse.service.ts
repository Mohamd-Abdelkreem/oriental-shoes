import { Prisma, type DatabaseClient } from "@template/database";
import type {
  WarehouseCommandBody,
  WarehouseDashboardQuery,
  WarehouseOrdersQuery,
  WarehousePiecesQuery,
  WarehouseActivityQuery,
  WarehouseOrderHistoryQuery,
} from "@template/contracts";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { isSalesLockTimeout } from "../sales-commands/sales-command.errors.js";
import {
  isWarehouseTransactionConflict,
  WarehouseTransactionConflictError,
} from "./warehouse.errors.js";
import type { WarehouseCommandExecutor } from "./warehouse-command-executor.js";
import {
  findWarehouseDashboard,
  findWarehouseOrders,
  findWarehousePieces,
  findWarehouseOrder,
  findWarehouseActivity,
  findWarehouseOrderHistory,
} from "./warehouse.queries.js";

export class WarehouseService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: WarehouseCommandExecutor,
  ) {}
  dashboard(actorId: string, query: WarehouseDashboardQuery) {
    return this.read(actorId, (tx, actor) =>
      findWarehouseDashboard(tx, actor, query),
    );
  }
  listOrders(actorId: string, query: WarehouseOrdersQuery) {
    return this.read(actorId, (tx, actor) =>
      findWarehouseOrders(tx, actor, query),
    );
  }
  listPieces(actorId: string, query: WarehousePiecesQuery) {
    return this.read(actorId, (tx, actor) =>
      findWarehousePieces(tx, actor, query),
    );
  }
  execute(actorId: string, body: WarehouseCommandBody) {
    return this.commands.execute({ actorId, body });
  }
  getOrder(actorId: string, orderId: string) {
    return this.read(actorId, (tx, actor) =>
      findWarehouseOrder(tx, actor, orderId),
    );
  }
  activity(actorId: string, query: WarehouseActivityQuery) {
    return this.read(actorId, (tx, actor) =>
      findWarehouseActivity(tx, actor, query),
    );
  }
  orderHistory(
    actorId: string,
    orderId: string,
    query: WarehouseOrderHistoryQuery,
  ) {
    return this.read(actorId, (tx, actor) =>
      findWarehouseOrderHistory(tx, actor, orderId, query),
    );
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
            assertBusinessAuthority(actor, "WAREHOUSE");
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
          throw new WarehouseTransactionConflictError();
        if (isWarehouseTransactionConflict(error)) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new WarehouseTransactionConflictError();
        }
        throw error;
      }
    }
  }
}
