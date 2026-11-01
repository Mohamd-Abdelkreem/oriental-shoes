import {
  requiredQuantity,
  typeLabels,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";
import {
  activeStageSummary,
  isOrderOverdue,
} from "@/features/prototype/state/workflow";

export function ReportOrders({ reportOrders }: { reportOrders: MvpOrder[] }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٤. سجل أوامر التشغيل والإنتاج التفصيلي ({reportOrders.length} طلب)
        </h3>
        <span className="text-[11px] text-slate-500">
          تفاصيل كل أمر: العميل، مسؤول المبيعات، وموقع القطع الآن
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-right font-bold text-slate-900">
              <th className="px-3 py-2.5">رقم الأمر والنوع</th>
              <th className="px-3 py-2.5">العميل والتواصل</th>
              <th className="px-3 py-2.5">المسؤول</th>
              <th className="px-3 py-2.5 text-center">الكميات والإنجاز</th>
              <th className="px-3 py-2.5">موقع القطع الحالي</th>
              <th className="px-3 py-2.5 text-center">
                تاريخ التسليم والالتزام
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white leading-relaxed">
            {reportOrders.map((order) => (
              <ReportOrderRow key={order.id} order={order} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportOrderRow({ order }: { order: MvpOrder }) {
  const requiredCount = requiredQuantity(order);
  const overdue = isOrderOverdue(order);
  const activeStage = activeStageSummary(order);
  const percentage =
    requiredCount > 0 ? Math.round((order.warehouse / requiredCount) * 100) : 0;

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2.5">
        <strong
          className="block font-mono text-xs font-bold text-slate-900"
          dir="ltr"
        >
          {order.id}
        </strong>
        <span className="text-[11px] text-slate-500">
          {typeLabels[order.type] || order.type}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <strong className="block text-slate-900">{order.customer}</strong>
        <span className="text-[11px] text-slate-500">
          {order.phone || "—"} {order.address ? `· ${order.address}` : ""}
        </span>
      </td>

      <td className="px-3 py-2.5 text-slate-700">
        {order.salesperson || "الإدارة العامة"}
      </td>

      <td className="px-3 py-2.5 text-center">
        <strong className="block text-slate-900">
          {order.warehouse} من {requiredCount} قطعة
        </strong>
        <span className="text-[10px] text-slate-500">
          ({percentage}% جاهز بالمستودع)
        </span>
      </td>

      <td className="px-3 py-2.5 font-semibold text-slate-800">
        {activeStage}
      </td>

      <td className="px-3 py-2.5 text-center">
        <span className="block font-mono text-xs text-slate-900">
          {order.delivery || "غير محدد"}
        </span>
        {overdue ? (
          <span className="text-[10px] font-bold text-red-700">
            متأخر عن الموعد
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">ضمن الجدول</span>
        )}
      </td>
    </tr>
  );
}
