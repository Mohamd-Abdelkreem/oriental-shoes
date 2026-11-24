import type {
  FactoryOrderPiece,
  SalesOrderTrackingData,
} from "@template/contracts";
import { formatPieceSequence } from "../paper/paper-options";

type PieceSpecifications = Pick<
  FactoryOrderPiece,
  | "model"
  | "size"
  | "leatherBase"
  | "decoration"
  | "face"
  | "sole"
  | "sideNotes"
>;

export type OrderTrackingPiece = Readonly<
  SalesOrderTrackingData["pieces"][number] &
    PieceSpecifications & { label: string }
>;

export function toTrackingPieceDetails(
  piece: PieceSpecifications & { position: number },
) {
  return {
    label: formatPieceSequence(piece.position - 1),
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    decoration: piece.decoration,
    face: piece.face,
    sole: piece.sole,
    sideNotes: piece.sideNotes,
  };
}

export function toFactoryTrackingPiece(
  piece: FactoryOrderPiece,
): OrderTrackingPiece {
  return {
    pieceId: piece.id,
    stage: piece.stage,
    workState: piece.workState,
    receivedAt: piece.receivedAt,
    cancelledAt: piece.cancelledAt,
    cancellationReason: piece.cancellationReason,
    ...toTrackingPieceDetails(piece),
  };
}
