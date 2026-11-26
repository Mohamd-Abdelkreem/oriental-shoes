"use client";

import { useSearchParams } from "next/navigation";
import { ArrowRight, Printer } from "lucide-react";
import {
  parseAdministrationRoute,
  resolveAdministrationSalespersonRoute,
} from "@/features/administration/model/administration-query.model";
import { toAdministrationReportFilters } from "@/features/administration/model/administration-report.model";
import { useAdministrationFilterOptions } from "@/features/administration/hooks/administration.hooks";
import { useAdministrationReportPrintController } from "../hooks/administration-report-print.hooks";
import { ReportKpis, ReportStageDistribution } from "./print-report-overview";
import { ReportWorkforce } from "./print-report-workforce";
import { ReportOrders } from "./print-report-orders";
import { ReportExceptions } from "./print-report-exceptions";
import { ReportEndorsements } from "./print-report-endorsements";

export function PrintReportView() {
  const params = useSearchParams(),
    parsed = parseAdministrationRoute("report-print", params);
  const options = useAdministrationFilterOptions(
    parsed.route === "report-print" && parsed.kind === "resolve-salesperson"
      ? { salespersonName: parsed.legacyName }
      : null,
  );
  const resolved =
    parsed.route === "report-print" &&
    parsed.kind === "resolve-salesperson" &&
    options.isSuccess &&
    !options.isError &&
    !options.isFetching &&
    options.data !== undefined
      ? resolveAdministrationSalespersonRoute(parsed, options.data)
      : parsed;
  const input =
    resolved.route === "report-print" && resolved.kind === "valid"
      ? resolved.query
      : null;
  const {
      paperRef,
      query: reportQuery,
      ...controller
    } = useAdministrationReportPrintController(input),
    report = reportQuery.data;
  const presentation =
    report === undefined || input === null
      ? null
      : toAdministrationReportFilters(input, report.meta);
  return (
    <div
      className="print-report-container min-h-screen bg-slate-200/80 px-4 py-8 font-[family-name:var(--font-cairo)] text-slate-800 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto mb-6 flex max-w-[215mm] items-center justify-between rounded-xl border border-slate-300 bg-white px-6 py-3.5 shadow-sm print:hidden">
        <div>
          <h1 className="text-sm font-extrabold text-slate-900">
            تقرير المتابعة والرقابة التشغيلية — نسخة طباعة تشغيلية (A4)
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            بيانات موحدة وشاملة للمصنع: الأوامر، المراحل الإنتاجية، وطاقم العمل.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void controller.prepare();
            }}
            disabled={!controller.eligible || controller.preparing}
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

      {input === null && (
        <p role="alert" className="print:hidden">
          راجع فلاتر التقرير وحدد حساب البائع بدقة قبل الطباعة.
          {options.isFetching && " جارٍ التحقق من اسم البائع…"}
        </p>
      )}
      {reportQuery.isFetching && (
        <p role="status" className="print:hidden">
          جارٍ تحميل نسخة التقرير الحالية…
        </p>
      )}
      {controller.preparing && (
        <p role="status" className="print:hidden">
          جارٍ تجهيز نسخة جديدة للطباعة…
        </p>
      )}
      {(controller.failure !== null ||
        reportQuery.isError ||
        (!controller.eligible &&
          input !== null &&
          !reportQuery.isFetching)) && (
        <div role="alert" className="print:hidden">
          {controller.failure ??
            "التقرير غير متاح بنسخة حالية؛ أعد التحميل قبل الطباعة."}{" "}
          <button onClick={controller.reload}>إعادة تحميل التقرير</button>
        </div>
      )}
      {report !== undefined && presentation !== null && (
        <div
          ref={paperRef}
          className="a4-sheet mx-auto rounded-xs bg-white p-12 text-slate-900 print:p-0"
        >
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
                  صُنّاع الأحذية الشرقية الفاخرة
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-right text-xs leading-relaxed">
                <div className="flex items-center justify-between gap-4 font-mono font-bold text-slate-900">
                  <span className="font-sans font-semibold text-slate-500">
                    كود الوثيقة:
                  </span>
                  <span dir="ltr">غير مخصص</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span className="font-semibold text-slate-500">
                    تاريخ الإصدار:
                  </span>
                  <span className="font-bold text-slate-800">
                    {report.meta.generatedAt}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span className="font-semibold text-slate-500">الفترة:</span>
                  <span className="font-semibold text-slate-800">
                    {presentation.periodLabel}
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
                تقرير تشغيلي من بيانات النظام
              </span>
            </div>
          </header>
          <div className="mt-3 text-xs">
            <p>
              أعده: {report.meta.generatedBy.fullName} — التوقيت:{" "}
              {presentation.businessTimeZone}
            </p>
            <p>
              نطاق الطلبات: {presentation.cohortLabel} — من{" "}
              {presentation.effectiveFrom ?? "دون حد"} إلى{" "}
              {presentation.effectiveTo ?? "دون حد"}
            </p>
            <p>{presentation.workforceScopeLabel}</p>
          </div>
          <ReportKpis kpis={report.kpis} meta={report.meta} />
          <ReportStageDistribution departments={report.departments} />
          <ReportWorkforce
            workforce={report.workforce}
            departments={report.departments}
          />
          <ReportOrders orders={report.orders.items} meta={report.meta} />
          <ReportExceptions
            summary={report.exceptions}
            rows={report.exceptionRows}
            orderReferences={
              new Map(
                report.orders.items
                  .filter((order) => order.displayReference !== order.orderId)
                  .map((order) => [order.orderId, order.displayReference]),
              )
            }
          />
          <ReportEndorsements endorsements={report.endorsements} />
          <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-3 text-[10px] text-slate-500">
            <span>
              مصنع الحذاء الشرقي · منظومة الإدارة والتصنيع الإلكترونية الموحدة ·
              جميع الحقوق محفوظة © {report.meta.generatedAt.slice(0, 4)}
            </span>
            <span className="font-mono">ترقيم الصفحات من إعدادات الطباعة</span>
          </footer>
        </div>
      )}
    </div>
  );
}
