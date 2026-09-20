"use client";

import { useState } from "react";
import Link from "next/link";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function AdminCustomersView() {
  const store = useMvpStore();
  const [search, setSearch] = useState("");

  const filtered = store.customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / دليل العملاء"
        title="دليل العملاء المسجلين"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {filtered.length} عميل
          </span>
        }
        subtitle="عرض بيانات العملاء وسجل أوامر التصنيع المرتبطة بهم"
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث باسم العميل أو رقم الهاتف أو البريد..."
        totalCount={store.customers.length}
        filteredCount={filtered.length}
        countLabel="عميل"
      />

      <OrientalTable
        data={filtered}
        keyExtractor={(c) => c.phone}
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
            header: "الطلبات المرتبطة",
            render: (c) => {
              const count = store.orders.filter(
                (o) => o.phone === c.phone,
              ).length;
              return (
                <strong className="text-xs text-teal-700">{count} أوامر</strong>
              );
            },
          },
          {
            header: "الإجراءات",
            className: "text-left",
            render: (c) => (
              <Link
                href={`/admin/customers/${c.phone}`}
                className="btn-pill btn-outline px-3 py-1 text-xs"
              >
                سجل العميل
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
