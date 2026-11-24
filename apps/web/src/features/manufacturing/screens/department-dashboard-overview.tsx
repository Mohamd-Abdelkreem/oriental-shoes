"use client";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import {
  DepartmentDashboardSections,
  DepartmentRecentOrders,
} from "../components/department-dashboard-presentation";
import type {
  ManufacturingDashboardData,
  QualityDashboardData,
  ManufacturingDepartment,
} from "@template/contracts";

import Link from "next/link";
import { Calendar, Layers, User } from "lucide-react";
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

  return (
    <div className="space-y-5">
      <DepartmentDashboardSections
        sections={config}
        counts={{
          incoming: {
            orders: incomingOrdersCount,
            pieces: incomingPiecesCount,
          },
          inProgress: {
            orders: inProgressOrdersCount,
            pieces: inProgressPiecesCount,
          },
          returned: {
            orders: returnedOrdersCount,
            pieces: returnedPiecesCount,
          },
          completed: {
            orders: completedOrdersCount,
            pieces: completedPiecesCount,
          },
        }}
      />

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
          <WorkspaceEmptyState
            title={`لا توجد أوامر نشطة قيد العمل في ${deptRoleName} حالياً`}
          />
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
  const role = department === "CUTTING" ? "cutting" : "production";
  const config = dashboardSections[role];
  return (
    <div className="space-y-5">
      <DepartmentDashboardSections sections={config} counts={data.counts} />
      <DepartmentRecentOrders
        departmentName={getDeptArabicName(role)}
        orders={data.recentOrders.map((order) => ({
          ...order,
          href: `/${role}/orders/${order.id}`,
          queueHref: order.hasInProgress
            ? config.inProgress.href
            : config.incoming.href,
          status: order.hasInProgress ? "قيد التشغيل" : "بانتظار البدء",
          tone: order.hasInProgress ? "inProgress" : "incoming",
        }))}
      />
    </div>
  );
}

function QualityDepartmentDashboardOverview({
  data,
}: {
  data: QualityDashboardData;
}) {
  const config = dashboardSections.quality;
  return (
    <div className="space-y-5">
      <DepartmentDashboardSections
        sections={{
          incoming: config.incoming,
          inProgress: config.inProgress,
          returned: {
            ...config.returned,
            subtitle: "متابعة متداخلة مع الوارد والفحص؛ لا تجمع العدادات",
          },
          completed: {
            ...config.completed,
            subtitle: "قبول وتحويل لوارد المستودع؛ الاستلام الفعلي مستقل",
          },
        }}
        counts={{
          incoming: data.counts.incoming,
          inProgress: data.counts.inspection,
          returned: data.counts.corrections,
          completed: data.counts.accepted,
        }}
      />
      <DepartmentRecentOrders
        departmentName={getDeptArabicName("quality")}
        orders={data.recentOrders.map((order) => ({
          ...order,
          href: `/quality/orders/${order.id}`,
          queueHref: `/quality/orders/${order.id}`,
          status: "مطابقة لنطاق الجودة",
          tone: "inProgress",
        }))}
      />
    </div>
  );
}
