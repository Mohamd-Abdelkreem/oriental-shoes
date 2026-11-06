import { randomUUID } from "node:crypto";
import {
  MAX_DRAFT_PIECES,
  type CreateDraftBody,
  type DraftCapture,
  type DraftChangesData,
  type DraftChangesQuery,
  type DraftCommandData,
  type DraftData,
  type DraftListData,
  type DraftListQuery,
  type DraftPieceCapture,
  type SaveDraftBody,
} from "@template/contracts";
import {
  Department,
  Prisma,
  UserRole,
  type DatabaseClient,
} from "@template/database";
import { parseDateOnly } from "../../core/date-only.js";
import { ValidationException } from "../../core/errors/validation.error.js";
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
  DraftPieceConflictError,
  DraftStateConflictError,
  DraftVersionConflictError,
  isDraftPieceIdConflict,
} from "./sales-drafts.errors.js";
import { DRAFT_SELECT, mapDraft } from "./sales-drafts.mapper.js";
import {
  findDraftChanges,
  findDraftData,
  findDraftPage,
} from "./sales-drafts.queries.js";
import {
  classifyDraftPieces,
  type DraftPiecePlan,
} from "./sales-drafts.rules.js";

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
          const plan = await this.planPieces(tx, id, input.draft);
          await tx.salesDraft.create({
            data: {
              id,
              ownerId: actor.id,
              ...this.headerValues(input.draft),
              createdAt: occurredAt,
              updatedAt: occurredAt,
            },
          });
          await this.writePieces(tx, id, input.draft, plan, occurredAt);
          const row = await tx.salesDraft.findUniqueOrThrow({
            where: { id },
            select: DRAFT_SELECT,
          });
          return { before: null, after: mapDraft(row) };
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
          const before = mapDraft(
            await tx.salesDraft.findUniqueOrThrow({
              where: { id: draftId },
              select: DRAFT_SELECT,
            }),
          );
          const plan = await this.planPieces(tx, draftId, input.draft);
          await this.writePieces(tx, draftId, input.draft, plan, occurredAt);
          const changed = await tx.salesDraft.updateMany({
            where: {
              id: draftId,
              status: "DRAFT",
              version: input.expectedVersion,
              ...(actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id }),
            },
            data: {
              ...this.headerValues(input.draft),
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

  private headerValues(capture: DraftCapture) {
    return {
      type: capture.type,
      customerId: capture.customerId,
      deliveryDate:
        capture.deliveryDate === null
          ? null
          : parseDateOnly(capture.deliveryDate),
      generalNotes: capture.generalNotes,
      responsibleSignature: capture.responsibleSignature,
      repairNote: capture.repairNote,
      adjustmentRequested: capture.adjustmentRequested,
      adjustmentReason: capture.adjustmentReason,
      adjustmentActionTaken: capture.adjustmentActionTaken,
      paidAmount: capture.paidAmount,
    };
  }
  private pieceValues(piece: DraftPieceCapture) {
    return {
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
    };
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
  private async planPieces(
    tx: Prisma.TransactionClient,
    draftId: string,
    capture: DraftCapture,
  ): Promise<DraftPiecePlan> {
    if (capture.pieces.length < 1 || capture.pieces.length > MAX_DRAFT_PIECES)
      throw new ValidationException([
        {
          field: "body.draft.pieces",
          message: "A draft needs one through 200 pieces.",
        },
      ]);
    const ids = capture.pieces.map((piece) => piece.id);
    const existing = await tx.salesDraftPiece.findMany({
      where: { OR: [{ draftId, removedAt: null }, { id: { in: ids } }] },
      select: { id: true, draftId: true, removedAt: true },
    });
    const result = classifyDraftPieces(ids, existing, draftId);
    if (result.kind === "duplicate")
      throw new ValidationException([
        {
          field: "body.draft.pieces",
          message: "Piece identities must be distinct.",
        },
      ]);
    if (result.kind === "foreign") throw new DraftNotFoundError();
    if (result.kind === "removed") throw new DraftPieceConflictError();
    return result.plan;
  }
  private async writePieces(
    tx: Prisma.TransactionClient,
    draftId: string,
    capture: DraftCapture,
    plan: DraftPiecePlan,
    occurredAt: Date,
  ): Promise<void> {
    if (plan.removedIds.length > 0) {
      const removed = await tx.salesDraftPiece.updateMany({
        where: { draftId, id: { in: plan.removedIds }, removedAt: null },
        data: { removedAt: occurredAt, updatedAt: occurredAt },
      });
      if (removed.count !== plan.removedIds.length)
        throw new DraftNotFoundError();
    }
    const shifted = await tx.salesDraftPiece.updateMany({
      where: { draftId, removedAt: null },
      data: { position: { increment: MAX_DRAFT_PIECES } },
    });
    if (shifted.count !== plan.retainedIds.length)
      throw new DraftNotFoundError();
    const retained = new Set(plan.retainedIds),
      fresh = new Set(plan.newIds);
    const newRows: Prisma.SalesDraftPieceCreateManyInput[] = [];
    for (const [index, piece] of capture.pieces.entries()) {
      const data = this.pieceValues(piece),
        position = index + 1;
      if (retained.has(piece.id)) {
        const changed = await tx.salesDraftPiece.updateMany({
          where: { id: piece.id, draftId, removedAt: null },
          data: { ...data, position, updatedAt: occurredAt },
        });
        if (changed.count !== 1) throw new DraftNotFoundError();
      } else if (fresh.has(piece.id)) {
        newRows.push({
          id: piece.id,
          draftId,
          position,
          ...data,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
    }
    if (newRows.length > 0) {
      const added = await tx.salesDraftPiece.createMany({ data: newRows });
      if (added.count !== newRows.length) throw new DraftNotFoundError();
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
