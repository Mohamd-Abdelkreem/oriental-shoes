import {
  findOrderActivity,
  findSalesActivityEvent,
} from "./order-activity.queries.js";
import type { Prisma } from "@template/database";
import type { P04ReturnProof } from "./sales-orders.types.js";

import {
  normalizeSaudiCustomerPhone,
  salesUuidSchema,
  type SalesOrderDto,
  type SalesOrderListQuery,
  type SalesOrderListData,
  type SalesDashboardData,
  type SalesOrderEditorData,
  type CustomerOrdersQuery,
  type CustomerOrdersData,
  type CustomerOrderMeasurementsQuery,
  type CustomerOrderMeasurementsData,
} from "@template/contracts";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { CUSTOMER_SUMMARY_SELECT } from "../customers/customers.mapper.js";
import { mapDraft } from "../sales-drafts/sales-drafts.mapper.js";
import { getDraftReadiness } from "../sales-drafts/sales-drafts.queries.js";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
  mapSalesOrderSummary,
} from "./sales-orders.mapper.js";
import { OrderNotFoundError } from "./sales-orders.errors.js";

import {
  salesOrderRevisionDataSchema,
  draftSchema,
  salesOrderSchema,
  type SalesOrderActivityQuery,
  type SalesOrderActivityData,
} from "@template/contracts";
import { OrderRevisionNotFoundError } from "./sales-orders.errors.js";

type ReturnProofRecord = {
  status: "DRAFT" | "SUBMITTED";
  version: number;
  order: {
    status: string;
    currentReturnDecisionId: string | null;
    currentReturnOrderVersion: number | null;
    currentReturnReason: string | null;
    currentReturnedAt: Date | null;
  } | null;
} | null;
export const mapCurrentOrderReturnProof = (
  root: ReturnProofRecord,
  orderId: string,
): P04ReturnProof | null => {
  const proof = root?.order;
  if (
    root === null ||
    root.status !== "SUBMITTED" ||
    proof === undefined ||
    proof === null ||
    proof.status !== "RETURNED" ||
    proof.currentReturnDecisionId === null ||
    proof.currentReturnReason === null ||
    proof.currentReturnReason.trim().length === 0 ||
    proof.currentReturnedAt === null ||
    proof.currentReturnOrderVersion !== root.version
  )
    return null;
  return {
    orderId,
    decisionId: proof.currentReturnDecisionId,
    orderVersion: root.version,
    reason: proof.currentReturnReason,
    returnedAt: proof.currentReturnedAt,
  };
};
// Caller owns authority and the root lock. This reader grants neither.
export const readCurrentOrderReturnProof = async (
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<P04ReturnProof | null> => {
  const root = await tx.salesDraft.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      version: true,
      order: {
        select: {
          status: true,
          currentReturnDecisionId: true,
          currentReturnOrderVersion: true,
          currentReturnReason: true,
          currentReturnedAt: true,
        },
      },
    },
  });
  return mapCurrentOrderReturnProof(root, orderId);
};

export const orderOwnerScope = (
  actor: AuthorityAccount,
): Prisma.SalesDraftWhereInput =>
  actor.role === "ADMIN" ? {} : { ownerId: actor.id };
const READ_ROOT_SELECT = {
  ...SALES_ORDER_SELECT,
  paidAmount: true,
  customer: { select: CUSTOMER_SUMMARY_SELECT },
} satisfies Prisma.SalesDraftSelect;
type ReadRoot = Prisma.SalesDraftGetPayload<{
  select: typeof READ_ROOT_SELECT;
}>;
const escapeSearch = (text: string) =>
  text.replace(/[\\%_]/gu, (character) => `\\${character}`);
const baseOrderScope = (
  actor: AuthorityAccount,
  query: SalesOrderListQuery,
): Prisma.SalesDraftWhereInput => {
  const where: Prisma.SalesDraftWhereInput = {
    ...orderOwnerScope(actor),
    ...(query.customerId === undefined ? {} : { customerId: query.customerId }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  if (query.search !== undefined) {
    const search = escapeSearch(query.search),
      uuid = salesUuidSchema.safeParse(query.search),
      phone = normalizeSaudiCustomerPhone(query.search);
    where.OR = [
      ...(uuid.success ? [{ id: uuid.data }] : []),
      { order: { businessNumber: { contains: search, mode: "insensitive" } } },
      { order: { customerName: { contains: search, mode: "insensitive" } } },
      {
        order: {
          customerPhone: { contains: escapeSearch(phone ?? query.search) },
        },
      },
      {
        status: "DRAFT",
        customer: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: escapeSearch(phone ?? query.search) } },
          ],
        },
      },
      {
        pieces: {
          some: {
            removedAt: null,
            model: { contains: search, mode: "insensitive" },
          },
        },
      },
    ];
  }
  return where;
};
const selectedStatus = (
  status: SalesOrderListQuery["status"],
): Prisma.SalesDraftWhereInput =>
  status === undefined
    ? {}
    : status === "DRAFT"
      ? { status: "DRAFT" }
      : { status: "SUBMITTED", order: { status } };
