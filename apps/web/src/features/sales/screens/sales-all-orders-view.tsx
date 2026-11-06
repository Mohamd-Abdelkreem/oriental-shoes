"use client";
import { useState } from "react";
import Link from "next/link";
import { FilePlus2, Edit } from "lucide-react";
import {
  salesOrderListQuerySchema,
  salesOrderTypeSchema,
} from "@template/contracts";
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
import { useSalesOrders } from "../hooks/orders.hooks";
import {
  toSalesOrderListRow,
  toSalesOrderStatusLabel,
} from "../model/order-view.model";
import {
  parseSalesOrderListEntry,
  type SalesOrderListEntry,
} from "../model/order-form.model";
import { draftEditRoute } from "../model/draft-form.model";

export function SalesAllOrdersView({ entry }: { entry: SalesOrderListEntry }) {
  const [status, setStatus] = useState(
    entry.kind === "orders"
      ? entry.status === "ALL"
        ? "الكل"
        : toSalesOrderStatusLabel(entry.status)
      : entry.kind === "unavailable"
        ? entry.status
        : "",
  );
  const selectedEntry =
    entry.kind === "invalid" ? entry : parseSalesOrderListEntry(status);
  if (selectedEntry.kind !== "orders")
    return (
      <div className="space-y-5">
        <OrientalPageHeader
          title="جميع طلبات قسم المبيعات"
          subtitle="طلبات ومسودات المبيعات"
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
  const selectedStatus = parseSalesOrderListEntry(status);
  const query = useSalesOrders({
    page,
    limit: 25,
    search,
    ...(selectedStatus.kind === "orders" && selectedStatus.status !== "ALL"
      ? { status: selectedStatus.status }
      : {}),
    ...(parsedType.success ? { type: parsedType.data } : {}),
  });
  const onlyDrafts =
    selectedStatus.kind === "orders" && selectedStatus.status === "DRAFT";
  const readLabel = onlyDrafts ? "المسودات" : "طلبات المبيعات";
  const data = query.data;
  const lastPage =
    data === undefined ? page : Math.max(1, data.pagination.totalPages);
  if (page > lastPage) setPage(lastPage);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / الطلبات"
        title="جميع طلبات قسم المبيعات"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {data?.totalOrders ?? "—"} طلب
          </span>
        }
        subtitle="المسودات بمراجعها التقنية والطلبات المقدمة بأرقامها المعتمدة"
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
        totalCount={data?.totalOrders}
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
              "جاهز للتسليم",
              "خرج مع المندوب",
              "تعذر التسليم",
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
        إجمالي القطع: {data?.totalPieces ?? "—"}. أعداد الحالات:{" "}
        {data === undefined
          ? "—"
          : salesOrderListQuerySchema.shape.status
              .unwrap()
              .options.map(
                (key) =>
                  `${toSalesOrderStatusLabel(key)}: ${String(data.statusCounts[key])}`,
              )
              .join(" · ")}
      </p>
      {query.isFetching && data !== undefined && (
        <p role="status">{`جارٍ تحديث ${readLabel}...`}</p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs"
        >
          {`تعذّر تحميل ${readLabel}.`} {getApiError(query.error).requestId}
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
        !query.isError && <p role="status">{`جارٍ تحميل ${readLabel}...`}</p>
      ) : (
        <OrientalTable
          data={data.items.map(toSalesOrderListRow)}
          keyExtractor={(draft) => draft.id}
          isSearchEmpty={search !== "" || type !== "الكل"}
          emptyTitle={
            search !== "" || type !== "الكل"
              ? "لا توجد نتائج للبحث"
              : onlyDrafts
                ? "لا توجد مسودات"
                : "لا توجد طلبات مبيعات"
          }
          pagination={{
            page,
            totalPages: Math.max(1, data.pagination.totalPages),
            total: data.pagination.total,
            onPageChange: setPage,
          }}
          columns={[
            {
              header: "رقم الطلب / مرجع المسودة",
              render: (draft) => (
                <strong className="font-mono font-bold text-teal-700" dir="ltr">
                  {draft.reference}
                </strong>
              ),
            },
            {
              header: "العميل",
              render: (draft) => draft.customer || "—",
            },
            { header: "نوع الطلب", render: (draft) => typeLabels[draft.type] },
            { header: "الحالة", accessor: "status" },
            { header: "الإجمالي", render: (row) => row.money?.total ?? "—" },
            {
              header: "الكمية",
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
                  {draft.canEdit && (
                    <Link
                      href={draftEditRoute(draft.id)}
                      className="btn-pill btn-teal px-3 py-1 text-xs"
                    >
                      <Edit size={12} />
                      متابعة التحرير
                    </Link>
                  )}
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
