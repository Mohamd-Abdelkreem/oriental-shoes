"use client";

import { useState } from "react";
import { useSalesOrders } from "../hooks/orders.hooks";
import Link from "next/link";
import { Edit } from "lucide-react";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function SalesReturnedView() {
  const [page, setPage] = useState(1);
  const query = useSalesOrders({ status: "RETURNED", page, limit: 25 });
  const destination = Math.max(1, query.data?.pagination.totalPages ?? page);
  if (page > destination) setPage(destination);
  const returned =
    query.data?.items.flatMap((item) =>
      item.kind === "submitted" ? [item.order] : [],
    ) ?? [];

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / المعادة للتعديل"
        title="طلبات معادة للتصحيح من مسؤول الاعتماد"
        badge={
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
            {query.data?.pagination.total ?? "—"} طلب بحاجة لتصحيح
          </span>
        }
        subtitle="قام مسؤول الاعتماد بإعادة هذه الطلبات مع بيان الحقول والمواصفات التي تحتاج استكمالاً"
      />

      {query.isPending && <p role="status">جارٍ تحميل الطلبات المعادة...</p>}
      {query.isError && (
        <div role="alert">
          تعذّر تحميل الطلبات المعادة.{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {query.data !== undefined && (
        <OrientalTable
          data={returned}
          keyExtractor={(o) => o.id}
          pagination={{
            page,
            totalPages: query.data.pagination.totalPages,
            total: query.data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "رقم الطلب",
              render: (o) => (
                <strong className="font-mono font-bold text-teal-700" dir="ltr">
                  {o.businessNumber}
                </strong>
              ),
            },
            { header: "العميل", render: (o) => o.customerSnapshot.name },
            {
              header: "سبب الإرجاع وملاحظة المراجع",
              render: (o) => (
                <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                  <strong>{o.returnInfo?.reason}</strong>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {o.returnInfo?.returnedAt}
                  </span>
                </div>
              ),
            },
            {
              header: "الكمية",
              render: (o) => `${String(o.counts.original)} قطع`,
            },
            { header: "تاريخ التسليم", accessor: "deliveryDate" },
            {
              header: "التصحيح",
              className: "text-left",
              render: (o) =>
                o.allowedActions.canResubmit ? (
                  <Link
                    href={`/sales/orders/new?edit=${o.id}`}
                    className="btn-pill btn-rose px-3 py-1 text-xs"
                  >
                    <Edit size={12} />
                    <span>تصحيح وإعادة الإرسال</span>
                  </Link>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
