import { AlertTriangle } from "lucide-react";
import {
  type MvpOrder,
  totalQuantity,
  requiredQuantity,
  formatOrderPieceProgress,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";

export function OrderTrackingMetrics({ order }: { order: MvpOrder }) {
  const orig = totalQuantity(order);
  const canc = order.cancelled;
  const activeReq = requiredQuantity(order);
  const completedInWh = order.warehouse;
  const remainingToComplete = Math.max(0, activeReq - completedInWh);
  const isAllInWh = activeReq > 0 && completedInWh >= activeReq;
  const progressPct =
    activeReq > 0
      ? Math.min(100, Math.round((completedInWh / activeReq) * 100))
      : 0;

  return (
    <div className="space-y-3">
      {canc > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
          <AlertTriangle size={14} className="shrink-0 text-rose-600" />
          <span>
            تم إلغاء <strong>{formatProductCount(canc)}</strong> إدارياً من هذا
            الطلب، والكمية النشطة المعتمدة للتصنيع هي{" "}
            <strong>{formatProductCount(activeReq)}</strong>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">
            القطع المطلوبة (النشطة)
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl font-bold text-slate-900">
              {formatProductCount(activeReq)}
            </span>
            <span className="text-[11px] text-slate-400">
              الأصلي: {formatProductCount(orig)}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-amber-200/80 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-amber-800">
            قيد التصنيع بالمصنع
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl font-bold text-amber-950">
              {formatProductCount(remainingToComplete)}
            </span>
            <span className="text-[11px] text-amber-700">في خطوط الإنتاج</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-emerald-200/80 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-emerald-800">
            المكتمل بالمستودع
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl font-bold text-emerald-950">
              {formatProductCount(completedInWh)}
            </span>
            <span className="text-[11px] text-emerald-700">
              {isAllInWh ? "مكتمل بالكامل" : "بانتظار الباقي"}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-teal-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-teal-800">
              نسبة الإنجاز
            </span>
            <span className="font-mono text-xs font-bold text-teal-900">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-500"
                style={{ width: `${String(progressPct)}%` }}
              />
            </div>
            <span className="mt-1 block text-left font-mono text-[10px] text-slate-500">
              {formatOrderPieceProgress(order)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
