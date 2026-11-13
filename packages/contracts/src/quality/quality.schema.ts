import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { factoryOrderPaperDataSchema } from "../approval/approval.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import { manufacturingOrderHeaderSchema } from "../manufacturing/manufacturing.schema.ts";
import { manufacturingActivityEventSchema } from "../manufacturing/manufacturing-event.schema.ts";
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
  type FactoryOrderPiece,
} from "../sales-orders/sales-orders.schema.ts";
import {
  qualityCommandOperationSchema,
  qualityViewSchema,
} from "./quality-command.schema.ts";
import {
  qualityActivityEventSchema,
  qualityInspectionSummarySchema,
  qualityPackingGroupSchema,
  type QualityPackingGroup,
} from "./quality-event.schema.ts";

const boundedText = nonEmptyBoundedString(4000);
const qualityActor = approvalActorSchema.refine(
  (actor) => actor.role === "ADMIN" || actor.department === "QUALITY",
  "Quality action actor required",
);
export const qualityWorkVisitSchema = z
  .object({
    id: salesUuidSchema,
    pieceId: salesUuidSchema,
    sequence: salesVersionSchema,
    originKind: z.enum(["PRODUCTION_ARRIVAL", "LEGACY_BASELINE"]),
    sourceProductionEventId: salesUuidSchema.nullable(),
    sourceCorrectionId: salesUuidSchema.nullable(),
    enteredAt: salesInstantSchema.nullable(),
    receivedAt: salesInstantSchema.nullable(),
    startedAt: salesInstantSchema.nullable(),
    startedBy: qualityActor.nullable(),
    endedAt: salesInstantSchema.nullable(),
    endReason: z
      .enum(["INSPECT_ACCEPTED", "INSPECT_REJECTED", "ISSUE_REPORTED"])
      .nullable(),
    endedBy: qualityActor.nullable(),
    legacyUnknownStart: z.boolean(),
  })
  .strict()
  .refine((visit) => {
    const instants = [visit.enteredAt, visit.startedAt, visit.endedAt]
      .filter((instant) => instant !== null)
      .map(Date.parse);
    return (
      (visit.originKind === "PRODUCTION_ARRIVAL"
        ? visit.sourceProductionEventId !== null && visit.enteredAt !== null
        : visit.sourceProductionEventId === null && visit.enteredAt === null) &&
      visit.receivedAt === visit.startedAt &&
      (visit.legacyUnknownStart
        ? visit.startedAt === null && visit.startedBy === null
        : visit.startedAt !== null && visit.startedBy !== null) &&
      (visit.endedAt === null) === (visit.endReason === null) &&
      (visit.endedAt === null) === (visit.endedBy === null) &&
      instants.every(
        (instant, index) =>
          index === 0 || instant >= (instants[index - 1] ?? instant),
      )
    );
  }, "Visit source, real or unknown start, chronological times and terminal witness must agree");

export const qualityCorrectionSummarySchema = z
  .object({
    id: salesUuidSchema,
    pieceId: salesUuidSchema,
    cycle: salesVersionSchema,
    target: z.enum(["CUTTING", "PRODUCTION"]),
    reason: boundedText,
    instructions: boundedText,
    rejectedAt: salesInstantSchema,
    inspector: qualityActor,
    phase: z.enum([
      "WAITING_CORRECTION",
      "AWAITING_REINSPECTION",
      "INSPECTING",
    ]),
  })
  .strict();
