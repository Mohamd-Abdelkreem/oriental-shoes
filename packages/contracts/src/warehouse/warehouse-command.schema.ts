import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import { draftReplacementSchema } from "../sales-drafts/sales-drafts.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { salesOrderStatusSchema } from "../sales-orders/sales-order-values.schema.ts";

const blankToNull = (text: string | null | undefined): string | null =>
  text === undefined || text === null || text.trim() === "" ? null : text;
export const warehouseOptionalTextSchema = z
  .string()
  .max(4000)
  .refine(
    (text) => !text.includes("\u0000"),
    "Text must not contain null characters",
  )
  .nullish()
  .transform(blankToNull);
export const warehouseRequiredReasonSchema = nonEmptyBoundedString(4000);
export const warehouseRetryDateSchema = z
  .string()
  .nullish()
  .transform(blankToNull)
  .pipe(draftReplacementSchema.shape.deliveryDate.unwrap().nullable());
export const warehouseDeliveredAtSchema = z
  .string()
  .nullish()
  .transform(blankToNull)
  .pipe(salesInstantSchema.nullable())
  .transform((instant) =>
    instant === null ? null : new Date(instant).toISOString(),
  );
export const warehouseActorSchema = approvalActorSchema.refine(
  (actor) => actor.role === "ADMIN" || actor.department === "WAREHOUSE",
  "Warehouse authority is required",
);
export const warehouseCommandOperationSchema = z.enum([
  "RECEIVE",
  "DISPATCH",
  "CONFIRM_DELIVERY",
  "FAIL_DELIVERY",
  "RETRY_DELIVERY",
]);
export const warehouseOrderParamsSchema = z
  .object({ orderId: salesUuidSchema })
  .strict();
export const warehouseCommandParamsSchema = z
  .object({ commandId: salesUuidSchema })
  .strict();
const selectionFields = {
  orderId: salesUuidSchema,
  expectedVersion: salesVersionSchema,
  pieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
};
const receiptInputSchema = z
  .object({
    cartonCount: warehouseOptionalTextSchema,
    storageLocation: warehouseOptionalTextSchema,
    notes: warehouseOptionalTextSchema,
  })
  .strict()
  .nullish()
  .transform(
    (receipt) =>
      receipt ?? { cartonCount: null, storageLocation: null, notes: null },
  );
const distinctScope = (
  groups: readonly { orderId: string; pieceIds: readonly string[] }[],
): boolean => {
  const pieceIds = groups.flatMap((group) => group.pieceIds);
  return (
    new Set(groups.map((group) => group.orderId)).size === groups.length &&
    pieceIds.length <= MAX_DRAFT_PIECES &&
    new Set(pieceIds).size === pieceIds.length
  );
};
export const warehouseCommandBodySchema = z
  .discriminatedUnion("operation", [
    z
      .object({
        commandId: salesUuidSchema,
        operation: z.literal("RECEIVE"),
        orders: z
          .array(
            z
              .object({ ...selectionFields, receipt: receiptInputSchema })
              .strict(),
          )
          .min(1)
          .max(MAX_DRAFT_PIECES),
      })
      .strict(),
    z
      .object({
        commandId: salesUuidSchema,
        operation: z.literal("DISPATCH"),
        orders: z
          .array(
            z
              .object({
                ...selectionFields,
                deliveryNote: warehouseOptionalTextSchema,
              })
              .strict(),
          )
          .min(1)
          .max(MAX_DRAFT_PIECES),
      })
      .strict(),
    z
      .object({
        commandId: salesUuidSchema,
        operation: z.literal("CONFIRM_DELIVERY"),
        orders: z
          .array(
            z
              .object({
                ...selectionFields,
                attemptId: salesUuidSchema,
                recipient: warehouseOptionalTextSchema,
                deliveredAt: warehouseDeliveredAtSchema,
                notes: warehouseOptionalTextSchema,
              })
              .strict(),
          )
          .min(1)
          .max(MAX_DRAFT_PIECES),
      })
      .strict(),
    z
      .object({
        commandId: salesUuidSchema,
        operation: z.literal("FAIL_DELIVERY"),
        orders: z
          .array(
            z
              .object({
                ...selectionFields,
                attemptId: salesUuidSchema,
                returnedToWarehouse: z.literal(true),
                reason: warehouseRequiredReasonSchema,
                notes: warehouseOptionalTextSchema,
              })
              .strict(),
          )
          .min(1)
          .max(MAX_DRAFT_PIECES),
      })
      .strict(),
    z
      .object({
        commandId: salesUuidSchema,
        operation: z.literal("RETRY_DELIVERY"),
        orders: z
          .array(
            z
              .object({
                ...selectionFields,
                attemptId: salesUuidSchema,
                retryDate: warehouseRetryDateSchema,
                notes: warehouseOptionalTextSchema,
              })
              .strict(),
          )
          .min(1)
          .max(MAX_DRAFT_PIECES),
      })
      .strict(),
  ])
  .refine((body) => distinctScope(body.orders), {
    path: ["orders"],
    message: "Select distinct orders and at most 200 distinct physical pieces",
  });
