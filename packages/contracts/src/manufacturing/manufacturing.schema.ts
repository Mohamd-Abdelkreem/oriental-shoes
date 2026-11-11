import { z } from "zod";
import { departmentSchema } from "../account/account.schema.ts";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { factoryOrderPaperDataSchema } from "../approval/approval.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  factoryOrderPieceSchema,
  factoryOrderSchema,
} from "../sales-orders/sales-orders.schema.ts";
import {
  manufacturingCommandOperationSchema,
  manufacturingDepartmentSchema,
  manufacturingViewSchema,
} from "./manufacturing-command.schema.ts";
import { manufacturingActivityEventSchema } from "./manufacturing-event.schema.ts";

const boundedText = nonEmptyBoundedString(4000);
const originSchema = z
  .object({
    kind: z.enum([
      "INITIAL_APPROVAL",
      "APPROVAL_RETURN",
      "DEPARTMENT_TRANSFER",
      "QUALITY_CORRECTION",
      "LEGACY_BASELINE",
    ]),
    sourceDepartment: departmentSchema.nullable(),
    eventId: salesUuidSchema.nullable(),
    issueId: salesUuidSchema.nullable(),
    referenceId: salesUuidSchema.nullable(),
    correctionCycle: salesVersionSchema.nullable(),
    instructions: boundedText.nullable(),
  })
  .strict()
  .refine((origin) => {
    switch (origin.kind) {
      case "INITIAL_APPROVAL":
        return (
          origin.sourceDepartment === "APPROVAL" &&
          origin.eventId !== null &&
          origin.issueId === null &&
          origin.referenceId === null &&
          origin.correctionCycle === null &&
          origin.instructions === null
        );
      case "APPROVAL_RETURN":
        return (
          origin.sourceDepartment === "APPROVAL" &&
          origin.eventId !== null &&
          origin.issueId !== null &&
          origin.referenceId === null &&
          origin.correctionCycle === null
        );
      case "DEPARTMENT_TRANSFER":
        return (
          origin.sourceDepartment === "CUTTING" &&
          origin.eventId !== null &&
          origin.issueId === null &&
          origin.referenceId === null &&
          origin.correctionCycle === null &&
          origin.instructions === null
        );
      case "QUALITY_CORRECTION":
        return (
          origin.sourceDepartment === "QUALITY" &&
          origin.eventId === null &&
          origin.issueId === null &&
          origin.referenceId !== null &&
          origin.correctionCycle !== null &&
          origin.instructions !== null
        );
      case "LEGACY_BASELINE":
        return (
          origin.sourceDepartment === null &&
          origin.eventId === null &&
          origin.issueId === null &&
          origin.referenceId === null &&
          origin.correctionCycle === null &&
          origin.instructions === null
        );
    }
  }, "Visit origin must retain its actual source witness");

export const manufacturingWorkVisitSchema = z
  .object({
    id: salesUuidSchema,
    pieceId: salesUuidSchema,
    department: manufacturingDepartmentSchema,
    sequence: salesVersionSchema,
    origin: originSchema,
    enteredAt: salesInstantSchema.nullable(),
    receivedAt: salesInstantSchema.nullable(),
    startedAt: salesInstantSchema.nullable(),
    endedAt: salesInstantSchema.nullable(),
    receivedBy: approvalActorSchema.nullable(),
    startedBy: approvalActorSchema.nullable(),
    endedBy: approvalActorSchema.nullable(),
    endReason: z
      .enum(["TRANSFERRED", "ISSUE_REPORTED", "CANCELLED"])
      .nullable(),
    destination: z.enum(["PRODUCTION", "QUALITY"]).nullable(),
    legacyUnknownStart: z.boolean(),
  })
  .strict()
  .refine((visit) => {
    const workerMatches = (actor: z.infer<typeof approvalActorSchema> | null) =>
      actor === null ||
      actor.role === "ADMIN" ||
      actor.department === visit.department;
    const times = [
      visit.enteredAt,
      visit.receivedAt,
      visit.startedAt,
      visit.endedAt,
    ]
      .filter((instant) => instant !== null)
      .map((instant) => Date.parse(instant));
    return (
      (visit.receivedAt === null) === (visit.receivedBy === null) &&
      (visit.startedAt === null) === (visit.startedBy === null) &&
      (visit.endedAt === null) === (visit.endedBy === null) &&
      (visit.endedAt === null) === (visit.endReason === null) &&
      (visit.endReason === "TRANSFERRED"
        ? visit.destination ===
          (visit.department === "CUTTING" ? "PRODUCTION" : "QUALITY")
        : visit.destination === null) &&
      workerMatches(visit.receivedBy) &&
      workerMatches(visit.startedBy) &&
      (visit.endReason !== "TRANSFERRED" || workerMatches(visit.endedBy)) &&
      (visit.origin.kind !== "DEPARTMENT_TRANSFER" ||
        visit.department === "PRODUCTION") &&
      (visit.legacyUnknownStart
        ? visit.startedAt === null && visit.receivedAt === null
        : true) &&
      (visit.origin.kind === "LEGACY_BASELINE"
        ? visit.enteredAt === null
        : visit.enteredAt !== null) &&
      times.every(
        (instant, index) =>
          index === 0 || instant >= (times[index - 1] ?? instant),
      )
    );
  }, "Visit actors, times, source and terminal destination must agree");

