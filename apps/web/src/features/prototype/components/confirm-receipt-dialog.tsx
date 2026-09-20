"use client";

import { BaseDialog } from "./base-dialog";

export function ConfirmReceiptDialog({
  open,
  onClose,
  orderId,
  quantity,
  sourceDept,
  currentDept,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantity: number;
  sourceDept: string;
  currentDept: string;
  onConfirm: () => void;
}) {
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تأكيد استلام الكمية الواردة"
      subtitle={`أمر التفصيل: ${orderId} · الكمية الواردة: ${String(quantity)} قطعة`}
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
            تأكيد استلام الكمية الآن
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
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          هل تم التحقق من استلام <strong>{quantity} قطعة</strong> واردة من قسم{" "}
          <strong>{sourceDept}</strong> إلى قسم <strong>{currentDept}</strong>؟
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          ✓ سيتم نقل حالة الكمية من &quot;بانتظار الاستلام&quot; إلى
          &quot;بانتظار بدء العمل&quot; في طابور القسم.
        </div>
      </div>
    </BaseDialog>
  );
}
