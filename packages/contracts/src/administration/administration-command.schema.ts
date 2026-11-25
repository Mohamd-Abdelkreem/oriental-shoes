import { z } from "zod";

import { salesCommandActorSchema } from "../sales-commands/command-receipt.schema.ts";
import {
  customerCaptureSchema,
  customerPatchSchema,
  customerPhoneSchema,
} from "../customers/customers.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { draftReplacementSchema } from "../sales-drafts/sales-drafts.schema.ts";
import {
  contactChangesSchema,
  contactSpecificationsSchema,
  contactValuesSchema,
} from "../approval/contact-specifications.schema.ts";
import {
  currentOrderCountsSchema,
  salesOrderMoneySchema,
} from "../sales-orders/order-facts.schema.ts";
import {
  orderPieceStageSchema,
  orderWorkStateSchema,
  salesOrderStatusSchema,
} from "../sales-orders/sales-order-values.schema.ts";

export const administrationOperationSchema = z.enum([
  "ADMIN_CANCEL",
  "ADMIN_CORRECT",
]);
const correctionFields = {
  generalNotes: draftReplacementSchema.shape.generalNotes,
  customerName: customerCaptureSchema.shape.name,
  customerPhone: customerPhoneSchema,
  customerEmail: customerPatchSchema.shape.email.unwrap(),
  customerAddress: customerPatchSchema.shape.address.unwrap(),
};
const draftHeaders = draftReplacementSchema.shape;
const paperHeaders = z.strictObject({
  deliveryDate: draftHeaders.deliveryDate,
  responsibleSignature: draftHeaders.responsibleSignature,
  repairNote: draftHeaders.repairNote,
  adjustmentRequested: draftHeaders.adjustmentRequested,
  adjustmentReason: draftHeaders.adjustmentReason,
  adjustmentActionTaken: draftHeaders.adjustmentActionTaken,
});
const paperPieceValuesSchema = contactValuesSchema.safeExtend({
  pieceId: salesUuidSchema,
  specifications: contactSpecificationsSchema,
});
const distinctPaperPieces = (pieces: readonly { pieceId: string }[]) =>
  new Set(pieces.map(({ pieceId }) => pieceId)).size === pieces.length;
export const administrationPaperCorrectionSchema = paperHeaders
  .partial()
  .extend({
    pieces: z
      .array(
        z.strictObject({
          pieceId: salesUuidSchema,
          changes: contactChangesSchema,
        }),
      )
      .max(MAX_DRAFT_PIECES)
      .refine(distinctPaperPieces, "Piece identities must be distinct")
      .optional(),
  });
export const administrationPaperValuesSchema = paperHeaders.extend({
  pieces: z
    .array(paperPieceValuesSchema)
    .max(MAX_DRAFT_PIECES)
    .refine(distinctPaperPieces),
});
export const administrationCorrectionValuesSchema = z
  .object({
    ...correctionFields,
    paper: administrationPaperValuesSchema.optional(),
  })
  .strict();
export const administrationCorrectionPatchSchema = z
  .strictObject({
    ...correctionFields,
    paper: administrationPaperCorrectionSchema,
  })
  .partial()
  .refine(
    (patch) => Object.values(patch).some((field) => field !== undefined),
    "Provide at least one permitted field",
  );

const uniqueSelectionSchema = z
  .array(salesUuidSchema)
  .min(1)
  .max(MAX_DRAFT_PIECES)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Piece identities must be distinct",
  )
  .transform((ids) => ids.toSorted());
