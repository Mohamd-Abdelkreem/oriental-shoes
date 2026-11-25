import { createHash } from "node:crypto";
import {
  administrationCommandBodySchema,
  salesUuidSchema,
  type AdministrationCommandBody,
  type AdministrationCommandData,
} from "@template/contracts";
import { Prisma, type DatabaseClient } from "@template/database";
import { ValidationException } from "../../core/errors/validation.error.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import {
  lockAccountRows,
  loadIdentityAccount,
  assertBusinessAuthority,
} from "../auth/account-authority.js";
import {
  isSalesTransactionConflict,
  isSalesCommandIdConflict,
  isSalesLockTimeout,
} from "../sales-commands/sales-command.errors.js";
import {
  OrderNotFoundError,
  OrderStateConflictError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import {
  AdministrationCommandConflictError,
  AdministrationCommandNotFoundError,
  AdministrationTransactionConflictError,
} from "./administration.errors.js";
import {
  ADMINISTRATION_ORDER_SELECT,
  ADMINISTRATION_COMMAND_SELECT,
  mapAdministrationCommandResult,
} from "./administration.mapper.js";
import {
  mapAdministrationCommandFacts,
  planAdministrativeCancellation,
  planAdministrativeCorrection,
} from "./administration.rules.js";
import {
  lockAdministrationCommandIds,
  persistAdministrationCommand,
  applyAdministrativeCancellation,
  applyAdministrativeCorrection,
} from "./administration-command.writer.js";
import { planAdministrationPaper } from "./administration-paper-correction.js";

const parseBody = (
  input: AdministrationCommandBody,
): AdministrationCommandBody => {
  const parsed = administrationCommandBodySchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationException(
      parsed.error.issues.map((issue) => ({
        field: ["body", ...issue.path].join("."),
        message: issue.message,
      })),
    );
  return parsed.data;
};
export const hashAdministrationCommandIntent = (
  input: AdministrationCommandBody,
): string => {
  const body = parseBody(input);
  const payload = {
    operation: body.operation,
    orderId: body.orderId,
    expectedVersion: body.expectedVersion,
    ...(body.operation === "ADMIN_CANCEL"
      ? { scope: body.scope, pieceIds: body.pieceIds, reason: body.reason }
      : {
          reason: body.reason,
          patch: Object.fromEntries(
            Object.entries(body.patch).sort(([left], [right]) =>
              left.localeCompare(right, "en"),
            ),
          ),
        }),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};
export class AdministrationCommandExecutor {
  constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date,
  ) {}
  async execute(
    input: Readonly<{ actorId: string; body: AdministrationCommandBody }>,
  ): Promise<AdministrationCommandData> {
    const body = parseBody(input.body),
      payloadHash = hashAdministrationCommandIntent(body);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, input.actorId);
      await lockAdministrationCommandIds(tx, [body.commandId]);
      const retained = await tx.administrationCommand.findUnique({
        where: { commandId: body.commandId },
        select: ADMINISTRATION_COMMAND_SELECT,
      });
      if (retained) {
        if (
          retained.actorId !== actor.id ||
          retained.operation !== body.operation ||
          retained.orderId !== body.orderId ||
          retained.expectedVersion !== body.expectedVersion ||
          retained.payloadHash !== payloadHash
        )
          throw new AdministrationCommandConflictError();
        return mapAdministrationCommandResult(retained, true);
      }
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${body.orderId}::uuid FOR UPDATE`;
      const root = await tx.salesDraft.findUnique({
        where: { id: body.orderId },
        select: ADMINISTRATION_ORDER_SELECT,
      });
      if (!root) throw new OrderNotFoundError();
      if (root.status !== "SUBMITTED" || !root.order)
        throw new OrderStateConflictError();
      await tx.$queryRaw`SELECT id FROM sales_order_pieces WHERE order_id=${body.orderId}::uuid ORDER BY id FOR UPDATE`;
      const occurredAt = this.now();
      if (!Number.isFinite(occurredAt.getTime()))
        throw new InternalServerError("The command clock is invalid.");
      if (body.operation === "ADMIN_CANCEL") {
        const plan = planAdministrativeCancellation({
          root,
          body,
          actor,
          occurredAt,
        });
        await persistAdministrationCommand(tx, {
          plan,
          actor,
          occurredAt,
          payloadHash,
        });
        await applyAdministrativeCancellation(tx, { root, plan });
      } else {
        if (root.version !== body.expectedVersion)
          throw new OrderVersionConflictError();
        const paper = body.patch.paper
          ? await planAdministrationPaper(tx, root, body.patch.paper)
          : undefined;
        const plan = planAdministrativeCorrection({
          root,
          body,
          actor,
          occurredAt,
          effective: mapAdministrationCommandFacts(root).correction,
          paper,
        });
        await persistAdministrationCommand(tx, {
          plan,
          actor,
          occurredAt,
          payloadHash,
        });
        await applyAdministrativeCorrection(tx, { root, plan });
      }
      const stored = await tx.administrationCommand.findUniqueOrThrow({
        where: { commandId: body.commandId },
        select: ADMINISTRATION_COMMAND_SELECT,
      });
      return mapAdministrationCommandResult(stored, false);
    });
  }
  async observe(
    actorId: string,
    commandId: string,
  ): Promise<AdministrationCommandData> {
    const id = salesUuidSchema.parse(commandId);
    return this.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      await lockAdministrationCommandIds(tx, [id]);
      const retained = await tx.administrationCommand.findUnique({
        where: { commandId: id },
        select: ADMINISTRATION_COMMAND_SELECT,
      });
      if (!retained || retained.actorId !== actor.id)
        throw new AdministrationCommandNotFoundError();
      return mapAdministrationCommandResult(retained, true);
    });
  }
  private async lockActor(tx: Prisma.TransactionClient, actorId: string) {
    await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
    await tx.$queryRaw`SELECT set_config('statement_timeout','8000ms',true)`;
    await lockAccountRows(tx, [actorId], "read");
    const actor = await loadIdentityAccount(tx, actorId);
    assertBusinessAuthority(actor);
    if (actor.role !== "ADMIN") throw new ForbiddenException();
    return actor;
  }
  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new AdministrationTransactionConflictError();
        if (
          isSalesTransactionConflict(error) ||
          isSalesCommandIdConflict(error)
        ) {
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
