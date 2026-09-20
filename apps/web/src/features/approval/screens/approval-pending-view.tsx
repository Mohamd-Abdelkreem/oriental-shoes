"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import {
  totalQuantity,
  typeLabels,
  useMvpStore,
  type ProductLine,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  FilterSelect,
  OrientalFilterBar,
} from "@/features/prototype/components/filter-bar";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";

export function ApprovalPendingView() {
  const store = useMvpStore();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [activeTab, setActiveTab] = useState<"orders" | "problems">(
    searchParams.get("tab") === "problems" ? "problems" : "orders",
  );

  const pending = store.orders.filter((o) => o.status === "بانتظار الاعتماد");
  const problemPiecesList = useMemo(() => {
    const list: { order: MvpOrder; piece: ProductLine }[] = [];
    store.orders.forEach((order) => {
      order.items.forEach((piece) => {
        if (
          !piece.isDeleted &&
          piece.currentLocation === "لدى الاعتماد بسبب مشكلة"
        ) {
          list.push({ order, piece });
        }
      });
    });
    return list;
  }, [store.orders]);

  const [activeProblemItem, setActiveProblemItem] = useState<{
    order: MvpOrder;
    piece: ProductLine;
  } | null>(null);

  const filteredOrders = pending.filter((o) => {
    const matchSearch =
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.toLowerCase().includes(search.toLowerCase()) ||
      o.phone.includes(search);
    const matchType = typeFilter === "الكل" || o.type === typeFilter;
    return matchSearch && matchType;
  });

  const filteredProblems = problemPiecesList.filter(({ order, piece }) => {
    return (
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.customer.toLowerCase().includes(search.toLowerCase()) ||
      piece.model.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-5">
      <OrientalPageHeader
        eyebrow="الاعتماد / طابور الانتظار"
        title="طلبات ومشكلات بانتظار قرار الاعتماد"
        badge={
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            {pending.length} أوامر معلقة · {problemPiecesList.length} مشكلات
            محالة
          </span>
        }
        subtitle="تدقيق أوامر التفصيل الجديدة، واتخاذ قرارات معالجة مشكلات التصنيع المحالة للقطع الفردية"
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab("orders");
          }}
          className={`btn-pill text-xs font-bold ${
            activeTab === "orders" ? "btn-teal" : "btn-outline"
          }`}
        >
          <span>أوامر بانتظار الاعتماد المبدئي ({pending.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("problems");
          }}
          className={`btn-pill flex items-center gap-1.5 text-xs font-bold ${
            activeTab === "problems" ? "btn-rose" : "btn-outline text-rose-700"
          }`}
        >
          <AlertTriangle size={13} />
          <span>
            مشكلات تصنيع محالة تتطلب قرارًا ({problemPiecesList.length})
          </span>
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، أو الهاتف..."
        totalCount={
          activeTab === "orders" ? pending.length : problemPiecesList.length
        }
        filteredCount={
          activeTab === "orders"
            ? filteredOrders.length
            : filteredProblems.length
        }
        countLabel={activeTab === "orders" ? "طلب" : "قطعة"}
      >
        {activeTab === "orders" && (
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { label: "كل الأنواع", value: "الكل" },
              { label: "معرض", value: "SHOP" },
              { label: "خارجي", value: "EXTERNAL" },
              { label: "إصلاح", value: "REPAIR" },
            ]}
          />
        )}
      </OrientalFilterBar>

      {activeTab === "orders" ? (
        <OrientalTable
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          emptyTitle="لا توجد طلبات معلقة"
          emptySubtitle="طابور الاعتماد فارغ حالياً."
          columns={[
            {
              header: "رقم الطلب",
              render: (o) => (
                <strong className="font-mono font-bold text-teal-700" dir="ltr">
                  {o.id}
                </strong>
              ),
            },
            { header: "العميل", accessor: "customer" },
            { header: "النوع", render: (o) => typeLabels[o.type] },
            { header: "مندوب المبيعات", accessor: "salesperson" },
            { header: "تاريخ التقديم", accessor: "created" },
            { header: "موعد التسليم المتوقع", accessor: "delivery" },
            {
              header: "الكمية",
              render: (o) => `${String(totalQuantity(o))} قطع`,
            },
            {
              header: "الإجراء",
              className: "text-left",
              render: (o) => (
                <Link
                  href={`/approval/orders/${o.id}`}
                  className="btn-pill btn-teal px-3 py-1 text-xs"
                >
                  <ClipboardCheck size={14} />
                  <span>فتح للمراجعة والقرار</span>
                </Link>
              ),
            },
          ]}
        />
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {filteredProblems.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              لا توجد مشكلات تصنيع محالة بانتظار الاعتماد حالياً.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredProblems.map(({ order, piece }) => {
                const otherPieces = order.items.filter(
                  (p) => p.id !== piece.id && !p.isDeleted,
                );
                return (
                  <div
                    key={`${order.id}-${piece.id}`}
                    className="space-y-2.5 rounded-xl border border-rose-200 bg-rose-50/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-xs font-bold text-slate-900"
                          dir="ltr"
                        >
                          {order.id}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          · {piece.pieceNumber || "القطعة"} ({piece.model})
                        </span>
                        <span className="text-xs text-slate-500">
                          · العميل: {order.customer}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProblemItem({ order, piece });
                        }}
                        className="btn-pill btn-teal px-4 py-1.5 text-xs font-bold"
                      >
                        اتخاذ القرار (أ، ب، ج)
                      </button>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 font-bold text-rose-900">
                        <AlertTriangle size={13} className="text-rose-600" />
                        <span>
                          المشكلة المسجلة من{" "}
                          {piece.problem?.reportedByDept || "المصنع"} (
                          {piece.problem?.reportedByWorker}):{" "}
                          {piece.problem?.reason}
                        </span>
                      </div>
                      <p className="text-slate-700">{piece.problem?.notes}</p>
                    </div>

                    <div className="flex items-center gap-1.5 rounded border border-slate-100 bg-white p-2 text-[11px] text-slate-500">
                      <CheckCircle2
                        size={12}
                        className="shrink-0 text-emerald-600"
                      />
                      <span>
                        حالة بقية قطع هذا الطلب:{" "}
                        {otherPieces
                          .map(
                            (p) =>
                              `${p.pieceNumber || "قطعة"}: ${p.currentLocation || "في المصنع"}`,
                          )
                          .join(" · ")}{" "}
                        (مستمرة في العمل دون توقف)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeProblemItem && (
        <ApprovalProblemResolutionModal
          order={activeProblemItem.order}
          piece={activeProblemItem.piece}
          onClose={() => {
            setActiveProblemItem(null);
          }}
        />
      )}
    </div>
  );
}
