"use client";

import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import { OrderTrackingMetrics } from "./order-tracking-metrics";
import { OrderTrackingPieceLocations } from "./order-tracking-piece-locations";

export function OrderFullTrackingView({ order }: { order: MvpOrder }) {
  return (
    <div className="space-y-3.5">
      <OrderTrackingMetrics order={order} />
      <OrderTrackingPieceLocations order={order} />

      <p className="pt-1 text-center text-[11px] text-slate-400">
        للاطلاع على السجل الزمني وحركات التنقل المفصلة، يمكنك مراجعة تبويب «سجل
        الحركات والتوقيتات»
      </p>
    </div>
  );
}
