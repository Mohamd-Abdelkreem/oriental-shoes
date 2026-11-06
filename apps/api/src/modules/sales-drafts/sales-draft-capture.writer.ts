import {
  catalogFieldSchema,
  MAX_DRAFT_PIECES,
  type DraftCapture,
  type DraftPieceCapture,
} from "@template/contracts";
import { Prisma } from "@template/database";
import { parseDateOnly } from "../../core/date-only.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ValidationException } from "../../core/errors/validation.error.js";
import {
  DraftNotFoundError,
  DraftPieceConflictError,
} from "./sales-drafts.errors.js";
import { classifyDraftPieces } from "./sales-drafts.rules.js";

export const toDraftCaptureHeaderValues = (
  capture: DraftCapture,
): Pick<
  Prisma.SalesDraftUncheckedCreateInput,
  | "type"
  | "customerId"
  | "deliveryDate"
  | "generalNotes"
  | "repairNote"
  | "adjustmentRequested"
  | "adjustmentReason"
  | "adjustmentActionTaken"
  | "responsibleSignature"
  | "paidAmount"
> => ({
  type: capture.type,
  customerId: capture.customerId,
  deliveryDate:
    capture.deliveryDate === null ? null : parseDateOnly(capture.deliveryDate),
  generalNotes: capture.generalNotes,
  responsibleSignature: capture.responsibleSignature,
  repairNote: capture.repairNote,
  adjustmentRequested: capture.adjustmentRequested,
  adjustmentReason: capture.adjustmentReason,
  adjustmentActionTaken: capture.adjustmentActionTaken,
  paidAmount:
    capture.paidAmount === null ? null : new Prisma.Decimal(capture.paidAmount),
});
const pieceValues = (piece: DraftPieceCapture) => ({
  model: piece.model,
  size: piece.size,
  leatherBase: piece.leatherBase,
  decoration: piece.decoration,
  decorationColor: piece.decorationColor,
  faceRight: piece.faceRight,
  faceLeft: piece.faceLeft,
  mixing: piece.mixing,
  face: piece.face,
  sole: piece.sole,
  soleAddition: piece.soleAddition,
  soleColor: piece.soleColor,
  additions: piece.additions,
  aField: piece.aField,
  fField: piece.fField,
  sideNotes: piece.sideNotes,
});
const validateSelections = async (
  tx: Prisma.TransactionClient,
  capture: DraftCapture,
) => {
  const entryIds = [
    ...new Set(
      capture.pieces.flatMap((piece) =>
        Object.values(piece.catalogSelections ?? {}).filter(
          (entryId): entryId is string => typeof entryId === "string",
        ),
      ),
    ),
  ];
  if (entryIds.length === 0) return;
  const entries = await tx.catalogEntry.findMany({
    where: { id: { in: entryIds } },
    select: { id: true, kind: true, displayValue: true },
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const errors = capture.pieces.flatMap((piece, index) =>
    catalogFieldSchema.options.flatMap((field) => {
      const entryId = piece.catalogSelections?.[field];
      if (entryId === undefined || entryId === null) return [];
      const entry = byId.get(entryId);
      return entry?.kind === field && entry.displayValue === piece[field]
        ? []
        : [
            {
              field: `body.draft.pieces.${String(index)}.catalogSelections.${field}`,
              message: "Select the matching source entry for this field.",
            },
          ];
    }),
  );
  if (errors.length > 0) throw new ValidationException(errors);
};
type CaptureWriteInput = {
  draftId: string;
  capture: DraftCapture;
  occurredAt: Date;
  mode: "create" | "replace";
};
const planCaptureWrite = async (
  tx: Prisma.TransactionClient,
  input: CaptureWriteInput,
) => {
  const { draftId, capture, mode } = input;
  if (capture.pieces.length < 1 || capture.pieces.length > MAX_DRAFT_PIECES)
    throw new ValidationException([
      {
        field: "body.draft.pieces",
        message: "A draft needs one through 200 pieces.",
      },
    ]);
  const root = await tx.salesDraft.findUnique({
    where: { id: draftId },
    select: { status: true, order: { select: { id: true } } },
  });
  if (root === null)
    throw new InternalServerError(
      "A capture writer requires its caller-created root.",
    );
  const ids = capture.pieces.map((piece) => piece.id);
  const existing = await tx.salesDraftPiece.findMany({
    where: { OR: [{ draftId, removedAt: null }, { id: { in: ids } }] },
    select: { id: true, draftId: true, removedAt: true, position: true },
  });
  const classified = classifyDraftPieces(ids, existing, draftId);
  if (classified.kind === "duplicate")
    throw new ValidationException([
      {
        field: "body.draft.pieces",
        message: "Piece identities must be distinct.",
      },
    ]);
  if (classified.kind === "foreign") throw new DraftNotFoundError();
  if (classified.kind === "removed") throw new DraftPieceConflictError();
  const plan = classified.plan;
  const currentIds = existing
    .filter((piece) => piece.draftId === draftId && piece.removedAt === null)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((piece) => piece.id);
  const structural =
    ids.length !== currentIds.length ||
    ids.some((id, index) => currentIds[index] !== id);
  if (mode === "create") {
    const prior = await tx.salesDraftPiece.findFirst({
      where: { draftId },
      select: { id: true },
    });
    if (
      prior !== null ||
      root.order !== null ||
      plan.newIds.length !== ids.length
    )
      throw new InternalServerError(
        "A new capture requires an empty root and fresh piece identities.",
      );
  } else if (root.status === "SUBMITTED" && structural) {
    throw new InternalServerError(
      "Submitted capture replacement cannot change physical membership or order.",
    );
  }
  return { ...input, root, ids, plan, structural };
};
type CaptureWritePlan = Awaited<ReturnType<typeof planCaptureWrite>>;
const replaceCaptureHeader = async (
  tx: Prisma.TransactionClient,
  context: CaptureWritePlan,
) => {
  const { draftId, capture, occurredAt, mode, root } = context;
  if (mode === "replace") {
    const header = toDraftCaptureHeaderValues(capture);
    const {
      type: _type,
      customerId: _customerId,
      paidAmount: _paidAmount,
      ...nonpriceHeader
    } = header;
    await tx.salesDraft.update({
      where: { id: draftId },
      data: {
        ...(root.status === "SUBMITTED" ? nonpriceHeader : header),
        updatedAt: occurredAt,
      },
    });
  }
};
const resequenceDraftPieces = async (
  tx: Prisma.TransactionClient,
  context: CaptureWritePlan,
) => {
  const { draftId, occurredAt, mode, structural, plan } = context;
  if (mode === "replace" && structural) {
    if (plan.removedIds.length > 0) {
      const removed = await tx.salesDraftPiece.updateMany({
        where: { draftId, id: { in: plan.removedIds }, removedAt: null },
        data: { removedAt: occurredAt, updatedAt: occurredAt },
      });
      if (removed.count !== plan.removedIds.length)
        throw new DraftNotFoundError();
    }
    const shifted = await tx.salesDraftPiece.updateMany({
      where: { draftId, removedAt: null },
      data: { position: { increment: MAX_DRAFT_PIECES } },
    });
    if (shifted.count !== plan.retainedIds.length)
      throw new DraftNotFoundError();
  }
};
const persistCapturePieces = async (
  tx: Prisma.TransactionClient,
  context: CaptureWritePlan,
) => {
  const { draftId, capture, occurredAt, root, plan, structural } = context;
  const retained = new Set(plan.retainedIds);
  const additions: Prisma.SalesDraftPieceCreateManyInput[] = [];
  for (const [index, piece] of capture.pieces.entries()) {
    const captures = pieceValues(piece),
      { decoration: _decoration, ...nonpriceCaptures } = captures;
    if (retained.has(piece.id)) {
      const changed = await tx.salesDraftPiece.updateMany({
        where: { id: piece.id, draftId, removedAt: null },
        data: {
          ...(root.status === "SUBMITTED" ? nonpriceCaptures : captures),
          ...(structural ? { position: index + 1 } : {}),
          updatedAt: occurredAt,
        },
      });
      if (changed.count !== 1) throw new DraftNotFoundError();
    } else
      additions.push({
        id: piece.id,
        draftId,
        position: index + 1,
        ...captures,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
  }
  if (additions.length > 0) {
    const added = await tx.salesDraftPiece.createMany({ data: additions });
    if (added.count !== additions.length) throw new DraftNotFoundError();
  }
};
const replaceCaptureSelections = async (
  tx: Prisma.TransactionClient,
  context: CaptureWritePlan,
) => {
  const { capture, ids, mode, root } = context;
  await tx.salesPieceCatalogSelection.deleteMany({
    where: {
      pieceId: { in: ids },
      ...(mode === "replace" && root.status === "SUBMITTED"
        ? { field: { not: "decoration" } }
        : {}),
    },
  });
  const selections = capture.pieces.flatMap((piece) =>
    catalogFieldSchema.options.flatMap((field) => {
      const entryId = piece.catalogSelections?.[field];
      return entryId === undefined ||
        entryId === null ||
        (mode === "replace" &&
          root.status === "SUBMITTED" &&
          field === "decoration")
        ? []
        : [{ pieceId: piece.id, field, entryId }];
    }),
  );
  if (selections.length > 0)
    await tx.salesPieceCatalogSelection.createMany({ data: selections });
};
export const writeDraftCapture = async (
  tx: Prisma.TransactionClient,
  input: CaptureWriteInput,
): Promise<void> => {
  const plan = await planCaptureWrite(tx, input);
  await validateSelections(tx, input.capture);
  await replaceCaptureHeader(tx, plan);
  await resequenceDraftPieces(tx, plan);
  await persistCapturePieces(tx, plan);
  await replaceCaptureSelections(tx, plan);
};
