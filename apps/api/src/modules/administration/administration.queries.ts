import {
  administrationOrderDataSchema,
  retainedSalesOrderSchema,
  type AdministrationOrderData,
} from "@template/contracts";
import {
  ADMINISTRATION_ORDER_SELECT,
  mapAdministrationActions,
} from "./administration.mapper.js";
import {
  mapSalesOrder,
  mapSalesOrderTracking,
} from "../sales-orders/sales-orders.mapper.js";
import {
  DRAFT_REFERENCE_SELECT,
  DRAFT_SELECT,
  mapDraft,
  mapDraftSequence,
} from "../sales-drafts/sales-drafts.mapper.js";
import { findAdministrationOrderActivity } from "../sales-orders/order-activity.queries.js";
import { OrderNotFoundError } from "../sales-orders/sales-orders.errors.js";
import {
  administrationDashboardDataSchema,
  administrationFilterOptionsDataSchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsDataSchema,
  staffListQuerySchema,
  type AdministrationDashboardQuery,
  type AdministrationDashboardData,
  type AdministrationFilterOptionsQuery,
  type AdministrationFilterOptionsData,
  type AdministrationApprovalsQuery,
  type AdministrationApprovalsData,
  type AdministrationCorrectionsQuery,
  type AdministrationCorrectionsData,
  type AdministrationDeliveryExceptionsQuery,
  type AdministrationDeliveryExceptionsData,
} from "@template/contracts";
import { buildStaffWhere } from "../staff/staff.queries.js";
import { ReportScopeTooLargeError } from "./administration.errors.js";
import { Prisma } from "@template/database";
import {
  administrationOrdersDataSchema,
  administrationOrderSummarySchema,
  draftSummarySchema,
  parseDraftReferenceSuffix,
  parseDraftSequence,
  salesUuidSchema,
  type AdministrationOrdersData,
  type AdministrationOrderFilters,
  type AdministrationOrdersQuery,
} from "@template/contracts";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  CUSTOMER_SUMMARY_SELECT,
  mapCustomerSummary,
} from "../customers/customers.mapper.js";
import { getDraftReadiness } from "../sales-drafts/sales-drafts.queries.js";
import {
  ADMINISTRATION_SUMMARY_SELECT,
  mapAdministrationOrderSummary,
} from "./administration.mapper.js";
import { resolveAdministrationPeriod } from "./administration.rules.js";
import type {
  AdministrationObservation,
  AdministrationResolvedPeriod,
} from "./administration.types.js";

