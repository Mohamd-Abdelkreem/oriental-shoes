import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { factoryOrderPaperDataSchema } from "../approval/approval.schema.ts";
import { customerSchema } from "../customers/customers.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import { manufacturingActivityEventSchema } from "../manufacturing/manufacturing-event.schema.ts";
import {
  qualityActivityEventSchema,
  qualityPackingGroupSchema,
} from "../quality/quality-event.schema.ts";
import { qualityIssueActivityEventSchema } from "../quality/quality.schema.ts";
import { draftReplacementSchema } from "../sales-drafts/sales-drafts.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  currentOrderCountsSchema,
  factoryOrderPieceSchema,
} from "../sales-orders/sales-orders.schema.ts";
import {
  salesBusinessNumberSchema,
  salesOrderStatusSchema,
} from "../sales-orders/sales-order-values.schema.ts";
import {
  warehouseActivityEventSchema,
  warehouseAttemptSchema,
  warehouseReceiptGroupSchema,
} from "./warehouse-event.schema.ts";

export const warehouseViewSchema = z.enum([
  "INCOMING",
  "INCOMPLETE",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "DELIVERED",
]);
const search = z
  .string()
  .trim()
  .max(150)
  .refine((text) => !text.includes("\u0000"))
  .optional()
  .transform((text) => (text === "" ? undefined : text));
