import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { nowString } from "./mvp-time";
import type { PieceLocation } from "./mvp-types";
import type { DeptWorkingStatus } from "./mvp-types";

export function createPieceWorkflowActions({
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "startPieceWork"
  | "completeAndTransferPieces"
  | "reportPieceProblem"
  | "resolveApprovalProblem"
> {
  return {
    startPieceWork: (orderId, pieceIds, workerName, deptName) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const newItems = order.items.map((p) => {
          if (pieceIds.includes(p.id)) {
            return {
              ...p,
              deptStatus: "جاري العمل" as const,
              responsibleWorker: p.responsibleWorker || workerName,
            };
          }
          return p;
        });

        const ev = addEvent(
          orderId,
          `بدء العمل على ${String(pieceIds.length)} قطع في ${deptName}`,
          workerName,
          deptName,
          { quantity: pieceIds.length },
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
    completeAndTransferPieces: (orderId, pieceIds, nextStage, note) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (!pieceIds.includes(p.id)) return p;
          let targetLoc: PieceLocation = "في الإنتاج";
          let targetStatus: DeptWorkingStatus = "جاهزة للعمل";

          if (
            nextStage === "الإنتاج والإصلاح" ||
            nextStage === "في الإنتاج" ||
            nextStage === "الإنتاج"
          ) {
            if (
              p.specialOpRequired ||
              (p.specialOpNote && p.specialOpNote.trim())
            ) {
              targetLoc = "في العمليات الخاصة";
              targetStatus = "جاهزة للعمل";
            } else {
              targetLoc = "في الإنتاج";
              targetStatus = "جاهزة للعمل";
            }
          } else if (
            nextStage === "العمليات الخاصة" ||
            nextStage === "في العمليات الخاصة"
          ) {
            targetLoc = "في العمليات الخاصة";
            targetStatus = "جاهزة للعمل";
          } else if (
            nextStage === "الجودة والتغليف" ||
            nextStage === "في الجودة" ||
            nextStage === "الجودة"
          ) {
            targetLoc = "في الجودة";
            targetStatus = "جاهزة للفحص";
          } else if (nextStage === "المستودع" || nextStage === "في المستودع") {
            targetLoc = "في المستودع";
            targetStatus = "جاهزة للعمل";
          }

          return {
            ...p,
            currentLocation: targetLoc,
            deptStatus: targetStatus,
            responsibleWorker: undefined,
            rejection: undefined,
          };
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
          `إنهاء ${String(pieceIds.length)} قطع وتحويلها للمرحلة التالية (${nextStage})`,
          "فني التشغيل",
          "المصنع",
          { quantity: pieceIds.length, note },
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
    reportPieceProblem: (orderId, pieceId, reason, notes, dept, worker) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        const newItems = order.items.map((p) => {
          if (p.id === pieceId) {
            return {
              ...p,
              currentLocation: "لدى الاعتماد بسبب مشكلة" as const,
              deptStatus: "بها مشكلة" as const,
              problem: {
                reportedByDept: dept,
                reportedByWorker: worker,
                reason,
                notes,
                reportedAt: nowString(),
                status: "pending" as const,
              },
            };
          }
          return p;
        });

        const ev = addEvent(
          orderId,
          `تسجيل مشكلة على قطعة (${reason}) وإحالتها للاعتماد`,
          worker,
          dept,
          { note: notes },
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
    resolveApprovalProblem: (
      orderId,
      pieceId,
      action,
      resolutionNotes,
      targetDept,
      actor = "خالد منصور",
    ) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;

        let newItems = [...order.items];
        let eventTitle = "";

        if (action === "return_to_dept") {
          newItems = newItems.map((p) => {
            if (p.id === pieceId && p.problem) {
              const finalDept =
                targetDept ||
                ((p.problem.reportedByDept || "القص") as PieceLocation);
              const loc: PieceLocation = finalDept.startsWith("في ")
                ? finalDept
                : (`في ${finalDept}` as PieceLocation);
              return {
                ...p,
                currentLocation: loc,
                deptStatus: "جاهزة للعمل" as const,
                problem: {
                  ...p.problem,
                  status: "resolved" as const,
                  approvalAction: "return_to_dept" as const,
                  approvalNotes: resolutionNotes,
                  resolvedAt: nowString(),
                },
              };
            }
            return p;
          });
          eventTitle = `اعتماد حل المشكلة وإعادة القطعة إلى القسم: ${resolutionNotes}`;
        } else if (action === "send_to_sales") {
          newItems = newItems.map((p) => {
            if (p.id === pieceId && p.problem) {
              return {
                ...p,
                problem: {
                  ...p.problem,
                  status: "sent_to_sales" as const,
                  approvalAction: "send_to_sales" as const,
                  approvalNotes: resolutionNotes,
                },
              };
            }
            return p;
          });
          eventTitle = `إحالة القطعة لقسم المبيعات للتواصل مع العميل: ${resolutionNotes}`;
        } else {
          newItems = newItems.map((p) => {
            if (p.id === pieceId && p.problem) {
              return {
                ...p,
                isDeleted: true,
                deletedReason: resolutionNotes,
                deletedAt: nowString(),
                currentLocation: "ملغاة" as const,
                deptStatus: undefined,
              };
            }
            return p;
          });
          eventTitle = `حذف القطعة إدارياً من أمر التفصيل: ${resolutionNotes}`;
        }

        const active = newItems.filter((p) => !p.isDeleted);
        const totalVal = active.reduce(
          (sum, p) => sum + (Number(p.unitPrice) || 450),
          0,
        );
        const paidVal = Number(order.paid) || 0;
        const balanceVal = Math.max(0, totalVal - paidVal);
        const inWh = active.filter(
          (p) =>
            p.currentLocation === "في المستودع" ||
            p.currentLocation === "تم التسليم",
        ).length;
        const isComplete = active.length > 0 && inWh >= active.length;

        const ev = addEvent(orderId, eventTitle, actor, "الاعتماد", {
          note: resolutionNotes,
        });

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: newItems,
                  total: String(totalVal),
                  balance: String(balanceVal),
                  warehouse: inWh,
                  status: isComplete ? "جاهز للتسليم" : o.status,
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
  };
}