const listProjection = (
  row: ReadRoot,
  actor: AuthorityAccount,
  readiness: Awaited<ReturnType<typeof getDraftReadiness>>,
): SalesOrderListData["items"][number] => {
  if (row.status === "SUBMITTED")
    return {
      kind: "submitted",
      order: mapSalesOrderSummary(row, actor),
    };
  const draft = mapDraft(row, readiness);
  return {
    kind: "draft",
    draft: {
      id: draft.id,
      version: draft.version,
      status: "DRAFT",
      owner: draft.owner,
      type: draft.type,
      customer: draft.customer,
      deliveryDate: draft.deliveryDate,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      pieceCount: draft.pieces.length,
      pricing: draft.pricing,
      submission: draft.submission,
    },
  };
};
export const findSalesOrderList = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: SalesOrderListQuery,
): Promise<SalesOrderListData> => {
  const page = parsePaginationQuery(query),
    base = baseOrderScope(actor, query),
    where = { AND: [base, selectedStatus(query.status)] };
  const readiness = await getDraftReadiness(tx);
  const totalOrders = await tx.salesDraft.count({ where: base }),
    totalPieces = await tx.salesDraftPiece.count({
      where: { removedAt: null, draft: base },
    }),
    total = await tx.salesDraft.count({ where });
  const statusCounts: SalesOrderListData["statusCounts"] = {
    DRAFT: await tx.salesDraft.count({
      where: { AND: [base, { status: "DRAFT" }] },
    }),
    AWAITING_APPROVAL: 0,
    RETURNED: 0,
    APPROVED: 0,
    READY_FOR_DELIVERY: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERY_FAILED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  const groups = await tx.salesOrder.groupBy({
    by: ["status"],
    where: { draft: base },
    _count: { _all: true },
  });
  for (const group of groups) statusCounts[group.status] = group._count._all;
  const rows = await tx.salesDraft.findMany({
    where,
    select: READ_ROOT_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
  });
  return {
    items: rows.map((row) => listProjection(row, actor, readiness)),
    pagination: buildPaginationMeta({ ...page, total }),
    totalOrders,
    totalPieces,
    statusCounts,
  };
};
export const findSalesDashboard = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
): Promise<SalesDashboardData> => {
  const page = await findSalesOrderList(tx, actor, {
    page: 1,
    limit: 5,
    search: undefined,
  });
  return {
    counts: {
      totalOrders: page.totalOrders,
      totalPieces: page.totalPieces,
      drafts: page.statusCounts.DRAFT,
      draftPieces: await tx.salesDraftPiece.count({
        where: {
          removedAt: null,
          draft: { ...orderOwnerScope(actor), status: "DRAFT" },
        },
      }),
      awaitingApproval: page.statusCounts.AWAITING_APPROVAL,
      returned: page.statusCounts.RETURNED,
      approved: page.statusCounts.APPROVED,
    },
    recentOrders: page.items,
  };
};
export const findSalesOrderEditor = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<SalesOrderEditorData> => {
  const row = await tx.salesDraft.findFirst({
    where: { id: orderId, ...orderOwnerScope(actor) },
    select: READ_ROOT_SELECT,
  });
  if (row === null) throw new OrderNotFoundError();
  return row.status === "DRAFT"
    ? { kind: "draft", draft: mapDraft(row, await getDraftReadiness(tx)) }
    : { kind: "submitted", order: mapSalesOrder(row, actor) };
};
export const findSalesOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<SalesOrderDto> => {
  const row = await tx.salesDraft.findFirst({
    where: { id: orderId, status: "SUBMITTED", ...orderOwnerScope(actor) },
    select: SALES_ORDER_SELECT,
  });
  if (row === null) throw new OrderNotFoundError();
  return mapSalesOrder(row, actor);
};
export const findCustomerOrders = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  customerId: string,
  query: CustomerOrdersQuery,
): Promise<CustomerOrdersData> => {
  const page = parsePaginationQuery(query),
    where: Prisma.SalesDraftWhereInput = {
      ...orderOwnerScope(actor),
      customerId,
      status: "SUBMITTED",
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.status === undefined
        ? {}
        : { order: { status: query.status } }),
    };
  const totalOrders = await tx.salesDraft.count({ where }),
    totalPieces = await tx.salesDraftPiece.count({
      where: { removedAt: null, draft: where },
    });
  const rows = await tx.salesDraft.findMany({
    where,
    select: SALES_ORDER_SELECT,
    orderBy: [{ order: { submittedAt: "desc" } }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
  });
  return {
    orders: rows.map((row) => mapSalesOrderSummary(row, actor)),
    pagination: buildPaginationMeta({ ...page, total: totalOrders }),
    totalOrders,
    totalPieces,
  };
};
export const findCustomerOrderMeasurements = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  customerId: string,
  query: CustomerOrderMeasurementsQuery,
): Promise<CustomerOrderMeasurementsData> => {
  const page = parsePaginationQuery(query),
    where: Prisma.SalesDraftPieceWhereInput = {
      removedAt: null,
      draft: { ...orderOwnerScope(actor), status: "SUBMITTED", customerId },
    };
  const total = await tx.salesDraftPiece.count({ where });
  const rows = await tx.salesDraftPiece.findMany({
    where,
    select: {
      id: true,
      model: true,
      size: true,
      aField: true,
      fField: true,
      position: true,
      orderPiece: { select: { stage: true } },
      draft: {
        select: {
          id: true,
          version: true,
          order: { select: { businessNumber: true, submittedAt: true } },
        },
      },
    },
    orderBy: [
      { draft: { order: { submittedAt: "desc" } } },
      { draftId: "desc" },
      { position: "asc" },
      { id: "asc" },
    ],
    skip: page.skip,
    take: page.take,
  });
  return {
    measurements: rows.map((row) => {
      if (row.draft.order === null || row.orderPiece === null)
        throw new OrderNotFoundError();
      return {
        source: "SUBMITTED",
        orderId: row.draft.id,
        orderVersion: row.draft.version,
        businessNumber: row.draft.order.businessNumber,
        pieceId: row.id,
        submittedAt: row.draft.order.submittedAt.toISOString(),
        model: row.model,
        size: row.size,
        aField: row.aField,
        fField: row.fField,
        cancelled: row.orderPiece.stage === "CANCELLED",
      };
    }),
    pagination: buildPaginationMeta({ ...page, total }),
  };
};
export const findSalesOrderActivity = (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: SalesOrderActivityQuery,
  orderId?: string,
): Promise<SalesOrderActivityData> =>
  findOrderActivity(
    tx,
    actor.role === "ADMIN"
      ? { kind: "APPROVAL" }
      : { kind: "OWNER", ownerId: actor.id },
    query,
    orderId,
  );
