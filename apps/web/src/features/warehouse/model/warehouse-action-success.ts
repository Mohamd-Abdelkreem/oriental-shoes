import type { WarehouseCommandData } from "@template/contracts";
import type { ActionSuccess } from "@/components/toast/use-action-success";

export function warehouseActionSuccess({
  receipt: { operation },
  outcome,
}: WarehouseCommandData): ActionSuccess {
  switch (operation) {
    case "RECEIVE": {
      const received = outcome.orders.reduce(
        (count, order) => count + order.pieceIds.length,
        0,
      );
      const ready = outcome.orders.filter(
        (order) => order.status === "READY_FOR_DELIVERY",
      ).length;
      if (ready === outcome.orders.length)
        return {
          message: `تم استلام ${String(received)} قطعة. الطلبات المستلمة جاهزة للتوصيل`,
          destination: "/warehouse/ready",
        };
      if (ready === 0)
        return {
          message: `تم استلام ${String(received)} قطعة. الطلبات بانتظار باقي القطع`,
          destination: "/warehouse/incomplete",
        };
      return {
        message: `تم استلام ${String(received)} قطعة. ${String(ready)} من الطلبات جاهزة للتوصيل`,
        destination: "/warehouse/activity",
      };
    }
    case "DISPATCH":
      return {
        message: "تم تأكيد خروج الطلبات للتوصيل",
        destination: "/warehouse/out-for-delivery",
      };
    case "CONFIRM_DELIVERY":
      return {
        message: "تم تأكيد تسليم الطلبات للعميل",
        destination: "/warehouse/delivered",
      };
    case "FAIL_DELIVERY":
      return {
        message: "تم تسجيل تعذّر التسليم وعودة الطلبات للمستودع",
        destination: "/warehouse/delivery-failed",
      };
    case "RETRY_DELIVERY":
      return {
        message: "تمت إعادة الطلبات إلى الجاهز للتوصيل",
        destination: "/warehouse/ready",
      };
  }
}
