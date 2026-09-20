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
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";

export function SalesOrderDetailView({ orderId }: { orderId: string }) {
  const store = useMvpStore();
  const order = store.orders.find((o) => o.id === orderId) ?? notFound();
  const canEdit = order.status === "مسودة" || order.status === "معاد للتعديل";
  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    "tracking",
  );
  const activePiecesCount = order.items.filter((p) => !p.isDeleted).length;
  const eventsCount = store.events.filter((e) => e.orderId === order.id).length;

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

      {/* 2. Order Detail Action Tabs (Exact Department Tab Component) */}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={activePiecesCount}
        eventsCount={eventsCount}
      />

      {/* Tab Content */}
      <div className="pt-1">
        {/* TAB 1: Complete Order Tracking */}
        {activeTab === "tracking" && <OrderFullTrackingView order={order} />}

        {/* TAB 2: Exact Paper Form */}
        {activeTab === "form" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrderPaperForm order={order} mode="readOnly" />
          </div>
        )}

        {/* TAB 3: Activity Timeline */}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
  );
}