const commonCommandFields = {
  commandId: salesUuidSchema,
  orderId: salesUuidSchema,
  expectedVersion: salesVersionSchema.refine(
    (version) => version < 2_147_483_647,
    "Order version is exhausted",
  ),
};
const commandIntentSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...commonCommandFields,
      operation: z.literal("ADMIN_CANCEL"),
      scope: z.enum(["ORDER", "ITEM", "QUANTITY"]),
      pieceIds: uniqueSelectionSchema,
      reason: draftReplacementSchema.shape.generalNotes
        .nullish()
        .transform((reason) => reason ?? null),
    })
    .strict()
    .refine(
      (command) => command.scope !== "ITEM" || command.pieceIds.length === 1,
      "Item scope requires one physical piece",
    ),
  z
    .object({
      ...commonCommandFields,
      operation: z.literal("ADMIN_CORRECT"),
      patch: administrationCorrectionPatchSchema,
      reason: z.string().trim().pipe(nonEmptyBoundedString(4000)),
    })
    .strict(),
]);
export const administrationCommandBodySchema = z
  .custom<z.input<typeof commandIntentSchema>>(
    (input) =>
      new TextEncoder().encode(JSON.stringify(input)).byteLength <= 65_536,
    "Command exceeds the serialized input limit",
  )
  .pipe(commandIntentSchema);

const retainedPieceSchema = z
  .object({
    id: salesUuidSchema,
    stage: orderPieceStageSchema,
    workState: orderWorkStateSchema,
    issueId: salesUuidSchema.nullable(),
    currentWorkVisitId: salesUuidSchema.nullable(),
    receivedAt: salesInstantSchema.nullable(),
    cancelledAt: salesInstantSchema.nullable(),
    cancellationReason: draftReplacementSchema.shape.generalNotes,
  })
  .strict()
  .refine(
    (piece) =>
      piece.stage === "CANCELLED"
        ? piece.workState === "BLOCKED" &&
          piece.cancelledAt !== null &&
          piece.cancellationReason !== null &&
          piece.issueId === null &&
          piece.currentWorkVisitId === null
        : piece.cancelledAt === null && piece.cancellationReason === null,
    "Cancellation facts must agree with physical state",
  );
const returnProofSchema = z
  .object({
    decisionId: salesUuidSchema,
    reason: nonEmptyBoundedString(4000),
    returnedAt: salesInstantSchema,
    version: salesVersionSchema,
  })
  .strict();
export const administrationCommandFactsSchema = z
  .object({
    version: salesVersionSchema,
    status: salesOrderStatusSchema,
    counts: currentOrderCountsSchema,
    money: salesOrderMoneySchema,
    correction: administrationCorrectionValuesSchema,
    pieces: z.array(retainedPieceSchema).min(1).max(MAX_DRAFT_PIECES),
    returnProof: returnProofSchema.nullable(),
  })
  .strict()
  .refine((facts) => {
    const cancelled = facts.pieces.filter(
      (piece) => piece.stage === "CANCELLED",
    ).length;
    const received = facts.pieces.filter(
      (piece) => piece.stage !== "CANCELLED" && piece.receivedAt !== null,
    ).length;
    return (
      new Set(facts.pieces.map((piece) => piece.id)).size ===
        facts.pieces.length &&
      facts.counts.original === facts.pieces.length &&
      facts.counts.cancelled === cancelled &&
      facts.counts.received === received &&
      (facts.status === "RETURNED"
        ? facts.returnProof?.version === facts.version
        : facts.returnProof === null) &&
      (facts.counts.active === 0
        ? facts.status === "CANCELLED" && facts.money.total === "0.00"
        : facts.status !== "CANCELLED")
    );
  }, "Retained facts must match physical membership and current return proof");

const receiptSchema = z
  .object({
    commandId: salesUuidSchema,
    operation: administrationOperationSchema,
    orderId: salesUuidSchema,
    beforeVersion: salesVersionSchema,
    afterVersion: salesVersionSchema,
    actor: salesCommandActorSchema.refine(
      (actor) => actor.role === "ADMIN",
      "Administrator authority is required",
    ),
    occurredAt: salesInstantSchema,
  })
  .strict()
  .refine(
    (receipt) => receipt.afterVersion === receipt.beforeVersion + 1,
    "Command versions must advance exactly once",
  );
const retainedSelectionSchema = z
  .array(salesUuidSchema)
  .max(MAX_DRAFT_PIECES)
  .refine(
    (ids) =>
      ids.every((id, index) => index === 0 || id > (ids[index - 1] ?? "")),
    "Retained selection must be sorted and distinct",
  );
