"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Edit, Eye, FilePlus2 } from "lucide-react";
import {
  requiredQuantity,
  typeLabels,
  useMvpStore,
  formatOrderPieceProgress,
} from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
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

export function SalesAllOrdersView() {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "الكل",
  );
  const [typeFilter, setTypeFilter] = useState("الكل");

  const salesOrders = store.orders.filter(
    (o) => o.salesperson === "ريم خالد" || o.salesperson === "ليان سعد",
  );

  const filtered = useMemo(() => {
    return salesOrders.filter((order) => {
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

      return matchSearch && matchStatus && matchType;
    });
  }, [salesOrders, search, statusFilter, typeFilter]);

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات والمعارض / كل الطلبات"
        title="جميع طلبات قسم المبيعات"
        badge={
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {filtered.length} طلب
          </span>
        }
        subtitle="متابعة جميع الطلبات المنشأة من مساحة عمل المبيعات، ومراقبة مسارها داخل المصنع"
        actions={
          <Link href="/sales/orders/new" className="btn-pill btn-teal">
            <FilePlus2 size={16} />
            <span>+ إنشاء أمر تفصيل</span>
          </Link>
        }
      />

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، الموديل..."
        onReset={() => {
          setSearch("");
          setStatusFilter("الكل");
          setTypeFilter("الكل");
        }}
        totalCount={salesOrders.length}
        filteredCount={filtered.length}
        countLabel="طلب"
      >
        <FilterSelect
          label="حالة الطلب"
          value={statusFilter}
          onChange={setStatusFilter}
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
        <FilterSelect
          label="نوع الطلب"
          value={typeFilter}
          onChange={setTypeFilter}
          options={["الكل", "SHOP", "EXTERNAL", "REPAIR"]}
        />
      </OrientalFilterBar>

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
            header: "الكمية المطلوبة",
            render: (order) => (
              <span className="text-xs font-bold">
                {requiredQuantity(order)} قطع
              </span>
            ),
          },
          {
            header: "إنجاز قطع الطلب",
            render: (order) => {
              const req = requiredQuantity(order);
              const progressText = formatOrderPieceProgress(order);
              return (
                <div className="space-y-0.5 text-xs">
                  <span className="block font-bold text-slate-800">
                    {progressText}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {order.warehouse > 0
                      ? `${String(order.warehouse)} من ${String(req)} بالمستودع`
                      : "داخل خطوط المصنع"}
                  </span>
                </div>
              );
            },
          },
          {
            header: "مكان القطعة الآن",
            render: (order) => {
              const activePieces = order.items.filter((p) => !p.isDeleted);
              if (activePieces.length === 0)
                return <span className="text-xs text-slate-400">—</span>;
              return (
                <div className="flex max-w-xs flex-wrap gap-1">
                  {activePieces.map((p, idx) => {
                    const loc = p.currentLocation || "في انتظار البدء";
                    const isProb = loc === "لدى الاعتماد بسبب مشكلة";
                    return (
                      <span
                        key={p.id}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                          isProb
                            ? "border-rose-200 bg-rose-50 font-bold text-rose-800"
                            : loc === "في المستودع" || loc === "تم التسليم"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                        title={`${p.pieceNumber || formatPieceSequence(idx)}: ${loc}`}
                      >
                        {p.pieceNumber || formatPieceSequence(idx)}:{" "}
                        <b>{loc}</b>
                      </span>
                    );
                  })}
                </div>
              );
            },
          },
          {
            header: "تاريخ التسليم",
            accessor: "delivery",
            className: "text-xs text-slate-600",
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
            header: "الإجراء المتاح",
            className: "text-left",
            render: (order) => {
              const canEdit =
                order.status === "مسودة" || order.status === "معاد للتعديل";
              return (
                <div className="flex items-center justify-end gap-1.5">
                  {canEdit ? (
                    <Link
                      href={`/sales/orders/new?edit=${order.id}`}
                      className="btn-pill btn-teal px-2.5 py-1 text-xs"
                    >
                      <Edit size={12} />
                      <span>تعديل</span>
                    </Link>
                  ) : (
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="btn-pill btn-outline px-2.5 py-1 text-xs"
                    >
                      <Eye size={12} />
                      <span>تتبع</span>
                    </Link>
                  )}
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}
