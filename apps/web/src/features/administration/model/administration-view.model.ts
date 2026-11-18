import { formatDraftReference } from "@template/contracts";
import type { UseFormReturn } from "react-hook-form";
import type {
  AdministrationCancelReview,
  AdministrationCancelForm,
  AdministrationCorrectionReview,
  AdministrationCorrectionForm,
} from "./administration-form.model";
import type {
  AdministrationOrdersData,
  AdministrationOrderData,
  AdministrationOrderSummary,
  DraftDto,
  SalesOrderDto,
  SalesOrderType,
} from "@template/contracts";
import type { MvpOrder } from "@/features/prototype/state/mvp-types";
import {
  makeDraftDefaults,
  toDraftPaper,
} from "@/features/sales/model/draft-form.model";
import {
  toSalesOrderStatusLabel,
  toSubmittedPaper,
  toAuthoritativeTracking,
  type AuthoritativeOrderTracking,
} from "@/features/sales/model/order-view.model";

export type AdministrationOrderRow = Readonly<{
  kind: "draft" | "submitted";
  id: string;
  reference: string;
  type: SalesOrderType;
  statusLabel: string;
  customerName: string | null;
  phone: string | null;
  ownerName: string;
  createdAt: string;
  deliveryDate: string | null;
  capturedPieceCount: number;
  counts: SalesOrderDto["counts"] | null;
  currentDepartments: AdministrationOrderSummary["currentDepartments"];
  isOverdue: boolean;
  canPrint: boolean;
}>;
export const toAdministrationOrderRow = (
  item: AdministrationOrdersData["items"][number],
): AdministrationOrderRow => {
  if (item.kind === "draft") {
    const draft = item.draft;
    return {
      kind: item.kind,
      id: draft.id,
      reference: formatDraftReference(draft.id, draft.draftSequence),
      type: draft.type,
      statusLabel: toSalesOrderStatusLabel("DRAFT"),
      customerName: draft.customer?.name ?? null,
      phone: draft.customer?.phone ?? null,
      ownerName: draft.owner.fullName,
      createdAt: draft.createdAt,
      deliveryDate: draft.deliveryDate,
      capturedPieceCount: draft.pieceCount,
      counts: null,
      currentDepartments: [],
      isOverdue: false,
      canPrint: false,
    };
  }
  const order = item.order;
  return {
    kind: item.kind,
    id: order.id,
    reference: order.businessNumber,
    type: order.type,
    statusLabel: toSalesOrderStatusLabel(order.status),
    customerName: order.customerSnapshot.name,
    phone: order.customerSnapshot.phone,
    ownerName: order.owner.fullName,
    createdAt: order.createdAt,
    deliveryDate: order.deliveryDate,
    capturedPieceCount: order.counts.original,
    counts: order.counts,
    currentDepartments: order.currentDepartments,
    isOverdue: order.isOverdue,
    canPrint: order.adminActions.canPrint,
  };
};
export const toAdministrationTracking = (
  detail: Extract<AdministrationOrderData, { kind: "submitted" }>,
): AuthoritativeOrderTracking =>
  toAuthoritativeTracking(detail.order, detail.tracking);
export const toAdministrationDraftPaper = (draft: DraftDto): MvpOrder =>
  toDraftPaper(makeDraftDefaults(draft), {
    ownerName: draft.owner.fullName,
    createdAt: draft.createdAt,
    draftId: draft.id,
    customer: draft.customer,
  });
export const toAdministrationPaper = (
  detail: Extract<AdministrationOrderData, { kind: "submitted" }>,
): MvpOrder => toSubmittedPaper(detail.order);

export type AdminCancelDialogProps = {
  open: boolean;
  onClose: () => void;
  review: AdministrationCancelReview | null;
  form: UseFormReturn<AdministrationCancelForm>;
  preparing: boolean;
  pending: boolean;
  reviewRequired: boolean;
  failure: string | null;
  onReviewCurrent: () => Promise<void>;
  onConfirm: (values: AdministrationCancelForm) => Promise<void>;
};
export type AdminReopenDialogProps = {
  open: boolean;
  onClose: () => void;
  review: AdministrationCorrectionReview | null;
  form: UseFormReturn<AdministrationCorrectionForm>;
  preparing: boolean;
  pending: boolean;
  reviewRequired: boolean;
  failure: string | null;
  onReviewCurrent: () => Promise<void>;
  onConfirm: (values: AdministrationCorrectionForm) => Promise<void>;
  context: Readonly<{
    businessNumber: string;
    statusLabel: string;
    createdAt: string;
    activePieces: number;
    receivedPieces: number;
  }>;
};
