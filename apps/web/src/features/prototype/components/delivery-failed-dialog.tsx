"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function DeliveryFailedDialog({
  open,
  onClose,
  orderId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("العميل لم يجب على الاتصال");

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تسجيل تعذر تسليم الطلب"
      subtitle={`أمر التفصيل: ${orderId}`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-rose"
            onClick={() => {
              onConfirm(reason);
              onClose();
            }}
          >
            تسجيل تعذر التسليم
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            سبب تعذر التسليم:
          </span>
          <select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            className="oriental-input w-full text-xs"
          >
            <option value="العميل لم يجب على الاتصال">
              العميل لم يجب على الاتصال
            </option>
            <option value="الهاتف مغلق طوال اليوم">
              الهاتف مغلق طوال اليوم
            </option>
            <option value="العنوان غير واضح وتعذر الوصول">
              العنوان غير واضح وتعذر الوصول
            </option>
            <option value="طلب العميل تأجيل موعد الاستلام">
              طلب العميل تأجيل موعد الاستلام
            </option>
          </select>
        </label>

        <p className="text-xs text-slate-500">
          سيتم حفظ الطلب في قائمة &quot;تعذر التسليم&quot; مع إتاحة إعادة جدولته
          فور التواصل مع العميل.
        </p>
      </div>
    </BaseDialog>
  );
}
