"use client";
import Link from "next/link";
import {
  Boxes,
  Clock,
  FileEdit,
  FilePlus2,
  RotateCcw,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useSalesDashboard } from "../hooks/orders.hooks";
import { toSalesOrderListRow } from "../model/order-view.model";
import { useCustomerList } from "@/features/customers/hooks/customers.hooks";
import { customerRoute } from "@/features/customers/model/customer-form.model";
import { draftEditRoute } from "../model/draft-form.model";
import { orderTypeLabels } from "@/features/orders/order-types";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { apiFailureMessage } from "@/services/api/api-client";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-empty-state";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";

export function SalesDashboardView() {
  const scope = useOperationalScope(),
    drafts = useSalesDashboard(),
    customers = useCustomerList({ page: 1, limit: 4 });
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  const kpis: KpiCardItem[] = [
    {
      title: "المسودات",
      value: drafts.data?.counts.drafts ?? "—",
      unit: "أمر تفصيل",
      subtitle:
        drafts.data === undefined
          ? "جارٍ تحميل الإحصاءات"
          : `${String(drafts.data.counts.draftPieces)} قطعة قيد الإعداد والتعديل`,
      icon: FileEdit,
      tone: "neutral",
      href: "/sales/orders/drafts",
    },
    {
      title: "معادة للتعديل",
      value: drafts.data?.counts.returned ?? "—",
      unit: "أمر تفصيل",
      subtitle: "حسب الحالة الحالية المحفوظة",
      icon: RotateCcw,
      tone: "neutral",
    },
    {
      title: "بانتظار الاعتماد",
      value: drafts.data?.counts.awaitingApproval ?? "—",
      unit: "أمر تفصيل",
      subtitle: "حسب الحالة الحالية المحفوظة",
      icon: Clock,
      tone: "amber",
    },
    {
      title: "معتمدة قيد التصنيع",
      value: drafts.data?.counts.approved ?? "—",
      unit: "أمر تفصيل",
      subtitle: "حسب الحالة الحالية المحفوظة",
      icon: Boxes,
      tone: "teal",
    },
  ];
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات والمعارض / مساحة العمل"
        title="لوحة المبيعات والطلبات"
        subtitle="إنشاء أوامر التفصيل ومتابعة المسودات غير المقدمة"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sales/orders/new" className="btn-pill btn-teal">
              <FilePlus2 size={16} />+ إنشاء أمر تفصيل جديد
            </Link>
            <Link href="/sales/customers" className="btn-pill btn-outline">
              <UserRound size={16} />
              دليل العملاء
            </Link>
          </div>
        }
      />
      <OrientalKpiGrid cards={kpis} columns={4} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-sm font-bold text-slate-800">
              أحدث أوامر المبيعات الخاصة بك
            </h2>
            <Link
              href="/sales/orders"
              className="text-xs text-teal-600 hover:underline"
            >
              عرض كل طلبات المبيعات ({drafts.data?.counts.totalOrders ?? "—"})
            </Link>
          </div>
          {drafts.isFetching && (
            <p role="status">جارٍ تحميل طلبات المبيعات...</p>
          )}
          {drafts.isError && (
            <div role="alert">
              تعذّر تحميل طلبات المبيعات. {apiFailureMessage(drafts.error)}
              <button
                type="button"
                className="btn-pill btn-outline"
                onClick={() => {
                  void drafts.refetch();
                }}
              >
                إعادة تحميل طلبات المبيعات
              </button>
            </div>
          )}
          {drafts.data?.recentOrders.length === 0 && (
            <WorkspaceEmptyState
              title="لا توجد طلبات مبيعات."
              description="تظهر الطلبات هنا بعد تسجيلها."
            />
          )}
          <div className="divide-y divide-slate-100">
            {drafts.data?.recentOrders.map(toSalesOrderListRow).map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between rounded-lg px-2 py-3 transition hover:bg-slate-50"
              >
                <div className="space-y-0.5">
                  <strong
                    className="font-mono text-xs font-bold text-slate-900"
                    dir="ltr"
                  >
                    {draft.reference}
                  </strong>
                  <span className="text-xs text-slate-600">
                    {" "}
                    · {draft.customer || "—"}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {orderTypeLabels[draft.type]} · تسليم متوقع:{" "}
                    {draft.deliveryDate ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-800">
                      {draft.pieceCount} قطع
                    </span>
                    <small className="text-[10px] text-slate-500">
                      {draft.status}
                    </small>
                  </div>
                  <Link
                    href={
                      draft.canEdit
                        ? draftEditRoute(draft.id)
                        : `/sales/orders/${draft.id}`
                    }
                    className="btn-pill btn-outline px-2.5 py-1 text-xs"
                  >
                    عرض الطلب
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
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
            {customers.isFetching && <p role="status">جارٍ تحميل العملاء...</p>}
            {customers.isError && (
              <div role="alert">
                تعذّر تحميل العملاء. {apiFailureMessage(customers.error)}
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    void customers.refetch();
                  }}
                >
                  إعادة تحميل العملاء
                </button>
              </div>
            )}
            {customers.data?.customers.length === 0 && (
              <WorkspaceEmptyState title="لا يوجد عملاء." />
            )}
            {customers.data?.customers.map(({ customer }) => (
              <Link
                key={customer.id}
                href={customerRoute(customer.phone, "sales")}
                className="block rounded-lg border border-slate-100 p-2.5 transition hover:border-teal-200 hover:bg-teal-50/40"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs text-slate-800">
                    {customer.name}
                  </strong>
                  <span
                    className="font-mono text-[11px] text-slate-500"
                    dir="ltr"
                  >
                    {customer.phone}
                  </span>
                </div>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                  {customer.address ?? "—"}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/sales/customers/new"
            className="btn-pill btn-outline w-full justify-center text-xs"
          >
            <UserPlus size={14} />
            إضافة عميل جديد
          </Link>
        </div>
      </div>
    </div>
  );
}
