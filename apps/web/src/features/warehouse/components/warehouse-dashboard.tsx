"use client";
import { Clock, PackageCheck, Truck, AlertTriangle } from "lucide-react";
import type { WarehouseDashboardData } from "@template/contracts";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { useWarehouseDashboard } from "../hooks/warehouse.hooks";
import { warehouseFailureMessage } from "../model/warehouse-form.model";

const scopes = [
  {
    key: "incoming",
    title: "وارد بانتظار الاستلام",
    path: "incoming",
    icon: Clock,
  },
  {
    key: "incomplete",
    title: "أوامر غير مكتملة بالمستودع",
    path: "incomplete",
    icon: Clock,
  },
  {
    key: "ready",
    title: "جاهز للتسليم (كامل القطع)",
    path: "ready",
    icon: PackageCheck,
  },
  {
    key: "outForDelivery",
    title: "خرج للتوصيل",
    path: "out-for-delivery",
    icon: Truck,
  },
  {
    key: "deliveryFailed",
    title: "تعذر التسليم",
    path: "delivery-failed",
    icon: AlertTriangle,
  },
  {
    key: "delivered",
    title: "تم التسليم",
    path: "delivered",
    icon: PackageCheck,
  },
] as const;
export function WarehouseDashboard() {
  const query = useWarehouseDashboard({});
  const data = query.data;
  const cards: KpiCardItem[] = data
    ? scopes.map((scope) => ({
        title: scope.title,
        value: data.counts[scope.key].orders,
        unit: "أمر تفصيل",
        subtitle: `${String(data.counts[scope.key].pieces)} قطعة`,
        icon: scope.icon,
        tone: "teal",
        href: `/warehouse/${scope.path}`,
      }))
    : [];
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        title="لوحة المستودع والتوصيل"
        subtitle="الاستلام الفعلي للقطع وتسليم الطلبات كاملة"
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
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query.data && (
        <>
          <OrientalKpiGrid cards={cards} />
          <WarehouseDashboardOverview data={query.data} />
        </>
      )}
    </div>
  );
}
export function WarehouseDashboardOverview({
  data,
}: {
  data: WarehouseDashboardData;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">حركة المستودع والتوصيل</h2>
      <p className="mt-2 text-xs text-slate-500">
        الوارد وغير المكتمل نطاقان متداخلان؛ لا تجمع بطاقاتهما. التوصيل متاح
        للطلب الكامل فقط بعد استلام جميع قطعه النشطة.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scopes.map((scope) => (
          <div
            key={scope.key}
            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
          >
            <h3 className="text-sm font-semibold">{scope.title}</h3>
            <p>
              {data.counts[scope.key].orders} أمر تفصيل ·{" "}
              {data.counts[scope.key].pieces} قطعة
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
