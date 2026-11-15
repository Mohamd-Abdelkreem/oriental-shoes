import { Prisma } from "@template/database";
import {
  factoryOrderPaperDataSchema,
  warehouseDashboardDataSchema,
  warehouseOrdersDataSchema,
  warehousePiecesDataSchema,
  qualityPackingGroupSchema,
  type WarehouseCommandBody,
  type WarehouseView,
  type WarehouseDashboardQuery,
  type WarehouseOrdersQuery,
  type WarehousePiecesQuery,
  type QualityPackingGroup,
  warehouseActivityDataSchema,
  warehouseOrderHistoryDataSchema,
  type WarehouseActivityQuery,
  type WarehouseOrderHistoryQuery,
} from "@template/contracts";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import {
  parsePaginationQuery,
  buildPaginationMeta,
} from "../../core/pagination/index.js";
import { findIssueInstructions } from "../approval/approval.queries.js";
import { qualityPackingSummarySql } from "../quality/quality.mapper.js";
import {
  qualitySummarySql,
  qualityReportChildSql,
} from "../quality/quality.mapper.js";
import { manufacturingSummarySql } from "../manufacturing/manufacturing.mapper.js";
import { mapManufacturingPaperPiece } from "../manufacturing/manufacturing.mapper.js";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  OrderNotFoundError,
  OrderStateConflictError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import { MANUFACTURING_PHYSICAL_PIECE_SELECT } from "../manufacturing/manufacturing.mapper.js";
import {
  WAREHOUSE_ACCEPTED_SOURCE_SELECT,
  WAREHOUSE_ATTEMPT_SELECT,
  WAREHOUSE_LOCKED_ROOT_SELECT,
  WAREHOUSE_RECEIPT_PIECE_SELECT,
  WAREHOUSE_RECEIPT_GROUP_SELECT,
  WAREHOUSE_ORDER_SELECT,
  mapWarehouseOrderSummary,
  mapWarehousePieceContext,
  mapWarehouseReceiptGroup,
  mapWarehouseOrder,
  warehouseSummarySql,
} from "./warehouse.mapper.js";
import { WarehouseSelectionConflictError } from "./warehouse.errors.js";
import type {
  CanonicalWarehouseOrder,
  LockedWarehouseOrder,
  WarehouseOrderRecord,
  WarehouseOrderContextRecord,
} from "./warehouse.types.js";

// Fixed aliases: d is a draft root, h its submitted header, p its physical piece.
export const warehouseOrderRelationSql = (): Prisma.Sql => Prisma.sql`(
  EXISTS(SELECT 1 FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id JOIN sales_order_pieces member ON member.id=e.piece_id AND member.order_id=e.order_id WHERE e.order_id=d.id AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE')
  OR EXISTS(SELECT 1 FROM warehouse_receipt_pieces receipt WHERE receipt.order_id=d.id)
  OR EXISTS(SELECT 1 FROM warehouse_delivery_attempts attempt WHERE attempt.order_id=d.id))`;

const warehouseRootsSql = () => Prisma.sql`WITH warehouse_roots AS (
  SELECT d.id,d.type,h.status,h.business_number,h.customer_name,
    totals.original,totals.cancelled,totals.active,totals.received,totals.healthy,
    attempt.id AS attempt_id,outcome.kind AS outcome_kind,outcome.returned_to_warehouse,retry.id AS retry_id,
    coalesce((SELECT max(c.occurred_at) FROM warehouse_command_orders g JOIN warehouse_commands c ON c.command_id=g.command_id WHERE g.order_id=d.id),
      (SELECT max(c.occurred_at) FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id WHERE e.order_id=d.id AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE'),
      (SELECT max(r.received_at) FROM warehouse_receipt_pieces r WHERE r.order_id=d.id)) AS last_action_at
  FROM sales_drafts d JOIN sales_orders h ON h.id=d.id
  CROSS JOIN LATERAL (SELECT count(*)::int AS original,count(*) FILTER(WHERE p.stage='CANCELLED')::int AS cancelled,
    count(*) FILTER(WHERE p.stage<>'CANCELLED')::int AS active,count(*) FILTER(WHERE p.stage<>'CANCELLED' AND p.received_at IS NOT NULL)::int AS received,
    coalesce(bool_and(p.stage='WAREHOUSE' AND p.work_state='COMPLETED' AND p.received_at IS NOT NULL AND p.issue_id IS NULL AND p.current_work_visit_id IS NULL AND p.cancelled_at IS NULL
      AND EXISTS(SELECT 1 FROM warehouse_receipt_pieces r WHERE r.piece_id=p.id AND r.order_id=p.order_id AND r.received_at=p.received_at)
      AND NOT EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.piece_id=p.id AND q.order_id=p.order_id AND q.state='OPEN')) FILTER(WHERE p.stage<>'CANCELLED'),false) AS healthy
    FROM sales_order_pieces p WHERE p.order_id=d.id) totals
  LEFT JOIN LATERAL (SELECT a.id FROM warehouse_delivery_attempts a WHERE a.order_id=d.id ORDER BY a.number DESC LIMIT 1) attempt ON true
  LEFT JOIN warehouse_delivery_outcomes outcome ON outcome.attempt_id=attempt.id AND outcome.order_id=d.id
  LEFT JOIN warehouse_delivery_retries retry ON retry.attempt_id=attempt.id AND retry.order_id=d.id
  WHERE d.status='SUBMITTED' AND h.approved_at IS NOT NULL AND ${warehouseOrderRelationSql()}
)`;

