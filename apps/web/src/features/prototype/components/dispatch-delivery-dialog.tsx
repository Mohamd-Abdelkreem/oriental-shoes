"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function DispatchDeliveryDialog({
  open,
  onClose,
  orderId,
  customerName,
  address,
  quantity,
  cartonNumbers,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  customerName: string;
  address: string;
  quantity: number;
  cartonNumbers?: string | undefined;
  onConfirm: (repName?: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تأكيد خروج الطلب للتسليم"
      subtitle={`أمر التفصيل: ${orderId} · مكتمل بالمستودع بنسبة ١٠٠٪`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm(note || undefined);
              onClose();
            }}
          >
            تأكيد الخروج للتسليم
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
        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div>
            العميل: <strong>{customerName}</strong>
          </div>
          <div>
            العنوان: <strong>{address}</strong>
          </div>
          <div>
            الكمية: <strong>{quantity} قطعة</strong>{" "}
            {cartonNumbers ? `(الكراتين: ${cartonNumbers})` : ""}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            ملاحظات التوصيل (اختياري):
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder="مثال: تم إرسال الشحنة مع سيارة التوزيع الأولى..."
            className="oriental-input w-full text-xs"
          />
        </label>
      </div>
    </BaseDialog>
  );
}
