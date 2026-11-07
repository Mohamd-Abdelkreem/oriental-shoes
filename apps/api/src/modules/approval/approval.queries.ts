import type { ApprovalEventData } from "@template/contracts";
import {
  officialOrderPaperDataSchema,
  factoryOrderPaperDataSchema,
  type OfficialOrderPaperData,
  type FactoryOrderPaperData,
  type ApprovalIssueState,
  approvalOrderDataSchema,
  approvalIssuesDataSchema,
  salesContactDataSchema,
  approvalInstructionSchema,
  approvalDecisionStampSchema,
  type ApprovalDecisionStamp,
  type ManufacturingIssueDto,
  type ApprovalOrderData,
  type ApprovalIssuesQuery,
  type SalesContactQuery,
  type ApprovalIssuesData,
  approvalOrdersDataSchema,
  approvalDashboardDataSchema,
  approvalHistoryDataSchema,
  approvalActivityEventSchema,
  normalizeSaudiCustomerPhone,
  salesUuidSchema,
  type ApprovalOrdersQuery,
  type ApprovalOrdersData,
  type ApprovalDashboardData,
  type ApprovalHistoryQuery,
  type ApprovalHistoryData,
} from "@template/contracts";
import {
  OrderPrintNotApprovedError,
  OrderPrintReturnedError,
  OrderPrintReapprovalPendingError,
  ApprovalEventNotFoundError,
} from "./approval.errors.js";
import {
  mapFactoryOrder,
  mapSalesOrder,
  mapSalesOrderSummary,
  SALES_ORDER_SELECT,
} from "../sales-orders/sales-orders.mapper.js";
import type { OrderActivityScope } from "../sales-orders/order-activity.queries.js";
import { DepartmentAccessDeniedError } from "../auth/auth.errors.js";
import {
  mapApprovalEventData,
  CURRENT_ISSUE_SELECT,
  mapCurrentIssue,
} from "./approval.mapper.js";
import { approvalSummarySql } from "../sales-orders/order-activity.queries.js";
import {
  getApprovalIssueActions,
  getApprovalPrintEligibility,
} from "./approval.rules.js";
import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { Department, Prisma } from "@template/database";
import {
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  OrderNotFoundError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { ApprovalOrderRecord } from "./approval.types.js";

export const lockApprovalOrder = async (
  tx: Prisma.TransactionClient,
  input: {
    actor: AuthorityAccount;
    orderId: string;
    expectedVersion: number;
    scope: "APPROVAL" | "OWNER" | "FACTORY";
  },
): Promise<ApprovalOrderRecord> => {
  assertBusinessAuthority(
    input.actor,
    input.scope === "OWNER"
      ? Department.SALES
      : input.scope === "APPROVAL"
        ? Department.APPROVAL
        : undefined,
  );
  const locked =
    input.scope === "OWNER"
      ? await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM sales_drafts WHERE id=${input.orderId}::uuid AND owner_id=${input.actor.id}::uuid AND status='SUBMITTED' FOR UPDATE`
      : await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM sales_drafts WHERE id=${input.orderId}::uuid AND status='SUBMITTED' FOR UPDATE`;
  if (locked.length !== 1) throw new OrderNotFoundError();
  const root = await tx.salesDraft.findUnique({
    where: { id: input.orderId },
    select: SALES_ORDER_SELECT,
  });
  if (root === null || root.order === null)
    throw new InternalServerError(
      "A submitted order has an invalid persisted root.",
    );
  if (root.version !== input.expectedVersion || root.version === 2147483647)
    throw new OrderVersionConflictError();
  return root;
};

const approvalPendingWhere = (
  query: ApprovalOrdersQuery,
): Prisma.SalesDraftWhereInput => {
  const where: Prisma.SalesDraftWhereInput = {
    status: "SUBMITTED",
    order: { status: "AWAITING_APPROVAL" },
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  if (query.search !== undefined) {
    const escaped = query.search.replace(
        /[\\%_]/gu,
        (character) => `\\${character}`,
      ),
      uuid = salesUuidSchema.safeParse(query.search),
      phone = normalizeSaudiCustomerPhone(query.search) ?? query.search;
    where.OR = [
      ...(uuid.success ? [{ id: uuid.data }] : []),
      { order: { businessNumber: { contains: escaped, mode: "insensitive" } } },
      { order: { customerName: { contains: escaped, mode: "insensitive" } } },
      {
        order: {
          customerPhone: {
            contains: phone.replace(
              /[\\%_]/gu,
              (character) => `\\${character}`,
            ),
          },
        },
      },
      {
        pieces: {
          some: {
            removedAt: null,
            model: { contains: escaped, mode: "insensitive" },
          },
        },
      },
    ];
  }
  return where;
};
export const findApprovalPending = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: ApprovalOrdersQuery,
): Promise<ApprovalOrdersData> => {
  const page = parsePaginationQuery(query),
    where = approvalPendingWhere(query);
  const total = await tx.salesDraft.count({ where });
  const rows = await tx.salesDraft.findMany({
    where,
    select: SALES_ORDER_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
  });
  const parsed = approvalOrdersDataSchema.safeParse({
    items: rows.map((row) => mapSalesOrderSummary(row, actor)),
    pagination: buildPaginationMeta({ ...page, total }),
  });
  if (!parsed.success)
    throw new InternalServerError("Approval pending projection is invalid.");
  return parsed.data;
};
export const findApprovalDashboard = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  now: Date,
  zone: string,
): Promise<ApprovalDashboardData> => {
  const pending = await findApprovalPending(tx, actor, {
    page: 1,
    limit: 5,
    search: undefined,
  });
  const states = await tx.manufacturingIssue.groupBy({
    by: ["state"],
    where: { state: { not: "RESOLVED" } },
    _count: { _all: true },
  });
  const count = (state: "APPROVAL_REVIEW" | "SALES_CONTACT" | "REAPPROVAL") =>
    states.find((group) => group.state === state)?._count._all ?? 0;
  const returnedOrders = await tx.salesOrder.count({
    where: { status: "RETURNED" },
  });
  const [today] = await tx.$queryRaw<
    Array<{ total: number }>
  >`SELECT count(*)::int AS total FROM approval_commands WHERE operation='APPROVE_INITIAL'
 AND occurred_at >= date_trunc('day',${now}::timestamptz AT TIME ZONE ${zone}) AT TIME ZONE ${zone}
 AND occurred_at < (date_trunc('day',${now}::timestamptz AT TIME ZONE ${zone})+interval '1 day') AT TIME ZONE ${zone}`;
  if (today === undefined)
    throw new InternalServerError("Approval calendar count is unavailable.");
  const approvalIssues = count("APPROVAL_REVIEW"),
    salesContactPieces = count("SALES_CONTACT"),
    reapprovalPieces = count("REAPPROVAL");
  const parsed = approvalDashboardDataSchema.safeParse({
    counts: {
      initialOrders: pending.pagination.total,
      approvalIssues,
      salesContactPieces,
      reapprovalPieces,
      unresolvedIssues: approvalIssues + salesContactPieces + reapprovalPieces,
      approvedToday: today.total,
      returnedOrders,
    },
    recentOrders: pending.items,
  });
  if (!parsed.success)
    throw new InternalServerError("Approval dashboard projection is invalid.");
  return parsed.data;
};
export const findOwnApprovalHistory = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: ApprovalHistoryQuery,
): Promise<ApprovalHistoryData> => {
  const page = parsePaginationQuery(query);
  const predicate = Prisma.sql`c.actor_id=${actor.id}::uuid AND c.operation IN ('APPROVE_INITIAL','RETURN_INITIAL','RESOLVE_ISSUE','REVIEW_CONTACT')`;
  const [count] = await tx.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`SELECT count(*)::int AS total FROM approval_commands c WHERE ${predicate}`,
  );
  if (count === undefined)
    throw new InternalServerError("Approval history count is unavailable.");
  const rows = await tx.$queryRaw<Array<{ event: unknown }>>(
    Prisma.sql`SELECT ${approvalSummarySql} AS event FROM approval_commands c JOIN sales_orders h ON h.id=c.order_id WHERE ${predicate} ORDER BY c.occurred_at DESC,c.command_id DESC LIMIT ${page.take} OFFSET ${page.skip}`,
  );
  const events = rows.map((row) => {
    const parsed = approvalActivityEventSchema.safeParse(row.event);
    if (!parsed.success)
      throw new InternalServerError("Approval history event is invalid.");
    return parsed.data;
  });
  const parsed = approvalHistoryDataSchema.safeParse({
    events,
    pagination: buildPaginationMeta({ ...page, total: count.total }),
  });
  if (!parsed.success)
    throw new InternalServerError("Approval history projection is invalid.");
  return parsed.data;
};

