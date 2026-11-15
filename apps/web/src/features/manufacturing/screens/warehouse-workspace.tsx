"use client";
import { usePathname } from "next/navigation";
import type { WarehouseView } from "@template/contracts";
import {
  useWarehouseOperationalScope,
  warehouseScopeKey,
} from "@/shared/query/operational-scope";
import { WarehouseCommandRecovery } from "@/features/warehouse/components/warehouse-command-recovery";
import { WarehouseQueue } from "@/features/warehouse/components/warehouse-queue";
import { WarehouseDashboard } from "@/features/warehouse/components/warehouse-dashboard";
import { WarehouseActivity } from "@/features/warehouse/components/warehouse-activity";

const routeViews: Readonly<Record<string, WarehouseView | undefined>> = {
  incoming: "INCOMING",
  incomplete: "INCOMPLETE",
  ready: "READY",
  "in-progress": "READY",
  "out-for-delivery": "OUT_FOR_DELIVERY",
  "delivery-failed": "DELIVERY_FAILED",
  delivered: "DELIVERED",
};
export function WarehouseWorkspace() {
  const pathname = usePathname(),
    scope = useWarehouseOperationalScope(),
    page = pathname.split("/")[2] ?? "dashboard";
  const key = scope
    ? `${warehouseScopeKey(scope).join("/")}/${pathname}`
    : pathname;
  return (
    <div className="space-y-6" dir="rtl">
      <WarehouseCommandRecovery />
      {!scope ? (
        <p role="status">جارٍ التحقق من صلاحية الوصول إلى المستودع.</p>
      ) : page === "dashboard" ? (
        <WarehouseDashboard key={key} />
      ) : page === "activity" ? (
        <WarehouseActivity key={key} />
      ) : routeViews[page] ? (
        <WarehouseQueue key={key} view={routeViews[page]} />
      ) : (
        <p role="alert">صفحة المستودع المطلوبة غير متاحة.</p>
      )}
    </div>
  );
}
