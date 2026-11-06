import { z } from "zod";
import { customerSummarySchema } from "../customers/customers.schema.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import {
  salesCommandActorSchema,
  salesCommandReceiptSchema,
} from "../sales-commands/command-receipt.schema.ts";
import {
  MAX_DRAFT_CAPTURE_BYTES,
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "./sales-draft-values.schema.ts";

const captureText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(
      (value) => !value.includes("\u0000"),
      "Null characters are not allowed",
    )
    .transform((value) => (value.trim().length === 0 ? null : value))
    .nullable();
const calendarDateSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
    if (year < 1 || year > 9999) return false;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Enter a real calendar date");
const paidEntrySchema = z
  .string()
  .transform((value, context) => {
    if (value.trim() === "") return null;
    if (!/^[0-9]{1,9}(?:\.[0-9]{1,2})?$/u.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Enter a nonnegative decimal with at most two decimal places",
      });
      return z.NEVER;
    }
    const [integer = "0", fraction = ""] = value.split(".");
    return `${integer.replace(/^0+(?=[0-9])/u, "")}.${fraction.padEnd(2, "0")}`;
  })
  .nullable();
const pieceFields = {
  model: captureText(200),
  size: captureText(200),
  leatherBase: captureText(200),
  decoration: captureText(200),
  decorationColor: captureText(200),
  faceRight: captureText(200),
  faceLeft: captureText(200),
  mixing: captureText(200),
  face: captureText(200),
  sole: captureText(200),
  soleAddition: captureText(200),
  soleColor: captureText(200),
  additions: captureText(200),
  aField: captureText(200),
  fField: captureText(200),
  sideNotes: captureText(4000),
};
export const draftPieceCaptureSchema = z
  .object({
    id: salesUuidSchema,
    model: pieceFields.model.optional().default(null),
    size: pieceFields.size.optional().default(null),
    leatherBase: pieceFields.leatherBase.optional().default(null),
    decoration: pieceFields.decoration.optional().default(null),
    decorationColor: pieceFields.decorationColor.optional().default(null),
    faceRight: pieceFields.faceRight.optional().default(null),
    faceLeft: pieceFields.faceLeft.optional().default(null),
    mixing: pieceFields.mixing.optional().default(null),
    face: pieceFields.face.optional().default(null),
    sole: pieceFields.sole.optional().default(null),
    soleAddition: pieceFields.soleAddition.optional().default(null),
    soleColor: pieceFields.soleColor.optional().default(null),
    additions: pieceFields.additions.optional().default(null),
    aField: pieceFields.aField.optional().default(null),
    fField: pieceFields.fField.optional().default(null),
    sideNotes: pieceFields.sideNotes.optional().default(null),
  })
  .strict();
const pieceReplacementSchema = z
  .object({ id: salesUuidSchema, ...pieceFields })
  .strict();
const headerFields = {
  type: salesOrderTypeSchema,
  customerId: salesUuidSchema.nullable(),
  deliveryDate: calendarDateSchema.nullable(),
  generalNotes: captureText(4000),
  responsibleSignature: captureText(150),
  repairNote: captureText(4000),
  adjustmentRequested: captureText(4000),
  adjustmentReason: captureText(4000),
  adjustmentActionTaken: captureText(4000),
  paidAmount: paidEntrySchema,
};
const distinctPieces = (value: { pieces: readonly { id: string }[] }) =>
  new Set(value.pieces.map((piece) => piece.id)).size === value.pieces.length;
const boundedCapture = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength <=
  MAX_DRAFT_CAPTURE_BYTES;
