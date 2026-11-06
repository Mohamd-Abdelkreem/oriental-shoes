import { randomUUID } from "node:crypto";
import type {
  CreateDraftBody,
  DraftChangesData,
  DraftChangesQuery,
  DraftCommandData,
  DraftData,
  DraftListData,
  DraftListQuery,
  SaveDraftBody,
} from "@template/contracts";
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
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { CustomerNotFoundError } from "../customers/customers.errors.js";
import {
  hashSalesCommandIntent,
  type SalesCommandExecutor,
} from "../sales-commands/sales-command-executor.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesTransactionConflictError,
} from "../sales-commands/sales-command.errors.js";
import {
  DraftNotFoundError,
  DraftStateConflictError,
  DraftVersionConflictError,
  isDraftPieceIdConflict,
} from "./sales-drafts.errors.js";
import { DRAFT_SELECT, mapDraft } from "./sales-drafts.mapper.js";
import {
  findDraftChanges,
  findDraftData,
  findDraftPage,
  getDraftReadiness,
} from "./sales-drafts.queries.js";
import {
  toDraftCaptureHeaderValues,
  writeDraftCapture,
} from "./sales-draft-capture.writer.js";

export class SalesDraftsService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: SalesCommandExecutor,
  ) {}
  list(actorId: string, query: DraftListQuery): Promise<DraftListData> {
    return this.read(actorId, async (tx, actor) => {
      if (
        query.customerId !== undefined &&
        (await tx.customer.findUnique({
          where: { id: query.customerId },
          select: { id: true },
        })) === null
      )
        throw new CustomerNotFoundError();
      return findDraftPage(tx, actor, query);
    });
  }
  get(actorId: string, draftId: string): Promise<DraftData> {
    return this.read(actorId, async (tx, actor) => {
      const draft = await findDraftData(tx, actor, draftId);
      if (draft === null) throw new DraftNotFoundError();
      return { draft };
    });
  }
  changes(
    actorId: string,
    query: DraftChangesQuery,
    draftId?: string,
  ): Promise<DraftChangesData> {
    return this.read(actorId, async (tx, actor) => {
      if (draftId !== undefined) {
        const parent = await tx.salesDraft.findFirst({
          where: {
            id: draftId,
            status: "DRAFT",
            ...(actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id }),
          },
          select: { id: true },
        });
        if (parent === null) throw new DraftNotFoundError();
      }
      return findDraftChanges(tx, actor, query, draftId);
    });
  }
  async create(
    actorId: string,
    input: CreateDraftBody,
  ): Promise<DraftCommandData> {
    try {
      return await this.commands.execute({
        kind: "draft",
        operation: "CREATE_DRAFT",
        actorId,
        commandId: input.commandId,
        targetId: null,
        expectedVersion: null,
        payloadHash: hashSalesCommandIntent({
          operation: "CREATE_DRAFT",
          targetId: null,
          expectedVersion: null,
          payload: input.draft,
        }),
        work: async (tx, actor, occurredAt) => {
          const id = randomUUID();
          await this.lockCustomers(tx, [input.draft.customerId]);
          await tx.salesDraft.create({
            data: {
              id,
              ownerId: actor.id,
              ...toDraftCaptureHeaderValues(input.draft),
              createdAt: occurredAt,
              updatedAt: occurredAt,
            },
          });
          await writeDraftCapture(tx, {
            draftId: id,
            capture: input.draft,
            occurredAt,
            mode: "create",
          });
          const readiness = await getDraftReadiness(tx);
          const row = await tx.salesDraft.findUniqueOrThrow({
            where: { id },
            select: DRAFT_SELECT,
          });
          return { before: null, after: mapDraft(row, readiness) };
        },
      });
    } catch (error) {
      if (isDraftPieceIdConflict(error)) throw new DraftNotFoundError();
      throw error;
    }
  }
  async save(
    actorId: string,
    draftId: string,
    input: SaveDraftBody,
  ): Promise<DraftCommandData> {
    try {
      return await this.commands.execute({
        kind: "draft",
        operation: "SAVE_DRAFT",
        actorId,
        commandId: input.commandId,
        targetId: draftId,
        expectedVersion: input.expectedVersion,
        payloadHash: hashSalesCommandIntent({
          operation: "SAVE_DRAFT",
          targetId: draftId,
          expectedVersion: input.expectedVersion,
          payload: input.draft,
        }),
        work: async (tx, actor, occurredAt) => {
          const locked =
            actor.role === UserRole.ADMIN
              ? await tx.$queryRaw<
                  Array<{ id: string }>
                >`SELECT id FROM sales_drafts WHERE id=${draftId}::uuid FOR UPDATE`
              : await tx.$queryRaw<
                  Array<{ id: string }>
                >`SELECT id FROM sales_drafts WHERE id=${draftId}::uuid AND owner_id=${actor.id}::uuid FOR UPDATE`;
          if (locked.length !== 1) throw new DraftNotFoundError();
          const header = await tx.salesDraft.findUniqueOrThrow({
            where: { id: draftId },
            select: { customerId: true, status: true, version: true },
          });
          this.requireEditableState(header.status);
          if (
            header.version !== input.expectedVersion ||
            header.version === 2_147_483_647
          )
            throw new DraftVersionConflictError();
          await this.lockCustomers(tx, [
            header.customerId,
            input.draft.customerId,
          ]);
          const readiness = await getDraftReadiness(tx);
          const before = mapDraft(
            await tx.salesDraft.findUniqueOrThrow({
              where: { id: draftId },
              select: DRAFT_SELECT,
            }),
            readiness,
          );
          await writeDraftCapture(tx, {
            draftId,
            capture: input.draft,
            occurredAt,
            mode: "replace",
          });
          const changed = await tx.salesDraft.updateMany({
            where: {
              id: draftId,
              status: "DRAFT",
              version: input.expectedVersion,
              ...(actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id }),
            },
            data: {
              version: { increment: 1 },
              updatedAt: occurredAt,
            },
          });
          if (changed.count !== 1) throw new DraftVersionConflictError();
          const after = mapDraft(
            await tx.salesDraft.findUniqueOrThrow({
              where: { id: draftId },
              select: DRAFT_SELECT,
            }),
            readiness,
          );
          return { before, after };
        },
      });
    } catch (error) {
      if (isDraftPieceIdConflict(error)) throw new DraftNotFoundError();
      throw error;
    }
  }
  private requireEditableState(status: string): void {
    // Retain a runtime state guard as well as the conditional write predicate.
    if (status !== "DRAFT") throw new DraftStateConflictError();
  }

  private async lockCustomers(
    tx: Prisma.TransactionClient,
    ids: readonly (string | null)[],
  ): Promise<void> {
    const unique = [...new Set(ids.filter((id) => id !== null))].sort();
    for (const id of unique) {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM customers WHERE id=${id}::uuid FOR SHARE`;
      if (rows.length !== 1) throw new CustomerNotFoundError();
    }
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
