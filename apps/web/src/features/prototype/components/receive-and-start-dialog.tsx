"use client";

import { BaseDialog } from "./base-dialog";

export function ReceiveAndStartDialog({
  open,
  onClose,
  orderId,
  quantity,
  deptName,
  department,
  actionLabel,
  actionTitle,
  assignedWorker,
  defaultWorker,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantity: number;
  deptName?: string | undefined;
  department?: string | undefined;
  actionLabel?: string | undefined;
  actionTitle?: string | undefined;
  assignedWorker?: string | undefined;
  defaultWorker?: string | undefined;
  onConfirm: (worker: string) => void;
}) {
  const finalDept = deptName || department || "القسم";
  const finalAction = actionLabel || actionTitle || "استلام وبدء العمل";
  const finalWorker = assignedWorker || defaultWorker || "الموظف المسؤول";

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={finalAction}
      subtitle={`أمر التفصيل: ${orderId} · الكمية: ${String(quantity)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm(finalWorker);
              onClose();
            }}
          >
            {finalAction} الآن
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
          تأكيد استلام كمية <strong>{quantity} قطعة</strong> وبدء تشغيلها فوراً
          في <strong>{finalDept}</strong>.
        </p>
        <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
          <div>
            ✓ سيتم تسجيل استلام الكمية وبدء العمل مباشرة على خط التشغيل.
          </div>
          <div>
            ✓ الموظف المنفذ: <strong>{finalWorker}</strong> (سيصبح العامل المعين
            لهذا الجزء).
          </div>
          <div>
            ✓ ستتحول حالة الكمية فوراً إلى: <strong>قيد التنفيذ</strong> في قسم{" "}
            {finalDept}.
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
