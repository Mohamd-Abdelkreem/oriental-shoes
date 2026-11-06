import { z } from "zod";
import { customerCommandDataSchema } from "../customers/customers.schema.ts";
import { draftCommandDataSchema } from "../sales-drafts/sales-drafts.schema.ts";

export const salesCommandDataSchema = z.discriminatedUnion("kind", [
  customerCommandDataSchema,
  draftCommandDataSchema,
]);
export type SalesCommandData = z.infer<typeof salesCommandDataSchema>;
