"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  type MvpOrder,
  totalQuantity,
  requiredQuantity,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";

export function OrderTrackingMetrics({ order }: { order: MvpOrder }) {
  const originalPieceCount = totalQuantity(order);
  const cancelledPieceCount = order.cancelled;
  const requiredPieceCount = requiredQuantity(order);
  const warehousePieceCount = order.warehouse;
  const remainingPieceCount = Math.max(
    0,
    requiredPieceCount - warehousePieceCount,
  );
  const isComplete =
    requiredPieceCount > 0 && warehousePieceCount >= requiredPieceCount;
  const completionPercentage =
    requiredPieceCount > 0
      ? Math.min(
          100,
          Math.round((warehousePieceCount / requiredPieceCount) * 100),
        )
      : 0;

  return (
    <div className="space-y-2.5">
      {cancelledPieceCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-800">
          <AlertTriangle size={14} className="shrink-0 text-rose-600" />
          <span>
            تم إلغاء <strong>{formatProductCount(cancelledPieceCount)}</strong>{" "}
            إدارياً من هذا الطلب (الكمية المعتمدة الحالية للتصنيع:{" "}
            <strong>{formatProductCount(requiredPieceCount)}</strong>).
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
              <span className="font-medium text-slate-500">
                قيد التنفيذ والمتابعة في الأقسام
              </span>
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
              المكتمل بالمستودع
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
