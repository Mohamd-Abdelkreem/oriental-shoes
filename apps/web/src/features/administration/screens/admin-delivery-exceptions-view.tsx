"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, Clock, Truck } from "lucide-react";
import { typeLabels, useMvpStore } from "@/features/prototype/state/mvp-store";
import { isOrderOverdue } from "@/features/prototype/state/workflow";
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

export function AdminDeliveryExceptionsView() {
  const store = useMvpStore();
  const [tab, setTab] = useState<"failed" | "overdue" | "dispatched" | "all">(
    "failed",
  );
  const [search, setSearch] = useState("");

  const failedOrders = store.orders.filter((o) => o.status === "تعذر التسليم");
  const overdueOrders = store.orders.filter(
    (o) =>
      isOrderOverdue(o) &&
      o.status !== "تم الاستلام" &&
      o.status !== "ملغي بالكامل",
  );
  const dispatchedOrders = store.orders.filter(
    (o) => o.status === "خرج مع المندوب",
  );

  const filtered = store.orders.filter((o) => {
    if (tab === "failed" && o.status !== "تعذر التسليم") return false;
    if (
      tab === "overdue" &&
      (!isOrderOverdue(o) ||
        o.status === "تم الاستلام" ||
        o.status === "ملغي بالكامل")
    )
      return false;
    if (tab === "dispatched" && o.status !== "خرج مع المندوب") return false;

    // "all" exceptions include failed, overdue, dispatched, or retry
    if (tab === "all") {
      const isEx =
        o.status === "تعذر التسليم" ||
        o.status === "خرج مع المندوب" ||
        (isOrderOverdue(o) && o.status !== "تم الاستلام");
      if (!isEx) return false;
    }

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      o.phone.includes(q) ||
      (o.deliveryNotes && o.deliveryNotes.toLowerCase().includes(q))
    );
  });

  const kpis: KpiCardItem[] = [
    {
      title: "تعذر التسليم",
      value: failedOrders.length,
      subtitle: "شحنات لم يستلمها العميل وتتطلب إعادة المحاولة",
      icon: AlertTriangle,
      tone: failedOrders.length > 0 ? "rose" : "neutral",
    },
    {
      title: "متأخرة عن الموعد",
      value: overdueOrders.length,
      subtitle: "طلبات تجاوزت تاريخ التسليم التعاقدي",
      icon: Clock,
      tone: overdueOrders.length > 0 ? "amber" : "neutral",
    },
    {
      title: "خرجت مع المندوب",
      value: dispatchedOrders.length,
      subtitle: "شحنات في طريقها للعميل بانتظار تأكيد التسليم",
      icon: Truck,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / إدارة التسليم والشحن"
        title="استثناءات ومشاكل التسليم (Delivery Exceptions)"
        subtitle="متابعة الشحنات المتعثرة، محاولات التوصيل الفاشلة، والتأخيرات المسجلة في المستودع"
        actions={
          <Link href="/warehouse" className="btn-pill btn-teal">
            <Boxes size={15} />
            <span>مساحة عمل المستودع والشحن</span>
          </Link>
        }
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setTab("failed");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "failed"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          تعذر التسليم ({failedOrders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("overdue");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "overdue"
              ? "bg-amber-100 text-amber-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          متأخرة عن الموعد ({overdueOrders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("dispatched");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "dispatched"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          خرجت مع المندوب ({dispatchedOrders.length})
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
          كل الاستثناءات
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، الهاتف، أو الملاحظة..."
        totalCount={store.orders.length}
        filteredCount={filtered.length}
        countLabel="شحنة متعثرة"
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
            header: "العميل ورقم الهاتف",
            render: (o) => (
              <div>
                <strong className="block text-slate-800">{o.customer}</strong>
                <span className="font-mono text-xs text-slate-400" dir="ltr">
                  {o.phone}
                </span>
              </div>
            ),
          },
          {
            header: "موعد التسليم المتفق عليه",
            render: (o) => {
              const overdue = isOrderOverdue(o);
              return (
                <div className="text-xs">
                  <span>{o.delivery}</span>
                  {overdue && (
                    <span className="mt-0.5 block w-max rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                      تجاوز الموعد
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            header: "حالة المستودع والكراتين",
            render: (o) => (
              <div className="text-xs">
                <span>المستودع: {o.warehouse} قطع</span>
                <span className="block text-slate-400">
                  الكراتين: {o.cartonNumbers || "—"}
                </span>
              </div>
            ),
          },
          {
            header: "سبب التعثر وملاحظات المستودع",
            render: (o) => (
              <div className="max-w-xs text-xs">
                {o.failureReason && (
                  <span className="mb-0.5 block font-bold text-rose-700">
                    السبب: {o.failureReason}
                  </span>
                )}
                <span className="text-slate-500">{o.deliveryNotes || "—"}</span>
              </div>
            ),
          },
          {
            header: "الحالة العامة",
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
                <Link
                  href={`/warehouse/orders/${o.id}`}
                  className="btn-pill btn-teal px-2.5 py-1 text-xs"
                >
                  إجراء المستودع
                </Link>
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
