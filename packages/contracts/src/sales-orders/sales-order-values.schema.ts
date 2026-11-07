import { z } from "zod";

export const salesOrderStatusSchema = z.enum([
  "AWAITING_APPROVAL",
  "RETURNED",
  "APPROVED",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "DELIVERED",
  "CANCELLED",
]);
export const orderPieceStageSchema = z.enum([
  "AWAITING_APPROVAL",
  "CUTTING",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
  "CANCELLED",
]);
export const orderWorkStateSchema = z.enum([
  "INCOMING",
  "IN_PROGRESS",
  "COMPLETED",
  "BLOCKED",
]);
export const salesBusinessNumberSchema = z
  .string()
  .max(64)
  .regex(
    /^(?:SHOP|EXTERNAL|REPAIR|GIFT|READY|ACCESSORY|ADJUSTMENT)-[0-9]{4}-[0-9]{4,19}$/u,
  );
