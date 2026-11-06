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
import { useDraftList } from "../hooks/drafts.hooks";
import { useCustomerList } from "@/features/customers/hooks/customers.hooks";
import { customerRoute } from "@/features/customers/model/customer-form.model";
import { draftEditRoute } from "../model/draft-form.model";
import { orderTypeLabels } from "@/features/orders/order-types";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";

export function SalesDashboardView() {
  const scope = useOperationalScope(),
    drafts = useDraftList({ page: 1, limit: 5 }),
    customers = useCustomerList({ page: 1, limit: 4 });
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  const kpis: KpiCardItem[] = [
    {
      title: "المسودات",
      value: drafts.data?.totalDrafts ?? "—",
      unit: "أمر تفصيل",
      subtitle:
        drafts.data === undefined
          ? "جارٍ تحميل الإحصاءات"
          : `${String(drafts.data.totalPieces)} قطعة قيد الإعداد والتعديل`,
      icon: FileEdit,
      tone: "neutral",
      href: "/sales/orders/drafts",
    },
    {
      title: "معادة للتعديل",
      value: "—",
      unit: "أمر تفصيل",
      subtitle: "غير متاحة حتى تفعيل مراحل الطلب اللاحقة",
      icon: RotateCcw,
      tone: "neutral",
    },
    {
      title: "بانتظار الاعتماد",
      value: "—",
      unit: "أمر تفصيل",
      subtitle: "غير متاحة حتى تفعيل مراحل الطلب اللاحقة",
      icon: Clock,
      tone: "amber",
    },
    {
      title: "معتمدة قيد التصنيع",
      value: "—",
      unit: "أمر تفصيل",
      subtitle: "غير متاحة حتى تفعيل مراحل الطلب اللاحقة",
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
              عرض كل طلبات المبيعات ({drafts.data?.totalDrafts ?? "—"})
            </Link>
          </div>
          {drafts.isFetching && <p role="status">جارٍ تحميل المسودات...</p>}
          {drafts.isError && (
            <div role="alert">
              تعذّر تحميل المسودات. {getApiError(drafts.error).requestId}
              <button
                type="button"
                className="btn-pill btn-outline"
                onClick={() => {
                  void drafts.refetch();
                }}
              >
                إعادة تحميل المسودات
              </button>
            </div>
          )}
          {drafts.data?.drafts.length === 0 && <p>لا توجد مسودات.</p>}
          <div className="divide-y divide-slate-100">
            {drafts.data?.drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between rounded-lg px-2 py-3 transition hover:bg-slate-50"
              >
                <div className="space-y-0.5">
                  <strong
                    className="font-mono text-xs font-bold text-slate-900"
                    dir="ltr"
                  >
                    {draft.id}
                  </strong>
                  <span className="text-xs text-slate-600">
                    {" "}
                    · {draft.customer?.name ?? "—"}
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
                      مسودة غير مقدمة
                    </small>
                  </div>
                  <Link
                    href={draftEditRoute(draft.id)}
                    className="btn-pill btn-outline px-2.5 py-1 text-xs"
                  >
                    متابعة التحرير
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
                تعذّر تحميل العملاء. {getApiError(customers.error).requestId}
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
            {customers.data?.customers.length === 0 && <p>لا يوجد عملاء.</p>}
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
