import {
  findOrderActivity,
  findSalesActivityEvent,
} from "./order-activity.queries.js";
import { Prisma } from "@template/database";
import type { P04ReturnProof } from "./sales-orders.types.js";

import {
  normalizeSaudiCustomerPhone,
  parseDraftReferenceSuffix,
  parseDraftSequence,
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
import {
  DRAFT_REFERENCE_SELECT,
  mapDraft,
  mapDraftSequence,
} from "../sales-drafts/sales-drafts.mapper.js";
import { getDraftReadiness } from "../sales-drafts/sales-drafts.queries.js";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
  mapSalesOrderSummary,
} from "./sales-orders.mapper.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { OrderNotFoundError } from "./sales-orders.errors.js";

import {
  salesOrderRevisionDataSchema,
  draftSchema,
  retainedSalesOrderSchema,
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
  reference: DRAFT_REFERENCE_SELECT,
  customer: { select: CUSTOMER_SUMMARY_SELECT },
} satisfies Prisma.SalesDraftSelect;
type ReadRoot = Prisma.SalesDraftGetPayload<{
  select: typeof READ_ROOT_SELECT;
}>;
const escapeSearch = (text: string) =>
  text.replace(/[\\%_]/gu, (character) => `\\${character}`);
const listCohortSql = (actor: AuthorityAccount, query: SalesOrderListQuery) => {
  const search =
      query.search === undefined ? null : `%${escapeSearch(query.search)}%`,
    phone =
      query.search === undefined
        ? null
        : `%${escapeSearch(normalizeSaudiCustomerPhone(query.search) ?? query.search)}%`,
    uuid = salesUuidSchema.safeParse(query.search),
    draftReference = parseDraftReferenceSuffix(query.search ?? ""),
    draftSequence = parseDraftSequence(query.search ?? "");
  return Prisma.sql`SELECT d.id,d.updated_at,CASE WHEN d.status='DRAFT' THEN 'DRAFT' ELSE h.status::text END AS state,
    (SELECT count(*) FROM sales_draft_pieces pieces WHERE pieces.draft_id=d.id AND pieces.removed_at IS NULL) AS pieces
    FROM sales_drafts d LEFT JOIN sales_orders h ON h.id=d.id LEFT JOIN customers customer ON customer.id=d.customer_id
    LEFT JOIN LATERAL (SELECT customer_name,customer_phone FROM administration_order_corrections WHERE order_id=d.id ORDER BY after_version DESC,command_id DESC LIMIT 1) contact ON true
    WHERE ${actor.role === "ADMIN" ? Prisma.sql`true` : Prisma.sql`d.owner_id=${actor.id}::uuid`}
    AND ${query.customerId === undefined ? Prisma.sql`true` : Prisma.sql`d.customer_id=${query.customerId}::uuid`}
    AND ${query.type === undefined ? Prisma.sql`true` : Prisma.sql`d.type=${query.type}::sales_order_type`}
    AND ${
      search === null
        ? Prisma.sql`true`
        : Prisma.sql`(
      ${uuid.success ? Prisma.sql`d.id=${uuid.data}::uuid` : Prisma.sql`false`}
      OR ${draftReference === null ? Prisma.sql`false` : Prisma.sql`(d.status='DRAFT' AND right(d.id::text,${draftReference.length}::int)=${draftReference})`}
      OR ${draftSequence === null ? Prisma.sql`false` : Prisma.sql`(d.status='DRAFT' AND EXISTS(SELECT 1 FROM sales_draft_references r WHERE r.draft_id=d.id AND r.number=${draftSequence}))`}
      OR h.business_number ILIKE ${search} OR coalesce(contact.customer_name,h.customer_name) ILIKE ${search}
      OR coalesce(contact.customer_phone,h.customer_phone) LIKE ${phone}
      OR (d.status='DRAFT' AND (customer.name ILIKE ${search} OR customer.phone LIKE ${phone}))
      OR EXISTS(SELECT 1 FROM sales_draft_pieces piece WHERE piece.draft_id=d.id AND piece.removed_at IS NULL AND piece.model ILIKE ${search}))`
    }`;
};
const safeListCount = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InternalServerError("Order list count exceeds its safe range.");
  return Number(value);
};
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
      draftSequence: draft.draftSequence,
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
    cohort = listCohortSql(actor, query);
  const readiness = await getDraftReadiness(tx);
  const statusCounts: SalesOrderListData["statusCounts"] = {
    DRAFT: 0,
    AWAITING_APPROVAL: 0,
    RETURNED: 0,
    APPROVED: 0,
    READY_FOR_DELIVERY: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERY_FAILED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  const groups = await tx.$queryRaw<
    { state: keyof typeof statusCounts; orders: bigint; pieces: bigint }[]
  >(
    Prisma.sql`WITH cohort AS (${cohort}) SELECT state,count(*) AS orders,sum(pieces)::bigint AS pieces FROM cohort GROUP BY state`,
  );
  let orderCount = 0n,
    pieceCount = 0n;
  for (const group of groups) {
    if (!Object.hasOwn(statusCounts, group.state))
      throw new InternalServerError(
        "An order list has an invalid current state.",
      );
    statusCounts[group.state] = safeListCount(group.orders);
    orderCount += group.orders;
    pieceCount += group.pieces;
  }
  const totalOrders = safeListCount(orderCount),
    totalPieces = safeListCount(pieceCount),
    total =
      query.status === undefined ? totalOrders : statusCounts[query.status];
  const ids = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`WITH cohort AS (${cohort}) SELECT id FROM cohort WHERE ${query.status === undefined ? Prisma.sql`true` : Prisma.sql`state=${query.status}`} ORDER BY updated_at DESC,id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const rows =
    ids.length === 0
      ? []
      : await tx.salesDraft.findMany({
          where: { id: { in: ids.map((row) => row.id) } },
          select: READ_ROOT_SELECT,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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
    select: {
      operation: true,
      before: true,
      after: true,
      draft: { select: { reference: DRAFT_REFERENCE_SELECT } },
    },
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
        ? {
            kind: "draft" as const,
            draft: {
              ...draftSchema.parse(receipt.before),
              draftSequence: mapDraftSequence(receipt.draft?.reference ?? null),
            },
          }
        : {
            kind: "order" as const,
            order: retainedSalesOrderSchema.parse(receipt.before),
          };
  return salesOrderRevisionDataSchema.parse({
    event: summary.event,
    before,
    after: retainedSalesOrderSchema.parse(receipt.after),
  });
};
