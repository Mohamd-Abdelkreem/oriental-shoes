"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function ProductionSplitDialog({
  open,
  onClose,
  orderId,
  completedQty,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  completedQty: number;
  onConfirm: (
    directQty: number,
    specialQty: number,
    specialInstruction: string,
  ) => void;
}) {
  const [directQty, setDirectQty] = useState(completedQty);
  const [specialQty, setSpecialQty] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (directQty + specialQty !== completedQty) {
      setError(
        `مجموع الكميات (${String(directQty + specialQty)}) يجب أن يساوي المنجز المتاح (${String(completedQty)})`,
      );
      return;
    }
    if (specialQty > 0 && !instruction.trim()) {
      setError(
        "يرجى كتابة تعليمة العملية الخاصة المطلوبة (تطريز، نقش، حفر، إلخ)",
      );
      return;
    }
    setError("");
    onConfirm(directQty, specialQty, instruction);
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="توجيه وتوزيع الكمية المنجزة من الإنتاج"
      subtitle={`أمر التفصيل: ${orderId} · الكمية المنجزة الجاهزة للتوجيه: ${String(completedQty)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={handleConfirm}
          >
            تأكيد التوجيه والإرسال للأقسام
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
        <p className="text-xs text-slate-500">
          يمكن إرسال الدفعة كاملة للجودة والتغليف، أو تجزئتها بإرسال جزء لعملية
          خاصة (تطريز/نقش) وجزء مباشرة للجودة.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              إلى الجودة والتغليف مباشرة:
            </span>
            <input
              type="number"
              min={0}
              max={completedQty}
              value={directQty}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDirectQty(val);
                setSpecialQty(Math.max(0, completedQty - val));
                setError("");
              }}
              className="oriental-input w-full"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              إلى العمليات الخاصة (تطريز/نقش):
            </span>
            <input
              type="number"
              min={0}
              max={completedQty}
              value={specialQty}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSpecialQty(val);
                setDirectQty(Math.max(0, completedQty - val));
                setError("");
              }}
              className="oriental-input w-full"
            />
          </label>
        </div>

        {specialQty > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              تعليمة العملية الخاصة المطلوبة{" "}
              <strong className="text-rose-600">*</strong>:
            </span>
            <textarea
              rows={2}
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setError("");
              }}
              placeholder="مثال: تطريز الاسم بالخيط الذهبي على الجانب الخارجي للحذاء..."
              className="oriental-textarea w-full text-xs"
            />
          </label>
        )}

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
          <div className="flex justify-between">
            <span>الكمية المتجهة للجودة:</span>
            <strong>{directQty} قطعة</strong>
          </div>
          <div className="flex justify-between">
            <span>الكمية المتجهة للعمليات الخاصة:</span>
            <strong>{specialQty} قطعة</strong>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
