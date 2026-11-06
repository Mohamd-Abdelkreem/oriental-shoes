"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { useOperationalScope } from "@/shared/query/operational-scope";
import {
  useCustomerByPhone,
  useCustomer,
  useCustomerDrafts,
} from "@/features/customers/hooks/customers.hooks";
import { parseCustomerRoutePhone } from "@/features/customers/model/customer-form.model";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminCustomerDetailView({
  customerId,
}: {
  customerId: string;
}) {
  const scope = useOperationalScope();
  const phone = parseCustomerRoutePhone(customerId);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (phone === null) return <p role="alert">رقم العميل غير صالح.</p>;
  return (
    <CustomerDetail
      key={`${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}:${customerId}`}
      phone={phone}
    />
  );
}
function CustomerDetail({ phone }: { phone: string }) {
  const [id, setId] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const resolver = useCustomerByPhone(id === null ? phone : null),
    detail = useCustomer(id),
    cards = useCustomerDrafts(id, { page, limit: 25 });
  if (id === null && resolver.data !== undefined)
    setId(resolver.data.customer.id);
  const lastPage =
    cards.data === undefined
      ? page
      : Math.max(1, cards.data.pagination.totalPages);
  if (page > lastPage) setPage(lastPage);
  if (id === null && resolver.isError)
    return (
      <div role="alert">
        العميل غير موجود أو تعذّر تحميله.{" "}
        {getApiError(resolver.error).requestId}
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => {
            void resolver.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  if (detail.isError && detail.data === undefined)
    return (
      <div role="alert">
        العميل غير موجود أو تعذّر تحميله. {getApiError(detail.error).requestId}
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => {
            void detail.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  if (detail.data === undefined)
    return <p role="status">جارٍ تحميل العميل...</p>;
  const customer = detail.data.customer,
    linkedOrders = cards.data?.drafts ?? [];
  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / تفاصيل العميل"
        title={customer.name}
        subtitle={`هاتف: ${customer.phone} · العنوان: ${customer.address ?? "غير محدد"}`}
        actions={
          <Link href="/admin/customers" className="btn-pill btn-secondary">
            <ArrowRight size={15} />
            <span>العودة لقائمة العملاء</span>
          </Link>
        }
      />

      {detail.isFetching && <p role="status">جارٍ تحديث بيانات العميل...</p>}
      {detail.isError && (
        <p role="alert">
          تعذّر تحديث بيانات العميل. {getApiError(detail.error).requestId}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void detail.refetch();
            }}
          >
            إعادة تحديث العميل
          </button>
        </p>
      )}
      <p className="text-xs text-slate-500">
        المتاح حالياً مسودات غير مقدمة؛ التصنيع والمخزون والطلبات المكتملة غير
        متاحة بعد.
      </p>
      {/* Customer Summary Card */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-4">
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            المسودات المتاحة
          </span>
          <strong className="text-xl font-bold text-slate-800">
            {detail.data.draftCount} مسودات
          </strong>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            المسودات غير المقدمة
          </span>
          <strong className="text-xl font-bold text-teal-700">
            {detail.data.draftCount}
          </strong>
        </div>
        <div>
          <span className="mb-1 block text-xs text-slate-400">
            الطلبات المكتملة (غير متاحة بعد)
          </span>
          <strong className="text-xl font-bold text-emerald-700">—</strong>
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
          مسودات التفصيل الخاصة بهذا العميل:
        </h3>
        {cards.isFetching && <p role="status">جارٍ تحميل المسودات...</p>}
        {cards.isError && (
          <div role="alert">
            تعذّر تحميل المسودات. {getApiError(cards.error).requestId}
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void cards.refetch();
              }}
            >
              إعادة تحميل المسودات
            </button>
          </div>
        )}
        {cards.data !== undefined && (
          <OrientalTable
            emptyTitle="لا توجد مسودات مرتبطة متاحة لهذا الحساب"
            pagination={{
              page,
              totalPages: Math.max(1, cards.data.pagination.totalPages),
              total: cards.data.pagination.total,
              onPageChange: setPage,
            }}
            data={linkedOrders}
            keyExtractor={(o) => o.id}
            columns={[
              {
                header: "رقم الطلب",
                render: (o) => (
                  <Link
                    href={`/sales/orders/${o.id}`}
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
                render: (o) => `${String(o.pieceCount)} قطع`,
              },
              { header: "المستودع", render: () => "غير متاح قبل الإرسال" },
              { header: "تاريخ التسليم", render: (o) => o.deliveryDate ?? "—" },
              {
                header: "الحالة",
                render: () => (
                  <OrientalStatusPill tone="neutral">مسودة</OrientalStatusPill>
                ),
              },
              {
                header: "فتح",
                className: "text-left",
                render: (o) => (
                  <Link
                    href={`/sales/orders/${o.id}`}
                    className="btn-pill btn-outline px-3 py-1 text-xs"
                  >
                    عرض
                  </Link>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
