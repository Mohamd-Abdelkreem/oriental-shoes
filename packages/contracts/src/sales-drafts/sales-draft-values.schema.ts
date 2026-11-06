import { z } from "zod";

export const salesOrderTypeSchema = z.enum([
  "SHOP",
  "EXTERNAL",
  "REPAIR",
  "GIFT",
  "READY",
  "ACCESSORY",
  "ADJUSTMENT",
]);
export type SalesOrderType = z.infer<typeof salesOrderTypeSchema>;

export const salesUuidSchema = z
  .uuid()
  .transform((value) => value.toLowerCase());
export const salesVersionSchema = z.number().int().min(1).max(2_147_483_647);
export const salesInstantSchema = z.iso.datetime({ offset: true });
export const MAX_DRAFT_PIECES = 200;
export const MAX_DRAFT_CAPTURE_BYTES = 262_144;
