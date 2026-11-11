import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { salesCommandParamsSchema } from "../sales-commands/command-receipt.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
  MAX_DRAFT_PIECES,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  orderPieceStageSchema,
  orderWorkStateSchema,
} from "../sales-orders/sales-order-values.schema.ts";

export const manufacturingDepartmentSchema = z.enum(["CUTTING", "PRODUCTION"]);
export const manufacturingDepartmentPathSchema = z.enum([
  "cutting",
  "production",
]);
export const manufacturingViewSchema = z.enum([
  "INCOMING",
  "IN_PROGRESS",
  "RETURNED",
  "COMPLETED",
]);
export const manufacturingCommandOperationSchema = z.enum([
  "RECEIVE_AND_START",
  "CONTINUE",
  "COMPLETE_TRANSFER",
]);
export const manufacturingDepartmentParamsSchema = z
  .object({
    department: manufacturingDepartmentPathSchema,
  })
  .strict();
export const manufacturingOrderParamsSchema =
  manufacturingDepartmentParamsSchema.extend({
    orderId: salesUuidSchema,
  });
export const manufacturingCommandParamsSchema = salesCommandParamsSchema;

const orderSelectionSchema = z
  .object({
    orderId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    pieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict();

const hasDistinctSelection = (
  groups: readonly {
    orderId: string;
    pieceIds: readonly string[];
  }[],
): boolean => {
  const pieceIds = groups.flatMap((group) => group.pieceIds);
  return (
    new Set(groups.map((group) => group.orderId)).size === groups.length &&
    pieceIds.length <= MAX_DRAFT_PIECES &&
    new Set(pieceIds).size === pieceIds.length
  );
};

export const manufacturingCommandBodySchema = z
  .object({
    commandId: salesUuidSchema,
    operation: manufacturingCommandOperationSchema,
    orders: z.array(orderSelectionSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(({ orders }) => hasDistinctSelection(orders), {
    path: ["orders"],
    message:
      "Selection must contain distinct orders and at most 200 distinct pieces",
  });

export const manufacturingPieceOutcomeSchema = z
  .object({
    pieceId: salesUuidSchema,
    visitId: salesUuidSchema,
    nextVisitId: salesUuidSchema.nullable(),
    stage: orderPieceStageSchema,
    workState: orderWorkStateSchema,
  })
  .strict();
export const manufacturingOrderOutcomeSchema = z
  .object({
    eventId: salesUuidSchema,
    orderId: salesUuidSchema,
    beforeVersion: salesVersionSchema,
    afterVersion: salesVersionSchema,
    pieces: z
      .array(manufacturingPieceOutcomeSchema)
      .min(1)
      .max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine((order) => order.afterVersion === order.beforeVersion + 1, {
    path: ["afterVersion"],
    message: "Command versions must advance exactly once",
  });
export const manufacturingCommandReceiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: manufacturingCommandOperationSchema,
    department: manufacturingDepartmentSchema,
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
  })
  .strict()
  .refine(
    ({ actor, department }) =>
      actor.role === "ADMIN" || actor.department === department,
    {
      path: ["actor"],
      message: "Actor must be authorized for the command department",
    },
  );
export const manufacturingCommandOutcomeSchema = z
  .object({
    orders: z
      .array(manufacturingOrderOutcomeSchema)
      .min(1)
      .max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(({ orders }) => {
    const groups = orders.map((order) => ({
      orderId: order.orderId,
      pieceIds: order.pieces.map((piece) => piece.pieceId),
    }));
    const visits = orders.flatMap((order) =>
      order.pieces.map((piece) => piece.visitId),
    );
    const nextVisits = orders.flatMap((order) =>
      order.pieces.flatMap((piece) =>
        piece.nextVisitId === null ? [] : [piece.nextVisitId],
      ),
    );
    return (
      hasDistinctSelection(groups) &&
      new Set(orders.map((order) => order.eventId)).size === orders.length &&
      new Set([...visits, ...nextVisits]).size ===
        visits.length + nextVisits.length
    );
  }, "Outcomes must have distinct order, event, piece and visit identities within the selection budget");

export const manufacturingCommandDataSchema = z
  .object({
    kind: z.literal("manufacturing-command"),
    receipt: manufacturingCommandReceiptSchema,
    replayed: z.boolean(),
    outcome: manufacturingCommandOutcomeSchema,
  })
  .strict()
  .refine(
    ({ receipt, outcome }) =>
      outcome.orders.every((order) =>
        order.pieces.every((piece) => {
          if (receipt.operation !== "COMPLETE_TRANSFER")
            return (
              piece.stage === receipt.department &&
              piece.workState === "IN_PROGRESS" &&
              piece.nextVisitId === null
            );
          return (
            piece.workState === "INCOMING" &&
            (receipt.department === "CUTTING"
              ? piece.stage === "PRODUCTION" && piece.nextVisitId !== null
              : piece.stage === "QUALITY" && piece.nextVisitId === null)
          );
        }),
      ),
    "Outcome must match the department and normal operation transition",
  );

export type ManufacturingDepartment = z.infer<
  typeof manufacturingDepartmentSchema
>;
export type ManufacturingDepartmentPath = z.infer<
  typeof manufacturingDepartmentPathSchema
>;
export type ManufacturingView = z.infer<typeof manufacturingViewSchema>;
export type ManufacturingCommandOperation = z.infer<
  typeof manufacturingCommandOperationSchema
>;
export type ManufacturingDepartmentParams = z.infer<
  typeof manufacturingDepartmentParamsSchema
>;
export type ManufacturingOrderParams = z.infer<
  typeof manufacturingOrderParamsSchema
>;
export type ManufacturingCommandParams = z.infer<
  typeof manufacturingCommandParamsSchema
>;
export type ManufacturingCommandBody = z.infer<
  typeof manufacturingCommandBodySchema
>;
export type ManufacturingPieceOutcome = z.infer<
  typeof manufacturingPieceOutcomeSchema
>;
export type ManufacturingOrderOutcome = z.infer<
  typeof manufacturingOrderOutcomeSchema
>;
export type ManufacturingCommandReceipt = z.infer<
  typeof manufacturingCommandReceiptSchema
>;
export type ManufacturingCommandOutcome = z.infer<
  typeof manufacturingCommandOutcomeSchema
>;
export type ManufacturingCommandData = z.infer<
  typeof manufacturingCommandDataSchema
>;
