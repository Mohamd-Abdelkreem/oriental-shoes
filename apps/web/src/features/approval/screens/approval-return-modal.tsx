"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useMvpStore } from "@/features/prototype/state/mvp-store";

export function ApprovalReturnModal({
  orderId,
  onClose,
  onReturned,
}: {
  orderId: string;
  onClose: () => void;
  onReturned: () => void;
}) {
  const store = useMvpStore();
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [error, setError] = useState("");

  const handleReturn = () => {
    if (!returnReason.trim()) {
      setError("سبب الإعادة إلزامي لتوضيح متطلبات التعديل لمندوب المبيعات");
      return;
    }

    const fullReason = returnNotes
      ? returnReason.trim() + " · ملاحظات إضافية: " + returnNotes.trim()
      : returnReason.trim();

    store.returnOrderToSales(orderId, fullReason, "خالد منصور");
    onReturned();
  };

  return (
    <div
      className="oriental-modal-backdrop"
      onClick={() => {
        onClose();
      }}
    >
      <div
        className="oriental-modal-container max-w-md"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title">
            إعادة أمر التفصيل للمبيعات للتعديل
          </h2>
          <button
            type="button"
            className="oriental-modal-close"
            onClick={() => {
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm text-slate-700">
          <p className="text-xs text-slate-500">
            يجب تحديد سبب الإعادة بدقة حتى يظهر لمندوب المبيعات في قائمة الطلبات
            المعادة للتصحيح.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              سبب الإعادة الإلزامي <strong className="text-rose-600">*</strong>:
            </span>
            <select
              value={returnReason}
              onChange={(e) => {
                setReturnReason(e.target.value);
                setError("");
              }}
              className="oriental-input w-full text-xs"
            >
              <option value="">-- اختر سبب الإعادة الرئيسي --</option>
              <option value="لون التطعيم غير محدد بدقة في بنود الجلد">
                لون التطعيم غير محدد بدقة في بنود الجلد
              </option>
              <option value="المقاس أو بيانات القاعدة غير متطابقة مع الموديل">
                المقاس أو بيانات القاعدة غير متطابقة مع الموديل
              </option>
              <option value="نقص في مواصفات وجه الحذاء وتركيب الخيوط">
                نقص في مواصفات وجه الحذاء وتركيب الخيوط
              </option>
              <option value="رقم لون الأرضية أو الموديل غير مسجل في الكتالوج">
                رقم لون الأرضية أو الموديل غير مسجل في الكتالوج
              </option>
              <option value="تعليمات طلب الإصلاح تحتاج تفصيلاً فنياً أوضح">
                تعليمات طلب الإصلاح تحتاج تفصيلاً فنياً أوضح
              </option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              تفاصيل وملاحظات إضافية للمبيعات (اختياري):
            </span>
            <textarea
              rows={2}
              value={returnNotes}
              onChange={(e) => {
                setReturnNotes(e.target.value);
              }}
              placeholder="حدد الأسطر أو البنود المحددة المطلوب تصحيحها..."
              className="oriental-textarea w-full text-xs"
            />
          </label>

          {error && (
            <p className="text-xs font-medium text-rose-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              className="btn-pill btn-rose"
              onClick={handleReturn}
            >
              تأكيد الإعادة للمبيعات
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                onClose();
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
