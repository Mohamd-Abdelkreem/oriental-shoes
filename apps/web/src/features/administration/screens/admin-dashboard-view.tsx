"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronLeft,
  Clock,
  PackageCheck,
} from "lucide-react";
import {
  formatOrderPieceProgress,
  requiredQuantity,
  stageQuantity,
  typeLabels,
  useMvpStore,
  formatOrderCount,
  formatProductCount,
  type Stage,
} from "@/features/prototype/state/mvp-store";
import {
  DEMO_DATE_ISO,
  isOrderOverdue,
} from "@/features/prototype/state/workflow";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";

export function AdminDashboardView() {
  const store = useMvpStore();

  const activeOrders = store.orders.filter(
    (o) => !["تم الاستلام", "ملغي بالكامل"].includes(o.status),
  );
  const pendingApproval = store.orders.filter(
    (o) => o.status === "بانتظار الاعتماد",
  );
  const delayedOrders = store.orders.filter((o) => isOrderOverdue(o));
  const readyOrders = store.orders.filter((o) => o.status === "جاهز للتسليم");

  const pendingUsers = store.employees.filter(
    (e) => e.status === "بانتظار الموافقة",
  );
  const failedDeliveries = store.orders.filter(
    (o) => o.status === "تعذر التسليم",
  );
  const ordersWithCorrections = store.orders.filter(
    (o) => o.corrections && o.corrections.some((c) => !c.resolved),
  );

  const kpis: KpiCardItem[] = [
    {
      title: "الطلبات النشطة",
      value: activeOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(activeOrders.reduce((s, o) => s + requiredQuantity(o), 0))} قيد المتابعة والتصنيع`,
      icon: Boxes,
      tone: "teal",
      href: "/admin/orders",
    },
    {
      title: "بانتظار الاعتماد",
      value: pendingApproval.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(pendingApproval.reduce((s, o) => s + requiredQuantity(o), 0))} أرسلتها المبيعات`,
      icon: Clock,
      tone: "amber",
      href: "/admin/approvals",
    },
    {
      title: "طلبات متأخرة",
      value: delayedOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(delayedOrders.reduce((s, o) => s + requiredQuantity(o), 0))} تجاوزت تاريخ التسليم`,
      icon: AlertTriangle,
      tone: delayedOrders.length > 0 ? "rose" : "neutral",
      href: "/admin/orders?flag=متأخرة",
    },
    {
      title: "جاهزة للتسليم (١٠٠٪)",
      value: readyOrders.length,
      unit: "أمر تفصيل",
      subtitle: `${formatProductCount(readyOrders.reduce((s, o) => s + requiredQuantity(o), 0))} مكتملة بالمستودع`,
      icon: PackageCheck,
      tone: "emerald",
      href: "/admin/orders?status=جاهز للتسليم",
    },
  ];

  const stages: Stage[] = [
    "القص",
    "الإنتاج والإصلاح",
    "العمليات الخاصة",
    "الجودة والتغليف",
    "المستودع",
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / لوحة التحكم الرئيسية"
        title="لوحة الإدارة والمتابعة الشاملة"
        subtitle="مراقبة حركة الطلبات، توزيع الكميات، وتدخلات الجودة والتسليم عبر خطوط المصنع"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/orders" className="btn-pill btn-outline">
              <Boxes size={15} />
              <span>جميع الطلبات</span>
            </Link>
            <Link href="/admin/reports" className="btn-pill btn-teal">
              <BarChart3 size={15} />
              <span>التقارير التشغيلية</span>
            </Link>
          </div>
        }
      />

      {/* Primary KPI Grid */}
      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Grid: Distribution and Needs Attention */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Factory Quantity Distribution (2 Cols) */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                توزيع الكميات الفعلي في المصنع الآن
              </h2>
              <p className="text-xs text-slate-500">
                حصر فوري لعدد القطع النشطة في كل قسم تشغيلي
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
              إجمالي النشط:{" "}
              {formatProductCount(
                store.orders.reduce(
                  (acc, o) =>
                    acc +
                    o.segments
                      .filter(
                        (s) => s.stage !== "ملغاة" && s.stage !== "تم الاستلام",
                      )
                      .reduce((sum, s) => sum + s.quantity, 0),
                  0,
                ),
              )}
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {stages.map((stage, idx) => {
              const qty = store.orders.reduce(
                (sum, o) => sum + stageQuantity(o, stage),
                0,
              );
              return (
                <div key={stage} className="flex items-center gap-4 text-sm">
                  <span className="w-6 font-mono text-xs text-slate-400">
                    0{idx + 1}
                  </span>
                  <span className="w-32 truncate font-semibold text-slate-700">
                    {stage}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all duration-500"
                      style={{
                        width: `${String(Math.min(100, Math.max(5, qty * 10)))}%`,
                      }}
                    />
                  </div>
                  <span className="w-24 text-left font-bold text-slate-900">
                    {formatProductCount(qty)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Needs Attention Card (1 Col) */}
        <div className="flex flex-col justify-between space-y-4 rounded-xl bg-slate-900 p-5 text-white shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-semibold text-amber-400">
                تنبيهات فورية
              </span>
              <span className="text-xs text-slate-400">
                تتطلب تدخلاً إدارياً
              </span>
            </div>

            <div className="space-y-3 pt-3">
              {pendingUsers.length > 0 && (
                <Link
                  href="/admin/users/pending"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-white">
                      {pendingUsers.length} طلب تسجيل موظف معلق
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    يجب تعيين الصلاحية وتحديد القسم لاعتماد الحساب
                  </span>
                </Link>
              )}

              {ordersWithCorrections.length > 0 && (
                <Link
                  href="/admin/corrections"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-amber-300">
                      {formatOrderCount(ordersWithCorrections.length)} فيها دورة
                      تصحيح جودة
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    كميات معادة من الجودة للقص أو الإنتاج لإصلاح العيوب
                  </span>
                </Link>
              )}

              {failedDeliveries.length > 0 && (
                <Link
                  href="/admin/delivery-exceptions"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-rose-300">
                      {failedDeliveries.length} طلب تعذر تسليمه للعميل
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    هاتف مغلق أو عنوان متعذر، يحتاج إعادة جدولة
                  </span>
                </Link>
              )}

              {pendingUsers.length === 0 &&
                ordersWithCorrections.length === 0 &&
                failedDeliveries.length === 0 && (
                  <p className="py-4 text-center text-xs text-slate-400">
                    لا توجد معوقات حرجة حالياً، سير العمل مستقر.
                  </p>
                )}
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
            <span>تاريخ النظام المعتمد:</span>
            <strong className="text-slate-200">{DEMO_DATE_ISO}</strong>
          </div>
        </div>
      </div>

      {/* Recent Orders & Unified Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              أحدث طلبات التصنيع المحدثة
            </h2>
            <Link
              href="/admin/orders"
              className="text-xs text-teal-600 hover:underline"
            >
              عرض كل الطلبات ({store.orders.length})
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {store.orders.slice(0, 5).map((order) => {
              const req = requiredQuantity(order);

              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
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
                      <span className="text-xs text-slate-500">
                        · {order.customer}
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-400">
                      {typeLabels[order.type]} · تسليم: {order.delivery}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-left">
                    <div className="text-left">
                      <span className="block text-xs font-bold text-slate-800">
                        {order.warehouse} من {req} بالمستودع
                      </span>
                      <small className="text-[10px] font-semibold text-teal-700">
                        {formatOrderPieceProgress(order)}
                      </small>
                    </div>
                    <OrientalStatusPill tone={statusTone(order.status)}>
                      {order.status}
                    </OrientalStatusPill>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Global Activity Preview */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              أحدث الحركات والنشاطات المسجلة
            </h2>
            <Link
              href="/admin/activity"
              className="text-xs text-teal-600 hover:underline"
            >
              سجل النشاط العام
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {store.events
              .slice(-5)
              .reverse()
              .map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between py-2.5 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong className="font-semibold text-slate-800">
                        {ev.event}
                      </strong>
                      <span
                        className="font-mono text-[11px] text-slate-500"
                        dir="ltr"
                      >
                        {ev.orderId}
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-500">
                      بواسطة: {ev.actor} ({ev.role}){" "}
                      {ev.note ? `· ${ev.note}` : ""}
                    </span>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-400">
                    {ev.time}
                  </time>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
