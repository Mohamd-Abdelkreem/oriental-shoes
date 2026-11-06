import { z } from "zod";

import { departmentSchema, userRoleSchema } from "../account/account.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";

export const salesCommandOperationSchema = z.enum([
  "CREATE_CUSTOMER",
  "UPDATE_CUSTOMER",
  "CREATE_DRAFT",
  "SAVE_DRAFT",
]);
export const salesCommandActorSchema = z
  .object({
    id: salesUuidSchema,
    fullName: nonEmptyBoundedString(150),
    role: userRoleSchema,
    department: departmentSchema.nullable(),
  })
  .strict()
  .refine((actor) => actor.role === "ADMIN" || actor.department === "SALES", {
    message: "Employee command actors must belong to sales",
    path: ["department"],
  });

export const salesCommandReceiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: salesCommandOperationSchema,
    resourceId: salesUuidSchema,
    actor: salesCommandActorSchema,
    beforeVersion: salesVersionSchema.nullable(),
    afterVersion: salesVersionSchema,
    occurredAt: salesInstantSchema,
  })
  .strict()
  .refine(
    (receipt) =>
      receipt.operation.startsWith("CREATE_")
        ? receipt.beforeVersion === null && receipt.afterVersion === 1
        : receipt.beforeVersion !== null &&
          receipt.afterVersion === receipt.beforeVersion + 1,
    {
      message: "Command revisions must agree with the operation",
      path: ["afterVersion"],
    },
  );

export const salesCommandParamsSchema = z
  .object({ commandId: salesUuidSchema })
  .strict();
export const salesEmptyQuerySchema = z.object({}).strict();
export type SalesCommandActor = z.infer<typeof salesCommandActorSchema>;
export type SalesCommandReceipt = z.infer<typeof salesCommandReceiptSchema>;
export type SalesCommandOperation = z.infer<typeof salesCommandOperationSchema>;
export type SalesCommandParams = z.infer<typeof salesCommandParamsSchema>;
