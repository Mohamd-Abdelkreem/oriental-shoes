import {
  formatDraftReference,
  type AdministrationReportPrintData,
} from "@template/contracts";

const labels = {
  OVERDUE: "تأخر عن موعد التسليم",
  DELIVERY_FAILED: "تعذر التسليم الحالي",
  QUALITY_CORRECTION_HISTORY: "سجل تصحيح جودة سابق أو قائم",
  RETURNED_FOR_CORRECTION: "معاد حالياً لتصحيح المبيعات",
};
const locations = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
};
export function ReportExceptions({
  summary,
  rows,
}: {
  summary: AdministrationReportPrintData["exceptions"];
  rows: AdministrationReportPrintData["exceptionRows"];
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٥. تنبيهات واستثناءات تشغيلية وسجل التصحيح
        </h3>
        <span className="text-[11px] text-slate-600">
          {summary.categoryCases} حالة تصنيفية — {summary.distinctOrders} طلب
          متأثر دون تكرار
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-xs wrap-anywhere">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">رقم الأمر والعميل</th>
              <th className="px-3 py-2.5">نوع الاستثناء المسجل</th>
              <th className="px-3 py-2.5">الأقسام الحالية</th>
              <th className="px-3 py-2.5">الإجراء والتوجيه المطلوب</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {rows.map((row) => (
              <tr
                key={`${row.category}/${row.orderId}`}
                className="hover:bg-slate-50/50"
              >
                <td className="px-3 py-2.5">
                  <strong className="font-mono text-slate-900" dir="ltr">
                    {row.businessNumber ?? formatDraftReference(row.orderId)}
                  </strong>{" "}
                  — {row.customerName ?? "—"}
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">
                  {labels[row.category]}
                  {row.category === "OVERDUE" &&
                    ` (${row.deliveryDate ?? "—"})`}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {row.currentDepartments
                    .map((department) => locations[department])
                    .join("، ") || "—"}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {row.category === "QUALITY_CORRECTION_HISTORY"
                    ? "مراجعة السجل التاريخي؛ وجوده لا يعني عملاً معلقاً"
                    : "راجع التفاصيل والإجراء المتاح في القسم المختص"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-3 text-xs">لا توجد حالات استثناء في نطاق التقرير.</p>
        )}
      </div>
    </section>
  );
}
