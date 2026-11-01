import { useState } from "react";
import { useToast } from "@/components/toast";
import { roleUsers } from "@/features/prototype/fixtures/prototype-data";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { getDeptLocation } from "./get-dept-location";
import { getDeptArabicName } from "./get-dept-arabic-name";
import { getNextDept } from "./get-next-dept";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";

type BatchSelection = Pick<
  DepartmentPieceTableProps,
  "rows" | "selectedPieceKeys" | "deptRole"
> & {
  onClearSelection: () => void;
};

export function useDepartmentBatchActions({
  rows: activeTabRows,
  selectedPieceKeys,
  deptRole,
  onClearSelection,
}: BatchSelection) {
  const store = useMvpStore();
  const { toast } = useToast();
  const targetLocation = getDeptLocation(deptRole);
  const deptRoleName = getDeptArabicName(deptRole);
  const currentWorker = roleUsers[deptRole].name || "فني القسم";
  const [deliveryFailedModalOpen, setDeliveryFailedModalOpen] = useState(false);
  const selectedRows = activeTabRows.filter((row) =>
    selectedPieceKeys.includes(row.id),
  );
  const selectedOrderIds = Array.from(
    new Set(selectedRows.map((row) => row.order.id)),
  );
  const openDeliveryFailedDialog = () => {
    setDeliveryFailedModalOpen(true);
  };
  const closeDeliveryFailedDialog = () => {
    setDeliveryFailedModalOpen(false);
  };

  const handleBatchStartWork = () => {
    if (selectedPieceKeys.length === 0) return;
    const readyRows = selectedRows.filter(
      (r) =>
        r.piece.currentLocation === targetLocation &&
        r.piece.deptStatus !== "جاري العمل" &&
        r.piece.deptStatus !== "جاري الفحص" &&
        r.piece.currentLocation !== "لدى الاعتماد بسبب مشكلة",
    );
    if (readyRows.length === 0) {
      toast.error("القطع المحددة غير متواجدة بالقسم لبدء العمل عليها");
      return;
    }
    const pieceIdsByOrder: Record<string, string[]> = {};
    readyRows.forEach((r) => {
      (pieceIdsByOrder[r.order.id] ??= []).push(r.piece.id);
    });

    Object.entries(pieceIdsByOrder).forEach(([orderId, pieceIds]) => {
      store.startPieceWork(orderId, pieceIds, currentWorker, deptRoleName);
    });

    const actionText =
      deptRole === "cutting"
        ? "قص وتفصيل"
        : deptRole === "production"
          ? "تركيب وتجميع"
          : deptRole === "quality"
            ? "فحص"
            : "العمل على";

    toast.info(
      `تم بدء ${actionText} ${String(readyRows.length)} قطع بنجاح بواسطة ${currentWorker}`,
    );
    onClearSelection();
  };

  const handleBatchCompleteTransfer = () => {
    if (selectedPieceKeys.length === 0) return;

    const transferRows = selectedRows.filter(
      (row) =>
        row.piece.currentLocation === targetLocation &&
        (row.piece.deptStatus === "جاري العمل" ||
          row.piece.deptStatus === "جاري الفحص"),
    );
    if (transferRows.length === 0) {
      toast.error("القطع المحددة غير جاهزة للتحويل من هذا القسم");
      return;
    }

    const transferGroups = new Map<
      string,
      { orderId: string; pieceIds: string[]; nextStage: string }
    >();
    transferRows.forEach((row) => {
      const { nextStage } = getNextDept(deptRole);
      const groupKey = row.order.id + ":" + nextStage;
      const group = transferGroups.get(groupKey);
      if (group) {
        group.pieceIds.push(row.piece.id);
      } else {
        transferGroups.set(groupKey, {
          orderId: row.order.id,
          pieceIds: [row.piece.id],
          nextStage,
        });
      }
    });

    transferGroups.forEach(({ orderId, pieceIds, nextStage }) => {
      store.completeAndTransferPieces(
        orderId,
        pieceIds,
        nextStage,
        "إنجاز من " + deptRoleName,
      );
    });

    const completionMessage =
      deptRole === "cutting"
        ? `تم إنهاء قص ${String(transferRows.length)} قطع وتحويلها لقسم الإنتاج بنجاح`
        : deptRole === "production"
          ? `تم إنهاء تركيب ${String(transferRows.length)} قطع وتحويلها لقسم الجودة بنجاح`
          : deptRole === "quality"
            ? `تم قبول ${String(transferRows.length)} قطع وإرسالها للمستودع بنجاح`
            : `تم إنجاز ${String(transferRows.length)} قطع وتحويلها بنجاح`;

    toast.success(completionMessage);
    onClearSelection();
  };

  const handleBatchConfirmDelivered = () => {
    if (selectedRows.length === 0) return;
    selectedOrderIds.forEach((orderId) => {
      store.confirmOrderDelivery(orderId);
      store.confirmDelivered(orderId, "مندوب التوصيل");
    });
    toast.success(
      `تم تأكيد تسليم ${String(selectedPieceKeys.length)} قطع حذاء للعميل بنجاح وإغلاق الطلب`,
    );
    onClearSelection();
  };

  const handleBatchDeliveryFailed = (reason: string) => {
    if (selectedRows.length === 0) return;
    selectedOrderIds.forEach((orderId) => {
      store.recordDeliveryFailed(orderId, reason, currentWorker);
    });
    toast.error(
      `تم تسجيل تعذر التسليم لعدد ${String(selectedOrderIds.length)} طلب وتحويلها إلى قسم "تعذر التسليم"`,
    );
    onClearSelection();
    closeDeliveryFailedDialog();
  };

  const handleBatchDispatch = () => {
    if (selectedRows.length === 0) return;
    selectedOrderIds.forEach((orderId) => {
      store.dispatchOrder(orderId, "مندوب التوصيل");
      store.dispatchDelivery(orderId, "مسؤول المستودع", "مندوب التوصيل");
    });
    toast.success(
      `تم تجهيز وإرسال ${String(selectedPieceKeys.length)} قطع مع مندوب التوصيل بنجاح`,
    );
    onClearSelection();
  };

  const handleBatchWarehouseReceipt = () => {
    if (selectedRows.length === 0) return;
    selectedRows.forEach((row) => {
      store.receiveWarehousePiece(row.order.id, row.piece.id);
    });
    selectedOrderIds.forEach((orderId) => {
      const order = store.orders.find((o) => o.id === orderId);
      const segment = order?.segments.find(
        (s) => s.stage === "المستودع" && s.state === "بانتظار الاستلام",
      );
      if (segment) {
        store.confirmWarehouseReceipt(orderId, segment.id, "سارة محمد");
      }
    });
    toast.success(
      `تم تأكيد استلام ${String(selectedPieceKeys.length)} قطع في المستودع بنجاح`,
    );
    onClearSelection();
  };

  return {
    selectedOrderIds,
    deliveryFailedModalOpen,
    openDeliveryFailedDialog,
    closeDeliveryFailedDialog,
    handleBatchStartWork,
    handleBatchCompleteTransfer,
    handleBatchConfirmDelivered,
    handleBatchDeliveryFailed,
    handleBatchDispatch,
    handleBatchWarehouseReceipt,
  };
}
