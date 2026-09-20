"use client";

import { useState } from "react";
import { BaseDialog } from "./base-dialog";

export function QualityInspectionDialog({
  open,
  onClose,
  orderId,
  availableQty,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  availableQty: number;
  onConfirm: (data: {
    inspectedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    responsibleDept?:
      "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة" | undefined;
    reason?: string | undefined;
    instructions?: string | undefined;
    cartonCount?: string | undefined;
    cartonNumbers?: string | undefined;
    note?: string | undefined;
  }) => void;
}) {
  const [inspectedQty, setInspectedQty] = useState(availableQty);
  const [acceptedQty, setAcceptedQty] = useState(availableQty);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [responsibleDept, setResponsibleDept] = useState<
    "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة"
  >("الإنتاج والإصلاح");
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [cartonCount, setCartonCount] = useState("١");
  const [cartonNumbers, setCartonNumbers] = useState("C-01");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (inspectedQty <= 0 || inspectedQty > availableQty) {
      setError(`الكمية المفحوصة يجب أن تكون بين ١ و ${String(availableQty)}`);
      return;
    }
    if (acceptedQty + rejectedQty !== inspectedQty) {
      setError(
        `مجموع المقبول (${String(acceptedQty)}) والمرفوض (${String(rejectedQty)}) يجب أن يساوي المفحوص (${String(inspectedQty)})`,
      );
      return;
    }
    if (rejectedQty > 0 && (!reason.trim() || !instructions.trim())) {
      setError(
        "عند وجود كمية غير مطابقة، يجب كتابة سبب الرفض وتعليمات التصحيح بدقة",
      );
      return;
    }
    setError("");
    onConfirm({
      inspectedQty,
      acceptedQty,
      rejectedQty,
      responsibleDept: rejectedQty > 0 ? responsibleDept : undefined,
      reason: rejectedQty > 0 ? reason : undefined,
      instructions: rejectedQty > 0 ? instructions : undefined,
      cartonCount,
      cartonNumbers,
      note,
    });
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="فحص الجودة وتسجيل النتيجة والتغليف"
      subtitle={`أمر التفصيل: ${orderId} · الكمية المتاحة للفحص: ${String(availableQty)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={handleConfirm}
          >
            حفظ نتيجة الفحص واعتماد الإرسال
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
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm text-slate-700">
        {/* Quantity Breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              الكمية المفحوصة:
            </span>
            <input
              type="number"
              min={1}
              max={availableQty}
              value={inspectedQty}
              onChange={(e) => {
                const val = Number(e.target.value);
                setInspectedQty(val);
                setAcceptedQty(val);
                setRejectedQty(0);
                setError("");
              }}
              className="oriental-input w-full"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-emerald-700">
              الكمية المقبولة:
            </span>
            <input
              type="number"
              min={0}
              max={inspectedQty}
              value={acceptedQty}
              onChange={(e) => {
                const val = Number(e.target.value);
                setAcceptedQty(val);
                setRejectedQty(Math.max(0, inspectedQty - val));
                setError("");
              }}
              className="oriental-input w-full border-emerald-300"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-rose-700">
              غير المطابق (مرفوض):
            </span>
            <input
              type="number"
              min={0}
              max={inspectedQty}
              value={rejectedQty}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRejectedQty(val);
                setAcceptedQty(Math.max(0, inspectedQty - val));
                setError("");
              }}
              className="oriental-input w-full border-rose-300"
            />
          </label>
        </div>

        {/* Packaging Information for Accepted */}
        {acceptedQty > 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <span className="block text-xs font-bold text-emerald-900">
              بيانات التغليف للكمية المقبولة ({acceptedQty} قطعة):
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-xs text-slate-600">
                  عدد الكراتين:
                </span>
                <input
                  type="text"
                  value={cartonCount}
                  onChange={(e) => {
                    setCartonCount(e.target.value);
                  }}
                  placeholder="مثال: ٢"
                  className="oriental-input w-full text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-xs text-slate-600">
                  أرقام الكراتين:
                </span>
                <input
                  type="text"
                  value={cartonNumbers}
                  onChange={(e) => {
                    setCartonNumbers(e.target.value);
                  }}
                  placeholder="مثال: C-12, C-13"
                  className="oriental-input w-full text-xs"
                />
              </label>
            </div>
          </div>
        )}

        {/* Rejection Details if rejectedQty > 0 */}
        {rejectedQty > 0 && (
          <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <span className="block text-xs font-bold text-rose-900">
              بيانات إعادة الكمية للتصحيح ({rejectedQty} قطعة):
            </span>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">
                القسم المسؤول عن العيب:
              </span>
              <select
                value={responsibleDept}
                onChange={(e) => {
                  setResponsibleDept(
                    e.target.value as
                      "القص" | "الإنتاج والإصلاح" | "العمليات الخاصة",
                  );
                }}
                className="oriental-input w-full text-xs"
              >
                <option value="الإنتاج والإصلاح">
                  الإنتاج والإصلاح (تركيب وجه / نعل)
                </option>
                <option value="القص">القص (أبعاد الجلد / زوايا القص)</option>
                <option value="العمليات الخاصة">
                  العمليات الخاصة (تطريز / نقش)
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">
                سبب الرفض وعدم المطابقة *:
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
                placeholder="مثال: انحراف حافة القص بمقدار ٢ مم / عدم ثبات غراء النعل..."
                className="oriental-input w-full text-xs"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">
                تعليمات التصحيح المطلوبة *:
              </span>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => {
                  setInstructions(e.target.value);
                  setError("");
                }}
                placeholder="مثال: إعادة تسوية الحافة وتوحيد المقاس وفق عينة المعرض..."
                className="oriental-textarea w-full text-xs"
              />
            </label>
          </div>
        )}

        {/* Quality Free Note */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            ملاحظات فاحص الجودة (اختياري):
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder="ملاحظات توثيقية إضافية..."
            className="oriental-input w-full text-xs"
          />
        </label>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </BaseDialog>
  );
}
