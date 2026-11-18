import type { DraftDto, PieceCatalogSelections } from "@template/contracts";
import type { Prisma } from "@template/database";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import {
  CUSTOMER_SUMMARY_SELECT,
  mapCustomerSummary,
} from "../customers/customers.mapper.js";

export const DRAFT_REFERENCE_SELECT = { select: { number: true } } as const;

export const mapDraftSequence = (
  reference: { number: bigint } | null,
): string => {
  if (reference === null)
    throw new InternalServerError("A saved draft is missing its reference.");
  return reference.number.toString();
};

export const DRAFT_SELECT = {
  id: true,
  reference: DRAFT_REFERENCE_SELECT,
  ownerId: true,
  customerId: true,
  type: true,
  status: true,
  version: true,
  deliveryDate: true,
  generalNotes: true,
  responsibleSignature: true,
  paidAmount: true,
  repairNote: true,
  adjustmentRequested: true,
  adjustmentReason: true,
  adjustmentActionTaken: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  customer: { select: CUSTOMER_SUMMARY_SELECT },
  pieces: {
    where: { removedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      quantity: true,
      model: true,
      size: true,
      leatherBase: true,
      decoration: true,
      decorationColor: true,
      faceRight: true,
      faceLeft: true,
      mixing: true,
      face: true,
      sole: true,
      soleAddition: true,
      soleColor: true,
      additions: true,
      aField: true,
      fField: true,
      sideNotes: true,
      catalogSelections: { select: { field: true, entryId: true } },
    },
  },
} as const satisfies Prisma.SalesDraftSelect;
export type DraftRecord = Prisma.SalesDraftGetPayload<{
  select: typeof DRAFT_SELECT;
}>;
const mapPaidCapture = (value: DraftRecord["paidAmount"]): string | null => {
  if (value === null) return null;
  const text = serializeDecimalToString(value);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/u.test(text))
    throw new InternalServerError("A draft has an invalid paid capture.");
  const [integer = "0", fraction = ""] = text.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
};
export type DraftReadiness = Pick<DraftDto, "pricing" | "submission">;
export const mapDraft = (
  row: DraftRecord,
  readiness: DraftReadiness,
): DraftDto => {
  if (row.status !== "DRAFT")
    throw new InternalServerError(
      "A submitted root cannot be projected as a draft.",
    );
  return {
    id: row.id,
    draftSequence: mapDraftSequence(row.reference),
    version: row.version,
    status: "DRAFT",
    owner: { id: row.owner.id, fullName: row.owner.fullName },
    type: row.type,
    customer: row.customer === null ? null : mapCustomerSummary(row.customer),
    deliveryDate: serializeNullableDateOnly(row.deliveryDate),
    generalNotes: row.generalNotes,
    responsibleSignature: row.responsibleSignature,
    repairNote: row.repairNote,
    adjustmentRequested: row.adjustmentRequested,
    adjustmentReason: row.adjustmentReason,
    adjustmentActionTaken: row.adjustmentActionTaken,
    paidAmount: mapPaidCapture(row.paidAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pricing: readiness.pricing,
    submission: readiness.submission,
    pieces: row.pieces.map((piece, index) => {
      if (piece.quantity !== 1)
        throw new InternalServerError("A draft piece has invalid quantity.");
      const catalogSelections: PieceCatalogSelections = {};
      for (const selection of piece.catalogSelections)
        catalogSelections[selection.field] = selection.entryId;
      return {
        ...(piece.catalogSelections.length === 0 ? {} : { catalogSelections }),
        id: piece.id,
        position: index + 1,
        quantity: 1,
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
      };
    }),
  };
};
