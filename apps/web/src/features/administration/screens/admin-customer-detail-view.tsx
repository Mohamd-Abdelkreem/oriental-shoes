"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  requiredQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminCustomerDetailView({
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

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / تفاصيل العميل"
        title={customer.name}
        subtitle={`هاتف: ${customer.phone} · العنوان: ${customer.address}`}
        actions={
          <Link href="/admin/customers" className="btn-pill btn-secondary">
            <ArrowRight size={15} />
            <span>العودة لقائمة العملاء</span>
          </Link>
        }
      />

      {/* Customer Summary Card */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-4">
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            إجمالي الطلبات
          </span>
          <strong className="text-xl font-bold text-slate-800">
            {linkedOrders.length} طلبات
          </strong>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            الطلبات النشطة
          </span>
          <strong className="text-xl font-bold text-teal-700">
            {
              linkedOrders.filter(
                (o) => !["تم الاستلام", "ملغي بالكامل"].includes(o.status),
              ).length
            }
          </strong>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            الطلبات المكتملة
          </span>
          <strong className="text-xl font-bold text-emerald-700">
            {linkedOrders.filter((o) => o.status === "تم الاستلام").length}
          </strong>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            ملاحظات العميل
          </span>
          <span className="block text-xs text-slate-600">
            {customer.notes || "لا توجد ملاحظات خاصة"}
          </span>
        </div>
      </div>

      {/* Linked Orders Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          أوامر التصنيع الخاصة بهذا العميل:
        </h3>
        <OrientalTable
          data={linkedOrders}
          keyExtractor={(o) => o.id}
          columns={[
            {
              header: "رقم الطلب",
              render: (o) => (
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="font-mono font-bold text-teal-700"
                  dir="ltr"
                >
                  {o.id}
                </Link>
              ),
            },
            { header: "النوع", render: (o) => typeLabels[o.type] },
            {
              header: "الكمية المطلوبة",
              render: (o) => `${String(requiredQuantity(o))} قطع`,
            },
            { header: "المستودع", render: (o) => `${String(o.warehouse)} قطع` },
            { header: "تاريخ التسليم", accessor: "delivery" },
            {
              header: "الحالة",
              render: (o) => (
                <OrientalStatusPill tone={statusTone(o.status)}>
                  {o.status}
                </OrientalStatusPill>
              ),
            },
            {
              header: "فتح",
              className: "text-left",
              render: (o) => (
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="btn-pill btn-outline px-3 py-1 text-xs"
                >
                  عرض
                </Link>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
