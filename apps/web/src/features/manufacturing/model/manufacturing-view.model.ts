import type {
  ManufacturingDepartment,
  ManufacturingOrderHeader,
  ManufacturingPieceRow,
  ManufacturingPieceContext,
  ManufacturingOrderSummary,
  ManufacturingOrderData,
  ManufacturingPiecesData,
  FactoryOrderPaperData,
} from "@template/contracts";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { toFactoryTrackingPiece } from "@/features/orders/model/order-tracking-piece.model";
import type { AuthoritativeOrderTracking } from "@/features/sales/model/order-view.model";

export type ManufacturingPieceTarget = Readonly<{
  orderId: string;
  expectedVersion: number;
  pieceId: string;
}>;
export type ManufacturingWorkRow = Readonly<{
  key: string;
  target: ManufacturingPieceTarget;
  order: ManufacturingOrderHeader;
  piece: ManufacturingPieceRow["piece"];
  work: ManufacturingPieceContext;
}>;
export type ManufacturingWorkGroup = Readonly<{
  order: ManufacturingOrderHeader;
  matchingPieceIds: readonly string[];
  rows: readonly ManufacturingWorkRow[];
}>;
export const freezeManufacturingRows = (
  rows: readonly ManufacturingWorkRow[],
): readonly ManufacturingWorkRow[] => {
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
export type ManufacturingGroupDetailState =
  | Readonly<{ phase: "loading"; group: null; failure: null }>
  | Readonly<{ phase: "error"; group: null; failure: string }>
  | Readonly<{
      phase: "ready" | "refreshing";
      group: ManufacturingWorkGroup;
      failure: string | null;
    }>;
export type ManufacturingSelectionPresentation =
  | Readonly<{ phase: "empty" | "loading"; rows: readonly []; failure: null }>
  | Readonly<{ phase: "error" | "stale"; rows: readonly []; failure: string }>
  | Readonly<{
      phase: "ready";
      rows: readonly ManufacturingWorkRow[];
      failure: null;
    }>;
export type ManufacturingRailProjection = Readonly<{
  orderId: string;
  orderStatus: ManufacturingOrderHeader["status"];
  currentDepartment: ManufacturingDepartment;
  countsByStage: Readonly<
    Record<ManufacturingPieceRow["piece"]["stage"], number>
  >;
  isReturned: boolean;
}>;
const row = (
  order: ManufacturingOrderHeader,
  piece: ManufacturingPieceRow["piece"],
  work: ManufacturingPieceContext,
): ManufacturingWorkRow => ({
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
export const toManufacturingRows = (
  data: ManufacturingPiecesData,
): readonly ManufacturingWorkRow[] =>
  data.items.map((entry) => row(entry.order, entry.piece, entry.work));
export const resolveManufacturingTargets = (
  data: ManufacturingOrderData,
  targets: readonly ManufacturingPieceTarget[],
): readonly ManufacturingWorkRow[] => {
  if (
    !targets.length ||
    new Set(targets.map((target) => target.pieceId)).size !== targets.length
  )
    throw new Error("Selection requires distinct pieces");
  const { order } = data.paper;
  return targets.map((target) => {
    const piece = order.pieces.find((piece) => piece.id === target.pieceId),
      work = data.work.find((work) => work.pieceId === target.pieceId);
    if (
      target.orderId !== order.id ||
      target.expectedVersion !== order.version ||
      !piece ||
      !work
    )
      throw new Error("Refresh and review selected pieces");
    const {
      pieces: _pieces,
      generalNotes: _generalNotes,
      repairNote: _repairNote,
      adjustmentRequested: _requested,
      adjustmentReason: _reason,
      adjustmentActionTaken: _action,
      ...header
    } = order;
    return row(header, piece, work);
  });
};
export const toManufacturingGroup = (
  summary: ManufacturingOrderSummary,
  data: ManufacturingOrderData,
): ManufacturingWorkGroup => ({
  order: summary,
  matchingPieceIds: summary.matchingPieceIds,
  rows: resolveManufacturingTargets(
    data,
    summary.matchingPieceIds.map((pieceId) => ({
      orderId: summary.id,
      expectedVersion: summary.version,
      pieceId,
    })),
  ),
});
export const toManufacturingTracking = (
  data: ManufacturingOrderData,
): AuthoritativeOrderTracking => {
  const { order } = data.paper;
  return {
    orderId: order.id,
    orderStatus: order.status,
    version: order.version,
    counts: order.counts,
    ready:
      order.status === "READY_FOR_DELIVERY" &&
      order.counts.active > 0 &&
      order.counts.received === order.counts.active,
    pieces: order.pieces.map(toFactoryTrackingPiece),
  };
};
export const toManufacturingRail = (
  data: ManufacturingOrderData,
): ManufacturingRailProjection => {
  const countsByStage: Record<ManufacturingPieceRow["piece"]["stage"], number> =
    {
      AWAITING_APPROVAL: 0,
      CANCELLED: 0,
      CUTTING: 0,
      PRODUCTION: 0,
      QUALITY: 0,
      WAREHOUSE: 0,
    };
  for (const piece of data.paper.order.pieces)
    if (!piece.cancelledAt) countsByStage[piece.stage]++;
  return {
    orderId: data.paper.order.id,
    orderStatus: data.paper.order.status,
    currentDepartment: data.department,
    countsByStage,
    isReturned: data.work.some((work) => work.isReturned),
  };
};
export const toFactoryPaperLines = (
  data: FactoryOrderPaperData,
): ProductLine[] =>
  data.order.pieces.map((piece, index) => ({
    id: piece.id,
    pieceNumber: `القطعة ${String(index + 1)}`,
    quantity: 1,
    model: piece.model ?? "",
    size: piece.size ?? "",
    leatherBase: piece.leatherBase ?? "",
    decoration: piece.decoration ?? "",
    decorationColor: piece.decorationColor ?? "",
    face: piece.face ?? "",
    faceRight: piece.faceRight ?? "",
    faceLeft: piece.faceLeft ?? "",
    mixing: piece.mixing ?? "",
    sole: piece.sole ?? "",
    soleAddition: piece.soleAddition ?? "",
    soleColor: piece.soleColor ?? "",
    additions: piece.additions ?? "",
    aField: piece.aField ?? "",
    paperCodes: piece.paperCodes,
    fField: piece.fField ?? "",
    sideNotes: piece.sideNotes ?? "",
  }));

export const toManufacturingWorkSummary = (
  row: ManufacturingWorkRow,
): string => {
  if (row.piece.cancelledAt !== null) return "قطعة ملغاة — عرض السجل فقط";
  if (row.piece.workState === "BLOCKED")
    return "موقوفة لدى الاعتماد — انتظر قراراً معتمداً قبل العمل";
  if (row.work.visit?.endReason === "TRANSFERRED")
    return "منجز ومحوّل من هذا القسم — عرض الزيارة المحفوظة";
  if (row.work.visit?.endedAt)
    return "زيارة سابقة متوقفة — راجع السجل وتعليمات القسم";
  if (row.work.isReturned)
    return "معادة للقسم بتعليمات معتمدة — تبدأ دورة العمل المعتادة";
  if (row.work.allowedActions.canReceiveAndStart)
    return "وارد بانتظار الاستلام والبدء";
  if (
    row.piece.workState === "IN_PROGRESS" &&
    row.piece.stage === row.work.visit?.department
  )
    return "قيد التنفيذ في القسم";
  return "سجل مرتبط بالقسم — لا توجد عملية عمل متاحة الآن";
};
