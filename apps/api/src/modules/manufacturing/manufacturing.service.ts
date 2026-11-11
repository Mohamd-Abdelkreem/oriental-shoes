import type {
  ManufacturingDepartment,
  ManufacturingOrdersQuery,
  ManufacturingPiecesQuery,
  ManufacturingActivityQuery,
  ManufacturingOrderHistoryQuery,
  ManufacturingCommandBody,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { isSalesTransactionConflict } from "../sales-commands/sales-command.errors.js";
import type { ManufacturingCommandExecutor } from "./manufacturing-command-executor.js";
import {
  findManufacturingDashboard,
  findManufacturingOrders,
  findManufacturingPieces,
  findManufacturingOrder,
  findManufacturingActivity,
  findManufacturingOrderHistory,
} from "./manufacturing.queries.js";

export class ManufacturingService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: ManufacturingCommandExecutor,
  ) {}
  dashboard(actorId: string, department: ManufacturingDepartment) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingDashboard(tx, actor, department),
    );
  }
  listOrders(
    actorId: string,
    department: ManufacturingDepartment,
    query: ManufacturingOrdersQuery,
  ) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingOrders(tx, actor, department, query),
    );
  }
  listPieces(
    actorId: string,
    department: ManufacturingDepartment,
    query: ManufacturingPiecesQuery,
  ) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingPieces(tx, actor, department, query),
    );
  }
  getOrder(
    actorId: string,
    department: ManufacturingDepartment,
    orderId: string,
  ) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingOrder(tx, actor, department, orderId),
    );
  }
  activity(
    actorId: string,
    department: ManufacturingDepartment,
    query: ManufacturingActivityQuery,
  ) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingActivity(tx, actor, department, query),
    );
  }
  orderHistory(
    actorId: string,
    department: ManufacturingDepartment,
    orderId: string,
    query: ManufacturingOrderHistoryQuery,
  ) {
    return this.read(actorId, department, (tx, actor) =>
      findManufacturingOrderHistory(tx, actor, department, orderId, query),
    );
  }
  execute(
    actorId: string,
    department: ManufacturingDepartment,
    body: ManufacturingCommandBody,
  ) {
    return this.commands.execute({ actorId, department, body });
  }
  observe(actorId: string, commandId: string) {
    return this.commands.observe(actorId, commandId);
  }
  private async read<T>(
    actorId: string,
    department: ManufacturingDepartment,
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
            assertBusinessAuthority(actor, department);
            return work(tx, actor);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: unknown) {
        if (isSalesTransactionConflict(error) && !retried) {
          retried = true;
          continue;
        }
        throw error;
      }
    }
  }
}
