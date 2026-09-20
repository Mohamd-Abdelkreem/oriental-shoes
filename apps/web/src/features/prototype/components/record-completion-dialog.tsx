"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function RecordCompletionDialog({
  open,
  onClose,
  orderId,
  availableQty,
  stageName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  availableQty: number;
  stageName: string;
  onConfirm: (completedQty: number) => void;
}) {
  const [qty, setQty] = useState(availableQty);
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (qty <= 0 || qty > availableQty) {
      setError(`يرجى تحديد كمية صحيحة بين ١ و ${String(availableQty)}`);
      return;
    }
    setError("");
    onConfirm(qty);
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={`تسجيل الكمية المنجزة في ${stageName}`}
      subtitle={`أمر التفصيل: ${orderId} · الكمية الحالية: ${String(availableQty)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={handleConfirm}
          >
            تسجيل إنجاز {qty} قطعة
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
        <label className="block">
          <span className="mb-1 block font-medium text-slate-800">
            الكمية المنجزة الفعلية:
          </span>
          <input
            type="number"
            min={1}
            max={availableQty}
            value={qty}
            onChange={(e) => {
              setQty(Number(e.target.value));
              setError("");
            }}
            className="oriental-input w-full"
          />
        </label>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span>المنجز المراد تسجيله:</span>
            <strong>{qty} قطعة</strong>
          </div>
          <div className="flex justify-between">
            <span>المتبقي قيد التنفيذ في القسم:</span>
            <strong className="text-amber-700">
              {Math.max(0, availableQty - qty)} قطعة
            </strong>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
