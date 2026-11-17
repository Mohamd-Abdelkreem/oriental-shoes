"use client";

import { administrationFailureMessage } from "../model/administration-form.model";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronLeft,
  Clock,
  PackageCheck,
} from "lucide-react";
import { administrationOrdersQuerySchema } from "@template/contracts";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import {
  useAdministrationDashboard,
  useAdministrationActivity,
} from "../hooks/administration.hooks";
import { toAdministrationOrderRow } from "../model/administration-view.model";
import { toAdministrationActivityRow } from "../model/administration-event.model";
import {
  administrationOrderHref,
  administrationRouteHref,
} from "../model/administration-query.model";
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
  const dashboard = useAdministrationDashboard(),
    activity = useAdministrationActivity({ page: 1, limit: 5 });
  const counts = dashboard.data?.counts;
  const formatProductCount = (count: number) => `${String(count)} قطعة`;
  const formatOrderCount = (count: number) => `${String(count)} طلب`;
  const kpis: KpiCardItem[] = [
    {
      title: "الطلبات النشطة",
      value: counts?.activeOrders ?? "—",
      unit: "أمر تفصيل",
      subtitle: `${counts === undefined ? "—" : formatProductCount(counts.activePieces)} قيد المتابعة والتصنيع`,
      icon: Boxes,
      tone: "teal",
      href: "/admin/orders",
    },
    {
      title: "بانتظار الاعتماد",
      value: counts?.pendingApproval ?? "—",
      unit: "أمر تفصيل",
      subtitle: `${counts === undefined ? "—" : formatProductCount(counts.pendingApprovalPieces)} أرسلتها المبيعات`,
      icon: Clock,
      tone: "amber",
      href: "/admin/approvals",
    },
    {
      title: "طلبات متأخرة",
      value: counts?.overdueOrders ?? "—",
      unit: "أمر تفصيل",
      subtitle: `${counts === undefined ? "—" : formatProductCount(counts.overduePieces)} تجاوزت تاريخ التسليم`,
      icon: AlertTriangle,
      tone: (counts?.overdueOrders ?? 0) > 0 ? "rose" : "neutral",
      href: administrationRouteHref(
        "orders",
        administrationOrdersQuerySchema.parse({ exception: "OVERDUE" }),
      ),
    },
    {
      title: "جاهزة للتسليم (١٠٠٪)",
      value: counts?.readyOrders ?? "—",
      unit: "أمر تفصيل",
      subtitle: `${counts === undefined ? "—" : formatProductCount(counts.readyPieces)} مكتملة بالمستودع`,
      icon: PackageCheck,
      tone: "emerald",
      href: administrationRouteHref(
        "orders",
        administrationOrdersQuerySchema.parse({ status: "READY_FOR_DELIVERY" }),
      ),
    },
  ];

  const stages = [
    { id: "CUTTING", label: "القص" },
    { id: "PRODUCTION", label: "الإنتاج والإصلاح" },
    { id: "QUALITY", label: "الجودة والتغليف" },
    { id: "WAREHOUSE", label: "المستودع" },
  ] as const;

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

      {dashboard.isFetching && <p role="status">جارٍ تحميل لوحة الإدارة…</p>}
      {dashboard.isError && (
        <div role="alert">
          تعذر تحميل لوحة الإدارة.{" "}
          {administrationFailureMessage(dashboard.error, "review")}
          <button
            onClick={() => {
              void dashboard.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
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
              {counts === undefined
                ? "—"
                : formatProductCount(counts.activePieces)}
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {stages.map((stage, idx) => {
              const qty = dashboard.data?.departments.find(
                (row) => row.department === stage.id,
              )?.pieces;

              return (
                <div key={stage.id} className="flex items-center gap-4 text-sm">
                  <span className="w-6 font-mono text-xs text-slate-400">
                    0{idx + 1}
                  </span>
                  <span className="w-32 truncate font-semibold text-slate-700">
                    {stage.label}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all duration-500"
                      style={{
                        width: `${String(qty === undefined || !counts?.activePieces ? 0 : (qty / counts.activePieces) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-24 text-left font-bold text-slate-900">
                    {qty === undefined ? "—" : formatProductCount(qty)}
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
              {counts !== undefined && counts.pendingUsers > 0 && (
                <Link
                  href="/admin/users/pending"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-white">
                      {counts.pendingUsers} طلب تسجيل موظف معلق
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    يجب تعيين الصلاحية وتحديد القسم لاعتماد الحساب
                  </span>
                </Link>
              )}

              {counts !== undefined && counts.openCorrectionOrders > 0 && (
                <Link
                  href="/admin/corrections"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-amber-300">
                      {formatOrderCount(counts.openCorrectionOrders)} فيها دورة
                      تصحيح جودة
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    كميات معادة من الجودة للقص أو الإنتاج لإصلاح العيوب
                  </span>
                </Link>
              )}

              {counts !== undefined && counts.failedDeliveries > 0 && (
                <Link
                  href="/admin/delivery-exceptions"
                  className="block rounded-lg border border-slate-700/60 bg-slate-800/80 p-3 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-rose-300">
                      {counts.failedDeliveries} طلب تعذر تسليمه للعميل
                    </strong>
                    <ChevronLeft size={14} className="text-slate-400" />
                  </div>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    هاتف مغلق أو عنوان متعذر، يحتاج إعادة جدولة
                  </span>
                </Link>
              )}

              {counts?.pendingUsers === 0 &&
                counts.openCorrectionOrders === 0 &&
                counts.failedDeliveries === 0 && (
                  <p className="py-4 text-center text-xs text-slate-400">
                    لا توجد معوقات حرجة حالياً، سير العمل مستقر.
                  </p>
                )}
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
            <span>تاريخ النظام المعتمد:</span>
            <strong className="text-slate-200">
              {dashboard.data?.businessDate ?? "—"}
            </strong>
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
              عرض كل الطلبات ({counts?.totalOrders ?? "—"})
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {(dashboard.data?.recentOrders ?? []).map((item) => {
              const order = toAdministrationOrderRow(item);
              const req = order.counts?.active;

              return (
                <Link
                  key={order.reference}
                  href={administrationOrderHref(order.id)}
                  className="flex items-center justify-between rounded-lg px-2 py-3 transition hover:bg-slate-50"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong
                        className="font-mono text-xs font-bold text-slate-900"
                        dir="ltr"
                      >
                        {order.reference}
                      </strong>
                      <span className="text-xs text-slate-500">
                        · {order.customerName ?? "—"}
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-400">
                      {typeLabels[order.type]} · تسليم:{" "}
                      {order.deliveryDate ?? "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-left">
                    <div className="text-left">
                      <span className="block text-xs font-bold text-slate-800">
                        {order.counts === null
                          ? "لا توجد كميات تشغيلية لمسودة"
                          : `${String(order.counts.received)} من ${String(req)} بالمستودع`}
                      </span>
                      <small className="text-[10px] font-semibold text-teal-700">
                        {order.counts === null
                          ? "—"
                          : `${String(order.counts.completionPercent)}٪`}
                      </small>
                    </div>
                    <OrientalStatusPill tone={statusTone(order.statusLabel)}>
                      {order.statusLabel}
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

          {activity.isFetching && <p role="status">جارٍ تحميل الحركات…</p>}
          {activity.isError && (
            <div role="alert">
              تعذر تحميل الحركات.{" "}
              {administrationFailureMessage(activity.error, "review")}
              <button
                onClick={() => {
                  void activity.refetch();
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {(activity.data?.events ?? [])
              .map(toAdministrationActivityRow)
              .map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between py-2.5 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong className="font-semibold text-slate-800">
                        {ev.actionLabel}
                      </strong>
                      <span
                        className="font-mono text-[11px] text-slate-500"
                        dir="ltr"
                      >
                        {ev.orderId}
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-500">
                      بواسطة: {ev.actorName} ({ev.actorDepartmentLabel}){" "}
                      {ev.note ? `· ${ev.note}` : ""}
                    </span>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-400">
                    {ev.occurredAt}
                  </time>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
