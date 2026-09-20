"use client";

import { useState } from "react";
import Link from "next/link";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";

export function AdminActivityView() {
  const store = useMvpStore();
  const [search, setSearch] = useState("");

  const filtered = store.events.filter(
    (e) =>
      e.event.toLowerCase().includes(search.toLowerCase()) ||
      e.orderId.toLowerCase().includes(search.toLowerCase()) ||
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      (e.note && e.note.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / سجل الرقابة"
        title="سجل النشاط والحركات العام"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {filtered.length} حركة
          </span>
        }
        subtitle="سجل رقابي غير قابل للتعديل يوثق كل إجراء، ومن نفذه، وتاريخه، وأثره على الكميات"
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث بالإجراء، رقم الطلب، الموظف، أو الملاحظة..."
        totalCount={store.events.length}
        filteredCount={filtered.length}
        countLabel="حدث"
      />

      <OrientalTable
        data={filtered.slice().reverse()}
        keyExtractor={(e) => e.id}
        columns={[
          {
            header: "الحدث والإجراء",
            render: (e) => (
              <strong className="text-slate-800">{e.event}</strong>
            ),
          },
          {
            header: "رقم الطلب",
            render: (e) => (
              <Link
                href={`/admin/orders/${e.orderId}`}
                className="font-mono font-bold text-teal-700"
                dir="ltr"
              >
                {e.orderId}
              </Link>
            ),
          },
          {
            header: "الموظف المنفذ",
            render: (e) => (
              <div className="text-xs">
                <strong>{e.actor}</strong>
                <span className="block text-slate-400">{e.role}</span>
              </div>
            ),
          },
          {
            header: "الكمية",
            render: (e) => (
              <span className="text-xs font-bold">
                {e.quantity ? `${String(e.quantity)} قطع` : "—"}
              </span>
            ),
          },
          {
            header: "مسار الحركة (من ← إلى)",
            render: (e) => (
              <span className="text-xs text-slate-600">
                {e.source ? `${e.source} ← ` : ""}
                {e.destination || "—"}
              </span>
            ),
          },
          {
            header: "الملاحظات والسبب",
            render: (e) => (
              <span className="text-xs text-slate-500">{e.note || "—"}</span>
            ),
          },
          {
            header: "التوقيت",
            accessor: "time",
            className: "text-slate-400 text-xs font-mono",
          },
        ]}
      />
    </div>
  );
}
