"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BaseDialog } from "./base-dialog";

const quickDeliveryFailureReasons = [
  "العميل لم يجب على الاتصال",
  "الهاتف مغلق طوال اليوم",
  "العنوان غير واضح وتعذر الوصول",
  "طلب العميل تأجيل موعد الاستلام",
  "العميل غير متواجد بالموقع",
];

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
  const [reason, setReason] = useState("");

  const confirmDeliveryFailure = () => {
    const deliveryFailureReason =
      reason.trim() || "تعذر تسليم الطلب للعميل مع المندوب";
    onConfirm(deliveryFailureReason);
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تسجيل مشكلة في التسليم (تعذر التسليم)"
      subtitle={
        orderId.includes("،")
          ? `الطلبات المحددة: ${orderId}`
          : `أمر التفصيل: ${orderId}`
      }
      actions={
        <>
          <button
            type="button"
            className="btn-pill bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700"
            onClick={confirmDeliveryFailure}
          >
            تأكيد تسجيل المشكلة ونقل الطلب لتعذر التسليم
          </button>
          <button
            type="button"
            className="btn-pill btn-outline text-xs"
            onClick={onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
          <AlertTriangle size={16} className="shrink-0 text-rose-600" />
          <span>
            سيتم نقل الطلبات المحددة إلى قسم{" "}
            <strong>&quot;تعذر التسليم&quot;</strong> لإعادة جدولتها وتحديد موعد
            خروج لاحق.
          </span>
        </div>

        <label className="block space-y-1.5">
          <span className="block text-xs font-bold text-slate-800">
            سبب المشكلة وتفاصيل تعذر التسليم{" "}
            <span className="text-rose-500">*</span>:
          </span>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            rows={3}
            placeholder="اكتب هنا تفاصيل سبب عدم التسليم (مثلاً: العميل لم يرد على اتصالات المندوب، أو طلب التأجيل للغد...)"
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-hidden"
            autoFocus
          />
        </label>

        <div>
          <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">
            أو اختر سبباً سريعاً لتعبئة الحقل:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {quickDeliveryFailureReasons.map((reasonOption) => (
              <button
                key={reasonOption}
                type="button"
                onClick={() => {
                  setReason(reasonOption);
                }}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {reasonOption}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
