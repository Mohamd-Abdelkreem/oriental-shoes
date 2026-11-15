import type { RefObject } from "react";
import type { WarehouseActionFormValues } from "./warehouse-form.model";
import {
  warehouseOrderDataSchema,
  warehouseOrderSummarySchema,
  warehousePiecesDataSchema,
  type WarehouseCommandOperation,
  type WarehouseView,
  type WarehouseOrderData,
  type WarehouseOrderSummary,
  type WarehousePiecesData,
  type WarehousePieceRow,
  type WarehousePieceContext,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";
import type { AuthoritativeOrderTracking } from "@/features/sales/model/order-view.model";

export type WarehousePieceTarget = Readonly<{
  orderId: string;
  expectedVersion: number;
  pieceId: string;
}>;
export type WarehouseWorkRow = Readonly<{
  key: string;
  target: WarehousePieceTarget;
  order: WarehouseOrderSummary;
  piece: WarehousePieceRow["piece"];
  work: WarehousePieceContext;
}>;
export type WarehouseWorkGroup = Readonly<{
  order: WarehouseOrderSummary;
  matchingPieceIds: readonly string[];
  rows: readonly WarehouseWorkRow[];
}>;
export type WarehouseReadAvailability = "ready" | "refreshing" | "error";
export type WarehouseSelectionPresentation =
  | Readonly<{ phase: "empty" | "loading"; rows: readonly []; failure: null }>
  | Readonly<{ phase: "error" | "stale"; rows: readonly []; failure: string }>
  | Readonly<{
      phase: "ready";
      rows: readonly WarehouseWorkRow[];
      failure: null;
    }>;
export type WarehouseGroupDetailState =
  | Readonly<{ phase: "loading"; group: null; failure: null }>
  | Readonly<{ phase: "error"; group: null; failure: string }>
  | Readonly<{
      phase: "ready" | "refreshing";
      group: WarehouseWorkGroup;
      failure: string | null;
    }>;
export type WarehouseWholeOrderOperation = Exclude<
  WarehouseCommandOperation,
  "RECEIVE"
>;
export type WarehouseReceiptSelection = Readonly<{
  operation: "RECEIVE";
  orders: readonly {
    orderId: string;
    expectedVersion: number;
    pieceIds: readonly string[];
  }[];
  rows: readonly WarehouseWorkRow[];
}>;
export type WarehouseWholeOrderReview = Readonly<{
  operation: WarehouseWholeOrderOperation;
  selectedTargets: readonly WarehousePieceTarget[];
  orders: readonly {
    orderId: string;
    expectedVersion: number;
    pieceIds: readonly string[];
    attemptId: string | null;
    detail: WarehouseOrderData;
  }[];
}>;
export type WarehouseReview =
  WarehouseReceiptSelection | WarehouseWholeOrderReview;

const toRow = (
  order: WarehouseOrderSummary,
  piece: WarehouseWorkRow["piece"],
  work: WarehousePieceContext,
): WarehouseWorkRow => ({
  key: `${order.id}/${piece.id}`,
  order,
  piece,
  work,
  target: {
    orderId: order.id,
    expectedVersion: order.version,
    pieceId: piece.id,
  },
});
export const toWarehouseRows = (
  input: WarehousePiecesData,
): readonly WarehouseWorkRow[] => {
  const page = warehousePiecesDataSchema.parse(input);
  return page.pieces.map((row) => toRow(row.order, row.piece, row.work));
};
export const resolveWarehouseTargets = (
  input: WarehouseOrderData,
  targets: readonly WarehousePieceTarget[],
): readonly WarehouseWorkRow[] => {
  const detail = warehouseOrderDataSchema.parse(input);
  if (
    targets.length === 0 ||
    targets.length > 200 ||
    new Set(targets.map((target) => target.pieceId)).size !== targets.length
  )
    throw new ApiContractError();
  return targets.map((target) => {
    const piece = detail.paper.order.pieces.find(
        (piece) => piece.id === target.pieceId,
      ),
      work = detail.work.find((work) => work.pieceId === target.pieceId);
    if (
      target.orderId !== detail.summary.id ||
      target.expectedVersion !== detail.summary.version ||
      piece === undefined ||
      work === undefined
    )
      throw new ApiContractError();
    return toRow(detail.summary, piece, work);
  });
};
export const toWarehouseGroup = (
  input: WarehouseOrderSummary,
  inputDetail: WarehouseOrderData,
): WarehouseWorkGroup => {
  const summary = warehouseOrderSummarySchema.parse(input),
    detail = warehouseOrderDataSchema.parse(inputDetail);
  if (
    summary.id !== detail.summary.id ||
    summary.version !== detail.summary.version ||
    summary.status !== detail.summary.status
  )
    throw new ApiContractError();
  return {
    order: summary,
    matchingPieceIds: summary.matchingPieceIds,
    rows:
      summary.matchingPieceIds.length === 0
        ? []
        : resolveWarehouseTargets(
            detail,
            summary.matchingPieceIds.map((pieceId) => ({
              orderId: summary.id,
              expectedVersion: summary.version,
              pieceId,
            })),
          ),
  };
};
export const freezeWarehouseReview = <T extends WarehouseReview>(
  review: T,
): T => {
  const captured = structuredClone(review);
  const freeze = (entry: unknown): void => {
    if (entry !== null && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
  };
  freeze(captured);
  return captured;
};
export const toWarehouseTracking = (
  input: WarehouseOrderData,
): AuthoritativeOrderTracking => {
  const detail = warehouseOrderDataSchema.parse(input),
    order = detail.paper.order;
  return {
    orderId: order.id,
    orderStatus: order.status,
    version: order.version,
    counts: order.counts,
    ready:
      order.counts.active > 0 &&
      order.counts.received === order.counts.active &&
      order.status === "READY_FOR_DELIVERY" &&
      detail.summary.allowedActions.canDispatch,
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

export type WarehouseConfirmationController = Readonly<{
  review: WarehouseReview | null;
  preparing: boolean;
  failure: string | null;
  reviewRequired: boolean;
  open(
    operation: WarehouseCommandOperation,
    targets: readonly WarehousePieceTarget[],
  ): Promise<void>;
  reviewCurrent(): Promise<void>;
  confirm(values: WarehouseActionFormValues): Promise<void>;
  close(): void;
}>;
export type WarehouseDialogProps = Readonly<{
  source: "warehouse";
  open: boolean;
  review: WarehouseReview;
  pending: boolean;
  readAvailability: WarehouseReadAvailability;
  readFailure: string | null;
  failure: string | null;
  reviewRequired: boolean;
  onReadRetry(): Promise<void>;
  onReview(): Promise<void>;
  onConfirm(values: WarehouseActionFormValues): Promise<void>;
  onClose(): void;
  returnFocusRef: RefObject<HTMLElement | null>;
}>;

export type WarehouseRowCallbacks = Readonly<{
  onReceive(targets: readonly WarehousePieceTarget[]): void;
  onDispatch(targets: readonly WarehousePieceTarget[]): void;
  onConfirmDelivery(targets: readonly WarehousePieceTarget[]): void;
  onFailDelivery(targets: readonly WarehousePieceTarget[]): void;
  onRetryDelivery(targets: readonly WarehousePieceTarget[]): void;
}>;

export type WarehouseDepartmentTableProps = Readonly<
  {
    source: "warehouse";
    view: WarehouseView;
    mode: "grouped" | "flat";
    busy: boolean;
    onRetry(): void;
    selectedTargets: readonly WarehousePieceTarget[];
    onToggleSelect(target: WarehousePieceTarget): void;
    onToggleSelectMultiple(
      targets: readonly WarehousePieceTarget[],
      select: boolean,
    ): void;
    onClearSelection(): void;
    expandedOrderIds: readonly string[];
    groupDetails: ReadonlyMap<string, WarehouseGroupDetailState>;
    onToggleExpand(summary: WarehouseOrderSummary): void;
    selection: WarehouseSelectionPresentation;
    onLoadGroup(summary: WarehouseOrderSummary): Promise<WarehouseWorkGroup>;
    callbacks: WarehouseRowCallbacks;
  } & (
    | {
        queryStatus: "loading";
        rows: readonly [];
        groups: readonly [];
        counts: null;
        failure: null;
      }
    | {
        queryStatus: "error";
        rows: readonly [];
        groups: readonly [];
        counts: null;
        failure: string;
      }
    | {
        queryStatus: "ready" | "refreshing";
        rows: readonly WarehouseWorkRow[];
        groups: readonly WarehouseOrderSummary[];
        counts: Readonly<{ orders: number; pieces: number }>;
        failure: string | null;
      }
  )
>;
export type WarehouseOrderCardProps = Readonly<{
  summary: WarehouseOrderSummary;
  detailState: WarehouseGroupDetailState | undefined;
  selectedTargets: readonly WarehousePieceTarget[];
  expanded: boolean;
  busy: boolean;
  onToggleExpand(): void;
  onToggleSelect(target: WarehousePieceTarget): void;
  onToggleSelectMultiple(
    targets: readonly WarehousePieceTarget[],
    select: boolean,
  ): void;
  callbacks: WarehouseRowCallbacks;
}>;
export type WarehouseBatchActionsProps = Readonly<{
  view: WarehouseView;
  selectedTargets: readonly WarehousePieceTarget[];
  selection: WarehouseSelectionPresentation;
  busy: boolean;
  callbacks: WarehouseRowCallbacks;
  onClearSelection(): void;
}>;

const pieceStages: Record<WarehouseWorkRow["piece"]["stage"], string> = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
  CANCELLED: "ملغاة",
};
const pieceWorkStates: Record<WarehouseWorkRow["piece"]["workState"], string> =
  {
    INCOMING: "بانتظار الاستلام",
    IN_PROGRESS: "قيد التنفيذ",
    COMPLETED: "مكتملة في المرحلة",
    BLOCKED: "متوقفة",
  };
export const toWarehouseWorkSummary = (row: WarehouseWorkRow): string => {
  if (row.piece.stage === "CANCELLED") return "ملغاة";
  if (row.piece.receivedAt === null)
    return `${pieceStages[row.piece.stage]} — ${pieceWorkStates[row.piece.workState]} — لم تستلم فعلياً`;
  switch (row.order.status) {
    case "OUT_FOR_DELIVERY":
      return "مع المندوب — خرج للتوصيل";
    case "DELIVERED":
      return "لدى العميل — تم تسليم الطلب بالكامل";
    case "DELIVERY_FAILED":
      return "المستودع — عادت بالكامل وبانتظار إعادة التجهيز";
    case "READY_FOR_DELIVERY":
      return row.order.allowedActions.canDispatch
        ? "المستودع — جاهزة للتوصيل"
        : "المستودع — تم الاستلام الفعلي";
    default:
      return "المستودع — تم الاستلام الفعلي";
  }
};
