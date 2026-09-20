"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function AdminReopenDialog({
  open,
  onClose,
  orderId,
  currentStatus,
  approvalDate,
  activeReqQty,
  warehouseQty,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  currentStatus: string;
  approvalDate: string;
  activeReqQty: number;
  warehouseQty: number;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError("سبب إعادة فتح أمر التفصيل إلزامي ومطلوب لتوثيق السجل الإداري");
      return;
    }
    setError("");
    onConfirm(reason.trim());
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="إعادة فتح أمر التفصيل (صلاحية الإدارة)"
      subtitle={`أمر التفصيل: ${orderId} · الحالة الحالية: ${currentStatus}`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-amber"
            onClick={handleConfirm}
          >
            تأكيد إعادة فتح الأمر إدارياً
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
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>تحذير رقابي:</strong>
          <p>
            إعادة فتح أمر التفصيل المعتمد يتيح تعديل الحقول المصرح بها للإدارة
            العامة مع الحفاظ التام على كامل سجل العمليات والكميات المنجزة في
            المصنع.
          </p>
          <p>
            لا يُسمح بتخفيض الكمية عن الكميات المجهزة أو المنجزة؛ في حال الحاجة
            لتخفيض الكمية يُرجى استخدام إجراء الإلغاء الإداري.
          </p>
        </div>

        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">رقم أمر التفصيل:</span>
            <strong className="font-mono">{orderId}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">الحالة الإجمالية الحالية:</span>
            <span className="font-semibold">{currentStatus}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">تاريخ الاعتماد / الإنشاء:</span>
            <span>{approvalDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">الكمية النشطة المطلوبة:</span>
            <strong>{activeReqQty} قطعة</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">الكمية المنجزة بالمستودع:</span>
            <span>{warehouseQty} قطعة</span>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            سبب إعادة فتح أمر التفصيل{" "}
            <span className="text-rose-600">* (إلزامي)</span>:
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            placeholder="اكتب بالتفصيل سبب إعادة فتح أمر التفصيل والتعديل المطلوب..."
            className="oriental-textarea w-full text-xs"
            required
          />
        </label>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </BaseDialog>
  );
}
