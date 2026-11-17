import { z } from "zod";
import { draftReplacementSchema } from "../sales-drafts/sales-drafts.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
  MAX_DRAFT_PIECES,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  salesBusinessNumberSchema,
  salesOrderStatusSchema,
} from "../sales-orders/sales-order-values.schema.ts";
import {
  warehouseActorSchema,
  warehouseCommandOperationSchema,
  warehouseCommandDataSchema,
} from "./warehouse-command.schema.ts";

const recordedText = nonEmptyBoundedString(4000).nullable();
const pieceIdsSchema = z
  .array(salesUuidSchema)
  .min(1)
  .max(MAX_DRAFT_PIECES)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Piece identities must be distinct",
  );
const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));
const sameActor = (
  left: WarehouseReceiptGroup["actor"],
  right: WarehouseReceiptGroup["actor"],
): boolean =>
  left.id === right.id &&
  left.fullName === right.fullName &&
  left.role === right.role &&
  left.department === right.department;
export const warehouseReceiptGroupSchema = z
  .object({
    id: salesUuidSchema,
    orderId: salesUuidSchema,
    pieceIds: pieceIdsSchema,
    actor: warehouseActorSchema,
    receivedAt: salesInstantSchema,
    cartonCount: recordedText,
    storageLocation: recordedText,
    notes: recordedText,
  })
  .strict();
export const warehouseRetrySchema = z
  .object({
    id: salesUuidSchema,
    actor: warehouseActorSchema,
    occurredAt: salesInstantSchema,
    retryDate: draftReplacementSchema.shape.deliveryDate,
    notes: recordedText,
  })
  .strict();
const outcomeFields = {
  id: salesUuidSchema,
  recordedBy: warehouseActorSchema,
  recordedAt: salesInstantSchema,
  notes: recordedText,
};
const deliveredOutcomeSchema = z
  .object({
    ...outcomeFields,
    kind: z.literal("DELIVERED"),
    recipient: recordedText,
    deliveredAt: salesInstantSchema.nullable(),
  })
  .strict();
const failedOutcomeSchema = z
  .object({
    ...outcomeFields,
    kind: z.literal("FAILED"),
    returnedToWarehouse: z.literal(true),
    reason: nonEmptyBoundedString(4000),
  })
  .strict();
export const warehouseAttemptSchema = z
  .object({
    id: salesUuidSchema,
    orderId: salesUuidSchema,
    number: salesVersionSchema,
    pieceIds: pieceIdsSchema,
    status: z.enum(["DISPATCHED", "DELIVERED", "FAILED"]),
    dispatchedBy: warehouseActorSchema,
    dispatchedAt: salesInstantSchema,
    deliveryNote: recordedText,
    outcome: z
      .discriminatedUnion("kind", [deliveredOutcomeSchema, failedOutcomeSchema])
      .nullable(),
    retry: warehouseRetrySchema.nullable(),
  })
  .strict()
  .refine((attempt) => {
    if (attempt.status === "DISPATCHED")
      return attempt.outcome === null && attempt.retry === null;
    if (
      attempt.outcome === null ||
      attempt.outcome.kind !== attempt.status ||
      Date.parse(attempt.outcome.recordedAt) < Date.parse(attempt.dispatchedAt)
    )
      return false;
    return (
      attempt.retry === null ||
      (attempt.outcome.kind === "FAILED" &&
        Date.parse(attempt.retry.occurredAt) >=
          Date.parse(attempt.outcome.recordedAt))
    );
  }, "Attempt state, terminal outcome, retry and chronological evidence must agree");
const activityShape = z
  .object({
    id: salesUuidSchema,
    commandId: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: salesBusinessNumberSchema,
    operation: warehouseCommandOperationSchema,
    actor: warehouseActorSchema,
    occurredAt: salesInstantSchema,
    pieceIds: pieceIdsSchema,
    beforeStatus: salesOrderStatusSchema,
    afterStatus: salesOrderStatusSchema,
    receiptGroup: warehouseReceiptGroupSchema.nullable(),
    attempt: warehouseAttemptSchema.nullable(),
    retry: warehouseRetrySchema.nullable(),
  })
  .strict();
