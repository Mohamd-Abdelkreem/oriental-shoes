"use client";
import { useState } from "react";
import Link from "next/link";
import { FilePlus2, Edit } from "lucide-react";
import { salesOrderTypeSchema } from "@template/contracts";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import {
  orderTypeOptions,
  orderTypeLabels as typeLabels,
} from "@/features/orders/order-types";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalTable } from "@/features/prototype/components/data-table";
import {
  OrientalFilterBar,
  FilterSelect,
} from "@/features/prototype/components/filter-bar";
import { useDraftList } from "../hooks/drafts.hooks";
import {
  draftEditRoute,
  type DraftListEntry,
  parseDraftListEntry,
} from "../model/draft-form.model";

export function SalesAllOrdersView({ entry }: { entry: DraftListEntry }) {
  const [status, setStatus] = useState(
    entry.kind === "drafts"
      ? entry.status === "ALL"
        ? "الكل"
        : "مسودة"
      : entry.kind === "unavailable"
        ? entry.status
        : "",
  );
  const selectedEntry =
    entry.kind === "invalid" ? entry : parseDraftListEntry(status);
  if (selectedEntry.kind !== "drafts")
    return (
      <div className="space-y-5">
        <OrientalPageHeader
          title="جميع طلبات قسم المبيعات"
          subtitle="المسودات فقط متاحة حالياً"
        />
        <p role="alert">
          {selectedEntry.kind === "invalid"
            ? "حالة الطلب المطلوبة غير صالحة."
            : "هذه الحالة غير متاحة حتى تفعيل مراحل الطلب اللاحقة."}
        </p>
        <Link href="/sales/orders/drafts" className="btn-pill btn-outline">
          المسودات
        </Link>
      </div>
    );
  return <DraftOrders status={status} setStatus={setStatus} />;
}
function DraftOrders({
  status,
  setStatus,
}: {
  status: string;
  setStatus: (value: string) => void;
}) {
  const scope = useOperationalScope();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [type, setType] = useState("الكل");
  const parsedType = salesOrderTypeSchema.safeParse(type);
  const query = useDraftList({
    page,
    limit: 25,
    search,
    ...(parsedType.success ? { type: parsedType.data } : {}),
  });
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
        title="جميع طلبات قسم المبيعات"
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
      <OrientalFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value.slice(0, 150));
          setPage(1);
        }}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، الموديل..."
        totalCount={data?.totalDrafts}
        filteredCount={data?.pagination.total}
        countLabel="طلب"
        onReset={() => {
          setSearch("");
          setType("الكل");
          setStatus("الكل");
          setPage(1);
        }}
      >
        <label className="inline-flex items-center">
          <span className="ml-2 text-xs font-semibold text-slate-500">
            حالة الطلب:
          </span>
          <FilterSelect
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              "الكل",
              "مسودة",
              "بانتظار الاعتماد",
              "معاد للتعديل",
              "قيد التصنيع",
              "في المستودع",
              "تم التسليم",
              "ملغي",
            ]}
          />
        </label>
        <label className="inline-flex items-center">
          <span className="ml-2 text-xs font-semibold text-slate-500">
            نوع الطلب:
          </span>
          <FilterSelect
            value={type}
            onChange={(value) => {
              setType(value);
              setPage(1);
            }}
            options={[{ label: "الكل", value: "الكل" }, ...orderTypeOptions]}
          />
        </label>
      </OrientalFilterBar>
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
          isSearchEmpty={search !== "" || type !== "الكل"}
          emptyTitle={
            search !== "" || type !== "الكل"
              ? "لا توجد نتائج للبحث"
              : "لا توجد مسودات"
          }
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
