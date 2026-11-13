import type {
  QualityOrderData,
  QualityPiecesData,
  QualityOrderHeader,
  QualityOrderSummary,
  QualityPieceRow,
  QualityPieceContext,
} from "@template/contracts";
import type { AuthoritativeOrderTracking } from "@/features/sales/model/order-view.model";

export type QualityReadAvailability = "ready" | "refreshing" | "error";

export type QualityPieceTarget = Readonly<{
  orderId: string;
  expectedVersion: number;
  pieceId: string;
}>;
export type QualityWorkRow = Readonly<{
  key: string;
  target: QualityPieceTarget;
  order: QualityOrderHeader;
  piece: QualityPieceRow["piece"];
  work: QualityPieceContext;
}>;
export type QualityWorkGroup = Readonly<{
  order: QualityOrderHeader;
  matchingPieceIds: readonly string[];
  rows: readonly QualityWorkRow[];
}>;
export type QualityGroupDetailState =
  | Readonly<{ phase: "loading"; group: null; failure: null }>
  | Readonly<{ phase: "error"; group: null; failure: string }>
  | Readonly<{
      phase: "ready" | "refreshing";
      group: QualityWorkGroup;
      failure: string | null;
    }>;
export type QualitySelectionPresentation =
  | Readonly<{ phase: "empty" | "loading"; rows: readonly []; failure: null }>
  | Readonly<{ phase: "error" | "stale"; rows: readonly []; failure: string }>
  | Readonly<{
      phase: "ready";
      rows: readonly QualityWorkRow[];
      failure: null;
    }>;
export type QualityRailProjection = Readonly<{
  orderId: string;
  orderStatus: QualityOrderHeader["status"];
  currentDepartment: "QUALITY";
  countsByStage: Readonly<Record<QualityWorkRow["piece"]["stage"], number>>;
  isReturned: boolean;
}>;
const toRow = (
  order: QualityOrderHeader,
  piece: QualityWorkRow["piece"],
  work: QualityPieceContext,
): QualityWorkRow => ({
  key: `${order.id}/${piece.id}`,
  target: {
    orderId: order.id,
    expectedVersion: order.version,
    pieceId: piece.id,
  },
  order,
  piece,
  work,
});
export const toQualityRows = (
  data: QualityPiecesData,
): readonly QualityWorkRow[] =>
  data.items.map((entry) => toRow(entry.order, entry.piece, entry.work));
export const resolveQualityTargets = (
  data: QualityOrderData,
  targets: readonly QualityPieceTarget[],
): readonly QualityWorkRow[] => {
  const { order } = data.paper;
  if (
    targets.length === 0 ||
    new Set(targets.map((target) => target.pieceId)).size !== targets.length
  )
    throw new Error("راجع القطع المحددة وحدّث بيانات الجودة قبل التأكيد.");
  const header: QualityOrderHeader = {
    id: order.id,
    version: order.version,
    type: order.type,
    status: order.status,
    businessNumber: order.businessNumber,
    customerName: order.customerName,
    deliveryDate: order.deliveryDate,
    counts: order.counts,
  };
  return targets.map((target) => {
    const piece = order.pieces.find((piece) => piece.id === target.pieceId),
      work = data.work.find((context) => context.pieceId === target.pieceId);
    if (
      target.orderId !== order.id ||
      target.expectedVersion !== order.version ||
      piece === undefined ||
      work === undefined
    )
      throw new Error(
        "تغيّرت القطع المطلوبة. حدّث جميع الطلبات وراجع التحديد قبل التأكيد.",
      );
    return toRow(header, piece, work);
  });
};
export const toQualityGroup = (
  summary: QualityOrderSummary,
  data: QualityOrderData,
): QualityWorkGroup => ({
  order: summary,
  matchingPieceIds: summary.matchingPieceIds,
  rows: resolveQualityTargets(
    data,
    summary.matchingPieceIds.map((pieceId) => ({
      orderId: summary.id,
      expectedVersion: summary.version,
      pieceId,
    })),
  ),
});
export const freezeQualityRows = (
  rows: readonly QualityWorkRow[],
): readonly QualityWorkRow[] => {
  const captured = structuredClone(rows);
  const freeze = (entry: unknown): void => {
    if (entry !== null && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
  };
  freeze(captured);
  return captured;
};
export const toQualityWorkSummary = (row: QualityWorkRow): string => {
  if (row.piece.cancelledAt !== null || row.piece.stage === "CANCELLED")
    return "قطعة ملغاة — عرض السجل فقط";
  if (row.piece.workState === "BLOCKED")
    return "موقوفة لدى الاعتماد — انتظر القرار المعتمد قبل العمل";
  const correction = row.work.currentCorrection;
  if (correction !== null) {
    switch (correction.phase) {
      case "WAITING_CORRECTION":
        return "بانتظار التصحيح في القسم المحدد";
      case "AWAITING_REINSPECTION":
        return "عادت من التصحيح — بانتظار بدء إعادة الفحص";
      case "INSPECTING":
        return "إعادة الفحص قيد التنفيذ";
    }
  }
  if (row.work.allowedActions.canReceiveAndStart)
    return "وارد الجودة — بانتظار الاستلام وبدء الفحص";
  if (row.work.allowedActions.canInspect)
    return row.work.visit?.legacyUnknownStart
      ? "قيد الفحص — بداية العمل السابقة غير مسجلة"
      : "الفحص قيد التنفيذ";
  if (row.work.latestInspection?.decision === "ACCEPT")
    return "مقبولة ومحوّلة لوارد المستودع — الاستلام الفعلي مستقل";
  return "سجل مرتبط بالجودة — لا توجد عملية عمل متاحة الآن";
};
export const toQualityTracking = (
  data: QualityOrderData,
): AuthoritativeOrderTracking => {
  const { order } = data.paper;
  return {
    orderId: order.id,
    version: order.version,
    counts: order.counts,
    ready:
      order.counts.active > 0 && order.counts.received === order.counts.active,
    pieces: order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
      label: `القطعة ${String(piece.position)}`,
      model: piece.model,
      size: piece.size,
    })),
  };
};
export const toQualityRail = (
  data: QualityOrderData,
): QualityRailProjection => {
  const countsByStage: Record<QualityWorkRow["piece"]["stage"], number> = {
    AWAITING_APPROVAL: 0,
    CANCELLED: 0,
    CUTTING: 0,
    PRODUCTION: 0,
    QUALITY: 0,
    WAREHOUSE: 0,
  };
  for (const piece of data.paper.order.pieces)
    if (piece.cancelledAt === null && piece.stage !== "CANCELLED")
      countsByStage[piece.stage]++;
  return {
    orderId: data.paper.order.id,
    orderStatus: data.paper.order.status,
    currentDepartment: "QUALITY",
    countsByStage,
    isReturned: data.work.some((work) => work.currentCorrection !== null),
  };
};
