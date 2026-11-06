"use client";
import { useState } from "react";
import Link from "next/link";
import { FilePlus2, Edit } from "lucide-react";

import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { orderTypeLabels as typeLabels } from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";

import { useDraftList } from "../hooks/drafts.hooks";
import { draftEditRoute } from "../model/draft-form.model";

export function SalesDraftsView() {
  const scope = useOperationalScope();
  const [page, setPage] = useState(1);
  const query = useDraftList({ page, limit: 25 });
  const data = query.data;
  const lastPage =
    data === undefined ? page : Math.max(1, data.pagination.totalPages);
  if (page > lastPage) setPage(lastPage);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / المسودات"
        title="أوامر التفصيل المسودة"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {data?.totalDrafts ?? "—"} مسودة
          </span>
        }
        subtitle="مسودات غير مقدمة؛ المراجع تقنية ولا تمثل أرقام طلبات معتمدة"
        actions={
          <Link href="/sales/orders/new" className="btn-pill btn-teal">
            <FilePlus2 size={16} />
            إنشاء مسودة جديدة
          </Link>
        }
      />

      <p className="text-xs text-slate-500">
        المتاح حالياً هو المسودات فقط؛ الاعتماد والتصنيع والتسليم غير متاحة.
      </p>
      {query.isFetching && data !== undefined && (
        <p role="status">جارٍ تحديث المسودات...</p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs"
        >
          تعذّر تحميل المسودات. {getApiError(query.error).requestId}
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
      {data === undefined ? (
        !query.isError && <p role="status">جارٍ تحميل المسودات...</p>
      ) : (
        <OrientalTable
          data={data.drafts}
          keyExtractor={(draft) => draft.id}
          emptyTitle="لا توجد مسودات"
          pagination={{
            page,
            totalPages: Math.max(1, data.pagination.totalPages),
            total: data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "مرجع المسودة التقني",
              render: (draft) => (
                <strong className="font-mono font-bold text-teal-700" dir="ltr">
                  {draft.id}
                </strong>
              ),
            },
            {
              header: "العميل",
              render: (draft) => draft.customer?.name ?? "—",
            },
            { header: "نوع الطلب", render: (draft) => typeLabels[draft.type] },
            {
              header: "الكمية المبدئية",
              render: (draft) => `${String(draft.pieceCount)} قطع`,
            },
            {
              header: "تاريخ الإنشاء",
              render: (draft) => (
                <time dateTime={draft.createdAt}>{draft.createdAt}</time>
              ),
            },
            {
              header: "موعد التسليم المقترح",
              render: (draft) => draft.deliveryDate ?? "—",
            },
            {
              header: "الإجراء",
              className: "text-left",
              render: (draft) => (
                <div className="flex justify-end gap-2">
                  <Link
                    href={draftEditRoute(draft.id)}
                    className="btn-pill btn-teal px-3 py-1 text-xs"
                  >
                    <Edit size={12} />
                    متابعة التحرير
                  </Link>
                  <Link
                    href={`/sales/orders/${draft.id}`}
                    className="btn-pill btn-outline px-3 py-1 text-xs"
                  >
                    عرض
                  </Link>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