const issueSummarySelect = {
  id: true,
  orderId: true,
  pieceId: true,
  state: true,
  sourceDepartment: true,
  reportedAt: true,
  reason: true,
  notes: true,
  resumeTarget: true,
  latestProposalId: true,
} satisfies Prisma.ManufacturingIssueSelect;
export const APPROVAL_STAMP_SELECT = {
  commandId: true,
  afterVersion: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  occurredAt: true,
} satisfies Prisma.ApprovalCommandSelect;
type StampRecord = Prisma.ApprovalCommandGetPayload<{
  select: typeof APPROVAL_STAMP_SELECT;
}>;
export const mapApprovalStamp = (
  record: StampRecord,
): ApprovalDecisionStamp => {
  const parsed = approvalDecisionStampSchema.safeParse({
    decisionId: record.commandId,
    orderVersion: record.afterVersion,
    actor: {
      id: record.actorId,
      fullName: record.actorFullName,
      role: record.actorRole,
      department: record.actorDepartment,
    },
    approvedAt: record.occurredAt.toISOString(),
  });
  if (!parsed.success)
    throw new InternalServerError("An approval stamp is inconsistent.");
  return parsed.data;
};
export const findIssueInstructions = async (
  tx: Prisma.TransactionClient,
  issueIds: readonly string[],
  kind: "CONTACT" | "FACTORY",
) => {
  const result = new Map<
    string,
    NonNullable<ManufacturingIssueDto["instructions"]>
  >();
  if (issueIds.length === 0) return result;
  const decisions =
    kind === "CONTACT"
      ? Prisma.sql`((operation='RESOLVE_ISSUE' AND decision='SEND_TO_SALES') OR (operation='REVIEW_CONTACT' AND decision='RETURN_TO_SALES'))`
      : Prisma.sql`((operation='RESOLVE_ISSUE' AND decision='RETURN_TO_DEPARTMENT') OR (operation='REVIEW_CONTACT' AND decision='ACCEPT'))`;
  const rows = await tx.$queryRaw<
    Array<{
      issueId: string;
      commandId: string;
      actorId: string;
      actorFullName: string;
      actorRole: string;
      actorDepartment: string | null;
      occurredAt: Date;
      text: string | null;
    }>
  >(
    Prisma.sql`SELECT DISTINCT ON (issue_id) issue_id AS "issueId",command_id AS "commandId",actor_id AS "actorId",actor_full_name AS "actorFullName",actor_role AS "actorRole",actor_department AS "actorDepartment",occurred_at AS "occurredAt",decision_notes AS text FROM approval_commands WHERE issue_id IN (${Prisma.join(issueIds.map((id) => Prisma.sql`${id}::uuid`))}) AND ${decisions} ORDER BY issue_id,after_version DESC,command_id DESC`,
  );
  for (const row of rows) {
    const parsed = approvalInstructionSchema.safeParse({
      commandId: row.commandId,
      actor: {
        id: row.actorId,
        fullName: row.actorFullName,
        role: row.actorRole,
        department: row.actorDepartment,
      },
      occurredAt: row.occurredAt.toISOString(),
      text: row.text,
    });
    if (!parsed.success)
      throw new InternalServerError("Issue instructions are inconsistent.");
    result.set(row.issueId, parsed.data);
  }
  return result;
};
export const findApprovalOrder = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
  scope: "APPROVAL" | "CONTACT",
): Promise<ApprovalOrderData> => {
  const root = await tx.salesDraft.findFirst({
    where: {
      id: orderId,
      status: "SUBMITTED",
      ...(scope === "CONTACT" && actor.role !== "ADMIN"
        ? { ownerId: actor.id }
        : {}),
    },
    select: SALES_ORDER_SELECT,
  });
  if (root === null || root.order === null) throw new OrderNotFoundError();
  const order = mapSalesOrder(root, actor);
  const issues = await tx.manufacturingIssue.findMany({
    where: { orderId, state: { not: "RESOLVED" } },
    select: CURRENT_ISSUE_SELECT,
    orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
    take: 201,
  });
  if (issues.length > 200)
    throw new InternalServerError("An order has too many open issues.");
  const instructions = await findIssueInstructions(
    tx,
    issues.map((issue) => issue.id),
    "CONTACT",
  );
  const initial = await tx.approvalCommand.findFirst({
    where: { orderId, operation: "APPROVE_INITIAL" },
    select: APPROVAL_STAMP_SELECT,
  });
  const initialApproval = initial === null ? null : mapApprovalStamp(initial);
  let currentReturn: ApprovalOrderData["workflow"]["currentReturn"] = null;
  if (root.order.currentReturnDecisionId !== null) {
    const rows = await tx.$queryRaw<
      Array<{ notes: string | null }>
    >`SELECT after_facts#>>'{currentReturn,notes}' AS notes FROM approval_commands WHERE command_id=${root.order.currentReturnDecisionId}::uuid AND order_id=${orderId}::uuid AND operation='RETURN_INITIAL'`;
    // Preserved P03 controlled proofs may predate the P04 command ledger.
    // Their trusted header proof remains readable; absent historical notes stay null.
    currentReturn = {
      decisionId: root.order.currentReturnDecisionId,
      reason: root.order.currentReturnReason ?? "",
      notes: rows[0]?.notes ?? null,
      returnedAt: root.order.currentReturnedAt?.toISOString() ?? "",
    };
  }
  const approver = actor.role === "ADMIN" || actor.department === "APPROVAL",
    canDecide =
      approver && root.order.status === "AWAITING_APPROVAL" && initial === null;
  const parsed = approvalOrderDataSchema.safeParse({
    order,
    workflow: {
      initialApproval,
      currentReturn,
      allowedActions: {
        canApproveInitial: canDecide,
        canReturnInitial: canDecide,
      },
      printEligibility: getApprovalPrintEligibility(
        root,
        initialApproval,
        issues,
      ),
      issues: issues.map((issue) =>
        mapCurrentIssue(
          issue,
          instructions.get(issue.id) ?? null,
          getApprovalIssueActions(
            actor,
            root.ownerId,
            issue,
            root.pieces.find((piece) => piece.id === issue.pieceId)?.orderPiece
              ?.issueId ?? null,
          ),
        ),
      ),
    },
  });
  if (!parsed.success)
    throw new InternalServerError("The approval workflow is inconsistent.");
  return parsed.data;
};
export const findApprovalIssues = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  query: ApprovalIssuesQuery | SalesContactQuery,
  scope: "APPROVAL" | "CONTACT",
): Promise<ApprovalIssuesData> => {
  const contacts = scope === "CONTACT";
  const rootWhere = approvalPendingWhere(query);
  delete rootWhere.order;
  if (contacts && actor.role !== "ADMIN") rootWhere.ownerId = actor.id;
  const states: Prisma.ManufacturingIssueWhereInput =
    query.state === undefined
      ? {
          state: {
            in: contacts
              ? ["SALES_CONTACT", "REAPPROVAL"]
              : ["APPROVAL_REVIEW", "SALES_CONTACT", "REAPPROVAL"],
          },
        }
      : { state: query.state };
  const where: Prisma.ManufacturingIssueWhereInput = {
    ...states,
    order: { draft: rootWhere },
  };
  const page = parsePaginationQuery(query),
    total = await tx.manufacturingIssue.count({ where });
  const rows = await tx.manufacturingIssue.findMany({
    where,
    select: issueSummarySelect,
    orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
    skip: page.skip,
    take: page.take,
  });
  const roots = await tx.salesDraft.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.orderId))] } },
    select: SALES_ORDER_SELECT,
  });
  const byId = new Map(roots.map((root) => [root.id, root]));
  const instructions = await findIssueInstructions(
    tx,
    rows.map((row) => row.id),
    "CONTACT",
  );
  const items = rows.map((issue) => {
    const root = byId.get(issue.orderId);
    if (root === undefined)
      throw new InternalServerError("An issue queue has no order.");
    const order = mapSalesOrder(root, actor),
      piece = order.pieces.find((row) => row.id === issue.pieceId),
      physical = root.pieces.find(
        (row) => row.id === issue.pieceId,
      )?.orderPiece;
    if (piece === undefined || physical == null)
      throw new InternalServerError("An issue queue has no piece.");
    return {
      order: mapSalesOrderSummary(root, actor),
      piece: {
        id: piece.id,
        position: piece.position,
        model: piece.model,
        size: piece.size,
        leatherBase: piece.leatherBase,
        sole: piece.sole,
        stage: piece.stage,
        workState: piece.workState,
      },
      issue: {
        id: issue.id,
        pieceId: issue.pieceId,
        state: issue.state,
        sourceDepartment: issue.sourceDepartment,
        reportedAt: issue.reportedAt.toISOString(),
        reason: issue.reason,
        notes: issue.notes,
        resumeTarget: issue.resumeTarget,
        currentProposalId: issue.latestProposalId,
        instructions: instructions.get(issue.id) ?? null,
        allowedActions: getApprovalIssueActions(
          actor,
          root.ownerId,
          issue,
          physical.issueId,
        ),
      },
    };
  });
  const parsed = (
    contacts ? salesContactDataSchema : approvalIssuesDataSchema
  ).safeParse({ items, pagination: buildPaginationMeta({ ...page, total }) });
  if (!parsed.success)
    throw new InternalServerError("The issue queue is inconsistent.");
  return parsed.data;
};

