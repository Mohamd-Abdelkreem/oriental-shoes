"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, RotateCcw, UserCheck } from "lucide-react";
import {
  requiredQuantity,
  typeLabels,
  useMvpStore,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminApprovalsView() {
  const store = useMvpStore();
  const [tab, setTab] = useState<"pending" | "returned" | "approved" | "all">(
    "pending",
  );
  const [search, setSearch] = useState("");

  const pendingOrders = store.orders.filter(
    (o) => o.status === "بانتظار الاعتماد",
  );
  const returnedOrders = store.orders.filter(
    (o) => o.status === "معاد للتعديل",
  );
  const approvedOrders = store.orders.filter(
    (o) =>
      o.status === "قيد التصنيع" ||
      o.status === "معتمد" ||
      o.status === "ملغي جزئياً",
  );

  const filtered = store.orders.filter((o) => {
    if (tab === "pending" && o.status !== "بانتظار الاعتماد") return false;
    if (tab === "returned" && o.status !== "معاد للتعديل") return false;
    if (
      tab === "approved" &&
      ![
        "قيد التصنيع",
        "معتمد",
        "ملغي جزئياً",
        "جاهز للتسليم",
        "تم الاستلام",
      ].includes(o.status)
    )
      return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      o.salesperson.toLowerCase().includes(q) ||
      (o.notes && o.notes.toLowerCase().includes(q))
    );
  });

  const kpis: KpiCardItem[] = [
    {
      title: "بانتظار الاعتماد",
      value: pendingOrders.length,
      subtitle: "أوامر تفصيل جديدة تتطلب المراجعة الفنية",
      icon: Clock,
      tone: pendingOrders.length > 0 ? "amber" : "neutral",
    },
    {
      title: "معادة للتعديل",
      value: returnedOrders.length,
      subtitle: "أوامر أُعيدت لمندوب المبيعات لتصحيح النواقص",
      icon: RotateCcw,
      tone: returnedOrders.length > 0 ? "rose" : "neutral",
    },
    {
      title: "معتمدة قيد التصنيع",
      value: approvedOrders.length,
      subtitle: "أوامر اعتمدت وتعمل أقسام المصنع عليها حالياً",
      icon: CheckCircle2,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / طلبات الاعتماد والتصحيح"
        title="إدارة طلبات الاعتماد والمراجعة"
        subtitle="متابعة مسار التدقيق لأوامر التفصيل الجديدة والمعادة لمندوبي المبيعات وتدقيق الصلاحيات"
        actions={
          <Link href="/approval/pending" className="btn-pill btn-teal">
            <UserCheck size={15} />
            <span>مساحة عمل مسؤول الاعتماد</span>
          </Link>
        }
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setTab("pending");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "pending"
              ? "bg-amber-100 text-amber-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          بانتظار الاعتماد ({pendingOrders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("returned");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "returned"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          معادة للتعديل ({returnedOrders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("approved");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "approved"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          معتمدة قيد التصنيع ({approvedOrders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("all");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "all"
              ? "bg-slate-200 text-slate-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          كل الحالات ({store.orders.length})
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، مندوب المبيعات..."
        totalCount={store.orders.length}
        filteredCount={filtered.length}
        countLabel="طلب"
      />

      <OrientalTable
        data={filtered}
        keyExtractor={(o) => o.id}
        columns={[
          {
            header: "رقم الطلب",
            render: (o) => (
              <div>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="font-mono font-bold text-teal-700 hover:underline"
                  dir="ltr"
                >
                  {o.id}
                </Link>
                <span className="block text-[11px] text-slate-400">
                  {typeLabels[o.type]}
                </span>
              </div>
            ),
          },
          {
            header: "العميل",
            render: (o) => (
              <div>
                <strong className="block text-slate-800">{o.customer}</strong>
                <span className="text-xs text-slate-400" dir="ltr">
                  {o.phone}
                </span>
              </div>
            ),
          },
          { header: "مندوب المبيعات", accessor: "salesperson" },
          {
            header: "الكمية المطلوبة",
            render: (o) => `${String(requiredQuantity(o))} قطع`,
          },
          { header: "موعد التسليم", accessor: "delivery" },
          {
            header: "ملاحظات الاعتماد / الإعادة",
            render: (o) => (
              <span className="block max-w-xs truncate text-xs text-slate-600">
                {o.notes || "—"}
              </span>
            ),
          },
          {
            header: "الحالة",
            render: (o) => (
              <OrientalStatusPill tone={statusTone(o.status)}>
                {o.status}
              </OrientalStatusPill>
            ),
          },
          {
            header: "الإجراءات",
            className: "text-left",
            render: (o) => (
              <div className="flex items-center justify-end gap-1.5">
                {o.status === "بانتظار الاعتماد" && (
                  <Link
                    href={`/approval/orders/${o.id}`}
                    className="btn-pill btn-teal px-2.5 py-1 text-xs"
                  >
                    تدقيق واعتماد
                  </Link>
                )}
                <Link
                  href={`/admin/orders/${o.id}`}
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
