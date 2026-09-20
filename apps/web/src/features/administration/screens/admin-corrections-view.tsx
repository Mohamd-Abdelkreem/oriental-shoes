"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Boxes, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalFilterBar } from "@/features/prototype/components/filter-bar";
import {
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";

export function AdminCorrectionsView() {
  const store = useMvpStore();
  const [tab, setTab] = useState<"active" | "resolved" | "all">("active");
  const [search, setSearch] = useState("");

  // Aggregate corrections
  interface CorrectionRow {
    id: string;
    orderId: string;
    customer: string;
    stage: string;
    quantity: number;
    reason: string;
    cycle: number;
    resolved: boolean;
    date: string;
  }

  const corrections: CorrectionRow[] = useMemo(() => {
    const list: CorrectionRow[] = [];
    store.orders.forEach((o) => {
      if (o.corrections && o.corrections.length > 0) {
        o.corrections.forEach((c) => {
          list.push({
            id: c.id,
            orderId: o.id,
            customer: o.customer,
            stage: c.responsible,
            quantity: c.quantity,
            reason: c.reason,
            cycle: c.cycle,
            resolved: Boolean(c.resolved),
            date: c.date || o.created,
          });
        });
      }
      // Also check segments that carry a cycle count
      o.segments.forEach((seg) => {
        if (seg.cycle && seg.cycle > 0) {
          const already = list.some(
            (c) =>
              c.orderId === o.id &&
              c.cycle === seg.cycle &&
              c.stage === seg.stage,
          );
          if (!already) {
            list.push({
              id: `${seg.id}-corr`,
              orderId: o.id,
              customer: o.customer,
              stage: seg.stage,
              quantity: seg.quantity,
              reason: seg.note || "إعادة تصحيح جودة",
              cycle: seg.cycle,
              resolved:
                seg.state === "جاهز للإرسال" || seg.stage === "المستودع",
              date: "2026-09-08",
            });
          }
        }
      });
    });
    return list;
  }, [store.orders]);

  const activeCorrections = corrections.filter((c) => !c.resolved);
  const resolvedCorrections = corrections.filter((c) => c.resolved);
  const totalPiecesInCorrection = activeCorrections.reduce(
    (sum, c) => sum + c.quantity,
    0,
  );

  const filtered = corrections.filter((c) => {
    if (tab === "active" && c.resolved) return false;
    if (tab === "resolved" && !c.resolved) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.orderId.toLowerCase().includes(q) ||
      c.customer.toLowerCase().includes(q) ||
      c.stage.toLowerCase().includes(q) ||
      c.reason.toLowerCase().includes(q)
    );
  });

  const kpis: KpiCardItem[] = [
    {
      title: "دورات تصحيح نشطة",
      value: activeCorrections.length,
      subtitle: "حصص معادة تتطلب المعالجة وإعادة الفحص",
      icon: RotateCcw,
      tone: activeCorrections.length > 0 ? "rose" : "neutral",
    },
    {
      title: "إجمالي القطع قيد التصحيح",
      value: `${String(totalPiecesInCorrection)} قطعة`,
      subtitle: "تتحرك داخل خطوط المصنع لتعديل العيوب",
      icon: Boxes,
      tone: "amber",
    },
    {
      title: "دورات مكتملة ومعتمدة",
      value: resolvedCorrections.length,
      subtitle: "حصص صُححت واجتازت فحص الجودة بنجاح",
      icon: CheckCircle2,
      tone: "teal",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="الإدارة العامة / رقابة الجودة"
        title="سجل دورات التصحيح وإعادة العمل (Quality Corrections)"
        subtitle="حصر وتتبع جميع الحصص التي أعادتها إدارة الجودة للمصنع، وعدد دورات التصحيح، ومسار المعالجة"
        actions={
          <Link href="/quality" className="btn-pill btn-teal">
            <ShieldCheck size={15} />
            <span>مساحة عمل مراقبة الجودة</span>
          </Link>
        }
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setTab("active");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "active"
              ? "bg-rose-100 text-rose-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          قيد المعالجة بالمصنع ({activeCorrections.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("resolved");
          }}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            tab === "resolved"
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          تمت معالجتها واعتمادها ({resolvedCorrections.length})
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
          الكل ({corrections.length})
        </button>
      </div>

      <OrientalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث برقم الطلب، العميل، القسم، أو سبب العيب..."
        totalCount={corrections.length}
        filteredCount={filtered.length}
        countLabel="حالة تصحيح"
      />

      <OrientalTable
        data={filtered}
        keyExtractor={(c) => c.id}
        columns={[
          {
            header: "رقم الطلب والعميل",
            render: (c) => (
              <div>
                <Link
                  href={`/admin/orders/${c.orderId}`}
                  className="block font-mono font-bold text-teal-700 hover:underline"
                  dir="ltr"
                >
                  {c.orderId}
                </Link>
                <span className="text-xs font-semibold text-slate-700">
                  {c.customer}
                </span>
              </div>
            ),
          },
          {
            header: "القسم المرجع إليه",
            render: (c) => (
              <strong className="text-xs text-slate-800">{c.stage}</strong>
            ),
          },
          {
            header: "الكمية المعادة",
            render: (c) => (
              <span className="text-xs font-bold text-rose-700">
                {c.quantity} قطع
              </span>
            ),
          },
          {
            header: "رقم دورة التصحيح",
            render: (c) => (
              <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                دورة #{c.cycle}
              </span>
            ),
          },
          {
            header: "سبب العيب وتوجيه الجودة",
            render: (c) => (
              <span className="block max-w-sm text-xs text-slate-600">
                {c.reason}
              </span>
            ),
          },
          {
            header: "التاريخ",
            accessor: "date",
            className: "text-xs text-slate-400 font-mono",
          },
          {
            header: "حالة المعالجة",
            render: (c) => (
              <OrientalStatusPill tone={c.resolved ? "emerald" : "rose"}>
                {c.resolved ? "تمت المعالجة والاعتماد" : "قيد المعالجة بالمصنع"}
              </OrientalStatusPill>
            ),
          },
          {
            header: "الإجراء",
            className: "text-left",
            render: (c) => (
              <Link
                href={`/admin/orders/${c.orderId}`}
                className="btn-pill btn-outline px-2.5 py-1 text-xs"
              >
                تتبع الطلب
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
