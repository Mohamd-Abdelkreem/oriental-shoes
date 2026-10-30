import { piecesInStage } from "./mvp-selectors";
import { transferredPieces } from "./piece-transfer";
import type { MvpOrder, ProductLine, QuantitySegment } from "./mvp-types";

export type ManufacturingCompletion = {
  orderId: string;
  segmentId: string;
  quantity: number;
  actor: string;
};

function segmentPieces(
  order: MvpOrder,
  segment: QuantitySegment,
): ProductLine[] {
  const anchorIndex = order.items.findIndex(
    (piece) => piece.id === segment.itemId,
  );
  if (anchorIndex < 0) return [];
  const nextAnchorIndex = order.items.findIndex(
    (piece, index) =>
      index > anchorIndex &&
      order.segments.some(
        (candidate) =>
          candidate.id !== segment.id && candidate.itemId === piece.id,
      ),
  );
  // Legacy quantity segments identify their consecutive pieces by the first piece.
  return order.items
    .slice(anchorIndex, nextAnchorIndex < 0 ? undefined : nextAnchorIndex)
    .filter((piece) => !piece.isDeleted)
    .slice(0, segment.quantity);
}

function transferredSegments({
  order,
  segment,
  quantity,
  nextStage,
  remainingItemId,
}: {
  order: MvpOrder;
  segment: QuantitySegment;
  quantity: number;
  nextStage: "الإنتاج والإصلاح" | "الجودة والتغليف";
  remainingItemId: string | undefined;
}): QuantitySegment[] {
  const remaining = segment.quantity - quantity;
  return [
    ...order.segments.filter((candidate) => candidate.id !== segment.id),
    ...(remainingItemId === undefined
      ? []
      : [
          {
            ...segment,
            itemId: remainingItemId,
            quantity: remaining,
            state: "قيد التنفيذ",
          },
        ]),
    {
      ...segment,
      id: crypto.randomUUID(),
      stage: nextStage,
      quantity,
      state: "بانتظار الاستلام",
      source: segment.stage,
      worker: undefined,
      startedAt: undefined,
      completedAt: undefined,
    },
  ];
}

export function manufacturingCompletion(
  order: MvpOrder,
  segment: QuantitySegment,
  quantity: number,
):
  | { order: MvpOrder; nextStage: "الإنتاج والإصلاح" | "الجودة والتغليف" }
  | undefined {
  if (
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > segment.quantity
  )
    return undefined;
  if (segment.stage !== "القص" && segment.stage !== "الإنتاج والإصلاح")
    return undefined;
  const pieces = segmentPieces(order, segment);
  const sourceIds = new Set(
    piecesInStage(order, segment.stage).map((piece) => piece.id),
  );
  if (
    pieces.length !== segment.quantity ||
    pieces.some((piece) => !sourceIds.has(piece.id))
  )
    return undefined;
  const nextStage =
    segment.stage === "القص" ? "الإنتاج والإصلاح" : "الجودة والتغليف";
  return {
    nextStage,
    order: {
      ...order,
      items: transferredPieces(
        order.items,
        pieces.slice(0, quantity).map((piece) => piece.id),
        nextStage,
      ),
      segments: transferredSegments({
        order,
        segment,
        quantity,
        nextStage,
        remainingItemId: pieces[quantity]?.id,
      }),
    },
  };
}