export const draftCaptureSchema = z
  .object({
    type: headerFields.type,
    customerId: headerFields.customerId.optional().default(null),
    deliveryDate: headerFields.deliveryDate.optional().default(null),
    generalNotes: headerFields.generalNotes.optional().default(null),
    responsibleSignature: headerFields.responsibleSignature
      .optional()
      .default(null),
    repairNote: headerFields.repairNote.optional().default(null),
    adjustmentRequested: headerFields.adjustmentRequested
      .optional()
      .default(null),
    adjustmentReason: headerFields.adjustmentReason.optional().default(null),
    adjustmentActionTaken: headerFields.adjustmentActionTaken
      .optional()
      .default(null),
    paidAmount: headerFields.paidAmount.optional().default(null),
    pieces: z.array(draftPieceCaptureSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(distinctPieces, {
    message: "Piece identities must be distinct",
    path: ["pieces"],
  })
  .refine(boundedCapture, "Draft capture exceeds its UTF-8 limit");
export const draftReplacementSchema = z
  .object({
    ...headerFields,
    pieces: z.array(pieceReplacementSchema).min(1).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(distinctPieces, {
    message: "Piece identities must be distinct",
    path: ["pieces"],
  })
  .refine(boundedCapture, "Draft capture exceeds its UTF-8 limit");
export const createDraftBodySchema = z
  .object({ commandId: salesUuidSchema, draft: draftCaptureSchema })
  .strict();
export const saveDraftBodySchema = z
  .object({
    commandId: salesUuidSchema,
    expectedVersion: salesVersionSchema,
    draft: draftReplacementSchema,
  })
  .strict();
export const draftPieceSchema = z
  .object({
    id: salesUuidSchema,
    position: z.number().int().positive(),
    quantity: z.literal(1),
    ...pieceFields,
  })
  .strict();
const ownerSchema = z
  .object({ id: salesUuidSchema, fullName: nonEmptyBoundedString(150) })
  .strict();
const pricingSchema = z
  .object({
    availability: z.literal("unavailable"),
    reason: z.literal("P03_NOT_IMPLEMENTED"),
  })
  .strict();
const submissionSchema = z
  .object({ available: z.literal(false), reason: z.literal("P03_NOT_READY") })
  .strict();
const draftObjectSchema = z
  .object({
    id: salesUuidSchema,
    version: salesVersionSchema,
    status: z.literal("DRAFT"),
    owner: ownerSchema,
    type: salesOrderTypeSchema,
    customer: customerSummarySchema.nullable(),
    deliveryDate: headerFields.deliveryDate,
    generalNotes: headerFields.generalNotes,
    responsibleSignature: headerFields.responsibleSignature,
    repairNote: headerFields.repairNote,
    adjustmentRequested: headerFields.adjustmentRequested,
    adjustmentReason: headerFields.adjustmentReason,
    adjustmentActionTaken: headerFields.adjustmentActionTaken,
    paidAmount: paidEntrySchema,
    pieces: z.array(draftPieceSchema).min(1).max(MAX_DRAFT_PIECES),
    createdAt: salesInstantSchema,
    updatedAt: salesInstantSchema,
    pricing: pricingSchema,
    submission: submissionSchema,
  })
  .strict();
export const draftSchema = draftObjectSchema.refine(distinctPieces, {
  message: "Piece identities must be distinct",
  path: ["pieces"],
});
export const draftDataSchema = z.object({ draft: draftSchema }).strict();
export const draftSummarySchema = draftObjectSchema
  .omit({
    generalNotes: true,
    responsibleSignature: true,
    repairNote: true,
    adjustmentRequested: true,
    adjustmentReason: true,
    adjustmentActionTaken: true,
    paidAmount: true,
    pieces: true,
  })
  .extend({ pieceCount: z.number().int().min(1).max(MAX_DRAFT_PIECES) });
export const customerDraftsQuerySchema = z
  .object({
    ...paginationQueryFields,
    limit: paginationQueryFields.limit.pipe(z.number().int().max(25)),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const customerDraftCardSchema = draftSummarySchema.extend({
  generalNotes: headerFields.generalNotes,
  pieces: z
    .array(
      draftPieceSchema.pick({
        id: true,
        position: true,
        quantity: true,
        model: true,
        size: true,
        leatherBase: true,
      }),
    )
    .min(1)
    .max(MAX_DRAFT_PIECES),
});
export const customerDraftsDataSchema = z
  .object({
    drafts: z.array(customerDraftCardSchema).max(25),
    pagination: paginationMetaSchema,
  })
  .strict();
export type CustomerDraftsQuery = z.infer<typeof customerDraftsQuerySchema>;
export type CustomerDraftsQueryInput = z.input<
  typeof customerDraftsQuerySchema
>;
export type CustomerDraftCard = z.infer<typeof customerDraftCardSchema>;
export type CustomerDraftsData = z.infer<typeof customerDraftsDataSchema>;

const searchSchema = z
  .string()
  .trim()
  .max(150)
  .refine((value) => !value.includes("\u0000"))
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .optional();
export const draftListQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    type: salesOrderTypeSchema.optional(),
    customerId: salesUuidSchema.optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const draftListDataSchema = z
  .object({
    drafts: z.array(draftSummarySchema).max(100),
    pagination: paginationMetaSchema,
    totalDrafts: z.number().int().min(0),
    totalPieces: z.number().int().min(0),
  })
  .strict();
export const draftParamsSchema = z
  .object({ draftId: salesUuidSchema })
  .strict();
export const draftChangesQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const draftChangeSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: z.enum(["CREATE_DRAFT", "SAVE_DRAFT"]),
    draftId: salesUuidSchema,
    actor: salesCommandActorSchema,
    occurredAt: salesInstantSchema,
    beforeVersion: salesVersionSchema.nullable(),
    afterVersion: salesVersionSchema,
    changedFields: z
      .array(
        z.enum([
          "type",
          "customerId",
          "deliveryDate",
          "generalNotes",
          "responsibleSignature",
          "repairNote",
          "adjustmentRequested",
          "adjustmentReason",
          "adjustmentActionTaken",
          "paidAmount",
          "pieces",
        ]),
      )
      .max(11),
    addedPieceIds: z.array(salesUuidSchema).max(MAX_DRAFT_PIECES),
    removedPieceIds: z.array(salesUuidSchema).max(MAX_DRAFT_PIECES),
  })
  .strict();
export const draftChangesDataSchema = z
  .object({
    changes: z.array(draftChangeSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const draftCommandDataSchema = z
  .object({
    kind: z.literal("draft"),
    receipt: salesCommandReceiptSchema,
    replayed: z.boolean(),
    savedDraft: draftSchema,
  })
  .strict()
  .refine(
    (data) =>
      (data.receipt.operation === "CREATE_DRAFT" ||
        data.receipt.operation === "SAVE_DRAFT") &&
      data.receipt.resourceId === data.savedDraft.id &&
      data.receipt.afterVersion === data.savedDraft.version,
    { message: "Draft result must match its receipt", path: ["receipt"] },
  );
export type DraftPieceCapture = z.infer<typeof draftPieceCaptureSchema>;
export type DraftCapture = z.infer<typeof draftCaptureSchema>;
export type CreateDraftBody = z.infer<typeof createDraftBodySchema>;
export type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;
export type DraftPieceDto = z.infer<typeof draftPieceSchema>;
export type DraftDto = z.infer<typeof draftSchema>;
export type DraftData = z.infer<typeof draftDataSchema>;
export type DraftSummary = z.infer<typeof draftSummarySchema>;
export type DraftListQuery = z.infer<typeof draftListQuerySchema>;
export type DraftListData = z.infer<typeof draftListDataSchema>;
export type DraftParams = z.infer<typeof draftParamsSchema>;
export type DraftChangesQuery = z.infer<typeof draftChangesQuerySchema>;
export type DraftChange = z.infer<typeof draftChangeSchema>;
export type DraftChangesData = z.infer<typeof draftChangesDataSchema>;
export type DraftCommandData = z.infer<typeof draftCommandDataSchema>;
export type DraftPieceCaptureInput = z.input<typeof draftPieceCaptureSchema>;
export type DraftCaptureInput = z.input<typeof draftCaptureSchema>;
export type DraftListQueryInput = z.input<typeof draftListQuerySchema>;
export type DraftChangesQueryInput = z.input<typeof draftChangesQuerySchema>;
