"use client";
import type {
  ManufacturingDashboardData,
  QualityDashboardData,
  ManufacturingDepartment,
} from "@template/contracts";

import Link from "next/link";
import { ArrowLeft, Calendar, Layers, User } from "lucide-react";
import {
  typeLabels,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";
import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import {
  dashboardSections,
  type DepartmentRole,
} from "./department-dashboard-config";

type Props = {
  deptRole: DepartmentRole;
  orders: MvpOrder[];
  incomingOrdersCount: number;
  incomingPiecesCount: number;
  inProgressOrdersCount: number;
  inProgressPiecesCount: number;
  returnedOrdersCount: number;
  returnedPiecesCount: number;
  completedOrdersCount: number;
  completedPiecesCount: number;
};

function LegacyDepartmentDashboardOverview({
  deptRole,
  orders,
  incomingOrdersCount,
  incomingPiecesCount,
  inProgressOrdersCount,
  inProgressPiecesCount,
  returnedOrdersCount,
  returnedPiecesCount,
  completedOrdersCount,
  completedPiecesCount,
}: Props) {
  const deptRoleName = getDeptArabicName(deptRole);
  const targetLocation = getDeptLocation(deptRole);

  const config = dashboardSections[deptRole];

  const activeOrdersInDept = orders
    .filter((o) => {
      const activePieces = o.items.filter((p) => !p.isDeleted);
      return activePieces.some(
        (p) =>
          p.currentLocation === targetLocation ||
          p.deptStatus === "جاهزة للعمل" ||
          p.deptStatus === "جاري العمل",
      );
    })
    .slice(0, 8);

  const sections = [
    {
      ...config.incoming,
      ordersCount: incomingOrdersCount,
      piecesCount: incomingPiecesCount,
      badgeTone: "bg-amber-50 text-amber-900 border-amber-200/80",
      iconBg: "bg-amber-100 text-amber-800",
      buttonColor: "hover:bg-amber-50 text-amber-900 border-amber-200",
    },
    {
      ...config.inProgress,
      ordersCount: inProgressOrdersCount,
      piecesCount: inProgressPiecesCount,
      badgeTone: "bg-teal-50 text-teal-900 border-teal-200/80",
      iconBg: "bg-teal-100 text-teal-800",
      buttonColor: "hover:bg-teal-50 text-teal-900 border-teal-200",
    },
    {
      ...config.returned,
      ordersCount: returnedOrdersCount,
      piecesCount: returnedPiecesCount,
      badgeTone: "bg-rose-50 text-rose-900 border-rose-200/80",
      iconBg: "bg-rose-100 text-rose-800",
      buttonColor: "hover:bg-rose-50 text-rose-900 border-rose-200",
    },
    {
      ...config.completed,
      ordersCount: completedOrdersCount,
      piecesCount: completedPiecesCount,
      badgeTone: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
      iconBg: "bg-emerald-100 text-emerald-800",
      buttonColor: "hover:bg-emerald-50 text-emerald-900 border-emerald-200",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((sec) => {
          const Icon = sec.icon;
          return (
            <div
              key={sec.href}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${sec.iconBg}`}
                  >
                    <Icon size={16} />
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${sec.badgeTone}`}
                  >
                    {sec.ordersCount} أمر · {sec.piecesCount} قطعة
                  </span>
                </div>

                <div className="mt-3">
                  <h4 className="text-sm font-bold text-slate-800">
                    {sec.title}
                  </h4>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {sec.subtitle}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <Link
                  href={sec.href}
                  className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${sec.buttonColor}`}
                >
                  <span>فتح الصفحة المخصصة</span>
                  <ArrowLeft size={14} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-teal-700" />
            <h3 className="text-xs font-bold text-slate-800">
              ملخص الأوامر النشطة حالياً في {deptRoleName}
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            أحدث أوامر التفصيل في انتظار أو قيد المعالجة
          </span>
        </div>

        {activeOrdersInDept.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            لا توجد أوامر نشطة قيد العمل في {deptRoleName} حالياً
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeOrdersInDept.map((order) => {
              const activePieces = order.items.filter((p) => !p.isDeleted);
              const deptPieces = activePieces.filter(
                (p) => p.currentLocation === targetLocation,
              );
              const isStarted = deptPieces.some(
                (p) =>
                  p.deptStatus === "جاري العمل" ||
                  p.deptStatus === "جاري الفحص",
              );

              return (
                <div
                  key={order.id}
                  className="flex flex-col gap-2.5 px-1 py-3 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-2.5 text-xs sm:gap-3">
                    <Link
                      href={`/${deptRole}/orders/${order.id}`}
                      className="font-mono font-bold text-teal-800 hover:underline"
                    >
                      {order.id}
                    </Link>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {typeLabels[order.type]}
                    </span>
                    <span className="text-slate-300">·</span>
                    <div className="flex items-center gap-1 text-slate-800">
                      <User size={13} className="text-slate-400" />
                      <span className="font-bold">
                        {order.customer || order.customerName}
                      </span>
                    </div>
                    <span className="text-slate-300">·</span>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Calendar size={13} className="text-slate-400" />
                      <span>
                        التسليم: {order.deliveryDate || order.delivery}
                      </span>
                    </div>
                  </div>

                  <div className="mr-auto flex items-center gap-2 text-xs sm:mr-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                      <span>{deptPieces.length} قطع بالقسم</span>
                    </span>

                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        isStarted
                          ? "border border-teal-200 bg-teal-50 text-teal-900"
                          : "border border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      {isStarted ? "قيد التشغيل" : "بانتظار البدء"}
                    </span>

                    <Link
                      href={{
                        pathname: isStarted
                          ? `/${deptRole}/in-progress`
                          : `/${deptRole}/incoming`,
                      }}
                      className="btn-pill btn-secondary px-2.5 py-1 text-xs"
                    >
                      فتح بالقسم
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DepartmentDashboardOverview(
  props:
    | Props
    | {
        source: "persisted";
        department: ManufacturingDepartment;
        data: ManufacturingDashboardData;
      }
    | { source: "quality"; data: QualityDashboardData },
) {
  if ("source" in props && props.source === "quality")
    return <QualityDepartmentDashboardOverview data={props.data} />;
  if ("source" in props)
    return <PersistedDepartmentDashboardOverview {...props} />;
  return <LegacyDepartmentDashboardOverview {...props} />;
}
function PersistedDepartmentDashboardOverview({
  department,
  data,
}: {
  department: ManufacturingDepartment;
  data: ManufacturingDashboardData;
}) {
  const role = department === "CUTTING" ? "cutting" : "production",
    config = dashboardSections[role];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["incoming", "inProgress", "returned", "completed"] as const).map(
          (key) => {
            const Icon = config[key].icon;
            const styles = {
              amber: "bg-amber-50 text-amber-900 border-amber-200/80",
              teal: "bg-teal-50 text-teal-900 border-teal-200/80",
              rose: "bg-rose-50 text-rose-900 border-rose-200/80",
              emerald: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
            };
            const color =
              key === "incoming"
                ? styles.amber
                : key === "inProgress"
                  ? styles.teal
                  : key === "returned"
                    ? styles.rose
                    : styles.emerald;
            return (
              <div
                key={key}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border ${color}`}
                  >
                    <Icon size={16} />
                  </span>
                  <strong
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${color}`}
                  >
                    {data.counts[key].orders} أمر · {data.counts[key].pieces}{" "}
                    قطعة
                  </strong>
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-800">
                  {config[key].title}
                </h4>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {config[key].subtitle}
                </p>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Link
                    href={config[key].href}
                    className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${color}`}
                  >
                    <span>فتح الصفحة المخصصة</span>
                    <ArrowLeft size={14} />
                  </Link>
                </div>
              </div>
            );
          },
        )}
      </div>
      <section className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <Layers size={16} className="text-teal-700" />
          <h3 className="text-xs font-bold text-slate-800">أحدث أوامر القسم</h3>
        </div>
        {data.recentOrders.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            لا توجد أوامر نشطة قيد العمل في القسم حالياً
          </p>
        )}
        {data.recentOrders.map((order) => (
          <Link
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            key={order.id}
            href={`/${role}/orders/${order.id}`}
          >
            <span className="text-xs font-bold text-teal-800">
              {order.businessNumber} · {order.customerName}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-bold ${order.hasInProgress ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
            >
              {order.matchingPieceCount} قطعة ·{" "}
              {order.hasInProgress ? "قيد التنفيذ" : "بانتظار الاستلام والبدء"}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function QualityDepartmentDashboardOverview({
  data,
}: {
  data: QualityDashboardData;
}) {
  const role = "quality",
    config = {
      incoming: dashboardSections.quality.incoming,
      inspection: dashboardSections.quality.inProgress,
      corrections: {
        ...dashboardSections.quality.returned,
        subtitle: "متابعة متداخلة مع الوارد والفحص؛ لا تجمع العدادات",
      },
      accepted: {
        ...dashboardSections.quality.completed,
        subtitle: "قبول وتحويل لوارد المستودع؛ الاستلام الفعلي مستقل",
      },
    };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["incoming", "inspection", "corrections", "accepted"] as const).map(
          (key) => {
            const Icon = config[key].icon;
            const styles = {
              amber: "bg-amber-50 text-amber-900 border-amber-200/80",
              teal: "bg-teal-50 text-teal-900 border-teal-200/80",
              rose: "bg-rose-50 text-rose-900 border-rose-200/80",
              emerald: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
            };
            const color =
              key === "incoming"
                ? styles.amber
                : key === "inspection"
                  ? styles.teal
                  : key === "corrections"
                    ? styles.rose
                    : styles.emerald;
            return (
              <div
                key={key}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border ${color}`}
                  >
                    <Icon size={16} />
                  </span>
                  <strong
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${color}`}
                  >
                    {data.counts[key].orders} أمر · {data.counts[key].pieces}{" "}
                    قطعة
                  </strong>
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-800">
                  {config[key].title}
                </h4>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {config[key].subtitle}
                </p>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Link
                    href={config[key].href}
                    className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${color}`}
                  >
                    <span>فتح الصفحة المخصصة</span>
                    <ArrowLeft size={14} />
                  </Link>
                </div>
              </div>
            );
          },
        )}
      </div>
      <section className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <Layers size={16} className="text-teal-700" />
          <h3 className="text-xs font-bold text-slate-800">أحدث أوامر القسم</h3>
        </div>
        {data.recentOrders.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            لا توجد أوامر نشطة قيد العمل في القسم حالياً
          </p>
        )}
        {data.recentOrders.map((order) => (
          <Link
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            key={order.id}
            href={`/${role}/orders/${order.id}`}
          >
            <span className="text-xs font-bold text-teal-800">
              {order.businessNumber} · {order.customerName}
            </span>
            <span
              className={`rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-900`}
            >
              {order.matchingPieceCount} قطعة · مطابقة لنطاق الجودة
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
