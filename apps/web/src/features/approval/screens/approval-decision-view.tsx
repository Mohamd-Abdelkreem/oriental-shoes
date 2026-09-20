"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Printer,
  RotateCcw,
} from "lucide-react";
import {
  typeLabels,
  useMvpStore,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import {
  statusTone,
  OrientalStatusPill,
  OrientalTable,
} from "@/features/prototype/components/data-table";
import { OrderPaperForm } from "@/features/orders/components/order-paper-form";
import { OrderDetailTabs } from "@/features/orders/components/order-detail-tabs";
import { OrderFullTrackingView } from "@/features/prototype/components/order-tracking-view";
import { ApprovalProblemResolutionModal } from "./approval-problem-resolution-modal";
import { ApprovalReturnModal } from "./approval-return-modal";

export function ApprovalDecisionView({ orderId }: { orderId: string }) {
  const store = useMvpStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get("tab");

  const order = store.orders.find((o) => o.id === orderId) ?? notFound();

  const isAlreadyApproved =
    order.status !== "بانتظار الاعتماد" && order.status !== "مسودة";

  const [activeTab, setActiveTab] = useState<"tracking" | "form" | "history">(
    paramTab === "tracking" || paramTab === "form" || paramTab === "history"
      ? paramTab
      : isAlreadyApproved
        ? "tracking"
        : "form",
  );

  const [returnModal, setReturnModal] = useState(false);
  const [problemPieceToResolve, setProblemPieceToResolve] =
    useState<ProductLine | null>(null);

  const activePiecesCount = order.items.filter((p) => !p.isDeleted).length;
  const eventsCount = store.events.filter((e) => e.orderId === order.id).length;
  const problemPieces = order.items.filter(
    (p) => !p.isDeleted && p.currentLocation === "لدى الاعتماد بسبب مشكلة",
  );

  const handleApprove = () => {
    store.approveOrder(order.id, "خالد منصور");
    router.push("/approval/pending");
  };

  return (
    <div className="space-y-6">
      <OrientalPageHeader
        eyebrow={`اعتماد الطلبات / تفاصيل أمر التفصيل / ${order.id}`}
        title={`أمر تفصيل ${typeLabels[order.type]} — ${order.customer}`}
        badge={
          <OrientalStatusPill tone={statusTone(order.status)}>
            {order.status}
          </OrientalStatusPill>
        }
        subtitle={`مندوب المبيعات: ${order.salesperson} · موعد التسليم: ${order.delivery} · هاتف العميل: ${order.phone}`}
        actions={
          <div className="flex items-center gap-2">
            {!isAlreadyApproved ? (
              <>
                <button
                  type="button"
                  className="btn-pill btn-rose"
                  onClick={() => {
                    setReturnModal(true);
                  }}
                >
                  <RotateCcw size={15} />
                  <span>إعادة إلى المبيعات للتعديل</span>
                </button>
                <button
                  type="button"
                  className="btn-pill btn-teal"
                  onClick={handleApprove}
                >
                  <CheckCircle2 size={15} />
                  <span>اعتماد أمر التفصيل وتوجيهه للمصنع</span>
                </button>
              </>
            ) : (
              <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                ✓ تم اعتماد هذا الطلب ودخل خطوط التصنيع
              </span>
            )}
            <Link
              href={`/print/order/${order.id}`}
              className="btn-pill btn-secondary"
              target="_blank"
            >
              <Printer size={15} />
              <span>معاينة الطباعة</span>
            </Link>
            <Link href="/approval/pending" className="btn-pill btn-secondary">
              <ArrowRight size={15} />
              <span>العودة لقائمة الاعتماد</span>
            </Link>
          </div>
        }
      />

      {/* Problem pieces alert banner if any pieces in this order need approval decision */}
      {problemPieces.length > 0 && (
        <div className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-rose-600" size={18} />
              <strong className="text-sm font-bold text-rose-900">
                مشكلات تصنيع محالة تتطلب قرار الاعتماد الفوري في هذا الطلب (
                {problemPieces.length} قطع)
              </strong>
            </div>
            <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900">
              بقية قطع الطلب مستمرة في التصنيع
            </span>
          </div>

          <div className="space-y-2">
            {problemPieces.map((piece) => (
              <div
                key={piece.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white p-3 text-xs shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">
                    {piece.pieceNumber || "القطعة"} ({piece.model} · مقاس{" "}
                    {piece.size})
                  </span>
                  <span className="mr-2 text-slate-600">
                    — محالة من:{" "}
                    <b>{piece.problem?.reportedByDept || "المصنع"}</b> · السبب:{" "}
                    <b className="text-rose-700">{piece.problem?.reason}</b>
                    {piece.problem?.notes ? ` (${piece.problem.notes})` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-pill btn-teal px-4 py-1.5 text-xs font-bold"
                  onClick={() => {
                    setProblemPieceToResolve(piece);
                  }}
                >
                  اتخاذ قرار معالجة المشكلة (أ، ب، ج)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <OrderDetailTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activePiecesCount={activePiecesCount}
        eventsCount={eventsCount}
      />

      {/* Tab Content */}
      <div className="pt-1">
        {/* TAB 1: Tracking View */}
        {activeTab === "tracking" && <OrderFullTrackingView order={order} />}

        {/* TAB 2: Paper Form & Decision Bar */}
        {activeTab === "form" && (
          <div className="space-y-5">
            {!isAlreadyApproved && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                <strong>توجيه تدقيق الاعتماد:</strong>
                <p>
                  المراجعة تتم على نفس النموذج الورقي المرجعي بالضبط. عند الضغط
                  على &quot;اعتماد أمر التفصيل وتوجيهه للمصنع&quot;،
                  {order.type === "REPAIR"
                    ? " ينتقل طلب الإصلاح مباشرة إلى قسم الإنتاج والإصلاح (متجاوزاً القص)."
                    : " ينتقل أمر التفصيل إلى قسم القص ليبدأ خط التصنيع."}{" "}
                  يقفل خيار التعديل لدى المبيعات فور الاعتماد.
                </p>
              </div>
            )}

            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-sm font-bold text-slate-800">
                  بيانات النموذج الورقي المقدمة للاعتماد
                </h2>
                <Link
                  href={`/print/order/${order.id}`}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:underline"
                  target="_blank"
                >
                  <Printer size={13} />
                  <span>معاينة الطباعة</span>
                </Link>
              </div>

              <OrderPaperForm order={order} mode="approval" />
            </div>

            {!isAlreadyApproved && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <strong className="block text-sm font-bold text-slate-900">
                    قرار الاعتماد النهائي لهذا الطلب:
                  </strong>
                  <span className="text-xs text-slate-500">
                    اختر أحد القرارين أدناه لتوثيق الإجراء في سجل النظام
                  </span>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-pill btn-rose"
                    onClick={() => {
                      setReturnModal(true);
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>إعادة للمبيعات مع سبب</span>
                  </button>
                  <button
                    type="button"
                    className="btn-pill btn-teal px-5"
                    onClick={handleApprove}
                  >
                    <CheckCircle2 size={16} />
                    <span>اعتماد أمر التفصيل</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Activity Timeline */}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OrientalTable
              data={store.events
                .filter((e) => e.orderId === order.id)
                .slice()
                .reverse()}
              keyExtractor={(e) => e.id}
              emptyTitle="لا توجد حركات مسجلة"
              emptySubtitle="لم تسجل أي أحداث تشغيلية لهذا الطلب بعد."
              columns={[
                {
                  header: "الحدث",
                  render: (e) => (
                    <strong className="text-slate-800">{e.event}</strong>
                  ),
                },
                {
                  header: "المنفذ",
                  render: (e) => `${e.actor} (${e.role})`,
                },
                {
                  header: "الوجهة",
                  render: (e) => e.destination || "—",
                },
                {
                  header: "التفاصيل والملاحظات",
                  render: (e) => e.note || "—",
                },
                {
                  header: "التوقيت",
                  accessor: "time",
                  className: "text-slate-400 font-mono text-xs",
                },
              ]}
            />
          </div>
        )}
      </div>

      {returnModal && (
        <ApprovalReturnModal
          orderId={order.id}
          onClose={() => {
            setReturnModal(false);
          }}
          onReturned={() => {
            setReturnModal(false);
            router.push("/approval/pending");
          }}
        />
      )}

      {/* Problem Resolution Modal in place */}
      {problemPieceToResolve && (
        <ApprovalProblemResolutionModal
          order={order}
          piece={problemPieceToResolve}
          onClose={() => {
            setProblemPieceToResolve(null);
          }}
        />
      )}
    </div>
  );
}
