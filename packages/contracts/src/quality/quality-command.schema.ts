import { z } from "zod";
import {
  approvalActorSchema,
  approvalTargetSchema,
} from "../approval/approval-command.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import { salesCommandParamsSchema } from "../sales-commands/command-receipt.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  orderPieceStageSchema,
  orderWorkStateSchema,
} from "../sales-orders/sales-order-values.schema.ts";

export const qualityViewSchema = z.enum([
  "INCOMING",
  "INSPECTION",
  "ACCEPTED",
  "CORRECTIONS",
]);
export const qualityCommandOperationSchema = z.enum([
  "RECEIVE_AND_START",
  "CONTINUE",
  "INSPECT",
  "REPORT_ISSUES",
]);
export const qualityOrderParamsSchema = z
  .object({ orderId: salesUuidSchema })
  .strict();
export const qualityCommandParamsSchema = salesCommandParamsSchema;

const optionalTextSchema = z
  .string()
  .max(4000)
  .refine(
    (text) => !text.includes("\u0000"),
    "Text must not contain null characters",
  )
  .nullish()
  .transform((text) =>
    text === undefined || text === null || text.trim() === "" ? null : text,
  );
const recordedTextSchema = nonEmptyBoundedString(4000);
const packingInputSchema = z
  .object({
    cartonCount: optionalTextSchema,
    cartonNumbers: optionalTextSchema,
  })
  .strict()
  .nullish()
  .transform((packing) =>
    packing === undefined ||
    packing === null ||
    (packing.cartonCount === null && packing.cartonNumbers === null)
      ? null
      : packing,
  );

export const qualityInspectionDecisionSchema = z.discriminatedUnion(
  "decision",
  [
    z
      .object({ pieceId: salesUuidSchema, decision: z.literal("ACCEPT") })
      .strict(),
    z
      .object({
        pieceId: salesUuidSchema,
        decision: z.literal("REJECT"),
        target: approvalTargetSchema,
        reason: recordedTextSchema,
        instructions: recordedTextSchema,
      })
      .strict(),
  ],
);
const selectionOrderSchema = z
  .object({
    orderId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    pieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict();
const inspectionOrderSchema = z
  .object({
    orderId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    decisions: z
      .array(qualityInspectionDecisionSchema)
      .min(1)
      .max(MAX_DRAFT_PIECES),
    inspectorNote: optionalTextSchema,
    packing: packingInputSchema,
  })
  .strict()
  .refine(
    (group) =>
      group.packing === null ||
      group.decisions.some((row) => row.decision === "ACCEPT"),
    { path: ["packing"], message: "Packing requires accepted pieces" },
  );
const selectedOrdersSchema = z
  .array(selectionOrderSchema)
  .min(1)
  .max(MAX_DRAFT_PIECES);
const commandIdentity = { commandId: salesUuidSchema };
const hasDistinctMembers = (
  groups: readonly { orderId: string; pieceIds: readonly string[] }[],
): boolean => {
  const ids = groups.flatMap((group) => group.pieceIds);
  return (
    new Set(groups.map((group) => group.orderId)).size === groups.length &&
    ids.length <= MAX_DRAFT_PIECES &&
    new Set(ids).size === ids.length
  );
};
export const qualityCommandBodySchema = z
  .discriminatedUnion("operation", [
    z
      .object({
        ...commandIdentity,
        operation: z.literal("RECEIVE_AND_START"),
        orders: selectedOrdersSchema,
      })
      .strict(),
    z
      .object({
        ...commandIdentity,
        operation: z.literal("CONTINUE"),
        orders: selectedOrdersSchema,
      })
      .strict(),
    z
      .object({
        ...commandIdentity,
        operation: z.literal("INSPECT"),
        orders: z.array(inspectionOrderSchema).min(1).max(MAX_DRAFT_PIECES),
      })
      .strict(),
    z
      .object({
        ...commandIdentity,
        operation: z.literal("REPORT_ISSUES"),
        orders: selectedOrdersSchema,
        reason: recordedTextSchema,
        notes: optionalTextSchema,
      })
      .strict(),
  ])
  .refine(
    (body) =>
      hasDistinctMembers(
        body.orders.map((group) => ({
          orderId: group.orderId,
          pieceIds:
            "pieceIds" in group
              ? group.pieceIds
              : group.decisions.map((row) => row.pieceId),
        })),
      ),
    {
      path: ["orders"],
      message:
        "Select distinct orders and at most 200 distinct physical pieces",
    },
  );

export const qualityPieceOutcomeSchema = z
  .object({
    pieceId: salesUuidSchema,
    visitId: salesUuidSchema.nullable(),
    decision: z.enum(["ACCEPT", "REJECT"]).nullable(),
    stage: orderPieceStageSchema,
    workState: orderWorkStateSchema,
    correctionId: salesUuidSchema.nullable(),
    issueId: salesUuidSchema.nullable(),
  })
  .strict();
export const qualityOrderOutcomeSchema = z
  .object({
    eventId: salesUuidSchema,
    orderId: salesUuidSchema,
    beforeVersion: salesVersionSchema,
    afterVersion: salesVersionSchema,
    pieces: z.array(qualityPieceOutcomeSchema).min(1).max(MAX_DRAFT_PIECES),
    packingGroupId: salesUuidSchema.nullable(),
  })
  .strict();
export const qualityCommandReceiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: qualityCommandOperationSchema,
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
  })
  .strict()
  .refine(
    ({ actor }) => actor.role === "ADMIN" || actor.department === "QUALITY",
    { path: ["actor"], message: "Quality authority is required" },
  );
