import {
  draftSchema,
  normalizeSaudiCustomerPhone,
  salesUuidSchema,
  type DraftChange,
  type DraftChangesData,
  type DraftChangesQuery,
  type DraftDto,
  type DraftListData,
  type DraftListQuery,
} from "@template/contracts";
import { UserRole, type Prisma } from "@template/database";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  CUSTOMER_SUMMARY_SELECT,
  mapCustomerSummary,
} from "../customers/customers.mapper.js";
import {
  mapSalesCommandResult,
  SALES_COMMAND_SELECT,
  type SalesCommandRecord,
} from "../sales-commands/sales-command.mapper.js";
import { DRAFT_SELECT, mapDraft } from "./sales-drafts.mapper.js";

export type DraftQueryClient = Pick<
  Prisma.TransactionClient,
  "customer" | "salesDraft" | "salesDraftPiece" | "salesCommand"
>;
const ownerScope = (actor: AuthorityAccount): Prisma.SalesDraftWhereInput =>
  actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id };
const escapeSearch = (value: string): string =>
  value.replace(/[\\%_]/gu, (character) => `\\${character}`);
const phoneFragment = (value: string): string | null => {
  const complete = normalizeSaudiCustomerPhone(value);
  if (complete !== null) return complete;
  const digits = value
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "\u06f0" ? 0x06f0 : 0x0660)),
    )
    .replace(/[\s()-]/gu, "");
  if (!/^\+?[0-9]+$/u.test(digits)) return null;
  if (digits.startsWith("00966")) return `+966${digits.slice(5)}`;
  if (digits.startsWith("+966")) return digits;
  return digits.startsWith("0") && digits.length > 1 ? digits.slice(1) : digits;
};
export const findDraftPage = async (
  tx: DraftQueryClient,
  actor: AuthorityAccount,
  query: DraftListQuery,
): Promise<DraftListData> => {
  const page = parsePaginationQuery(query);
  const base: Prisma.SalesDraftWhereInput = {
    ...ownerScope(actor),
    ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  const where: Prisma.SalesDraftWhereInput = { ...base };
  if (query.search !== undefined) {
    const search = escapeSearch(query.search),
      uuid = salesUuidSchema.safeParse(query.search),
      phone = phoneFragment(query.search);
    where.OR = [
      { customer: { name: { contains: search, mode: "insensitive" } } },
      {
        pieces: {
          some: {
            removedAt: null,
            model: { contains: search, mode: "insensitive" },
          },
        },
      },
      ...(phone === null
        ? []
        : [{ customer: { phone: { contains: escapeSearch(phone) } } }]),
      ...(uuid.success ? [{ id: uuid.data }] : []),
    ];
  }
  const total = await tx.salesDraft.count({ where }),
    totalDrafts = await tx.salesDraft.count({ where: base });
  const totalPieces = await tx.salesDraftPiece.count({
    where: { removedAt: null, draft: base },
  });
  const rows = await tx.salesDraft.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
    select: {
      id: true,
      version: true,
      status: true,
      type: true,
      deliveryDate: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, fullName: true } },
      customer: { select: CUSTOMER_SUMMARY_SELECT },
      _count: { select: { pieces: { where: { removedAt: null } } } },
    },
  });
  return {
    drafts: rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      type: row.type,
      deliveryDate: serializeNullableDateOnly(row.deliveryDate),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      owner: { id: row.owner.id, fullName: row.owner.fullName },
      customer: row.customer === null ? null : mapCustomerSummary(row.customer),
      pieceCount: row._count.pieces,
      pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
      submission: { available: false, reason: "P03_NOT_READY" },
    })),
    pagination: buildPaginationMeta({ ...page, total }),
    totalDrafts,
    totalPieces,
  };
};
export const findDraftData = async (
  tx: DraftQueryClient,
  actor: AuthorityAccount,
  draftId: string,
): Promise<DraftDto | null> => {
  const row = await tx.salesDraft.findFirst({
    where: { id: draftId, ...ownerScope(actor) },
    select: DRAFT_SELECT,
  });
  return row === null ? null : mapDraft(row);
};
const headerKeys = [
  "type",
  "customerId",
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
  "paidAmount",
] as const;
const headerValue = (
  draft: DraftDto,
  key: (typeof headerKeys)[number],
): string | null =>
  key === "customerId" ? (draft.customer?.id ?? null) : draft[key];
const mapChange = (row: SalesCommandRecord): DraftChange => {
  const result = mapSalesCommandResult(row, true);
  if (
    result.kind !== "draft" ||
    (row.operation !== "CREATE_DRAFT" && row.operation !== "SAVE_DRAFT")
  )
    throw new InternalServerError("A draft change has invalid operation.");
  const prior = row.before === null ? null : draftSchema.safeParse(row.before);
  if (prior !== null && !prior.success)
    throw new InternalServerError(
      "A draft change has invalid previous values.",
    );
  const before = prior?.data ?? null,
    after = result.savedDraft;
  const changedFields: DraftChange["changedFields"] = headerKeys.filter(
    (key) =>
      before === null || headerValue(before, key) !== headerValue(after, key),
  );
  if (
    before === null ||
    JSON.stringify(before.pieces) !== JSON.stringify(after.pieces)
  )
    changedFields.push("pieces");
  const beforeIds = new Set(before?.pieces.map((piece) => piece.id) ?? []),
    afterIds = new Set(after.pieces.map((piece) => piece.id));
  return {
    commandId: row.commandId,
    operation: row.operation,
    draftId: result.receipt.resourceId,
    actor: result.receipt.actor,
    occurredAt: result.receipt.occurredAt,
    beforeVersion: row.beforeVersion,
    afterVersion: row.afterVersion,
    changedFields,
    addedPieceIds: [...afterIds].filter((id) => !beforeIds.has(id)),
    removedPieceIds: [...beforeIds].filter((id) => !afterIds.has(id)),
  };
};
export const findDraftChanges = async (
  tx: DraftQueryClient,
  actor: AuthorityAccount,
  query: DraftChangesQuery,
  draftId?: string,
): Promise<DraftChangesData> => {
  const page = parsePaginationQuery(query);
  const where: Prisma.SalesCommandWhereInput = {
    operation: { in: ["CREATE_DRAFT", "SAVE_DRAFT"] },
    draft: {
      ...ownerScope(actor),
      ...(draftId === undefined ? {} : { id: draftId }),
    },
  };
  const total = await tx.salesCommand.count({ where });
  const rows = await tx.salesCommand.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { commandId: "desc" }],
    skip: page.skip,
    take: page.take,
    select: SALES_COMMAND_SELECT,
  });
  return {
    changes: rows.map(mapChange),
    pagination: buildPaginationMeta({ ...page, total }),
  };
};
