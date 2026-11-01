"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Printer } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import {
  filteredOrders,
  type ReportFilters,
} from "@/features/prototype/state/workflow";
import { getReportSummary } from "./report-summary";
import { ReportKpis, ReportStageDistribution } from "./print-report-overview";
import { ReportWorkforce } from "./print-report-workforce";
import { ReportOrders } from "./print-report-orders";
import { ReportExceptions } from "./print-report-exceptions";
import { ReportEndorsements } from "./print-report-endorsements";

export function PrintReportView() {
  const store = useMvpStore();
  const searchParams = useSearchParams();
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

  const summary = getReportSummary(reportOrders);
  const reportDateFormatted = "١٢ سبتمبر ٢٠٢٦";
  const reportDocumentId = `REP-${String(new Date().getFullYear())}-OP-${String(reportOrders.length).padStart(3, "0")}`;
  return (
    <div
      className="print-report-container min-h-screen bg-slate-200/80 px-4 py-8 font-[family-name:var(--font-cairo)] text-slate-800 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto mb-6 flex max-w-[215mm] items-center justify-between rounded-xl border border-slate-300 bg-white px-6 py-3.5 shadow-sm print:hidden">
        <div>
          <h1 className="text-sm font-extrabold text-slate-900">
            تقرير المتابعة والرقابة التشغيلية — نسخة الطباعة الرسمية (A4)
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            بيانات موحدة وشاملة للمصنع: الأوامر، المراحل الإنتاجية، وطاقم العمل.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
          >
            <Printer size={15} />
            <span>طباعة التقرير (Ctrl + P)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.back();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowRight size={14} />
            <span>رجوع</span>
          </button>
        </div>
      </div>

      <div className="a4-sheet mx-auto rounded-xs bg-white p-12 text-slate-900 print:p-0">
        <header className="border-b-2 border-slate-900 pb-5">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                مصنع الحذاء الشرقي
              </h2>
              <p className="text-xs font-bold text-slate-700">
                الإدارة العامة والرقابة المركزية
              </p>
              <p className="text-[11px] text-slate-500">
                سجل تجاري: ١٠١٠٨٩٢٣٤١ · صُنّاع الأحذية الشرقية الفاخرة
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-right text-xs leading-relaxed">
              <div className="flex items-center justify-between gap-4 font-mono font-bold text-slate-900">
                <span className="font-sans font-semibold text-slate-500">
                  كود الوثيقة:
                </span>
                <span dir="ltr">{reportDocumentId}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-500">
                  تاريخ الإصدار:
                </span>
                <span className="font-bold text-slate-800">
                  {reportDateFormatted}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-500">الفترة:</span>
                <span className="font-semibold text-slate-800">
                  {filters.period === "الكل" ? "كافة الفترات" : filters.period}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <div>
              <h1 className="text-base font-black text-slate-900">
                تقرير المتابعة والرقابة التشغيلية
              </h1>
              <p className="text-xs text-slate-600">
                موقف الأوامر التشغيلية، ميزان مراحل الإنتاج، وتوزيع القوى
                العاملة
              </p>
            </div>
            <span className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-700">
              وثيقة تدقيق رقابية رسمية
            </span>
          </div>
        </header>
        <ReportKpis reportOrders={reportOrders} summary={summary} />
        <ReportStageDistribution summary={summary} />
        <ReportWorkforce
          employees={store.employees}
          orders={store.orders}
          summary={summary}
        />
        <ReportOrders reportOrders={reportOrders} />
        <ReportExceptions summary={summary} />
        <ReportEndorsements />
        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-3 text-[10px] text-slate-500">
          <span>
            مصنع الحذاء الشرقي · منظومة الإدارة والتصنيع الإلكترونية الموحدة ·
            جميع الحقوق محفوظة © ٢٠٢٦
          </span>
          <span className="font-mono">صفحة ١ من ١</span>
        </footer>
      </div>
    </div>
  );
}
