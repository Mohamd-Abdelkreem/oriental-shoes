"use client";

import React from "react";
import { CheckCircle2, Info } from "lucide-react";
import {
  formatOrderPieceProgress,
  requiredQuantity,
  totalQuantity,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";

type Props = {
  order: MvpOrder;
  taskQty?: number | undefined;
  taskStageName?: string | undefined;
};

export function QuantityReconciliation({
  order,
  taskQty,
  taskStageName,
}: Props) {
  const orig = totalQuantity(order);
  const canc = order.cancelled;
  const req = requiredQuantity(order);
  const rec = order.warehouse;
  const remaining = Math.max(0, req - rec);
  const isFullWh = req > 0 && rec >= req;

  return (
    <div className="oriental-reconcile-card mb-6 box-border w-full rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="reconcile-header mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <span className="reconcile-title text-sm font-bold text-slate-900">
          مطابقة وتوزيع القطع
        </span>
        <span className="reconcile-badge inline-flex items-center">
          {isFullWh ? (
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={13} />
              مكتمل بالمستودع (كامل القطع)
            </span>
          ) : (
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
              {formatOrderPieceProgress(order)}
            </span>
          )}
        </span>
      </div>

      <div className="reconcile-metric-grid mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="reconcile-item flex flex-col justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <span className="reconcile-label text-xs font-semibold text-slate-500">
            الكمية الأصلية
          </span>
          <strong className="reconcile-val text-xl font-bold text-slate-900">
            {orig}
          </strong>
          <small className="reconcile-sub text-[11px] text-slate-400">
            إجمالي بنود أمر التفصيل
          </small>
        </div>

        <div className="reconcile-item flex flex-col justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <span className="reconcile-label text-xs font-semibold text-slate-500">
            الملغاة إدارياً
          </span>
          <strong
            className={`reconcile-val text-xl font-bold ${canc > 0 ? "text-rose-600" : "text-slate-700"}`}
          >
            {canc}
          </strong>
          <small className="reconcile-sub text-[11px] text-slate-400">
            {canc > 0 ? "خصمت من مسار المصنع" : "لا يوجد إلغاء"}
          </small>
        </div>

        <div className="reconcile-item highlight-teal flex flex-col justify-between gap-1 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
          <span className="reconcile-label text-xs font-semibold text-teal-800">
            المطلوبة الفعلية
          </span>
          <strong className="reconcile-val text-xl font-bold text-teal-700">
            {req}
          </strong>
          <small className="reconcile-sub text-[11px] text-teal-600">
            أساس احتساب الاكتمال
          </small>
        </div>

        {taskQty !== undefined && (
          <div className="reconcile-item highlight-blue flex flex-col justify-between gap-1 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <span className="reconcile-label text-xs font-semibold text-blue-800">
              كمية هذه المهمة
            </span>
            <strong className="reconcile-val text-xl font-bold text-blue-700">
              {taskQty}
            </strong>
            <small className="reconcile-sub text-[11px] text-blue-600">
              {taskStageName || "القسم الحالي"}
            </small>
          </div>
        )}

        <div className="reconcile-item flex flex-col justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <span className="reconcile-label text-xs font-semibold text-slate-500">
            المستلمة بالمستودع
          </span>
          <strong
            className={`reconcile-val text-xl font-bold ${rec === req && req > 0 ? "text-emerald-600" : "text-slate-800"}`}
          >
            {rec}
          </strong>
          <small className="reconcile-sub text-[11px] text-slate-400">
            فحصت وغُلفت واستلمت
          </small>
        </div>

        <div className="reconcile-item flex flex-col justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <span className="reconcile-label text-xs font-semibold text-slate-500">
            المتبقي للتسليم
          </span>
          <strong
            className={`reconcile-val text-xl font-bold ${remaining > 0 ? "text-amber-600" : "text-slate-400"}`}
          >
            {remaining}
          </strong>
          <small className="reconcile-sub text-[11px] text-slate-400">
            {remaining === 0 ? "جاهز لخروج المندوب" : "قيد التصنيع بالمصنع"}
          </small>
        </div>
      </div>

      <div className="reconcile-equation flex items-start gap-2.5 rounded-lg border border-teal-100 bg-teal-50/60 p-3.5 text-xs leading-relaxed text-teal-800">
        <Info size={16} className="mt-0.5 shrink-0 text-teal-600" />
        <p className="reconcile-text m-0 text-xs">
          <strong>ملاحظة مطابقة القطع:</strong> هذه القطع تتبع لنفس أمر التفصيل
          والعميل. عند تجزئة مسار القطع، تظل جميع القطع مرتبطة بنفس الطلب الأصلي
          ولا يكتمل الطلب للتسليم إلا بعد استلام المستودع لكامل القطع المطلوبة{" "}
          <strong>
            ({req} من أصل {req} قطع)
          </strong>
          .
        </p>
      </div>
    </div>
  );
}
