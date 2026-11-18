import { Prisma } from "@template/database";
import {
  administrationOrderFiltersSchema,
  administrationReportDataSchema,
  administrationReportPrintDataSchema,
  formatDraftReference,
  type AdministrationOrderFilters,
  type AdministrationReportQuery,
  type AdministrationReportData,
  type AdministrationReportPrintQuery,
  type AdministrationReportPrintData,
} from "@template/contracts";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { mapDraftSequence } from "../sales-drafts/sales-drafts.mapper.js";
import { administrationCohortSql } from "./administration.queries.js";
import { resolveAdministrationPeriod } from "./administration.rules.js";
import { ReportScopeTooLargeError } from "./administration.errors.js";
import type { AdministrationObservation } from "./administration.types.js";

const countToNumber = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InternalServerError("A report count exceeds its safe range.");
  return Number(value);
};
const completionPercent = (active: number, received: number) =>
  active === 0
    ? 0
    : received === active
      ? 100
      : Math.min(99, Math.round((received / active) * 100));
const assertReportBytes = (value: unknown): void => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8_388_608)
    throw new ReportScopeTooLargeError();
};
type ReportRow = AdministrationReportPrintData["orders"]["items"][number];
type ReportRootRow = {
  id: string;
  root_kind: "DRAFT" | "SUBMITTED";
  status: ReportRow["status"];
  type: ReportRow["type"];
  business_number: string | null;
  created_at: Date;
  delivery_date: Date | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  owner_id: string;
  owner_name: string;
  original: bigint;
  cancelled: bigint;
  active: bigint;
  received: bigint;
  current_departments: ReportRow["currentDepartments"];
  is_overdue: boolean | null;
  has_quality_history: boolean;
  draft_sequence: bigint | null;
};
const readReportRows = async (
  tx: Prisma.TransactionClient,
  cohort: Prisma.Sql,
  limit: number,
  offset: number,
): Promise<ReportRow[]> => {
  const rows = await tx.$queryRaw<
    ReportRootRow[]
  >(Prisma.sql`${cohort} SELECT r.id,r.root_kind,r.status,r.type,h.business_number,r.created_at,r.delivery_date,reference.number AS draft_sequence,
 CASE WHEN h.id IS NULL THEN customer.name ELSE coalesce(c.customer_name,h.customer_name) END AS customer_name,
 CASE WHEN h.id IS NULL THEN customer.phone ELSE coalesce(c.customer_phone,h.customer_phone) END AS customer_phone,
 CASE WHEN h.id IS NULL THEN customer.address WHEN c.command_id IS NULL THEN h.customer_address ELSE c.customer_address END AS customer_address,
 r.owner_id,coalesce(h.owner_full_name_at_submission,owner.full_name) AS owner_name,
 r.original,r.cancelled,r.active,r.received,r.current_departments,r.is_overdue,r.has_quality_history
 FROM cohort r JOIN sales_drafts d ON d.id=r.id JOIN users owner ON owner.id=r.owner_id LEFT JOIN sales_orders h ON h.id=r.id LEFT JOIN customers customer ON customer.id=d.customer_id
 LEFT JOIN sales_draft_references reference ON reference.draft_id=r.id
 LEFT JOIN LATERAL(SELECT command_id,customer_name,customer_phone,customer_address FROM administration_order_corrections WHERE order_id=r.id ORDER BY after_version DESC,command_id DESC LIMIT 1)c ON true
 ORDER BY r.created_at DESC,r.id DESC LIMIT ${limit} OFFSET ${offset}`);
  return rows.map((row) => {
    const original = countToNumber(row.original),
      cancelled = countToNumber(row.cancelled),
      active = countToNumber(row.active),
      received = countToNumber(row.received);
    return {
      kind: row.root_kind === "DRAFT" ? "draft" : "submitted",
      orderId: row.id,
      businessNumber: row.business_number,
      displayReference:
        row.business_number ??
        formatDraftReference(
          row.id,
          mapDraftSequence(
            row.draft_sequence === null ? null : { number: row.draft_sequence },
          ),
        ),
      type: row.type,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      deliveryDate: serializeNullableDateOnly(row.delivery_date),
      customer: {
        name: row.customer_name,
        phone: row.customer_phone,
        address: row.customer_address,
      },
      salesperson: { id: row.owner_id, fullName: row.owner_name },
      counts: {
        original,
        cancelled,
        active,
        received,
        completionPercent: completionPercent(active, received),
      },
      currentDepartments: (
        ["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"] as const
      ).filter((department) => row.current_departments.includes(department)),
      isOverdue: row.is_overdue === true,
      hasQualityCorrectionHistory: row.has_quality_history,
      isCurrentlyReturned: row.status === "RETURNED",
    };
  });
};
const readAdministrationReportFacts = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  filters: AdministrationOrderFilters,
  observation: AdministrationObservation,
  mode: "SCREEN" | "PRINT",
) => {
  if (actor.role !== "ADMIN") throw new ForbiddenException();
  const period = resolveAdministrationPeriod(
      filters,
      observation.generatedAt,
      observation.businessTimeZone,
    ),
    cohort = administrationCohortSql({ query: filters, period });
  type Aggregate = {
    orders: bigint;
    drafts: bigint;
    submitted: bigint;
    originalPieces: bigint;
    cancelledPieces: bigint;
    activePieces: bigint;
    receivedPieces: bigint;
    readyOrders: bigint;
    deliveredOrders: bigint;
    overdueOrders: bigint;
    failedOrders: bigint;
    correctionHistoryOrders: bigint;
    returnedOrders: bigint;
    distinctOrders: bigint;
    categoryCases: bigint;
  };
  const [aggregate] = await tx.$queryRaw<
    Aggregate[]
  >(Prisma.sql`${cohort} SELECT count(*) AS orders,count(*) FILTER(WHERE root_kind='DRAFT') AS drafts,count(*) FILTER(WHERE root_kind='SUBMITTED') AS submitted,
 coalesce(sum(original),0)::bigint AS "originalPieces",coalesce(sum(cancelled),0)::bigint AS "cancelledPieces",coalesce(sum(active),0)::bigint AS "activePieces",coalesce(sum(received),0)::bigint AS "receivedPieces",
 count(*) FILTER(WHERE status='READY_FOR_DELIVERY' AND active>0 AND active=received AND NOT has_open_quality) AS "readyOrders",count(*) FILTER(WHERE status='DELIVERED') AS "deliveredOrders",
 count(*) FILTER(WHERE is_overdue) AS "overdueOrders",count(*) FILTER(WHERE status='DELIVERY_FAILED') AS "failedOrders",count(*) FILTER(WHERE has_quality_history) AS "correctionHistoryOrders",count(*) FILTER(WHERE status='RETURNED') AS "returnedOrders",
 count(*) FILTER(WHERE is_overdue OR status IN ('DELIVERY_FAILED','RETURNED') OR has_quality_history) AS "distinctOrders",
 (count(*) FILTER(WHERE is_overdue)+count(*) FILTER(WHERE status='DELIVERY_FAILED')+count(*) FILTER(WHERE has_quality_history)+count(*) FILTER(WHERE status='RETURNED')) AS "categoryCases" FROM cohort`);
  if (!aggregate)
    throw new InternalServerError(
      "Report aggregation returned no observation.",
    );
  const scope =
    filters.department === undefined
      ? Prisma.sql`true`
      : Prisma.sql`department=${filters.department}::department`;
  const [staff] = await tx.$queryRaw<{ total: bigint; active: bigint }[]>(
    Prisma.sql`SELECT count(*) AS total,count(*) FILTER(WHERE status='ACTIVE' AND email_verified_at IS NOT NULL AND (role='ADMIN' OR (staff_approved_at IS NOT NULL AND staff_approved_by_id IS NOT NULL AND department IS NOT NULL))) AS active FROM users WHERE ${scope}`,
  );
  if (!staff) throw new InternalServerError("Workforce count is missing.");
  const orders = countToNumber(aggregate.orders),
    totalStaff = countToNumber(staff.total),
    categoryCases = countToNumber(aggregate.categoryCases);
  if (
    totalStaff > 5000 ||
    (mode === "PRINT" && (orders > 5000 || categoryCases > 20000))
  )
    throw new ReportScopeTooLargeError();
  const workforce = await tx.$queryRaw<
    AdministrationReportData["workforce"]["items"]
  >(
    Prisma.sql`SELECT id,full_name AS "fullName",phone,role,department,status FROM users WHERE ${scope} ORDER BY full_name ASC,id ASC LIMIT 5000`,
  );
  if (workforce.length !== totalStaff)
    throw new InternalServerError("The workforce snapshot is incomplete.");
  const departmentRows = await tx.$queryRaw<
    {
      department: AdministrationReportData["departments"][number]["department"];
      pieces: bigint;
    }[]
  >(
    Prisma.sql`${cohort} SELECT CASE WHEN r.status='OUT_FOR_DELIVERY' THEN 'WITH_COURIER' WHEN r.status='DELIVERED' THEN 'DELIVERED' ELSE p.stage::text END AS department,count(*) AS pieces FROM sales_order_pieces p JOIN cohort r ON r.id=p.order_id WHERE p.stage<>'CANCELLED' GROUP BY 1`,
  );
  const departments = (
    [
      "CUTTING",
      "PRODUCTION",
      "QUALITY",
      "WAREHOUSE",
      "AWAITING_APPROVAL",
      "WITH_COURIER",
      "DELIVERED",
    ] as const
  ).map((department) => ({
    department,
    pieces: countToNumber(
      departmentRows.find((row) => row.department === department)?.pieces ?? 0n,
    ),
  }));
  const activePieces = countToNumber(aggregate.activePieces),
    receivedPieces = countToNumber(aggregate.receivedPieces),
    drafts = countToNumber(aggregate.drafts),
    submitted = countToNumber(aggregate.submitted);
  const kind =
    drafts > 0 && submitted > 0
      ? "MIXED"
      : drafts > 0
        ? "DRAFT"
        : submitted > 0
          ? "SUBMITTED"
          : filters.status === "DRAFT"
            ? "DRAFT"
            : filters.status !== undefined
              ? "SUBMITTED"
              : "MIXED";
  return {
    cohort,
    common: {
      meta: {
        generatedAt: observation.generatedAt.toISOString(),
        businessDate: period.businessDate,
        businessTimeZone: period.timeZone,
        generatedBy: { id: actor.id, fullName: actor.fullName },
        filters,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
        cohort: { kind, orderCount: orders },
        complete: true,
      },
      kpis: {
        orders,
        originalPieces: countToNumber(aggregate.originalPieces),
        cancelledPieces: countToNumber(aggregate.cancelledPieces),
        activePieces,
        receivedPieces,
        completionPercent: completionPercent(activePieces, receivedPieces),
        readyOrders: countToNumber(aggregate.readyOrders),
        deliveredOrders: countToNumber(aggregate.deliveredOrders),
        overdueOrders: countToNumber(aggregate.overdueOrders),
      },
      departments,
      exceptions: {
        categoryCases,
        distinctOrders: countToNumber(aggregate.distinctOrders),
        overdueOrders: countToNumber(aggregate.overdueOrders),
        failedOrders: countToNumber(aggregate.failedOrders),
        correctionHistoryOrders: countToNumber(
          aggregate.correctionHistoryOrders,
        ),
        returnedOrders: countToNumber(aggregate.returnedOrders),
      },
      workforce: {
        scope: {
          kind: "CURRENT_DIRECTORY",
          department: filters.department ?? null,
        },
        activeStaff: countToNumber(staff.active),
        totalStaff,
        items: workforce,
      },
      endorsements: { mode: "MANUAL", signatories: [] },
    },
  };
};
export const findAdministrationReport = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationReportQuery,
  observation: AdministrationObservation,
): Promise<AdministrationReportData> => {
  const { page, limit, ...filters } = query,
    canonical = administrationOrderFiltersSchema.parse(filters),
    facts = await readAdministrationReportFacts(
      tx,
      actor,
      canonical,
      observation,
      "SCREEN",
    ),
    pagination = parsePaginationQuery({ page, limit });
  const items = await readReportRows(
      tx,
      facts.cohort,
      pagination.take,
      pagination.skip,
    ),
    output = {
      ...facts.common,
      orders: {
        items,
        pagination: buildPaginationMeta({
          ...pagination,
          total: facts.common.kpis.orders,
        }),
      },
    };
  assertReportBytes(output);
  return administrationReportDataSchema.parse(output);
};
export const findAdministrationPrintReport = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: AdministrationReportPrintQuery,
  observation: AdministrationObservation,
): Promise<AdministrationReportPrintData> => {
  const filters = administrationOrderFiltersSchema.parse(query),
    facts = await readAdministrationReportFacts(
      tx,
      actor,
      filters,
      observation,
      "PRINT",
    ),
    items: ReportRow[] = [];
  for (let offset = 0; offset < facts.common.kpis.orders; offset += 100)
    items.push(...(await readReportRows(tx, facts.cohort, 100, offset)));
  if (items.length !== facts.common.kpis.orders)
    throw new InternalServerError(
      "The complete report order snapshot is incomplete.",
    );
  type ExceptionRow = {
    orderId: string;
    businessNumber: string | null;
    customerName: string | null;
    category: AdministrationReportPrintData["exceptionRows"][number]["category"];
    currentDepartments: ReportRow["currentDepartments"];
    deliveryDate: Date | null;
  };
  const exceptionRows = await tx.$queryRaw<
    ExceptionRow[]
  >(Prisma.sql`${facts.cohort},cases AS(
 SELECT id,created_at,business_number,customer_name,current_departments,delivery_date,'OVERDUE' AS category FROM cohort WHERE is_overdue
 UNION ALL SELECT id,created_at,business_number,customer_name,current_departments,delivery_date,'DELIVERY_FAILED' FROM cohort WHERE status='DELIVERY_FAILED'
 UNION ALL SELECT id,created_at,business_number,customer_name,current_departments,delivery_date,'QUALITY_CORRECTION_HISTORY' FROM cohort WHERE has_quality_history
 UNION ALL SELECT id,created_at,business_number,customer_name,current_departments,delivery_date,'RETURNED_FOR_CORRECTION' FROM cohort WHERE status='RETURNED')
 SELECT id AS "orderId",business_number AS "businessNumber",customer_name AS "customerName",category,current_departments AS "currentDepartments",delivery_date AS "deliveryDate" FROM cases ORDER BY created_at DESC,id DESC,category ASC LIMIT 20000`);
  if (exceptionRows.length !== facts.common.exceptions.categoryCases)
    throw new InternalServerError(
      "The complete report exception snapshot is incomplete.",
    );
  const output = {
    ...facts.common,
    meta: { ...facts.common.meta, complete: true },
    orders: { items, total: items.length },
    exceptionRows: exceptionRows.map((row) => ({
      orderId: row.orderId,
      businessNumber: row.businessNumber,
      customerName: row.customerName,
      category: row.category,
      currentDepartments: (
        ["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"] as const
      ).filter((department) => row.currentDepartments.includes(department)),
      deliveryDate: serializeNullableDateOnly(row.deliveryDate),
    })),
  };
  assertReportBytes(output);
  return administrationReportPrintDataSchema.parse(output);
};
