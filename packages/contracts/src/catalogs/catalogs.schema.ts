import { z } from "zod";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesUuidSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";

export const catalogFieldSchema = z.enum([
  "model",
  "size",
  "leatherBase",
  "decoration",
  "decorationColor",
  "sole",
  "soleAddition",
  "soleColor",
  "aField",
  "fField",
]);
export const pieceCatalogSelectionsSchema = z
  .object({
    model: salesUuidSchema.nullable().optional(),
    size: salesUuidSchema.nullable().optional(),
    leatherBase: salesUuidSchema.nullable().optional(),
    decoration: salesUuidSchema.nullable().optional(),
    decorationColor: salesUuidSchema.nullable().optional(),
    sole: salesUuidSchema.nullable().optional(),
    soleAddition: salesUuidSchema.nullable().optional(),
    soleColor: salesUuidSchema.nullable().optional(),
    aField: salesUuidSchema.nullable().optional(),
    fField: salesUuidSchema.nullable().optional(),
  })
  .strict();

const sourceLabelSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((label) => label.trim().length > 0 && !label.includes("\u0000"));
const sourceCellSchema = z
  .string()
  .max(16)
  .regex(/^[A-Z]+[1-9][0-9]*$/u);
const sourceShaSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const familySchema = z
  .object({
    key: z.enum([
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
    ]),
    label: sourceLabelSchema,
  })
  .strict();
export const catalogEntrySchema = z
  .object({
    id: salesUuidSchema,
    kind: catalogFieldSchema,
    sourceCell: sourceCellSchema,
    displayValue: sourceLabelSchema,
    family: familySchema.nullable(),
    position: z.number().int().positive(),
  })
  .strict()
  .refine(
    (entry) => (entry.kind === "decorationColor") === (entry.family !== null),
    {
      message: "Only decoration colors require a source family",
      path: ["family"],
    },
  );

const reviewedCounts = {
  model: 7,
  size: 55,
  leatherBase: 590,
  decoration: 14,
  decorationColor: 1010,
  sole: 12,
  soleAddition: 5,
  soleColor: 40,
  aField: 81,
  fField: 60,
} as const;
const availableCatalogSchema = z
  .object({
    availability: z.literal("available"),
    sourceId: salesUuidSchema,
    sourceSha256: sourceShaSchema,
    activatedAt: salesInstantSchema,
    entries: z.array(catalogEntrySchema).length(1874),
  })
  .strict()
  .refine((catalog) => {
    const entryIds = new Set(catalog.entries.map((entry) => entry.id));
    const sourceKeys = new Set(
      catalog.entries.map((entry) => `${entry.kind}:${entry.sourceCell}`),
    );
    return (
      entryIds.size === catalog.entries.length &&
      sourceKeys.size === catalog.entries.length &&
      catalogFieldSchema.options.every(
        (kind) =>
          catalog.entries.filter((entry) => entry.kind === kind).length ===
          reviewedCounts[kind],
      )
    );
  }, "Catalog identities and kind counts must match the reviewed mapping");
export const catalogDataSchema = z.discriminatedUnion("availability", [
  availableCatalogSchema,
  z
    .object({
      availability: z.literal("unavailable"),
      reason: z.literal("CATALOG_NOT_LOADED"),
    })
    .strict(),
]);

const quotePieceSchema = z
  .object({
    id: salesUuidSchema,
    decoration: z
      .string()
      .max(200)
      .refine((label) => !label.includes("\u0000"))
      .transform((label) => (label.trim().length === 0 ? null : label))
      .nullable(),
    catalogSelections: pieceCatalogSelectionsSchema
      .pick({ decoration: true })
      .optional(),
  })
  .strict();
export const catalogQuoteBodySchema = z
  .object({
    requestId: salesUuidSchema,
    pieces: z.array(quotePieceSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    (quote) =>
      new Set(quote.pieces.map((piece) => piece.id)).size ===
      quote.pieces.length,
    { message: "Piece identities must be distinct", path: ["pieces"] },
  );

const unitMoneySchema = z.string().regex(/^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/u);
const totalMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u)
  .pipe(
    z
      .string()
      .refine(
        (amount) => BigInt(amount.replace(".", "")) <= 19_999_999_999_800n,
      ),
  );
const pricedItemSchema = z
  .object({
    pieceId: salesUuidSchema,
    availability: z.literal("available"),
    decorationEntryId: salesUuidSchema,
    decoration: sourceLabelSchema,
    unitPrice: unitMoneySchema,
  })
  .strict();
const unpricedItemSchema = z
  .object({
    pieceId: salesUuidSchema,
    availability: z.literal("unavailable"),
    reason: z.enum([
      "CATALOG_UNAVAILABLE",
      "DECORATION_REQUIRED",
      "DECORATION_UNKNOWN",
      "DECORATION_AMBIGUOUS",
      "RATE_UNAVAILABLE",
      "RATE_AMBIGUOUS",
    ]),
  })
  .strict();
const quoteItemsSchema = z
  .array(
    z.discriminatedUnion("availability", [
      pricedItemSchema,
      unpricedItemSchema,
    ]),
  )
  .min(1)
  .max(MAX_DRAFT_PIECES);
export const catalogQuoteDataSchema = z
  .discriminatedUnion("availability", [
    z
      .object({
        availability: z.literal("available"),
        requestId: salesUuidSchema,
        sourceId: salesUuidSchema,
        fingerprint: sourceShaSchema,
        items: z.array(pricedItemSchema).min(1).max(MAX_DRAFT_PIECES),
        total: totalMoneySchema,
      })
      .strict(),
    z
      .object({
        availability: z.literal("unavailable"),
        requestId: salesUuidSchema,
        sourceId: salesUuidSchema.nullable(),
        fingerprint: z.null(),
        items: quoteItemsSchema,
        total: z.null(),
      })
      .strict()
      .refine(
        (quote) =>
          quote.items.some((entry) => entry.availability === "unavailable"),
        "An unavailable quote requires an unpriced item",
      ),
  ])
  .refine(
    (quote) =>
      new Set(quote.items.map((entry) => entry.pieceId)).size ===
      quote.items.length,
    "Quote piece identities must be distinct",
  );

export type CatalogField = z.infer<typeof catalogFieldSchema>;
export type PieceCatalogSelections = z.infer<
  typeof pieceCatalogSelectionsSchema
>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type CatalogData = z.infer<typeof catalogDataSchema>;
export type CatalogQuoteBody = z.infer<typeof catalogQuoteBodySchema>;
export type CatalogQuoteData = z.infer<typeof catalogQuoteDataSchema>;
