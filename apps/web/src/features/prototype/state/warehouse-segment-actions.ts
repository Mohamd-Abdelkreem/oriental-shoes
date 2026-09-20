import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { requiredQuantity } from "./mvp-selectors";
import { nowString } from "./mvp-time";
import type { DeliveryAttempt } from "./mvp-types";
import type { QuantitySegment } from "./mvp-types";

export function createWarehouseSegmentActions({
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "confirmWarehouseReceipt"
  | "dispatchDelivery"
  | "recordDeliveryFailed"
  | "retryDelivery"
  | "confirmDelivered"
> {
  return {
    confirmWarehouseReceipt: (orderId, segmentId, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const seg = order.segments.find((s) => s.id === segmentId);
        if (!seg) return cur;

        const newWarehouseTotal = order.warehouse + seg.quantity;
        const activeReq = requiredQuantity(order);
        const isFullReady = newWarehouseTotal >= activeReq && activeReq > 0;

        const segments = order.segments.map<QuantitySegment>((s) => {
          if (s.id === segmentId) {
            return { ...s, state: "مستلم" };
          }
          return s;
        });

        const newStatus = isFullReady ? "جاهز للتسليم" : order.status;

        const ev = addEvent(
          orderId,
          `تأكيد استلام ${String(seg.quantity)} قطعة في المستودع (الإجمالي: ${String(newWarehouseTotal)}/${String(activeReq)})`,
          actor,
          "المستودع",
          {
            quantity: seg.quantity,
            destination: "المستودع",
            note: isFullReady
              ? "اكتملت جميع القطع ١٠٠٪ وأصبح الطلب جاهزاً للتسليم"
              : undefined,
          },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  warehouse: newWarehouseTotal,
                  status: newStatus,
                  segments,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    dispatchDelivery: (orderId, actor, repName) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const segments = order.segments.map<QuantitySegment>((s) => {
          if (s.stage === "المستودع") {
            return {
              ...s,
              stage: "مع المندوب",
              state: "خرج مع المندوب",
            };
          }
          return s;
        });

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "مع المندوب",
          time: nowString(),
          actor,
          note: repName ? `تسليم للمندوب ${repName}` : "خرج الطلب مع المندوب",
        };

        const ev = addEvent(
          orderId,
          "تأكيد خروج الطلب مع مندوب التوصيل",
          actor,
          "المستودع والتسليم",
          { note: attempt.note },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "خرج مع المندوب",
                  segments,
                  deliveryAttempts: [...(o.deliveryAttempts || []), attempt],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    recordDeliveryFailed: (orderId, note, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const segments = order.segments.map<QuantitySegment>((s) => {
          if (s.stage === "مع المندوب") {
            return {
              ...s,
              stage: "المستودع",
              state: "جاهز لمحاولة أخرى",
            };
          }
          return s;
        });

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "تعذر التسليم",
          time: nowString(),
          actor,
          note,
        };

        const ev = addEvent(
          orderId,
          "تسجيل تعذر تسليم الطلب",
          actor,
          "المستودع والتسليم",
          { note },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "تعذر التسليم",
                  deliveryNote: note,
                  segments,
                  deliveryAttempts: [...(o.deliveryAttempts || []), attempt],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    retryDelivery: (orderId, actor, newDate, notes) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "إعادة محاولة التسليم",
          time: nowString(),
          actor,
          note: notes
            ? `إعادة جدولة إلى ${newDate || "موعد لاحق"}: ${notes}`
            : "إعادة الطلب إلى قائمة الجاهز للتسليم لمحاولة خروج جديدة",
        };

        const ev = addEvent(
          orderId,
          `إعادة جدولة الطلب لمحاولة تسليم جديدة${newDate ? ` (الموعد: ${newDate})` : ""}`,
          actor,
          "المستودع والتسليم",
          { note: notes },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "جاهز للتسليم",
                  delivery: newDate || o.delivery,
                  deliveryDate: newDate || o.deliveryDate,
                  deliveryNote: notes || o.deliveryNote,
                  deliveryAttempts: [...(o.deliveryAttempts || []), attempt],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    confirmDelivered: (orderId, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const segments = order.segments.map<QuantitySegment>((s) => {
          if (s.stage === "مع المندوب" || s.stage === "المستودع") {
            return {
              ...s,
              stage: "تم الاستلام",
              state: "تم الاستلام",
            };
          }
          return s;
        });

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "تم الاستلام",
          time: nowString(),
          actor,
          note: "تم استلام العميل للطلب بنجاح واكتمال الدورة",
        };

        const ev = addEvent(
          orderId,
          "تأكيد استلام العميل للطلب (تم الاستلام)",
          actor,
          "المستودع والتسليم",
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "تم الاستلام",
                  segments,
                  deliveryAttempts: [...(o.deliveryAttempts || []), attempt],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
  };
}
