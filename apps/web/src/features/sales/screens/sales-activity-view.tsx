"use client";
import { useState } from "react";
import Link from "next/link";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { draftChangeFieldLabels } from "../model/draft-form.model";
import { useDraftActivity } from "../hooks/drafts.hooks";

export function SalesActivityView() {
  const scope = useOperationalScope(),
    [page, setPage] = useState(1),
    query = useDraftActivity({ page, limit: 25 });
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / سجل النشاط"
        title="سجل حركات ونشاط المبيعات"
        subtitle="تغييرات المسودات المحفوظة فقط؛ نشاط مراحل الطلب اللاحقة غير متاح"
      />
      {query.isFetching && <p role="status">جارٍ تحميل النشاط...</p>}
      {query.isError && (
        <div role="alert">
          تعذّر تحميل النشاط. {getApiError(query.error).requestId}
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
          data={query.data.changes}
          keyExtractor={(change) => change.commandId}
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
                <strong className="text-slate-800">
                  {change.operation === "CREATE_DRAFT"
                    ? "إنشاء مسودة"
                    : "حفظ تعديل المسودة"}
                </strong>
              ),
            },
            {
              header: "مرجع المسودة التقني",
              render: (change) => (
                <Link
                  href={`/sales/orders/${change.draftId}`}
                  className="font-mono font-bold text-teal-700"
                  dir="ltr"
                >
                  {change.draftId}
                </Link>
              ),
            },
            { header: "الموظف", render: (change) => change.actor.fullName },
            { header: "الكمية", render: () => "—" },
            {
              header: "التغييرات",
              render: (change) =>
                change.changedFields
                  .map((field) => draftChangeFieldLabels[field])
                  .join("، ") || "—",
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
