import type {
  AdministrationDashboardQuery,
  AdministrationFilterOptionsQuery,
  AdministrationOrdersQuery,
  AdministrationApprovalsQuery,
  AdministrationCorrectionsQuery,
  AdministrationDeliveryExceptionsQuery,
  AdministrationActivityQuery,
  AdministrationOrderHistoryQuery,
  AdministrationReportQuery,
  AdministrationReportPrintQuery,
  AdministrationCommandBody,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isSalesTransactionConflict,
  isSalesLockTimeout,
} from "../sales-commands/sales-command.errors.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { AdministrationTransactionConflictError } from "./administration.errors.js";
import { resolveAdministrationPeriod } from "./administration.rules.js";
import type { AdministrationObservation } from "./administration.types.js";
import type { AdministrationCommandExecutor } from "./administration-command-executor.js";
import {
  findAdministrationDashboard,
  findAdministrationFilterOptions,
  findAdministrationOrders,
  findAdministrationOrder,
  findAdministrationApprovals,
  findAdministrationCorrections,
  findAdministrationDeliveryExceptions,
} from "./administration.queries.js";
import { findAdministrationActivity } from "./administration-activity.queries.js";
import {
  findAdministrationReport,
  findAdministrationPrintReport,
} from "./administration-report.queries.js";

type AdministrationCalendar = Readonly<{
  businessTimeZone: string | null;
  now: () => Date;
}>;
export class AdministrationService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: AdministrationCommandExecutor,
    private readonly calendar: AdministrationCalendar,
  ) {}
  dashboard(actorId: string, query: AdministrationDashboardQuery) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationDashboard(tx, actor, query, observation),
    );
  }
  filterOptions(actorId: string, query: AdministrationFilterOptionsQuery) {
    return this.read(actorId, false, (tx, actor, observation) =>
      findAdministrationFilterOptions(tx, actor, query, observation),
    );
  }
  listOrders(actorId: string, query: AdministrationOrdersQuery) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationOrders(tx, actor, query, observation),
    );
  }
  approvals(actorId: string, query: AdministrationApprovalsQuery) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationApprovals(tx, actor, query, observation),
    );
  }
  corrections(actorId: string, query: AdministrationCorrectionsQuery) {
    return this.read(actorId, false, (tx, actor, observation) =>
      findAdministrationCorrections(tx, actor, query, observation),
    );
  }
  deliveryExceptions(
    actorId: string,
    query: AdministrationDeliveryExceptionsQuery,
  ) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationDeliveryExceptions(tx, actor, query, observation),
    );
  }
  activity(actorId: string, query: AdministrationActivityQuery) {
    return this.read(actorId, false, (tx, actor) =>
      findAdministrationActivity(tx, actor, query),
    );
  }
  report(actorId: string, query: AdministrationReportQuery) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationReport(tx, actor, query, observation),
    );
  }
  printReport(actorId: string, query: AdministrationReportPrintQuery) {
    return this.read(actorId, true, (tx, actor, observation) =>
      findAdministrationPrintReport(tx, actor, query, observation),
    );
  }
  getOrder(actorId: string, orderId: string) {
    return this.read(actorId, false, (tx, actor) =>
      findAdministrationOrder(tx, actor, orderId),
    );
  }
  orderHistory(
    actorId: string,
    orderId: string,
    query: AdministrationOrderHistoryQuery,
  ) {
    return this.read(actorId, false, (tx, actor) =>
      findAdministrationActivity(tx, actor, query, orderId),
    );
  }
  execute(actorId: string, body: AdministrationCommandBody) {
    return this.commands.execute({ actorId, body });
  }
  observe(actorId: string, commandId: string) {
    return this.commands.observe(actorId, commandId);
  }
  private async read<T>(
    actorId: string,
    calendarRequired: boolean,
    work: (
      tx: Prisma.TransactionClient,
      actor: AuthorityAccount,
      observation: AdministrationObservation,
    ) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
            await tx.$queryRaw`SELECT set_config('statement_timeout','8000ms',true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor);
            if (actor.role !== "ADMIN") throw new ForbiddenException();
            const generatedAt = this.calendar.now();
            if (!Number.isFinite(generatedAt.getTime()))
              throw new InternalServerError(
                "The observation clock is invalid.",
              );
            const businessDate = calendarRequired
              ? resolveAdministrationPeriod(
                  { period: "ALL", search: undefined },
                  generatedAt,
                  this.calendar.businessTimeZone,
                ).businessDate
              : null;
            return work(tx, actor, {
              generatedAt,
              businessTimeZone: this.calendar.businessTimeZone,
              businessDate,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new AdministrationTransactionConflictError();
        if (isSalesTransactionConflict(error)) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new AdministrationTransactionConflictError();
        }
        throw error;
      }
    }
  }
}
