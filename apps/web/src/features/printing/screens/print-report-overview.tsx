import type { MvpOrder } from "@/features/prototype/state/mvp-types";
import type { ReportSummary } from "./report-summary";

export function ReportKpis({
  reportOrders,
  summary,
}: {
  reportOrders: MvpOrder[];
  summary: ReportSummary;
}) {
  const {
    totalRequired,
    totalWarehouse,
    completionRate,
    deliveredOrders,
    outForDeliveryOrders,
    overdueOrders,
  } = summary;
  return (
    <section className="print-avoid-break mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ١. ملخص مؤشرات الأداء والكميات التشغيلية بالمصنع
        </h3>
        <span className="text-[11px] text-slate-500">
          إجمالي الأوامر المشمولة: {reportOrders.length} طلب
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            إجمالي الأوامر
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {reportOrders.length}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {reportOrders.filter((o) => o.type === "EXTERNAL").length} خارجي ·{" "}
            {reportOrders.filter((o) => o.type === "SHOP").length} معرض
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            المطلوب تصنيعه
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {totalRequired}
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
            {totalWarehouse}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold text-slate-700">
            نسبة الإنجاز: {completionRate}%
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            التسليم والتوزيع
          </span>
          <span className="mt-1 block text-2xl font-black text-slate-900">
            {deliveredOrders.length + outForDeliveryOrders.length}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {deliveredOrders.length} مسلّم · {outForDeliveryOrders.length} مع
            المندوب
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-center">
          <span className="block text-[11px] font-semibold text-slate-600">
            متأخر عن الموعد
          </span>
          <span
            className={`mt-1 block text-2xl font-black ${
              overdueOrders.length > 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {overdueOrders.length}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {overdueOrders.length > 0
              ? "تتطلب أولوية تشغيلية"
              : "كافة الأوامر منتظمة"}
          </span>
        </div>
      </div>
    </section>
  );
}

export function ReportStageDistribution({
  summary,
}: {
  summary: ReportSummary;
}) {
  const {
    cuttingPieces,
    productionPieces,
    qualityPieces,
    warehousePieces,
    dispatchPieces,
  } = summary;
  const stages = [
    {
      name: "١. ورشة القص والتفصيل",
      supervisor: "سالم الحربي (مسؤول ورشة القص)",
      quantity: cuttingPieces,
      status:
        cuttingPieces > 0
          ? `جاري العمل على قص وتفصيل ${String(cuttingPieces)} قطعة حذاء بالمقصدار`
          : "تم الانتهاء من كافة القطع المحولة للورشة",
    },
    {
      name: "٢. ورشة الإنتاج والتجميع",
      supervisor: "أحمد عادل (مشرف خطوط التجميع والشد)",
      quantity: productionPieces,
      status:
        productionPieces > 0
          ? "قيد الشد والتركيب والتجميع النهائي على خطوط الإنتاج"
          : "لا توجد قطع قيد الانتظار حالياً",
    },
    {
      name: "٣. مراقبة الجودة والتغليف",
      supervisor: "منى سعيد (رئيسة قسم ضبط الجودة والتغليف)",
      quantity: qualityPieces,
      status:
        qualityPieces > 0
          ? "تحت الفحص الدقيق والقياس والتوثيق والتعبئة بالكراتين"
          : "محطة الفحص جاهزة لاستقبال دفعات الإنتاج",
    },
    {
      name: "٤. المستودع المركزي والتسليم",
      supervisor: "سارة محمد (أمينة المستودع والشحن)",
      quantity: warehousePieces,
      status:
        "جاهزة ومخزنة ومعبأة بكراتين رسمية، قيد تجهيز الشحن والربط مع المناديب",
    },
    {
      name: "٥. الشحن والتوزيع الميداني",
      supervisor: "طاقم التوزيع الميداني والمناديب",
      quantity: dispatchPieces,
      status:
        dispatchPieces > 0
          ? "خرجت مع المندوب وفي طريقها للتسليم النهائي للعميل"
          : "لا توجد شحنات مع المناديب في هذه اللحظة",
    },
  ];
  return (
    <section className="print-avoid-break mt-6">
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
              <tr key={stage.name} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-bold text-slate-900">
                  {stage.name}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {stage.supervisor}
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                  {stage.quantity} قطعة
                </td>
                <td className="px-3 py-2.5 text-slate-600">{stage.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
