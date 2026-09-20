"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { BarChart3, Eye, Printer } from "lucide-react";
import {
  formatOrderPieceProgress,
  requiredQuantity,
  totalQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { isOrderOverdue } from "@/features/prototype/state/workflow";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminAllOrdersView() {
  const store = useMvpStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [deptFilter, setDeptFilter] = useState("الكل");
  const [flagFilter, setFlagFilter] = useState("الكل");

  const filtered = useMemo(() => {
    return store.orders.filter((order) => {
      const matchSearch =
        order.id.toLowerCase().includes(search.toLowerCase()) ||
        order.customer.toLowerCase().includes(search.toLowerCase()) ||
        order.phone.includes(search) ||
        order.items.some((i) =>
          i.model.toLowerCase().includes(search.toLowerCase()),
        );

      const matchStatus =
        statusFilter === "الكل" || order.status === statusFilter;
      const matchType = typeFilter === "الكل" || order.type === typeFilter;
      const matchDept =
        deptFilter === "الكل" ||
        order.segments.some((s) => s.stage === deptFilter);

      let matchFlag = true;
      if (flagFilter === "متأخرة") matchFlag = isOrderOverdue(order);
      else if (flagFilter === "ملغاة جزئياً") matchFlag = order.cancelled > 0;
      else if (flagFilter === "جاهزة للتسليم")
        matchFlag = order.status === "جاهز للتسليم";
      else if (flagFilter === "مستلمة")
        matchFlag = order.status === "تم الاستلام";

      return matchSearch && matchStatus && matchType && matchDept && matchFlag;
    });
  }, [store.orders, search, statusFilter, typeFilter, deptFilter, flagFilter]);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("الكل");
    setTypeFilter("الكل");
    setDeptFilter("الكل");
    setFlagFilter("الكل");
  };

  const allStatuses = Array.from(new Set(store.orders.map((o) => o.status)));

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / سجل الطلبات"
        title="جميع أوامر التصنيع"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {filtered.length} طلب
          </span>
        }
        subtitle="قاعدة بيانات موحدة لجميع طلبات المعارض، المبيعات الخارجية، والإصلاح عبر المصنع"
        actions={
          <Link href="/admin/reports" className="btn-pill btn-outline">
            <BarChart3 size={15} />
            <span>طباعة تقرير بالنتائج</span>
          </Link>
        }
      />

      {/* Filter Bar */}
      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، أو الموديل..."
        onReset={resetFilters}
        totalCount={store.orders.length}
        filteredCount={filtered.length}
        countLabel="طلب"
      >
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { label: "كل الأنواع", value: "الكل" },
            { label: "طلب معرض", value: "SHOP" },
            { label: "طلب خارجي", value: "EXTERNAL" },
            { label: "طلب إصلاح", value: "REPAIR" },
          ]}
        />

        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={["الكل", ...allStatuses]}
        />

        <FilterSelect
          value={deptFilter}
          onChange={setDeptFilter}
          options={[
            "الكل",
            "القص",
            "الإنتاج والإصلاح",
            "العمليات الخاصة",
            "الجودة والتغليف",
            "المستودع",
          ]}
        />

        <FilterSelect
          value={flagFilter}
          onChange={setFlagFilter}
          options={[
            { label: "كل الحالات الخاصة", value: "الكل" },
            { label: "متأخرة عن الموعد", value: "متأخرة" },
            { label: "ملغاة جزئياً", value: "ملغاة جزئياً" },
            { label: "جاهزة للتسليم", value: "جاهزة للتسليم" },
            { label: "مكتملة ومستلمة", value: "مستلمة" },
          ]}
        />
      </OrientalFilterBar>

      {/* Orders Table */}
      <OrientalTable
        data={filtered}
        keyExtractor={(o) => o.id}
        isSearchEmpty={search !== "" || statusFilter !== "الكل"}
        columns={[
          {
            header: "رقم الطلب",
            render: (order) => (
              <div>
                <strong
                  className="block font-mono font-bold text-teal-700"
                  dir="ltr"
                >
                  {order.id}
                </strong>
                <span className="text-[11px] text-slate-400">
                  {typeLabels[order.type]}
                </span>
              </div>
            ),
          },
          {
            header: "العميل",
            render: (order) => (
              <div>
                <strong className="block text-slate-800">
                  {order.customer}
                </strong>
                <span className="text-xs text-slate-400" dir="ltr">
                  {order.phone}
                </span>
              </div>
            ),
          },
          {
            header: "الكميات (أصلية / ملغاة / مطلوبة)",
            render: (order) => {
              const orig = totalQuantity(order);
              const canc = order.cancelled;
              const req = requiredQuantity(order);
              return (
                <div className="text-xs font-semibold">
                  <span>{orig} أصلية</span>
                  {canc > 0 && (
                    <span className="text-rose-600"> · {canc} ملغاة</span>
                  )}
                  <strong className="mt-0.5 block text-teal-700">
                    {req} مطلوبة
                  </strong>
                </div>
              );
            },
          },
          {
            header: "حالة إنجاز القطع",
            render: (order) => {
              const req = requiredQuantity(order);
              return (
                <div className="space-y-1 text-xs">
                  <strong className="block text-slate-800">
                    {order.warehouse} من {req} بالمستودع
                  </strong>
                  <span className="block rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                    {formatOrderPieceProgress(order)}
                  </span>
                </div>
              );
            },
          },
          {
            header: "مكان القطعة الآن",
            render: (order) => {
              const activePieces = order.items.filter((p) => !p.isDeleted);
              if (activePieces.length === 0) {
                return <span className="text-xs text-slate-400">—</span>;
              }

              // Count by location
              const locCounts: Record<string, number> = {};
              activePieces.forEach((p) => {
                const loc = p.currentLocation || "في القص";
                locCounts[loc] = (locCounts[loc] || 0) + 1;
              });

              return (
                <div className="flex max-w-[200px] flex-wrap gap-1">
                  {Object.entries(locCounts).map(([loc, cnt]) => (
                    <span
                      key={loc}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                        loc === "لدى الاعتماد بسبب مشكلة"
                          ? "border-rose-300 bg-rose-50 font-bold text-rose-800"
                          : loc === "في المستودع" || loc === "تم التسليم"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-teal-200 bg-teal-50 text-teal-800"
                      }`}
                    >
                      {loc} ({cnt} {cnt === 1 ? "قطعة" : "قطع"})
                    </span>
                  ))}
                </div>
              );
            },
          },
          {
            header: "تاريخ التسليم",
            render: (order) => {
              const overdue = isOrderOverdue(order);
              return (
                <div className="text-xs">
                  <span>{order.delivery}</span>
                  {overdue && (
                    <span className="mt-0.5 block w-max rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                      متأخر
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            header: "الحالة",
            render: (order) => (
              <OrientalStatusPill tone={statusTone(order.status)}>
                {order.status}
              </OrientalStatusPill>
            ),
          },
          {
            header: "الإجراءات",
            className: "text-left",
            render: (order) => (
              <div className="flex items-center justify-end gap-1.5">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="btn-pill btn-outline px-2.5 py-1 text-xs"
                >
                  <Eye size={13} />
                  <span>تفاصيل</span>
                </Link>
                <Link
                  href={`/print/order/${order.id}`}
                  className="btn-pill btn-ghost p-1.5 text-xs text-slate-500"
                  title="طباعة أمر التفصيل"
                >
                  <Printer size={14} />
                </Link>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
