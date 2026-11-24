"use client";

import { AlertTriangle, Clock, PackageCheck, Truck } from "lucide-react";
import {
  DepartmentDashboardSections,
  DepartmentRecentOrders,
} from "@/features/manufacturing/components/department-dashboard-presentation";
import { dashboardSections } from "@/features/manufacturing/screens/department-dashboard-config";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import {
  useWarehouseDashboard,
  useWarehouseOrders,
} from "../hooks/warehouse.hooks";
import { warehouseFailureMessage } from "../model/warehouse-form.model";

const scopes = [
  {
    key: "incoming",
    title: "وارد بانتظار الاستلام",
    href: "/warehouse/incoming",
    icon: Clock,
    tone: "amber",
  },
  {
    key: "ready",
    title: "جاهز للتسليم (كامل القطع)",
    href: "/warehouse/ready",
    icon: PackageCheck,
    tone: "emerald",
  },
  {
    key: "incomplete",
    title: "أوامر غير مكتملة بالمستودع",
    href: "/warehouse/incomplete",
    icon: Clock,
    tone: "amber",
  },
  {
    key: "outForDelivery",
    title: "خرج مع مندوب التوصيل",
    href: "/warehouse/out-for-delivery",
    icon: Truck,
    tone: "teal",
  },
  {
    key: "deliveryFailed",
    title: "تعذر التسليم",
    href: "/warehouse/delivery-failed",
    icon: AlertTriangle,
    tone: "rose",
  },
] as const;

export function WarehouseDashboard() {
  const query = useWarehouseDashboard({});
  const incoming = useWarehouseOrders({ view: "INCOMING", page: 1, limit: 4 });
  const ready = useWarehouseOrders({ view: "READY", page: 1, limit: 4 });
  const counts = query.data?.counts;
  const cards: KpiCardItem[] = counts
    ? scopes.map((scope) => ({
        title: scope.title,
        value: counts[scope.key].orders,
        unit: "أمر تفصيل",
        subtitle: `${String(counts[scope.key].pieces)} قطعة`,
        icon: scope.icon,
        tone:
          scope.key === "outForDelivery" || counts[scope.key].orders > 0
            ? scope.tone
            : "neutral",
        href: scope.href,
      }))
    : [];
  const config = dashboardSections.warehouse;
  const recentOrders = [
    ...(incoming.data?.orders ?? []).map((order) => ({
      ...order,
      href: `/warehouse/orders/${order.id}` as const,
      queueHref: config.incoming.href,
      tone: "incoming" as const,
      status: "بانتظار الاستلام",
    })),
    ...(ready.data?.orders ?? []).map((order) => ({
      ...order,
      href: `/warehouse/orders/${order.id}` as const,
      queueHref: config.inProgress.href,
      tone: "completed" as const,
      status: "جاهز للتسليم",
    })),
  ].sort((a, b) => (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? ""));
  const recentError = incoming.error ?? ready.error;
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="قسم المستودع والتسليم"
        title="لوحة تحكم المستودع والتسليم النهائي"
        subtitle="متابعة استلام القطع، تجهيز الشحنات، وتسليم الطلبات كاملة"
      />
      {query.isPending && <p role="status">جارٍ تحميل لوحة المستودع…</p>}
      {query.isFetching && query.data && (
        <p role="status">جارٍ تحديث لوحة المستودع…</p>
      )}
      {query.isError && (
        <div role="alert">
          {warehouseFailureMessage(query.error, "read")}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {counts && (
        <>
          <OrientalKpiGrid cards={cards} columns={4} />
          <DepartmentDashboardSections
            sections={config}
            counts={{
              incoming: counts.incoming,
              inProgress: counts.ready,
              returned: counts.deliveryFailed,
              completed: counts.delivered,
            }}
          />
          <p className="text-xs text-slate-500">
            الوارد وغير المكتمل نطاقان متداخلان؛ لا تجمع بطاقاتهما. التوصيل متاح
            للطلب الكامل فقط بعد استلام جميع قطعه النشطة.
          </p>
          <DepartmentRecentOrders
            departmentName="المستودع والتسليم"
            orders={recentOrders}
            loading={incoming.isPending || ready.isPending}
            failure={
              recentError
                ? warehouseFailureMessage(recentError, "read")
                : undefined
            }
            onRetry={() => {
              if (incoming.isError) void incoming.refetch();
              if (ready.isError) void ready.refetch();
            }}
          />
        </>
      )}
    </div>
  );
}
