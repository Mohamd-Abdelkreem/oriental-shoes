import { useId } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Layers,
  User,
  type LucideIcon,
} from "lucide-react";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { orderTypeLabels } from "@/features/orders/order-types";
import type { DepartmentRole } from "../screens/department-dashboard-config";
import type { SalesOrderType } from "@template/contracts";

const sectionStyles = {
  incoming: {
    badge: "bg-amber-50 text-amber-900 border-amber-200/80",
    icon: "bg-amber-100 text-amber-800",
    button: "hover:bg-amber-50 text-amber-900 border-amber-200",
  },
  inProgress: {
    badge: "bg-teal-50 text-teal-900 border-teal-200/80",
    icon: "bg-teal-100 text-teal-800",
    button: "hover:bg-teal-50 text-teal-900 border-teal-200",
  },
  returned: {
    badge: "bg-rose-50 text-rose-900 border-rose-200/80",
    icon: "bg-rose-100 text-rose-800",
    button: "hover:bg-rose-50 text-rose-900 border-rose-200",
  },
  completed: {
    badge: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
    icon: "bg-emerald-100 text-emerald-800",
    button: "hover:bg-emerald-50 text-emerald-900 border-emerald-200",
  },
};
const sectionKeys = [
  "incoming",
  "inProgress",
  "returned",
  "completed",
] as const;

export type DepartmentDashboardSection = {
  href: Route;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

export function DepartmentDashboardSections({
  sections,
  counts,
}: {
  sections: Record<keyof typeof sectionStyles, DepartmentDashboardSection>;
  counts: Record<
    keyof typeof sectionStyles,
    { orders: number; pieces: number }
  >;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {sectionKeys.map((key) => {
        const { href, icon: Icon, title, subtitle } = sections[key];
        const { orders, pieces } = counts[key];
        const styles = sectionStyles[key];
        return (
          <div
            key={href}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
                >
                  <Icon size={16} aria-hidden />
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${styles.badge}`}
                >
                  {orders} أمر · {pieces} قطعة
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {subtitle}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Link
                href={href}
                aria-label={`فتح الصفحة المخصصة — ${title}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${styles.button}`}
              >
                <span>فتح الصفحة المخصصة</span>
                <ArrowLeft size={14} aria-hidden />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type OrderRoute = Route<`/${DepartmentRole}/orders/${string}`>;

type RecentOrder = {
  id: string;
  businessNumber: string;
  customerName: string;
  deliveryDate: string | null;
  type: SalesOrderType;
  matchingPieceCount: number;
  href: OrderRoute;
  queueHref: Route | OrderRoute;
  status: string;
  tone: "incoming" | "inProgress" | "completed";
};

export function DepartmentRecentOrders({
  departmentName,
  orders,
  loading = false,
  failure,
  onRetry,
}: {
  departmentName: string;
  orders: readonly RecentOrder[];
  loading?: boolean;
  failure?: string | undefined;
  onRetry?: () => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-teal-700" aria-hidden />
          <h3 id={headingId} className="text-xs font-bold text-slate-800">
            ملخص الأوامر النشطة حالياً في {departmentName}
          </h3>
        </div>
        <span className="text-[11px] text-slate-500">
          أحدث أوامر التفصيل في انتظار أو قيد المعالجة
        </span>
      </div>
      {loading && (
        <p role="status" className="text-xs text-slate-500">
          جارٍ تحميل أحدث أوامر القسم…
        </p>
      )}
      {failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-xs text-rose-800"
        >
          {failure}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onRetry}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {!loading && !failure && orders.length === 0 && (
        <WorkspaceEmptyState
          title={`لا توجد أوامر نشطة قيد العمل في ${departmentName} حالياً`}
        />
      )}
      {orders.length > 0 && (
        <div className="divide-y divide-slate-100">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex flex-col gap-2.5 px-1 py-3 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-xs sm:gap-3">
                <Link
                  href={order.href}
                  dir="ltr"
                  className="font-mono font-bold text-teal-800 hover:underline"
                >
                  {order.businessNumber}
                </Link>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                  {orderTypeLabels[order.type]}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 font-bold break-words text-slate-800">
                  <User
                    size={13}
                    className="shrink-0 text-slate-400"
                    aria-hidden
                  />
                  {order.customerName}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Calendar size={13} className="text-slate-400" aria-hidden />
                  التسليم: <bdi>{order.deliveryDate ?? "—"}</bdi>
                </span>
              </div>
              <div className="ms-auto flex shrink-0 flex-wrap items-center gap-2 text-xs sm:ms-0">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                  {order.matchingPieceCount} قطعة بالقسم
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${sectionStyles[order.tone].badge}`}
                >
                  {order.status}
                </span>
                <Link
                  href={order.queueHref}
                  className="btn-pill btn-secondary px-2.5 py-1 text-xs"
                >
                  فتح بالقسم
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
