"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function ConfirmDeliveryDialog({
  open,
  onClose,
  orderId,
  customerName,
  quantity,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  customerName: string;
  quantity?: number | undefined;
  onConfirm: (data: {
    recipientName: string;
    deliveryTime: string;
    notes: string;
  }) => void;
}) {
  const [recipientName, setRecipientName] = useState(customerName);
  const [deliveryTime, setDeliveryTime] = useState("اليوم · ١٤:٣٠");
  const [notes, setNotes] = useState("");

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تأكيد تسليم الشحنة للعميل بنجاح"
      subtitle={`أمر التفصيل: ${orderId} · إجمالي القطع المسلمة: ${String(quantity ?? "")} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm({ recipientName, deliveryTime, notes });
              onClose();
            }}
          >
            تأكيد التسليم بنجاح وإغلاق الطلب
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
      <div className="space-y-3.5 text-sm text-slate-700">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          تأكيد استلام العميل لجميع قطع أمر التفصيل بنجاح، وتحويل حالة الطلب إلى
          &quot;مكتمل ومسلم&quot;.
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            اسم المستلم الفعلي:
          </span>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => {
              setRecipientName(e.target.value);
            }}
            className="oriental-input w-full text-xs"
            placeholder="اسم العميل أو من ينوب عنه..."
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            وقت وتاريخ التسليم:
          </span>
          <input
            type="text"
            value={deliveryTime}
            onChange={(e) => {
              setDeliveryTime(e.target.value);
            }}
            className="oriental-input w-full text-xs"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            ملاحظات التسليم (اختياري):
          </span>
          <input
            type="text"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            placeholder="تم التسليم للعميل شخصياً واستيفاء جميع الشروط..."
            className="oriental-input w-full text-xs"
          />
        </label>
      </div>
    </BaseDialog>
  );
}
