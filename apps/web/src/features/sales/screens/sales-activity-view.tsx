"use client";
import { useState } from "react";
import Link from "next/link";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { draftChangeFieldLabels } from "../model/draft-form.model";
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
        subtitle="الحركات المحفوظة للمسودات والطلبات المقدمة"
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
          data={query.data.events.map((item) =>
            item.kind === "draft"
              ? {
                  ...item.change,
                  id: item.change.commandId,
                  resourceId: item.change.draftId,
                  reference: item.change.draftId,
                  label:
                    item.change.operation === "CREATE_DRAFT"
                      ? "إنشاء مسودة"
                      : "حفظ تعديل المسودة",
                  fields: item.change.changedFields
                    .map((field) => draftChangeFieldLabels[field])
                    .join("، "),
                }
              : {
                  ...item.event,
                  resourceId: item.event.orderId,
                  reference: item.event.businessNumber,
                  label: {
                    SUBMIT_NEW_ORDER: "إرسال طلب جديد",
                    SUBMIT_DRAFT: "إرسال المسودة للاعتماد",
                    RESUBMIT_ORDER: "إعادة الإرسال للاعتماد",
                    SET_ORDER_PAID: "تعديل المبلغ المدفوع",
                  }[item.event.operation],
                  fields: item.event.changedFields
                    .map(
                      (field) =>
                        ({
                          ...draftChangeFieldLabels,
                          catalogSelections: "اختيارات القوائم",
                          status: "الحالة",
                          businessNumber: "رقم الطلب",
                          customerSnapshot: "بيانات العميل وقت الإرسال",
                          prices: "الأسعار المعتمدة",
                        })[field],
                    )
                    .join("، "),
                },
          )}
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
                <strong className="text-slate-800">{change.label}</strong>
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