const queuePredicate = (view: WarehouseView): Prisma.Sql => {
  switch (view) {
    case "INCOMING":
      return Prisma.sql`r.status='APPROVED' AND p.stage='WAREHOUSE' AND p.work_state='INCOMING' AND p.received_at IS NULL AND p.issue_id IS NULL AND p.cancelled_at IS NULL AND p.current_work_visit_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.piece_id=p.id AND q.order_id=p.order_id AND q.state='OPEN')
      AND EXISTS(SELECT 1 FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id WHERE e.piece_id=p.id AND e.order_id=p.order_id AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE')
      AND NOT EXISTS(SELECT 1 FROM warehouse_receipt_pieces receipt WHERE receipt.piece_id=p.id)`;
    case "INCOMPLETE":
      return Prisma.sql`r.status='APPROVED' AND r.active>0 AND r.received<r.active`;
    case "READY":
      return Prisma.sql`r.status='READY_FOR_DELIVERY' AND r.active>0 AND r.received=r.active AND r.healthy AND (r.attempt_id IS NULL OR (r.outcome_kind='FAILED' AND r.returned_to_warehouse AND r.retry_id IS NOT NULL))`;
    case "OUT_FOR_DELIVERY":
      return Prisma.sql`r.status='OUT_FOR_DELIVERY' AND r.healthy AND r.attempt_id IS NOT NULL AND r.outcome_kind IS NULL AND r.retry_id IS NULL AND EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m WHERE m.attempt_id=r.attempt_id AND m.piece_id=p.id AND m.order_id=p.order_id)`;
    case "DELIVERY_FAILED":
      return Prisma.sql`r.status='DELIVERY_FAILED' AND r.healthy AND r.outcome_kind='FAILED' AND r.returned_to_warehouse AND r.retry_id IS NULL AND EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m WHERE m.attempt_id=r.attempt_id AND m.piece_id=p.id AND m.order_id=p.order_id)`;
    case "DELIVERED":
      return Prisma.sql`r.status='DELIVERED' AND r.healthy AND r.outcome_kind='DELIVERED' AND EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m WHERE m.attempt_id=r.attempt_id AND m.piece_id=p.id AND m.order_id=p.order_id)`;
  }
};
type QueueFilter = WarehouseDashboardQuery & {
  view: WarehouseView;
  orderId?: string | undefined;
};
const filteredQueue = (query: QueueFilter): Prisma.Sql => {
  const search =
    query.search === undefined
      ? null
      : "%" + query.search.replace(/[\\%_]/gu, "\\$&") + "%";
  return Prisma.sql`FROM warehouse_roots r JOIN sales_order_pieces p ON p.order_id=r.id JOIN sales_draft_pieces specification ON specification.id=p.id AND specification.draft_id=r.id
    WHERE p.stage<>'CANCELLED' AND ${queuePredicate(query.view)}
    AND ${query.type === undefined ? Prisma.sql`true` : Prisma.sql`r.type=${query.type}::sales_order_type`}
    AND ${query.orderId === undefined ? Prisma.sql`true` : Prisma.sql`r.id=${query.orderId}::uuid`}
    AND ${
      search === null
        ? Prisma.sql`true`
        : Prisma.sql`(r.business_number ILIKE ${search} OR r.customer_name ILIKE ${search} OR p.id::text ILIKE ${search} OR specification.model ILIKE ${search}
      OR EXISTS(SELECT 1 FROM manufacturing_piece_events e JOIN manufacturing_commands c ON c.command_id=e.command_id WHERE e.piece_id=p.id AND e.order_id=p.order_id AND c.actor_full_name ILIKE ${search})
      OR EXISTS(SELECT 1 FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id WHERE e.piece_id=p.id AND e.order_id=p.order_id AND c.actor_full_name ILIKE ${search})
      OR EXISTS(SELECT 1 FROM warehouse_command_orders g JOIN warehouse_commands c ON c.command_id=g.command_id WHERE g.order_id=p.order_id AND p.id=ANY(g.piece_ids) AND c.actor_full_name ILIKE ${search}))`
    }`;
};
const queueCounts = async (
  tx: Prisma.TransactionClient,
  query: QueueFilter,
) => {
  const rows = await tx.$queryRaw<{ orders: bigint; pieces: bigint }[]>(
    Prisma.sql`${warehouseRootsSql()} SELECT count(DISTINCT p.order_id) AS orders,count(*) AS pieces ${filteredQueue(query)}`,
  );
  const row = rows[0];
  if (
    row === undefined ||
    row.orders > BigInt(Number.MAX_SAFE_INTEGER) ||
    row.pieces > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new InternalServerError(
      "Warehouse queue counts exceeded their safe range.",
    );
  return { orders: Number(row.orders), pieces: Number(row.pieces) };
};

const loadContexts = async (
  tx: Prisma.TransactionClient,
  roots: readonly WarehouseOrderRecord[],
  includeRegistries: boolean,
): Promise<WarehouseOrderContextRecord[]> => {
  if (roots.length === 0) return [];
  const orderIds = roots.map((root) => root.id),
    physical = roots.flatMap((root) => {
      if (root.pieces.length > 200)
        throw new InternalServerError(
          "A warehouse order exceeds the physical piece bound.",
        );
      return root.pieces.map((piece) => {
        if (
          piece.orderPiece === null ||
          piece.orderPiece.orderId !== root.id ||
          piece.orderPiece.id !== piece.id
        )
          throw new InternalServerError(
            "A warehouse piece lost its physical identity.",
          );
        return piece.orderPiece;
      });
    }),
    pieceIds = physical.map((piece) => piece.id);
  if (pieceIds.length === 0)
    throw new InternalServerError("A warehouse order has no physical pieces.");
  const sourceIds = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT DISTINCT ON(e.piece_id) e.id FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id WHERE e.piece_id IN (${uuidList(pieceIds)}) AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE' ORDER BY e.piece_id,g.after_version DESC,e.id DESC`,
  );
  const accepted =
    sourceIds.length === 0
      ? []
      : await tx.qualityPieceEvent.findMany({
          where: { id: { in: sourceIds.map((row) => row.id) } },
          select: WAREHOUSE_ACCEPTED_SOURCE_SELECT,
        });
  const receipts = await tx.warehouseReceiptPiece.findMany({
    where: { orderId: { in: orderIds } },
    select: WAREHOUSE_RECEIPT_PIECE_SELECT,
  });
  const groups = includeRegistries
    ? await tx.warehouseReceiptGroup.findMany({
        where: { orderId: { in: orderIds } },
        select: WAREHOUSE_RECEIPT_GROUP_SELECT,
      })
    : [];
  const latestIds = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT DISTINCT ON(order_id) id FROM warehouse_delivery_attempts WHERE order_id IN (${uuidList(orderIds)}) ORDER BY order_id,number DESC`,
  );
  const attempts =
    latestIds.length === 0
      ? []
      : await tx.warehouseDeliveryAttempt.findMany({
          where: { id: { in: latestIds.map((row) => row.id) } },
          select: WAREHOUSE_ATTEMPT_SELECT,
        });
  const corrections = await tx.qualityCorrectionCycle.findMany({
    where: { orderId: { in: orderIds }, state: "OPEN" },
    select: { orderId: true, pieceId: true },
  });
  const actionTimes = await tx.$queryRaw<
    { id: string; lastActionAt: Date | null }[]
  >(
    Prisma.sql`${warehouseRootsSql()} SELECT id,last_action_at AS "lastActionAt" FROM warehouse_roots WHERE id IN (${uuidList(orderIds)})`,
  );
  const packingByOrder = new Map<string, Map<string, QualityPackingGroup>>();
  if (includeRegistries && accepted.length > 0) {
    const rows = await tx.$queryRaw<
      {
        orderId: string;
        pieceId: string;
        inspectionId: string;
        packing: unknown;
      }[]
    >(Prisma.sql`
      SELECT packing.order_id AS "orderId",e.piece_id AS "pieceId",g.event_id AS "inspectionId",${qualityPackingSummarySql} AS packing
      FROM quality_piece_events e JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id JOIN quality_commands c ON c.command_id=g.command_id AND c.operation='INSPECT'
      JOIN quality_packing_groups packing ON packing.command_id=g.command_id AND packing.order_id=g.order_id
      JOIN quality_packing_pieces member ON member.group_id=packing.id AND member.piece_id=e.piece_id
      WHERE e.id IN (${uuidList(accepted.map((source) => source.id))}) AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE'`);
    for (const row of rows) {
      const group = qualityPackingGroupSchema.safeParse(row.packing),
        source = accepted.find(
          (value) =>
            value.pieceId === row.pieceId && value.orderId === row.orderId,
        );
      if (
        !group.success ||
        source === undefined ||
        row.inspectionId !== source.commandOrder.eventId ||
        group.data.inspectionId !== row.inspectionId ||
        !group.data.acceptedPieceIds.includes(row.pieceId)
      )
        throw new InternalServerError(
          "A warehouse packing reference lost its original inspection identity.",
        );
      const registry =
        packingByOrder.get(row.orderId) ??
        new Map<string, QualityPackingGroup>();
      registry.set(group.data.id, {
        ...group.data,
        packedAt: new Date(group.data.packedAt).toISOString(),
      });
      packingByOrder.set(row.orderId, registry);
    }
  }
  const issues = includeRegistries
    ? await tx.$queryRaw<
        {
          orderId: string;
          pieceId: string;
          issueId: string;
          state: string;
          reason: string;
          reportNotes: string | null;
          target: string | null;
        }[]
      >(
        Prisma.sql`SELECT DISTINCT ON(order_id,piece_id) order_id AS "orderId",piece_id AS "pieceId",id AS "issueId",state,reason,notes AS "reportNotes",resume_target AS target FROM manufacturing_issues WHERE order_id IN (${uuidList(orderIds)}) ORDER BY order_id,piece_id,(state<>'RESOLVED') DESC,cycle DESC,id DESC`,
      )
    : [];
  const instructions = await findIssueInstructions(
    tx,
    issues.map((issue) => issue.issueId),
    "FACTORY",
  );
  return roots.map((root) => ({
    root,
    physical: physical.filter((piece) => piece.orderId === root.id),
    acceptedByPiece: new Map(
      accepted
        .filter((source) => source.orderId === root.id)
        .map((source) => [source.pieceId, source]),
    ),
    receiptByPiece: new Map(
      receipts
        .filter((receipt) => receipt.orderId === root.id)
        .map((receipt) => [receipt.pieceId, receipt]),
    ),
    receiptGroups: groups.filter((group) => group.orderId === root.id),
    qualityPackingGroups: [...(packingByOrder.get(root.id)?.values() ?? [])],
    latestAttempt:
      attempts.find((attempt) => attempt.orderId === root.id) ?? null,
    issueInstructions: issues
      .filter((issue) => issue.orderId === root.id)
      .map(({ orderId: _orderId, ...issue }) =>
        factoryOrderPaperDataSchema.shape.issues.element.parse({
          ...issue,
          approvedInstructions: instructions.get(issue.issueId)?.text ?? null,
        }),
      ),
    openCorrectionPieceIds: new Set(
      corrections
        .filter((correction) => correction.orderId === root.id)
        .map((correction) => correction.pieceId),
    ),
    lastActionAt:
      actionTimes.find((row) => row.id === root.id)?.lastActionAt ?? null,
  }));
};
export const loadWarehouseContexts = (
  tx: Prisma.TransactionClient,
  roots: readonly WarehouseOrderRecord[],
) => loadContexts(tx, roots, true);

