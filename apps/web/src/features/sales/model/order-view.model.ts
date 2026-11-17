import { toOrderActivityActionLabel } from "@template/contracts";
import {
  toWarehouseOperationLabel,
  toWarehouseEventSummary,
} from "@/features/warehouse/model/warehouse-event.model";
import {
  toQualityOperationLabel,
  toQualityEventSummary,
} from "@/features/manufacturing/model/quality-event.model";
import {
  toManufacturingOperationLabel,
  toManufacturingEventSummary,
} from "@/features/manufacturing/model/manufacturing-event.model";
import type {
  CatalogData,
  SalesActivityItem,
  OrderActivityEvent,
  ApprovalChangedField,
  ApprovalDecision,
  ApprovalActor,
  SalesOrderTrackingData,
  SalesOrderDto,
  SalesOrderListData,
  SalesOrderStatus,
} from "@template/contracts";
import type { MvpOrder } from "@/features/prototype/state/mvp-types";
import type { OrderPaperDataState } from "@/features/orders/components/order-paper-form";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { draftChangeFieldLabels } from "./draft-form.model";
import { toPaperCatalogOptions } from "./catalog-paper.model";

const statusLabels = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  RETURNED: "معاد للتعديل",
  APPROVED: "قيد التصنيع",
  READY_FOR_DELIVERY: "جاهز للتسليم",
  OUT_FOR_DELIVERY: "خرج مع المندوب",
  DELIVERY_FAILED: "تعذر التسليم",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
  DRAFT: "مسودة",
} as const satisfies Record<SalesOrderStatus | "DRAFT", string>;
export const toSalesOrderStatusLabel = (
  status: SalesOrderStatus | "DRAFT",
): string => statusLabels[status];
export const toSubmittedPaper = (order: SalesOrderDto): MvpOrder => ({
  id: order.id,
  type: order.type,
  customer: order.customerSnapshot.name,
  phone: order.customerSnapshot.phone,
  address: order.customerSnapshot.address ?? "",
  salesperson: order.owner.fullName,
  created: order.createdAt,
  createdIso: order.createdAt,
  delivery: order.deliveryDate ?? "",
  deliveryIso: order.deliveryDate ?? undefined,
  status: toSalesOrderStatusLabel(order.status),
  cancelled: order.counts.cancelled,
  warehouse: order.counts.received,
  segments: [],
  items: order.pieces.map((piece, index) => ({
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
    fField: piece.fField ?? "",
    sideNotes: piece.sideNotes ?? "",
    unitPrice: piece.unitPrice,
    rowTotal: piece.unitPrice,
  })),
  generalNotes: order.generalNotes ?? "",
  responsibleSignature: order.responsibleSignature ?? "",
  repairNote: order.repairNote ?? "",
  adjustmentRequested: order.adjustmentRequested ?? "",
  adjustmentReason: order.adjustmentReason ?? "",
  adjustmentActionTaken: order.adjustmentActionTaken ?? "",
  total: order.money.total,
  paid: order.money.paidAmount,
  balance: order.money.remainingDue,
  ...(order.approval.returnReason === null
    ? {}
    : { returnReason: order.approval.returnReason }),
  ...(order.approval.returnedAt === null
    ? {}
    : { returnedAt: order.approval.returnedAt }),
});
export const toAuthoritativePaperState = (
  order: SalesOrderDto,
  catalog: CatalogData | null,
): Extract<OrderPaperDataState, { kind: "authoritative" }> => ({
  kind: "authoritative",
  catalogSourceId:
    catalog?.availability === "available" ? catalog.sourceId : null,
  catalogOptions: toPaperCatalogOptions(
    catalog ?? { availability: "unavailable", reason: "CATALOG_NOT_LOADED" },
  ),
  selectionsByPiece: Object.fromEntries(
    order.pieces.map((piece) => [piece.id, piece.catalogSelections]),
  ),
  lockedCatalogFields: order.status === "RETURNED" ? ["decoration"] : [],
  finance: {
    kind: "submitted",
    piecePrices: Object.fromEntries(
      order.pieces.map((piece) => [piece.id, piece.unitPrice]),
    ),
    money: order.money,
  },
});
export const toSalesOrderListRow = (
  item: SalesOrderListData["items"][number],
) => {
  if (item.kind === "draft") {
    const draft = item.draft;
    return {
      kind: "draft" as const,
      id: draft.id,
      reference: draft.id,
      type: draft.type,
      status: "مسودة",
      customer: draft.customer?.name ?? "",
      phone: draft.customer?.phone ?? "",
      ownerName: draft.owner.fullName,
      createdAt: draft.createdAt,
      deliveryDate: draft.deliveryDate,
      pieceCount: draft.pieceCount,
      money: null,
      canEdit: true,
    };
  }
  const order = item.order;
  return {
    kind: "submitted" as const,
    id: order.id,
    reference: order.businessNumber,
    type: order.type,
    status: toSalesOrderStatusLabel(order.status),
    customer: order.customerSnapshot.name,
    phone: order.customerSnapshot.phone,
    ownerName: order.owner.fullName,
    createdAt: order.createdAt,
    deliveryDate: order.deliveryDate,
    pieceCount: order.counts.original,
    money: order.money,
    canEdit: order.allowedActions.canResubmit,
  };
};

