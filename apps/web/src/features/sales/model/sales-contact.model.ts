import { z } from "zod";
import {
  salesUuidSchema,
  submitContactBodySchema,
  contactChangesSchema,
  type SalesOrderDto,
  type SubmitContactBody,
} from "@template/contracts";
import type { ApprovalFormBase } from "@/features/approval/model/approval-form.model";

export const salesContactRoute = (orderId: string, issueId: string) =>
  `/sales/orders/${orderId}?contact=${issueId}` as const;

export const salesContactFormSchema = z
  .object({
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
export type ContactDirtyFields = Readonly<
  Partial<Record<"model" | "size" | "leatherBase" | "sole", boolean>>
>;
export const salesContactFields = [
  "model",
  "size",
  "leatherBase",
  "sole",
] as const;
export type SalesContactField = (typeof salesContactFields)[number];
export const toContactChanges = (
  values: SalesContactFormValues,
  dirtyFields: ContactDirtyFields,
  currentPiece: SalesOrderDto["pieces"][number],
): Extract<SubmitContactBody, { kind: "AMEND" }>["changes"] => {
  const selected: Partial<Record<SalesContactField, string | null>> = {};
  for (const field of salesContactFields) {
    if (dirtyFields[field] !== true) continue;
    const next = values[field],
      current = currentPiece.catalogSelections?.[field] ?? null;
    if (next !== current || next === null) selected[field] = next;
  }
  return contactChangesSchema.parse(selected);
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
