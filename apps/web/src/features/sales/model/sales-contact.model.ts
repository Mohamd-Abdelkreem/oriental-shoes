import { z } from "zod";
import {
  salesUuidSchema,
  submitContactBodySchema,
  contactChangesSchema,
  contactCatalogFields,
  contactTextFields,
  type ContactChanges,
  type SalesOrderDto,
  type SubmitContactBody,
} from "@template/contracts";
import type { ApprovalFormBase } from "@/features/approval/model/approval-form.model";

export const salesContactRoute = (orderId: string, issueId: string) =>
  `/sales/orders/${orderId}?contact=${issueId}` as const;

export const salesContactFormSchema = contactChangesSchema
  .extend({
    model: salesUuidSchema.nullable(),
    size: salesUuidSchema.nullable(),
    leatherBase: salesUuidSchema.nullable(),
    sole: salesUuidSchema.nullable(),
    contactNotes: z
      .string()
      .refine((notes) => notes.trim().length > 0, {
        error: "يرجى توضيح نتيجة التواصل مع العميل في خانة الملاحظات.",
      })
      .pipe(submitContactBodySchema.options[0].shape.contactNotes),
  })
  .strict();
export type SalesContactFormValues = z.infer<typeof salesContactFormSchema>;
export type ContactDirtyFields = Readonly<{
  [K in keyof ContactChanges]?: boolean | readonly (boolean | undefined)[];
}>;
export const salesContactFields = [
  ...contactCatalogFields,
  ...contactTextFields,
] as const;
export type SalesContactField = (typeof contactCatalogFields)[number];

export const toContactChanges = (
  values: SalesContactFormValues,
  dirtyFields: ContactDirtyFields,
  currentPiece: SalesOrderDto["pieces"][number],
): ContactChanges => {
  const catalog = contactCatalogFields.flatMap((field) => {
    const next = values[field];
    const current = currentPiece.catalogSelections?.[field] ?? null;
    return dirtyFields[field] === true && (next !== current || next === null)
      ? [[field, next] as const]
      : [];
  });
  const text = contactTextFields.flatMap((field) =>
    dirtyFields[field] === true &&
    values[field] !== (currentPiece[field] ?? null)
      ? [[field, values[field]] as const]
      : [],
  );
  return contactChangesSchema.parse({
    ...Object.fromEntries([...catalog, ...text]),
    ...(values.paperCodes !== undefined &&
    values.paperCodes.join(",") !== (currentPiece.paperCodes ?? []).join(",")
      ? { paperCodes: values.paperCodes }
      : {}),
  });
};
export const toSubmitContactBody = (
  values: SalesContactFormValues,
  dirtyFields: ContactDirtyFields,
  currentPiece: SalesOrderDto["pieces"][number],
  base: ApprovalFormBase,
  kind: "AMEND" | "CANCEL_REQUEST",
): SubmitContactBody =>
  submitContactBodySchema.parse(
    kind === "CANCEL_REQUEST"
      ? { ...base, kind, contactNotes: values.contactNotes }
      : {
          ...base,
          kind,
          contactNotes: values.contactNotes,
          changes: toContactChanges(values, dirtyFields, currentPiece),
        },
  );
