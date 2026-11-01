import {
  requiredQuantity,
  stageQuantity,
  type MvpOrder,
  type Stage,
} from "@/features/prototype/state/mvp-store";
import { isOrderOverdue } from "@/features/prototype/state/workflow";

export function getReportSummary(orders: MvpOrder[]) {
  const totalRequired = orders.reduce(
    (sum, order) => sum + requiredQuantity(order),
    0,
  );
  const totalWarehouse = orders.reduce(
    (sum, order) => sum + (order.warehouse || 0),
    0,
  );
  const quantityAtStage = (stage: Stage) =>
    orders.reduce((sum, order) => sum + stageQuantity(order, stage), 0);
  return {
    totalRequired,
    totalWarehouse,
    completionRate:
      totalRequired > 0
        ? Math.round((totalWarehouse / totalRequired) * 100)
        : 0,
    deliveredOrders: orders.filter(
      (order) =>
        order.status === "مكتمل ومسلم" || order.status === "تم الاستلام",
    ),
    outForDeliveryOrders: orders.filter(
      (order) =>
        order.status === "خرج مع المندوب" || order.status === "مع المندوب",
    ),
    overdueOrders: orders.filter((order) => isOrderOverdue(order)),
    deliveryFailedOrders: orders.filter(
      (order) => order.status === "تعذر التسليم",
    ),
    correctionOrders: orders.filter(
      (order) =>
        (order.corrections && order.corrections.length > 0) ||
        order.status === "معاد للتعديل",
    ),
    cuttingPieces: quantityAtStage("القص"),
    productionPieces: quantityAtStage("الإنتاج والإصلاح"),
    qualityPieces: quantityAtStage("الجودة والتغليف"),
    warehousePieces: quantityAtStage("المستودع"),
    dispatchPieces: quantityAtStage("مع المندوب"),
  };
}

export type ReportSummary = ReturnType<typeof getReportSummary>;
