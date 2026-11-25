import type { FactoryOrderProjection } from "@template/contracts";
import type { ProductLine } from "@/features/prototype/state/mvp-types";
import { formatPieceSequence } from "../paper/paper-options";

export function toSubmittedPaperLine(
  piece: FactoryOrderProjection["pieces"][number],
  index: number,
): ProductLine {
  return {
    id: piece.id,
    pieceNumber: formatPieceSequence(index),
    quantity: 1,
    isDeleted: piece.cancelledAt !== null,
    model: piece.model ?? "",
    size: piece.size ?? "",
    leatherBase: piece.leatherBase ?? "",
    decoration: piece.decoration ?? "",
    decorationColor: piece.decorationColor ?? "",
    faceRight: piece.faceRight ?? "",
    faceLeft: piece.faceLeft ?? "",
    mixing: piece.mixing ?? "",
    face: piece.face ?? "",
    sole: piece.sole ?? "",
    soleAddition: piece.soleAddition ?? "",
    soleColor: piece.soleColor ?? "",
    additions: piece.additions ?? "",
    aField: piece.aField ?? "",
    paperCodes: piece.paperCodes,
    fField: piece.fField ?? "",
    sideNotes: piece.sideNotes ?? "",
  };
}
