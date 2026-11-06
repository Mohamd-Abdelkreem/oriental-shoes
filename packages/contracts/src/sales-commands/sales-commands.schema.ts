import { z } from "zod";
import { salesOrderCommandDataSchema } from "../sales-orders/sales-orders.schema.ts";
import { customerCommandDataSchema } from "../customers/customers.schema.ts";
import { draftCommandDataSchema } from "../sales-drafts/sales-drafts.schema.ts";

export const salesCommandDataSchema = z.discriminatedUnion("kind", [
  customerCommandDataSchema,
  draftCommandDataSchema,
  salesOrderCommandDataSchema,
]);
export type SalesCommandData = z.infer<typeof salesCommandDataSchema>;
