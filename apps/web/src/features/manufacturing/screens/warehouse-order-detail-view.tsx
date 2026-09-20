"use client";

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Eye,
  FileText,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import {
  requiredQuantity,
  stageQuantity,
  useMvpStore,
  formatProductCount,
  formatSegmentCount,
  formatOrderPieceProgress,
  type MvpOrder,
  type QuantitySegment,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";

import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { ManufacturingRail } from "@/features/prototype/components/manufacturing-rail";
import { QuantityReconciliation } from "@/features/prototype/components/quantity-reconciliation";
import {
  ConfirmDeliveryDialog,
  ConfirmWarehouseReceiptDialog,
  DispatchDeliveryDialog,
  RecordDeliveryFailedDialog,
  RetryDeliveryDialog,
} from "@/features/prototype/components/action-dialogs";

import type { Dispatch, SetStateAction } from "react";

export type WarehouseActiveModal = {
  type: "RECEIPT" | "DISPATCH" | "FAILED" | "RETRY" | "CONFIRM_DELIVERED";
  order: MvpOrder;
  segment?: QuantitySegment | undefined;
} | null;

export function WarehouseOrderDetailView({
  order,
  targetSegmentId,
  isLocked,
  activeModal,
  setActiveModal,
}: {
  order: MvpOrder | undefined;
  targetSegmentId: string | null;
  isLocked: boolean;
  activeModal: WarehouseActiveModal;
  setActiveModal: Dispatch<SetStateAction<WarehouseActiveModal>>;
}) {
  const store = useMvpStore();
  if (!order) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle size={40} className="mx-auto mb-2 text-rose-500" />
        <h2 className="text-lg font-bold text-slate-800">
          أمر التفصيل غير موجود
        </h2>
        <Link
          href="/warehouse/dashboard"
          className="btn-pill btn-secondary mt-4 inline-block"
        >
          العودة للوحة المستودع
        </Link>
      </div>
    );
  }

  const inWh = stageQuantity(order, "المستودع");
  const active = requiredQuantity(order);
  const selectedSegment =
    order.segments.find((s) => s.id === targetSegmentId) ||
    order.segments.find((s) => s.stage === "المستودع") ||
    order.segments[0];
  const otherSegments = order.segments.filter(
    (s) => s.id !== selectedSegment?.id,
  );

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم المستودع والتسليم / تفاصيل المخزون والشحن"
        title={`أمر تفصيل بالمستودع: ${order.id}`}
        subtitle={`العميل: ${order.customer || order.customerName || ""} · حالة القطع بالمستودع: ${formatOrderPieceProgress(order)} (${formatProductCount(inWh)} من ${formatProductCount(active)})`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/warehouse/dashboard"
              className="btn-pill btn-secondary"
            >
              <ArrowRight size={15} />
              <span>رجوع للمستودع</span>
            </Link>
          </div>
        }
      />

      {/* Universal Top Banner (Task 2 Requirement) */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-teal-800/40 bg-gradient-to-l from-teal-900 to-slate-900 p-4 text-white shadow-lg md:flex-row md:items-center md:p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-teal-500/30 bg-teal-500/20 px-2.5 py-0.5 text-xs font-bold text-teal-300">
              قسم المستودع والتسليم
            </span>
            <span className="text-xs text-slate-300">
              أمر تفصيل:{" "}
              <strong className="font-mono text-white">{order.id}</strong>
            </span>
            {order.segments.length > 1 && selectedSegment && (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                الجزء{" "}
                {order.segments.findIndex((s) => s.id === selectedSegment.id) +
                  1}{" "}
                من {order.segments.length}
              </span>
            )}
          </div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white md:text-xl">
            <span>
              أنت تعرض الآن:{" "}
              {formatProductCount(selectedSegment?.quantity || inWh)} من أصل{" "}
              {formatProductCount(active)} منتج — قسم المستودع والتسليم
            </span>
          </h2>
          <p className="text-xs text-slate-300">
            العميل:{" "}
            <strong className="text-white">
              {order.customer || order.customerName}
            </strong>{" "}
            · المسار الحالي: {selectedSegment?.stage || "المستودع"} (
            {selectedSegment?.state || order.status})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/orders/${order.id}`}
            className="btn-pill border border-white/20 bg-white/10 text-xs text-white hover:bg-white/20"
          >
            عرض التتبع الشامل للإدارة
          </Link>
        </div>
      </div>

      {/* Warehouse Status Banner */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 border-b pb-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                حالة الجاهزية للتسليم
              </span>
              {isLocked ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                  <AlertTriangle size={12} />
                  التسليم مقفل (الكمية غير مكتملة)
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 size={12} />
                  جاهز للإرسال (اكتملت جميع القطع)
                </span>
              )}
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900">
              إجمالي الكراتين المسجلة: {order.cartonCount || 0} كرتون · الكمية:{" "}
              {inWh} قطعة
            </h3>
            {order.warehouseLocation && (
              <p className="mt-0.5 text-xs text-slate-500">
                موقع التخزين بالرفوف: <strong>{order.warehouseLocation}</strong>
              </p>
            )}
          </div>

          {/* Warehouse Actions */}
          <div className="flex items-center gap-2">
            {/* Receipt Action */}
            {order.status === "محول للمستودع" && (
              <button
                type="button"
                onClick={() => {
                  setActiveModal({ type: "RECEIPT", order });
                }}
                className="btn-pill btn-teal"
              >
                <PackageCheck size={16} />
                <span>تأكيد استلام الدفعة وتسجيل الكراتين</span>
              </button>
            )}

            {/* Dispatch Action (Allowed only when pct >= 100) */}
            {!isLocked &&
              [
                "بالمستودع جاهز للتسليم",
                "مكتمل في المستودع",
                "جاهز للتسليم",
              ].includes(order.status) && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal({ type: "DISPATCH", order });
                  }}
                  className="btn-pill btn-teal"
                >
                  <Truck size={16} />
                  <span>إرسال مع مندوب التوصيل</span>
                </button>
              )}

            {/* When Out for delivery */}
            {order.status === "خرج مع المندوب" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal({ type: "CONFIRM_DELIVERED", order });
                  }}
                  className="btn-pill btn-teal"
                >
                  <CheckCircle2 size={16} />
                  <span>تأكيد التسليم بنجاح للعميل</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal({ type: "FAILED", order });
                  }}
                  className="btn-pill btn-rose"
                >
                  <XCircle size={16} />
                  <span>تسجيل تعذر / فشل التسليم</span>
                </button>
              </>
            )}

            {/* When Delivery Failed */}
            {(order.status === "تعذر التسليم" ||
              order.status === "فشل التسليم معلق") && (
              <button
                type="button"
                onClick={() => {
                  setActiveModal({ type: "RETRY", order });
                }}
                className="btn-pill btn-amber"
              >
                <RotateCcw size={16} />
                <span>جدولة إعادة محاولة التسليم</span>
              </button>
            )}
          </div>
        </div>

        {/* Delivery Note or Failure History */}
        {order.deliveryNotes && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <strong className="mb-0.5 block font-bold">
              سجل التوصيل والملاحظات:
            </strong>
            <span>{order.deliveryNotes}</span>
          </div>
        )}
      </div>

      {/* Manufacturing Progress Rail */}
      <ManufacturingRail order={order} />

      {/* Other Segments of the Same Order (Task 2 Explicit Requirement) */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Boxes size={16} className="text-teal-600" />
            <span>الأجزاء الأخرى من نفس أمر التفصيل ({order.id})</span>
          </h4>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
            إجمالي أمر التفصيل: {formatProductCount(active)} (
            {formatSegmentCount(order.segments.length)})
          </span>
        </div>

        {otherSegments.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            لا توجد أجزاء أخرى، هذا الجزء يمثل كامل كمية أمر التفصيل (
            {formatProductCount(selectedSegment?.quantity || active)})
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              جميع الأجزاء التالية تنتمي لنفس أمر التفصيل وتتحرك بالتوازي عبر
              أقسام المصنع:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherSegments.map((seg) => {
                const itm =
                  order.items.find((i) => i.id === seg.itemId) ||
                  order.items[0];
                return (
                  <div
                    key={seg.id}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition hover:border-teal-300 hover:bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs font-bold text-slate-900">
                          {seg.stage}
                        </strong>
                        {seg.stage === "المستودع" && (
                          <span className="py-0.2 rounded bg-teal-100 px-1.5 text-[10px] font-bold text-teal-800">
                            بالمستودع
                          </span>
                        )}
                      </div>
                      <span className="rounded border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-xs font-bold text-teal-800">
                        {formatProductCount(seg.quantity)}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          الحالة التشغيلية:
                        </span>
                        <OrientalStatusPill tone={statusTone(seg.state)}>
                          {seg.state}
                        </OrientalStatusPill>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">الموديل والمقاس:</span>
                        <strong className="font-mono text-slate-800">
                          {itm?.model} (مقاس {itm?.size})
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">الموظف المعين:</span>
                        <span
                          className={
                            seg.worker
                              ? "font-medium text-indigo-700"
                              : "text-slate-400"
                          }
                        >
                          {seg.worker || "غير معين"}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end border-t border-slate-200 pt-2">
                      <Link
                        href={`/warehouse/orders/${order.id}?segmentId=${seg.id}&itemId=${seg.itemId}`}
                        className="btn-pill btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
                        title="الانتقال لعرض هذا الجزء"
                      >
                        <Eye size={12} />
                        <span>عرض هذا الجزء</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Mathematical Quantity Reconciliation */}
      <QuantityReconciliation order={order} />

      {/* Full Paper Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
          <FileText size={16} className="text-teal-600" />
          <span>استمارة أمر التفصيل الرسمية</span>
        </h3>
        <OrderPaperForm
          order={order}
          mode="readOnly"
          hideFinancials={true}
          showZoomControls={true}
        />
      </div>

      {/* Action Dialogs */}
      {activeModal && activeModal.type === "CONFIRM_DELIVERED" && (
        <ConfirmDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          customerName={
            activeModal.order.customerName ||
            activeModal.order.customer ||
            "العميل"
          }
          onConfirm={() => {
            store.confirmDelivered(activeModal.order.id, "سارة محمد");
          }}
        />
      )}

      {activeModal && activeModal.type === "RECEIPT" && (
        <ConfirmWarehouseReceiptDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          quantity={
            activeModal.segment?.quantity ||
            stageQuantity(activeModal.order, "المستودع")
          }
          onConfirm={() => {
            const segId =
              activeModal.segment?.id ||
              activeModal.order.segments.find((s) => s.stage === "المستودع")
                ?.id ||
              activeModal.order.segments[0]?.id ||
              "";
            store.confirmWarehouseReceipt(
              activeModal.order.id,
              segId,
              "سارة محمد",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "DISPATCH" && (
        <DispatchDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          customerName={activeModal.order.customerName || ""}
          address={activeModal.order.customerPhone || ""}
          quantity={stageQuantity(activeModal.order, "المستودع")}
          onConfirm={(repName) => {
            store.dispatchDelivery(activeModal.order.id, "سارة محمد", repName);
          }}
        />
      )}

      {activeModal && activeModal.type === "FAILED" && (
        <RecordDeliveryFailedDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          onConfirm={(reason) => {
            store.recordDeliveryFailed(
              activeModal.order.id,
              reason,
              "سارة محمد",
            );
          }}
        />
      )}

      {activeModal && activeModal.type === "RETRY" && (
        <RetryDeliveryDialog
          open={true}
          onClose={() => {
            setActiveModal(null);
          }}
          orderId={activeModal.order.id}
          onConfirm={(newDate, notes) => {
            store.retryDelivery(
              activeModal.order.id,
              "سارة محمد",
              newDate,
              notes,
            );
          }}
        />
      )}
    </div>
  );
}