export const authorizeOrderHistory = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<OrderActivityScope> => {
  if (
    actor.role !== "ADMIN" &&
    actor.department !== "SALES" &&
    actor.department !== "APPROVAL"
  )
    throw new DepartmentAccessDeniedError();
  const scope: OrderActivityScope =
    actor.role === "ADMIN" || actor.department === "APPROVAL"
      ? { kind: "APPROVAL" }
      : { kind: "OWNER", ownerId: actor.id };
  const root = await tx.salesDraft.findFirst({
    where: {
      id: orderId,
      status: "SUBMITTED",
      ...(scope.kind === "OWNER" ? { ownerId: scope.ownerId } : {}),
    },
    select: { id: true },
  });
  if (root === null) throw new OrderNotFoundError();
  return scope;
};
export const findApprovalEvent = async (
  tx: Prisma.TransactionClient,
  input: { actor: AuthorityAccount; orderId: string; eventId: string },
): Promise<ApprovalEventData> => {
  await authorizeOrderHistory(tx, input.actor, input.orderId);
  const rows = await tx.$queryRaw<
    Array<{ event: unknown; beforeFacts: unknown; afterFacts: unknown }>
  >(
    Prisma.sql`SELECT ${approvalSummarySql} AS event,c.before_facts AS "beforeFacts",c.after_facts AS "afterFacts" FROM approval_commands c JOIN sales_orders h ON h.id=c.order_id WHERE c.order_id=${input.orderId}::uuid AND c.command_id=${input.eventId}::uuid LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) throw new ApprovalEventNotFoundError();
  return mapApprovalEventData(row);
};

export const findOfficialPaper = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<OfficialOrderPaperData> => {
  const scope = await authorizeOrderHistory(tx, actor, orderId);
  const current = await findApprovalOrder(
    tx,
    actor,
    orderId,
    scope.kind === "OWNER" ? "CONTACT" : "APPROVAL",
  );
  switch (current.workflow.printEligibility.reason) {
    case "RETURNED":
      throw new OrderPrintReturnedError();
    case "NOT_APPROVED":
      throw new OrderPrintNotApprovedError();
    case "PENDING_REAPPROVAL":
      throw new OrderPrintReapprovalPendingError();
    case null:
      break;
  }
  const initial = current.workflow.initialApproval;
  if (initial === null) throw new OrderPrintNotApprovedError();
  const ids = current.order.pieces
    .filter((piece) => piece.stage !== "CANCELLED")
    .map((piece) => piece.id);
  const rows =
    ids.length === 0
      ? []
      : await tx.$queryRaw<
          Array<StampRecord & { pieceId: string; proposalId: string }>
        >(
          Prisma.sql`SELECT DISTINCT ON (piece_id) piece_id AS "pieceId",proposal_id AS "proposalId",command_id AS "commandId",after_version AS "afterVersion",actor_id AS "actorId",actor_full_name AS "actorFullName",actor_role AS "actorRole",actor_department AS "actorDepartment",occurred_at AS "occurredAt" FROM approval_commands WHERE order_id=${orderId}::uuid AND operation='REVIEW_CONTACT' AND decision='ACCEPT' AND after_facts#>'{proposal,before}' IS DISTINCT FROM after_facts#>'{proposal,proposed}' AND piece_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY piece_id,after_version DESC,command_id DESC`,
        );
  const parsed = officialOrderPaperDataSchema.safeParse({
    order: current.order,
    approval: {
      initial,
      pieces: rows.map((row) => ({
        ...mapApprovalStamp(row),
        pieceId: row.pieceId,
        proposalId: row.proposalId,
      })),
    },
    printVersion: current.order.version,
  });
  if (!parsed.success)
    throw new InternalServerError("Official order paper is inconsistent.");
  return parsed.data;
};
export const findFactoryPaper = async (
  tx: Prisma.TransactionClient,
  actor: AuthorityAccount,
  orderId: string,
): Promise<FactoryOrderPaperData> => {
  if (
    actor.role !== "ADMIN" &&
    actor.department !== "CUTTING" &&
    actor.department !== "PRODUCTION" &&
    actor.department !== "QUALITY"
  )
    throw new DepartmentAccessDeniedError();
  const root = await tx.salesDraft.findFirst({
    where: { id: orderId, status: "SUBMITTED" },
    select: SALES_ORDER_SELECT,
  });
  if (root === null) throw new OrderNotFoundError();
  const contexts = await tx.$queryRaw<
    Array<{
      pieceId: string;
      id: string;
      state: ApprovalIssueState;
      sourceDepartment: string;
      reason: string;
      notes: string | null;
      resumeTarget: "CUTTING" | "PRODUCTION" | null;
    }>
  >`SELECT DISTINCT ON (piece_id) piece_id AS "pieceId",id,state,source_department AS "sourceDepartment",reason,notes,resume_target AS "resumeTarget" FROM manufacturing_issues WHERE order_id=${orderId}::uuid ORDER BY piece_id,(state<>'RESOLVED') DESC,cycle DESC,id DESC LIMIT 201`;
  if (contexts.length > 200)
    throw new InternalServerError(
      "An order has too many factory issue contexts.",
    );
  const related =
    actor.role === "ADMIN" ||
    root.pieces.some((piece) => piece.orderPiece?.stage === actor.department) ||
    contexts.some(
      (issue) =>
        issue.state !== "RESOLVED" &&
        issue.sourceDepartment === actor.department,
    );
  if (!related) throw new OrderNotFoundError();
  const instructions = await findIssueInstructions(
    tx,
    contexts.map((issue) => issue.id),
    "FACTORY",
  );
  const parsed = factoryOrderPaperDataSchema.safeParse({
    order: mapFactoryOrder(root),
    issues: contexts.map((issue) => ({
      pieceId: issue.pieceId,
      issueId: issue.id,
      state: issue.state,
      reason: issue.reason,
      reportNotes: issue.notes,
      approvedInstructions: instructions.get(issue.id)?.text ?? null,
      target: issue.resumeTarget,
    })),
  });
  if (!parsed.success)
    throw new InternalServerError("Factory order paper is inconsistent.");
  return parsed.data;
};
