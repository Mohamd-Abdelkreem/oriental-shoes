import {
  describeOrderPieces,
  type OrderPieceLabels,
} from "@/features/orders/model/order-display-reference";
import { toOrderActivityActionLabel } from "@template/contracts";
import type {
  QualityCommandOperation,
  QualityActivityEvent,
} from "@template/contracts";

export const toQualityOperationLabel = (
  operation: QualityCommandOperation,
): string => toOrderActivityActionLabel({ kind: "quality", operation });
const cycleLabels: Record<
  QualityActivityEvent["correctionLinks"][number]["action"],
  string
> = {
  OPENED: "فتح دورة تصحيح محفوظة",
  REINSPECTION_STARTED: "بدء إعادة الفحص",
  ACCEPTED: "قبول دورة التصحيح",
  REJECTED: "فشل إعادة الفحص للدورة السابقة",
};
export const toQualityEventSummary = (
  event: QualityActivityEvent,
  labels?: OrderPieceLabels,
): string => {
  const accepted = event.pieces.filter(
      (piece) => piece.decision === "ACCEPT",
    ).length,
    rejected = event.pieces.filter(
      (piece) => piece.decision === "REJECT",
    ).length;
  const parts = [
    toQualityOperationLabel(event.operation),
    describeOrderPieces(
      event.pieces.map((piece) => piece.pieceId),
      labels,
    ),
    event.actor.fullName,
  ];
  if (event.operation === "INSPECT") {
    parts.push(
      `قبول ${String(accepted)} لوارد المستودع دون تسجيل الاستلام الفعلي`,
      `رفض ${String(rejected)}`,
    );
    for (const decision of event.inspection?.decisions ?? []) {
      const piece = labels?.get(decision.pieceId) ?? "القطعة المفحوصة";
      if (decision.decision === "REJECT")
        parts.push(
          `${piece}: تصحيح في ${decision.target === "CUTTING" ? "القص" : "الإنتاج"}: ${decision.reason} — ${decision.instructions}`,
        );
      else if (labels?.has(decision.pieceId))
        parts.push(`${piece}: قبول لوارد المستودع`);
    }
    const packing = event.inspection?.packing;
    if (packing !== undefined && packing !== null) {
      if (packing.cartonCount !== null)
        parts.push(`الكراتين: ${packing.cartonCount}`);
      if (packing.cartonNumbers !== null)
        parts.push(`المراجع: ${packing.cartonNumbers}`);
    }
    if (event.inspection?.inspectorNote)
      parts.push(`ملاحظات الفحص: ${event.inspection.inspectorNote}`);
  }
  if (event.report !== null)
    parts.push(
      event.report.reason,
      ...(event.report.notes === null ? [] : [event.report.notes]),
    );
  for (const link of event.correctionLinks)
    parts.push(
      `${cycleLabels[link.action]} ${String(link.cycle)}${labels?.has(link.pieceId) ? ` · ${labels.get(link.pieceId) ?? ""}` : ""}`,
    );
  return parts.join(" — ");
};
