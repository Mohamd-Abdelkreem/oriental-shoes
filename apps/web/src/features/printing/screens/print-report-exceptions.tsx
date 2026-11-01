import { activeStageSummary } from "@/features/prototype/state/workflow";
import type { ReportSummary } from "./report-summary";

export function ReportExceptions({ summary }: { summary: ReportSummary }) {
  const { overdueOrders, deliveryFailedOrders, correctionOrders } = summary;
  if (
    overdueOrders.length +
      deliveryFailedOrders.length +
      correctionOrders.length ===
    0
  )
    return null;
  return (
    <section className="print-avoid-break mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٥. تنبيهات واستثناءات تشغيلية تستوجب المتابعة والتوجيه
        </h3>
        <span className="text-[11px] text-slate-600">
          إجمالي الحالات:{" "}
          {overdueOrders.length +
            deliveryFailedOrders.length +
            correctionOrders.length}{" "}
          حالة
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">رقم الأمر والعميل</th>
              <th className="px-3 py-2.5">نوع الاستثناء المسجل</th>
              <th className="px-3 py-2.5">المرحلة الحالية</th>
              <th className="px-3 py-2.5">الإجراء والتوجيه المطلوب</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {overdueOrders.map((o) => (
              <tr key={`overdue-${o.id}`} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5">
                  <strong className="font-mono text-slate-900" dir="ltr">
                    {o.id}
                  </strong>{" "}
                  — {o.customer}
                </td>
                <td className="px-3 py-2.5 font-bold text-red-800">
                  تأخر عن موعد التسليم ({o.delivery})
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {activeStageSummary(o)}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  إعطاء أولوية تشغيلية بالمصنع لإنهاء باقي القطع فوراً
                </td>
              </tr>
            ))}
            {deliveryFailedOrders.map((o) => (
              <tr key={`failed-${o.id}`} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5">
                  <strong className="font-mono text-slate-900" dir="ltr">
                    {o.id}
                  </strong>{" "}
                  — {o.customer}
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">
                  تعذر تسليم الطلب من المندوب
                </td>
                <td className="px-3 py-2.5 text-slate-700">المستودع والشحن</td>
                <td className="px-3 py-2.5 text-slate-600">
                  إعادة التواصل مع العميل لتأكيد العنوان وموعد بديل
                </td>
              </tr>
            ))}
            {correctionOrders.map((o) => (
              <tr key={`corr-${o.id}`} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5">
                  <strong className="font-mono text-slate-900" dir="ltr">
                    {o.id}
                  </strong>{" "}
                  — {o.customer}
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">
                  خضع لدورة إعادة فحص وتصحيح بالجودة
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {activeStageSummary(o)}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  مراجعة ملاحظات الفنيين لضمان الالتزام بالمواصفات القياسية
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
