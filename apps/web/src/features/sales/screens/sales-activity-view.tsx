"use client";
import { useState } from "react";
import Link from "next/link";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { apiFailureMessage } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { toSalesActivityRow } from "../model/order-view.model";
import { useSalesActivity } from "../hooks/orders.hooks";

export function SalesActivityView() {
  const scope = useOperationalScope(),
    [page, setPage] = useState(1),
    query = useSalesActivity({ page, limit: 25 });
  if (
    query.data !== undefined &&
    page > Math.max(1, query.data.pagination.totalPages)
  )
    setPage(Math.max(1, query.data.pagination.totalPages));
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / سجل النشاط"
        title="سجل حركات ونشاط المبيعات"
        subtitle="الحركات المحفوظة للمسودات والطلبات والتصنيع والجودة"
      />
      {query.isFetching && <p role="status">جارٍ تحميل النشاط...</p>}
      {query.isError && (
        <div role="alert">
          تعذّر تحميل النشاط. {apiFailureMessage(query.error)}
          <button
            type="button"
            className="btn-pill btn-outline"
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
          data={query.data.events.map(toSalesActivityRow)}
          keyExtractor={(change) => change.id}
          emptyTitle="لا يوجد نشاط مسجل"
          pagination={{
            page,
            totalPages: Math.max(1, query.data.pagination.totalPages),
            total: query.data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "الحدث",
              render: (change) => (
                <div>
                  <strong className="text-slate-800">{change.label}</strong>
                  {change.decisionLabel !== null && (
                    <span className="mr-1">{change.decisionLabel}</span>
                  )}
                </div>
              ),
            },
            {
              header: "الطلب / المسودة",
              render: (change) => (
                <Link
                  href={`/sales/orders/${change.resourceId}`}
                  className="font-mono font-bold text-teal-700"
                  dir="ltr"
                >
                  {change.reference}
                </Link>
              ),
            },
            { header: "الموظف", render: (change) => change.actor.fullName },
            { header: "الكمية", render: () => "—" },
            {
              header: "التغييرات",
              render: (change) => change.fields || "—",
            },
            {
              header: "التوقيت",
              render: (change) => (
                <time dateTime={change.occurredAt}>{change.occurredAt}</time>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
