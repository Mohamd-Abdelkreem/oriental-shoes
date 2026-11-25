import type { WarehouseCommandData } from "@template/contracts";

export function warehouseActionSuccessMessage({
  receipt: { operation },
  outcome,
}: WarehouseCommandData): string {
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
        return `تم استلام ${String(received)} قطعة. الطلبات المستلمة جاهزة للتوصيل`;
      if (ready === 0)
        return `تم استلام ${String(received)} قطعة. الطلبات بانتظار باقي القطع`;
      return `تم استلام ${String(received)} قطعة. ${String(ready)} من الطلبات جاهزة للتوصيل`;
    }
    case "DISPATCH":
      return "تم تأكيد خروج الطلبات للتوصيل";
    case "CONFIRM_DELIVERY":
      return "تم تأكيد تسليم الطلبات للعميل";
    case "FAIL_DELIVERY":
      return "تم تسجيل تعذّر التسليم وعودة الطلبات للمستودع";
    case "RETRY_DELIVERY":
      return "تمت إعادة الطلبات إلى الجاهز للتوصيل";
  }
}