const assertWarehouseOrderRelation = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<void> => {
  assertBusinessAuthority(actor, "WAREHOUSE");
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`${warehouseRootsSql()} SELECT id FROM warehouse_roots WHERE id=${orderId}::uuid`,
  );
  if (rows.length !== 1) throw new OrderNotFoundError();
};
export const findWarehouseDashboard = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: WarehouseDashboardQuery,
) => {
  assertBusinessAuthority(actor, "WAREHOUSE");
  const incoming = await queueCounts(tx, { ...query, view: "INCOMING" }),
    incomplete = await queueCounts(tx, { ...query, view: "INCOMPLETE" }),
    ready = await queueCounts(tx, { ...query, view: "READY" }),
    outForDelivery = await queueCounts(tx, {
      ...query,
      view: "OUT_FOR_DELIVERY",
    }),
    deliveryFailed = await queueCounts(tx, {
      ...query,
      view: "DELIVERY_FAILED",
    }),
    delivered = await queueCounts(tx, { ...query, view: "DELIVERED" });
  return warehouseDashboardDataSchema.parse({
    counts: {
      incoming,
      incomplete,
      ready,
      outForDelivery,
      deliveryFailed,
      delivered,
    },
  });
};
export const findWarehouseOrders = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: WarehouseOrdersQuery,
) => {
  assertBusinessAuthority(actor, "WAREHOUSE");
  const page = parsePaginationQuery(query),
    counts = await queueCounts(tx, query);
  const rows = await tx.$queryRaw<{ id: string; pieceIds: string[] }[]>(
    Prisma.sql`${warehouseRootsSql()} SELECT r.id,array_agg(p.id ORDER BY specification.position,p.id) AS "pieceIds" ${filteredQueue(query)} GROUP BY r.id,r.last_action_at ORDER BY r.last_action_at DESC NULLS LAST,r.id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const roots =
    rows.length === 0
      ? []
      : await tx.salesDraft.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
          select: WAREHOUSE_ORDER_SELECT,
        });
  const contexts = await loadContexts(tx, roots, false),
    byId = new Map(contexts.map((context) => [context.root.id, context]));
  return warehouseOrdersDataSchema.parse({
    department: "WAREHOUSE",
    view: query.view,
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.orders }),
    orders: rows.map((row) => {
      const context = byId.get(row.id);
      if (context === undefined)
        throw new InternalServerError(
          "A warehouse page lost its selected root.",
        );
      return mapWarehouseOrderSummary(context, row.pieceIds);
    }),
  });
};
export const findWarehousePieces = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: WarehousePiecesQuery,
) => {
  assertBusinessAuthority(actor, "WAREHOUSE");
  if (query.orderId !== undefined)
    await assertWarehouseOrderRelation(tx, actor, query.orderId);
  const page = parsePaginationQuery(query),
    counts = await queueCounts(tx, query);
  const rows = await tx.$queryRaw<{ id: string; orderId: string }[]>(
    Prisma.sql`${warehouseRootsSql()} SELECT p.id,p.order_id AS "orderId" ${filteredQueue(query)} ORDER BY r.last_action_at DESC NULLS LAST,r.id DESC,specification.position ASC,p.id ASC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const ids = [...new Set(rows.map((row) => row.orderId))];
  const matching =
    ids.length === 0
      ? []
      : await tx.$queryRaw<{ id: string; pieceIds: string[] }[]>(
          Prisma.sql`${warehouseRootsSql()} SELECT r.id,array_agg(p.id ORDER BY specification.position,p.id) AS "pieceIds" ${filteredQueue(query)} AND r.id IN (${uuidList(ids)}) GROUP BY r.id`,
        );
  const roots =
    ids.length === 0
      ? []
      : await tx.salesDraft.findMany({
          where: { id: { in: ids } },
          select: WAREHOUSE_ORDER_SELECT,
        });
  const contexts = await loadWarehouseContexts(tx, roots),
    byId = new Map(contexts.map((context) => [context.root.id, context]));
  const pieces = rows.map((row) => {
    const context = byId.get(row.orderId),
      matches = matching.find((group) => group.id === row.orderId);
    const piece = context?.root.pieces.find((value) => value.id === row.id);
    if (context === undefined || matches === undefined || piece === undefined)
      throw new InternalServerError(
        "A warehouse flat page lost its matching physical identity.",
      );
    return {
      order: mapWarehouseOrderSummary(context, matches.pieceIds),
      piece: mapManufacturingPaperPiece(piece, row.orderId),
      work: mapWarehousePieceContext(context, row.id),
    };
  });
  const receiptIds = new Set(
      pieces.flatMap((row) =>
        row.work.receiptGroupId === null ? [] : [row.work.receiptGroupId],
      ),
    ),
    packingIds = new Set(
      pieces.flatMap((row) =>
        row.work.acceptedHandoff?.packingGroupId
          ? [row.work.acceptedHandoff.packingGroupId]
          : [],
      ),
    );
  return warehousePiecesDataSchema.parse({
    department: "WAREHOUSE",
    view: query.view,
    orderId: query.orderId ?? null,
    pieces,
    counts,
    pagination: buildPaginationMeta({ ...page, total: counts.pieces }),
    receiptGroups: contexts
      .flatMap((context) => context.receiptGroups)
      .filter((group) => receiptIds.has(group.id))
      .map(mapWarehouseReceiptGroup),
    qualityPackingGroups: contexts
      .flatMap((context) => context.qualityPackingGroups)
      .filter((group) => packingIds.has(group.id)),
  });
};

export const findWarehouseOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
) => {
  await assertWarehouseOrderRelation(tx, actor, orderId);
  const root = await tx.salesDraft.findUnique({
    where: { id: orderId },
    select: WAREHOUSE_ORDER_SELECT,
  });
  if (root === null) throw new OrderNotFoundError();
  const [context] = await loadWarehouseContexts(tx, [root]);
  if (context === undefined)
    throw new InternalServerError(
      "A warehouse detail lost its selected context.",
    );
  return mapWarehouseOrder(context);
};

