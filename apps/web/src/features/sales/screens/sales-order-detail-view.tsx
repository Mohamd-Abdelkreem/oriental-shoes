"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Edit, Printer } from "lucide-react";
import { typeLabels, useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { ManufacturingRail } from "@/features/prototype/components/manufacturing-rail";
import { QuantityReconciliation } from "@/features/prototype/components/quantity-reconciliation";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";

export function SalesOrderDetailView({ orderId }: { orderId: string }) {
  const store = useMvpStore();
  const order =
    store.orders.find((o) => o.id === orderId) || store.orders[0] || notFound();
  const canEdit = order.status === "مسودة" || order.status === "معاد للتعديل";
  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    "tracking",
  );

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`المبيعات / تتبع الطلب / ${order.id}`}
        title={`${typeLabels[order.type]} — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · تاريخ التسليم: ${order.delivery}`}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                href={`/sales/orders/new?edit=${order.id}`}
                className="btn-pill btn-teal"
              >
                <Edit size={15} />
                <span>تعديل الطلب</span>
              </Link>
            )}
            <Link
              href={`/print/order/${order.id}`}
              className="btn-pill btn-secondary"
              target="_blank"
            >
              <Printer size={15} />
              <span>معاينة الطباعة</span>
            </Link>
            <Link href="/sales/orders" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة للقائمة</span>
            </Link>
          </div>
        }
      />

      {/* Progress Rail */}
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
            الورقة الرسمية لأمر التفصيل
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
            سجل الحركات والتوقيتات (
            {store.events.filter((e) => e.orderId === order.id).length})
          </button>
        </div>

        <div className="p-5">
          {/* TAB 1: Complete Order Tracking */}
          {activeTab === "tracking" && (
            <OrderFullTrackingView order={order} mode="sales" />
          )}

          {/* TAB 2: Exact Paper Form */}
          {activeTab === "form" && (
            <div className="space-y-4">
              <OrderPaperForm order={order} mode="readOnly" />
            </div>
          )}

          {/* TAB 3: Activity Timeline */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <OrientalTable
                data={store.events
                  .filter((e) => e.orderId === order.id)
                  .reverse()}
                keyExtractor={(e) => e.id}
                columns={[
                  {
                    header: "الحدث",
                    render: (e) => (
                      <strong className="text-slate-800">{e.event}</strong>
                    ),
                  },
                  { header: "المنفذ", render: (e) => `${e.actor} (${e.role})` },
                  { header: "التفاصيل", render: (e) => e.note || "—" },
                  {
                    header: "التوقيت",
                    accessor: "time",
                    className: "text-slate-400 font-mono text-xs",
                  },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
