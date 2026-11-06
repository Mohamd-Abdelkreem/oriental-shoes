"use client";

import { useState } from "react";
import Link from "next/link";
import { useCustomerList } from "@/features/customers/hooks/customers.hooks";
import { useOperationalScope } from "@/shared/query/operational-scope";
import { getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function AdminCustomersView() {
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const scope = useOperationalScope();
  const query = useCustomerList({ search, page, limit: 25 });
  const filtered = (query.data?.customers ?? []).map((row) => ({
    ...row.customer,
    draftCount: row.draftCount,
  }));
  const totalPages = query.data?.pagination.totalPages;
  const availablePage =
    totalPages === undefined
      ? page
      : totalPages === 0
        ? 1
        : Math.min(page, totalPages);
  if (page !== availablePage) setPage(availablePage);
  const changeSearch = (value: string) => {
    setSearch(value.slice(0, 150));
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / دليل العملاء"
        title="دليل العملاء المسجلين"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {query.data?.pagination.total ?? "—"} عميل
          </span>
        }
        subtitle="عرض بيانات العملاء وسجل أوامر التصنيع المرتبطة بهم"
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={changeSearch}
        searchPlaceholder="ابحث باسم العميل أو رقم الهاتف أو البريد..."
        totalCount={query.data?.totalCustomers}
        filteredCount={query.data?.pagination.total}
        countLabel="عميل"
      />

      {scope === null && <p role="status">البيانات غير متاحة لهذا الحساب.</p>}
      {scope !== null && query.isPending && (
        <p role="status">جارٍ تحميل العملاء...</p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          تعذّر تحميل العملاء. {getApiError(query.error).requestId}
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
      {query.data !== undefined && query.isFetching && (
        <p role="status">جارٍ تحديث العملاء...</p>
      )}
      {scope !== null && query.data !== undefined && (
        <OrientalTable
          data={filtered}
          pagination={{
            page: query.data.pagination.page,
            totalPages: query.data.pagination.totalPages,
            total: query.data.pagination.total,
            onPageChange: setPage,
          }}
          emptyTitle="لا يوجد عملاء"
          keyExtractor={(c) => c.id}
          isSearchEmpty={search !== ""}
          columns={[
            {
              header: "اسم العميل",
              render: (c) => (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {c.name.slice(0, 1)}
                  </div>
                  <div>
                    <strong className="block text-slate-900">{c.name}</strong>
                    <span className="text-xs text-slate-400">
                      {c.email || "بدون بريد"}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              header: "رقم الهاتف",
              render: (c) => (
                <span className="font-mono text-xs" dir="ltr">
                  {c.phone}
                </span>
              ),
            },
            {
              header: "العنوان المسجل",
              accessor: "address",
              className: "text-xs text-slate-600",
            },
            {
              header: "المسودات المرتبطة",
              render: (c) => {
                const count = c.draftCount;
                return (
                  <strong className="text-xs text-teal-700">
                    {count} مسودات
                  </strong>
                );
              },
            },
            {
              header: "الإجراءات",
              className: "text-left",
              render: (c) => (
                <Link
                  href={`/admin/customers/${encodeURIComponent(c.phone)}`}
                  className="btn-pill btn-outline px-3 py-1 text-xs"
                >
                  سجل العميل
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
