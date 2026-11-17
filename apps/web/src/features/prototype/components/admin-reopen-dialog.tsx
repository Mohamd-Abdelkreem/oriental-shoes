"use client";

import { useId } from "react";
import type { AdminReopenDialogProps } from "@/features/administration/model/administration-view.model";
import { BaseDialog } from "./base-dialog";

const fields = [
  { name: "generalNotes", label: "الملاحظات العامة" },
  { name: "customerName", label: "اسم العميل" },
  { name: "customerPhone", label: "رقم الهاتف" },
  { name: "customerEmail", label: "البريد الإلكتروني" },
  { name: "customerAddress", label: "عنوان التسليم" },
  { name: "reason", label: "سبب التصحيح (إلزامي)" },
] as const;
export function AdminReopenDialog({
  open,
  onClose,
  review,
  form,
  preparing,
  pending,
  reviewRequired,
  failure,
  onReviewCurrent,
  onConfirm,
  context,
}: AdminReopenDialogProps) {
  const formId = useId(),
    disabled = preparing || pending;
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="تصحيح بيانات أمر التفصيل (صلاحية الإدارة)"
      subtitle={`أمر التفصيل: ${context.businessNumber} · الحالة الحالية: ${context.statusLabel}`}
      actions={
        <>
          <button
            type="submit"
            form={formId}
            disabled={disabled || reviewRequired || review === null}
            className="btn-pill btn-amber"
          >
            حفظ التصحيح
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
      <form
        id={formId}
        onSubmit={(event) => {
          void form.handleSubmit(onConfirm)(event);
        }}
        className="space-y-4 text-sm text-slate-700"
      >
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>تصحيح بيانات فقط:</strong>
          <p>
            تعديل الملاحظات وبيانات الاتصال وعنوان التسليم يحفظ حالة الطلب وكامل
            سجل العمل والتسليم والمدفوع.
          </p>
        </div>
        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <p>رقم أمر التفصيل: {context.businessNumber}</p>
          <p>الحالة الحالية: {context.statusLabel}</p>
          <p>تاريخ الإنشاء: {context.createdAt}</p>
          <p>
            الكمية النشطة المطلوبة: {context.activePieces} — المنجز بالمستودع:{" "}
            {context.receivedPieces}
          </p>
        </div>
        {fields.map(({ name, label }) => (
          <label key={name} className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              {label}:
            </span>
            <textarea
              rows={name === "generalNotes" || name === "reason" ? 3 : 1}
              disabled={disabled}
              {...form.register(name)}
              className="oriental-textarea w-full text-xs"
            />
            {name !== "reason" && review !== null && (
              <small className="block text-slate-500">
                القيمة عند المراجعة: {review.baseline[name] ?? "غير متوفرة"}
              </small>
            )}
            {form.formState.errors[name]?.message && (
              <span role="alert" className="text-xs font-medium text-rose-600">
                {form.formState.errors[name].message}
              </span>
            )}
          </label>
        ))}
        {reviewRequired && (
          <div role="alert">
            تغيرت البيانات؛ راجع القيم الحالية قبل الحفظ.{" "}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                void onReviewCurrent();
              }}
            >
              مراجعة البيانات الحالية
            </button>
          </div>
        )}
        {preparing && <p role="status">جارٍ مراجعة البيانات الحالية…</p>}
        {pending && (
          <p role="status">تابع نتيجة الحفظ الأصلي دون إعادة الإرسال.</p>
        )}
        {failure && <p role="alert">{failure}</p>}
      </form>
    </BaseDialog>
  );
}
