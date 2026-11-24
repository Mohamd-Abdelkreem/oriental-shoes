"use client";

import { apiFailureMessage } from "@/services/api/api-client";
import { useState } from "react";
import { useSalesOrders } from "../hooks/orders.hooks";
import Link from "next/link";
import { Edit } from "lucide-react";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

import { useP04OperationalScope } from "@/shared/query/operational-scope";
import { ApprovalCommandRecovery } from "@/features/approval/components/approval-command-recovery";
import { useSalesContactQueue } from "../hooks/sales-contact.hooks";
import { salesContactRoute } from "../model/sales-contact.model";

export function SalesReturnedView() {
  const scope = useP04OperationalScope("SALES_CONTACT");
  const [contactPage, setContactPage] = useState(1),
    contact = useSalesContactQueue({ page: contactPage, limit: 25 });
  const contactOrderIds = new Set(
    contact.data?.items.map(({ order }) => order.id),
  );
  const contactDestination = Math.max(
    1,
    contact.data?.pagination.totalPages ?? contactPage,
  );
  if (contactPage > contactDestination) setContactPage(contactDestination);
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
          تعذّر تحميل الطلبات المعادة. {apiFailureMessage(query.error)}{" "}
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
                <Link
                  href={`/sales/orders/${o.id}`}
                  className="font-mono font-bold text-teal-700 hover:underline"
                  dir="ltr"
                >
                  {o.businessNumber}
                </Link>
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
      <section
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        aria-label="قطع تحتاج تواصلاً مع العميل"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-bold text-slate-800">
            قطع تحتاج تواصلاً مع العميل
          </h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            {contact.data?.pagination.total ?? "—"} قطعة
          </span>
        </div>
        {contact.isPending && <p role="status">جارٍ تحميل قطع التواصل…</p>}
        {contact.isFetching && !contact.isPending && (
          <p role="status">جارٍ تحديث قطع التواصل…</p>
        )}
        {contact.isError && (
          <div role="alert">
            تعذّر تحميل قطع التواصل. {apiFailureMessage(contact.error)}{" "}
            <button
              type="button"
              onClick={() => {
                void contact.refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {contact.data && (
          <OrientalTable
            data={contact.data.items}
            keyExtractor={(row) => row.issue.id}
            emptyTitle="لا توجد قطع تحتاج تواصلاً"
            pagination={{
              page: contactPage,
              totalPages: contact.data.pagination.totalPages,
              total: contact.data.pagination.total,
              onPageChange: setContactPage,
            }}
            columns={[
              {
                header: "رقم الطلب",
                render: (row) => (
                  <Link
                    href={`/sales/orders/${row.order.id}`}
                    className="font-mono font-bold text-teal-700 hover:underline"
                    dir="ltr"
                  >
                    {row.order.businessNumber}
                  </Link>
                ),
              },
              {
                header: "العميل",
                render: (row) => row.order.customerSnapshot.name,
              },
              {
                header: "القطعة",
                render: (row) =>
                  `${String(row.piece.position)} · ${row.piece.model ?? "—"}`,
              },
              {
                header: "الحالة",
                render: (row) =>
                  row.issue.state === "REAPPROVAL"
                    ? "بانتظار إعادة الاعتماد"
                    : "بانتظار تواصل المبيعات",
              },
              {
                header: "تعليمات الاعتماد الحالية",
                render: (row) => row.issue.instructions?.text ?? "—",
              },
              {
                header: "الإجراء",
                className: "text-left",
                render: (row) =>
                  scope !== null &&
                  row.issue.allowedActions.canSubmitContact &&
                  !contact.isError &&
                  !contact.isFetching ? (
                    <Link
                      href={salesContactRoute(row.order.id, row.issue.id)}
                      prefetch={false}
                      className="btn-pill btn-teal px-3 py-1 text-xs"
                    >
                      التواصل مع العميل
                    </Link>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </section>
      {scope !== null &&
        Array.from(contactOrderIds, (orderId) => (
          <ApprovalCommandRecovery
            key={orderId}
            orderId={orderId}
            capability="SALES_CONTACT"
          />
        ))}
    </div>
  );
}
