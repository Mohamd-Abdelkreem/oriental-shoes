"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileText,
  RotateCcw,
} from "lucide-react";
import {
  totalQuantity,
  typeLabels,
  useMvpStore,
  formatOrderCount,
  formatProductCount,
  type ProductLine,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  OrientalKpiGrid,
  type KpiCardItem,
} from "@/features/prototype/components/kpi-cards";
import { OrientalTable } from "@/features/prototype/components/data-table";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";

export function ApprovalDashboardView() {
  const store = useMvpStore();

  const pending = store.orders.filter((o) => o.status === "بانتظار الاعتماد");
  const approvedToday = store.events.filter(
    (e) => e.role === "الاعتماد" && e.event.includes("اعتماد"),
  );
  const returnedToday = store.events.filter(
    (e) => e.role === "الاعتماد" && e.event.includes("إعادة"),
  );

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

  const kpis: KpiCardItem[] = [
    {
      title: "بانتظار المراجعة والاعتماد",
      value: pending.length,
      unit: "أمر تفصيل",
      subtitle: `إجمالي ${formatProductCount(pending.reduce((s, o) => s + totalQuantity(o), 0))} معلقة`,
      icon: Clock,
      tone: pending.length > 0 ? "amber" : "neutral",
      href: "/approval/pending",
    },
    {
      title: "مشكلات تصنيع محالة",
      value: problemPiecesList.length,
      unit: "قطعة",
      subtitle: "قطع تتطلب قرار حل أو إحالة أو شطب",
      icon: AlertTriangle,
      tone: problemPiecesList.length > 0 ? "rose" : "neutral",
      href: "/approval/pending?tab=problems",
    },
    {
      title: "اعتمدت ودخلت المصنع اليوم",
      value: approvedToday.length,
      unit: "أمر تفصيل",
      subtitle: "بدأت مسار القص أو الإنتاج فوراً",
      icon: CheckCircle2,
      tone: "emerald",
      href: "/approval/history",
    },
    {
      title: "معادة للمبيعات للتصحيح",
      value: returnedToday.length,
      unit: "أمر تفصيل",
      subtitle: "مع سبب إلزامي وملاحظات فنية",
      icon: RotateCcw,
      tone: "rose",
      href: "/approval/history",
    },
  ];

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow="اعتماد أوامر التفصيل / لوحة التحكم"
        title="لوحة تدقيق واعتماد الطلبات"
        subtitle="مراجعة مواصفات أمر التفصيل الرسمية، اعتماد الدخول للمصنع أو الإعادة للمبيعات مع سبب توثيقي"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/approval/pending" className="btn-pill btn-teal">
              <ClipboardCheck size={16} />
              <span>
                فتح قائمة انتظار الاعتماد ({formatOrderCount(pending.length)})
              </span>
            </Link>
          </div>
        }
      />

      <OrientalKpiGrid cards={kpis} columns={4} />

      {/* MANUFACTURING PROBLEM QUEUE (Requirement 6) */}
      {problemPiecesList.length > 0 && (
        <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-200/80 pb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-rose-600" size={18} />
              <strong className="text-sm font-bold text-rose-900">
                مشكلات تصنيع محالة للاعتماد تتطلب قراراً فاصلاً (
                {problemPiecesList.length} قطع)
              </strong>
            </div>
            <span className="rounded-full bg-rose-200 px-2 py-0.5 text-xs font-bold text-rose-900">
              معالجة القطعة المتأثرة فقط
            </span>
          </div>

          <p className="text-xs text-rose-800">
            أحيلت هذه القطع بسبب عوائق تصنيعية ظهرت بعد اعتماد الطلب. تبقى بقية
            قطع الطلب في مسارها الطبيعي داخل خطوط الإنتاج دون توقف.
          </p>

          <div className="space-y-2">
            {problemPiecesList.map(({ order, piece }) => {
              const otherPieces = order.items.filter(
                (p) => p.id !== piece.id && !p.isDeleted,
              );
              return (
                <div
                  key={`${order.id}-${piece.id}`}
                  className="space-y-2 rounded-lg border border-rose-200 bg-white p-3.5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/approval/orders/${order.id}`}
                        className="font-mono text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline"
                        title="عرض تفاصيل وتتبع أمر التفصيل"
                        dir="ltr"
                      >
                        {order.id}
                      </Link>
                      <span className="text-xs font-bold text-slate-800">
                        · {piece.pieceNumber || "القطعة"} ({piece.model})
                      </span>
                      <span className="text-xs text-slate-500">
                        · العميل: {order.customer}
                      </span>
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                        محالة من {piece.problem?.reportedByDept || "المصنع"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/approval/orders/${order.id}`}
                        className="btn-pill btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs font-bold"
                        title="عرض تفاصيل وتتبع أمر التفصيل في قسم الاعتماد"
                      >
                        <FileText size={13} />
                        <span>عرض أمر التفصيل</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveProblemItem({ order, piece });
                        }}
                        className="btn-pill btn-teal px-3.5 py-1.5 text-xs font-bold"
                      >
                        اتخاذ قرار الاعتماد (أ، ب، ج)
                      </button>
                    </div>
                  </div>

                  <div className="rounded border border-rose-100 bg-rose-50/70 p-2.5 text-xs">
                    <span className="font-bold text-rose-900">
                      سبب المشكلة المسجل:{" "}
                    </span>
                    <span className="text-rose-800">
                      {piece.problem?.reason} — {piece.problem?.notes}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <CheckCircle2
                      size={12}
                      className="shrink-0 text-emerald-600"
                    />
                    <span>
                      بقية قطع الطلب مستمرة في التصنيع:{" "}
                      {otherPieces
                        .map(
                          (p) =>
                            `${p.pieceNumber || "قطعة"}: ${p.currentLocation || "في المصنع"}`,
                        )
                        .join(" · ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Queue Card */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              أوامر التفصيل المعلقة بانتظار قرارك
            </h2>
            <p className="text-xs text-slate-500">
              يتطلب كل طلب قراراً إما بالاعتماد ونقله للإنتاج أو الإعادة
              للمبيعات
            </p>
          </div>
          <Link
            href="/approval/pending"
            className="text-xs text-teal-600 hover:underline"
          >
            عرض القائمة الكاملة
          </Link>
        </div>

        <OrientalTable
          data={pending}
          keyExtractor={(o) => o.id}
          emptyTitle="لا توجد طلبات معلقة للاعتماد"
          emptySubtitle="جميع الطلبات التي أرسلتها المبيعات تمت مراجعتها واعتمادها."
          columns={[
            {
              header: "رقم الطلب",
              render: (o) => (
                <Link
                  href={`/approval/orders/${o.id}`}
                  className="font-mono font-bold text-teal-700 hover:text-teal-900 hover:underline"
                  dir="ltr"
                  title="عرض تفاصيل وتتبع أمر التفصيل"
                >
                  {o.id}
                </Link>
              ),
            },
            { header: "العميل", accessor: "customer" },
            { header: "نوع الطلب", render: (o) => typeLabels[o.type] },
            { header: "مندوب المبيعات", accessor: "salesperson" },
            {
              header: "الكمية",
              render: (o) => `${String(totalQuantity(o))} قطع`,
            },
            { header: "موعد التسليم", accessor: "delivery" },
            {
              header: "المراجعة والقرار",
              className: "text-left",
              render: (o) => (
                <Link
                  href={`/approval/orders/${o.id}`}
                  className="btn-pill btn-teal px-3 py-1 text-xs"
                >
                  <Eye size={13} />
                  <span>مراجعة وتتبع الطلب</span>
                </Link>
              ),
            },
          ]}
        />
      </div>

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