export const qualityPieceContextSchema = z
  .object({
    pieceId: salesUuidSchema,
    visit: qualityWorkVisitSchema.nullable(),
    lastAction: z
      .object({
        eventId: salesUuidSchema,
        commandId: salesUuidSchema,
        operation: qualityCommandOperationSchema,
        actor: qualityActor,
        occurredAt: salesInstantSchema,
      })
      .strict()
      .nullable(),
    currentCorrection: qualityCorrectionSummarySchema.nullable(),
    latestInspection: qualityInspectionSummarySchema.nullable(),
    allowedActions: z
      .object({
        canReceiveAndStart: z.boolean(),
        canContinue: z.boolean(),
        canInspect: z.boolean(),
        canReportIssue: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .refine((work) => {
    const open = work.visit !== null && work.visit.endedAt === null;
    return (
      (work.visit === null || work.visit.pieceId === work.pieceId) &&
      (work.currentCorrection === null ||
        work.currentCorrection.pieceId === work.pieceId) &&
      (!work.allowedActions.canReceiveAndStart || !open) &&
      (!(work.allowedActions.canInspect || work.allowedActions.canContinue) ||
        open) &&
      !(
        work.allowedActions.canReceiveAndStart &&
        (work.allowedActions.canInspect || work.allowedActions.canContinue)
      ) &&
      (work.currentCorrection?.phase !== "INSPECTING" ||
        (open && work.visit?.sourceCorrectionId === work.currentCorrection.id))
    );
  }, "Context identities, correction phase and action prerequisites must agree");
export const qualityOrderHeaderSchema = manufacturingOrderHeaderSchema;
export const qualityOrderSummarySchema = qualityOrderHeaderSchema
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
    "Summary counts exact distinct members",
  );

const hasEligibleHints = (
  piece: FactoryOrderPiece,
  work: QualityPieceContext,
): boolean => {
  const actions = work.allowedActions;
  if (!(
    actions.canReceiveAndStart ||
    actions.canContinue ||
    actions.canInspect ||
    actions.canReportIssue
  ))
    return true;
  if (
    piece.stage !== "QUALITY" ||
    piece.receivedAt !== null ||
    piece.cancelledAt !== null ||
    piece.cancellationReason !== null
  )
    return false;
  return piece.workState === "INCOMING"
    ? !actions.canContinue && !actions.canInspect
    : piece.workState === "IN_PROGRESS" && !actions.canReceiveAndStart;
};
export const qualityPieceRowSchema = z
  .object({
    order: qualityOrderHeaderSchema,
    piece: factoryOrderPieceSchema,
    work: qualityPieceContextSchema,
  })
  .strict()
  .refine(
    (row) =>
      row.piece.id === row.work.pieceId &&
      hasEligibleHints(row.piece, row.work) &&
      (row.order.status === "APPROVED" ||
        !Object.values(row.work.allowedActions).some(Boolean)),
    "Safe row identity, current state and allowed actions must agree",
  );

const search = z
  .string()
  .trim()
  .max(150)
  .refine((text) => !text.includes("\u0000"))
  .optional()
  .transform((text) => (text === "" ? undefined : text));
const listFields = {
  ...paginationQueryFields,
  view: qualityViewSchema,
  search,
  type: salesOrderTypeSchema.optional(),
};
export const qualityOrdersQuerySchema = z
  .object({
    ...listFields,
    limit: paginationQueryFields.limit.pipe(z.number().int().max(25)),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const qualityPiecesQuerySchema = z
  .object({ ...listFields, orderId: salesUuidSchema.optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const qualityActivityQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const qualityOrderHistoryQuerySchema = z
  .object({ ...paginationQueryFields, pieceId: salesUuidSchema.optional() })
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
const pageContains = (
  pagination: z.infer<typeof paginationMetaSchema>,
  length: number,
): boolean =>
  isSafePaginationWindow(pagination) &&
  length ===
    Math.min(
      pagination.limit,
      Math.max(0, pagination.total - (pagination.page - 1) * pagination.limit),
    );

const hasPackingRegistry = (
  contexts: readonly QualityPieceContext[],
  packingGroups: readonly QualityPackingGroup[],
): boolean => {
  const referenced = new Set(
    contexts.flatMap((context) =>
      context.latestInspection?.packingGroupId
        ? [context.latestInspection.packingGroupId]
        : [],
    ),
  );
  return (
    new Set(packingGroups.map((group) => group.id)).size ===
      packingGroups.length &&
    referenced.size === packingGroups.length &&
    packingGroups.every((group) => referenced.has(group.id)) &&
    contexts.every((context) => {
      const inspection = context.latestInspection;
      if (
        inspection?.packingGroupId === undefined ||
        inspection.packingGroupId === null
      )
        return true;
      const packing = packingGroups.find(
        (group) => group.id === inspection.packingGroupId,
      );
      return (
        packing !== undefined &&
        packing.inspectionId === inspection.inspectionId &&
        packing.acceptedPieceIds.includes(context.pieceId) &&
        packing.inspectorNote === inspection.inspectorNote &&
        packing.packedAt === inspection.inspectedAt &&
        packing.inspector.id === inspection.inspector.id &&
        packing.inspector.fullName === inspection.inspector.fullName &&
        packing.inspector.role === inspection.inspector.role &&
        packing.inspector.department === inspection.inspector.department
      );
    })
  );
};
export const qualityDashboardDataSchema = z
  .object({
    department: z.literal("QUALITY"),
    counts: z
      .object({
        incoming: queueCount,
        inspection: queueCount,
        accepted: queueCount,
        corrections: queueCount,
      })
      .strict(),
    recentOrders: z.array(qualityOrderSummarySchema).max(5),
  })
  .strict()
  .refine(
    (dashboard) =>
      new Set(dashboard.recentOrders.map((order) => order.id)).size ===
      dashboard.recentOrders.length,
    "Recent orders must be distinct",
  );
export const qualityOrdersDataSchema = z
  .object({
    department: z.literal("QUALITY"),
    view: qualityViewSchema,
    items: z.array(qualityOrderSummarySchema).max(25),
    counts: queueCount,
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.total === page.counts.orders &&
      page.pagination.limit <= 25 &&
      pageContains(page.pagination, page.items.length) &&
      new Set(page.items.map((order) => order.id)).size === page.items.length,
    "Grouped page must contain distinct matching orders and consistent pagination",
  );
export const qualityPiecesDataSchema = z
  .object({
    department: z.literal("QUALITY"),
    view: qualityViewSchema,
    items: z.array(qualityPieceRowSchema).max(100),
    packingGroups: z.array(qualityPackingGroupSchema).max(100),
    counts: queueCount,
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.total === page.counts.pieces &&
      page.pagination.limit <= 100 &&
      pageContains(page.pagination, page.items.length) &&
      new Set(page.items.map((row) => row.piece.id)).size ===
        page.items.length &&
      hasPackingRegistry(
        page.items.map((row) => row.work),
        page.packingGroups,
      ),
    "Flat page must bind distinct pieces, counts, page and packing references",
  );
export const qualityOrderDataSchema = z
  .object({
    department: z.literal("QUALITY"),
    paper: factoryOrderPaperDataSchema,
    work: z.array(qualityPieceContextSchema).min(1).max(MAX_DRAFT_PIECES),
    packingGroups: z.array(qualityPackingGroupSchema).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(({ paper, work, packingGroups }) => {
    const ids = new Set(paper.order.pieces.map((piece) => piece.id));
    return (
      ids.size === paper.order.pieces.length &&
      ids.size === work.length &&
      new Set(work.map((context) => context.pieceId)).size === work.length &&
      work.every((context) => {
        const piece = paper.order.pieces.find(
          (candidate) => candidate.id === context.pieceId,
        );
        return (
          piece !== undefined &&
          hasEligibleHints(piece, context) &&
          (paper.order.status === "APPROVED" ||
            !Object.values(context.allowedActions).some(Boolean))
        );
      }) &&
      hasPackingRegistry(work, packingGroups)
    );
  }, "Detail requires exactly one safe current context for every paper piece and bound packing registry");

export const qualityIssueActivityEventSchema = z
  .object({
    id: salesUuidSchema,
    commandId: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: factoryOrderSchema.shape.businessNumber,
    pieceId: salesUuidSchema,
    issueId: salesUuidSchema,
    sourceDepartment: z.enum(["CUTTING", "PRODUCTION", "QUALITY"]),
    operation: z.enum(["REPORT_ISSUE", "RESOLVE_ISSUE", "REVIEW_CONTACT"]),
    result: z.enum(["REPORTED", "HELD_FOR_CONTACT", "RELEASED", "CANCELLED"]),
    target: z.enum(["CUTTING", "PRODUCTION"]).nullable(),
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
    reason: boundedText.nullable(),
    notes: boundedText.nullable(),
    correctionResolution: z
      .object({
        correctionId: salesUuidSchema,
        cycle: salesVersionSchema,
        outcome: z.literal("CANCELLED"),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((event) => {
    if (
      event.id !== event.commandId ||
      (event.correctionResolution !== null && event.result !== "CANCELLED")
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
    if (event.result === "CANCELLED")
      return (
        event.target === null && event.reason !== null && event.notes === null
      );
    if (event.result === "RELEASED")
      return event.target !== null && event.reason === null;
    return (
      event.result === "HELD_FOR_CONTACT" &&
      event.target === null &&
      event.reason === null &&
      event.notes === null
    );
  }, "Safe issue activity must retain actual authority, decision, allowed text and cancellation link");
export const qualityActivityItemSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("quality"), event: qualityActivityEventSchema })
    .strict(),
  z
    .object({
      kind: z.literal("manufacturing"),
      event: manufacturingActivityEventSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("issue"),
      event: qualityIssueActivityEventSchema,
    })
    .strict(),
]);
export const qualityActivityDataSchema = z
  .object({
    department: z.literal("QUALITY"),
    events: z.array(qualityActivityItemSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 100 &&
      pageContains(page.pagination, page.events.length) &&
      new Set(page.events.map((entry) => entry.kind + "/" + entry.event.id))
        .size === page.events.length,
    "Activity must contain distinct original events with consistent pagination",
  );
export const qualityOrderHistoryDataSchema = qualityActivityDataSchema
  .safeExtend({ orderId: salesUuidSchema })
  .refine(
    (page) => page.events.every(({ event }) => event.orderId === page.orderId),
    "History must contain only events of the requested order",
  );

export type QualityWorkVisit = z.infer<typeof qualityWorkVisitSchema>;

export type QualityCorrectionSummary = z.infer<
  typeof qualityCorrectionSummarySchema
>;

export type QualityPieceContext = z.infer<typeof qualityPieceContextSchema>;

export type QualityOrderHeader = z.infer<typeof qualityOrderHeaderSchema>;

export type QualityOrderSummary = z.infer<typeof qualityOrderSummarySchema>;

export type QualityPieceRow = z.infer<typeof qualityPieceRowSchema>;

export type QualityOrdersQuery = z.infer<typeof qualityOrdersQuerySchema>;
export type QualityOrdersQueryInput = z.input<typeof qualityOrdersQuerySchema>;

export type QualityPiecesQuery = z.infer<typeof qualityPiecesQuerySchema>;
export type QualityPiecesQueryInput = z.input<typeof qualityPiecesQuerySchema>;

export type QualityActivityQuery = z.infer<typeof qualityActivityQuerySchema>;
export type QualityActivityQueryInput = z.input<
  typeof qualityActivityQuerySchema
>;

export type QualityOrderHistoryQuery = z.infer<
  typeof qualityOrderHistoryQuerySchema
>;
export type QualityOrderHistoryQueryInput = z.input<
  typeof qualityOrderHistoryQuerySchema
>;

export type QualityDashboardData = z.infer<typeof qualityDashboardDataSchema>;

export type QualityOrdersData = z.infer<typeof qualityOrdersDataSchema>;

export type QualityPiecesData = z.infer<typeof qualityPiecesDataSchema>;

export type QualityOrderData = z.infer<typeof qualityOrderDataSchema>;

export type QualityIssueActivityEvent = z.infer<
  typeof qualityIssueActivityEventSchema
>;

export type QualityActivityItem = z.infer<typeof qualityActivityItemSchema>;

export type QualityActivityData = z.infer<typeof qualityActivityDataSchema>;

export type QualityOrderHistoryData = z.infer<
  typeof qualityOrderHistoryDataSchema
>;
