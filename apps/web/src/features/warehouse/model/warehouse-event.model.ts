import {
  describeOrderPieces,
  type OrderPieceLabels,
} from "@/features/orders/model/order-display-reference";
import { toOrderActivityActionLabel } from "@template/contracts";
import type {
  WarehouseCommandOperation,
  WarehouseActivityEvent,
} from "@template/contracts";

export const toWarehouseOperationLabel = (
  operation: WarehouseCommandOperation,
): string => toOrderActivityActionLabel({ kind: "warehouse", operation });
const statusLabels: Record<WarehouseActivityEvent["beforeStatus"], string> = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  RETURNED: "معاد للتعديل",
  APPROVED: "معتمد",
  READY_FOR_DELIVERY: "جاهز للتوصيل",
  OUT_FOR_DELIVERY: "خرج للتوصيل",
  DELIVERY_FAILED: "فشل التوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};
export const toWarehouseEventSummary = (
  event: WarehouseActivityEvent,
  labels?: OrderPieceLabels,
): string => {
  const parts = [
    toWarehouseOperationLabel(event.operation),
    describeOrderPieces(event.pieceIds, labels),
    `${statusLabels[event.beforeStatus]} ← ${statusLabels[event.afterStatus]}`,
    event.actor.fullName,
    `وقت التسجيل: ${event.occurredAt}`,
  ];
  const receipt = event.receiptGroup;
  if (receipt !== null) {
    parts.push("استلام فعلي مسجل");
    if (receipt.cartonCount !== null)
      parts.push(`الكراتين: ${receipt.cartonCount}`);
    if (receipt.storageLocation !== null)
      parts.push(`مكان التخزين: ${receipt.storageLocation}`);
    if (receipt.notes !== null)
      parts.push(`ملاحظات الاستلام: ${receipt.notes}`);
  }
  const attempt = event.attempt;
  if (attempt !== null) {
    parts.push(`محاولة التوصيل ${String(attempt.number)}`);
    if (attempt.deliveryNote !== null)
      parts.push(`ملاحظة التوصيل: ${attempt.deliveryNote}`);
    const outcome = attempt.outcome;
    if (outcome !== null) {
      if (outcome.kind === "DELIVERED") {
        if (outcome.recipient !== null)
          parts.push(`المستلم: ${outcome.recipient}`);
        if (outcome.deliveredAt !== null)
          parts.push(`وقت التسليم الفعلي: ${outcome.deliveredAt}`);
      } else
        parts.push(
          `عودة الطلب بالكامل إلى المستودع — السبب: ${outcome.reason}`,
        );
      if (outcome.notes !== null)
        parts.push(`ملاحظات النتيجة: ${outcome.notes}`);
    }
  }
  if (event.retry !== null) {
    parts.push("إعادة تجهيز مسجلة");
    if (event.retry.retryDate !== null)
      parts.push(`موعد إعادة التوصيل: ${event.retry.retryDate}`);
    if (event.retry.notes !== null)
      parts.push(`ملاحظات إعادة التجهيز: ${event.retry.notes}`);
  }
  return parts.join(" — ");
};
