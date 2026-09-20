import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { nowString } from "./mvp-time";
import type { PieceLocation } from "./mvp-types";
import type { ProductLine } from "./mvp-types";
import type { DeliveryAttempt } from "./mvp-types";

export function createPieceResolutionActions({
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "salesUpdateProblemPiece"
  | "qualityInspectPiece"
  | "receiveWarehousePiece"
  | "dispatchOrder"
  | "confirmOrderDelivery"
> {
  return {
    salesUpdateProblemPiece: (
      orderId,
      pieceId,
      updatedFields,
      contactNotes,
      actor,
    ) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (p.id === pieceId && p.problem) {
            const previousValues: Record<string, string> = {};
            for (const key of Object.keys(
              updatedFields,
            ) as (keyof ProductLine)[]) {
              const previous = p[key];
              if (
                previous !== undefined &&
                previous !== updatedFields[key] &&
                (typeof previous === "string" ||
                  typeof previous === "number" ||
                  typeof previous === "boolean")
              ) {
                previousValues[key] = String(previous);
              }
            }
            return {
              ...p,
              ...updatedFields,
              previousValues: {
                ...(p.previousValues || {}),
                ...previousValues,
              },
              problem: {
                ...p.problem,
                status: "resolved" as const,
                salesNotes: contactNotes,
              },
              currentLocation: (p.problem.reportedByDept
                ? p.problem.reportedByDept.startsWith("في ")
                  ? p.problem.reportedByDept
                  : `في ${p.problem.reportedByDept}`
                : "في القص") as PieceLocation,
              deptStatus: "جاهزة للعمل" as const,
            };
          }
          return p;
        });

        const ev = addEvent(
          orderId,
          `تحديث مواصفات القطعة بعد التواصل مع العميل: ${contactNotes}`,
          actor,
          "المبيعات",
          { note: contactNotes },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, items: newItems } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    qualityInspectPiece: (orderId, pieceId, decision, rejectionData) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        let newItems = [...order.items];
        let eventTitle = "";

        if (decision === "accept") {
          newItems = newItems.map((p) => {
            if (p.id === pieceId && p.problem) {
              return {
                ...p,
                currentLocation: "في المستودع" as const,
                deptStatus: "مجازة ومغلفة" as const,
                responsibleWorker: undefined,
              };
            }
            return p;
          });
          eventTitle = "إجازة القطعة وتغليفها وتحويلها إلى المستودع";
        } else {
          const respDept = rejectionData?.responsibleDept || "الإنتاج والإصلاح";
          const targetLoc: PieceLocation =
            respDept === "القص"
              ? "في القص"
              : respDept === "العمليات الخاصة"
                ? "في العمليات الخاصة"
                : "في الإنتاج";
          newItems = newItems.map((p) => {
            if (p.id === pieceId && p.problem) {
              return {
                ...p,
                currentLocation: targetLoc,
                deptStatus: "مرتجعة للتصحيح" as const,
                rejection: {
                  responsibleDept: respDept,
                  reason: rejectionData?.reason || "عيب فني",
                  notes: rejectionData?.notes || "",
                  cycle: (p.rejection?.cycle || 0) + 1,
                  returnedAt: nowString(),
                },
              };
            }
            return p;
          });
          eventTitle = `رفض القطعة وإعادتها إلى ${respDept} للتصحيح: ${rejectionData?.reason ?? ""}`;
        }

        const active = newItems.filter((p) => !p.isDeleted);
        const inWh = active.filter(
          (p) =>
            p.currentLocation === "في المستودع" ||
            p.currentLocation === "تم التسليم",
        ).length;
        const isComplete = active.length > 0 && inWh >= active.length;

        const ev = addEvent(
          orderId,
          eventTitle,
          "منى سعيد",
          "الجودة والتغليف",
          { note: rejectionData?.notes },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: newItems,
                  warehouse: inWh,
                  status: isComplete ? "جاهز للتسليم" : o.status,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    receiveWarehousePiece: (orderId, pieceId) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (p.id === pieceId) {
            return {
              ...p,
              currentLocation: "في المستودع" as const,
              deptStatus: "مكتملة" as const,
            };
          }
          return p;
        });

        const active = newItems.filter((p) => !p.isDeleted);
        const inWh = active.filter(
          (p) =>
            p.currentLocation === "في المستودع" ||
            p.currentLocation === "تم التسليم",
        ).length;
        const isComplete = active.length > 0 && inWh >= active.length;

        const ev = addEvent(
          orderId,
          "تأكيد استلام القطعة في المستودع",
          "سارة محمد",
          "المستودع والتسليم",
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: newItems,
                  warehouse: inWh,
                  status: isComplete ? "جاهز للتسليم" : o.status,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    dispatchOrder: (orderId, courierName = "فهد الحربي") => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (!p.isDeleted) {
            return {
              ...p,
              currentLocation: "مع المندوب" as const,
            };
          }
          return p;
        });

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "مع المندوب",
          time: nowString(),
          actor: "سارة محمد",
          note: `خرجت الطلبية كاملة مع المندوب ${courierName}`,
        };

        const ev = addEvent(
          orderId,
          `إرسال الطلبية كاملة مع المندوب (${courierName})`,
          "سارة محمد",
          "المستودع والتسليم",
          { quantity: newItems.filter((p) => !p.isDeleted).length },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "خرج مع المندوب",
                  items: newItems,
                  deliveryAttempts: [...(o.deliveryAttempts || []), attempt],
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    confirmOrderDelivery: (orderId) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (!p.isDeleted) {
            return {
              ...p,
              currentLocation: "تم الاستلام" as const,
            };
          }
          return p;
        });

        const attempt: DeliveryAttempt = {
          id: crypto.randomUUID(),
          status: "تم الاستلام",
          time: nowString(),
          actor: "مندوب التوصيل",
          note: "تم تسليم كامل قطع الطلب بنجاح للعميل",
        };

        const ev = addEvent(
          orderId,
          "تأكيد استلام الطلب بالكامل من قِبل العميل",
          "مندوب التوصيل",
          "المستودع والتسليم",
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "تم الاستلام",
                  items: newItems,
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
