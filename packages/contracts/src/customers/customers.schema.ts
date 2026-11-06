import { z } from "zod";

import { emailSchema } from "../auth/auth.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import { salesCommandReceiptSchema } from "../sales-commands/command-receipt.schema.ts";
import {
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";

export const normalizeSaudiCustomerPhone = (value: string): string | null => {
  if (value.length > 64) return null;
  const cleaned = value
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "\u06f0" ? 0x06f0 : 0x0660)),
    )
    .replace(/[\s()-]/gu, "");
  const national = cleaned.startsWith("+966")
    ? cleaned.slice(4)
    : cleaned.startsWith("00966")
      ? cleaned.slice(5)
      : cleaned.startsWith("0")
        ? cleaned.slice(1)
        : "";
  return /^(?:5[013-9][0-9]{7}|1[123467][0-9]{7})$/u.test(national)
    ? `+966${national}`
    : null;
};
export const customerPhoneSchema = z
  .string()
  .max(64)
  .transform((value, context) => {
    const phone = normalizeSaudiCustomerPhone(value);
    if (phone === null) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Saudi mobile or fixed phone",
      });
      return z.NEVER;
    }
    return phone;
  });
const nameSchema = z.string().trim().pipe(nonEmptyBoundedString(150));
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .refine(
      (value) => !value.includes("\u0000"),
      "Null characters are not allowed",
    )
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();
const optionalEmail = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value === "") return null;
    const parsed = emailSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    context.addIssue({ code: "custom", message: "Enter a valid email" });
    return z.NEVER;
  })
  .nullable();
const editableFields = {
  name: nameSchema,
  phone: customerPhoneSchema,
  email: optionalEmail,
  address: optionalText(2000),
  notes: optionalText(4000),
};
export const customerCaptureSchema = z
  .object({
    ...editableFields,
    email: optionalEmail.optional().default(null),
    address: editableFields.address.optional().default(null),
    notes: editableFields.notes.optional().default(null),
  })
  .strict();
export const customerPatchSchema = z
  .object(editableFields)
  .partial()
  .strict()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "Provide at least one customer field",
  );
export const createCustomerBodySchema = z
  .object({ commandId: salesUuidSchema, customer: customerCaptureSchema })
  .strict();
export const updateCustomerBodySchema = z
  .object({
    commandId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    patch: customerPatchSchema,
  })
  .strict();
const canonicalPhone = z
  .string()
  .regex(/^\+966(?:5[013-9][0-9]{7}|1[123467][0-9]{7})$/u);
const customerSummaryFields = {
  id: salesUuidSchema,
  name: nameSchema,
  phone: canonicalPhone,
  email: z.email().max(320).nullable(),
  address: editableFields.address,
};
export const customerSummarySchema = z.object(customerSummaryFields).strict();
export const customerSchema = z
  .object({
    ...customerSummaryFields,
    notes: editableFields.notes,
    version: salesVersionSchema,
    createdAt: salesInstantSchema,
    updatedAt: salesInstantSchema,
  })
  .strict();
const search = z
  .string()
  .trim()
  .max(150)
  .refine((value) => !value.includes("\u0000"))
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .optional();
export const customerListQuerySchema = z
  .object({ ...paginationQueryFields, search })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const customerListDataSchema = z
  .object({
    customers: z
      .array(
        z
          .object({
            customer: customerSummarySchema,
            draftCount: z.number().int().min(0),
            lastDraftAt: salesInstantSchema.nullable(),
          })
          .strict(),
      )
      .max(100),
    pagination: paginationMetaSchema,
    totalCustomers: z.number().int().min(0),
  })
  .strict();
export const customerParamsSchema = z
  .object({ customerId: salesUuidSchema })
  .strict();
export const customerPhoneParamsSchema = z
  .object({ phone: customerPhoneSchema })
  .strict();
export const customerMeasurementsQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const customerMeasurementSchema = z
  .object({
    draftId: salesUuidSchema,
    pieceId: salesUuidSchema,
    owner: z
      .object({ id: salesUuidSchema, fullName: nonEmptyBoundedString(150) })
      .strict(),
    type: salesOrderTypeSchema,
    model: z.string().max(200).nullable(),
    size: z.string().max(200).nullable(),
    aField: z.string().max(200).nullable(),
    fField: z.string().max(200).nullable(),
    draftUpdatedAt: salesInstantSchema,
    source: z.literal("DRAFT"),
  })
  .strict();
export const customerMeasurementsDataSchema = z
  .object({
    measurements: z.array(customerMeasurementSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const customerDataSchema = z
  .object({
    customer: customerSchema,
    draftCount: z.number().int().min(0),
    latestDraftAt: salesInstantSchema.nullable(),
    latestMeasurement: customerMeasurementSchema.nullable(),
    submittedHistory: z
      .object({
        availability: z.literal("not_available"),
        reason: z.literal("P03_NOT_IMPLEMENTED"),
      })
      .strict(),
  })
  .strict();
export const customerCommandDataSchema = z
  .object({
    kind: z.literal("customer"),
    receipt: salesCommandReceiptSchema,
    replayed: z.boolean(),
    savedCustomer: customerSchema,
  })
  .strict()
  .refine(
    (data) =>
      (data.receipt.operation === "CREATE_CUSTOMER" ||
        data.receipt.operation === "UPDATE_CUSTOMER") &&
      data.receipt.resourceId === data.savedCustomer.id &&
      data.receipt.afterVersion === data.savedCustomer.version,
    { message: "Customer result must match its receipt", path: ["receipt"] },
  );

export type CustomerCapture = z.infer<typeof customerCaptureSchema>;
export type CustomerCaptureInput = z.input<typeof customerCaptureSchema>;
export type CustomerPatch = z.infer<typeof customerPatchSchema>;
export type CreateCustomerBody = z.infer<typeof createCustomerBodySchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type CustomerDto = z.infer<typeof customerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerListQueryInput = z.input<typeof customerListQuerySchema>;
export type CustomerListData = z.infer<typeof customerListDataSchema>;
export type CustomerParams = z.infer<typeof customerParamsSchema>;
export type CustomerPhoneParams = z.infer<typeof customerPhoneParamsSchema>;
export type CustomerMeasurementsQuery = z.infer<
  typeof customerMeasurementsQuerySchema
>;
export type CustomerMeasurementsQueryInput = z.input<
  typeof customerMeasurementsQuerySchema
>;
export type CustomerMeasurement = z.infer<typeof customerMeasurementSchema>;
export type CustomerMeasurementsData = z.infer<
  typeof customerMeasurementsDataSchema
>;
export type CustomerData = z.infer<typeof customerDataSchema>;
export type CustomerCommandData = z.infer<typeof customerCommandDataSchema>;
