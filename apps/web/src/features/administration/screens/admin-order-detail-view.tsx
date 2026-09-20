"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Printer, RotateCcw, Trash2 } from "lucide-react";
import {
  requiredQuantity,
  totalQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { ManufacturingRail } from "@/features/prototype/components/manufacturing-rail";
import { QuantityReconciliation } from "@/features/prototype/components/quantity-reconciliation";
import {
  AdminCancelDialog,
  AdminReopenDialog,
} from "@/features/prototype/components/action-dialogs";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";

export function AdminOrderDetailView({ orderId }: { orderId: string }) {
  const store = useMvpStore();
  const order =
    store.orders.find((o) => o.id === orderId) || store.orders[0] || notFound();

  const [cancelModal, setCancelModal] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    "tracking",
  );

  const orig = totalQuantity(order);
  const canc = order.cancelled;
  const req = requiredQuantity(order);
  const rec = order.warehouse;

  const canCancel =
    order.status !== "خرج مع المندوب" &&
    order.status !== "تم الاستلام" &&
    order.status !== "ملغي بالكامل" &&
    req > 0;

  const canReopen =
    order.status === "تم الاستلام" || order.status === "ملغي بالكامل";

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <OrientalPageHeader
        eyebrow={`الإدارة العامة / تفاصيل الطلب / ${order.id}`}
        title={`${typeLabels[order.type]} — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · تاريخ التسليم: ${order.delivery}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/orders/${order.id}/print`}
              className="btn-pill btn-secondary"
              target="_blank"
            >
              <Printer size={15} />
              <span>طباعة أمر التفصيل الرسمي</span>
            </Link>

            {canCancel && (
              <button
                type="button"
                className="btn-pill btn-rose"
                onClick={() => {
                  setCancelModal(true);
                }}
              >
                <Trash2 size={15} />
                <span>إلغاء كمية إدارياً</span>
              </button>
            )}

            {canReopen && (
              <button
                type="button"
                className="btn-pill btn-teal"
                onClick={() => {
                  setReopenModal(true);
                }}
              >
                <RotateCcw size={15} />
                <span>إعادة فتح أمر التفصيل</span>
              </button>
            )}

            <Link href="/admin/orders" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة للطلبات</span>
            </Link>
          </div>
        }
      />

      {/* Reopened Banner */}
      {order.reopenedAt && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <RotateCcw size={18} className="mt-0.5 shrink-0 text-teal-600" />
          <div>
            <strong className="block font-bold">
              تمت إعادة فتح هذا الطلب إدارياً:
            </strong>
            <p className="mt-0.5 text-xs text-teal-800">
              أعيد فتحه بواسطة {order.reopenedBy || "الإدارة"} بتاريخ{" "}
              {order.reopenedAt} · السبب:{" "}
              {order.reopenReason || "متابعة تشغيلية"}
            </p>
          </div>
        </div>
      )}

      {/* Manufacturing Rail */}
      <ManufacturingRail order={order} />

      {/* Reconciled Quantity Block */}
      <QuantityReconciliation order={order} />

      {/* Detail Tabs */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-4 border-b border-slate-200 px-5 pt-3">
          <button
            type="button"
            className={`border-b-2 pb-3 text-sm font-semibold transition ${
              activeTab === "tracking"
                ? "border-teal-600 font-bold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => {
              setActiveTab("tracking");
            }}
          >
            تتبع أمر التفصيل ومسار الكميات
          </button>
          <button
            type="button"
            className={`border-b-2 pb-3 text-sm font-semibold transition ${
              activeTab === "form"
                ? "border-teal-600 font-bold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => {
              setActiveTab("form");
            }}
          >
            نموذج أمر التفصيل الورقي الكامل
          </button>
          <button
            type="button"
            className={`border-b-2 pb-3 text-sm font-semibold transition ${
              activeTab === "history"
                ? "border-teal-600 font-bold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => {
              setActiveTab("history");
            }}
          >
            سجل الرقابة والحركات (
            {store.events.filter((e) => e.orderId === order.id).length})
          </button>
        </div>

        <div className="p-5">
          {/* TAB 1: Complete Order Tracking */}
          {activeTab === "tracking" && (
            <OrderFullTrackingView
              order={order}
              mode="admin"
              onCancelClick={() => {
                setCancelModal(true);
              }}
              onReopenClick={() => {
                setReopenModal(true);
              }}
            />
          )}

          {/* TAB 2: Exact Paper Form */}
          {activeTab === "form" && (
            <div className="space-y-4">
              <OrderPaperForm order={order} mode="admin" />
            </div>
          )}

          {/* TAB 3: Audit & Event History */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <OrientalTable
                data={store.events
                  .filter((e) => e.orderId === order.id)
                  .reverse()}
                keyExtractor={(e) => e.id}
                columns={[
                  {
                    header: "الحدث والإجراء",
                    render: (e) => (
                      <strong className="text-slate-800">{e.event}</strong>
                    ),
                  },
                  {
                    header: "المنفذ",
                    render: (e) => (
                      <span className="text-xs">
                        {e.actor} ({e.role})
                      </span>
                    ),
                  },
                  {
                    header: "الكمية المعنية",
                    render: (e) => (
                      <span className="text-xs font-bold">
                        {e.quantity ? `${String(e.quantity)} قطعة` : "—"}
                      </span>
                    ),
                  },
                  {
                    header: "من / إلى",
                    render: (e) => (
                      <span className="text-xs text-slate-600">
                        {e.source ? `${e.source} ← ` : ""}
                        {e.destination || "—"}
                      </span>
                    ),
                  },
                  {
                    header: "الملاحظات",
                    render: (e) => (
                      <span className="text-xs text-slate-500">
                        {e.note || "—"}
                      </span>
                    ),
                  },
                  {
                    header: "التوقيت",
                    accessor: "time",
                    className: "text-slate-400 text-xs",
                  },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {/* Cancellation Dialog */}
      <AdminCancelDialog
        open={cancelModal}
        onClose={() => {
          setCancelModal(false);
        }}
        orderId={order.id}
        totalQty={orig}
        cancelledSoFar={canc}
        activeReqQty={req}
        warehouseQty={rec}
        items={order.items}
        onConfirm={(cancelQty, reason, itemId) => {
          store.adminCancelQuantity(
            order.id,
            cancelQty,
            reason,
            "محمد العتيبي",
            itemId,
          );
        }}
      />

      {/* Administrative Reopen Dialog */}
      <AdminReopenDialog
        open={reopenModal}
        onClose={() => {
          setReopenModal(false);
        }}
        orderId={order.id}
        currentStatus={order.status}
        approvalDate={order.created}
        activeReqQty={req}
        warehouseQty={rec}
        onConfirm={(reason) => {
          store.adminReopenOrder(order.id, reason, "محمد العتيبي");
        }}
      />
    </div>
  );
}
