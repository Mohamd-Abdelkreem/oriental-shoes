"use client";

import { useState } from "react";
import Link from "next/link";
import { FilePlus2, UserPlus } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function SalesCustomersView() {
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
        eyebrow="المبيعات / دليل العملاء"
        title="دليل عملاء المعارض والمبيعات"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {filtered.length} عميل
          </span>
        }
        subtitle="البحث عن العملاء، إنشاء حساب عميل جديد، وإنشاء أوامر تفصيل مرتبطة مباشرة"
        actions={
          <Link href="/sales/customers/new" className="btn-pill btn-teal">
            <UserPlus size={15} />
            <span>+ إضافة عميل جديد</span>
          </Link>
        }
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث باسم العميل أو رقم الهاتف..."
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
            header: "العميل",
            render: (c) => (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
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
              <span className="font-mono text-xs font-semibold" dir="ltr">
                {c.phone}
              </span>
            ),
          },
          {
            header: "العنوان",
            accessor: "address",
            className: "text-xs text-slate-600",
          },
          {
            header: "عدد الطلبات",
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
              <div className="flex justify-end gap-2">
                <Link
                  href={`/sales/orders/new?customer=${c.phone}`}
                  className="btn-pill btn-teal px-2.5 py-1 text-xs"
                >
                  <FilePlus2 size={12} />
                  <span>إنشاء طلب</span>
                </Link>
                <Link
                  href={`/sales/customers/${c.phone}`}
                  className="btn-pill btn-outline px-2.5 py-1 text-xs"
                >
                  تفاصيل
                </Link>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
