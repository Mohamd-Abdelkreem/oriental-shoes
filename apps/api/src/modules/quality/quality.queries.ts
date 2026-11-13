import {
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
  type QualityActivityData,
  type QualityOrderHistoryData,
  type QualityActivityQuery,
  type QualityOrderHistoryQuery,
} from "@template/contracts";
import { manufacturingSummarySql } from "../manufacturing/manufacturing.mapper.js";
import { qualitySummarySql, qualityReportChildSql } from "./quality.mapper.js";
import {
  qualityDashboardDataSchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityOrderDataSchema,
  qualityOrderHeaderSchema,
  qualityInspectionSummarySchema,
  qualityPackingGroupSchema,
  factoryOrderPaperDataSchema,
  type QualityDashboardData,
  type QualityOrdersData,
  type QualityPiecesData,
  type QualityOrderData,
  type QualityOrdersQuery,
  type QualityPiecesQuery,
  type QualityView,
  type QualityOrderHeader,
  type QualityInspectionSummary,
  type QualityPackingGroup,
} from "@template/contracts";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { deriveOrderCounts } from "../sales-orders/sales-orders.rules.js";
import { findIssueInstructions } from "../approval/approval.queries.js";
import {
  MANUFACTURING_ORDER_SELECT,
  mapManufacturingPaperPiece,
} from "../manufacturing/manufacturing.mapper.js";
import {
  mapQualityPieceContext,
  mapQualityPaper,
  qualityPackingSummarySql,
} from "./quality.mapper.js";
import type { QualityCommandOperation } from "@template/contracts";
import { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { SALES_ORDER_SELECT } from "../sales-orders/sales-orders.mapper.js";
import { MANUFACTURING_PHYSICAL_PIECE_SELECT } from "../manufacturing/manufacturing.mapper.js";
import {
  OrderNotFoundError,
  OrderStateConflictError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import {
  QUALITY_ARRIVAL_SELECT,
  QUALITY_CORRECTION_SELECT,
  QUALITY_CURRENT_ISSUE_SELECT,
  QUALITY_VISIT_SELECT,
  mapQualityArrival,
  type QualityPhysicalPieceRecord,
} from "./quality.mapper.js";
import type {
  CanonicalQualityOrder,
  LockedQualityOrder,
  QualityLastActionRecord,
  QualityPieceContextRecord,
} from "./quality.types.js";

// p is a fixed query-owned alias. Every historical branch binds the same physical identity.
export const qualityPieceRelationSql = (): Prisma.Sql => Prisma.sql`(
 p.stage='QUALITY' OR EXISTS (SELECT 1 FROM quality_work_visits v WHERE v.piece_id=p.id AND v.order_id=p.order_id)
 OR EXISTS (SELECT 1 FROM quality_piece_events e WHERE e.piece_id=p.id AND e.order_id=p.order_id)
 OR EXISTS (SELECT 1 FROM quality_correction_cycles q WHERE q.piece_id=p.id AND q.order_id=p.order_id)
 OR EXISTS (SELECT 1 FROM manufacturing_piece_events e JOIN manufacturing_commands c ON c.command_id=e.command_id
 WHERE e.piece_id=p.id AND e.order_id=p.order_id AND c.department='PRODUCTION' AND c.operation='COMPLETE_TRANSFER' AND e.after_stage='QUALITY')
 OR EXISTS (SELECT 1 FROM manufacturing_issues i JOIN approval_commands c ON c.command_id=i.reported_command_id
 WHERE i.piece_id=p.id AND i.order_id=p.order_id AND i.source_department='QUALITY' AND c.operation='REPORT_ISSUE' AND c.order_id=p.order_id AND c.piece_id=p.id)
)`;
export const loadQualityPieceContexts = async (
  tx: Prisma.TransactionClient,
  pieces: readonly QualityPhysicalPieceRecord[],
  orderStatuses: ReadonlyMap<string, QualityPieceContextRecord["orderStatus"]>,
): Promise<QualityPieceContextRecord[]> => {
  if (pieces.length === 0) return [];
  const ids = pieces.map((p) => p.id),
    sqlIds = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  const latest = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT DISTINCT ON (piece_id) id FROM quality_work_visits WHERE piece_id IN (${sqlIds}) ORDER BY piece_id,sequence DESC`,
  );
  const visits =
    latest.length === 0
      ? []
      : await tx.qualityWorkVisit.findMany({
          where: { id: { in: latest.map((v) => v.id) } },
          select: QUALITY_VISIT_SELECT,
        });
  const visitByPiece = new Map(visits.map((v) => [v.pieceId, v]));
  const actions = await tx.$queryRaw<
    Array<QualityLastActionRecord & { pieceId: string }>
  >(Prisma.sql`
 SELECT DISTINCT ON(e.piece_id) e.piece_id AS "pieceId",g.event_id AS "eventId",c.command_id AS "commandId",c.operation,c.actor_id AS "actorId",c.actor_full_name AS "actorFullName",c.actor_role AS "actorRole",c.actor_department AS "actorDepartment",c.occurred_at AS "occurredAt"
 FROM quality_piece_events e JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id JOIN quality_commands c ON c.command_id=e.command_id
 WHERE e.piece_id IN (${sqlIds}) ORDER BY e.piece_id,g.after_version DESC,e.id DESC`);
  const actionByPiece = new Map(actions.map((a) => [a.pieceId, a]));
  const cycles = await tx.qualityCorrectionCycle.findMany({
    where: { pieceId: { in: ids }, state: "OPEN" },
    select: QUALITY_CORRECTION_SELECT,
  });
  const cycleByPiece = new Map(cycles.map((c) => [c.pieceId, c]));
  const issueIds = pieces.flatMap((p) =>
    p.issueId === null ? [] : [p.issueId],
  );
  const issues =
    issueIds.length === 0
      ? []
      : await tx.manufacturingIssue.findMany({
          where: { id: { in: issueIds } },
          select: QUALITY_CURRENT_ISSUE_SELECT,
        });
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const arrivalIds = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT DISTINCT ON(e.piece_id) e.id FROM manufacturing_piece_events e JOIN manufacturing_commands c ON c.command_id=e.command_id JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id WHERE e.piece_id IN (${sqlIds}) AND c.department='PRODUCTION' AND c.operation='COMPLETE_TRANSFER' AND e.before_stage='PRODUCTION' AND e.after_stage='QUALITY' ORDER BY e.piece_id,g.after_version DESC,e.id DESC`,
  );
  const arrivals =
    arrivalIds.length === 0
      ? []
      : await tx.manufacturingPieceEvent.findMany({
          where: { id: { in: arrivalIds.map((e) => e.id) } },
          select: QUALITY_ARRIVAL_SELECT,
        });
  const arrivalByPiece = new Map(
    arrivals.map((e) => [e.pieceId, mapQualityArrival(e)]),
  );
  return pieces.map((piece) => {
    const orderStatus = orderStatuses.get(piece.orderId);
    if (orderStatus === undefined)
      throw new InternalServerError(
        "A quality piece has no selected order header.",
      );
    return {
      piece,
      orderStatus,
      visit: visitByPiece.get(piece.id) ?? null,
      lastAction: actionByPiece.get(piece.id) ?? null,
      correction: cycleByPiece.get(piece.id) ?? null,
      issue:
        piece.issueId === null ? null : (issueById.get(piece.issueId) ?? null),
      productionArrival: arrivalByPiece.get(piece.id) ?? null,
    };
  });
};
export const lockQualityOrders = async (
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorityAccount;
    operation: QualityCommandOperation;
    orders: readonly CanonicalQualityOrder[];
  },
): Promise<LockedQualityOrder[]> => {
  assertBusinessAuthority(input.actor, "QUALITY");
  const orders = [...input.orders].sort((a, b) =>
    a.orderId.localeCompare(b.orderId),
  );
  for (const order of orders) {
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM sales_drafts WHERE id=${order.orderId}::uuid AND status='SUBMITTED' FOR UPDATE`;
    if (locked.length !== 1) throw new OrderNotFoundError();
  }
  const roots = await tx.salesDraft.findMany({
    where: { id: { in: orders.map((o) => o.orderId) }, status: "SUBMITTED" },
    select: SALES_ORDER_SELECT,
  });
  const rootById = new Map(roots.map((r) => [r.id, r]));
  const ids = orders.flatMap((o) => o.pieceIds);
  const visible = await tx.$queryRaw<Array<{ id: string; orderId: string }>>(
    Prisma.sql`SELECT p.id,p.order_id AS "orderId" FROM sales_order_pieces p WHERE p.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND ${input.actor.role === "ADMIN" ? Prisma.sql`TRUE` : qualityPieceRelationSql()}`,
  );
  const visibleById = new Map(visible.map((p) => [p.id, p.orderId]));
  for (const order of orders) {
    const root = rootById.get(order.orderId);
    if (
      root === undefined ||
      root.order === null ||
      order.pieceIds.some((id) => visibleById.get(id) !== order.orderId)
    )
      throw new OrderNotFoundError();
  }
  for (const order of orders) {
    const root = rootById.get(order.orderId);
    if (root === undefined || root.order === null)
      throw new InternalServerError("A locked quality root is missing.");
    const delta =
      input.operation === "REPORT_ISSUES" ? order.pieceIds.length : 1;
    if (
      root.version !== order.expectedVersion ||
      root.version + delta > 2147483647
    )
      throw new OrderVersionConflictError();
    if (root.order.status !== "APPROVED") throw new OrderStateConflictError();
  }
  const physical = await tx.salesOrderPiece.findMany({
    where: { id: { in: ids } },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  const contexts = await loadQualityPieceContexts(
    tx,
    physical,
    new Map(
      roots.flatMap((r) =>
        r.order === null ? [] : [[r.id, r.order.status] as const],
      ),
    ),
  );
  const contextById = new Map(contexts.map((c) => [c.piece.id, c]));
  return orders.map((order) => {
    const root = rootById.get(order.orderId);
    if (root === undefined)
      throw new InternalServerError("A locked quality root disappeared.");
    return {
      id: root.id,
      version: root.version,
      root,
      pieces: order.pieceIds.map((id) => {
        const context = contextById.get(id);
        if (context === undefined)
          throw new InternalServerError(
            "A selected quality piece disappeared.",
          );
        return context;
      }),
    };
  });
};

// Fixed aliases are shared by count/page queries; each source row is one physical piece.
const qualityQueueSource = Prisma.sql`
 FROM sales_order_pieces p JOIN sales_drafts d ON d.id=p.order_id
 JOIN sales_orders h ON h.id=d.id JOIN sales_draft_pieces specification ON specification.id=p.id
 LEFT JOIN quality_work_visits open_visit ON open_visit.piece_id=p.id AND open_visit.order_id=p.order_id AND open_visit.ended_at IS NULL
 LEFT JOIN quality_correction_cycles cycle ON cycle.piece_id=p.id AND cycle.order_id=p.order_id AND cycle.state='OPEN'
 LEFT JOIN LATERAL (SELECT e.decision FROM quality_piece_events e
   JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   WHERE e.piece_id=p.id AND e.order_id=p.order_id AND e.decision IS NOT NULL
   ORDER BY g.after_version DESC,e.id DESC LIMIT 1) inspection ON true
 LEFT JOIN LATERAL (SELECT c.actor_full_name,c.occurred_at FROM quality_piece_events e
   JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   JOIN quality_commands c ON c.command_id=e.command_id
   WHERE e.piece_id=p.id AND e.order_id=p.order_id ORDER BY g.after_version DESC,e.id DESC LIMIT 1) action ON true
 LEFT JOIN LATERAL (SELECT c.occurred_at FROM manufacturing_piece_events e
   JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   JOIN manufacturing_commands c ON c.command_id=e.command_id
   WHERE e.piece_id=p.id AND e.order_id=p.order_id AND c.department='PRODUCTION'
   AND c.operation='COMPLETE_TRANSFER' AND e.before_stage='PRODUCTION' AND e.after_stage='QUALITY'
   ORDER BY g.after_version DESC,e.id DESC LIMIT 1) arrival ON true`;
const actionableQualitySql = Prisma.sql`h.status='APPROVED' AND p.stage='QUALITY'
 AND p.issue_id IS NULL AND p.received_at IS NULL AND p.cancelled_at IS NULL
 AND p.cancellation_reason IS NULL AND p.current_work_visit_id IS NULL`;
const qualityViewSql = (view: QualityView | "ACTIVE") => {
  const incoming = Prisma.sql`(${actionableQualitySql}) AND p.work_state='INCOMING' AND open_visit.id IS NULL`;
  const inspection = Prisma.sql`(${actionableQualitySql}) AND p.work_state='IN_PROGRESS' AND open_visit.id IS NOT NULL`;
  switch (view) {
    case "INCOMING":
      return incoming;
    case "INSPECTION":
      return inspection;
    case "ACCEPTED":
      return Prisma.sql`inspection.decision='ACCEPT'`;
    case "CORRECTIONS":
      return Prisma.sql`cycle.id IS NOT NULL`;
    case "ACTIVE":
      return Prisma.sql`((${incoming}) OR (${inspection}))`;
  }
};
const qualityLastWorkSql = Prisma.sql`greatest(action.occurred_at,arrival.occurred_at)`;
type QualityQueueFilter = Partial<
  Pick<QualityOrdersQuery, "type" | "search">
> & { view: QualityView | "ACTIVE"; orderId?: string | undefined };
const qualitySearchSql = (search: string) => {
  const pattern = `%${search.replace(/[\\%_]/gu, "\\$&")}%`;
  return Prisma.sql`(h.business_number ILIKE ${pattern} OR d.id::text ILIKE ${pattern}
 OR h.customer_name ILIKE ${pattern} OR specification.model ILIKE ${pattern}
 OR p.id::text ILIKE ${pattern} OR action.actor_full_name ILIKE ${pattern})`;
};
const filteredQualityQueue = (query: QualityQueueFilter) => Prisma.sql`
 ${qualityQueueSource} WHERE d.status='SUBMITTED' AND p.stage<>'CANCELLED'
 AND p.cancelled_at IS NULL AND ${qualityPieceRelationSql()} AND (${qualityViewSql(query.view)})
 ${query.type === undefined ? Prisma.empty : Prisma.sql`AND d.type::text=${query.type}`}
 ${query.orderId === undefined ? Prisma.empty : Prisma.sql`AND p.order_id=${query.orderId}::uuid`}
 ${query.search === undefined ? Prisma.empty : Prisma.sql`AND ${qualitySearchSql(query.search)}`}`;
const qualityQueueCounts = async (
  tx: Prisma.TransactionClient,
  query: QualityQueueFilter,
) => {
  const [counts] = await tx.$queryRaw<
    Array<{ orders: number; pieces: number }>
  >(Prisma.sql`
 SELECT count(DISTINCT p.order_id)::int AS orders,count(*)::int AS pieces ${filteredQualityQueue(query)}`);
  if (counts === undefined)
    throw new InternalServerError("Quality queue counts are unavailable.");
  return counts;
};
const loadQualityHeaders = async (
  tx: Prisma.TransactionClient,
  ids: readonly string[],
) => {
  if (ids.length === 0) return new Map<string, QualityOrderHeader>();
  const roots = await tx.salesDraft.findMany({
    where: { id: { in: [...ids] }, status: "SUBMITTED" },
    select: {
      id: true,
      version: true,
      type: true,
      deliveryDate: true,
      order: MANUFACTURING_ORDER_SELECT.order,
    },
  });
  const physical = await tx.salesOrderPiece.findMany({
    where: { orderId: { in: [...ids] } },
    select: { orderId: true, stage: true, receivedAt: true },
  });
  return new Map(
    roots.map((root) => {
      if (root.order === null)
        throw new InternalServerError("A selected quality header is missing.");
      return [
        root.id,
        qualityOrderHeaderSchema.parse({
          id: root.id,
          version: root.version,
          type: root.type,
          status: root.order.status,
          businessNumber: root.order.businessNumber,
          customerName: root.order.customerName,
          deliveryDate: serializeNullableDateOnly(root.deliveryDate),
          counts: deriveOrderCounts(
            physical
              .filter((piece) => piece.orderId === root.id)
              .map((p) => ({
                stage: p.stage,
                receivedAt: p.receivedAt?.toISOString() ?? null,
              })),
          ),
        }),
      ] as const;
    }),
  );
};
const requireQualityHeader = (
  headers: ReadonlyMap<string, QualityOrderHeader>,
  id: string,
) => {
  const header = headers.get(id);
  if (header === undefined)
    throw new InternalServerError("A selected quality header disappeared.");
  return header;
};
const assertQualityOrderRelation = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
  pieceId?: string,
) => {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >(Prisma.sql`SELECT p.id FROM sales_order_pieces p
 JOIN sales_drafts d ON d.id=p.order_id WHERE d.status='SUBMITTED' AND p.order_id=${orderId}::uuid
 ${pieceId === undefined ? Prisma.empty : Prisma.sql`AND p.id=${pieceId}::uuid`}
 AND ${actor.role === "ADMIN" ? Prisma.sql`TRUE` : qualityPieceRelationSql()} LIMIT 1`);
  if (rows.length !== 1) throw new OrderNotFoundError();
};
const loadQualityInspectionContexts = async (
  tx: Prisma.TransactionClient,
  pieceIds: readonly string[],
) => {
  const inspections = new Map<string, QualityInspectionSummary>(),
    packingGroups = new Map<string, QualityPackingGroup>();
  if (pieceIds.length === 0) return { inspections, packingGroups };
  const rows = await tx.$queryRaw<
    Array<{ pieceId: string; inspection: unknown; packing: unknown }>
  >(Prisma.sql`
 SELECT DISTINCT ON(e.piece_id) e.piece_id AS "pieceId",
 jsonb_build_object('decisionId',e.id,'inspectionId',g.event_id,'visitId',e.visit_id,'decision',e.decision,
 'inspector',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'inspectedAt',c.occurred_at,'inspectorNote',g.inspector_note,'packingGroupId',CASE WHEN e.decision='ACCEPT' THEN packing.id ELSE NULL END,'correctionId',e.correction_id) AS inspection,
 CASE WHEN e.decision='ACCEPT' AND packing.id IS NOT NULL THEN ${qualityPackingSummarySql} ELSE NULL END AS packing
 FROM quality_piece_events e JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
 JOIN quality_commands c ON c.command_id=e.command_id LEFT JOIN quality_packing_groups packing ON packing.command_id=g.command_id AND packing.order_id=g.order_id
 WHERE e.piece_id IN (${Prisma.join(pieceIds.map((id) => Prisma.sql`${id}::uuid`))}) AND e.decision IS NOT NULL
 ORDER BY e.piece_id,g.after_version DESC,e.id DESC`);
  for (const row of rows) {
    inspections.set(
      row.pieceId,
      qualityInspectionSummarySchema.parse(row.inspection),
    );
    if (row.packing !== null) {
      const packing = qualityPackingGroupSchema.parse(row.packing);
      packingGroups.set(packing.id, packing);
    }
  }
  return { inspections, packingGroups };
};
export const findQualityOrders = async (
  tx: Prisma.TransactionClient,
  _actor: AuthorityAccount,
  query: QualityOrdersQuery,
): Promise<QualityOrdersData> => {
  const page = parsePaginationQuery(query),
    counts = await qualityQueueCounts(tx, query);
  const rows = await tx.$queryRaw<
    Array<{ id: string; pieceIds: string[]; lastWorkAt: Date | null }>
  >(Prisma.sql`
 SELECT p.order_id AS id,array_agg(p.id ORDER BY p.id) AS "pieceIds",max(${qualityLastWorkSql}) AS "lastWorkAt"
 ${filteredQualityQueue(query)} GROUP BY p.order_id ORDER BY "lastWorkAt" DESC NULLS LAST,p.order_id DESC LIMIT ${page.take} OFFSET ${page.skip}`);
  const headers = await loadQualityHeaders(
    tx,
    rows.map((row) => row.id),
  );
  return qualityOrdersDataSchema.parse({
    department: "QUALITY",
    view: query.view,
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.orders }),
    items: rows.map((row) => ({
      ...requireQualityHeader(headers, row.id),
      matchingPieceIds: row.pieceIds,
      matchingPieceCount: row.pieceIds.length,
      lastWorkAt: row.lastWorkAt?.toISOString() ?? null,
    })),
  });
};
export const findQualityDashboard = async (
  tx: Prisma.TransactionClient,
  _actor: AuthorityAccount,
): Promise<QualityDashboardData> => {
  const incoming = await qualityQueueCounts(tx, { view: "INCOMING" }),
    inspection = await qualityQueueCounts(tx, { view: "INSPECTION" }),
    accepted = await qualityQueueCounts(tx, { view: "ACCEPTED" }),
    corrections = await qualityQueueCounts(tx, { view: "CORRECTIONS" });
  const rows = await tx.$queryRaw<
    Array<{ id: string; pieceIds: string[]; lastWorkAt: Date | null }>
  >(Prisma.sql`
 SELECT p.order_id AS id,array_agg(p.id ORDER BY p.id) AS "pieceIds",max(${qualityLastWorkSql}) AS "lastWorkAt"
 ${filteredQualityQueue({ view: "ACTIVE" })} GROUP BY p.order_id ORDER BY "lastWorkAt" DESC NULLS LAST,p.order_id DESC LIMIT 5`);
  const headers = await loadQualityHeaders(
    tx,
    rows.map((row) => row.id),
  );
  return qualityDashboardDataSchema.parse({
    department: "QUALITY",
    counts: { incoming, inspection, accepted, corrections },
    recentOrders: rows.map((row) => ({
      ...requireQualityHeader(headers, row.id),
      matchingPieceIds: row.pieceIds,
      matchingPieceCount: row.pieceIds.length,
      lastWorkAt: row.lastWorkAt?.toISOString() ?? null,
    })),
  });
};
export const findQualityPieces = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: QualityPiecesQuery,
): Promise<QualityPiecesData> => {
  if (query.orderId !== undefined)
    await assertQualityOrderRelation(tx, actor, query.orderId);
  const page = parsePaginationQuery(query),
    counts = await qualityQueueCounts(tx, query);
  const rows = await tx.$queryRaw<
    Array<{ id: string; orderId: string }>
  >(Prisma.sql`
 SELECT p.id,p.order_id AS "orderId" ${filteredQualityQueue(query)}
 ORDER BY ${qualityLastWorkSql} DESC NULLS LAST,p.order_id DESC,specification.position ASC,p.id ASC LIMIT ${page.take} OFFSET ${page.skip}`);
  const ids = rows.map((row) => row.id),
    orderIds = [...new Set(rows.map((row) => row.orderId))];
  const headers = await loadQualityHeaders(tx, orderIds);
  const specifications =
    ids.length === 0
      ? []
      : await tx.salesDraftPiece.findMany({
          where: { id: { in: ids } },
          select: MANUFACTURING_ORDER_SELECT.pieces.select,
        });
  const physical = specifications.map((piece) => {
    if (piece.orderPiece === null)
      throw new InternalServerError("A selected quality piece is missing.");
    return piece.orderPiece;
  });
  const contexts = await loadQualityPieceContexts(
    tx,
    physical,
    new Map([...headers].map(([id, h]) => [id, h.status])),
  );
  const contextByPiece = new Map(
    contexts.map((context) => [context.piece.id, context]),
  );
  const { inspections, packingGroups } = await loadQualityInspectionContexts(
      tx,
      ids,
    ),
    specificationById = new Map(
      specifications.map((piece) => [piece.id, piece]),
    );
  return qualityPiecesDataSchema.parse({
    department: "QUALITY",
    view: query.view,
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.pieces }),
    packingGroups: [...packingGroups.values()],
    items: rows.map((row) => {
      const specification = specificationById.get(row.id),
        context = contextByPiece.get(row.id);
      if (specification === undefined || context === undefined)
        throw new InternalServerError("A selected quality member disappeared.");
      return {
        order: requireQualityHeader(headers, row.orderId),
        piece: mapManufacturingPaperPiece(specification, row.orderId),
        work: mapQualityPieceContext(
          context,
          actor,
          inspections.get(row.id) ?? null,
        ),
      };
    }),
  });
};
export const findQualityOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<QualityOrderData> => {
  await assertQualityOrderRelation(tx, actor, orderId);
  const root = await tx.salesDraft.findUnique({
    where: { id: orderId },
    select: MANUFACTURING_ORDER_SELECT,
  });
  if (root === null || root.order === null) throw new OrderNotFoundError();
  const issues = await tx.$queryRaw<
    Array<{
      pieceId: string;
      issueId: string;
      state: string;
      reason: string;
      reportNotes: string | null;
      target: string | null;
    }>
  >`
 SELECT DISTINCT ON(piece_id) piece_id AS "pieceId",id AS "issueId",state,reason,notes AS "reportNotes",resume_target AS target
 FROM manufacturing_issues WHERE order_id=${orderId}::uuid ORDER BY piece_id,(state<>'RESOLVED') DESC,cycle DESC,id DESC LIMIT 201`;
  if (issues.length > 200)
    throw new InternalServerError("Too many quality issue contexts.");
  const instructions = await findIssueInstructions(
    tx,
    issues.map((issue) => issue.issueId),
    "FACTORY",
  );
  const paper = mapQualityPaper(
    root,
    issues.map((issue) =>
      factoryOrderPaperDataSchema.shape.issues.element.parse({
        ...issue,
        approvedInstructions: instructions.get(issue.issueId)?.text ?? null,
      }),
    ),
  );
  const physical = root.pieces.map((piece) => {
    if (piece.orderPiece === null)
      throw new InternalServerError(
        "A quality paper piece has no physical record.",
      );
    return piece.orderPiece;
  });
  const contexts = await loadQualityPieceContexts(
    tx,
    physical,
    new Map([[orderId, root.order.status]]),
  );
  const { inspections, packingGroups } = await loadQualityInspectionContexts(
    tx,
    physical.map((piece) => piece.id),
  );
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    paper,
    work: contexts.map((context) =>
      mapQualityPieceContext(
        context,
        actor,
        inspections.get(context.piece.id) ?? null,
      ),
    ),
    packingGroups: [...packingGroups.values()],
  });
};

// Follow persisted source edges, including repeated P04 holds/returns. UNION prevents revisiting a visit.
const qualityRelatedVisitsSql = Prisma.sql`WITH RECURSIVE related_visits(id,order_id,piece_id) AS (
 SELECT visit.id,visit.order_id,visit.piece_id FROM manufacturing_work_visits visit
 WHERE (visit.origin_kind='QUALITY_CORRECTION' AND EXISTS (
  SELECT 1 FROM quality_correction_cycles cycle WHERE cycle.id=visit.source_reference_id AND cycle.order_id=visit.order_id AND cycle.piece_id=visit.piece_id AND cycle.cycle=visit.source_correction_cycle))
 OR (visit.origin_kind='APPROVAL_RETURN' AND EXISTS (
  SELECT 1 FROM manufacturing_issues issue JOIN approval_commands source ON source.command_id=visit.source_approval_command_id AND source.issue_id=issue.id AND source.order_id=visit.order_id AND source.piece_id=visit.piece_id
  WHERE issue.id=visit.source_issue_id AND issue.order_id=visit.order_id AND issue.piece_id=visit.piece_id AND issue.source_department='QUALITY'))
 UNION
 SELECT next.id,next.order_id,next.piece_id FROM manufacturing_work_visits next
 JOIN related_visits previous ON previous.order_id=next.order_id AND previous.piece_id=next.piece_id
 JOIN manufacturing_work_visits source_visit ON source_visit.id=previous.id
 WHERE (next.origin_kind='DEPARTMENT_TRANSFER' AND EXISTS (
  SELECT 1 FROM manufacturing_piece_events transfer WHERE transfer.id=next.source_transfer_event_id AND transfer.visit_id=previous.id AND transfer.order_id=previous.order_id AND transfer.piece_id=previous.piece_id))
 OR (next.origin_kind='APPROVAL_RETURN' AND EXISTS (
  SELECT 1 FROM manufacturing_issues issue JOIN approval_commands decision ON decision.command_id=next.source_approval_command_id AND decision.issue_id=issue.id AND decision.order_id=next.order_id AND decision.piece_id=next.piece_id
  WHERE issue.id=next.source_issue_id AND issue.reported_command_id=source_visit.end_approval_command_id AND issue.order_id=next.order_id AND issue.piece_id=next.piece_id))
)`;
const qualityManufacturingMemberSql = Prisma.sql`(
 c.department='PRODUCTION' AND c.operation='COMPLETE_TRANSFER' AND member.before_stage='PRODUCTION' AND member.after_stage='QUALITY'
 OR EXISTS(SELECT 1 FROM related_visits visit WHERE visit.id=member.visit_id AND visit.order_id=member.order_id AND visit.piece_id=member.piece_id))`;
type QualityHistoryFilter = {
  orderId?: string | undefined;
  pieceId?: string | undefined;
};
const qualityHistorySource = (query: QualityHistoryFilter) => {
  const orderFilter =
    query.orderId === undefined
      ? Prisma.empty
      : Prisma.sql`AND h.id=${query.orderId}::uuid`;
  const groupPiece =
    query.pieceId === undefined
      ? Prisma.empty
      : Prisma.sql`AND ${query.pieceId}::uuid=ANY(g.piece_ids)`;
  const issuePiece =
    query.pieceId === undefined
      ? Prisma.empty
      : Prisma.sql`AND c.piece_id=${query.pieceId}::uuid`;
  const manufacturingPiece =
    query.pieceId === undefined
      ? Prisma.empty
      : Prisma.sql`AND member.piece_id=${query.pieceId}::uuid`;
  return Prisma.sql`
 SELECT g.event_id,c.occurred_at,'quality' AS kind,${qualitySummarySql} AS event
 FROM quality_command_orders g JOIN quality_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
 WHERE true ${orderFilter} ${groupPiece}
 UNION ALL SELECT g.event_id,c.occurred_at,'manufacturing',
 (${manufacturingSummarySql}-'pieces')||jsonb_build_object('pieces',(
 SELECT jsonb_agg(original ORDER BY original->>'pieceId') FROM jsonb_array_elements((SELECT selected->'pieces' FROM jsonb_array_elements(c.outcome->'orders') selected WHERE selected->>'orderId'=g.order_id::text)) original
 WHERE EXISTS(SELECT 1 FROM manufacturing_piece_events member WHERE member.command_id=g.command_id AND member.order_id=g.order_id AND member.piece_id=(original->>'pieceId')::uuid AND ${qualityManufacturingMemberSql})))
 FROM manufacturing_command_orders g JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
 WHERE EXISTS(SELECT 1 FROM manufacturing_piece_events member WHERE member.command_id=g.command_id AND member.order_id=g.order_id AND ${qualityManufacturingMemberSql} ${manufacturingPiece}) ${orderFilter}
 UNION ALL SELECT c.command_id,c.occurred_at,'issue',jsonb_build_object(
 'id',c.command_id,'commandId',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,
 'pieceId',c.piece_id,'issueId',c.issue_id,'sourceDepartment',issue.source_department,'operation',c.operation,
 'result',CASE WHEN c.operation='REPORT_ISSUE' THEN 'REPORTED' WHEN c.decision='CANCEL' THEN 'CANCELLED' WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN 'RELEASED' ELSE 'HELD_FOR_CONTACT' END,
 'target',CASE WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.outcome->>'pieceStage' ELSE NULL END,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'reason',CASE WHEN c.operation='REPORT_ISSUE' THEN issue.reason WHEN c.decision='CANCEL' THEN c.after_facts#>>'{pieces,0,cancellationReason}' ELSE NULL END,
 'notes',CASE WHEN c.operation='REPORT_ISSUE' THEN issue.notes WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.decision_notes ELSE NULL END,
 'correctionResolution',(SELECT jsonb_build_object('correctionId',cycle.id,'cycle',cycle.cycle,'outcome','CANCELLED') FROM quality_correction_cycles cycle WHERE cycle.resolution_approval_command_id=c.command_id AND cycle.order_id=c.order_id AND cycle.piece_id=c.piece_id AND cycle.state='CANCELLED' AND cycle.resolved_at=c.occurred_at))
 FROM approval_commands c JOIN manufacturing_issues issue ON issue.id=c.issue_id AND issue.order_id=c.order_id AND issue.piece_id=c.piece_id JOIN sales_orders h ON h.id=c.order_id
 WHERE c.operation IN ('REPORT_ISSUE','RESOLVE_ISSUE','REVIEW_CONTACT') AND NOT ${qualityReportChildSql}
 AND (issue.source_department='QUALITY' OR EXISTS(SELECT 1 FROM related_visits related JOIN manufacturing_work_visits visit ON visit.id=related.id WHERE related.order_id=c.order_id AND related.piece_id=c.piece_id AND visit.end_approval_command_id=issue.reported_command_id)
 OR EXISTS(SELECT 1 FROM quality_correction_cycles cycle WHERE cycle.resolution_approval_command_id=c.command_id AND cycle.order_id=c.order_id AND cycle.piece_id=c.piece_id AND cycle.state='CANCELLED' AND cycle.resolved_at=c.occurred_at)) ${orderFilter} ${issuePiece}`;
};
const qualityHistoryPage = async (
  tx: Prisma.TransactionClient,
  query: QualityActivityQuery,
  filter: QualityHistoryFilter,
) => {
  const page = parsePaginationQuery(query),
    source = qualityHistorySource(filter);
  const [count] = await tx.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`${qualityRelatedVisitsSql} SELECT count(*)::int AS total FROM (${source}) history`,
  );
  if (count === undefined)
    throw new InternalServerError("Quality history counts are unavailable.");
  const events = await tx.$queryRaw<Array<{ kind: string; event: unknown }>>(
    Prisma.sql`${qualityRelatedVisitsSql} SELECT kind,event FROM (${source}) history ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return {
    department: "QUALITY" as const,
    events,
    pagination: buildPaginationMeta({ ...page, total: count.total }),
  };
};
export const findQualityActivity = async (
  tx: Prisma.TransactionClient,
  _actor: AuthorityAccount,
  query: QualityActivityQuery,
): Promise<QualityActivityData> =>
  qualityActivityDataSchema.parse(await qualityHistoryPage(tx, query, {}));
export const findQualityOrderHistory = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
  query: QualityOrderHistoryQuery,
): Promise<QualityOrderHistoryData> => {
  await assertQualityOrderRelation(tx, actor, orderId, query.pieceId);
  return qualityOrderHistoryDataSchema.parse({
    orderId,
    ...(await qualityHistoryPage(tx, query, {
      orderId,
      pieceId: query.pieceId,
    })),
  });
};
