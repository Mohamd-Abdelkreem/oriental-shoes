import type {
  CatalogData,
  CatalogQuoteBody,
  CatalogQuoteData,
} from "@template/contracts";
import { Department, Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesTransactionConflictError,
} from "../sales-commands/sales-command.errors.js";
import { readActiveCatalog, lockActiveCatalog } from "./catalogs.queries.js";
import { mapCatalog } from "./catalogs.mapper.js";
import { calculateCatalogQuote } from "./catalogs.rules.js";

export class CatalogsService {
  constructor(private readonly database: DatabaseClient) {}
  get(actorId: string): Promise<CatalogData> {
    return this.read(actorId, async (tx) =>
      mapCatalog(await readActiveCatalog(tx)),
    );
  }
  quote(actorId: string, input: CatalogQuoteBody): Promise<CatalogQuoteData> {
    return this.read(actorId, async (tx) =>
      calculateCatalogQuote(await lockActiveCatalog(tx), input),
    );
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
            await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, Department.SALES);
            return work(tx, actor);
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
