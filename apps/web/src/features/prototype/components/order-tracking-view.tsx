"use client";

import type { AuthoritativeOrderTracking } from "@/features/sales/model/order-view.model";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import { OrderTrackingMetrics } from "./order-tracking-metrics";
import { OrderTrackingPieceLocations } from "./order-tracking-piece-locations";

export type OrderTrackingProps =
  | { order: MvpOrder; projection?: never }
  | {
      projection: AuthoritativeOrderTracking;
      order?: never;
    };
export function OrderFullTrackingView(props: OrderTrackingProps) {
  return (
    <div className="space-y-3.5">
      <OrderTrackingMetrics {...props} />
      <OrderTrackingPieceLocations {...props} />

      <p className="pt-1 text-center text-[11px] text-slate-400">
        للاطلاع على السجل الزمني وحركات التنقل المفصلة، يمكنك مراجعة تبويب «سجل
        الحركات والتوقيتات»
      </p>
    </div>
  );
}