type HistoryFilter = {
  orderId?: string | undefined;
  pieceId?: string | undefined;
  warehouseOnly: boolean;
};
const historySource = (filter: HistoryFilter): Prisma.Sql => {
  const groupFilter =
    filter.orderId === undefined
      ? Prisma.sql`true`
      : Prisma.sql`g.order_id=${filter.orderId}::uuid`;
  const pieceFilter =
    filter.pieceId === undefined
      ? Prisma.sql`true`
      : Prisma.sql`${filter.pieceId}::uuid=ANY(g.piece_ids)`;
  const warehouse = Prisma.sql`SELECT g.event_id,g.command_id,g.order_id,c.occurred_at,'warehouse'::text AS kind FROM warehouse_command_orders g JOIN warehouse_commands c ON c.command_id=g.command_id JOIN warehouse_roots r ON r.id=g.order_id WHERE ${groupFilter} AND ${pieceFilter}`;
  if (filter.warehouseOnly) return warehouse;
  const qualityPiece =
    filter.pieceId === undefined
      ? Prisma.sql`true`
      : Prisma.sql`EXISTS(SELECT 1 FROM quality_piece_events member WHERE member.command_id=g.command_id AND member.order_id=g.order_id AND member.piece_id=${filter.pieceId}::uuid)`;
  const manufacturingPiece =
    filter.pieceId === undefined
      ? Prisma.sql`true`
      : Prisma.sql`EXISTS(SELECT 1 FROM manufacturing_piece_events member WHERE member.command_id=g.command_id AND member.order_id=g.order_id AND member.piece_id=${filter.pieceId}::uuid)`;
  return Prisma.sql`${warehouse}
    UNION ALL SELECT g.event_id,g.command_id,g.order_id,c.occurred_at,'quality' FROM quality_command_orders g JOIN quality_commands c ON c.command_id=g.command_id JOIN warehouse_roots r ON r.id=g.order_id WHERE ${groupFilter} AND ${qualityPiece}
    UNION ALL SELECT g.event_id,g.command_id,g.order_id,c.occurred_at,'manufacturing' FROM manufacturing_command_orders g JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN warehouse_roots r ON r.id=g.order_id WHERE ${groupFilter} AND ${manufacturingPiece}
    UNION ALL SELECT c.command_id,c.command_id,c.order_id,c.occurred_at,'issue' FROM approval_commands c JOIN warehouse_roots r ON r.id=c.order_id
    WHERE c.operation IN ('REPORT_ISSUE','RESOLVE_ISSUE','REVIEW_CONTACT') AND c.piece_id IS NOT NULL AND NOT ${qualityReportChildSql}
    AND ${filter.orderId === undefined ? Prisma.sql`true` : Prisma.sql`c.order_id=${filter.orderId}::uuid`}
    AND ${filter.pieceId === undefined ? Prisma.sql`true` : Prisma.sql`c.piece_id=${filter.pieceId}::uuid`}`;
};
const warehouseIssueSummarySql = Prisma.sql`jsonb_build_object(
 'id',c.command_id,'commandId',c.command_id,'orderId',c.order_id,'orderVersion',c.after_version,'businessNumber',h.business_number,
 'pieceId',c.piece_id,'issueId',c.issue_id,'sourceDepartment',issue.source_department,'operation',c.operation,
 'result',CASE WHEN c.operation='REPORT_ISSUE' THEN 'REPORTED' WHEN c.decision='CANCEL' THEN 'CANCELLED' WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN 'RELEASED' ELSE 'HELD_FOR_CONTACT' END,
 'target',CASE WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.outcome->>'pieceStage' ELSE NULL END,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),'occurredAt',c.occurred_at,
 'reason',CASE WHEN c.operation='REPORT_ISSUE' THEN issue.reason WHEN c.decision='CANCEL' THEN c.decision_notes ELSE NULL END,
 'notes',CASE WHEN c.operation='REPORT_ISSUE' THEN issue.notes WHEN c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT') THEN c.decision_notes ELSE NULL END,
 'correctionResolution',(SELECT jsonb_build_object('correctionId',cycle.id,'cycle',cycle.cycle,'outcome','CANCELLED') FROM quality_correction_cycles cycle WHERE cycle.resolution_approval_command_id=c.command_id AND cycle.order_id=c.order_id AND cycle.piece_id=c.piece_id AND cycle.state='CANCELLED' AND cycle.resolved_at=c.occurred_at))`;

