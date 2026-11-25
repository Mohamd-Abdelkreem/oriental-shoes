import { z } from "zod";

import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  salesBusinessNumberSchema,
  salesOrderStatusSchema,
} from "../sales-orders/sales-order-values.schema.ts";
import {
  administrationCommandDataSchema,
  administrationCommandFactsSchema,
  administrationOperationSchema,
} from "./administration-command.schema.ts";

const correctionFieldNames = [
  "customerAddress",
  "customerEmail",
  "customerName",
  "customerPhone",
  "generalNotes",
  "paper",
] as const;
const changedFieldSchema = z.enum([
  "cancellation",
  "total",
  "status",
  ...correctionFieldNames,
]);
const eventFields = {
  id: salesUuidSchema,
  orderId: salesUuidSchema,
  orderVersion: salesVersionSchema,
  businessNumber: salesBusinessNumberSchema,
  operation: administrationOperationSchema,
  actor: administrationCommandDataSchema.shape.receipt.shape.actor,
  occurredAt: salesInstantSchema,
  pieceIds: administrationCommandDataSchema.shape.result.shape.pieceIds,
};
const changedFieldsSchema = z
  .array(changedFieldSchema)
  .min(1)
  .max(changedFieldSchema.options.length)
  .refine(
    (fields) =>
      fields.every(
        (field, index) => index === 0 || field > (fields[index - 1] ?? ""),
      ),
    "Changed fields must be sorted and distinct",
  );
const eventSelectionAgrees = (event: {
  operation: z.infer<typeof administrationOperationSchema>;
  pieceIds: string[];
  changedFields: z.infer<typeof changedFieldsSchema>;
}): boolean =>
  event.operation === "ADMIN_CORRECT"
    ? event.pieceIds.length === 0 &&
      event.changedFields.every(
        (field) =>
          field !== "cancellation" && field !== "total" && field !== "status",
      )
    : event.pieceIds.length > 0 &&
      event.changedFields.includes("cancellation") &&
      event.changedFields.every(
        (field) =>
          field === "cancellation" || field === "total" || field === "status",
      );
export const administrationOrderActivityEventSchema = z
  .object({ ...eventFields, changedFields: changedFieldsSchema })
  .strict()
  .refine(
    eventSelectionAgrees,
    "History selection and field labels must match the operation",
  );
export const administrationOperationalActivityEventSchema = z
  .object({
    ...eventFields,
    operation: z.literal("ADMIN_CANCEL"),
    pieceIds: eventFields.pieceIds.refine(
      (ids) => ids.length > 0,
      "Cancellation requires selected pieces",
    ),
    beforeStatus: salesOrderStatusSchema,
    afterStatus: salesOrderStatusSchema,
  })
  .strict();
export const administrationActivityEventSchema = z
  .object({
    ...eventFields,
    reason: nonEmptyBoundedString(4000),
    changedFields: changedFieldsSchema,
    before: administrationCommandFactsSchema,
    after: administrationCommandFactsSchema,
  })
  .strict()
  .refine(
    eventSelectionAgrees,
    "History selection and field labels must match the operation",
  )
  .refine((event) => {
    const { before, after } = event;
    const changes =
      event.operation === "ADMIN_CANCEL"
        ? [
            "cancellation",
            ...(before.money.total !== after.money.total ? ["total"] : []),
            ...(before.status !== after.status ? ["status"] : []),
          ].sort()
        : correctionFieldNames.filter(
            (field) =>
              JSON.stringify(before.correction[field]) !==
              JSON.stringify(after.correction[field]),
          );
    if (JSON.stringify(changes) !== JSON.stringify(event.changedFields))
      return false;
    return administrationCommandDataSchema.safeParse({
      receipt: {
        commandId: event.id,
        orderId: event.orderId,
        operation: event.operation,
        beforeVersion: before.version,
        afterVersion: event.orderVersion,
        actor: event.actor,
        occurredAt: event.occurredAt,
      },
      replayed: false,
      before,
      after,
      result: {
        orderId: event.orderId,
        version: after.version,
        status: after.status,
        counts: after.counts,
        money: after.money,
        correction: after.correction,
        pieceIds: event.pieceIds,
      },
    }).success;
  }, "Full history must match exact retained command effects and changed fields");

export type AdministrationActivityEvent = z.infer<
  typeof administrationActivityEventSchema
>;
export type AdministrationOrderActivityEvent = z.infer<
  typeof administrationOrderActivityEventSchema
>;
export type AdministrationOperationalActivityEvent = z.infer<
  typeof administrationOperationalActivityEventSchema
>;
