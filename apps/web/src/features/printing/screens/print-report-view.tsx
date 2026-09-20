"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import {
  requiredQuantity,
  totalQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import {
  activeStageSummary,
  filteredOrders,
  isOrderOverdue,
  type ReportFilters,
} from "@/features/prototype/state/workflow";

export function PrintReportView() {
  const store = useMvpStore();
  const searchParams = useSearchParams();

  // Parse filters from URL search params if coming from AdminReportsView
  const filters: ReportFilters = useMemo(() => {
    return {
      period: searchParams.get("period") || "الكل",
      type: searchParams.get("type") || "الكل",
      status: searchParams.get("status") || "الكل",
      department: searchParams.get("department") || "الكل",
      salesperson: searchParams.get("salesperson") || "الكل",
      from: searchParams.get("from") || searchParams.get("dateFrom") || "",
      to: searchParams.get("to") || searchParams.get("dateTo") || "",
    };
  }, [searchParams]);

  const reportOrders = useMemo(() => {
    return filteredOrders(store.orders, filters);
  }, [store.orders, filters]);

  const totalOriginal = reportOrders.reduce(
    (sum, o) => sum + totalQuantity(o),
    0,
  );
  const totalCancelled = reportOrders.reduce((sum, o) => sum + o.cancelled, 0);
  const totalRequired = reportOrders.reduce(
    (sum, o) => sum + requiredQuantity(o),
    0,
  );
  const totalWarehouse = reportOrders.reduce((sum, o) => sum + o.warehouse, 0);

  return (
    <div
      className="print-report min-h-screen bg-slate-100 p-4 print:bg-white print:p-0"
      dir="rtl"
    >
      {/* Top Action Bar */}
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div>
          <h1 className="text-sm font-bold text-slate-900">
            تقرير العمليات التصنيعية والكميات التشغيلية (A4)
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            تاريخ الاستخراج: 12 سبتمبر 2026 · النتائج المعروضة:{" "}
            {reportOrders.length} طلب
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="btn-pill btn-teal inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            <Printer size={15} />
            <span>طباعة التقرير (Ctrl + P)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="btn-pill btn-secondary px-3 py-2 text-xs"
          >
            رجوع
          </button>
        </div>
      </div>

      {/* Printable Report Content */}
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow-md print:p-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">
              مصنع الحذاء الشرقي — تقرير الإنتاج والمستودع التشغيلي
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              حصر شامل لتوزيع الأقسام بالمصنع، نسب الإنجاز بالمستودع، والكميات
              المطلوبة والملغاة (تقرير تشغيلي خالٍ من البيانات المالية)
            </p>
          </div>
          <div className="text-left font-mono text-xs" dir="ltr">
            <div>Date: 2026-09-12</div>
            <div>Orders: {reportOrders.length}</div>
          </div>
        </div>

        {/* Active Applied Filters Strip */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <span className="mb-1.5 block font-bold text-slate-700">
            الفلاتر ومعايير الحصر المطبقة على التقرير:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              الفترة: <strong>{filters.period}</strong>
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              نوع الطلب:{" "}
              <strong>
                {filters.type === "ALL" || filters.type === "الكل"
                  ? "كل الأنواع"
                  : typeLabels[filters.type as keyof typeof typeLabels]}
              </strong>
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              حالة الطلب: <strong>{filters.status}</strong>
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              القسم: <strong>{filters.department}</strong>
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              مسؤول المبيعات: <strong>{filters.salesperson}</strong>
            </span>
            {(filters.from || filters.to) && (
              <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-slate-700">
                المدى الزمني: {filters.from || "البداية"} إلى{" "}
                {filters.to || "اليوم"}
              </span>
            )}
          </div>
        </div>

        {/* Summary Totals Strip */}
        <div className="mb-4 grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div>
            <span className="block text-slate-500">إجمالي المقررة:</span>
            <strong className="text-slate-900">{totalOriginal} قطعة</strong>
          </div>
          <div>
            <span className="block text-slate-500">إجمالي الملغاة:</span>
            <strong className="text-rose-700">{totalCancelled} قطعة</strong>
          </div>
          <div>
            <span className="block text-slate-500">
              إجمالي المطلوبة (نشطة):
            </span>
            <strong className="text-teal-800">{totalRequired} قطعة</strong>
          </div>
          <div>
            <span className="block text-slate-500">المستلم بالمستودع:</span>
            <strong className="text-emerald-700">{totalWarehouse} قطعة</strong>
          </div>
        </div>

        {/* Table */}
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 font-bold">
              <th className="border border-slate-200 p-2">رقم الأمر</th>
              <th className="border border-slate-200 p-2">العميل</th>
              <th className="border border-slate-200 p-2">النوع</th>
              <th className="border border-slate-200 p-2">المقررة</th>
              <th className="border border-slate-200 p-2">الملغاة</th>
              <th className="border border-slate-200 p-2">المطلوبة</th>
              <th className="border border-slate-200 p-2">المرحلة الحالية</th>
              <th className="border border-slate-200 p-2">القطع بالمستودع</th>
              <th className="border border-slate-200 p-2">الحالة العامة</th>
            </tr>
          </thead>
          <tbody>
            {reportOrders.map((o) => {
              const orig = totalQuantity(o);
              const canc = o.cancelled;
              const req = requiredQuantity(o);
              const activeSummary = activeStageSummary(o);
              const overdue = isOrderOverdue(o);

              return (
                <tr
                  key={o.id}
                  className="border-b border-slate-200 hover:bg-slate-50"
                >
                  <td
                    className="border border-slate-200 p-2 font-mono font-bold"
                    dir="ltr"
                  >
                    {o.id}
                  </td>
                  <td className="border border-slate-200 p-2 font-semibold">
                    {o.customer}
                  </td>
                  <td className="border border-slate-200 p-2">
                    {typeLabels[o.type]}
                  </td>
                  <td className="border border-slate-200 p-2 text-center">
                    {orig}
                  </td>
                  <td className="border border-slate-200 p-2 text-center text-rose-700">
                    {canc > 0 ? canc : "—"}
                  </td>
                  <td className="border border-slate-200 p-2 text-center font-bold text-teal-900">
                    {req}
                  </td>
                  <td className="border border-slate-200 p-2 font-medium text-slate-700">
                    {activeSummary}
                  </td>
                  <td className="border border-slate-200 p-2 text-center font-bold text-teal-800">
                    {o.warehouse} من {req} قطع
                  </td>
                  <td className="border border-slate-200 p-2">
                    <span className="font-semibold">{o.status}</span>
                    {overdue && (
                      <span className="mr-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">
                        متأخر
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Report Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-[11px] text-slate-500">
          <span>مصنع الحذاء الشرقي · الإدارة العامة والرقابة المركزية</span>
          <span>صفحة 1 من 1</span>
        </div>
      </div>
    </div>
  );
}