export const warehouseCommandReceiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: warehouseCommandOperationSchema,
    actor: warehouseActorSchema,
    occurredAt: salesInstantSchema,
  })
  .strict();
export const warehouseOrderOutcomeSchema = z
  .object({
    eventId: salesUuidSchema,
    orderId: salesUuidSchema,
    beforeVersion: salesVersionSchema,
    afterVersion: salesVersionSchema,
    status: salesOrderStatusSchema,
    pieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
    receiptGroupId: salesUuidSchema.nullable(),
    attemptId: salesUuidSchema.nullable(),
    retryId: salesUuidSchema.nullable(),
  })
  .strict()
  .refine(
    (group) => group.afterVersion === group.beforeVersion + 1,
    "Order versions must advance exactly once",
  );
const distinctPresent = (ids: readonly (string | null)[]): boolean => {
  const present = ids.filter((id) => id !== null);
  return new Set(present).size === present.length;
};
export const warehouseCommandOutcomeSchema = z
  .object({
    orders: z.array(warehouseOrderOutcomeSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    ({ orders }) =>
      distinctScope(orders) &&
      new Set(orders.map((group) => group.eventId)).size === orders.length &&
      distinctPresent(orders.map((group) => group.receiptGroupId)) &&
      distinctPresent(orders.map((group) => group.attemptId)) &&
      distinctPresent(orders.map((group) => group.retryId)),
    "Outcome identities must be distinct within the selection budget",
  );
const matchesOperation = (
  operation: WarehouseCommandOperation,
  group: WarehouseOrderOutcome,
): boolean => {
  if (operation === "RECEIVE")
    return (
      group.receiptGroupId !== null &&
      group.attemptId === null &&
      group.retryId === null &&
      (group.status === "APPROVED" || group.status === "READY_FOR_DELIVERY")
    );
  if (group.receiptGroupId !== null || group.attemptId === null) return false;
  if (operation === "RETRY_DELIVERY")
    return group.status === "READY_FOR_DELIVERY" && group.retryId !== null;
  if (group.retryId !== null) return false;
  switch (operation) {
    case "DISPATCH":
      return group.status === "OUT_FOR_DELIVERY";
    case "CONFIRM_DELIVERY":
      return group.status === "DELIVERED";
    case "FAIL_DELIVERY":
      return group.status === "DELIVERY_FAILED";
  }
};
export const warehouseCommandDataSchema = z
  .object({
    kind: z.literal("warehouse-command"),
    receipt: warehouseCommandReceiptSchema,
    replayed: z.boolean(),
    outcome: warehouseCommandOutcomeSchema,
  })
  .strict()
  .refine(
    ({ receipt, outcome }) =>
      outcome.orders.every((group) =>
        matchesOperation(receipt.operation, group),
      ),
    "Outcome must match its operation and child identities",
  );

export type WarehouseActor = z.infer<typeof warehouseActorSchema>;
export type WarehouseCommandOperation = z.infer<
  typeof warehouseCommandOperationSchema
>;
export type WarehouseOrderParams = z.infer<typeof warehouseOrderParamsSchema>;
export type WarehouseCommandParams = z.infer<
  typeof warehouseCommandParamsSchema
>;
export type WarehouseCommandBody = z.infer<typeof warehouseCommandBodySchema>;
export type WarehouseCommandReceipt = z.infer<
  typeof warehouseCommandReceiptSchema
>;
export type WarehouseOrderOutcome = z.infer<typeof warehouseOrderOutcomeSchema>;
export type WarehouseCommandOutcome = z.infer<
  typeof warehouseCommandOutcomeSchema
>;
export type WarehouseCommandData = z.infer<typeof warehouseCommandDataSchema>;
