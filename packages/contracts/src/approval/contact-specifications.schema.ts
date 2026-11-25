import { z } from "zod";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  salesUuidSchema,
  piecePaperCodesSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { draftPieceSchema } from "../sales-drafts/sales-drafts.schema.ts";

export const contactCoreFields = [
  "model",
  "size",
  "leatherBase",
  "sole",
] as const;
export const contactExtraCatalogFields = [
  "decoration",
  "decorationColor",
  "soleAddition",
  "soleColor",
  "aField",
  "fField",
] as const;
export const contactCatalogFields = [
  ...contactCoreFields,
  ...contactExtraCatalogFields,
] as const;
const contactTextSchema = draftPieceSchema.pick({
  faceRight: true,
  faceLeft: true,
  mixing: true,
  face: true,
  additions: true,
  sideNotes: true,
});
export const contactTextFields = contactTextSchema.keyof().options;
const optionalSelection = salesUuidSchema.nullable();
const extraSelectionsSchema = z.strictObject({
  decoration: optionalSelection,
  decorationColor: optionalSelection,
  soleAddition: optionalSelection,
  soleColor: optionalSelection,
  aField: optionalSelection,
  fField: optionalSelection,
});
export const contactSpecificationsSchema = contactTextSchema.extend({
  decoration: nonEmptyBoundedString(200),
  decorationColor: draftPieceSchema.shape.decorationColor,
  soleAddition: draftPieceSchema.shape.soleAddition,
  soleColor: draftPieceSchema.shape.soleColor,
  aField: draftPieceSchema.shape.aField,
  fField: draftPieceSchema.shape.fField,
  paperCodes: piecePaperCodesSchema,
  catalogSelections: extraSelectionsSchema,
});
export const contactChangesSchema = extraSelectionsSchema
  .extend({
    ...contactTextSchema.shape,
    model: salesUuidSchema,
    size: salesUuidSchema,
    leatherBase: salesUuidSchema,
    decoration: salesUuidSchema,
    sole: optionalSelection,
    paperCodes: piecePaperCodesSchema,
  })
  .partial();
export type ContactSpecifications = z.infer<typeof contactSpecificationsSchema>;
const capturedLabel = nonEmptyBoundedString(200);
export const contactValuesSchema = z
  .object({
    model: capturedLabel,
    size: capturedLabel,
    leatherBase: capturedLabel,
    sole: capturedLabel.nullable(),
    specifications: contactSpecificationsSchema.optional(),
    catalogSelections: z
      .object({
        model: salesUuidSchema.nullable(),
        size: salesUuidSchema.nullable(),
        leatherBase: salesUuidSchema.nullable(),
        sole: salesUuidSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (values) => values.sole !== null || values.catalogSelections.sole === null,
    "A cleared floor cannot retain a catalog reference",
  );