const warehouseHistoryPage = async (
  tx: Prisma.TransactionClient,
  query: WarehouseActivityQuery,
  filter: HistoryFilter,
) => {
  const page = parsePaginationQuery(query),
    source = historySource(filter);
  const [count] = await tx.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`${warehouseRootsSql()} SELECT count(*) AS total FROM (${source}) history`,
  );
  if (count === undefined || count.total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InternalServerError(
      "Warehouse history counts exceeded their safe range.",
    );
  // Page immutable identities before projecting any grouped historical payload.
  const events = await tx.$queryRaw<
    { kind: string; event: unknown }[]
  >(Prisma.sql`${warehouseRootsSql()}, selected_events AS MATERIALIZED (
    SELECT * FROM (${source}) identities ORDER BY occurred_at DESC,event_id DESC,kind ASC LIMIT ${page.take} OFFSET ${page.skip}
  ), projected AS (
    SELECT page.kind,page.occurred_at,page.event_id,${warehouseSummarySql} AS event FROM selected_events page JOIN warehouse_command_orders g ON page.kind='warehouse' AND g.command_id=page.command_id AND g.order_id=page.order_id JOIN warehouse_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
    UNION ALL SELECT page.kind,page.occurred_at,page.event_id,${qualitySummarySql} FROM selected_events page JOIN quality_command_orders g ON page.kind='quality' AND g.command_id=page.command_id AND g.order_id=page.order_id JOIN quality_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
    UNION ALL SELECT page.kind,page.occurred_at,page.event_id,${manufacturingSummarySql} FROM selected_events page JOIN manufacturing_command_orders g ON page.kind='manufacturing' AND g.command_id=page.command_id AND g.order_id=page.order_id JOIN manufacturing_commands c ON c.command_id=g.command_id JOIN sales_orders h ON h.id=g.order_id
    UNION ALL SELECT page.kind,page.occurred_at,page.event_id,${warehouseIssueSummarySql} FROM selected_events page JOIN approval_commands c ON page.kind='issue' AND c.command_id=page.command_id AND c.order_id=page.order_id JOIN manufacturing_issues issue ON issue.id=c.issue_id AND issue.order_id=c.order_id AND issue.piece_id=c.piece_id JOIN sales_orders h ON h.id=c.order_id
  ) SELECT kind,event FROM projected ORDER BY occurred_at DESC,event_id DESC,kind ASC`);
  return {
    department: "WAREHOUSE" as const,
    events,
    pagination: buildPaginationMeta({ ...page, total: Number(count.total) }),
  };
};
export const findWarehouseActivity = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: WarehouseActivityQuery,
) => {
  assertBusinessAuthority(actor, "WAREHOUSE");
  return warehouseActivityDataSchema.parse(
    await warehouseHistoryPage(tx, query, { warehouseOnly: true }),
  );
};
export const findWarehouseOrderHistory = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
  query: WarehouseOrderHistoryQuery,
) => {
  await assertWarehouseOrderRelation(tx, actor, orderId);
  if (
    query.pieceId !== undefined &&
    (await tx.salesOrderPiece.count({
      where: { id: query.pieceId, orderId },
    })) !== 1
  )
    throw new OrderNotFoundError();
  return warehouseOrderHistoryDataSchema.parse({
    orderId,
    ...(await warehouseHistoryPage(tx, query, {
      orderId,
      pieceId: query.pieceId,
      warehouseOnly: false,
    })),
  });
};

