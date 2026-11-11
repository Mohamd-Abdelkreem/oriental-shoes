import { manufacturingActivityEventSchema } from "../manufacturing/manufacturing-event.schema.ts";
import { approvalActivityEventSchema } from "../approval/approval-event.schema.ts";
import {
  salesOrderStatusSchema,
  orderPieceStageSchema as pieceStageSchema,
  orderWorkStateSchema as workStateSchema,
  salesBusinessNumberSchema as businessNumberSchema,
} from "./sales-order-values.schema.ts";
import { z } from "zod";
import { pieceCatalogSelectionsSchema } from "../catalogs/catalogs.schema.ts";
import { customerSchema } from "../customers/customers.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import {
  salesCommandActorSchema,
  salesCommandReceiptSchema,
} from "../sales-commands/command-receipt.schema.ts";
import {
  MAX_DRAFT_CAPTURE_BYTES,
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  draftCaptureSchema,
  draftChangeSchema,
  draftPieceCaptureSchema,
  draftPieceSchema,
  draftReplacementSchema,
  draftSchema,
  draftSummarySchema,
} from "../sales-drafts/sales-drafts.schema.ts";

export { salesOrderStatusSchema } from "./sales-order-values.schema.ts";

const requiredCaptureText = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (capture) => capture.trim().length > 0 && !capture.includes("\u0000"),
  );
const submissionPieceSchema = draftPieceCaptureSchema.safeExtend({
  model: requiredCaptureText,
  size: requiredCaptureText,
  leatherBase: requiredCaptureText,
  decoration: requiredCaptureText,
  face: requiredCaptureText,
});
export const submissionCaptureSchema = draftCaptureSchema.safeExtend({
  customerId: salesUuidSchema,
  pieces: z.array(submissionPieceSchema).min(1).max(MAX_DRAFT_PIECES),
});

const unitAmountSchema = z.string().regex(/^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/u);
const totalAmountSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u)
  .pipe(
    z
      .string()
      .refine(
        (amount) => BigInt(amount.replace(".", "")) <= 19_999_999_999_800n,
      ),
  );
const sequenceSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/u)
  .pipe(
    z
      .string()
      .refine((sequence) => BigInt(sequence) <= 9_223_372_036_854_775_807n),
  );
const physicalFields = {
  stage: pieceStageSchema,
  workState: workStateSchema,
  receivedAt: salesInstantSchema.nullable(),
  cancelledAt: salesInstantSchema.nullable(),
  cancellationReason: draftPieceSchema.shape.sideNotes,
};
const countSchema = z.number().int().min(0).max(MAX_DRAFT_PIECES);
const countsSchema = z
  .object({
    original: countSchema,
    cancelled: countSchema,
    active: countSchema,
    received: countSchema,
    completionPercent: z.number().int().min(0).max(100),
  })
  .strict()
  .refine(
    (counts) =>
      counts.original === counts.active + counts.cancelled &&
      counts.received <= counts.active &&
      counts.completionPercent ===
        (counts.active === 0
          ? 0
          : Math.min(100, Math.round((counts.received / counts.active) * 100))),
    "Piece counts and completion must agree",
  );
const moneySchema = z
  .object({
    total: totalAmountSchema,
    paidAmount: unitAmountSchema,
    remainingDue: totalAmountSchema,
    surplus: unitAmountSchema,
  })
  .strict()
  .refine((money) => {
    if (
      ![money.total, money.paidAmount, money.remainingDue, money.surplus].every(
        (amount) => /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u.test(amount),
      )
    )
      return false;
    const totalCents = BigInt(money.total.replace(".", "")),
      paidCents = BigInt(money.paidAmount.replace(".", ""));
    return (
      BigInt(money.remainingDue.replace(".", "")) ===
        (totalCents > paidCents ? totalCents - paidCents : 0n) &&
      BigInt(money.surplus.replace(".", "")) ===
        (paidCents > totalCents ? paidCents - totalCents : 0n)
    );
  }, "Due and surplus must reflect exact total and cumulative paid");
