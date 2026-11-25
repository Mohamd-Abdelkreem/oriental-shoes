"use client";
import type { OrderTrackingProps } from "./order-tracking-view";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  type MvpOrder,
  totalQuantity,
  requiredQuantity,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";

export function OrderTrackingMetrics(props: OrderTrackingProps) {
  const metrics =
    props.projection === undefined
      ? legacyMetrics(props.order)
      : { ...props.projection.counts, ready: props.projection.ready };
  const originalPieceCount = metrics.original;
  const cancelledPieceCount = metrics.cancelled;
  const requiredPieceCount = metrics.active;
  const warehousePieceCount = metrics.received;
  const remainingPieceCount = Math.max(0, metrics.active - metrics.received);
  const isComplete = metrics.ready;
  const completionPercentage =
    props.projection === undefined
      ? metrics.completionPercent
      : metrics.active === 0
        ? 0
        : metrics.received === metrics.active
          ? 100
          : Math.min(99, metrics.completionPercent);
  const custody =
    props.projection === undefined
      ? "قيد التنفيذ والمتابعة في الأقسام"
      : metrics.active === 0
        ? "لا توجد قطع نشطة للتوصيل"
        : props.projection.orderStatus === "OUT_FOR_DELIVERY"
          ? "مع المندوب للتوصيل"
          : props.projection.orderStatus === "DELIVERED"
            ? "تم تسليم الطلب بالكامل للعميل"
            : props.projection.orderStatus === "DELIVERY_FAILED"
              ? "عادت القطع إلى المستودع؛ بانتظار إعادة التجهيز"
              : metrics.received === metrics.active
                ? "تم الاستلام الفعلي بالمستودع"
                : "قيد التنفيذ والمتابعة في الأقسام";
  return (
    <div className="space-y-2.5">
      {cancelledPieceCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-s-4 border-rose-200/90 border-s-rose-500 bg-rose-50/90 px-4 py-3 text-[13px] font-medium text-rose-900 shadow-2xs">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <AlertTriangle size={16} aria-hidden="true" />
          </span>
          <span className="leading-6">
            تم إلغاء{" "}
            <strong className="font-bold">
              {formatProductCount(cancelledPieceCount)}
            </strong>{" "}
            إدارياً من هذا الطلب (الكمية المعتمدة الحالية للتصنيع:{" "}
            <strong className="font-bold">
              {formatProductCount(requiredPieceCount)}
            </strong>
            ).
          </span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">
              حالة الإنجاز العام:
            </span>
            <span className="font-mono font-bold text-teal-800">
              {completionPercentage}%
            </span>
            <span className="text-[11px] text-slate-400">
              (اكتمل {warehousePieceCount} من أصل {requiredPieceCount} قطع)
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {isComplete ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <CheckCircle2 size={13} />
                <span>جاهز ومكتمل بالمستودع</span>
              </span>
            ) : (
              <span className="font-medium text-slate-500">{custody}</span>
            )}
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isComplete ? "bg-emerald-600" : "bg-teal-600"
            }`}
            style={{ width: `${String(completionPercentage)}%` }}
          />
        </div>

        <div className="mt-3.5 grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-3 text-center divide-x-reverse">
          <div>
            <span className="block text-[11px] text-slate-400">
              القطع المطلوبة
            </span>
            <span className="font-mono text-base font-bold text-slate-800">
              {formatProductCount(requiredPieceCount)}
            </span>
            {originalPieceCount !== requiredPieceCount && (
              <span className="block text-[10px] text-slate-400">
                (الأصلي: {originalPieceCount})
              </span>
            )}
          </div>

          <div>
            <span className="block text-[11px] text-slate-400">
              قيد التصنيع حالياً
            </span>
            <span className="font-mono text-base font-bold text-amber-900">
              {formatProductCount(remainingPieceCount)}
            </span>
          </div>

          <div>
            <span className="block text-[11px] text-slate-400">
              {props.projection === undefined
                ? "المكتمل بالمستودع"
                : "المستلم فعلياً بالمستودع (سجل الاستلام)"}
            </span>
            <span className="font-mono text-base font-bold text-emerald-900">
              {formatProductCount(warehousePieceCount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function legacyMetrics(order: MvpOrder) {
  const active = requiredQuantity(order),
    received = order.warehouse;
  return {
    original: totalQuantity(order),
    cancelled: order.cancelled,
    active,
    received,
    ready: active > 0 && received >= active,
    completionPercent:
      active > 0 ? Math.min(100, Math.round((received / active) * 100)) : 0,
  };
}
