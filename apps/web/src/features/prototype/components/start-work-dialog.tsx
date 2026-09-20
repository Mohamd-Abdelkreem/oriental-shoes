"use client";

import { BaseDialog } from "./base-dialog";

export function StartWorkDialog({
  open,
  onClose,
  orderId,
  quantity,
  stageName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantity: number;
  stageName: string;
  onConfirm: () => void;
}) {
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={`بدء العمل في ${stageName}`}
      subtitle={`أمر التفصيل: ${orderId} · الكمية المتاحة: ${String(quantity)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            بدء العمل وتغيير الحالة إلى قيد التنفيذ
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          تأكيد إدخال كمية <strong>{quantity} قطعة</strong> على خط العمل في{" "}
          {stageName}.
        </p>
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
          سيتم تحديث سجل الحركة وإشعار المشرف بأن العمل بدأ فعلياً على هذا
          البند.
        </div>
      </div>
    </BaseDialog>
  );
}