export const qualityCommandOutcomeSchema = z
  .object({
    orders: z.array(qualityOrderOutcomeSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(({ orders }) => {
    const uniqueNullable = (ids: readonly (string | null)[]) => {
      const present = ids.filter((id) => id !== null);
      return new Set(present).size === present.length;
    };
    return (
      hasDistinctMembers(
        orders.map((group) => ({
          orderId: group.orderId,
          pieceIds: group.pieces.map((piece) => piece.pieceId),
        })),
      ) &&
      new Set(orders.map((group) => group.eventId)).size === orders.length &&
      uniqueNullable(
        orders.flatMap((group) => group.pieces.map((piece) => piece.visitId)),
      ) &&
      uniqueNullable(
        orders.flatMap((group) =>
          group.pieces.map((piece) => piece.correctionId),
        ),
      ) &&
      uniqueNullable(
        orders.flatMap((group) => group.pieces.map((piece) => piece.issueId)),
      ) &&
      uniqueNullable(orders.map((group) => group.packingGroupId))
    );
  }, "Outcome identities must be distinct within the selection budget");

const matchesOperation = (
  operation: QualityCommandOperation,
  piece: QualityPieceOutcome,
): boolean => {
  if (operation === "REPORT_ISSUES")
    return (
      piece.stage === "QUALITY" &&
      piece.workState === "BLOCKED" &&
      piece.decision === null &&
      piece.issueId !== null
    );
  if (piece.visitId === null || piece.issueId !== null) return false;
  if (operation !== "INSPECT")
    return (
      piece.stage === "QUALITY" &&
      piece.workState === "IN_PROGRESS" &&
      piece.decision === null
    );
  if (piece.workState !== "INCOMING") return false;
  return piece.decision === "ACCEPT"
    ? piece.stage === "WAREHOUSE"
    : piece.decision === "REJECT" &&
        piece.correctionId !== null &&
        (piece.stage === "CUTTING" || piece.stage === "PRODUCTION");
};
export const qualityCommandDataSchema = z
  .object({
    kind: z.literal("quality-command"),
    receipt: qualityCommandReceiptSchema,
    replayed: z.boolean(),
    outcome: qualityCommandOutcomeSchema,
  })
  .strict()
  .refine(
    ({ receipt, outcome }) =>
      outcome.orders.every((group) => {
        const delta =
          receipt.operation === "REPORT_ISSUES" ? group.pieces.length : 1;
        return (
          group.afterVersion === group.beforeVersion + delta &&
          group.pieces.every((piece) =>
            matchesOperation(receipt.operation, piece),
          ) &&
          (group.packingGroupId === null ||
            (receipt.operation === "INSPECT" &&
              group.pieces.some((piece) => piece.decision === "ACCEPT")))
        );
      }),
    "Outcome must match the operation, per-order version delta and packing membership",
  );

export type QualityView = z.infer<typeof qualityViewSchema>;
export type QualityCommandOperation = z.infer<
  typeof qualityCommandOperationSchema
>;
export type QualityOrderParams = z.infer<typeof qualityOrderParamsSchema>;
export type QualityCommandParams = z.infer<typeof qualityCommandParamsSchema>;
export type QualityInspectionDecision = z.infer<
  typeof qualityInspectionDecisionSchema
>;
export type QualityCommandBody = z.infer<typeof qualityCommandBodySchema>;
export type QualityPieceOutcome = z.infer<typeof qualityPieceOutcomeSchema>;
export type QualityOrderOutcome = z.infer<typeof qualityOrderOutcomeSchema>;
export type QualityCommandReceipt = z.infer<typeof qualityCommandReceiptSchema>;
export type QualityCommandOutcome = z.infer<typeof qualityCommandOutcomeSchema>;
export type QualityCommandData = z.infer<typeof qualityCommandDataSchema>;
