import {
  normalizeSaudiCustomerPhone,
  MAX_DRAFT_PIECES,
  type CustomerData,
  type CustomerDraftsQuery,
  type CustomerDraftsData,
  type CustomerListData,
  type CustomerListQuery,
  type CustomerMeasurementsData,
  type CustomerMeasurementsQuery,
} from "@template/contracts";
import { UserRole, type Prisma } from "@template/database";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  CUSTOMER_SELECT,
  CUSTOMER_SUMMARY_SELECT,
  mapCustomer,
  mapCustomerSummary,
} from "./customers.mapper.js";

export type CustomerQueryClient = Pick<
  Prisma.TransactionClient,
  "customer" | "salesDraft" | "salesDraftPiece"
>;
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
const draftScope = (actor: AuthorityAccount): Prisma.SalesDraftWhereInput =>
  actor.role === UserRole.ADMIN ? {} : { ownerId: actor.id };
export const findCustomerPage = async (
  tx: CustomerQueryClient,
  actor: AuthorityAccount,
  query: CustomerListQuery,
): Promise<CustomerListData> => {
  const page = parsePaginationQuery(query);
  const search = query.search;
  const where: Prisma.CustomerWhereInput = {};
  if (search !== undefined) {
    const phone = phoneFragment(search);
    where.OR = [
      { name: { contains: escapeSearch(search), mode: "insensitive" } },
      { email: { contains: escapeSearch(search), mode: "insensitive" } },
      ...(phone === null ? [] : [{ phone: { contains: escapeSearch(phone) } }]),
    ];
  }
  const total = await tx.customer.count({ where });
  const rows = await tx.customer.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
    select: CUSTOMER_SUMMARY_SELECT,
  });
  const totalCustomers = await tx.customer.count();
  const related =
    rows.length === 0
      ? []
      : await tx.salesDraft.groupBy({
          by: ["customerId"],
          where: {
            ...draftScope(actor),
            customerId: { in: rows.map((row) => row.id) },
          },
          _count: { _all: true },
          _max: { updatedAt: true },
        });
  const relatedById = new Map(
    related.map((group) => [group.customerId, group]),
  );
  return {
    customers: rows.map((row) => {
      const group = relatedById.get(row.id);
      return {
        customer: mapCustomerSummary(row),
        draftCount: group?._count._all ?? 0,
        lastDraftAt: group?._max.updatedAt?.toISOString() ?? null,
      };
    }),
    pagination: buildPaginationMeta({ ...page, total }),
    totalCustomers,
  };
};
export const findCustomerMeasurements = async (
  tx: CustomerQueryClient,
  actor: AuthorityAccount,
  customerId: string,
  query: CustomerMeasurementsQuery,
): Promise<CustomerMeasurementsData> => {
  const page = parsePaginationQuery(query);
  const where: Prisma.SalesDraftPieceWhereInput = {
    removedAt: null,
    draft: { ...draftScope(actor), customerId },
    OR: [
      { size: { not: null } },
      { aField: { not: null } },
      { fField: { not: null } },
    ],
  };
  const total = await tx.salesDraftPiece.count({ where });
  const rows = await tx.salesDraftPiece.findMany({
    where,
    skip: page.skip,
    take: page.take,
    orderBy: [
      { draft: { updatedAt: "desc" } },
      { draft: { id: "desc" } },
      { position: "asc" },
    ],
    select: {
      id: true,
      model: true,
      size: true,
      aField: true,
      fField: true,
      draft: {
        select: {
          id: true,
          type: true,
          updatedAt: true,
          owner: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  return {
    measurements: rows.map((row) => ({
      draftId: row.draft.id,
      pieceId: row.id,
      owner: { id: row.draft.owner.id, fullName: row.draft.owner.fullName },
      type: row.draft.type,
      model: row.model,
      size: row.size,
      aField: row.aField,
      fField: row.fField,
      draftUpdatedAt: row.draft.updatedAt.toISOString(),
      source: "DRAFT",
    })),
    pagination: buildPaginationMeta({ ...page, total }),
  };
};
export const findCustomerData = async (
  tx: CustomerQueryClient,
  actor: AuthorityAccount,
  customerId: string,
): Promise<CustomerData | null> => {
  const row = await tx.customer.findUnique({
    where: { id: customerId },
    select: CUSTOMER_SELECT,
  });
  if (row === null) return null;
  const aggregate = await tx.salesDraft.aggregate({
    where: { ...draftScope(actor), customerId },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const history = await findCustomerMeasurements(tx, actor, customerId, {
    page: 1,
    limit: 1,
  });
  return {
    customer: mapCustomer(row),
    draftCount: aggregate._count._all,
    latestDraftAt: aggregate._max.updatedAt?.toISOString() ?? null,
    latestMeasurement: history.measurements[0] ?? null,
    submittedHistory: {
      availability: "not_available",
      reason: "P03_NOT_IMPLEMENTED",
    },
  };
};

export const findCustomerDraftPage = async (
  tx: CustomerQueryClient,
  actor: AuthorityAccount,
  customerId: string,
  query: CustomerDraftsQuery,
): Promise<CustomerDraftsData> => {
  const page = parsePaginationQuery(query),
    where = { ...draftScope(actor), customerId };
  const total = await tx.salesDraft.count({ where });
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
      generalNotes: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, fullName: true } },
      customer: { select: CUSTOMER_SUMMARY_SELECT },
      pieces: {
        where: { removedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        take: MAX_DRAFT_PIECES,
        select: {
          id: true,
          position: true,
          quantity: true,
          model: true,
          size: true,
          leatherBase: true,
        },
      },
    },
  });
  return {
    drafts: rows.map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      type: row.type,
      deliveryDate: serializeNullableDateOnly(row.deliveryDate),
      generalNotes: row.generalNotes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      owner: { id: row.owner.id, fullName: row.owner.fullName },
      customer: row.customer === null ? null : mapCustomerSummary(row.customer),
      pieceCount: row.pieces.length,
      pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
      submission: { available: false, reason: "P03_NOT_READY" },
      pieces: row.pieces.map((piece, index) => {
        if (piece.quantity !== 1)
          throw new InternalServerError("A draft piece has invalid quantity.");
        return {
          id: piece.id,
          position: index + 1,
          quantity: 1,
          model: piece.model,
          size: piece.size,
          leatherBase: piece.leatherBase,
        };
      }),
    })),
    pagination: buildPaginationMeta({ ...page, total }),
  };
};
