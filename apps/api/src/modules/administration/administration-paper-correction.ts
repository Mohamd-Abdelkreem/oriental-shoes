import { isDeepStrictEqual } from "node:util";
import {
  administrationPaperValuesSchema,
  contactCatalogFields,
  type AdministrationPaperCorrection,
  type AdministrationPaperValues,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import { parseDateOnly, serializeDateOnly } from "../../core/date-only.js";
import {
  captureContactValues,
  resolveContactChanges,
  writeContactValues,
} from "../approval/approval-contact-specifications.js";
import { lockActiveCatalog } from "../catalogs/catalogs.queries.js";
import { AdministrationSelectionConflictError } from "./administration.errors.js";
import type { AdministrationRootRecord } from "./administration.types.js";

export async function planAdministrationPaper(
  tx: Prisma.TransactionClient,
  root: AdministrationRootRecord,
  patch: AdministrationPaperCorrection,
) {
  const { pieces = [], ...headers } = patch;
  const catalog = pieces.some(({ changes }) =>
    contactCatalogFields.some((field) => changes[field] != null),
  )
    ? await lockActiveCatalog(tx)
    : null;
  const byId = new Map(root.pieces.map((piece) => [piece.id, piece]));
  const changes = pieces.map(({ pieceId, changes }, index) => {
    const piece = byId.get(pieceId);
    if (!piece?.orderPiece) throw new AdministrationSelectionConflictError();
    const before = captureContactValues(piece);
    const after = resolveContactChanges(
      before,
      changes,
      catalog,
      `body.patch.paper.pieces.${String(index)}.changes`,
    );
    return { before: { pieceId, ...before }, after: { pieceId, ...after } };
  });
  changes.sort((left, right) =>
    left.before.pieceId.localeCompare(right.before.pieceId),
  );
  const before = administrationPaperValuesSchema.parse({
    deliveryDate:
      root.deliveryDate === null ? null : serializeDateOnly(root.deliveryDate),
    responsibleSignature: root.responsibleSignature,
    repairNote: root.repairNote,
    adjustmentRequested: root.adjustmentRequested,
    adjustmentReason: root.adjustmentReason,
    adjustmentActionTaken: root.adjustmentActionTaken,
    pieces: changes.map((piece) => piece.before),
  });
  const after = administrationPaperValuesSchema.parse({
    ...before,
    ...headers,
    pieces: changes.map((piece) => piece.after),
  });
  return { before, after };
}

export async function writeAdministrationPaper(
  tx: Prisma.TransactionClient,
  {
    orderId,
    before,
    after,
    occurredAt,
  }: {
    orderId: string;
    before: AdministrationPaperValues;
    after: AdministrationPaperValues;
    occurredAt: Date;
  },
) {
  const { pieces, deliveryDate, ...headers } = after;
  await tx.salesDraft.update({
    where: { id: orderId },
    data: {
      ...headers,
      deliveryDate: deliveryDate === null ? null : parseDateOnly(deliveryDate),
    },
  });
  for (const [index, previous] of before.pieces.entries()) {
    const corrected = pieces[index];
    if (corrected?.pieceId !== previous.pieceId)
      throw new AdministrationSelectionConflictError();
    if (!isDeepStrictEqual(previous, corrected))
      await writeContactValues(tx, {
        pieceId: previous.pieceId,
        current: previous,
        values: corrected,
        occurredAt,
      });
  }
}
