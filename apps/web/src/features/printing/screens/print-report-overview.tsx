import type { AdministrationReportPrintData } from "@template/contracts";
import { toAdministrationDepartmentRows } from "@/features/administration/model/administration-report.model";

export function ReportKpis({
  kpis,
  meta,
}: {
  kpis: AdministrationReportPrintData["kpis"];
  meta: AdministrationReportPrintData["meta"];
}) {
  return (
    <section className="print-avoid-break mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ١. ملخص مؤشرات الأداء والكميات التشغيلية بالمصنع
        </h3>
        <span className="text-[11px] text-slate-500">
          إجمالي الأوامر المشمولة: {kpis.orders} طلب
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            إجمالي الأوامر
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {kpis.orders}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {meta.cohort.kind === "MIXED"
              ? "تشمل المسودات والطلبات المقدمة"
              : meta.cohort.kind === "DRAFT"
                ? "مسودات فقط دون قطع تشغيلية"
                : "طلبات مقدمة"}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            المطلوب تصنيعه
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {kpis.activePieces}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            قطعة حذاء شرقي نشطة
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            المنجز بالمستودع
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {kpis.receivedPieces}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold text-slate-700">
            نسبة الإنجاز: {kpis.completionPercent}%
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            طلبات مسلمة
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {kpis.deliveredOrders}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {kpis.deliveredOrders} مسلّم · {kpis.readyOrders} جاهزة للتسليم
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            متأخر عن الموعد
          </span>
          <span
            className={`mt-1 block text-2xl font-black ${
              kpis.overdueOrders > 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {kpis.overdueOrders}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {kpis.overdueOrders > 0
              ? "تتطلب أولوية تشغيلية"
              : "كافة الأوامر منتظمة"}
          </span>
        </div>
      </div>
    </section>
  );
}

export function ReportStageDistribution({
  departments,
}: {
  departments: AdministrationReportPrintData["departments"];
}) {
  const stages = toAdministrationDepartmentRows(departments);
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٢. ميزان خطوط الإنتاج ومراكز العمل (موقع القطع الحالي بالورش)
        </h3>
        <span className="text-[11px] text-slate-500">
          متابعة تدفق العمل وتحديد نقاط الضغط التشغيلي
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">الورشة / المركز التشغيلي</th>
              <th className="px-3 py-2.5">المسؤول التشغيلي</th>
              <th className="px-3 py-2.5 text-center">الكمية الحالية</th>
              <th className="px-3 py-2.5">الموقف التشغيلي للورشة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {stages.map((stage) => (
              <tr key={stage.key} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-bold text-slate-900">
                  {stage.label}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {stage.responsibilityLabel ?? "المسؤول: __________________"}
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                  {stage.pieces} قطعة
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {stage.statusLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
