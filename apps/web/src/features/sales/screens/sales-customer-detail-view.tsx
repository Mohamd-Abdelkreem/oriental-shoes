"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileEdit, FilePlus2, Info } from "lucide-react";
import {
  typeLabels,
  useMvpStore,
  formatOrderPieceProgress,
  getCustomerSizeProfile,
} from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";

export function SalesCustomerDetailView({
  customerId,
}: {
  customerId: string;
}) {
  const store = useMvpStore();
  const customer =
    store.customers.find((c) => c.phone === customerId) ||
    store.customers[0] ||
    notFound();
  const linkedOrders = store.orders.filter((o) => o.phone === customer.phone);
  const sizeProfile = getCustomerSizeProfile(customer.phone, store.orders);

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / دليل العملاء / تفاصيل العميل"
        title={customer.name}
        subtitle={`هاتف: ${customer.phone} · العنوان: ${customer.address || "غير محدد"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/sales/customers/${encodeURIComponent(customer.phone)}/edit`}
              className="btn-pill btn-secondary"
            >
              <FileEdit size={14} />
              <span>تعديل بيانات العميل</span>
            </Link>
            <Link
              href={`/sales/orders/new?customer=${encodeURIComponent(customer.phone)}`}
              className="btn-pill btn-teal"
            >
              <FilePlus2 size={14} />
              <span>إنشاء أمر تفصيل لهذا العميل</span>
            </Link>
            <Link href="/sales/customers" className="btn-pill btn-secondary">
              <ArrowRight size={14} />
              <span>دليل العملاء</span>
            </Link>
          </div>
        }
      />

      {/* Customer summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-xs text-slate-500">رقم الجوال</span>
          <strong
            className="mt-1 block font-mono text-sm text-slate-900"
            dir="ltr"
          >
            {customer.phone}
          </strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-xs text-slate-500">
            البريد الإلكتروني
          </span>
          <span
            className="mt-1 block truncate font-mono text-xs font-semibold text-slate-800"
            dir="ltr"
            title={customer.email || "غير محدد"}
          >
            {customer.email || "غير محدد"}
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-xs text-slate-500">أحدث مقاس مستخدم</span>
          <strong className="mt-0.5 block text-lg font-bold text-teal-700">
            {sizeProfile.latestSize || "غير مسجل"}
          </strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-xs text-slate-500">
            عدد أوامر التفصيل
          </span>
          <strong className="mt-1 block text-base font-bold text-slate-900">
            {linkedOrders.length} أوامر
          </strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-xs text-slate-500">العنوان</span>
          <span
            className="mt-1 block truncate text-sm text-slate-800"
            title={customer.address || "غير محدد"}
          >
            {customer.address || "غير محدد"}
          </span>
        </div>
      </div>

      {/* Historical Size Profile (Requirement 11) */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              الملف المقاسي وسجل المقاسات التاريخي للعميل
            </h3>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800">
              أحدث مقاس معتمد: {sizeProfile.latestSize || "غير مسجل"}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {sizeProfile.history.length}{" "}
            {sizeProfile.history.length === 1
              ? "أمر تفصيل مسجل"
              : sizeProfile.history.length === 2
                ? "أمرا تفصيل مسجلان"
                : "أوامر تفصيل مسجلة"}
          </span>
        </div>

        {sizeProfile.history.length === 0 ? (
          <p className="py-2 text-xs text-slate-400">
            لا توجد طلبات سابقة مسجلة لهذا العميل لاستخراج سجل المقاسات.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">التاريخ</th>
                  <th className="px-3 py-2.5">رقم أمر التفصيل</th>
                  <th className="px-3 py-2.5">نوع الطلب</th>
                  <th className="px-3 py-2.5">الكمية</th>
                  <th className="px-3 py-2.5 text-center">المقاس المسجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sizeProfile.history.map((h) => (
                  <tr
                    key={h.orderId}
                    className="transition hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 text-slate-500">
                      {h.orderDate}
                    </td>
                    <td
                      className="px-3 py-2.5 font-mono font-bold text-teal-700"
                      dir="ltr"
                    >
                      <Link
                        href={`/sales/orders/${h.orderId}`}
                        className="hover:underline"
                      >
                        {h.orderId}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {h.orderType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-600">
                      {h.piecesCount}{" "}
                      {h.piecesCount === 1
                        ? "قطعة"
                        : h.piecesCount === 2
                          ? "قطعتان"
                          : "قطع"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-block rounded-lg border border-teal-200 bg-teal-50 px-3 py-1 font-mono text-xs font-bold text-teal-900 shadow-2xs">
                        {h.size}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {customer.notes && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <strong className="mb-0.5 block font-bold">
              ملاحظات وتفضيلات العميل العامة:
            </strong>
            <span>{customer.notes}</span>
          </div>
        </div>
      )}

      {/* Orders with per-order notes and piece location breakdown (Requirement 11) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            أوامر التفصيل وتفاصيل كل قطعة ({linkedOrders.length}):
          </h3>
          <Link
            href={`/sales/orders/new?customer=${encodeURIComponent(customer.phone)}`}
            className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"
          >
            <FilePlus2 size={13} />
            <span>+ أمر تفصيل جديد</span>
          </Link>
        </div>

        <div className="space-y-3">
          {linkedOrders.map((order) => {
            const activePieces = order.items.filter((p) => !p.isDeleted);
            return (
              <div
                key={order.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="font-mono text-sm font-bold text-teal-700 hover:underline"
                      dir="ltr"
                    >
                      {order.id}
                    </Link>
                    <span className="text-xs text-slate-500">
                      · {typeLabels[order.type]}
                    </span>
                    <span className="text-xs text-slate-500">
                      · التسليم: {order.delivery}
                    </span>
                    <OrientalStatusPill tone={statusTone(order.status)}>
                      {order.status}
                    </OrientalStatusPill>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      {formatOrderPieceProgress(order)}
                    </span>
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="btn-pill btn-outline px-2.5 py-1 text-xs"
                    >
                      تتبع الطلب
                    </Link>
                  </div>
                </div>

                {(order.generalNotes || order.notes) && (
                  <div className="rounded border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-900">
                    <strong>ملاحظات مسجلة على هذا الطلب: </strong>
                    <span>{order.generalNotes || order.notes}</span>
                  </div>
                )}

                {/* Per-piece breakdown */}
                <div>
                  <span className="mb-2 block text-xs font-bold text-slate-600">
                    مكان وحالة كل قطعة داخل الطلب ({activePieces.length} قطع):
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {activePieces.map((piece, pIdx) => {
                      const loc = piece.currentLocation || "في انتظار البدء";
                      const isProb = loc === "لدى الاعتماد بسبب مشكلة";
                      return (
                        <div
                          key={piece.id}
                          className={`space-y-1 rounded-lg border p-2.5 text-xs ${
                            isProb
                              ? "border-rose-300 bg-rose-50 text-rose-900"
                              : loc === "في المستودع" || loc === "تم التسليم"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border-slate-200 bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <strong className="font-bold">
                              {piece.pieceNumber || formatPieceSequence(pIdx)}
                            </strong>
                            <span className="rounded border border-slate-200 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                              مقاس {piece.size}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-slate-600">
                            {piece.model} · {piece.leatherBase}
                          </p>
                          <div className="flex items-center justify-between border-t border-slate-200/60 pt-1 text-[11px]">
                            <span className="text-slate-500">
                              مكان القطعة الآن:
                            </span>
                            <b
                              className={
                                isProb ? "text-rose-700" : "text-teal-800"
                              }
                            >
                              {loc}
                            </b>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
