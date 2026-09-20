"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Boxes, Printer } from "lucide-react";
import {
  typeLabels,
  useMvpStore,
  type Role,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import { getDeptArabicName } from "./get-dept-arabic-name";
import { getDeptLocation } from "./get-dept-location";

export function ManufacturingOrderDetailView({
  orderId,
  deptRole = "cutting",
}: {
  orderId: string;
  deptRole?: Exclude<Role, "admin" | "sales" | "approval">;
}) {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get("tab");

  const order = store.orders.find((o) => o.id === orderId) ?? notFound();

  const deptRoleName = getDeptArabicName(deptRole);
  const targetLocation = getDeptLocation(deptRole);
  const basePath = deptRole === "special" ? "special-operations" : deptRole;

  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    paramTab === "tracking" || paramTab === "form" || paramTab === "history"
      ? paramTab
      : "tracking",
  );

  const activePieces = order.items.filter((p) => !p.isDeleted);
  const activePiecesCount = activePieces.length;
  const eventsCount = store.events.filter((e) => e.orderId === order.id).length;
  const deptPieces = activePieces.filter(
    (p) => p.currentLocation === targetLocation,
  );
  const problemPieces = activePieces.filter(
    (p) => p.problem || p.currentLocation === "لدى الاعتماد بسبب مشكلة",
  );

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <OrientalPageHeader
        eyebrow={`${deptRoleName} / تفاصيل أمر التفصيل / ${order.id}`}
        title={`أمر تفصيل ${typeLabels[order.type]} — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · موعد التسليم: ${order.delivery} · هاتف العميل: ${order.phone}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/print/order/${order.id}`}
              className="btn-pill btn-secondary"
              target="_blank"
            >
              <Printer size={15} />
              <span>معاينة الطباعة</span>
            </Link>
            <Link
              href={`/${basePath}/dashboard`}
              className="btn-pill btn-secondary"
            >
              <ArrowRight size={15} />
              <span>العودة لـ {deptRoleName}</span>
            </Link>
          </div>
        }
      />

      {/* 2. Department Context Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4 text-xs">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-teal-700 p-2 text-white shadow-xs">
            <Boxes size={18} />
          </span>
          <div>
            <strong className="block text-sm font-bold text-teal-950">
              الموقف التشغيلي في {deptRoleName}: {deptPieces.length} من أصل{" "}
              {activePiecesCount} قطع متواجدة بالقسم الآن
            </strong>
            <span className="text-teal-800">
              {deptPieces.length > 0
                ? `توجد ${String(deptPieces.length)} قطع تابعة لهذا الأمر تخضع لعمليات ${deptRoleName}`
                : `لا توجد قطع من هذا الطلب حالياً في ${deptRoleName} (إما لم تصل بعد أو تم إنجازها وتحويلها للمراحل التالية)`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-teal-200/80 px-3 py-1 font-mono text-xs font-bold text-teal-900">
            {order.id}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
            {typeLabels[order.type]}
          </span>
        </div>
      </div>

      {/* 3. Problem Alert Banner (if any) */}
      {problemPieces.length > 0 && (
        <div className="space-y-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span>
              تنبيه: توجد عوائق أو مشكلات مسجلة على هذا الطلب (
              {String(problemPieces.length)} قطع):
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            {problemPieces.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white p-2.5"
              >
                <div>
                  <span className="font-bold text-slate-900">
                    {p.pieceNumber || "القطعة"} ({p.model} · مقاس {p.size})
                  </span>
                  <span className="mr-2 text-rose-700">
                    — المشكلة: <b>{p.problem?.reason}</b>
                    {p.problem?.notes ? ` (${p.problem.notes})` : ""}
                  </span>
                </div>
                <span className="rounded bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  الموقع: {p.currentLocation}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Action Tabs */}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={activePiecesCount}
        eventsCount={eventsCount}
      />

      {/* 5. Tab Content */}
      <div className="pt-1">
        {/* TAB 1: Tracking View */}
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
                .slice()
                .reverse()}
              keyExtractor={(e) => e.id}
              emptyTitle="لا توجد حركات مسجلة"
              emptySubtitle="لم تسجل أي أحداث تشغيلية لهذا الطلب بعد."
              columns={[
                {
                  header: "الحدث",
                  render: (e) => (
                    <strong className="text-slate-800">{e.event}</strong>
                  ),
                },
                {
                  header: "المنفذ",
                  render: (e) => `${e.actor} (${e.role})`,
                },
                {
                  header: "الوجهة",
                  render: (e) => e.destination || "—",
                },
                {
                  header: "التفاصيل والملاحظات",
                  render: (e) => e.note || "—",
                },
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
