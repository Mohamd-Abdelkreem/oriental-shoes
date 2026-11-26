"use client";
import {
  describeOrderPieces,
  toOrderPieceLabels,
} from "@/features/orders/model/order-display-reference";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";
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
            className="btn-pill btn-rose disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="flex items-start gap-2.5 rounded-xl border border-s-4 border-amber-200/90 border-s-amber-500 bg-amber-50/85 px-3.5 py-2.5 text-xs leading-5 text-amber-950">
          <AlertTriangle
            size={15}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-amber-600"
          />
          <span>
            الإلغاء يخص القطع المحددة فقط ويحفظ الكميات الأصلية والسجل والمدفوع.
            يتحقق الخادم من جميع القطع قبل الحفظ.
          </span>
        </div>
        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-slate-800">
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
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  values.scope === scope
                    ? "border-rose-400 bg-rose-50/80 text-rose-900 ring-1 ring-rose-400/20"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {values.scope === "ITEM" && (
          <label className="block space-y-1.5">
            <span className="block text-xs font-bold text-slate-800">
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
              className="oriental-select w-full"
            >
              <option value="">اختر قطعة</option>
              {review?.detail.cancellationCandidates.map((piece) => (
                <option
                  key={piece.pieceId}
                  value={piece.pieceId}
                  disabled={!piece.eligible}
                >
                  {formatPieceSequence(piece.position - 1)}:{" "}
                  {piece.model ?? "—"}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="divide-y divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/90 bg-white text-xs shadow-2xs">
          {review?.detail.cancellationCandidates.map((piece) => (
            <label
              key={piece.pieceId}
              className={`flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 transition-colors ${
                piece.eligible
                  ? "cursor-pointer hover:bg-slate-50/80 has-checked:bg-rose-50/45"
                  : "cursor-not-allowed bg-slate-50/60 opacity-65"
              }`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                {values.scope === "QUANTITY" && (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 cursor-pointer accent-rose-600 disabled:cursor-not-allowed"
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
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-bold text-slate-900">
                  {formatPieceSequence(piece.position - 1)}:{" "}
                  {piece.model ?? "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                  {stageLabels[piece.stage]}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    piece.receivedAt === null
                      ? "border-slate-200 bg-white text-slate-500"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {piece.receivedAt === null
                    ? "لم تسجل استلاماً"
                    : "لها استلام مسجل"}
                </span>
                {!piece.eligible && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                    غير مؤهلة للإلغاء في حالتها الحالية
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
        <label className="block space-y-1.5">
          <span className="block text-xs font-bold text-slate-800">
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
            placeholder="أضف سبب الإلغاء الإداري للرجوع إليه في السجل..."
            disabled={disabled}
            {...form.register("reason")}
            className="oriental-textarea min-h-[72px]! w-full rounded-[10px]! text-xs! leading-relaxed placeholder:text-slate-400 aria-invalid:border-rose-400!"
          />
        </label>
        {Object.entries(form.formState.errors).map(([field, error]) => (
          <p
            key={field}
            id={field === "reason" ? `${formId}-reason-error` : undefined}
            role="alert"
            className="text-xs font-medium text-rose-700"
          >
            {error.message}
          </p>
        ))}
        {reviewRequired && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs leading-relaxed text-amber-900"
          >
            <p>
              تغيرت البيانات؛ راجع البيانات الحالية مع الاحتفاظ باختيارك وسببك.
            </p>
            <button
              type="button"
              className="btn-pill btn-outline px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => {
                void onReviewCurrent();
              }}
            >
              مراجعة البيانات الحالية
            </button>
          </div>
        )}
        {preparing && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            جارٍ مراجعة البيانات الحالية…
          </p>
        )}
        {pending && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            تابع نتيجة الإجراء الأصلي؛ إغلاق النافذة لا يلغي الحفظ.
          </p>
        )}
        {failure && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
          >
            {failure}
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/75 text-xs">
          <div className="border-b border-slate-200/80 bg-white/80 px-3.5 py-2 font-bold text-slate-800">
            ملخص الأثر الكمي والمالي للإلغاء
          </div>
          <div className="space-y-1.5 p-3">
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-medium text-slate-800">
              الكمية الأصلية: {counts?.original ?? "—"} · الملغى سابقاً:{" "}
              {counts?.cancelled ?? "—"} · المنجز بالمستودع:{" "}
              {counts?.received ?? "—"}
            </p>
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-medium text-slate-800">
              المطلوب النشط قبل الإلغاء: {counts?.active ?? "—"} · بعد الإلغاء:{" "}
              {counts !== undefined && selected !== null
                ? counts.active - selected.pieceIds.length
                : "—"}
            </p>
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-mono text-[11px] font-medium break-all text-slate-600">
              القطع المحددة:{" "}
              {selected
                ? describeOrderPieces(
                    selected.pieceIds,
                    toOrderPieceLabels(
                      review?.detail.cancellationCandidates.map((piece) => ({
                        id: piece.pieceId,
                        position: piece.position,
                      })) ?? [],
                    ),
                  )
                : "راجع اختيار القطع المؤهلة."}
            </p>
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-semibold text-slate-900">
              الإجمالي بعد الإلغاء: {money?.total ?? "—"} · المدفوع المحفوظ:{" "}
              {money?.paidAmount ?? "—"}
            </p>
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-semibold text-slate-900">
              المتبقي المستحق: {money?.remainingDue ?? "—"} · الفائض:{" "}
              {money?.surplus ?? "—"}
            </p>
          </div>
        </div>
      </form>
    </BaseDialog>
  );
}