const uuidList = (ids: readonly string[]) =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
type OrderAggregate = LockedWarehouseOrder["counts"] & {
  orderId: string;
  hasActiveBlocker: boolean;
};

export const lockWarehouseOrders = async (
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorityAccount;
    body: WarehouseCommandBody;
    orders: readonly CanonicalWarehouseOrder[];
  },
): Promise<LockedWarehouseOrder[]> => {
  assertBusinessAuthority(input.actor, "WAREHOUSE");
  const orders = [...input.orders].sort((a, b) =>
    a.orderId.localeCompare(b.orderId),
  );
  for (const group of orders) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM sales_drafts WHERE id=${group.orderId}::uuid AND status='SUBMITTED' FOR UPDATE`;
    if (rows.length !== 1) throw new OrderNotFoundError();
  }
  const orderIds = orders.map((group) => group.orderId),
    pieceIds = orders.flatMap((group) => group.pieceIds);
  const roots = await tx.salesDraft.findMany({
    where: { id: { in: orderIds } },
    select: WAREHOUSE_LOCKED_ROOT_SELECT,
  });
  const visible = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT o.id FROM sales_orders o WHERE o.id IN (${uuidList(orderIds)}) AND (
      EXISTS(SELECT 1 FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id WHERE e.order_id=o.id AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE')
      OR EXISTS(SELECT 1 FROM warehouse_receipt_pieces r WHERE r.order_id=o.id)
      OR EXISTS(SELECT 1 FROM warehouse_delivery_attempts a WHERE a.order_id=o.id))`);
  const visibleIds = new Set(visible.map((root) => root.id));
  const physical = await tx.salesOrderPiece.findMany({
    where: { id: { in: pieceIds } },
    select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
  });
  const rootById = new Map(roots.map((root) => [root.id, root])),
    pieceById = new Map(physical.map((piece) => [piece.id, piece]));
  // Establish visibility and exact identity before revealing mutable versions/state, including for ADMIN.
  for (const group of orders) {
    const root = rootById.get(group.orderId);
    if (
      root?.order === null ||
      root === undefined ||
      !visibleIds.has(group.orderId) ||
      group.pieceIds.some((id) => pieceById.get(id)?.orderId !== group.orderId)
    )
      throw new OrderNotFoundError();
  }
  const aggregates = await tx.$queryRaw<OrderAggregate[]>(Prisma.sql`
    SELECT p.order_id AS "orderId", count(*)::int AS original,
      count(*) FILTER(WHERE p.stage='CANCELLED')::int AS cancelled,
      count(*) FILTER(WHERE p.stage<>'CANCELLED')::int AS active,
      count(*) FILTER(WHERE p.stage<>'CANCELLED' AND p.received_at IS NOT NULL)::int AS received,
      bool_or(p.stage<>'CANCELLED' AND (p.issue_id IS NOT NULL OR p.current_work_visit_id IS NOT NULL OR p.work_state='BLOCKED' OR EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.piece_id=p.id AND q.order_id=p.order_id AND q.state='OPEN'))) AS "hasActiveBlocker"
    FROM sales_order_pieces p WHERE p.order_id IN (${uuidList(orderIds)}) GROUP BY p.order_id`);
  const aggregateById = new Map(aggregates.map((row) => [row.orderId, row]));
  for (const group of orders) {
    const root = rootById.get(group.orderId),
      aggregate = aggregateById.get(group.orderId);
    if (root === undefined || root.order === null || aggregate === undefined)
      throw new OrderNotFoundError();
    if (root.version !== group.expectedVersion)
      throw new OrderVersionConflictError();
    if (root.version >= 2_147_483_647) throw new OrderVersionConflictError();
    if (aggregate.original > 200) throw new WarehouseSelectionConflictError();
    const expectedStatus =
      input.body.operation === "RECEIVE"
        ? "APPROVED"
        : input.body.operation === "DISPATCH"
          ? "READY_FOR_DELIVERY"
          : input.body.operation === "RETRY_DELIVERY"
            ? "DELIVERY_FAILED"
            : "OUT_FOR_DELIVERY";
    if (root.order.status !== expectedStatus || root.order.approvedAt === null)
      throw new OrderStateConflictError();
    if (
      input.body.operation !== "RECEIVE" &&
      (aggregate.active !== group.pieceIds.length ||
        aggregate.active === 0 ||
        group.pieceIds.some((id) => pieceById.get(id)?.stage === "CANCELLED"))
    )
      throw new WarehouseSelectionConflictError();
  }
  const sourceIds = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT ON(e.piece_id) e.id FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
    WHERE e.piece_id IN (${uuidList(pieceIds)}) AND c.operation='INSPECT' AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE' ORDER BY e.piece_id,g.after_version DESC,e.id DESC`);
  const accepted =
    sourceIds.length === 0
      ? []
      : await tx.qualityPieceEvent.findMany({
          where: { id: { in: sourceIds.map((row) => row.id) } },
          select: WAREHOUSE_ACCEPTED_SOURCE_SELECT,
        });
  const receipts = await tx.warehouseReceiptPiece.findMany({
    where: { pieceId: { in: pieceIds } },
    select: WAREHOUSE_RECEIPT_PIECE_SELECT,
  });
  const corrections = await tx.qualityCorrectionCycle.count({
    where: { pieceId: { in: pieceIds }, state: "OPEN" },
  });
  if (corrections !== 0) throw new WarehouseSelectionConflictError();
  const latestIds =
    input.body.operation === "RECEIVE"
      ? []
      : await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT DISTINCT ON(order_id) id FROM warehouse_delivery_attempts WHERE order_id IN (${uuidList(orderIds)}) ORDER BY order_id,number DESC`,
        );
  // Whole active membership was bounded against the reviewed total before loading attempt members.
  const attempts =
    latestIds.length === 0
      ? []
      : await tx.warehouseDeliveryAttempt.findMany({
          where: { id: { in: latestIds.map((row) => row.id) } },
          select: WAREHOUSE_ATTEMPT_SELECT,
        });
  return orders.map((reviewed) => {
    const root = rootById.get(reviewed.orderId),
      aggregate = aggregateById.get(reviewed.orderId);
    if (root === undefined || aggregate === undefined)
      throw new OrderNotFoundError();
    return {
      root,
      reviewed,
      physical: physical.filter((piece) => piece.orderId === root.id),
      counts: {
        original: aggregate.original,
        cancelled: aggregate.cancelled,
        active: aggregate.active,
        received: aggregate.received,
      },
      hasActiveBlocker: aggregate.hasActiveBlocker,
      acceptedByPiece: new Map(
        accepted
          .filter((source) => source.orderId === root.id)
          .map((source) => [source.pieceId, source]),
      ),
      receiptByPiece: new Map(
        receipts
          .filter((receipt) => receipt.orderId === root.id)
          .map((receipt) => [receipt.pieceId, receipt]),
      ),
      latestAttempt:
        attempts.find((attempt) => attempt.orderId === root.id) ?? null,
    };
  });
};