export const manufacturingPieceContextSchema = z
  .object({
    pieceId: salesUuidSchema,
    visit: manufacturingWorkVisitSchema.nullable(),
    lastAction: z
      .object({
        eventId: salesUuidSchema,
        commandId: salesUuidSchema,
        operation: manufacturingCommandOperationSchema,
        actor: approvalActorSchema,
        occurredAt: salesInstantSchema,
      })
      .strict()
      .nullable(),
    isReturned: z.boolean(),
    allowedActions: z
      .object({
        canReceiveAndStart: z.boolean(),
        canContinue: z.boolean(),
        canCompleteTransfer: z.boolean(),
        canReportIssue: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .refine((work) => {
    if (work.visit !== null && work.visit.pieceId !== work.pieceId)
      return false;
    const actions = work.allowedActions;
    if (work.visit === null && work.lastAction !== null) return false;
    if (work.visit === null || work.visit.endedAt !== null)
      return (
        !actions.canReceiveAndStart &&
        !actions.canContinue &&
        !actions.canCompleteTransfer &&
        !actions.canReportIssue
      );
    return (
      !(
        actions.canReceiveAndStart &&
        (actions.canContinue || actions.canCompleteTransfer)
      ) &&
      (work.lastAction === null ||
        work.lastAction.actor.role === "ADMIN" ||
        work.lastAction.actor.department === work.visit.department)
    );
  }, "Context identities and current action hints must agree");

export const manufacturingOrderHeaderSchema = factoryOrderSchema.pick({
  id: true,
  version: true,
  type: true,
  status: true,
  businessNumber: true,
  customerName: true,
  deliveryDate: true,
  counts: true,
});
export const manufacturingOrderSummarySchema = manufacturingOrderHeaderSchema
  .extend({
    matchingPieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
    matchingPieceCount: z.number().int().min(1).max(MAX_DRAFT_PIECES),
    lastWorkAt: salesInstantSchema.nullable(),
  })
  .refine(
    (summary) =>
      summary.matchingPieceCount === summary.matchingPieceIds.length &&
      new Set(summary.matchingPieceIds).size ===
        summary.matchingPieceIds.length &&
      summary.matchingPieceCount <= summary.counts.original,
    "Summary must count its exact distinct matching pieces",
  );
export const manufacturingDashboardOrderSummarySchema =
  manufacturingOrderSummarySchema.safeExtend({ hasInProgress: z.boolean() });
export const manufacturingPieceRowSchema = z
  .object({
    order: manufacturingOrderHeaderSchema,
    piece: factoryOrderPieceSchema,
    work: manufacturingPieceContextSchema,
  })
  .strict()
  .refine(
    (row) => row.piece.id === row.work.pieceId,
    "Piece and work context must agree",
  );

const searchSchema = z
  .string()
  .trim()
  .max(150)
  .refine((search) => !search.includes("\u0000"))
  .optional()
  .transform((search) => (search === "" ? undefined : search));
const listFields = {
  ...paginationQueryFields,
  view: manufacturingViewSchema,
  search: searchSchema,
  type: salesOrderTypeSchema.optional(),
};
export const manufacturingOrdersQuerySchema = z
  .object({
    ...listFields,
    limit: paginationQueryFields.limit.pipe(z.number().int().max(25)),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const manufacturingPiecesQuerySchema = z
  .object({ ...listFields, orderId: salesUuidSchema.optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
const safeCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const queueCount = z
  .object({ orders: safeCount, pieces: safeCount })
  .strict()
  .refine(
    (counts) =>
      counts.orders <= counts.pieces &&
      (counts.orders === 0) === (counts.pieces === 0),
    "Queue orders and pieces must agree",
  );
export const manufacturingOrdersDataSchema = z
  .object({
    department: manufacturingDepartmentSchema,
    view: manufacturingViewSchema,
    items: z.array(manufacturingOrderSummarySchema).max(25),
    counts: queueCount,
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.total === page.counts.orders &&
      page.pagination.limit <= 25 &&
      page.items.length <= page.pagination.limit &&
      new Set(page.items.map((order) => order.id)).size === page.items.length,
    "Grouped pagination must count distinct matching orders",
  );
export const manufacturingPiecesDataSchema = z
  .object({
    department: manufacturingDepartmentSchema,
    view: manufacturingViewSchema,
    items: z.array(manufacturingPieceRowSchema).max(100),
    counts: queueCount,
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.total === page.counts.pieces &&
      page.pagination.limit <= 100 &&
      page.items.length <= page.pagination.limit &&
      new Set(page.items.map((row) => row.piece.id)).size ===
        page.items.length &&
      page.items.every(
        (row) =>
          row.work.visit === null ||
          row.work.visit.department === page.department,
      ),
    "Flat pagination must count distinct matching department pieces",
  );
export const manufacturingDashboardDataSchema = z
  .object({
    department: manufacturingDepartmentSchema,
    counts: z
      .object({
        incoming: queueCount,
        inProgress: queueCount,
        returned: queueCount,
        completed: queueCount,
        repairs: queueCount,
      })
      .strict(),
    recentOrders: z.array(manufacturingDashboardOrderSummarySchema).max(5),
  })
  .strict()
  .refine(
    (dashboard) =>
      new Set(dashboard.recentOrders.map((order) => order.id)).size ===
        dashboard.recentOrders.length &&
      (dashboard.department !== "CUTTING" ||
        dashboard.counts.repairs.pieces === 0),
    "Dashboard groups must be distinct and repairs apply only to production",
  );
export const manufacturingOrderDataSchema = z
  .object({
    department: manufacturingDepartmentSchema,
    paper: factoryOrderPaperDataSchema,
    work: z.array(manufacturingPieceContextSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(({ department, paper, work }) => {
    const pieces = new Set(paper.order.pieces.map((piece) => piece.id));
    return (
      pieces.size === paper.order.pieces.length &&
      pieces.size === work.length &&
      new Set(work.map((context) => context.pieceId)).size === work.length &&
      work.every(
        (context) =>
          pieces.has(context.pieceId) &&
          (context.visit === null || context.visit.department === department),
      )
    );
  }, "Detail must contain one requested-department context for every exact paper piece");

export const manufacturingIssueActivityEventSchema = z
  .object({
    id: salesUuidSchema,
    commandId: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: factoryOrderSchema.shape.businessNumber,
    pieceId: salesUuidSchema,
    issueId: salesUuidSchema,
    department: manufacturingDepartmentSchema,
    sourceDepartment: z.enum(["CUTTING", "PRODUCTION", "QUALITY"]),
    operation: z.enum(["REPORT_ISSUE", "RESOLVE_ISSUE", "REVIEW_CONTACT"]),
    result: z.enum(["REPORTED", "HELD_FOR_CONTACT", "RELEASED", "CANCELLED"]),
    target: manufacturingDepartmentSchema.nullable(),
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
    reason: boundedText.nullable(),
    notes: boundedText.nullable(),
  })
  .strict()
  .refine((event) => {
    if (
      event.id !== event.commandId ||
      (event.sourceDepartment !== event.department &&
        event.target !== event.department)
    )
      return false;
    if (event.operation === "REPORT_ISSUE")
      return (
        event.result === "REPORTED" &&
        event.target === null &&
        event.reason !== null &&
        (event.actor.role === "ADMIN" ||
          event.actor.department === event.sourceDepartment)
      );
    if (event.actor.role !== "ADMIN" && event.actor.department !== "APPROVAL")
      return false;
    if (event.result === "RELEASED")
      return event.target !== null && event.reason === null;
    if (event.result === "CANCELLED")
      return (
        event.target === null && event.reason !== null && event.notes === null
      );
    return (
      event.result === "HELD_FOR_CONTACT" &&
      event.target === null &&
      event.reason === null &&
      event.notes === null
    );
  }, "Safe issue history must match actual source, decision and permitted text");
export const manufacturingHistoryItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manufacturing"),
      event: manufacturingActivityEventSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("issue"),
      event: manufacturingIssueActivityEventSchema,
    })
    .strict(),
]);
export const manufacturingActivityQuerySchema = z
  .object({ ...paginationQueryFields, actor: z.literal("me").optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const manufacturingOrderHistoryQuerySchema = z
  .object({ ...paginationQueryFields, pieceId: salesUuidSchema.optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const manufacturingActivityDataSchema = z
  .object({
    department: manufacturingDepartmentSchema,
    events: z.array(manufacturingHistoryItemSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 100 &&
      page.events.length <= page.pagination.limit &&
      page.events.every(({ event }) => event.department === page.department) &&
      new Set(page.events.map((item) => item.kind + "/" + item.event.id))
        .size === page.events.length,
    "Activity must contain distinct requested-department events",
  );
export const manufacturingOrderHistoryDataSchema =
  manufacturingActivityDataSchema
    .safeExtend({ orderId: salesUuidSchema })
    .refine(
      (page) =>
        page.events.every(({ event }) => event.orderId === page.orderId),
      "History events must belong to the requested order",
    );

export type ManufacturingWorkVisit = z.infer<
  typeof manufacturingWorkVisitSchema
>;
export type ManufacturingPieceContext = z.infer<
  typeof manufacturingPieceContextSchema
>;
export type ManufacturingOrderHeader = z.infer<
  typeof manufacturingOrderHeaderSchema
>;
export type ManufacturingOrderSummary = z.infer<
  typeof manufacturingOrderSummarySchema
>;
export type ManufacturingDashboardOrderSummary = z.infer<
  typeof manufacturingDashboardOrderSummarySchema
>;
export type ManufacturingPieceRow = z.infer<typeof manufacturingPieceRowSchema>;
export type ManufacturingOrdersQuery = z.infer<
  typeof manufacturingOrdersQuerySchema
>;
export type ManufacturingOrdersQueryInput = z.input<
  typeof manufacturingOrdersQuerySchema
>;
export type ManufacturingPiecesQuery = z.infer<
  typeof manufacturingPiecesQuerySchema
>;
export type ManufacturingPiecesQueryInput = z.input<
  typeof manufacturingPiecesQuerySchema
>;
export type ManufacturingOrdersData = z.infer<
  typeof manufacturingOrdersDataSchema
>;
export type ManufacturingPiecesData = z.infer<
  typeof manufacturingPiecesDataSchema
>;
export type ManufacturingDashboardData = z.infer<
  typeof manufacturingDashboardDataSchema
>;
export type ManufacturingOrderData = z.infer<
  typeof manufacturingOrderDataSchema
>;
export type ManufacturingIssueActivityEvent = z.infer<
  typeof manufacturingIssueActivityEventSchema
>;
export type ManufacturingHistoryItem = z.infer<
  typeof manufacturingHistoryItemSchema
>;
export type ManufacturingActivityQuery = z.infer<
  typeof manufacturingActivityQuerySchema
>;
export type ManufacturingActivityQueryInput = z.input<
  typeof manufacturingActivityQuerySchema
>;
export type ManufacturingOrderHistoryQuery = z.infer<
  typeof manufacturingOrderHistoryQuerySchema
>;
export type ManufacturingOrderHistoryQueryInput = z.input<
  typeof manufacturingOrderHistoryQuerySchema
>;
export type ManufacturingActivityData = z.infer<
  typeof manufacturingActivityDataSchema
>;
export type ManufacturingOrderHistoryData = z.infer<
  typeof manufacturingOrderHistoryDataSchema
>;