const assertAdmin = (actor: AuthorityAccount) => {
  if (actor.role !== "ADMIN") throw new ForbiddenException();
};
const safeCount = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InternalServerError(
      "An administration count exceeds its safe range.",
    );
  return Number(value);
};
const literalSearch = (value: string) =>
  `%${value.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
export const administrationPhysicalFactsSql = (): Prisma.Sql => Prisma.sql`
 SELECT p.order_id,count(*) AS original,count(*) FILTER(WHERE p.stage='CANCELLED') AS cancelled,
 count(*) FILTER(WHERE p.stage<>'CANCELLED') AS active,
 count(*) FILTER(WHERE p.stage<>'CANCELLED' AND p.received_at IS NOT NULL) AS received,
 coalesce(array_agg(DISTINCT p.stage::text ORDER BY p.stage::text) FILTER(WHERE p.stage IN ('CUTTING','PRODUCTION','QUALITY','WAREHOUSE') AND p.cancelled_at IS NULL),ARRAY[]::text[]) AS departments
 FROM sales_order_pieces p GROUP BY p.order_id`;
export const administrationCohortSql = ({
  query,
  period,
}: Readonly<{
  query: AdministrationOrderFilters;
  period: AdministrationResolvedPeriod;
}>): Prisma.Sql => {
  const search =
      query.search === undefined ? null : literalSearch(query.search),
    uuid = salesUuidSchema.safeParse(query.search),
    draftReference = parseDraftReferenceSuffix(query.search ?? ""),
    draftSequence = parseDraftSequence(query.search ?? "");
  return Prisma.sql`WITH physical_facts AS (${administrationPhysicalFactsSql()}),rooted AS (
 SELECT d.id,d.owner_id,d.type,d.created_at,d.updated_at,d.delivery_date,d.status AS root_kind,
 coalesce(h.status::text,'DRAFT') AS status,h.business_number,h.approved_at,
 EXISTS(SELECT 1 FROM approval_commands a WHERE a.order_id=d.id AND a.operation='APPROVE_INITIAL') AS has_initial_approval,
 coalesce(c.customer_name,h.customer_name,customer.name) AS customer_name,
 coalesce(c.customer_phone,h.customer_phone,customer.phone) AS customer_phone,
 coalesce(f.original,0)::bigint AS original,coalesce(f.cancelled,0)::bigint AS cancelled,
 coalesce(f.active,0)::bigint AS active,coalesce(f.received,0)::bigint AS received,
 CASE WHEN h.status IN ('OUT_FOR_DELIVERY','DELIVERED') THEN ARRAY[]::text[] ELSE coalesce(f.departments,ARRAY[]::text[]) END AS current_departments,
 EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=d.id) AS has_quality_history,
 EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=d.id AND q.state='OPEN') AS has_open_quality,
 (h.id IS NOT NULL AND h.status NOT IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED','CANCELLED') AND coalesce(f.active,0)>0 AND d.delivery_date<${period.businessDate}::date) AS is_overdue,
 CASE WHEN d.status='DRAFT' THEN (SELECT count(*) FROM sales_draft_pieces s WHERE s.draft_id=d.id AND s.removed_at IS NULL) ELSE coalesce(f.original,0) END AS total_pieces
 FROM sales_drafts d LEFT JOIN sales_orders h ON h.id=d.id
 LEFT JOIN customers customer ON customer.id=d.customer_id
 LEFT JOIN physical_facts f ON f.order_id=d.id
 LEFT JOIN LATERAL(SELECT customer_name,customer_phone FROM administration_order_corrections WHERE order_id=d.id ORDER BY after_version DESC,command_id DESC LIMIT 1)c ON true
 WHERE ${query.type === undefined ? Prisma.sql`true` : Prisma.sql`d.type=${query.type}::sales_order_type`}
 AND ${query.salespersonId === undefined ? Prisma.sql`true` : Prisma.sql`d.owner_id=${query.salespersonId}::uuid`}
 AND ${period.effectiveFrom === null ? Prisma.sql`true` : Prisma.sql`d.created_at>=(${period.effectiveFrom}::date::timestamp AT TIME ZONE ${period.timeZone})`}
 AND ${period.effectiveTo === null ? Prisma.sql`true` : Prisma.sql`d.created_at<(((${period.effectiveTo}::date+1)::timestamp) AT TIME ZONE ${period.timeZone})`}
 AND ${
   search === null
     ? Prisma.sql`true`
     : Prisma.sql`(h.business_number ILIKE ${search} OR coalesce(c.customer_name,h.customer_name,customer.name) ILIKE ${search} OR coalesce(c.customer_phone,h.customer_phone,customer.phone) ILIKE ${search}
 OR ${uuid.success ? Prisma.sql`d.id=${uuid.data}::uuid` : Prisma.sql`false`}
 OR ${draftReference === null ? Prisma.sql`false` : Prisma.sql`(d.status='DRAFT' AND right(d.id::text,${draftReference.length}::int)=${draftReference})`}
 OR ${draftSequence === null ? Prisma.sql`false` : Prisma.sql`(d.status='DRAFT' AND EXISTS(SELECT 1 FROM sales_draft_references r WHERE r.draft_id=d.id AND r.number=${draftSequence}))`}
 OR EXISTS(SELECT 1 FROM sales_draft_pieces s WHERE s.draft_id=d.id AND s.removed_at IS NULL AND s.model ILIKE ${search}))`
 }
 ),cohort AS(SELECT * FROM rooted WHERE
 ${query.status === undefined ? Prisma.sql`true` : Prisma.sql`status=${query.status}`}
 AND ${query.department === undefined ? Prisma.sql`true` : Prisma.sql`${query.department}=ANY(current_departments)`}
 AND ${query.exception === undefined ? Prisma.sql`true` : query.exception === "OVERDUE" ? Prisma.sql`is_overdue` : query.exception === "PARTIALLY_CANCELLED" ? Prisma.sql`cancelled>0 AND active>0` : query.exception === "READY" ? Prisma.sql`status='READY_FOR_DELIVERY'` : Prisma.sql`status='DELIVERED'`})`;
};
type CohortRow = {
  id: string;
  status: keyof AdministrationOrdersData["statusCounts"];
  original: bigint;
  cancelled: bigint;
  active: bigint;
  received: bigint;
  current_departments: string[];
  has_quality_history: boolean;
  has_open_quality: boolean;
  is_overdue: boolean | null;
};
const loadAdministrationItems = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  rows: readonly CohortRow[],
): Promise<AdministrationOrdersData["items"]> => {
  const submittedIds = rows
      .filter((row) => row.status !== "DRAFT")
      .map((row) => row.id),
    draftIds = rows
      .filter((row) => row.status === "DRAFT")
      .map((row) => row.id);
  const submitted = await tx.salesDraft.findMany({
    where: { id: { in: submittedIds }, status: "SUBMITTED" },
    select: ADMINISTRATION_SUMMARY_SELECT,
  });
  const summaries = new Map(
    submitted.map((root) => {
      const row = rows.find((value) => value.id === root.id);
      if (!row)
        throw new InternalServerError(
          "The selected administration root is missing.",
        );
      const currentDepartments =
        administrationOrderSummarySchema.shape.currentDepartments.parse(
          ["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"].filter(
            (department) => row.current_departments.includes(department),
          ),
        );
      const active = safeCount(row.active),
        received = safeCount(row.received);
      return [
        root.id,
        mapAdministrationOrderSummary(root, actor, {
          original: safeCount(row.original),
          cancelled: safeCount(row.cancelled),
          active,
          received,
          completionPercent:
            active === 0
              ? 0
              : received === active
                ? 100
                : Math.min(99, Math.round((received / active) * 100)),
          currentDepartments,
          isOverdue: row.is_overdue === true,
          hasQualityCorrectionHistory: row.has_quality_history,
          hasOpenQualityCorrection: row.has_open_quality,
        }),
      ] as const;
    }),
  );
  const draftRows = await tx.salesDraft.findMany({
    where: { id: { in: draftIds }, status: "DRAFT" },
    select: {
      id: true,
      reference: DRAFT_REFERENCE_SELECT,
      version: true,
      type: true,
      deliveryDate: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, fullName: true } },
      customer: { select: CUSTOMER_SUMMARY_SELECT },
      _count: { select: { pieces: { where: { removedAt: null } } } },
    },
  });
  const drafts = new Map<string, AdministrationOrdersData["items"][number]>();
  if (draftRows.length) {
    const readiness = await getDraftReadiness(tx);
    for (const row of draftRows)
      drafts.set(row.id, {
        kind: "draft",
        draft: draftSummarySchema.parse({
          id: row.id,
          draftSequence: mapDraftSequence(row.reference),
          version: row.version,
          status: "DRAFT",
          type: row.type,
          deliveryDate: serializeNullableDateOnly(row.deliveryDate),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          owner: row.owner,
          customer: row.customer ? mapCustomerSummary(row.customer) : null,
          pieceCount: row._count.pieces,
          ...readiness,
        }),
      });
  }
  return rows.map((row) => {
    if (row.status === "DRAFT") {
      const item = drafts.get(row.id);
      if (item) return item;
    } else {
      const order = summaries.get(row.id);
      if (order) return { kind: "submitted", order };
    }
    throw new InternalServerError(
      "The administration cohort projection changed.",
    );
  });
};
export const findAdministrationOrders = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationOrdersQuery,
  observation: AdministrationObservation,
): Promise<AdministrationOrdersData> => {
  assertAdmin(actor);
  const period = resolveAdministrationPeriod(
      query,
      observation.generatedAt,
      observation.businessTimeZone,
    ),
    cohort = administrationCohortSql({ query, period }),
    page = parsePaginationQuery(query);
  const groups = await tx.$queryRaw<
    {
      status: keyof AdministrationOrdersData["statusCounts"];
      orders: bigint;
      pieces: bigint;
    }[]
  >(
    Prisma.sql`${cohort} SELECT status,count(*) AS orders,coalesce(sum(total_pieces),0)::bigint AS pieces FROM cohort GROUP BY status`,
  );
  const statusCounts: AdministrationOrdersData["statusCounts"] = {
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
  let totalOrders = 0,
    totalPieces = 0;
  for (const group of groups) {
    statusCounts[group.status] = safeCount(group.orders);
    totalOrders += safeCount(group.orders);
    totalPieces += safeCount(group.pieces);
  }
  if (!Number.isSafeInteger(totalOrders) || !Number.isSafeInteger(totalPieces))
    throw new InternalServerError(
      "Administration totals exceed their safe range.",
    );
  const rows = await tx.$queryRaw<CohortRow[]>(
    Prisma.sql`${cohort} SELECT id,status,original,cancelled,active,received,current_departments,has_quality_history,has_open_quality,is_overdue FROM cohort ORDER BY created_at DESC,id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return administrationOrdersDataSchema.parse({
    items: await loadAdministrationItems(tx, actor, rows),
    pagination: buildPaginationMeta({ ...page, total: totalOrders }),
    totalOrders,
    totalPieces,
    statusCounts,
    context: { query },
  });
};

