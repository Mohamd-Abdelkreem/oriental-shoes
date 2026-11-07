import {
  salesOrderTrackingDataSchema,
  type ApprovalOrderData,
} from "@template/contracts";
import {
  toAuthoritativeTracking,
  type AuthoritativeOrderTracking,
} from "@/features/sales/model/order-view.model";

export const toApprovalTracking = (
  data: ApprovalOrderData,
): AuthoritativeOrderTracking => {
  const { order } = data;
  const tracking = salesOrderTrackingDataSchema.parse({
    orderId: order.id,
    orderVersion: order.version,
    counts: order.counts,
    pieces: order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
  });
  return toAuthoritativeTracking(order, tracking);
};
