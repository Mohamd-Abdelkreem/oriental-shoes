"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Boxes,
  Clock,
  FileEdit,
  FilePlus2,
  RotateCcw,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  requiredQuantity,
  totalQuantity,
  typeLabels,
  useMvpStore,
  formatProductCount,
  formatOrderPieceProgress,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import { SalesProblemContactModal } from "./sales-problem-contact-modal";

export function SalesDashboardView() {
  const store = useMvpStore();
  const salesOrders = store.orders.filter(
    (o) => o.salesperson === "ريم خالد" || o.salesperson === "ليان سعد",
  );

  const drafts = salesOrders.filter((o) => o.status === "مسودة");
  const returned = salesOrders.filter((o) => o.status === "معاد للتعديل");
  const pending = salesOrders.filter((o) => o.status === "بانتظار الاعتماد");
  const inFactory = salesOrders.filter(
    (o) => o.status === "قيد التصنيع" || o.status === "ملغي جزئياً",
  );

  const contactQueue: { order: MvpOrder; piece: ProductLine }[] = [];
  for (const order of salesOrders) {
    for (const piece of order.items) {
      if (!piece.isDeleted && piece.problem?.status === "sent_to_sales") {
        contactQueue.push({ order, piece });
      }
    }
  }
  const [activeProblemItem, setActiveProblemItem] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);

  const kpis: KpiCardItem[] = [
    {
      title: "المسودات",
      value: drafts.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(drafts.reduce((s, o) => s + totalQuantity(o), 0))} قيد الإعداد والتعديل`,
      icon: FileEdit,
      tone: "neutral",
      href: "/sales/orders/drafts",
    },
    {
      title: "معادة للتعديل",
      value: returned.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(returned.reduce((s, o) => s + totalQuantity(o), 0))} أعادها مسؤول الاعتماد`,
      icon: RotateCcw,
      tone: returned.length > 0 ? "rose" : "neutral",
      href: "/sales/orders/returned",
    },
    {
      title: "بانتظار الاعتماد",
      value: pending.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(pending.reduce((s, o) => s + totalQuantity(o), 0))} أُرسلت للمراجعة`,
      icon: Clock,
      tone: "amber",
      href: "/sales/orders?status=بانتظار الاعتماد",
    },
    {
      title: "معتمدة قيد التصنيع",
      value: inFactory.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(inFactory.reduce((s, o) => s + requiredQuantity(o), 0))} داخل خطوط المصنع`,
      icon: Boxes,
      tone: "teal",
      href: "/sales/orders?status=قيد التصنيع",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات والمعارض / مساحة العمل"
        title="لوحة المبيعات والطلبات"
        subtitle="إنشاء أوامر التفصيل، متابعة المسودات والمعادة للتصحيح، وتتبع مراحل التصنيع"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sales/orders/new" className="btn-pill btn-teal">
              <FilePlus2 size={16} />
              <span>+ إنشاء أمر تفصيل جديد</span>
            </Link>
            <Link href="/sales/customers" className="btn-pill btn-outline">
              <UserRound size={16} />
              <span>دليل العملاء</span>
            </Link>
          </div>
        }
      />

      {/* KPI Summary */}
      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* CUSTOMER CONTACT QUEUE (Option B from Approval) */}
      {contactQueue.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div className="flex-1 space-y-1 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <strong className="block text-sm font-bold">
                طلبات تحتاج تواصلًا مع العميل ({contactQueue.length} قطع)
              </strong>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                إحالة من مسؤول الاعتماد
              </span>
            </div>
            <p>
              أحال مسؤول الاعتماد هذه القطع للتواصل المباشر مع العميل وتعديل
              المواصفات أو إلغاء القطعة بناءً على رغبته.
            </p>
            <div className="mt-3 space-y-2">
              {contactQueue.map(({ order, piece }) => (
                <div
                  key={`${order.id}-${piece.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <b className="font-mono text-xs text-slate-800" dir="ltr">
                        {order.id}
                      </b>
                      <span className="text-xs text-slate-700">
                        · {piece.pieceNumber || "القطعة"} ({piece.model})
                      </span>
                      <span className="text-xs text-slate-500">
                        · العميل: {order.customer} ({order.phone})
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-rose-700">
                      المشكلة: {piece.problem?.reason} — {piece.problem?.notes}
                    </p>
                    {piece.problem?.approvalNotes && (
                      <p className="text-[11px] text-amber-800">
                        توجيه الاعتماد: {piece.problem.approvalNotes}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProblemItem({ order, piece });
                    }}
                    className="btn-pill btn-amber px-3 py-1 text-xs font-bold"
                  >
                    تعديل المواصفات والتواصل
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Actionable Sections: Returned & Drafts Alert */}
      {returned.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <RotateCcw className="mt-0.5 shrink-0 text-rose-600" size={18} />
          <div className="flex-1 space-y-1 text-xs text-rose-900">
            <strong className="block text-sm font-bold">
              لديك {returned.length} طلبات معادة للتعديل من قِبل إدارة الاعتماد:
            </strong>
            <p>
              يرجى مراجعة سبب الإرجاع المسجل على كل طلب وتصحيح الحقول المطلوبة
              ثم إعادة إرسالها للاعتماد.
            </p>
          </div>
          <Link
            href="/sales/orders/returned"
            className="btn-pill btn-rose shrink-0 px-3 py-1.5 text-xs"
          >
            مراجعة الطلبات المعادة الآن
          </Link>
        </div>
      )}

      {/* Main Grid: Recent Orders & Quick Customer Search */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Orders (2 cols) */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-sm font-bold text-slate-800">
              أحدث أوامر المبيعات الخاصة بك
            </h2>
            <Link
              href="/sales/orders"
              className="text-xs text-teal-600 hover:underline"
            >
              عرض كل طلبات المبيعات ({salesOrders.length})
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {salesOrders.slice(0, 5).map((order) => {
              const req = requiredQuantity(order);
              const progressText = formatOrderPieceProgress(order);

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg px-2 py-3 transition hover:bg-slate-50"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong
                        className="font-mono text-xs font-bold text-slate-900"
                        dir="ltr"
                      >
                        {order.id}
                      </strong>
                      <span className="text-xs text-slate-600">
                        · {order.customer}
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-400">
                      {typeLabels[order.type]} · تسليم متوقع: {order.delivery}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <span className="block text-xs font-bold text-slate-800">
                        {progressText}
                      </span>
                      <small className="text-[10px] text-slate-500">
                        {order.warehouse > 0
                          ? `${String(order.warehouse)} من ${String(req)} بالمستودع`
                          : "داخل خطوط المصنع"}
                      </small>
                    </div>

                    <OrientalStatusPill tone={statusTone(order.status)}>
                      {order.status}
                    </OrientalStatusPill>

                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="btn-pill btn-outline px-2.5 py-1 text-xs"
                    >
                      عرض
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Customer Search & Stats (1 col) */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-sm font-bold text-slate-800">
              العملاء والنشاط الأخير
            </h2>
            <Link
              href="/sales/customers"
              className="text-xs text-teal-600 hover:underline"
            >
              دليل العملاء
            </Link>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-500">
              أحدث العملاء المضافين:
            </span>
            {store.customers.slice(0, 4).map((c) => (
              <Link
                key={c.phone}
                href={`/sales/customers/${c.phone}`}
                className="block rounded-lg border border-slate-100 p-2.5 transition hover:border-teal-200 hover:bg-teal-50/40"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs text-slate-800">{c.name}</strong>
                  <span
                    className="font-mono text-[11px] text-slate-500"
                    dir="ltr"
                  >
                    {c.phone}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                  {c.address}
                </span>
              </Link>
            ))}
          </div>

          <Link
            href="/sales/customers/new"
            className="btn-pill btn-outline w-full justify-center text-xs"
          >
            <UserPlus size={14} />
            <span>إضافة عميل جديد</span>
          </Link>
        </div>
      </div>

      {activeProblemItem && (
        <SalesProblemContactModal
          order={activeProblemItem.order}
          piece={activeProblemItem.piece}
          onClose={() => {
            setActiveProblemItem(null);
          }}
        />
      )}
    </div>
  );
}
