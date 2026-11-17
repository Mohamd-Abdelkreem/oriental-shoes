import type { AdministrationReportPrintData } from "@template/contracts";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { toAdministrationReportRow } from "@/features/administration/model/administration-report.model";

export function ReportOrders({
  orders,
  meta,
}: {
  orders: AdministrationReportPrintData["orders"]["items"];
  meta: AdministrationReportPrintData["meta"];
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black tracking-wide text-slate-900">
          ٤. سجل أوامر التشغيل والإنتاج التفصيلي ({meta.cohort.orderCount} طلب)
        </h3>
        <span className="text-[11px] text-slate-500">
          تفاصيل كل أمر: العميل، مسؤول المبيعات، وموقع القطع الآن
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-xs wrap-anywhere">
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
            {orders.map((order) => (
              <ReportOrderRow key={order.orderId} order={order} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportOrderRow({
  order,
}: {
  order: AdministrationReportPrintData["orders"]["items"][number];
}) {
  const presentation = toAdministrationReportRow(order);

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2.5">
        <strong
          className="block font-mono text-xs font-bold text-slate-900"
          dir="ltr"
        >
          {presentation.reference}
        </strong>
        <span className="text-[11px] text-slate-500">
          {typeLabels[order.type]}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <strong className="block text-slate-900">
          {order.customer.name ?? "—"}
        </strong>
        <span className="text-[11px] text-slate-500">
          {order.customer.phone ?? "—"}{" "}
          {order.customer.address ? `· ${order.customer.address}` : ""}
        </span>
      </td>

      <td className="px-3 py-2.5 text-slate-700">
        {order.salesperson.fullName}
      </td>

      <td className="px-3 py-2.5 text-center">
        <strong className="block text-slate-900">
          {presentation.completionLabel}
        </strong>
        <span className="text-[10px] text-slate-500">
          {presentation.statusLabel}
        </span>
      </td>

      <td className="px-3 py-2.5 font-semibold text-slate-800">
        {presentation.locationLabel}
      </td>

      <td className="px-3 py-2.5 text-center">
        <span className="block font-mono text-xs text-slate-900">
          {order.deliveryDate ?? "غير محدد"}
        </span>
        {order.isOverdue ? (
          <span className="text-[10px] font-bold text-red-700">
            متأخر عن الموعد
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">لا يوجد تأخير مسجل</span>
        )}
      </td>
    </tr>
  );
}
