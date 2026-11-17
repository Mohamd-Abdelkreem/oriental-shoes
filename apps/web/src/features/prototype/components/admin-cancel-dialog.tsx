"use client";

import { useId } from "react";
import { z } from "zod";
import type { AdminCancelDialogProps } from "@/features/administration/model/administration-view.model";
import {
  captureAdministrationCancellation,
  previewAdministrationCancellation,
} from "@/features/administration/model/administration-form.model";
import { BaseDialog } from "./base-dialog";

const stageLabels = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
  CANCELLED: "ملغاة",
  DELIVERED: "مسلمة",
};
export function AdminCancelDialog({
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
}: AdminCancelDialogProps) {
  const formId = useId(),
    values = form.watch(),
    disabled = preparing || pending;
  let selected: ReturnType<typeof captureAdministrationCancellation> | null =
    null;
  let money: ReturnType<typeof previewAdministrationCancellation> | null = null;
  try {
    if (review !== null) {
      selected = captureAdministrationCancellation(review.detail, {
        ...values,
        reason: "",
      });
      money = previewAdministrationCancellation(
        review.detail,
        selected.pieceIds,
      );
    }
  } catch (error: unknown) {
    if (!(error instanceof z.ZodError)) throw error;
  }
  const counts = review?.detail.order.counts;
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="الإلغاء الإداري للكميات وأوامر التفصيل"
      subtitle={`أمر التفصيل: ${review?.detail.order.businessNumber ?? "—"} · صلاحية حصرية للإدارة العامة`}
      actions={
        <>
          <button
            type="submit"
            form={formId}
            disabled={disabled || reviewRequired || selected === null}
            className="btn-pill btn-rose"
          >
            تأكيد إلغاء {selected?.pieceIds.length ?? "—"} قطعة
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            تراجع
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          الإلغاء يخص القطع المحددة فقط ويحفظ الكميات الأصلية والسجل والمدفوع.
          يتحقق الخادم من جميع القطع قبل الحفظ.
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-800">
            نوع الإلغاء المطلوب:
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { scope: "ORDER", label: "كامل أمر التفصيل" },
                { scope: "ITEM", label: "بند كامل" },
                { scope: "QUANTITY", label: "قطع محددة" },
              ] as const
            ).map(({ scope, label }) => (
              <button
                key={scope}
                type="button"
                disabled={disabled}
                aria-pressed={values.scope === scope}
                onClick={() => {
                  form.setValue("scope", scope, { shouldDirty: true });
                }}
                className={`rounded-lg border p-2 text-center text-xs font-bold transition ${values.scope === scope ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {values.scope === "ITEM" && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              البند المستهدف:
            </span>
            <select
              aria-label="البند المستهدف"
              disabled={disabled}
              value={values.itemPieceId ?? ""}
              onChange={(event) => {
                form.setValue("itemPieceId", event.target.value || null, {
                  shouldDirty: true,
                });
              }}
              className="oriental-input w-full text-xs"
            >
              <option value="">اختر قطعة</option>
              {review?.detail.cancellationCandidates.map((piece) => (
                <option
                  key={piece.pieceId}
                  value={piece.pieceId}
                  disabled={!piece.eligible}
                >
                  بند {piece.position}: {piece.model ?? "—"}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-xs">
          {review?.detail.cancellationCandidates.map((piece) => (
            <label
              key={piece.pieceId}
              className="flex items-center justify-between gap-2 p-2"
            >
              {values.scope === "QUANTITY" && (
                <input
                  type="checkbox"
                  disabled={disabled || !piece.eligible}
                  checked={values.selectedPieceIds.includes(piece.pieceId)}
                  onChange={(event) => {
                    form.setValue(
                      "selectedPieceIds",
                      event.target.checked
                        ? [...values.selectedPieceIds, piece.pieceId]
                        : values.selectedPieceIds.filter(
                            (id) => id !== piece.pieceId,
                          ),
                      { shouldDirty: true },
                    );
                  }}
                />
              )}
              <span>
                بند {piece.position}: {piece.model ?? "—"} —{" "}
                <span dir="ltr">{piece.pieceId}</span>
              </span>
              <span>
                {stageLabels[piece.stage]} —{" "}
                {piece.receivedAt === null
                  ? "لم تسجل استلاماً"
                  : "لها استلام مسجل"}
                {!piece.eligible && " — غير مؤهلة للإلغاء في حالتها الحالية"}
              </span>
            </label>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            سبب الإلغاء الإداري (اختياري):
          </span>
          <textarea
            id={`${formId}-reason`}
            aria-invalid={Boolean(form.formState.errors.reason)}
            aria-describedby={
              form.formState.errors.reason
                ? `${formId}-reason-error`
                : undefined
            }
            rows={2}
            disabled={disabled}
            {...form.register("reason")}
            className="oriental-textarea w-full text-xs"
          />
        </label>
        {Object.entries(form.formState.errors).map(([field, error]) => (
          <p
            key={field}
            id={field === "reason" ? `${formId}-reason-error` : undefined}
            role="alert"
            className="text-xs font-medium text-rose-600"
          >
            {error.message}
          </p>
        ))}
        {reviewRequired && (
          <div role="alert">
            تغيرت البيانات؛ راجع البيانات الحالية مع الاحتفاظ باختيارك وسببك.{" "}
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
          <p role="status">
            تابع نتيجة الإجراء الأصلي؛ إغلاق النافذة لا يلغي الحفظ.
          </p>
        )}
        {failure && <p role="alert">{failure}</p>}
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <p>
            الكمية الأصلية: {counts?.original ?? "—"} — الملغى سابقاً:{" "}
            {counts?.cancelled ?? "—"}
          </p>
          <p>
            المطلوب النشط قبل الإلغاء: {counts?.active ?? "—"} — بعد الإلغاء:{" "}
            {counts !== undefined && selected !== null
              ? counts.active - selected.pieceIds.length
              : "—"}
          </p>
          <p>المنجز بالمستودع: {counts?.received ?? "—"}</p>
          <p>
            القطع المحددة:{" "}
            {selected?.pieceIds.join("، ") ?? "راجع اختيار القطع المؤهلة."}
          </p>
          <p>
            الإجمالي بعد الإلغاء: {money?.total ?? "—"} — المدفوع المحفوظ:{" "}
            {money?.paidAmount ?? "—"}
          </p>
          <p>
            المتبقي المستحق: {money?.remainingDue ?? "—"} — الفائض:{" "}
            {money?.surplus ?? "—"}
          </p>
        </div>
      </form>
    </BaseDialog>
  );
}
