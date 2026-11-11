import {
  MANUFACTURING_ORDER_SELECT,
  MANUFACTURING_PHYSICAL_PIECE_SELECT,
  MANUFACTURING_VISIT_SELECT,
  manufacturingSummarySql,
  mapManufacturingPaper,
  mapManufacturingPaperPiece,
  mapManufacturingPieceContext,
  type ManufacturingPhysicalPieceRecord,
} from "./manufacturing.mapper.js";
import {
  factoryOrderPaperDataSchema,
  manufacturingActivityDataSchema,
  manufacturingDashboardDataSchema,
  manufacturingOrderDataSchema,
  manufacturingOrderHeaderSchema,
  manufacturingOrderHistoryDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  type ManufacturingActivityData,
  type ManufacturingActivityQuery,
  type ManufacturingCommandBody,
  type ManufacturingDashboardData,
  type ManufacturingDepartment,
  type ManufacturingOrderData,
  type ManufacturingOrderHeader,
  type ManufacturingOrderHistoryData,
  type ManufacturingOrderHistoryQuery,
  type ManufacturingOrdersData,
  type ManufacturingOrdersQuery,
  type ManufacturingPiecesData,
  type ManufacturingPiecesQuery,
  type ManufacturingView,
  type SalesOrderType,
} from "@template/contracts";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import { deriveOrderCounts } from "../sales-orders/sales-orders.rules.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { findIssueInstructions } from "../approval/approval.queries.js";
import { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  OrderNotFoundError,
  OrderStateConflictError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import { canonicalManufacturingOrders } from "./manufacturing.rules.js";
import type {
  LockedManufacturingOrder,
  ManufacturingLastActionRecord,
  ManufacturingPieceContextRecord,
} from "./manufacturing.types.js";

// The fixed p alias is owned by these queries; no caller-supplied SQL identifier enters it.
export const manufacturingPieceRelationSql = (
  department: ManufacturingDepartment,
): Prisma.Sql => Prisma.sql`(
  p.stage::text=${department} OR EXISTS (
    SELECT 1 FROM manufacturing_issues i JOIN approval_commands a ON a.command_id=i.reported_command_id
    WHERE i.order_id=p.order_id AND i.piece_id=p.id AND i.source_department=${department}::department
      AND a.operation='REPORT_ISSUE' AND a.order_id=p.order_id AND a.piece_id=p.id
  ) OR EXISTS (
    SELECT 1 FROM manufacturing_piece_events e JOIN manufacturing_commands c ON c.command_id=e.command_id
    WHERE e.order_id=p.order_id AND e.piece_id=p.id AND c.department=${department}::department
  ) OR EXISTS (
    SELECT 1 FROM manufacturing_work_visits v JOIN approval_commands a ON a.command_id=v.source_approval_command_id
    WHERE v.order_id=p.order_id AND a.order_id=p.order_id AND v.piece_id=p.id AND v.department=${department}::department
      AND (v.origin_kind='INITIAL_APPROVAL' AND a.operation='APPROVE_INITIAL'
        OR v.origin_kind='APPROVAL_RETURN' AND a.piece_id=p.id AND a.issue_id=v.source_issue_id AND a.outcome->>'pieceStage'=${department} AND a.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND a.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT'))
  )
)`;

export const loadManufacturingPieceContexts = async (
  tx: Prisma.TransactionClient,
  pieces: readonly ManufacturingPhysicalPieceRecord[],
  department: ManufacturingDepartment,
  orderStatuses: ReadonlyMap<
    string,
    ManufacturingPieceContextRecord["orderStatus"]
  >,
): Promise<ManufacturingPieceContextRecord[]> => {
  if (pieces.length === 0) return [];
  const pieceIds = pieces.map((piece) => piece.id);
  const latest = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT ON (piece_id) id FROM manufacturing_work_visits
    WHERE piece_id IN (${Prisma.join(pieceIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND department=${department}::department ORDER BY piece_id,sequence DESC`);
  const visits =
    latest.length === 0
      ? []
      : await tx.manufacturingWorkVisit.findMany({
          where: { id: { in: latest.map((visit) => visit.id) } },
          select: MANUFACTURING_VISIT_SELECT,
        });
  const visitByPiece = new Map(visits.map((visit) => [visit.pieceId, visit]));
  const actions =
    visits.length === 0
      ? []
      : await tx.$queryRaw<
          Array<ManufacturingLastActionRecord & { visitId: string }>
        >(Prisma.sql`
    SELECT DISTINCT ON (e.visit_id) e.visit_id AS "visitId",e.id AS "eventId",c.command_id AS "commandId",
      c.operation,c.actor_id AS "actorId",c.actor_full_name AS "actorFullName",c.actor_role AS "actorRole",
      c.actor_department AS "actorDepartment",c.occurred_at AS "occurredAt"
    FROM manufacturing_piece_events e JOIN manufacturing_commands c ON c.command_id=e.command_id
      JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
    WHERE e.visit_id IN (${Prisma.join(visits.map((visit) => Prisma.sql`${visit.id}::uuid`))})
      AND c.department=${department}::department ORDER BY e.visit_id,g.after_version DESC,e.id DESC`);
  const actionByVisit = new Map(
    actions.map((action) => [action.visitId, action]),
  );
  const issueIds = pieces.flatMap((piece) =>
    piece.issueId === null ? [] : [piece.issueId],
  );
  const issues =
    issueIds.length === 0
      ? []
      : await tx.manufacturingIssue.findMany({
          where: { id: { in: issueIds } },
          select: { id: true, state: true, sourceDepartment: true },
        });
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  return pieces.map((piece) => {
    const orderStatus = orderStatuses.get(piece.orderId);
    if (orderStatus === undefined)
      throw new InternalServerError(
        "A work piece has no selected order header.",
      );
    const visit = visitByPiece.get(piece.id) ?? null;
    return {
      piece,
      orderStatus,
      visit,
      lastAction: visit === null ? null : (actionByVisit.get(visit.id) ?? null),
      issue:
        piece.issueId === null ? null : (issueById.get(piece.issueId) ?? null),
    };
  });
};

export const lockManufacturingOrders = async (
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorityAccount;
    department: ManufacturingDepartment;
    orders: ManufacturingCommandBody["orders"];
  },
): Promise<LockedManufacturingOrder[]> => {
  assertBusinessAuthority(input.actor, input.department);
  const orders = canonicalManufacturingOrders(input.orders);
  for (const order of orders) {
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM sales_drafts WHERE id=${order.orderId}::uuid AND status='SUBMITTED' FOR UPDATE`;
    if (locked.length !== 1) throw new OrderNotFoundError();
  }
  const roots = await tx.salesDraft.findMany({
    where: {
      id: { in: orders.map((order) => order.orderId) },
      status: "SUBMITTED",
    },
    select: {
      id: true,
      version: true,
      status: true,
      order: { select: { status: true } },
    },
  });
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const pieceIds = orders.flatMap((order) => order.pieceIds);
  const permitted =
    input.actor.role === "ADMIN"
      ? Prisma.sql`TRUE`
      : manufacturingPieceRelationSql(input.department);
  const visible = await tx.$queryRaw<
    Array<{ id: string; orderId: string }>
  >(Prisma.sql`
    SELECT p.id,p.order_id AS "orderId" FROM sales_order_pieces p
    WHERE p.id IN (${Prisma.join(pieceIds.map((id) => Prisma.sql`${id}::uuid`))}) AND ${permitted}`);
  const visibleById = new Map(
    visible.map((piece) => [piece.id, piece.orderId]),
  );
  // Establish every relationship before any root can disclose a version/state conflict.
  for (const order of orders) {
    const root = rootById.get(order.orderId);
    if (
      root?.order === null ||
      root === undefined ||
      order.pieceIds.some((id) => visibleById.get(id) !== order.orderId)
    )
      throw new OrderNotFoundError();
  }
  for (const order of orders) {
    const root = rootById.get(order.orderId);
    if (root === undefined || root.order === null)
      throw new InternalServerError(
        "A locked work order is missing its header.",
      );
    if (root.version !== order.expectedVersion || root.version >= 2147483647)
      throw new OrderVersionConflictError();
    if (root.order.status !== "APPROVED") throw new OrderStateConflictError();
  }
  const pieces = await tx.salesOrderPiece.findMany({
    where: { id: { in: pieceIds } },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  const statuses = new Map(
    roots.flatMap((root) =>
      root.order === null ? [] : [[root.id, root.order.status] as const],
    ),
  );
  const contexts = await loadManufacturingPieceContexts(
    tx,
    pieces,
    input.department,
    statuses,
  );
  const contextById = new Map(
    contexts.map((context) => [context.piece.id, context]),
  );
  return orders.map((order) => {
    const root = rootById.get(order.orderId);
    if (
      root === undefined ||
      root.status !== "SUBMITTED" ||
      root.order === null
    )
      throw new InternalServerError("A locked work root disappeared.");
    return {
      id: root.id,
      version: root.version,
      status: root.status,
      orderStatus: root.order.status,
      pieces: order.pieceIds.map((id) => {
        const context = contextById.get(id);
        if (context === undefined)
          throw new InternalServerError(
            "A selected physical work piece disappeared.",
          );
        return context;
      }),
    };
  });
};

// Each queue uses this one-row-per-physical-piece relation for both counts and pages.
const queueSource = (department: ManufacturingDepartment) => Prisma.sql`
  FROM sales_order_pieces p JOIN sales_drafts d ON d.id=p.order_id
  JOIN sales_orders h ON h.id=d.id
  LEFT JOIN LATERAL (SELECT * FROM manufacturing_work_visits v0 WHERE v0.piece_id=p.id
    AND v0.department=${department}::department ORDER BY v0.sequence DESC LIMIT 1) v ON true
  LEFT JOIN manufacturing_issues i ON i.id=p.issue_id
  LEFT JOIN LATERAL (SELECT max(c.occurred_at) AS at FROM manufacturing_piece_events e
    JOIN manufacturing_commands c ON c.command_id=e.command_id
    WHERE e.piece_id=p.id AND c.department=${department}::department) a ON true
  LEFT JOIN LATERAL (SELECT max(c.occurred_at) AS at FROM approval_commands c
    JOIN manufacturing_issues ix ON ix.id=c.issue_id WHERE ix.piece_id=p.id AND
      (ix.source_department=${department}::department OR c.outcome->>'pieceStage'=${department})
      AND c.operation IN ('REPORT_ISSUE','RESOLVE_ISSUE','REVIEW_CONTACT')) r ON true`;
const currentWorkSql = (department: ManufacturingDepartment) => Prisma.sql`
  h.status='APPROVED' AND p.stage::text=${department} AND p.work_state IN ('INCOMING','IN_PROGRESS')
  AND p.issue_id IS NULL AND p.received_at IS NULL AND p.cancelled_at IS NULL
  AND p.current_work_visit_id=v.id AND v.ended_at IS NULL`;
const queuePredicate = (
  department: ManufacturingDepartment,
  view: ManufacturingView | "ACTIVE",
) => {
  const current = currentWorkSql(department);
  const selected =
    view === "ACTIVE"
      ? current
      : view === "INCOMING" || view === "IN_PROGRESS"
        ? Prisma.sql`(${current}) AND p.work_state::text=${view}`
        : view === "COMPLETED"
          ? Prisma.sql`v.end_reason='TRANSFERRED'`
          : Prisma.sql`((${current}) AND v.origin_kind IN ('APPROVAL_RETURN','QUALITY_CORRECTION')
      OR i.state<>'RESOLVED' AND i.source_department=${department}::department)`;
  return Prisma.sql`d.status='SUBMITTED' AND p.stage<>'CANCELLED' AND p.cancelled_at IS NULL AND (${selected})`;
};
const lastWorkSql = Prisma.sql`greatest(a.at,r.at,v.entered_at,v.received_at,v.started_at,v.ended_at)`;
const searchPattern = (value: string) =>
  `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
const filteredQueue = (
  department: ManufacturingDepartment,
  query: {
    view: ManufacturingView | "ACTIVE";
    type?: SalesOrderType | undefined;
    search?: string | undefined;
    orderId?: string | undefined;
  },
) => Prisma.sql`
 ${queueSource(department)} WHERE ${queuePredicate(department, query.view)}
 ${query.type === undefined ? Prisma.empty : Prisma.sql`AND d.type::text=${query.type}`}
 ${query.orderId === undefined ? Prisma.empty : Prisma.sql`AND d.id=${query.orderId}::uuid`}
 ${query.search === undefined ? Prisma.empty : Prisma.sql`AND (h.customer_name ILIKE ${searchPattern(query.search)} OR h.business_number ILIKE ${searchPattern(query.search)} OR EXISTS (SELECT 1 FROM sales_draft_pieces dp WHERE dp.id=p.id AND (dp.model ILIKE ${searchPattern(query.search)} OR dp.size ILIKE ${searchPattern(query.search)} OR dp.leather_base ILIKE ${searchPattern(query.search)} OR dp.decoration ILIKE ${searchPattern(query.search)})))`}`;
const queueCounts = async (
  tx: Prisma.TransactionClient,
  department: ManufacturingDepartment,
  query: Parameters<typeof filteredQueue>[1],
) => {
  const [count] = await tx.$queryRaw<Array<{ orders: number; pieces: number }>>(
    Prisma.sql`SELECT count(DISTINCT p.order_id)::int AS orders,count(*)::int AS pieces ${filteredQueue(department, query)}`,
  );
  if (count === undefined)
    throw new InternalServerError("Work counts are unavailable.");
  return count;
};
const loadQueuePapers = async (
  tx: Prisma.TransactionClient,
  ids: readonly string[],
  pieceIds: readonly string[] = [],
) => {
  if (ids.length === 0)
    return new Map<
      string,
      ManufacturingOrderHeader & {
        pieces: ReturnType<typeof mapManufacturingPaperPiece>[];
      }
    >();
  const roots = await tx.salesDraft.findMany({
    where: { id: { in: [...ids] }, status: "SUBMITTED" },
    select: {
      id: true,
      version: true,
      type: true,
      deliveryDate: true,
      order: MANUFACTURING_ORDER_SELECT.order,
      pieces: {
        ...MANUFACTURING_ORDER_SELECT.pieces,
        where: { removedAt: null, id: { in: [...pieceIds] } },
      },
    },
  });
  const physical = await tx.salesOrderPiece.findMany({
    where: { orderId: { in: [...ids] } },
    select: { orderId: true, stage: true, receivedAt: true },
  });
  return new Map(
    roots.map((root) => {
      if (root.order === null)
        throw new InternalServerError("Selected work header is missing.");
      const header = manufacturingOrderHeaderSchema.parse({
        id: root.id,
        version: root.version,
        type: root.type,
        status: root.order.status,
        businessNumber: root.order.businessNumber,
        customerName: root.order.customerName,
        deliveryDate: serializeNullableDateOnly(root.deliveryDate),
        counts: deriveOrderCounts(
          physical
            .filter((p) => p.orderId === root.id)
            .map((p) => ({
              stage: p.stage,
              receivedAt: p.receivedAt?.toISOString() ?? null,
            })),
        ),
      });
      return [
        root.id,
        {
          ...header,
          pieces: root.pieces.map((piece) =>
            mapManufacturingPaperPiece(piece, root.id),
          ),
        },
      ] as const;
    }),
  );
};
const requireQueuePaper = (
  papers: Awaited<ReturnType<typeof loadQueuePapers>>,
  id: string,
) => {
  const paper = papers.get(id);
  if (paper === undefined)
    throw new InternalServerError("Selected work header is missing.");
  return paper;
};
const safeHeader = (paper: ManufacturingOrderHeader) =>
  manufacturingOrderHeaderSchema.parse({
    id: paper.id,
    version: paper.version,
    type: paper.type,
    status: paper.status,
    businessNumber: paper.businessNumber,
    customerName: paper.customerName,
    deliveryDate: paper.deliveryDate,
    counts: paper.counts,
  });

export const findManufacturingOrders = async (
  tx: Prisma.TransactionClient,
  _actor: AuthorityAccount,
  department: ManufacturingDepartment,
  query: ManufacturingOrdersQuery,
): Promise<ManufacturingOrdersData> => {
  const page = parsePaginationQuery(query),
    counts = await queueCounts(tx, department, query);
  const rows = await tx.$queryRaw<
    Array<{ id: string; pieceIds: string[]; lastWorkAt: Date | null }>
  >(
    Prisma.sql`SELECT p.order_id AS id,array_agg(p.id ORDER BY p.id) AS "pieceIds",max(${lastWorkSql}) AS "lastWorkAt" ${filteredQueue(department, query)} GROUP BY p.order_id ORDER BY "lastWorkAt" DESC NULLS LAST,p.order_id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const papers = await loadQueuePapers(
    tx,
    rows.map((r) => r.id),
  );
  return manufacturingOrdersDataSchema.parse({
    department,
    view: query.view,
    items: rows.map((row) => ({
      ...safeHeader(requireQueuePaper(papers, row.id)),
      matchingPieceIds: row.pieceIds,
      matchingPieceCount: row.pieceIds.length,
      lastWorkAt: row.lastWorkAt?.toISOString() ?? null,
    })),
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.orders }),
  });
};
export const findManufacturingPieces = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  query: ManufacturingPiecesQuery,
): Promise<ManufacturingPiecesData> => {
  if (query.orderId !== undefined)
    await assertManufacturingOrderRelation(
      tx,
      actor,
      department,
      query.orderId,
    );
  const page = parsePaginationQuery(query),
    counts = await queueCounts(tx, department, query);
  const rows = await tx.$queryRaw<Array<{ id: string; orderId: string }>>(
    Prisma.sql`SELECT p.id,p.order_id AS "orderId" ${filteredQueue(department, query)} ORDER BY ${lastWorkSql} DESC NULLS LAST,p.id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const papers = await loadQueuePapers(
    tx,
    [...new Set(rows.map((r) => r.orderId))],
    rows.map((r) => r.id),
  );
  const physical =
    rows.length === 0
      ? []
      : await tx.salesOrderPiece.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
        });
  const contexts = await loadManufacturingPieceContexts(
    tx,
    physical,
    department,
    new Map([...papers].map(([id, p]) => [id, p.status])),
  );
  const contextById = new Map(contexts.map((c) => [c.piece.id, c]));
  return manufacturingPiecesDataSchema.parse({
    department,
    view: query.view,
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.pieces }),
    items: rows.map((row) => {
      const paper = requireQueuePaper(papers, row.orderId),
        piece = paper.pieces.find((p) => p.id === row.id),
        context = contextById.get(row.id);
      if (piece === undefined || context === undefined)
        throw new InternalServerError("Selected work piece is missing.");
      return {
        order: safeHeader(paper),
        piece,
        work: mapManufacturingPieceContext(context, actor, department),
      };
    }),
  });
};
export const findManufacturingDashboard = async (
  tx: Prisma.TransactionClient,
  _actor: AuthorityAccount,
  department: ManufacturingDepartment,
): Promise<ManufacturingDashboardData> => {
  const incoming = await queueCounts(tx, department, { view: "INCOMING" }),
    inProgress = await queueCounts(tx, department, { view: "IN_PROGRESS" }),
    returned = await queueCounts(tx, department, { view: "RETURNED" }),
    completed = await queueCounts(tx, department, { view: "COMPLETED" });
  const repairs =
    department === "CUTTING"
      ? { orders: 0, pieces: 0 }
      : await queueCounts(tx, department, { view: "INCOMING", type: "REPAIR" });
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      pieceIds: string[];
      lastWorkAt: Date | null;
      hasInProgress: boolean;
    }>
  >(
    Prisma.sql`SELECT p.order_id AS id,array_agg(p.id ORDER BY p.id) AS "pieceIds",max(${lastWorkSql}) AS "lastWorkAt",bool_or(p.work_state='IN_PROGRESS') AS "hasInProgress" ${filteredQueue(department, { view: "ACTIVE" })} GROUP BY p.order_id ORDER BY "lastWorkAt" DESC NULLS LAST,p.order_id DESC LIMIT 5`,
  );
  const papers = await loadQueuePapers(
    tx,
    rows.map((r) => r.id),
  );
  return manufacturingDashboardDataSchema.parse({
    department,
    counts: { incoming, inProgress, returned, completed, repairs },
    recentOrders: rows.map((row) => ({
      ...safeHeader(requireQueuePaper(papers, row.id)),
      matchingPieceIds: row.pieceIds,
      matchingPieceCount: row.pieceIds.length,
      lastWorkAt: row.lastWorkAt?.toISOString() ?? null,
      hasInProgress: row.hasInProgress,
    })),
  });
};

const assertManufacturingOrderRelation = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  orderId: string,
  pieceId?: string,
): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT p.id FROM sales_order_pieces p JOIN sales_drafts d ON d.id=p.order_id WHERE d.status='SUBMITTED' AND p.order_id=${orderId}::uuid ${pieceId === undefined ? Prisma.empty : Prisma.sql`AND p.id=${pieceId}::uuid`} AND ${actor.role === "ADMIN" ? Prisma.sql`TRUE` : manufacturingPieceRelationSql(department)} LIMIT 1`,
  );
  if (rows.length !== 1) throw new OrderNotFoundError();
};
export const findManufacturingOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  orderId: string,
): Promise<ManufacturingOrderData> => {
  await assertManufacturingOrderRelation(tx, actor, department, orderId);
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
  >`SELECT DISTINCT ON (piece_id) piece_id AS "pieceId",id AS "issueId",state,reason,notes AS "reportNotes",resume_target AS target FROM manufacturing_issues WHERE order_id=${orderId}::uuid ORDER BY piece_id,(state<>'RESOLVED') DESC,cycle DESC,id DESC LIMIT 201`;
  if (issues.length > 200)
    throw new InternalServerError("Too many factory issue contexts.");
  const instructions = await findIssueInstructions(
    tx,
    issues.map((i) => i.issueId),
    "FACTORY",
  );
  const paper = mapManufacturingPaper(
    root,
    issues.map((i) =>
      factoryOrderPaperDataSchema.shape.issues.element.parse({
        ...i,
        approvedInstructions: instructions.get(i.issueId)?.text ?? null,
      }),
    ),
  );
  const physical = root.pieces.map((p) => {
    if (p.orderPiece === null)
      throw new InternalServerError("Missing physical work piece.");
    return p.orderPiece;
  });
  const contexts = await loadManufacturingPieceContexts(
    tx,
    physical,
    department,
    new Map([[orderId, root.order.status]]),
  );
  return manufacturingOrderDataSchema.parse({
    department,
    paper,
    work: contexts.map((c) =>
      mapManufacturingPieceContext(c, actor, department),
    ),
  });
};

