"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import type {
  QualityWorkRow,
  QualityReadAvailability,
} from "@/features/manufacturing/model/quality-view.model";
import { captureQualityInspection } from "@/features/manufacturing/model/quality-selection.model";
import {
  qualityInspectionFormSchema,
  applyQualityFormErrors,
  qualityFailureMessage,
  type QualityInspectionFormValues,
} from "@/features/manufacturing/model/quality-form.model";
import { useZodForm } from "@/shared/forms/form";
import { BaseDialog } from "./base-dialog";

function LegacyQualityInspectionDialog({
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
    responsibleDept?: "القص" | "الإنتاج والإصلاح" | undefined;
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
    "القص" | "الإنتاج والإصلاح"
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
                    e.target.value as "القص" | "الإنتاج والإصلاح",
                  );
                }}
                className="oriental-input w-full text-xs"
              >
                <option value="الإنتاج والإصلاح">
                  الإنتاج والإصلاح (تركيب وجه / نعل)
                </option>
                <option value="القص">القص (أبعاد الجلد / زوايا القص)</option>
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

export type QualityInspectionDialogProps = Readonly<{
  source: "quality";
  readAvailability: QualityReadAvailability;
  readFailure: string | null;
  onReadRetry: () => Promise<void>;
  rows: readonly QualityWorkRow[];
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  pending: boolean;
  failure: string | null;
  reviewRequired: boolean;
  onReview: () => Promise<void>;
  onConfirm: (values: QualityInspectionFormValues) => Promise<void>;
}>;
export function QualityInspectionDialog(
  props:
    | Parameters<typeof LegacyQualityInspectionDialog>[0]
    | QualityInspectionDialogProps,
) {
  if ("source" in props) return <QualityInspectionForm {...props} />;
  return <LegacyQualityInspectionDialog {...props} />;
}
// Only the grouped surface renders packing; the compact singleton reuses the same exact identity/form owner.
export function QualityInspectionForm(
  props: QualityInspectionDialogProps & { compact?: boolean },
) {
  const [defaults] = useState<QualityInspectionFormValues>(() => ({
      orders: [...new Set(props.rows.map((row) => row.order.id))].map(
        (orderId) => {
          const rows = props.rows.filter((row) => row.order.id === orderId),
            first = rows[0];
          if (!first) throw new Error("Missing captured order");
          return {
            orderId,
            expectedVersion: first.order.version,
            inspectorNote: "",
            cartonCount: "",
            cartonNumbers: "",
            pieces: rows.map((row) => ({
              pieceId: row.piece.id,
              included: true,
              decision: "UNDECIDED",
              target: null,
              reason: "",
              instructions: "",
            })),
          };
        },
      ),
    })),
    form = useZodForm(qualityInspectionFormSchema, {
      defaultValues: defaults,
      shouldFocusError: false,
    }),
    [failure, setFailure] = useState<string | null>(null),
    [readRetryFailure, setReadRetryFailure] = useState<{
      readFailure: string | null;
      message: string;
    } | null>(null),
    [sending, setSending] = useState(false),
    guard = useRef(false),
    readRetry = useRef(false),
    mounted = useRef(false),
    reviewRequested = useRef(false),
    validationFormRef = useRef<HTMLFormElement>(null),
    focusedSubmission = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { getValues, setValue } = form;
  useEffect(() => {
    if (!reviewRequested.current || props.reviewRequired) return;
    const current = getValues();
    const capturedIds = props.rows.map((row) => row.piece.id).toSorted();
    const formIds = current.orders
      .flatMap((order) => order.pieces.map((piece) => piece.pieceId))
      .toSorted();
    if (JSON.stringify(capturedIds) !== JSON.stringify(formIds)) return;
    current.orders.forEach((order, i) => {
      const row = props.rows.find((row) => row.order.id === order.orderId);
      if (row)
        setValue(
          `orders.${String(i) as `${number}`}.expectedVersion`,
          row.order.version,
        );
    });
    reviewRequested.current = false;
  }, [props.rows, props.reviewRequired, getValues, setValue]);
  const values = form.watch(),
    pieces = values.orders.flatMap((order) => order.pieces),
    disabled = sending || props.pending || form.formState.isSubmitting,
    submissionCount = form.formState.submitCount;
  useEffect(() => {
    if (
      disabled ||
      submissionCount === 0 ||
      focusedSubmission.current === submissionCount
    )
      return;
    focusedSubmission.current = submissionCount;
    const invalid = validationFormRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const control = invalid?.matches("input,select,textarea,button")
      ? invalid
      : invalid?.querySelector<HTMLElement>("input,select,textarea,button");
    control?.focus();
  }, [disabled, submissionCount]);
  const index = (value: number): `${number}` => String(value) as `${number}`;
  const submit = async (parsed: QualityInspectionFormValues) => {
    if (
      guard.current ||
      props.pending ||
      props.reviewRequired ||
      props.readAvailability !== "ready"
    )
      return;
    guard.current = true;
    setSending(true);
    setFailure(null);
    let submitted: {
      orders: ReturnType<typeof captureQualityInspection>;
    } | null = null;
    try {
      submitted = { orders: captureQualityInspection(props.rows, parsed) };
      await props.onConfirm(parsed);
    } catch (error: unknown) {
      if (mounted.current)
        setFailure(
          submitted
            ? applyQualityFormErrors(error, form, submitted)
            : qualityFailureMessage(error, "تسجيل الفحص"),
        );
    } finally {
      guard.current = false;
      if (mounted.current) setSending(false);
    }
  };
  const retryRead = async () => {
    if (readRetry.current || props.readAvailability !== "error") return;
    readRetry.current = true;
    setReadRetryFailure(null);
    try {
      await props.onReadRetry();
    } catch (error: unknown) {
      if (mounted.current)
        setReadRetryFailure({
          readFailure: props.readFailure,
          message: qualityFailureMessage(
            error,
            "تحديث بيانات الجودة",
            undefined,
            "read",
          ),
        });
    } finally {
      readRetry.current = false;
    }
  };
  const error = (name: Parameters<typeof form.getFieldState>[0]) => {
    const message = form.getFieldState(name, form.formState).error?.message;
    return message ? (
      <p
        id={`${name}-error`}
        role="alert"
        className="text-xs font-medium text-rose-700"
      >
        {message}
      </p>
    ) : null;
  };
  return (
    <BaseDialog
      open={props.open}
      onClose={props.onClose}
      title="فحص الجودة وتسجيل النتيجة والتغليف"
      subtitle={`المحدد: ${String(props.rows.length)} قطعة`}
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              disabled ||
              props.reviewRequired ||
              props.readAvailability !== "ready"
            }
            onClick={() => {
              void form.handleSubmit(submit)();
            }}
          >
            تأكيد نتيجة الفحص
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={props.onClose}
          >
            إغلاق
          </button>
        </>
      }
    >
      <form
        ref={validationFormRef}
        onSubmit={(event) => {
          if (props.readAvailability !== "ready") {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(submit)(event);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              label: "المفحوص",
              count: pieces.filter(
                (piece) => piece.included && piece.decision !== "UNDECIDED",
              ).length,
              cardTone: "border-slate-200/90 bg-slate-50/90 text-slate-900",
              labelTone: "text-slate-500",
            },
            {
              label: "المقبول",
              count: pieces.filter(
                (piece) => piece.included && piece.decision === "ACCEPT",
              ).length,
              cardTone:
                "border-emerald-200/90 bg-emerald-50/75 text-emerald-900",
              labelTone: "text-emerald-700",
            },
            {
              label: "المرفوض",
              count: pieces.filter(
                (piece) => piece.included && piece.decision === "REJECT",
              ).length,
              cardTone: "border-rose-200/90 bg-rose-50/75 text-rose-900",
              labelTone: "text-rose-700",
            },
          ].map(({ label, count, cardTone, labelTone }) => (
            <div
              key={label}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${cardTone}`}
            >
              <span className={`text-xs font-semibold ${labelTone}`}>
                {label}
              </span>
              <strong className="font-mono text-base font-extrabold tabular-nums">
                {count}
              </strong>
            </div>
          ))}
        </div>
        <fieldset disabled={disabled} className="space-y-4">
          {values.orders.map((order, oi) => {
            const captured = props.rows.filter(
              (row) => row.order.id === order.orderId,
            );
            const accepted = order.pieces.some(
              (piece) => piece.included && piece.decision === "ACCEPT",
            );
            return (
              <section
                key={order.orderId}
                className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 px-3.5 py-2.5">
                  <h3
                    dir="ltr"
                    className="font-mono text-xs font-bold text-slate-900"
                  >
                    {captured[0]?.order.businessNumber}
                  </h3>
                  <span className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {order.pieces.length} قطعة
                  </span>
                </header>
                <div className="space-y-3 p-3.5">
                  {order.pieces.map((piece, pi) => {
                    const path =
                        `orders.${index(oi)}.pieces.${index(pi)}` as const,
                      row = captured.find(
                        (row) => row.piece.id === piece.pieceId,
                      );
                    const pieceTone = !piece.included
                      ? "border-slate-200/80 bg-slate-50/50 opacity-80"
                      : piece.decision === "ACCEPT"
                        ? "border-emerald-200/90 bg-emerald-50/25"
                        : piece.decision === "REJECT"
                          ? "border-rose-200/90 bg-rose-50/25"
                          : "border-slate-200/90 bg-slate-50/60";
                    return (
                      <div
                        key={piece.pieceId}
                        className={`space-y-3 rounded-xl border p-3.5 transition-colors ${pieceTone}`}
                      >
                        <p className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 font-mono text-[11px] text-slate-400">
                          <span className="inline-flex flex-wrap items-center gap-2 font-sans text-xs">
                            <strong className="rounded-md border border-teal-200/80 bg-teal-50/80 px-2 py-0.5 font-bold text-teal-900">
                              القطعة {row?.piece.position}
                            </strong>
                            <span className="font-semibold text-slate-800">
                              {row?.piece.model ?? "—"}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600">
                              مقاس {row?.piece.size ?? "—"}
                            </span>
                          </span>
                          {piece.pieceId}
                        </p>
                        {!props.compact && (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors select-none hover:border-teal-300 has-checked:border-teal-200 has-checked:bg-teal-50/60 has-checked:text-teal-900">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-teal-700"
                              {...form.register(`${path}.included`)}
                            />
                            فحص هذه القطعة
                          </label>
                        )}
                        {!piece.included ? (
                          <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-500">
                            ستبقى هذه القطعة دون تغيير
                          </p>
                        ) : (
                          <>
                            {props.compact ? (
                              <div
                                className="grid grid-cols-2 gap-2.5"
                                role="radiogroup"
                                aria-label="نتيجة القطعة"
                                aria-invalid={
                                  form.getFieldState(
                                    `${path}.decision`,
                                    form.formState,
                                  ).invalid
                                }
                                aria-describedby={`${path}.decision-error`}
                                onKeyDown={(event) => {
                                  if (
                                    ![
                                      "ArrowLeft",
                                      "ArrowRight",
                                      "ArrowUp",
                                      "ArrowDown",
                                      "Home",
                                      "End",
                                    ].includes(event.key)
                                  )
                                    return;
                                  event.preventDefault();
                                  const decision =
                                    event.key === "Home"
                                      ? "ACCEPT"
                                      : event.key === "End"
                                        ? "REJECT"
                                        : piece.decision === "ACCEPT"
                                          ? "REJECT"
                                          : "ACCEPT";
                                  form.setValue(`${path}.decision`, decision, {
                                    shouldValidate: true,
                                  });
                                  event.currentTarget
                                    .querySelector<HTMLButtonElement>(
                                      `[data-quality-decision="${decision}"]`,
                                    )
                                    ?.focus();
                                }}
                              >
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100/70 aria-checked:border-emerald-500 aria-checked:bg-emerald-100/90 aria-checked:ring-2 aria-checked:ring-emerald-500/20"
                                  ref={form.register(`${path}.decision`).ref}
                                  role="radio"
                                  data-quality-decision="ACCEPT"
                                  tabIndex={
                                    piece.decision === "REJECT" ? -1 : 0
                                  }
                                  aria-checked={piece.decision === "ACCEPT"}
                                  onClick={() => {
                                    form.setValue(
                                      `${path}.decision`,
                                      "ACCEPT",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }}
                                >
                                  قبول وتغليف (مطابقة)
                                </button>
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-bold text-rose-900 transition hover:bg-rose-100/70 aria-checked:border-rose-500 aria-checked:bg-rose-100/90 aria-checked:ring-2 aria-checked:ring-rose-500/20"
                                  role="radio"
                                  data-quality-decision="REJECT"
                                  tabIndex={
                                    piece.decision === "REJECT" ? 0 : -1
                                  }
                                  aria-checked={piece.decision === "REJECT"}
                                  onClick={() => {
                                    form.setValue(
                                      `${path}.decision`,
                                      "REJECT",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }}
                                >
                                  رفض وإعادة للتصحيح
                                </button>
                              </div>
                            ) : (
                              <label className="block space-y-1.5">
                                <span className="block text-xs font-bold text-slate-700">
                                  نتيجة القطعة
                                </span>
                                <select
                                  className="oriental-select w-full"
                                  {...form.register(`${path}.decision`)}
                                  aria-describedby={`${path}.decision-error`}
                                  aria-invalid={
                                    form.getFieldState(
                                      `${path}.decision`,
                                      form.formState,
                                    ).invalid
                                  }
                                >
                                  <option value="UNDECIDED">
                                    اختر النتيجة
                                  </option>
                                  <option value="ACCEPT">قبول</option>
                                  <option value="REJECT">رفض</option>
                                </select>
                              </label>
                            )}
                            {error(`${path}.decision`)}
                            {piece.decision === "REJECT" && (
                              <div className="space-y-3 rounded-xl border border-rose-200/90 bg-rose-50/80 p-3.5">
                                <div className="space-y-1.5">
                                  <label className="block space-y-1.5">
                                    <span className="block text-xs font-bold text-rose-950">
                                      القسم المسؤول
                                    </span>
                                    <select
                                      className="oriental-select w-full"
                                      {...form.register(`${path}.target`)}
                                      aria-describedby={`${path}.target-error`}
                                      aria-invalid={
                                        form.getFieldState(
                                          `${path}.target`,
                                          form.formState,
                                        ).invalid
                                      }
                                    >
                                      <option value="">اختر القسم</option>
                                      <option value="CUTTING">القص</option>
                                      <option value="PRODUCTION">
                                        الإنتاج والإصلاح
                                      </option>
                                    </select>
                                  </label>
                                  {error(`${path}.target`)}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="block space-y-1.5">
                                    <span className="block text-xs font-bold text-rose-950">
                                      سبب الرفض
                                    </span>
                                    <input
                                      placeholder="اكتب سبب الرفض وعدم المطابقة..."
                                      className="oriental-input h-10! min-h-10! w-full rounded-[10px]! px-3! py-0! text-xs! font-medium! placeholder:text-slate-400 aria-invalid:border-rose-400!"
                                      {...form.register(`${path}.reason`)}
                                      aria-describedby={`${path}.reason-error`}
                                      aria-invalid={
                                        form.getFieldState(
                                          `${path}.reason`,
                                          form.formState,
                                        ).invalid
                                      }
                                    />
                                  </label>
                                  {error(`${path}.reason`)}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="block space-y-1.5">
                                    <span className="block text-xs font-bold text-rose-950">
                                      تعليمات التصحيح
                                    </span>
                                    <textarea
                                      rows={2}
                                      placeholder="أضف تعليمات واضحة لإصلاح القطعة..."
                                      className="oriental-textarea min-h-[68px]! w-full rounded-[10px]! text-xs! leading-relaxed placeholder:text-slate-400 aria-invalid:border-rose-400!"
                                      {...form.register(`${path}.instructions`)}
                                      aria-describedby={`${path}.instructions-error`}
                                      aria-invalid={
                                        form.getFieldState(
                                          `${path}.instructions`,
                                          form.formState,
                                        ).invalid
                                      }
                                    />
                                  </label>
                                  {error(`${path}.instructions`)}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  {accepted && !props.compact && (
                    <div className="space-y-2.5 rounded-xl border border-emerald-200/90 bg-emerald-50/75 p-3.5">
                      <span className="block text-xs font-bold text-emerald-900">
                        بيانات التغليف للكمية المقبولة
                      </span>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="block space-y-1.5">
                            <span className="block text-xs font-semibold text-emerald-950">
                              عدد الكراتين (اختياري)
                            </span>
                            <input
                              placeholder="مثال: ٢"
                              className="oriental-input h-10! min-h-10! w-full rounded-[10px]! px-3! py-0! text-xs! font-medium! placeholder:text-slate-400 aria-invalid:border-rose-400!"
                              {...form.register(
                                `orders.${index(oi)}.cartonCount`,
                              )}
                              aria-describedby={`orders.${index(oi)}.cartonCount-error`}
                              aria-invalid={
                                form.getFieldState(
                                  `orders.${index(oi)}.cartonCount`,
                                  form.formState,
                                ).invalid
                              }
                            />
                          </label>
                          {error(`orders.${index(oi)}.cartonCount`)}
                        </div>
                        <div className="space-y-1.5">
                          <label className="block space-y-1.5">
                            <span className="block text-xs font-semibold text-emerald-950">
                              أرقام الكراتين (اختياري)
                            </span>
                            <input
                              placeholder="مثال: C-12, C-13"
                              className="oriental-input h-10! min-h-10! w-full rounded-[10px]! px-3! py-0! text-xs! font-medium! placeholder:text-slate-400 aria-invalid:border-rose-400!"
                              {...form.register(
                                `orders.${index(oi)}.cartonNumbers`,
                              )}
                              aria-describedby={`orders.${index(oi)}.cartonNumbers-error`}
                              aria-invalid={
                                form.getFieldState(
                                  `orders.${index(oi)}.cartonNumbers`,
                                  form.formState,
                                ).invalid
                              }
                            />
                          </label>
                          {error(`orders.${index(oi)}.cartonNumbers`)}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block space-y-1.5">
                      <span className="block text-xs font-bold text-slate-700">
                        ملاحظات فاحص الجودة (اختياري)
                      </span>
                      <textarea
                        rows={2}
                        placeholder="أضف أي ملاحظات إضافية عن حالة الفحص أو التغليف..."
                        className="oriental-textarea min-h-[72px]! w-full rounded-[10px]! text-xs! leading-relaxed placeholder:text-slate-400 aria-invalid:border-rose-400!"
                        {...form.register(`orders.${index(oi)}.inspectorNote`)}
                        aria-describedby={`orders.${index(oi)}.inspectorNote-error`}
                        aria-invalid={
                          form.getFieldState(
                            `orders.${index(oi)}.inspectorNote`,
                            form.formState,
                          ).invalid
                        }
                      />
                    </label>
                    {error(`orders.${index(oi)}.inspectorNote`)}
                  </div>
                </div>
              </section>
            );
          })}
        </fieldset>
        <button
          type="submit"
          hidden
          disabled={
            disabled ||
            props.reviewRequired ||
            props.readAvailability !== "ready"
          }
        >
          تأكيد نتيجة الفحص
        </button>
        {disabled && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            جارٍ إرسال الإجراء؛ الإغلاق لا يلغي العملية.
          </p>
        )}

        {props.readAvailability === "refreshing" && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            جارٍ تحديث بيانات الجودة؛ انتظر اكتمال التحديث قبل التأكيد.
          </p>
        )}
        {props.readAvailability === "error" && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs leading-relaxed text-rose-800"
          >
            <p>
              {readRetryFailure !== null &&
              readRetryFailure.readFailure === props.readFailure
                ? readRetryFailure.message
                : (props.readFailure ??
                  "تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد.")}
            </p>
            <button
              type="button"
              className="btn-pill btn-outline px-3! py-1.5! text-xs!"
              onClick={(event) => {
                event.currentTarget
                  .closest<HTMLElement>('[role="dialog"]')
                  ?.focus();
                void retryRead();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {(failure || props.failure) && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
          >
            {failure || props.failure}
          </p>
        )}
        {form.formState.errors.orders?.root?.message && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
          >
            {form.formState.errors.orders.root.message}
          </p>
        )}
        {props.reviewRequired && (
          <button
            type="button"
            className="btn-pill btn-outline text-xs!"
            onClick={() => {
              reviewRequested.current = true;
              void props.onReview().catch((error: unknown) => {
                if (mounted.current)
                  setFailure(
                    qualityFailureMessage(
                      error,
                      "مراجعة القطع",
                      undefined,
                      "read",
                    ),
                  );
              });
            }}
          >
            تحديث ومراجعة جميع القطع
          </button>
        )}
      </form>
    </BaseDialog>
  );
}