const approvalSchema = z
  .object({
    approvedAt: salesInstantSchema.nullable(),
    returnDecisionId: salesUuidSchema.nullable(),
    returnedAt: salesInstantSchema.nullable(),
    returnReason: nonEmptyBoundedString(4000).nullable(),
    returnRevision: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();
const orderHeaderFields = {
  id: salesUuidSchema,
  version: salesVersionSchema,
  owner: z
    .object({ id: salesUuidSchema, fullName: nonEmptyBoundedString(150) })
    .strict(),
  type: salesOrderTypeSchema,
  status: salesOrderStatusSchema,
  businessNumber: businessNumberSchema,
  businessYear: z.number().int().min(1).max(9999),
  sequence: sequenceSchema,
  customerId: salesUuidSchema,
  customerSnapshot: customerSchema.pick({
    name: true,
    phone: true,
    email: true,
    address: true,
  }),
  createdAt: salesInstantSchema,
  updatedAt: salesInstantSchema,
  submittedAt: salesInstantSchema,
  deliveryDate: draftReplacementSchema.shape.deliveryDate,
  money: moneySchema,
  counts: countsSchema,
  allowedActions: z
    .object({ canResubmit: z.boolean(), canSetPaid: z.boolean() })
    .strict(),
};
const capturedHeaderFields = {
  generalNotes: draftReplacementSchema.shape.generalNotes,
  responsibleSignature: draftReplacementSchema.shape.responsibleSignature,
  repairNote: draftReplacementSchema.shape.repairNote,
  adjustmentRequested: draftReplacementSchema.shape.adjustmentRequested,
  adjustmentReason: draftReplacementSchema.shape.adjustmentReason,
  adjustmentActionTaken: draftReplacementSchema.shape.adjustmentActionTaken,
};
const orderNumberMatches = (order: {
  type: string;
  businessYear: number;
  sequence: string;
  businessNumber: string;
}) =>
  order.businessNumber ===
  `${order.type}-${String(order.businessYear).padStart(4, "0")}-${order.sequence.padStart(4, "0")}`;
export const salesOrderPieceSchema = draftPieceSchema.extend({
  decorationEntryId: salesUuidSchema,
  catalogSourceId: salesUuidSchema,
  unitPrice: unitAmountSchema,
  ...physicalFields,
});
export const salesOrderSchema = z
  .object({
    ...orderHeaderFields,
    ...capturedHeaderFields,
    approval: approvalSchema,
    pieces: z.array(salesOrderPieceSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    orderNumberMatches,
    "Business number must match type, year and sequence",
  )
  .refine(
    (order) =>
      order.status === "RETURNED"
        ? order.approval.returnDecisionId !== null &&
          order.approval.returnedAt !== null &&
          order.approval.returnReason !== null &&
          order.approval.returnRevision === order.version
        : order.approval.returnDecisionId === null &&
          order.approval.returnedAt === null &&
          order.approval.returnReason === null &&
          order.approval.returnRevision === 0,
    "Current return proof must agree with order state and revision",
  )
  .refine(
    (order) =>
      new Set(order.pieces.map((piece) => piece.id)).size ===
      order.pieces.length,
    "Submitted piece identities must be distinct",
  );
export const salesOrderSummarySchema = z
  .object({
    ...orderHeaderFields,
    returnInfo: z
      .object({
        reason: nonEmptyBoundedString(4000),
        returnedAt: salesInstantSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    orderNumberMatches,
    "Business number must match type, year and sequence",
  )
  .refine(
    (order) => (order.status === "RETURNED") === (order.returnInfo !== null),
    "Return summary must agree with current order status",
  );
export const salesOrderDataSchema = z
  .object({ order: salesOrderSchema })
  .strict();

export const factoryOrderPieceSchema = draftPieceSchema
  .omit({ catalogSelections: true })
  .extend(physicalFields);
export const factoryOrderSchema = z
  .object({
    id: salesUuidSchema,
    version: salesVersionSchema,
    type: salesOrderTypeSchema,
    status: salesOrderStatusSchema,
    businessNumber: businessNumberSchema,
    customerName: nonEmptyBoundedString(150),
    deliveryDate: draftReplacementSchema.shape.deliveryDate,
    generalNotes: capturedHeaderFields.generalNotes,
    repairNote: capturedHeaderFields.repairNote,
    adjustmentRequested: capturedHeaderFields.adjustmentRequested,
    adjustmentReason: capturedHeaderFields.adjustmentReason,
    adjustmentActionTaken: capturedHeaderFields.adjustmentActionTaken,
    counts: countsSchema,
    pieces: z.array(factoryOrderPieceSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict();

const searchSchema = z
  .string()
  .trim()
  .max(150)
  .refine((search) => !search.includes("\u0000"))
  .optional()
  .transform((search) => (search === "" ? undefined : search));
const listStatusSchema = z.enum(["DRAFT", ...salesOrderStatusSchema.options]);
export const salesOrderListQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    type: salesOrderTypeSchema.optional(),
    status: listStatusSchema.optional(),
    customerId: salesUuidSchema.optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
const listItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft"), draft: draftSummarySchema }).strict(),
  z
    .object({ kind: z.literal("submitted"), order: salesOrderSummarySchema })
    .strict(),
]);
const totalCountSchema = z.number().int().nonnegative();
export const salesOrderListDataSchema = z
  .object({
    items: z.array(listItemSchema).max(100),
    pagination: paginationMetaSchema,
    totalOrders: totalCountSchema,
    totalPieces: totalCountSchema,
    statusCounts: z.record(listStatusSchema, totalCountSchema),
  })
  .strict();
export const salesDashboardDataSchema = z
  .object({
    counts: z
      .object({
        totalOrders: totalCountSchema,
        totalPieces: totalCountSchema,
        drafts: totalCountSchema,
        draftPieces: totalCountSchema,
        awaitingApproval: totalCountSchema,
        returned: totalCountSchema,
        approved: totalCountSchema,
      })
      .strict(),
    recentOrders: z.array(listItemSchema).max(5),
  })
  .strict();
export const salesOrderEditorDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft"), draft: draftSchema }).strict(),
  z.object({ kind: z.literal("submitted"), order: salesOrderSchema }).strict(),
]);
export const salesOrderTrackingDataSchema = z
  .object({
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    counts: countsSchema,
    pieces: z
      .array(z.object({ pieceId: salesUuidSchema, ...physicalFields }).strict())
      .min(1)
      .max(MAX_DRAFT_PIECES),
  })
  .strict();

const orderOperationSchema = z.enum([
  "SUBMIT_NEW_ORDER",
  "SUBMIT_DRAFT",
  "RESUBMIT_ORDER",
  "SET_ORDER_PAID",
]);
const changedFieldSchema = z.enum([
  "type",
  "customerId",
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
  "pieces",
  "catalogSelections",
  "paidAmount",
  "status",
  "businessNumber",
  "customerSnapshot",
  "prices",
]);
export const orderActivityEventSchema = z
  .object({
    id: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: businessNumberSchema,
    operation: orderOperationSchema,
    pieceIds: z.array(salesUuidSchema).max(MAX_DRAFT_PIECES),
    actor: salesCommandActorSchema,
    occurredAt: salesInstantSchema,
    notes: draftReplacementSchema.shape.generalNotes,
    changedFields: z
      .array(changedFieldSchema)
      .max(changedFieldSchema.options.length),
    paidChange: z
      .object({ before: unitAmountSchema, after: unitAmountSchema })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (event) =>
      new Set(event.pieceIds).size === event.pieceIds.length &&
      new Set(event.changedFields).size === event.changedFields.length &&
      (event.operation === "SET_ORDER_PAID") === (event.paidChange !== null),
    "Activity fields must agree with their operation",
  );
export const salesActivityItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manufacturing"),
      event: manufacturingActivityEventSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("approval"), event: approvalActivityEventSchema })
    .strict(),
  z.object({ kind: z.literal("draft"), change: draftChangeSchema }).strict(),
  z
    .object({ kind: z.literal("order"), event: orderActivityEventSchema })
    .strict(),
]);
export const salesOrderActivityQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const salesOrderActivityDataSchema = z
  .object({
    events: z.array(salesActivityItemSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
const revisionBeforeSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("draft"), draft: draftSchema }).strict(),
    z.object({ kind: z.literal("order"), order: salesOrderSchema }).strict(),
  ])
  .nullable();
export const salesOrderRevisionDataSchema = z
  .object({
    event: orderActivityEventSchema,
    before: revisionBeforeSchema,
    after: salesOrderSchema,
  })
  .strict()
  .refine((revision) => {
    if (
      revision.event.orderId !== revision.after.id ||
      revision.event.orderVersion !== revision.after.version
    )
      return false;
    if (revision.event.operation === "SUBMIT_NEW_ORDER")
      return revision.before === null && revision.after.version === 1;
    if (revision.before === null) return false;
    const beforeSnapshot =
      revision.before.kind === "draft"
        ? revision.before.draft
        : revision.before.order;
    return (
      (revision.event.operation === "SUBMIT_DRAFT"
        ? revision.before.kind === "draft"
        : revision.before.kind === "order") &&
      beforeSnapshot.id === revision.after.id &&
      beforeSnapshot.version + 1 === revision.after.version
    );
  }, "Historical snapshots must match the operation, resource and revisions");

const panelPaginationFields = {
  ...paginationQueryFields,
  limit: paginationQueryFields.limit.pipe(z.number().int().max(25)),
};
export const customerOrdersQuerySchema = z
  .object({
    ...panelPaginationFields,
    type: salesOrderTypeSchema.optional(),
    status: salesOrderStatusSchema.optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const customerOrdersDataSchema = z
  .object({
    orders: z.array(salesOrderSummarySchema).max(25),
    pagination: paginationMetaSchema,
    totalOrders: totalCountSchema,
    totalPieces: totalCountSchema,
  })
  .strict();
export const customerOrderMeasurementsQuerySchema = z
  .object(panelPaginationFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const customerOrderMeasurementsDataSchema = z
  .object({
    measurements: z
      .array(
        z
          .object({
            source: z.literal("SUBMITTED"),
            orderId: salesUuidSchema,
            orderVersion: salesVersionSchema,
            businessNumber: businessNumberSchema,
            pieceId: salesUuidSchema,
            submittedAt: salesInstantSchema,
            model: draftPieceSchema.shape.model,
            size: draftPieceSchema.shape.size,
            aField: draftPieceSchema.shape.aField,
            fField: draftPieceSchema.shape.fField,
            cancelled: z.boolean(),
          })
          .strict(),
      )
      .max(25),
    pagination: paginationMetaSchema,
  })
  .strict();

const correctionPieceSchema = draftPieceSchema
  .omit({
    position: true,
    quantity: true,
    decoration: true,
    catalogSelections: true,
  })
  .extend({
    catalogSelections: pieceCatalogSelectionsSchema
      .omit({ decoration: true })
      .optional(),
  });
export const returnedOrderCorrectionsSchema = z
  .object({
    deliveryDate: draftReplacementSchema.shape.deliveryDate,
    ...capturedHeaderFields,
    pieces: z.array(correctionPieceSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    (corrections) =>
      new Set(corrections.pieces.map((piece) => piece.id)).size ===
        corrections.pieces.length &&
      new TextEncoder().encode(JSON.stringify(corrections)).byteLength <=
        MAX_DRAFT_CAPTURE_BYTES,
    "Correction pieces must be distinct and within the capture limit",
  );
const reviewedQuoteSchema = z
  .object({
    sourceId: salesUuidSchema,
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();
const submitFields = {
  commandId: salesUuidSchema,
  capture: submissionCaptureSchema,
  expectedCustomerVersion: salesVersionSchema,
  reviewedQuote: reviewedQuoteSchema,
};
export const submitOrderBodySchema = z.discriminatedUnion("origin", [
  z.object({ origin: z.literal("new"), ...submitFields }).strict(),
  z
    .object({
      origin: z.literal("draft"),
      ...submitFields,
      draftId: salesUuidSchema,
      expectedVersion: salesVersionSchema,
    })
    .strict(),
]);
export const resubmitOrderBodySchema = z
  .object({
    commandId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    corrections: returnedOrderCorrectionsSchema,
  })
  .strict();
const explicitPaidSchema = z
  .string()
  .regex(/^[0-9]{1,9}(?:\.[0-9]{1,2})?$/u)
  .transform((amount) => {
    const [integer = "0", fraction = ""] = amount.split(".");
    return `${integer.replace(/^0+(?=[0-9])/u, "")}.${fraction.padEnd(2, "0")}`;
  });
export const setOrderPaidBodySchema = z
  .object({
    commandId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    paidAmount: explicitPaidSchema,
  })
  .strict();
export const salesOrderCommandDataSchema = z
  .object({
    kind: z.literal("order"),
    receipt: salesCommandReceiptSchema,
    replayed: z.boolean(),
    savedOrder: salesOrderSchema,
  })
  .strict()
  .refine(
    (command) =>
      orderOperationSchema.safeParse(command.receipt.operation).success &&
      command.receipt.resourceId === command.savedOrder.id &&
      command.receipt.afterVersion === command.savedOrder.version,
    "Order result must match its receipt",
  );
export const salesOrderParamsSchema = z
  .object({ orderId: salesUuidSchema })
  .strict();
export const salesOrderRevisionParamsSchema = z
  .object({ orderId: salesUuidSchema, eventId: salesUuidSchema })
  .strict();

export type SubmissionCapture = z.infer<typeof submissionCaptureSchema>;
export type SalesOrderStatus = z.infer<typeof salesOrderStatusSchema>;
export type SalesOrderPiece = z.infer<typeof salesOrderPieceSchema>;
export type SalesOrderDto = z.infer<typeof salesOrderSchema>;
export type SalesOrderSummary = z.infer<typeof salesOrderSummarySchema>;
export type SalesOrderData = z.infer<typeof salesOrderDataSchema>;
export type FactoryOrderPiece = z.infer<typeof factoryOrderPieceSchema>;
export type FactoryOrderProjection = z.infer<typeof factoryOrderSchema>;
export type SalesOrderListQuery = z.infer<typeof salesOrderListQuerySchema>;
export type SalesOrderListQueryInput = z.input<
  typeof salesOrderListQuerySchema
>;
export type SalesOrderListData = z.infer<typeof salesOrderListDataSchema>;
export type SalesDashboardData = z.infer<typeof salesDashboardDataSchema>;
export type SalesOrderEditorData = z.infer<typeof salesOrderEditorDataSchema>;
export type SalesOrderTrackingData = z.infer<
  typeof salesOrderTrackingDataSchema
>;
export type OrderActivityEvent = z.infer<typeof orderActivityEventSchema>;
export type SalesActivityItem = z.infer<typeof salesActivityItemSchema>;
export type SalesOrderActivityQuery = z.infer<
  typeof salesOrderActivityQuerySchema
>;
export type SalesOrderActivityQueryInput = z.input<
  typeof salesOrderActivityQuerySchema
>;
export type SalesOrderActivityData = z.infer<
  typeof salesOrderActivityDataSchema
>;
export type SalesOrderRevisionData = z.infer<
  typeof salesOrderRevisionDataSchema
>;
export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuerySchema>;
export type CustomerOrdersQueryInput = z.input<
  typeof customerOrdersQuerySchema
>;
export type CustomerOrdersData = z.infer<typeof customerOrdersDataSchema>;
export type CustomerOrderMeasurementsQuery = z.infer<
  typeof customerOrderMeasurementsQuerySchema
>;
export type CustomerOrderMeasurementsQueryInput = z.input<
  typeof customerOrderMeasurementsQuerySchema
>;
export type CustomerOrderMeasurementsData = z.infer<
  typeof customerOrderMeasurementsDataSchema
>;
export type ReturnedOrderCorrections = z.infer<
  typeof returnedOrderCorrectionsSchema
>;
export type SubmitOrderBody = z.infer<typeof submitOrderBodySchema>;
export type ResubmitOrderBody = z.infer<typeof resubmitOrderBodySchema>;
export type SetOrderPaidBody = z.infer<typeof setOrderPaidBodySchema>;
export type SalesOrderCommandData = z.infer<typeof salesOrderCommandDataSchema>;
export type SalesOrderParams = z.infer<typeof salesOrderParamsSchema>;
export type SalesOrderRevisionParams = z.infer<
  typeof salesOrderRevisionParamsSchema
>;
