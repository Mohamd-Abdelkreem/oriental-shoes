"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function RetryDeliveryDialog({
  open,
  onClose,
  orderId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onConfirm: (newDate?: string, notes?: string) => void;
}) {
  const [newDate, setNewDate] = useState("14 سبتمبر 2026");
  const [notes, setNotes] = useState("");

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="إعادة جدولة الشحنة لمحاولة تسليم جديدة"
      subtitle={`أمر التفصيل: ${orderId}`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-amber"
            onClick={() => {
              onConfirm(newDate, notes);
              onClose();
            }}
          >
            تأكيد إعادة الطلب للجاهز للتسليم
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
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
          سيتم إعادة الطلب فوراً إلى قائمة{" "}
          <strong>&quot;جاهز للتسليم (١٠٠٪)&quot;</strong> مع توثيق محاولة
          التسليم السابقة في السجل.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            موعد التسليم المتوقع:
          </span>
          <input
            type="text"
            value={newDate}
            onChange={(e) => {
              setNewDate(e.target.value);
            }}
            className="oriental-input w-full text-xs"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            ملاحظات إضافية لمحاولة التسليم (اختياري):
          </span>
          <input
            type="text"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            placeholder="مثال: تم التنسيق مع العميل وسيتواجد بعد صلاة العصر..."
            className="oriental-input w-full text-xs"
          />
        </label>
      </div>
    </BaseDialog>
  );
}