const summaryColumns = Prisma.sql`id,status,original,cancelled,active,received,current_departments,has_quality_history,has_open_quality,is_overdue`;
export const findAdministrationDashboard = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  _query: AdministrationDashboardQuery,
  observation: AdministrationObservation,
): Promise<AdministrationDashboardData> => {
  assertAdmin(actor);
  const query = { period: "ALL" as const, search: undefined },
    period = resolveAdministrationPeriod(
      query,
      observation.generatedAt,
      observation.businessTimeZone,
    ),
    cohort = administrationCohortSql({ query, period });
  type Counts = AdministrationDashboardData["counts"];
  const [row] = await tx.$queryRaw<
    Record<Exclude<keyof Counts, "pendingUsers">, bigint>[]
  >(Prisma.sql`${cohort} SELECT
 count(*) AS "totalOrders",count(*) FILTER(WHERE status NOT IN ('DELIVERED','CANCELLED')) AS "activeOrders",
 count(*) FILTER(WHERE status='AWAITING_APPROVAL') AS "pendingApproval",
 (SELECT count(*) FROM quality_correction_cycles WHERE state='OPEN') AS "activeCorrections",
 (SELECT count(DISTINCT order_id) FROM quality_correction_cycles WHERE state='OPEN') AS "openCorrectionOrders",
 count(*) FILTER(WHERE status IN ('DELIVERY_FAILED','OUT_FOR_DELIVERY') OR is_overdue) AS "deliveryExceptions",
 count(*) FILTER(WHERE status='READY_FOR_DELIVERY' AND active>0 AND received=active AND NOT has_open_quality) AS "readyOrders",
 count(*) FILTER(WHERE is_overdue) AS "overdueOrders",count(*) FILTER(WHERE status='DELIVERY_FAILED') AS "failedDeliveries",
 coalesce(sum(active) FILTER(WHERE status NOT IN ('DELIVERED','CANCELLED')),0)::bigint AS "activePieces",
 coalesce(sum(active) FILTER(WHERE status='AWAITING_APPROVAL'),0)::bigint AS "pendingApprovalPieces",
 coalesce(sum(active) FILTER(WHERE is_overdue),0)::bigint AS "overduePieces",
 coalesce(sum(active) FILTER(WHERE status='READY_FOR_DELIVERY' AND active>0 AND received=active AND NOT has_open_quality),0)::bigint AS "readyPieces" FROM cohort`);
  if (!row)
    throw new InternalServerError(
      "Dashboard aggregation returned no observation.",
    );
  const pendingUsers = await tx.user.count({
    where: buildStaffWhere(staffListQuerySchema.parse({ scope: "pending" })),
  });
  const departments = await tx.$queryRaw<
    { department: string; pieces: bigint }[]
  >(
    Prisma.sql`${cohort} SELECT p.stage::text AS department,count(*) AS pieces FROM sales_order_pieces p JOIN cohort c ON c.id=p.order_id WHERE c.status NOT IN ('OUT_FOR_DELIVERY','DELIVERED') AND p.stage IN ('CUTTING','PRODUCTION','QUALITY','WAREHOUSE') AND p.cancelled_at IS NULL GROUP BY p.stage`,
  );
  const recent = await tx.$queryRaw<CohortRow[]>(
    Prisma.sql`${cohort} SELECT ${summaryColumns} FROM cohort ORDER BY updated_at DESC,id DESC LIMIT 5`,
  );
  return administrationDashboardDataSchema.parse({
    generatedAt: observation.generatedAt.toISOString(),
    businessDate: period.businessDate,
    counts: {
      ...Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, safeCount(value)]),
      ),
      pendingUsers,
    },
    departments: ["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"].map(
      (department) => ({
        department,
        pieces: safeCount(
          departments.find((row) => row.department === department)?.pieces ??
            0n,
        ),
      }),
    ),
    recentOrders: await loadAdministrationItems(tx, actor, recent),
  });
};
export const findAdministrationFilterOptions = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationFilterOptionsQuery,
  _observation: AdministrationObservation,
): Promise<AdministrationFilterOptionsData> => {
  assertAdmin(actor);
  const [count] = await tx.$queryRaw<
    { total: bigint }[]
  >`SELECT count(DISTINCT owner_id) AS total FROM sales_drafts`;
  if (!count) throw new InternalServerError("Owner option count is missing.");
  if (safeCount(count.total) > 5000) throw new ReportScopeTooLargeError();
  const salespeople = await tx.$queryRaw<
    AdministrationFilterOptionsData["salespeople"]
  >`SELECT u.id,u.full_name AS "fullName",u.phone FROM users u WHERE EXISTS(SELECT 1 FROM sales_drafts d WHERE d.owner_id=u.id) ORDER BY u.full_name,u.id LIMIT 5000`;
  let legacySalesperson: AdministrationFilterOptionsData["legacySalesperson"] =
    null;
  if (query.salespersonName !== undefined) {
    const matches = await tx.$queryRaw<
      { id: string }[]
    >`SELECT DISTINCT d.owner_id AS id FROM sales_drafts d JOIN users u ON u.id=d.owner_id LEFT JOIN sales_orders h ON h.id=d.id WHERE u.full_name=${query.salespersonName} OR h.owner_full_name_at_submission=${query.salespersonName} ORDER BY id LIMIT 2`;
    legacySalesperson = {
      input: query.salespersonName,
      match:
        matches.length === 1
          ? "UNIQUE"
          : matches.length === 0
            ? "MISSING"
            : "AMBIGUOUS",
      salespersonId: matches.length === 1 ? (matches[0]?.id ?? null) : null,
    };
  }
  const output = { context: { query }, salespeople, legacySalesperson };
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > 8_388_608)
    throw new ReportScopeTooLargeError();
  return administrationFilterOptionsDataSchema.parse(output);
};
export const findAdministrationApprovals = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationApprovalsQuery,
  observation: AdministrationObservation,
): Promise<AdministrationApprovalsData> => {
  assertAdmin(actor);
  const filters = { period: "ALL" as const, search: query.search },
    period = resolveAdministrationPeriod(
      filters,
      observation.generatedAt,
      observation.businessTimeZone,
    ),
    base = administrationCohortSql({ query: filters, period }),
    page = parsePaginationQuery(query);
  const [aggregate] = await tx.$queryRaw<
    { pending: bigint; returned: bigint; approved: bigint; all: bigint }[]
  >(
    Prisma.sql`${base} SELECT count(*) FILTER(WHERE status='AWAITING_APPROVAL') AS pending,count(*) FILTER(WHERE status='RETURNED') AS returned,count(*) FILTER(WHERE has_initial_approval) AS approved,count(*) AS all FROM cohort WHERE root_kind='SUBMITTED'`,
  );
  if (!aggregate)
    throw new InternalServerError("Approval oversight count is missing.");
  const counts = {
    pending: safeCount(aggregate.pending),
    returned: safeCount(aggregate.returned),
    approved: safeCount(aggregate.approved),
    all: safeCount(aggregate.all),
  };
  const tab =
    query.tab === "PENDING"
      ? Prisma.sql`status='AWAITING_APPROVAL'`
      : query.tab === "RETURNED"
        ? Prisma.sql`status='RETURNED'`
        : query.tab === "APPROVED"
          ? Prisma.sql`has_initial_approval`
          : Prisma.sql`true`;
  const total =
    query.tab === "PENDING"
      ? counts.pending
      : query.tab === "RETURNED"
        ? counts.returned
        : query.tab === "APPROVED"
          ? counts.approved
          : counts.all;
  const rows = await tx.$queryRaw<CohortRow[]>(
    Prisma.sql`${base} SELECT ${summaryColumns} FROM cohort WHERE root_kind='SUBMITTED' AND ${tab} ORDER BY created_at DESC,id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const items = await loadAdministrationItems(tx, actor, rows);
  return administrationApprovalsDataSchema.parse({
    items: items.map((item) => {
      if (item.kind !== "submitted")
        throw new InternalServerError("Approval oversight contains a draft.");
      return item.order;
    }),
    counts,
    pagination: buildPaginationMeta({ ...page, total }),
    context: { query },
  });
};
export const findAdministrationDeliveryExceptions = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationDeliveryExceptionsQuery,
  observation: AdministrationObservation,
): Promise<AdministrationDeliveryExceptionsData> => {
  assertAdmin(actor);
  const filters = { period: "ALL" as const, search: query.search },
    period = resolveAdministrationPeriod(
      filters,
      observation.generatedAt,
      observation.businessTimeZone,
    ),
    base = administrationCohortSql({ query: filters, period }),
    page = parsePaginationQuery(query);
  const [aggregate] = await tx.$queryRaw<
    { failed: bigint; overdue: bigint; dispatched: bigint; all: bigint }[]
  >(
    Prisma.sql`${base} SELECT count(*) FILTER(WHERE status='DELIVERY_FAILED') AS failed,count(*) FILTER(WHERE is_overdue) AS overdue,count(*) FILTER(WHERE status='OUT_FOR_DELIVERY') AS dispatched,count(*) FILTER(WHERE status IN ('DELIVERY_FAILED','OUT_FOR_DELIVERY') OR is_overdue) AS all FROM cohort`,
  );
  if (!aggregate)
    throw new InternalServerError("Delivery oversight count is missing.");
  const counts = {
    failed: safeCount(aggregate.failed),
    overdue: safeCount(aggregate.overdue),
    dispatched: safeCount(aggregate.dispatched),
    all: safeCount(aggregate.all),
  };
  const tab =
    query.tab === "FAILED"
      ? Prisma.sql`status='DELIVERY_FAILED'`
      : query.tab === "OVERDUE"
        ? Prisma.sql`is_overdue`
        : query.tab === "DISPATCHED"
          ? Prisma.sql`status='OUT_FOR_DELIVERY'`
          : Prisma.sql`status IN ('DELIVERY_FAILED','OUT_FOR_DELIVERY') OR is_overdue`;
  const total =
    query.tab === "FAILED"
      ? counts.failed
      : query.tab === "OVERDUE"
        ? counts.overdue
        : query.tab === "DISPATCHED"
          ? counts.dispatched
          : counts.all;
  const rows = await tx.$queryRaw<CohortRow[]>(
      Prisma.sql`${base} SELECT ${summaryColumns} FROM cohort WHERE (${tab}) ORDER BY created_at DESC,id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
    ),
    items = await loadAdministrationItems(tx, actor, rows);
  return administrationDeliveryExceptionsDataSchema.parse({
    items: items.map((item) => {
      if (item.kind !== "submitted")
        throw new InternalServerError("Delivery oversight contains a draft.");
      return item.order;
    }),
    counts,
    pagination: buildPaginationMeta({ ...page, total }),
    context: { query },
  });
};
export const findAdministrationCorrections = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationCorrectionsQuery,
  _observation: AdministrationObservation,
): Promise<AdministrationCorrectionsData> => {
  assertAdmin(actor);
  const page = parsePaginationQuery(query),
    search = query.search === undefined ? null : literalSearch(query.search);
  const base = Prisma.sql`WITH cycles AS(SELECT q.id,q.order_id AS "orderId",h.business_number AS "businessNumber",coalesce(c.customer_name,h.customer_name) AS "customerName",q.piece_id AS "pieceId",s.position,s.model,q.target,q.cycle,q.state,q.reason,q.instructions,command.occurred_at AS "rejectedAt",q.resolved_at AS "resolvedAt"
 FROM quality_correction_cycles q JOIN sales_orders h ON h.id=q.order_id JOIN sales_draft_pieces s ON s.id=q.piece_id JOIN quality_piece_events event ON event.id=q.rejection_event_id JOIN quality_commands command ON command.command_id=event.command_id
 LEFT JOIN LATERAL(SELECT customer_name FROM administration_order_corrections WHERE order_id=q.order_id ORDER BY after_version DESC,command_id DESC LIMIT 1)c ON true
 WHERE ${search === null ? Prisma.sql`true` : Prisma.sql`(h.business_number ILIKE ${search} OR coalesce(c.customer_name,h.customer_name) ILIKE ${search} OR s.model ILIKE ${search} OR q.reason ILIKE ${search} OR q.instructions ILIKE ${search})`})`;
  const [aggregate] = await tx.$queryRaw<
    { active: bigint; resolved: bigint; all: bigint; activePieces: bigint }[]
  >(
    Prisma.sql`${base} SELECT count(*) FILTER(WHERE state='OPEN') AS active,count(*) FILTER(WHERE state<>'OPEN') AS resolved,count(*) AS all,count(DISTINCT "pieceId") FILTER(WHERE state='OPEN') AS "activePieces" FROM cycles`,
  );
  if (!aggregate)
    throw new InternalServerError("Correction oversight count is missing.");
  const counts = {
      active: safeCount(aggregate.active),
      resolved: safeCount(aggregate.resolved),
      all: safeCount(aggregate.all),
      activePieces: safeCount(aggregate.activePieces),
    },
    total =
      query.tab === "ACTIVE"
        ? counts.active
        : query.tab === "RESOLVED"
          ? counts.resolved
          : counts.all;
  const tab =
    query.tab === "ACTIVE"
      ? Prisma.sql`state='OPEN'`
      : query.tab === "RESOLVED"
        ? Prisma.sql`state<>'OPEN'`
        : Prisma.sql`true`;
  type CycleRow = Omit<
    AdministrationCorrectionsData["items"][number],
    "rejectedAt" | "resolvedAt"
  > & { rejectedAt: Date; resolvedAt: Date | null };
  const rows = await tx.$queryRaw<CycleRow[]>(
    Prisma.sql`${base} SELECT * FROM cycles WHERE ${tab} ORDER BY "rejectedAt" DESC,id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  return administrationCorrectionsDataSchema.parse({
    items: rows.map((row) => ({
      ...row,
      rejectedAt: row.rejectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
    counts,
    pagination: buildPaginationMeta({ ...page, total }),
    context: { query },
  });
};

export const findAdministrationOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<AdministrationOrderData> => {
  assertAdmin(actor);
  const root = await tx.salesDraft.findUnique({
    where: { id: orderId },
    select: ADMINISTRATION_ORDER_SELECT,
  });
  if (!root) throw new OrderNotFoundError();
  const history = await findAdministrationOrderActivity(tx, actor, {
    query: { page: 1, limit: 1 },
    orderId,
  });
  if (root.status === "DRAFT") {
    const draft = await tx.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: DRAFT_SELECT,
    });
    return administrationOrderDataSchema.parse({
      kind: "draft",
      draft: mapDraft(draft, await getDraftReadiness(tx)),
      historyCount: history.pagination.total,
      adminActions: { canCancel: false, canCorrect: false, canPrint: false },
      context: { orderId },
    });
  }
  if (!root.order)
    throw new InternalServerError(
      "The submitted administration header is missing.",
    );
  const initial = await tx.salesCommand.findFirst({
    where: {
      draftId: orderId,
      operation: { in: ["SUBMIT_NEW_ORDER", "SUBMIT_DRAFT"] },
    },
    orderBy: [{ afterVersion: "asc" }, { commandId: "asc" }],
    select: { after: true },
  });
  const original = retainedSalesOrderSchema.safeParse(initial?.after);
  if (!original.success || original.data.id !== orderId)
    throw new InternalServerError(
      "The original submission snapshot is missing or inconsistent.",
    );
  const order = mapSalesOrder(root, actor),
    adminActions = mapAdministrationActions(root),
    latest = root.order.administrationCorrections[0];
  return administrationOrderDataSchema.parse({
    kind: "submitted",
    order,
    historyCount: history.pagination.total,
    tracking: mapSalesOrderTracking(order),
    adminActions,
    cancellationCandidates: order.pieces.map((piece) => ({
      pieceId: piece.id,
      position: piece.position,
      model: piece.model,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      eligible:
        adminActions.canCancel &&
        piece.stage !== "CANCELLED" &&
        piece.cancelledAt === null,
      denialReason:
        piece.stage === "CANCELLED"
          ? "CANCELLED"
          : order.status === "OUT_FOR_DELIVERY"
            ? "OUT_FOR_DELIVERY"
            : order.status === "DELIVERED"
              ? "DELIVERED"
              : adminActions.canCancel
                ? null
                : "INVALID_STATE",
    })),
    correction: {
      originalSubmitted: {
        generalNotes: original.data.generalNotes,
        customerName: original.data.customerSnapshot.name,
        customerPhone: original.data.customerSnapshot.phone,
        customerEmail: original.data.customerSnapshot.email,
        customerAddress: original.data.customerSnapshot.address,
      },
      effective: {
        generalNotes: order.generalNotes,
        customerName: order.customerSnapshot.name,
        customerPhone: order.customerSnapshot.phone,
        customerEmail: order.customerSnapshot.email,
        customerAddress: order.customerSnapshot.address,
      },
      lastCorrection: latest
        ? {
            id: latest.commandId,
            reason: latest.command.reason,
            actor: {
              id: latest.command.actorId,
              fullName: latest.command.actorFullName,
              role: latest.command.actorRole,
              department: latest.command.actorDepartment,
            },
            occurredAt: latest.command.occurredAt.toISOString(),
            changedFields: latest.changedFields,
          }
        : null,
    },
    context: { orderId },
  });
};