export type AuthoritativeOrderTracking = Readonly<{
  orderId: string;
  orderStatus: SalesOrderStatus;
  version: number;
  counts: SalesOrderTrackingData["counts"];
  ready: boolean;
  pieces: readonly (SalesOrderTrackingData["pieces"][number] & {
    label: string;
    model: string | null;
    size: string | null;
  })[];
}>;
export const toAuthoritativeTracking = (
  order: SalesOrderDto,
  tracking: SalesOrderTrackingData,
): AuthoritativeOrderTracking => {
  if (
    order.id !== tracking.orderId ||
    order.version !== tracking.orderVersion ||
    tracking.pieces.length !== order.pieces.length
  )
    throw new Error("Tracking revision does not match current detail");
  return {
    orderId: order.id,
    orderStatus: order.status,
    version: order.version,
    counts: tracking.counts,
    ready:
      order.status === "READY_FOR_DELIVERY" &&
      tracking.counts.active > 0 &&
      tracking.counts.received === tracking.counts.active,
    pieces: tracking.pieces.map((piece) => {
      const index = order.pieces.findIndex(
        (current) => current.id === piece.pieceId,
      );
      const detail = order.pieces[index];
      if (detail === undefined)
        throw new Error("Tracking piece does not match current detail");
      return {
        ...piece,
        label: formatPieceSequence(index),
        model: detail.model,
        size: detail.size,
      };
    }),
  };
};

const orderChangedFieldLabels = {
  ...draftChangeFieldLabels,
  catalogSelections: "اختيارات القوائم",
  status: "الحالة",
  businessNumber: "رقم الطلب",
  customerSnapshot: "بيانات العميل وقت الإرسال",
  prices: "الأسعار المعتمدة",
} satisfies Record<OrderActivityEvent["changedFields"][number], string>;
const approvalChangedFieldLabels = {
  approval: "الاعتماد",
  status: "الحالة",
  pieceState: "حالة القطعة",
  issue: "المشكلة",
  proposal: "المقترح",
  model: "الموديل",
  size: "المقاس",
  leatherBase: "الأساس",
  sole: "الأرضية",
  cancellation: "الإلغاء",
  total: "الإجمالي",
} satisfies Record<ApprovalChangedField, string>;
const approvalDecisionLabels = {
  RETURN_TO_DEPARTMENT: "إعادة للقسم",
  SEND_TO_SALES: "إحالة للمبيعات",
  CANCEL: "إلغاء القطعة",
  ACCEPT: "قبول التعديل",
  RETURN_TO_SALES: "إرجاع للمبيعات",
} satisfies Record<ApprovalDecision, string>;
export type SalesActivityRow = Readonly<{
  kind: SalesActivityItem["kind"];
  id: string;
  resourceId: string;
  reference: string;
  label: string;
  fields: string;
  actor: ApprovalActor;
  occurredAt: string;
  decisionLabel: string | null;
}>;
const administrationFieldLabels = {
  cancellation: "الإلغاء",
  total: "الإجمالي",
  status: "حالة الطلب",
  customerAddress: "عنوان التسليم",
  customerEmail: "البريد الإلكتروني",
  customerName: "اسم العميل",
  customerPhone: "رقم الجوال",
  generalNotes: "الملاحظات العامة",
} as const;
export const toSalesActivityRow = (
  item: SalesActivityItem,
): SalesActivityRow => {
  switch (item.kind) {
    case "administration":
      return {
        kind: item.kind,
        id: `administration:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toOrderActivityActionLabel({
          kind: item.kind,
          operation: item.event.operation,
        }),
        fields: [
          ...item.event.changedFields.map(
            (field) => administrationFieldLabels[field],
          ),
          ...(item.event.operation === "ADMIN_CANCEL"
            ? [
                `${String(item.event.pieceIds.length)} قطعة`,
                `القطع الأصلية: ${item.event.pieceIds.join("، ")}`,
              ]
            : []),
          `إصدار الطلب: ${String(item.event.orderVersion)}`,
        ].join(" — "),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel: null,
      };
    case "warehouse":
      return {
        kind: item.kind,
        id: `warehouse:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toWarehouseOperationLabel(item.event.operation),
        fields: toWarehouseEventSummary(item.event),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel: null,
      };
    case "quality":
      return {
        kind: item.kind,
        id: `quality:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toQualityOperationLabel(item.event.operation),
        fields: toQualityEventSummary(item.event),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel: null,
      };
    case "manufacturing":
      return {
        kind: item.kind,
        id: `manufacturing:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toManufacturingOperationLabel(item.event.operation),
        fields: toManufacturingEventSummary(item.event),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel: null,
      };
    case "draft":
      return {
        kind: item.kind,
        id: `draft:${item.change.commandId}`,
        resourceId: item.change.draftId,
        reference: item.change.draftId,
        label: toOrderActivityActionLabel({
          kind: "draft",
          operation: item.change.operation,
        }),
        fields: item.change.changedFields
          .map((field) => draftChangeFieldLabels[field])
          .join("، "),
        actor: item.change.actor,
        occurredAt: item.change.occurredAt,
        decisionLabel: null,
      };
    case "order":
      return {
        kind: item.kind,
        id: `order:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toOrderActivityActionLabel({
          kind: "order",
          operation: item.event.operation,
        }),
        fields: item.event.changedFields
          .map((field) => orderChangedFieldLabels[field])
          .join("، "),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel: null,
      };
    case "approval":
      return {
        kind: item.kind,
        id: `approval:${item.event.id}`,
        resourceId: item.event.orderId,
        reference: item.event.businessNumber,
        label: toOrderActivityActionLabel({
          kind: "approval",
          operation: item.event.operation,
        }),
        fields: item.event.changedFields
          .map((field) => approvalChangedFieldLabels[field])
          .join("، "),
        actor: item.event.actor,
        occurredAt: item.event.occurredAt,
        decisionLabel:
          item.event.decision === null
            ? null
            : approvalDecisionLabels[item.event.decision],
      };
  }
};