const filterFields = { search, type: salesOrderTypeSchema.optional() };
export const warehouseDashboardQuerySchema = z.object(filterFields).strict();
const listFields = {
  ...paginationQueryFields,
  ...filterFields,
  view: warehouseViewSchema,
};
export const warehouseOrdersQuerySchema = z
  .object({
    ...listFields,
    limit: paginationQueryFields.limit.pipe(z.number().int().max(25)),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const warehousePiecesQuerySchema = z
  .object({ ...listFields, orderId: salesUuidSchema.optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const warehouseActivityQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const warehouseOrderHistoryQuerySchema = z
  .object({ ...paginationQueryFields, pieceId: salesUuidSchema.optional() })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const warehouseAllowedActionsSchema = z
  .object({
    canDispatch: z.boolean(),
    canConfirmDelivery: z.boolean(),
    canFailDelivery: z.boolean(),
    canRetryDelivery: z.boolean(),
  })
  .strict();
export const warehouseOrderSummarySchema = z
  .object({
    id: salesUuidSchema,
    version: salesVersionSchema,
    type: salesOrderTypeSchema,
    status: salesOrderStatusSchema,
    businessNumber: salesBusinessNumberSchema,
    customerName: nonEmptyBoundedString(150),
    deliveryDate: draftReplacementSchema.shape.deliveryDate,
    counts: currentOrderCountsSchema,
    matchingPieceIds: z.array(salesUuidSchema).max(MAX_DRAFT_PIECES),
    matchingPieceCount: z.number().int().min(0).max(MAX_DRAFT_PIECES),
    lastActionAt: salesInstantSchema.nullable(),
    allowedActions: warehouseAllowedActionsSchema,
    currentAttemptId: salesUuidSchema.nullable(),
    retryDate: draftReplacementSchema.shape.deliveryDate,
  })
  .strict()
  .refine((summary) => {
    const { counts, allowedActions: actions } = summary;
    const complete = counts.active > 0 && counts.received === counts.active;
    return (
      summary.matchingPieceCount === summary.matchingPieceIds.length &&
      new Set(summary.matchingPieceIds).size ===
        summary.matchingPieceIds.length &&
      summary.matchingPieceCount <= counts.original &&
      (!actions.canDispatch ||
        (summary.status === "READY_FOR_DELIVERY" && complete)) &&
      (!actions.canConfirmDelivery ||
        (summary.status === "OUT_FOR_DELIVERY" &&
          summary.currentAttemptId !== null &&
          complete)) &&
      actions.canConfirmDelivery === actions.canFailDelivery &&
      (!actions.canRetryDelivery ||
        (summary.status === "DELIVERY_FAILED" &&
          summary.currentAttemptId !== null &&
          complete)) &&
      (![
        "READY_FOR_DELIVERY",
        "OUT_FOR_DELIVERY",
        "DELIVERY_FAILED",
        "DELIVERED",
      ].includes(summary.status) ||
        complete) &&
      (!["OUT_FOR_DELIVERY", "DELIVERY_FAILED", "DELIVERED"].includes(
        summary.status,
      ) ||
        summary.currentAttemptId !== null) &&
      (summary.retryDate === null || summary.status === "READY_FOR_DELIVERY")
    );
  }, "Summary membership, current state and action prerequisites must agree");
export const warehousePieceContextSchema = z
  .object({
    pieceId: salesUuidSchema,
    acceptedHandoff: z
      .object({
        eventId: salesUuidSchema,
        commandId: salesUuidSchema,
        acceptedAt: salesInstantSchema,
        actor: approvalActorSchema,
        packingGroupId: salesUuidSchema.nullable(),
      })
      .strict()
      .nullable(),
    receiptGroupId: salesUuidSchema.nullable(),
    receivedAt: salesInstantSchema.nullable(),
    legacyReceipt: z.boolean(),
    allowedActions: z.object({ canReceive: z.boolean() }).strict(),
  })
  .strict()
  .refine(
    (work) =>
      (work.receivedAt === null
        ? work.receiptGroupId === null && !work.legacyReceipt
        : work.legacyReceipt
          ? work.receiptGroupId === null
          : work.receiptGroupId !== null) &&
      (!work.allowedActions.canReceive ||
        (work.acceptedHandoff !== null && work.receivedAt === null)) &&
      (work.acceptedHandoff === null ||
        work.receivedAt === null ||
        Date.parse(work.acceptedHandoff.acceptedAt) <=
          Date.parse(work.receivedAt)),
    "Receipt origin, handoff and action prerequisites must agree",
  );
const eligiblePieceContext = (
  piece: z.infer<typeof factoryOrderPieceSchema>,
  work: WarehousePieceContext,
): boolean =>
  piece.id === work.pieceId &&
  piece.receivedAt === work.receivedAt &&
  (!work.allowedActions.canReceive ||
    (piece.stage === "WAREHOUSE" &&
      piece.workState === "INCOMING" &&
      piece.cancelledAt === null &&
      piece.cancellationReason === null));
export const warehousePieceRowSchema = z
  .object({
    order: warehouseOrderSummarySchema,
    piece: factoryOrderPieceSchema,
    work: warehousePieceContextSchema,
  })
  .strict()
  .refine(
    (row) =>
      row.order.matchingPieceIds.includes(row.piece.id) &&
      eligiblePieceContext(row.piece, row.work) &&
      (!row.work.allowedActions.canReceive || row.order.status === "APPROVED"),
    "Row must bind the exact matching physical identity, receipt and action state",
  );
const counts = z
  .object({
    orders: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    pieces: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (count) =>
      count.orders <= count.pieces &&
      (count.orders === 0) === (count.pieces === 0),
    "Order/piece counts must agree",
  );
const pageContains = (
  page: z.infer<typeof paginationMetaSchema>,
  length: number,
): boolean =>
  isSafePaginationWindow(page) &&
  length ===
    Math.min(
      page.limit,
      Math.max(0, page.total - (page.page - 1) * page.limit),
    );
const hasRegistries = (
  rows: readonly { orderId: string; work: WarehousePieceContext }[],
  groups: readonly z.infer<typeof warehouseReceiptGroupSchema>[],
  packing: readonly z.infer<typeof qualityPackingGroupSchema>[],
): boolean => {
  const receipts = new Set(
    rows.flatMap(({ work }) =>
      work.receiptGroupId === null ? [] : [work.receiptGroupId],
    ),
  );
  const quality = new Set(
    rows.flatMap(({ work }) =>
      work.acceptedHandoff?.packingGroupId
        ? [work.acceptedHandoff.packingGroupId]
        : [],
    ),
  );
  if (
    new Set(groups.map((group) => group.id)).size !== groups.length ||
    new Set(packing.map((group) => group.id)).size !== packing.length ||
    receipts.size !== groups.length ||
    quality.size !== packing.length
  )
    return false;
  return (
    groups.every((group) => receipts.has(group.id)) &&
    packing.every((group) => quality.has(group.id)) &&
    rows.every(({ orderId, work }) => {
      const receipt =
        work.receiptGroupId === null
          ? null
          : groups.find((group) => group.id === work.receiptGroupId);
      const qualityGroup = work.acceptedHandoff?.packingGroupId
        ? packing.find(
            (group) => group.id === work.acceptedHandoff?.packingGroupId,
          )
        : null;
      return (
        (work.receiptGroupId === null ||
          (receipt !== undefined &&
            receipt !== null &&
            receipt.orderId === orderId &&
            receipt.pieceIds.includes(work.pieceId) &&
            receipt.receivedAt === work.receivedAt)) &&
        (!work.acceptedHandoff?.packingGroupId ||
          (qualityGroup !== undefined &&
            qualityGroup !== null &&
            qualityGroup.acceptedPieceIds.includes(work.pieceId) &&
            qualityGroup.packedAt === work.acceptedHandoff.acceptedAt &&
            qualityGroup.inspector.id === work.acceptedHandoff.actor.id &&
            qualityGroup.inspector.fullName ===
              work.acceptedHandoff.actor.fullName &&
            qualityGroup.inspector.role === work.acceptedHandoff.actor.role &&
            qualityGroup.inspector.department ===
              work.acceptedHandoff.actor.department))
      );
    })
  );
};
const matchesView = (
  view: WarehouseView,
  summary: WarehouseOrderSummary,
): boolean => {
  switch (view) {
    case "INCOMING":
      return summary.status === "APPROVED";
    case "INCOMPLETE":
      return (
        summary.status === "APPROVED" &&
        summary.counts.active > 0 &&
        summary.counts.received < summary.counts.active
      );
    case "READY":
      return summary.status === "READY_FOR_DELIVERY";
    default:
      return summary.status === view;
  }
};
export const warehouseDashboardDataSchema = z
  .object({
    counts: z
      .object({
        incoming: counts,
        incomplete: counts,
        ready: counts,
        outForDelivery: counts,
        deliveryFailed: counts,
        delivered: counts,
      })
      .strict(),
  })
  .strict();
export const warehouseOrdersDataSchema = z
  .object({
    department: z.literal("WAREHOUSE"),
    view: warehouseViewSchema,
    orders: z.array(warehouseOrderSummarySchema).max(25),
    counts,
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 25 &&
      page.pagination.total === page.counts.orders &&
      pageContains(page.pagination, page.orders.length) &&
      new Set(page.orders.map((order) => order.id)).size ===
        page.orders.length &&
      page.orders.every(
        (order) =>
          order.matchingPieceCount > 0 && matchesView(page.view, order),
      ),
    "Grouped page must bind matching orders, counts and pagination",
  );
export const warehousePiecesDataSchema = z
  .object({
    department: z.literal("WAREHOUSE"),
    view: warehouseViewSchema,
    orderId: salesUuidSchema.nullable(),
    pieces: z.array(warehousePieceRowSchema).max(100),
    counts,
    pagination: paginationMetaSchema,
    receiptGroups: z.array(warehouseReceiptGroupSchema).max(100),
    qualityPackingGroups: z.array(qualityPackingGroupSchema).max(100),
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 100 &&
      page.pagination.total === page.counts.pieces &&
      pageContains(page.pagination, page.pieces.length) &&
      new Set(page.pieces.map((row) => row.piece.id)).size ===
        page.pieces.length &&
      page.pieces.every(
        (row) =>
          (page.orderId === null || row.order.id === page.orderId) &&
          matchesView(page.view, row.order) &&
          (page.view !== "INCOMING" || row.work.allowedActions.canReceive),
      ) &&
      hasRegistries(
        page.pieces.map((row) => ({ orderId: row.order.id, work: row.work })),
        page.receiptGroups,
        page.qualityPackingGroups,
      ),
    "Flat page must bind exact pieces, requested order, registries, counts and pagination",
  );
export const warehouseOrderDataSchema = z
  .object({
    summary: warehouseOrderSummarySchema,
    paper: factoryOrderPaperDataSchema,
    deliveryContact: z
      .object({
        name: customerSchema.shape.name,
        phone: customerSchema.shape.phone,
        address: customerSchema.shape.address,
      })
      .strict(),
    work: z.array(warehousePieceContextSchema).min(1).max(MAX_DRAFT_PIECES),
    receiptGroups: z.array(warehouseReceiptGroupSchema).max(MAX_DRAFT_PIECES),
    qualityPackingGroups: z
      .array(qualityPackingGroupSchema)
      .max(MAX_DRAFT_PIECES),
    currentAttempt: warehouseAttemptSchema.nullable(),
  })
  .strict()
  .refine((detail) => {
    const { summary, paper, work, currentAttempt } = detail;
    const pieces = paper.order.pieces;
    if (
      summary.id !== paper.order.id ||
      summary.version !== paper.order.version ||
      summary.status !== paper.order.status ||
      summary.type !== paper.order.type ||
      summary.businessNumber !== paper.order.businessNumber ||
      summary.customerName !== paper.order.customerName ||
      summary.deliveryDate !== paper.order.deliveryDate ||
      detail.deliveryContact.name !== summary.customerName ||
      pieces.length !== work.length ||
      new Set(pieces.map((piece) => piece.id)).size !== pieces.length ||
      new Set(work.map((entry) => entry.pieceId)).size !== work.length
    )
      return false;
    if (
      !detail.receiptGroups.every(
        (group) =>
          group.orderId === summary.id &&
          group.pieceIds.every((id) => pieces.some((piece) => piece.id === id)),
      ) ||
      !detail.qualityPackingGroups.every((group) =>
        group.acceptedPieceIds.every((id) =>
          pieces.some((piece) => piece.id === id),
        ),
      )
    )
      return false;
    const active = pieces.filter((piece) => piece.stage !== "CANCELLED"),
      received = active.filter((piece) => piece.receivedAt !== null);
    if (
      summary.counts.original !== pieces.length ||
      summary.counts.active !== active.length ||
      summary.counts.received !== received.length ||
      (
        [
          "original",
          "cancelled",
          "active",
          "received",
          "completionPercent",
        ] as const
      ).some((key) => summary.counts[key] !== paper.order.counts[key]) ||
      summary.matchingPieceIds.length !== active.length ||
      !summary.matchingPieceIds.every((id) =>
        active.some((piece) => piece.id === id),
      )
    )
      return false;
    if (
      !work.every((entry) => {
        const piece = pieces.find((row) => row.id === entry.pieceId);
        return (
          piece !== undefined &&
          eligiblePieceContext(piece, entry) &&
          (!entry.allowedActions.canReceive || summary.status === "APPROVED")
        );
      })
    )
      return false;
    if (
      !hasRegistries(
        work.map((entry) => ({ orderId: summary.id, work: entry })),
        detail.receiptGroups,
        detail.qualityPackingGroups,
      )
    )
      return false;
    if (currentAttempt === null)
      return (
        summary.currentAttemptId === null &&
        !["OUT_FOR_DELIVERY", "DELIVERY_FAILED", "DELIVERED"].includes(
          summary.status,
        )
      );
    if (
      summary.currentAttemptId !== currentAttempt.id ||
      currentAttempt.orderId !== summary.id ||
      currentAttempt.pieceIds.length !== active.length ||
      !currentAttempt.pieceIds.every((id) =>
        active.some((piece) => piece.id === id),
      )
    )
      return false;
    switch (summary.status) {
      case "OUT_FOR_DELIVERY":
        return currentAttempt.status === "DISPATCHED";
      case "DELIVERY_FAILED":
        return (
          currentAttempt.status === "FAILED" && currentAttempt.retry === null
        );
      case "DELIVERED":
        return currentAttempt.status === "DELIVERED";
      case "READY_FOR_DELIVERY":
        return (
          currentAttempt.status === "FAILED" &&
          currentAttempt.retry !== null &&
          summary.retryDate === currentAttempt.retry.retryDate
        );
      default:
        return false;
    }
  }, "Detail must bind current physical membership, safe paper, receipt registries and custody");
export const warehouseHistoryItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("warehouse"),
      event: warehouseActivityEventSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("manufacturing"),
      event: manufacturingActivityEventSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("quality"), event: qualityActivityEventSchema })
    .strict(),
  z
    .object({
      kind: z.literal("issue"),
      event: qualityIssueActivityEventSchema,
    })
    .strict(),
]);
export const warehouseActivityDataSchema = z
  .object({
    department: z.literal("WAREHOUSE"),
    events: z
      .array(
        z
          .object({
            kind: z.literal("warehouse"),
            event: warehouseActivityEventSchema,
          })
          .strict(),
      )
      .max(100),
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 100 &&
      pageContains(page.pagination, page.events.length) &&
      new Set(page.events.map(({ event }) => event.id)).size ===
        page.events.length,
    "Activity must retain distinct paginated events",
  );
export const warehouseOrderHistoryDataSchema = z
  .object({
    department: z.literal("WAREHOUSE"),
    orderId: salesUuidSchema,
    events: z.array(warehouseHistoryItemSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.pagination.limit <= 100 &&
      pageContains(page.pagination, page.events.length) &&
      page.events.every(({ event }) => event.orderId === page.orderId) &&
      new Set(page.events.map(({ kind, event }) => kind + "/" + event.id))
        .size === page.events.length,
    "History must bind distinct original events to the requested order and page",
  );

export type WarehouseView = z.infer<typeof warehouseViewSchema>;
export type WarehouseAllowedActions = z.infer<
  typeof warehouseAllowedActionsSchema
>;
export type WarehouseOrderSummary = z.infer<typeof warehouseOrderSummarySchema>;
export type WarehousePieceContext = z.infer<typeof warehousePieceContextSchema>;
export type WarehousePieceRow = z.infer<typeof warehousePieceRowSchema>;
export type WarehouseOrderData = z.infer<typeof warehouseOrderDataSchema>;
export type WarehouseHistoryItem = z.infer<typeof warehouseHistoryItemSchema>;
export type WarehouseDashboardData = z.infer<
  typeof warehouseDashboardDataSchema
>;
export type WarehouseOrdersData = z.infer<typeof warehouseOrdersDataSchema>;
export type WarehousePiecesData = z.infer<typeof warehousePiecesDataSchema>;
export type WarehouseActivityData = z.infer<typeof warehouseActivityDataSchema>;
export type WarehouseOrderHistoryData = z.infer<
  typeof warehouseOrderHistoryDataSchema
>;
export type WarehouseDashboardQuery = z.infer<
  typeof warehouseDashboardQuerySchema
>;
export type WarehouseDashboardQueryInput = z.input<
  typeof warehouseDashboardQuerySchema
>;
export type WarehouseOrdersQuery = z.infer<typeof warehouseOrdersQuerySchema>;
export type WarehouseOrdersQueryInput = z.input<
  typeof warehouseOrdersQuerySchema
>;
export type WarehousePiecesQuery = z.infer<typeof warehousePiecesQuerySchema>;
export type WarehousePiecesQueryInput = z.input<
  typeof warehousePiecesQuerySchema
>;
export type WarehouseActivityQuery = z.infer<
  typeof warehouseActivityQuerySchema
>;
export type WarehouseActivityQueryInput = z.input<
  typeof warehouseActivityQuerySchema
>;
export type WarehouseOrderHistoryQuery = z.infer<
  typeof warehouseOrderHistoryQuerySchema
>;
export type WarehouseOrderHistoryQueryInput = z.input<
  typeof warehouseOrderHistoryQuerySchema
>;
