import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { nowString } from "./mvp-time";
import type { Stage } from "./mvp-types";
import { manufacturingCompletion } from "./manufacturing-completion";

export function createDepartmentSegmentActions({
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "receiveAndStart"
  | "confirmReceipt"
  | "startWork"
  | "completeManufacturingSegment"
  | "submitQualityInspection"
  | "remedyCorrection"
  | "sendCorrectedToQuality"
> {
  return {
    receiveAndStart: (orderId, segmentId, actor, role) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const stageStatusMap: Record<string, string> = {
          "قسم القص": "قيد القص",
          القص: "قيد القص",
          "قسم الإنتاج والإصلاح": "قيد الإنتاج",
          "الإنتاج والإصلاح": "قيد الإنتاج",
          "قسم الجودة والتغليف": "قيد الفحص والتغليف",
          "الجودة والتغليف": "قيد الفحص والتغليف",
        };

        const newStatus = stageStatusMap[role] || order.status;

        const segments = order.segments.map((seg) => {
          if (
            seg.id === segmentId ||
            (!segmentId && (seg.stage === role || role.includes(seg.stage)))
          ) {
            return {
              ...seg,
              state: "قيد التنفيذ" as const,
              worker: actor,
              startedAt: nowString(),
            };
          }
          return seg;
        });

        const ev = addEvent(
          orderId,
          `استلام وبدء العمل في ${role}`,
          actor,
          role,
          { destination: role },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, status: newStatus, segments } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    confirmReceipt: (orderId, segmentId, actor, role) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const segments = order.segments.map((seg) => {
          if (seg.id === segmentId) {
            return { ...seg, state: "بانتظار بدء العمل" };
          }
          return seg;
        });
        const ev = addEvent(orderId, `استلام الكمية في ${role}`, actor, role, {
          destination: role,
        });
        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, segments } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    startWork: (orderId, segmentId, actor, role) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const segments = order.segments.map((seg) => {
          if (seg.id === segmentId) {
            return {
              ...seg,
              state: "قيد التنفيذ",
              worker: actor,
              startedAt: nowString(),
            };
          }
          return seg;
        });
        const ev = addEvent(orderId, `بدء العمل في ${role}`, actor, role, {
          destination: role,
        });
        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, segments } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    completeManufacturingSegment: ({ orderId, segmentId, quantity, actor }) => {
      setSnapshot((current) => {
        const order = current.orders.find(
          (candidate) => candidate.id === orderId,
        );
        const segment = order?.segments.find(
          (candidate) => candidate.id === segmentId,
        );
        if (!order || !segment) return current;
        const completion = manufacturingCompletion(order, segment, quantity);
        if (!completion) return current;
        const { order: completedOrder, nextStage } = completion;
        const completionEvent = addEvent(
          orderId,
          `تسجيل إنجاز ${String(quantity)} قطعة في ${segment.stage}`,
          actor,
          segment.stage,
          { quantity },
        );
        const transferEvent = addEvent(
          orderId,
          `إرسال ${String(quantity)} قطعة من ${segment.stage} إلى ${nextStage}`,
          actor,
          segment.stage,
          {
            quantity,
            source: segment.stage,
            destination: nextStage,
            note: segment.note,
          },
        );
        return {
          ...current,
          orders: current.orders.map((candidate) =>
            candidate.id === orderId ? completedOrder : candidate,
          ),
          events: [transferEvent, completionEvent, ...current.events],
        };
      });
    },
    submitQualityInspection: (orderId, segmentId, data, actor) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const seg = order.segments.find((s) => s.id === segmentId);
        if (
          !seg ||
          data.inspectedQty <= 0 ||
          data.inspectedQty > seg.quantity ||
          data.acceptedQty + data.rejectedQty !== data.inspectedQty
        )
          return cur;

        const remaining = seg.quantity - data.inspectedQty;
        const otherSegments = order.segments.filter((s) => s.id !== segmentId);
        const newSegments = [...otherSegments];

        if (remaining > 0) {
          newSegments.push({ ...seg, quantity: remaining });
        }

        // Accepted goes to Warehouse
        if (data.acceptedQty > 0) {
          newSegments.push({
            id: crypto.randomUUID(),
            itemId: seg.itemId,
            stage: "المستودع",
            quantity: data.acceptedQty,
            state: "بانتظار الاستلام",
            source: "الجودة والتغليف",
            note: data.note,
          });
        }

        // Rejected goes back to responsible department
        const newCorrections = [...(order.corrections || [])];
        if (data.rejectedQty > 0 && data.responsibleDept) {
          const nextCycle = (seg.cycle || 0) + 1;
          const newSegId = crypto.randomUUID();
          newSegments.push({
            id: newSegId,
            itemId: seg.itemId,
            stage: data.responsibleDept,
            quantity: data.rejectedQty,
            state: "معادة من الجودة",
            source: "الجودة والتغليف",
            note: `${data.reason ?? ""} · ${data.instructions ?? ""}`,
            cycle: nextCycle,
          });

          newCorrections.push({
            id: `qc-${crypto.randomUUID().slice(0, 6)}`,
            itemId: seg.itemId,
            segmentId: newSegId,
            quantity: data.rejectedQty,
            responsible: data.responsibleDept,
            reason: data.reason || "عدم مطابقة للمواصفات",
            instructions: data.instructions || "إعادة الفحص والتصحيح",
            cycle: nextCycle,
            date: nowString(),
            actor,
            resolved: false,
          });
        }

        const ev = addEvent(
          orderId,
          `فحص الجودة: قبول ${String(data.acceptedQty)}، ورفض ${String(data.rejectedQty)}`,
          actor,
          "الجودة والتغليف",
          {
            quantity: data.inspectedQty,
            note:
              data.rejectedQty > 0
                ? `معادة إلى ${data.responsibleDept ?? ""}: ${data.reason ?? ""}`
                : "فحص وتغليف ناجح",
          },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  segments: newSegments,
                  corrections: newCorrections,
                  cartonCount: data.cartonCount || o.cartonCount,
                  cartonNumbers: data.cartonNumbers || o.cartonNumbers,
                  packagingNote: data.note || o.packagingNote,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    remedyCorrection: (orderId, segmentId, actor, role, note) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const segments = order.segments.map((seg) => {
          if (seg.id === segmentId) {
            return { ...seg, state: "تم التصحيح", note: note || seg.note };
          }
          return seg;
        });
        const ev = addEvent(
          orderId,
          `إكمال تصحيح الكمية في ${role}`,
          actor,
          role,
          { note },
        );
        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, segments } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    sendCorrectedToQuality: (orderId, segmentId, actor, role) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const seg = order.segments.find((s) => s.id === segmentId);
        if (!seg) return cur;

        const otherSegments = order.segments.filter((s) => s.id !== segmentId);
        const newSegments = [
          ...otherSegments,
          {
            ...seg,
            id: crypto.randomUUID(),
            stage: "الجودة والتغليف" as Stage,
            state: "إعادة فحص",
            source: seg.stage,
          },
        ];

        const ev = addEvent(
          orderId,
          `إعادة الكمية المصححة (${String(seg.quantity)} قطع) من ${seg.stage} إلى الجودة للفحص`,
          actor,
          role,
          {
            quantity: seg.quantity,
            source: seg.stage,
            destination: "الجودة والتغليف",
          },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId ? { ...o, segments: newSegments } : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
  };
}
