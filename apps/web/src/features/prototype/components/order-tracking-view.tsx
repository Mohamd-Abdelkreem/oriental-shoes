"use client";

import { Clock } from "lucide-react";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import { OrderTrackingMetrics } from "./order-tracking-metrics";
import { OrderTrackingStagePipeline } from "./order-tracking-stage-pipeline";
import { OrderTrackingPieceLocations } from "./order-tracking-piece-locations";

export function OrderFullTrackingView({ order }: { order: MvpOrder }) {
  return (
    <div className="space-y-5">
      <OrderTrackingMetrics order={order} />
      <OrderTrackingStagePipeline order={order} />
      <OrderTrackingPieceLocations order={order} />

      {/* 5. Prompt to View Complete Event Log in Tab 3 */}
      <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600 sm:flex-row">
        <div className="flex items-center gap-2">
          <Clock size={15} className="shrink-0 text-teal-700" />
          <span>لمراجعة السجل الزمني الدقيق لكافة العمليات والاعتمادات:</span>
        </div>
        <span className="font-semibold text-teal-800">
          راجع تبويب «سجل الحركات والتوقيتات» في أعلى الصفحة
        </span>
      </div>
    </div>
  );
}
