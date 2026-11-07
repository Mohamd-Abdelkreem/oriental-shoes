import { z } from "zod";
import {
  salesUuidSchema,
  submitContactBodySchema,
  contactChangesSchema,
  type SalesOrderDto,
  type SubmitContactBody,
} from "@template/contracts";
import type { ApprovalFormBase } from "@/features/approval/model/approval-form.model";

export const salesContactFormSchema = z
  .object({
    model: salesUuidSchema.nullable(),
    size: salesUuidSchema.nullable(),
    leatherBase: salesUuidSchema.nullable(),
    sole: salesUuidSchema.nullable(),
    contactNotes: submitContactBodySchema.options[0].shape.contactNotes,
  })
  .strict();
export type SalesContactFormValues = z.infer<typeof salesContactFormSchema>;
export type ContactDirtyFields = Readonly<
  Partial<Record<"model" | "size" | "leatherBase" | "sole", boolean>>
>;
const fields = ["model", "size", "leatherBase", "sole"] as const;
export const toContactChanges = (
  values: SalesContactFormValues,
  dirtyFields: ContactDirtyFields,
  currentPiece: SalesOrderDto["pieces"][number],
): Extract<SubmitContactBody, { kind: "AMEND" }>["changes"] => {
  const selected: Partial<Record<(typeof fields)[number], string | null>> = {};
  for (const field of fields) {
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
