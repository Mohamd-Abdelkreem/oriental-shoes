import type {
  ManufacturingCommandData,
  QualityCommandData,
} from "@template/contracts";

export function manufacturingActionSuccessMessage({
  receipt: { department, operation },
  outcome,
}: ManufacturingCommandData): string {
  const count = outcome.orders.reduce(
    (total, order) => total + order.pieces.length,
    0,
  );
  const pieces = count === 1 ? "القطعة المحددة" : `${String(count)} قطعة`;
  switch (operation) {
    case "RECEIVE_AND_START":
      return `تم استلام وبدء العمل على ${pieces}`;
    case "CONTINUE":
      return `تم تسجيل متابعة العمل على ${pieces}`;
    case "COMPLETE_TRANSFER":
      return `تم إتمام وتحويل ${pieces} إلى ${department === "CUTTING" ? "الإنتاج" : "الجودة"}`;
  }
}

export function qualityActionSuccessMessage({
  receipt: { operation },
  outcome,
}: QualityCommandData): string {
  const pieces = outcome.orders.flatMap((order) => order.pieces);
  const count = pieces.length;
  switch (operation) {
    case "RECEIVE_AND_START":
      return `تم استلام وبدء فحص ${String(count)} قطعة`;
    case "CONTINUE":
      return `تم تسجيل متابعة فحص ${String(count)} قطعة`;
    case "REPORT_ISSUES":
      return `تم تسجيل المشكلة وإحالة ${String(count)} قطعة للاعتماد`;
    case "INSPECT": {
      const accepted = pieces.filter(
        (piece) => piece.decision === "ACCEPT",
      ).length;
      const returned = count - accepted;
      if (returned === 0)
        return `تم قبول وتحويل ${String(accepted)} قطعة إلى المستودع`;
      if (accepted === 0) return `تم إرجاع ${String(returned)} قطعة للتصحيح`;
      return `تم قبول ${String(accepted)} قطعة وإرجاع ${String(returned)} قطعة للتصحيح`;
    }
  }
}