const resultSchema = z
  .object({
    orderId: salesUuidSchema,
    version: salesVersionSchema,
    status: salesOrderStatusSchema,
    counts: currentOrderCountsSchema,
    money: salesOrderMoneySchema,
    correction: administrationCorrectionValuesSchema,
    pieceIds: retainedSelectionSchema,
  })
  .strict();

const sameFacts = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const matchesRecordedResult = (command: {
  receipt: z.infer<typeof receiptSchema>;
  result: z.infer<typeof resultSchema>;
  before: z.infer<typeof administrationCommandFactsSchema>;
  after: z.infer<typeof administrationCommandFactsSchema>;
}): boolean => {
  const { receipt, result, before, after } = command;
  return (
    receipt.orderId === result.orderId &&
    receipt.beforeVersion === before.version &&
    receipt.afterVersion === after.version &&
    result.version === after.version &&
    result.status === after.status &&
    sameFacts(result.counts, after.counts) &&
    sameFacts(result.money, after.money) &&
    sameFacts(result.correction, after.correction) &&
    before.money.paidAmount === after.money.paidAmount &&
    (after.returnProof === null
      ? before.returnProof === null || after.status === "CANCELLED"
      : before.returnProof !== null &&
        before.returnProof.decisionId === after.returnProof.decisionId &&
        before.returnProof.reason === after.returnProof.reason &&
        before.returnProof.returnedAt === after.returnProof.returnedAt) &&
    before.pieces.length === after.pieces.length &&
    before.pieces.every((piece, index) => piece.id === after.pieces[index]?.id)
  );
};
const matchesOperation = (command: {
  receipt: z.infer<typeof receiptSchema>;
  result: z.infer<typeof resultSchema>;
  before: z.infer<typeof administrationCommandFactsSchema>;
  after: z.infer<typeof administrationCommandFactsSchema>;
}): boolean => {
  const { receipt, result, before, after } = command;
  if (receipt.operation === "ADMIN_CORRECT")
    return (
      result.pieceIds.length === 0 &&
      before.status === after.status &&
      sameFacts(before.pieces, after.pieces) &&
      sameFacts(before.money, after.money) &&
      !sameFacts(before.correction, after.correction)
    );
  if (
    result.pieceIds.length === 0 ||
    !sameFacts(before.correction, after.correction)
  )
    return false;
  const selected = new Set(result.pieceIds);
  return (
    result.pieceIds.every((id) =>
      before.pieces.some(
        (piece) => piece.id === id && piece.stage !== "CANCELLED",
      ),
    ) &&
    before.pieces.every((piece, index) => {
      const next = after.pieces[index];
      return (
        next !== undefined &&
        (selected.has(piece.id)
          ? next.stage === "CANCELLED" &&
            next.cancelledAt === receipt.occurredAt &&
            next.receivedAt === piece.receivedAt
          : sameFacts(piece, next))
      );
    })
  );
};
export const administrationCommandDataSchema = z
  .object({
    receipt: receiptSchema,
    replayed: z.boolean(),
    result: resultSchema,
    before: administrationCommandFactsSchema,
    after: administrationCommandFactsSchema,
  })
  .strict()
  .refine(
    matchesRecordedResult,
    "Command result must match its receipt and retained facts",
  )
  .refine(
    matchesOperation,
    "Recorded effects must match the administrative operation",
  );

export type AdministrationOperation = z.infer<
  typeof administrationOperationSchema
>;
export type AdministrationCorrectionValues = z.infer<
  typeof administrationCorrectionValuesSchema
>;
export type AdministrationPaperCorrection = z.infer<
  typeof administrationPaperCorrectionSchema
>;
export type AdministrationPaperValues = z.infer<
  typeof administrationPaperValuesSchema
>;
export type AdministrationCorrectionPatch = z.infer<
  typeof administrationCorrectionPatchSchema
>;
export type AdministrationCommandBody = z.infer<
  typeof administrationCommandBodySchema
>;
export type AdministrationCommandBodyInput = z.input<
  typeof administrationCommandBodySchema
>;
export type AdministrationCommandFacts = z.infer<
  typeof administrationCommandFactsSchema
>;
export type AdministrationCommandData = z.infer<
  typeof administrationCommandDataSchema
>;