type ActivityShape = z.infer<typeof activityShape>;
const hasBoundReceipt = (event: ActivityShape): boolean => {
  const group = event.receiptGroup;
  return (
    group !== null &&
    group.orderId === event.orderId &&
    sameIds(group.pieceIds, event.pieceIds) &&
    group.receivedAt === event.occurredAt &&
    sameActor(group.actor, event.actor)
  );
};
const hasBoundAttempt = (event: ActivityShape): boolean => {
  const attempt = event.attempt;
  return (
    attempt !== null &&
    attempt.orderId === event.orderId &&
    (event.operation === "RETRY_DELIVERY"
      ? event.pieceIds.every((id) => attempt.pieceIds.includes(id))
      : sameIds(attempt.pieceIds, event.pieceIds))
  );
};
const hasOperationEvidence = (event: ActivityShape): boolean => {
  if (event.operation === "RECEIVE")
    return (
      event.beforeStatus === "APPROVED" &&
      hasBoundReceipt(event) &&
      event.attempt === null &&
      event.retry === null
    );
  if (
    event.receiptGroup !== null ||
    !hasBoundAttempt(event) ||
    event.attempt === null
  )
    return false;
  const attempt = event.attempt;
  switch (event.operation) {
    case "DISPATCH":
      return (
        event.beforeStatus === "READY_FOR_DELIVERY" &&
        attempt.status === "DISPATCHED" &&
        attempt.dispatchedAt === event.occurredAt &&
        sameActor(attempt.dispatchedBy, event.actor) &&
        event.retry === null
      );
    case "CONFIRM_DELIVERY":
    case "FAIL_DELIVERY":
      return (
        event.beforeStatus === "OUT_FOR_DELIVERY" &&
        attempt.status ===
          (event.operation === "CONFIRM_DELIVERY" ? "DELIVERED" : "FAILED") &&
        attempt.outcome !== null &&
        attempt.outcome.recordedAt === event.occurredAt &&
        sameActor(attempt.outcome.recordedBy, event.actor) &&
        attempt.retry === null &&
        event.retry === null
      );
    case "RETRY_DELIVERY":
      return (
        event.beforeStatus === "DELIVERY_FAILED" &&
        attempt.status === "FAILED" &&
        attempt.retry !== null &&
        event.retry !== null &&
        attempt.retry.id === event.retry.id &&
        attempt.retry.occurredAt === event.occurredAt &&
        sameActor(event.retry.actor, event.actor) &&
        attempt.retry.retryDate === event.retry.retryDate &&
        attempt.retry.notes === event.retry.notes &&
        sameActor(attempt.retry.actor, event.retry.actor)
      );
  }
};
export const warehouseActivityEventSchema = activityShape.refine((event) => {
  const compact = warehouseCommandDataSchema.safeParse({
    kind: "warehouse-command",
    replayed: false,
    receipt: {
      commandId: event.commandId,
      operation: event.operation,
      actor: event.actor,
      occurredAt: event.occurredAt,
    },
    outcome: {
      orders: [
        {
          eventId: event.id,
          orderId: event.orderId,
          beforeVersion: event.orderVersion - 1,
          afterVersion: event.orderVersion,
          status: event.afterStatus,
          pieceIds: event.pieceIds,
          receiptGroupId: event.receiptGroup?.id ?? null,
          attemptId: event.attempt?.id ?? null,
          retryId: event.retry?.id ?? null,
        },
      ],
    },
  });
  return compact.success && hasOperationEvidence(event);
}, "Event must preserve original operation-time evidence and bound identities");

export type WarehouseReceiptGroup = z.infer<typeof warehouseReceiptGroupSchema>;
export type WarehouseRetry = z.infer<typeof warehouseRetrySchema>;
export type WarehouseAttempt = z.infer<typeof warehouseAttemptSchema>;
export type DeliveredOutcome = z.infer<typeof deliveredOutcomeSchema>;
export type FailedOutcome = z.infer<typeof failedOutcomeSchema>;
export type WarehouseActivityEvent = z.infer<
  typeof warehouseActivityEventSchema
>;