const departmentHistory = (
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  query: {
    actor?: "me" | undefined;
    orderId?: string | undefined;
    pieceId?: string | undefined;
  },
) => {
  const orderFilter =
    query.orderId === undefined
      ? Prisma.empty
      : Prisma.sql`AND h.id=${query.orderId}::uuid`;
  const actorFilter =
    query.actor === "me"
      ? Prisma.sql`AND c.actor_id=${actor.id}::uuid`
      : Prisma.empty;
  const workPiece =
    query.pieceId === undefined
      ? Prisma.empty
      : Prisma.sql`AND ${query.pieceId}::uuid=ANY(g.piece_ids)`;
  const issuePiece =
    query.pieceId === undefined
      ? Prisma.empty
      : Prisma.sql`AND c.piece_id=${query.pieceId}::uuid`;
  return Prisma.sql`SELECT g.event_id,c.occurred_at,'manufacturing' AS kind,${manufacturingSummarySql} AS event
 FROM manufacturing_command_orders g JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
 WHERE c.department=${department}::department ${orderFilter} ${actorFilter} ${workPiece}
 UNION ALL SELECT c.command_id,c.occurred_at,'issue' AS kind,jsonb_build_object(
 'id',c.command_id,'commandId',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,
 'pieceId',c.piece_id,'issueId',c.issue_id,'department',${department}::text,'sourceDepartment',i.source_department,'operation',c.operation,
 'result',CASE WHEN c.operation='REPORT_ISSUE' THEN 'REPORTED' WHEN c.decision='CANCEL' THEN 'CANCELLED' WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN 'RELEASED' ELSE 'HELD_FOR_CONTACT' END,
 'target',CASE WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.outcome->>'pieceStage' ELSE NULL END,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'reason',CASE WHEN c.operation='REPORT_ISSUE' THEN i.reason WHEN c.decision='CANCEL' THEN c.after_facts#>>'{pieces,0,cancellationReason}' ELSE NULL END,
 'notes',CASE WHEN c.operation='REPORT_ISSUE' THEN i.notes WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.decision_notes ELSE NULL END)
 FROM approval_commands c JOIN manufacturing_issues i ON i.id=c.issue_id AND i.order_id=c.order_id AND i.piece_id=c.piece_id
 JOIN sales_orders h ON h.id=c.order_id WHERE c.operation IN ('REPORT_ISSUE','RESOLVE_ISSUE','REVIEW_CONTACT')
 AND (i.source_department=${department}::department OR c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') AND c.outcome->>'pieceStage'=${department})
 ${orderFilter} ${actorFilter} ${issuePiece}`;
};
export const findManufacturingActivity = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  query: ManufacturingActivityQuery,
): Promise<ManufacturingActivityData> => {
  const page = parsePaginationQuery(query),
    source = departmentHistory(actor, department, query);
  const [count] = await tx.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`SELECT count(*)::int AS total FROM (${source}) history`,
  );
  if (count === undefined)
    throw new InternalServerError("Work history count is unavailable.");
  const rows = await tx.$queryRaw<Array<{ kind: string; event: unknown }>>(
    Prisma.sql`SELECT kind,event FROM (${source}) history ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return manufacturingActivityDataSchema.parse({
    department,
    events: rows,
    pagination: buildPaginationMeta({ ...page, total: count.total }),
  });
};
export const findManufacturingOrderHistory = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
  orderId: string,
  query: ManufacturingOrderHistoryQuery,
): Promise<ManufacturingOrderHistoryData> => {
  await assertManufacturingOrderRelation(
    tx,
    actor,
    department,
    orderId,
    query.pieceId,
  );
  const page = parsePaginationQuery(query),
    source = departmentHistory(actor, department, {
      orderId,
      pieceId: query.pieceId,
    });
  const [count] = await tx.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`SELECT count(*)::int AS total FROM (${source}) history`,
  );
  if (count === undefined)
    throw new InternalServerError("Work history count is unavailable.");
  const rows = await tx.$queryRaw<Array<{ kind: string; event: unknown }>>(
    Prisma.sql`SELECT kind,event FROM (${source}) history ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return manufacturingOrderHistoryDataSchema.parse({
    department,
    orderId,
    events: rows,
    pagination: buildPaginationMeta({ ...page, total: count.total }),
  });
};
