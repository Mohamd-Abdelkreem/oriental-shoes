import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
  MAX_DRAFT_PIECES,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { salesBusinessNumberSchema } from "../sales-orders/sales-order-values.schema.ts";
import {
  manufacturingCommandDataSchema,
  manufacturingCommandOperationSchema,
  manufacturingDepartmentSchema,
  manufacturingPieceOutcomeSchema,
} from "./manufacturing-command.schema.ts";

export const manufacturingActivityEventSchema = z
  .object({
    id: salesUuidSchema,
    commandId: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: salesBusinessNumberSchema,
    department: manufacturingDepartmentSchema,
    operation: manufacturingCommandOperationSchema,
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
    pieces: z
      .array(manufacturingPieceOutcomeSchema)
      .min(1)
      .max(MAX_DRAFT_PIECES),
    destination: z.enum(["PRODUCTION", "QUALITY"]).nullable(),
  })
  .strict()
  .refine((event) => {
    const destination =
      event.operation === "COMPLETE_TRANSFER"
        ? event.department === "CUTTING"
          ? "PRODUCTION"
          : "QUALITY"
        : null;
    return (
      event.destination === destination &&
      manufacturingCommandDataSchema.safeParse({
        kind: "manufacturing-command",
        replayed: true,
        receipt: {
          commandId: event.commandId,
          operation: event.operation,
          department: event.department,
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
              pieces: event.pieces,
            },
          ],
        },
      }).success
    );
  }, "Activity must represent the exact accepted order outcome and normal destination");

export type ManufacturingActivityEvent = z.infer<
  typeof manufacturingActivityEventSchema
>;
