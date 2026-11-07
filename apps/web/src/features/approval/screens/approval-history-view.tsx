"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { useApprovalHistory } from "../hooks/approval.hooks";

const operationLabels = {
  APPROVE_INITIAL: "اعتماد أولي",
  RETURN_INITIAL: "إعادة للمبيعات",
  RESOLVE_ISSUE: "قرار مشكلة تصنيع",
  REVIEW_CONTACT: "مراجعة تواصل العميل",
  REPORT_ISSUE: "إحالة مشكلة",
  SUBMIT_CONTACT: "تواصل العميل",
};
export function ApprovalHistoryView() {
  const [page, setPage] = useState(1),
    query = useApprovalHistory({ page, limit: 25 });
  const destination = Math.max(1, query.data?.pagination.totalPages ?? page);
  if (page > destination) setPage(destination);
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الاعتماد / سجل القرارات"
        title="سجل قرارات الاعتماد والإعادة"
        subtitle="توثيق زمني لقراراتك المحفوظة على أوامر التفصيل والقطع"
      />
      {query.isPending && <p role="status">جارٍ تحميل سجل القرارات…</p>}
      {query.isFetching && !query.isPending && (
        <p role="status">جارٍ تحديث سجل القرارات…</p>
      )}
      {query.isError && (
        <div role="alert">
          تعذّر تحميل سجل القرارات.{" "}
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
      {query.data && (
        <OrientalTable
          data={query.data.events}
          keyExtractor={(event) => event.id}
          emptyTitle="لا توجد قرارات محفوظة"
          pagination={{
            page,
            totalPages: query.data.pagination.totalPages,
            total: query.data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "القرار المتخذ",
              render: (event) => (
                <strong className="text-slate-800">
                  {operationLabels[event.operation]}
                </strong>
              ),
            },
            {
              header: "رقم الطلب",
              render: (event) => (
                <Link
                  href={`/approval/orders/${event.orderId}`}
                  className="font-mono font-bold text-teal-700 hover:underline"
                  dir="ltr"
                >
                  {event.businessNumber}
                </Link>
              ),
            },
            {
              header: "مسؤول الاعتماد",
              render: (event) => event.actor.fullName,
            },
            {
              header: "الوجهة التشغيلية",
              render: (event) =>
                event.decision === "SEND_TO_SALES" ||
                event.decision === "RETURN_TO_SALES" ||
                event.operation === "RETURN_INITIAL"
                  ? "المبيعات"
                  : event.decision === "CANCEL"
                    ? "قطعة ملغاة"
                    : "—",
            },
            {
              header: "السبب / الملاحظة",
              render: (event) => event.notes ?? "—",
            },
            {
              header: "التوقيت",
              accessor: "occurredAt",
              className: "text-slate-400 font-mono text-xs",
            },
            {
              header: "الإجراء",
              className: "text-left",
              render: (event) => (
                <Link
                  href={`/approval/orders/${event.orderId}`}
                  className="btn-pill btn-outline inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700"
                >
                  <FileText size={12} />
                  <span>أمر التفصيل</span>
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