export const findSalesOrderRevision = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
  eventId: string,
) => {
  try {
    await findSalesOrder(tx, actor, orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError)
      throw new OrderRevisionNotFoundError();
    throw error;
  }
  const receipt = await tx.salesCommand.findFirst({
    where: {
      draftId: orderId,
      commandId: eventId,
      operation: {
        in: [
          "SUBMIT_NEW_ORDER",
          "SUBMIT_DRAFT",
          "RESUBMIT_ORDER",
          "SET_ORDER_PAID",
        ],
      },
    },
    select: { operation: true, before: true, after: true },
  });
  if (receipt === null) throw new OrderRevisionNotFoundError();
  const summary = await findSalesActivityEvent(
    tx,
    actor.role === "ADMIN"
      ? { kind: "APPROVAL" }
      : { kind: "OWNER", ownerId: actor.id },
    orderId,
    eventId,
  );
  if (summary?.kind !== "order") throw new OrderRevisionNotFoundError();
  const before =
    receipt.operation === "SUBMIT_NEW_ORDER"
      ? null
      : receipt.operation === "SUBMIT_DRAFT"
        ? { kind: "draft" as const, draft: draftSchema.parse(receipt.before) }
        : {
            kind: "order" as const,
            order: salesOrderSchema.parse(receipt.before),
          };
  return salesOrderRevisionDataSchema.parse({
    event: summary.event,
    before,
    after: salesOrderSchema.parse(receipt.after),
  });
};
