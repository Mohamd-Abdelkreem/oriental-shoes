import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { totalQuantity } from "./mvp-selectors";
import { nowString } from "./mvp-time";
import type { Stage } from "./mvp-types";
import type { QuantitySegment } from "./mvp-types";

export function createApprovalActions({
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "approveOrder"
  | "returnOrderToSales"
  | "adminCancelQuantity"
  | "adminReopenOrder"
> {
  return {
    approveOrder: (orderId, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        // If repair -> moves directly to Production & Repair
        // If standard -> moves to Cutting
        const firstStage: Stage =
          order.type === "REPAIR" ? "الإنتاج والإصلاح" : "القص";

        const initialSegments: QuantitySegment[] = order.items.map((item) => ({
          id: crypto.randomUUID(),
          itemId: item.id,
          stage: firstStage,
          quantity: item.quantity,
          state: "بانتظار الاستلام",
          source: "الاعتماد",
          note: order.type === "REPAIR" ? order.repairNote : undefined,
        }));

        const ev = addEvent(
          orderId,
          `اعتماد أمر التفصيل وإرساله إلى ${firstStage}`,
          actor,
          "الاعتماد",
          { destination: firstStage, quantity: totalQuantity(order) },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "قيد التصنيع",
                  segments: initialSegments,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    returnOrderToSales: (orderId, reason, actor) => {
      setSnapshot((cur) => {
        const ev = addEvent(
          orderId,
          `إعادة الطلب إلى المبيعات: ${reason}`,
          actor,
          "الاعتماد",
          { note: reason },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "معاد للتعديل",
                  returnReason: reason,
                  reviewer: actor,
                  returnedAt: nowString(),
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    adminCancelQuantity: (orderId, cancelQty, reason, actor, itemId) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order || cancelQty <= 0) return cur;

        let remToCancel = cancelQty;
        const cancelledSegments: QuantitySegment[] = [];
        const updatedSegments: QuantitySegment[] = [];

        for (const seg of order.segments) {
          if (
            remToCancel > 0 &&
            (!itemId || seg.itemId === itemId) &&
            seg.stage !== "ملغاة" &&
            seg.stage !== "مع المندوب" &&
            seg.stage !== "تم الاستلام"
          ) {
            const deduct = Math.min(remToCancel, seg.quantity);
            remToCancel -= deduct;

            if (deduct > 0) {
              cancelledSegments.push({
                id: crypto.randomUUID(),
                itemId: seg.itemId,
                stage: "ملغاة",
                quantity: deduct,
                state: "ملغاة",
                source: seg.stage,
                note: reason,
              });
            }

            if (seg.quantity > deduct) {
              updatedSegments.push({
                ...seg,
                quantity: seg.quantity - deduct,
              });
            }
          } else {
            updatedSegments.push(seg);
          }
        }

        const actualCancelled = cancelQty - remToCancel;
        const newTotalCancelled = order.cancelled + actualCancelled;
        const newActiveReq = totalQuantity(order) - newTotalCancelled;
        const isComplete = newActiveReq > 0 && order.warehouse >= newActiveReq;
        const isFullyCancelled = newActiveReq <= 0;

        const newStatus = isFullyCancelled
          ? "ملغي بالكامل"
          : isComplete
            ? "جاهز للتسليم"
            : "ملغي جزئياً";

        const ev = addEvent(
          orderId,
          `إلغاء إداري لعدد ${String(actualCancelled)} قطع`,
          actor,
          "الإدارة",
          { quantity: actualCancelled, note: reason },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  cancelled: newTotalCancelled,
                  status: newStatus,
                  segments: [...updatedSegments, ...cancelledSegments],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    adminReopenOrder: (orderId, reason, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const ev = addEvent(
          orderId,
          `إعادة فتح أمر التفصيل إدارياً: ${reason}`,
          actor,
          "الإدارة العامة",
          { note: reason },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "معاد فتحه إدارياً",
                  reopenedBy: actor,
                  reopenedAt: nowString(),
                  reopenReason: reason,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
  };
}
