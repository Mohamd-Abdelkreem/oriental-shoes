import type {
  ManufacturingCommandData,
  QualityCommandData,
} from "@template/contracts";
import type { ActionSuccess } from "@/components/toast/use-action-success";

export function manufacturingActionSuccess({
  receipt: { department, operation },
  outcome,
}: ManufacturingCommandData): ActionSuccess {
  const section = department === "CUTTING" ? "/cutting" : "/production";
  const count = outcome.orders.reduce(
    (total, order) => total + order.pieces.length,
    0,
  );
  const pieces = count === 1 ? "القطعة المحددة" : `${String(count)} قطعة`;
  switch (operation) {
    case "RECEIVE_AND_START":
      return {
        message: `تم استلام وبدء العمل على ${pieces}`,
        destination: `${section}/in-progress`,
      };
    case "CONTINUE":
      return {
        message: `تم تسجيل متابعة العمل على ${pieces}`,
        destination: `${section}/in-progress`,
      };
    case "COMPLETE_TRANSFER":
      return {
        message: `تم إتمام وتحويل ${pieces} إلى ${department === "CUTTING" ? "الإنتاج" : "الجودة"}`,
        destination: `${section}/completed`,
      };
  }
}

export function qualityActionSuccess({
  receipt: { operation },
  outcome,
}: QualityCommandData): ActionSuccess {
  const pieces = outcome.orders.flatMap((order) => order.pieces);
  const count = pieces.length;
  switch (operation) {
    case "RECEIVE_AND_START":
      return {
        message: `تم استلام وبدء فحص ${String(count)} قطعة`,
        destination: "/quality/inspection",
      };
    case "CONTINUE":
      return {
        message: `تم تسجيل متابعة فحص ${String(count)} قطعة`,
        destination: "/quality/inspection",
      };
    case "REPORT_ISSUES":
      return {
        message: `تم تسجيل المشكلة وإحالة ${String(count)} قطعة للاعتماد`,
        destination: "/quality/activity",
      };
    case "INSPECT": {
      const accepted = pieces.filter(
        (piece) => piece.decision === "ACCEPT",
      ).length;
      const returned = count - accepted;
      if (returned === 0)
        return {
          message: `تم قبول وتحويل ${String(accepted)} قطعة إلى المستودع`,
          destination: "/quality/accepted",
        };
      if (accepted === 0)
        return {
          message: `تم إرجاع ${String(returned)} قطعة للتصحيح`,
          destination: "/quality/corrections",
        };
      return {
        message: `تم قبول ${String(accepted)} قطعة وإرجاع ${String(returned)} قطعة للتصحيح`,
        destination: "/quality/activity",
      };
    }
  }
}
