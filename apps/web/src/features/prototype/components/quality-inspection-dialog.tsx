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
      <p id={`${name}-error`} role="alert">
        {message}
      </p>
    ) : null;
  };
  return (
    <BaseDialog
      open={props.open}
      onClose={props.onClose}
      title="فحص الجودة وتسجيل النتيجة والتغليف"
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
      actions={
        <>
          <button
            className="btn-pill btn-teal"
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
          <button className="btn-pill btn-outline" onClick={props.onClose}>
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
        <div className="grid grid-cols-3 gap-3">
          {[
            [
              "المفحوص",
              pieces.filter(
                (piece) => piece.included && piece.decision !== "UNDECIDED",
              ).length,
            ],
            [
              "المقبول",
              pieces.filter(
                (piece) => piece.included && piece.decision === "ACCEPT",
              ).length,
            ],
            [
              "المرفوض",
              pieces.filter(
                (piece) => piece.included && piece.decision === "REJECT",
              ).length,
            ],
          ].map(([label, count]) => (
            <label key={label} className="block text-xs">
              <span>{label}</span>
              <input className="oriental-input w-full" readOnly value={count} />
            </label>
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
                className="space-y-3 rounded-xl border border-slate-200 p-3"
              >
                <h3>{captured[0]?.order.businessNumber}</h3>
                {order.pieces.map((piece, pi) => {
                  const path =
                      `orders.${index(oi)}.pieces.${index(pi)}` as const,
                    row = captured.find(
                      (row) => row.piece.id === piece.pieceId,
                    );
                  return (
                    <div
                      key={piece.pieceId}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <p>
                        القطعة {row?.piece.position} · {row?.piece.model ?? "—"}{" "}
                        · {row?.piece.size ?? "—"} · {piece.pieceId}
                      </p>
                      {!props.compact && (
                        <label>
                          <input
                            type="checkbox"
                            {...form.register(`${path}.included`)}
                          />
                          فحص هذه القطعة
                        </label>
                      )}
                      {!piece.included ? (
                        <p>ستبقى هذه القطعة دون تغيير</p>
                      ) : (
                        <>
                          {props.compact ? (
                            <div
                              className="grid grid-cols-2 gap-2"
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
                                className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"
                                ref={form.register(`${path}.decision`).ref}
                                role="radio"
                                data-quality-decision="ACCEPT"
                                tabIndex={piece.decision === "REJECT" ? -1 : 0}
                                aria-checked={piece.decision === "ACCEPT"}
                                onClick={() => {
                                  form.setValue(`${path}.decision`, "ACCEPT", {
                                    shouldValidate: true,
                                  });
                                }}
                              >
                                قبول وتغليف (مطابقة)
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900"
                                role="radio"
                                data-quality-decision="REJECT"
                                tabIndex={piece.decision === "REJECT" ? 0 : -1}
                                aria-checked={piece.decision === "REJECT"}
                                onClick={() => {
                                  form.setValue(`${path}.decision`, "REJECT", {
                                    shouldValidate: true,
                                  });
                                }}
                              >
                                رفض وإعادة للتصحيح
                              </button>
                            </div>
                          ) : (
                            <label>
                              نتيجة القطعة
                              <select
                                className="oriental-input w-full"
                                {...form.register(`${path}.decision`)}
                                aria-describedby={`${path}.decision-error`}
                                aria-invalid={
                                  form.getFieldState(
                                    `${path}.decision`,
                                    form.formState,
                                  ).invalid
                                }
                              >
                                <option value="UNDECIDED">اختر النتيجة</option>
                                <option value="ACCEPT">قبول</option>
                                <option value="REJECT">رفض</option>
                              </select>
                            </label>
                          )}
                          {error(`${path}.decision`)}
                          {piece.decision === "REJECT" && (
                            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                              <label>
                                القسم المسؤول
                                <select
                                  className="oriental-input w-full"
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
                              <label>
                                سبب الرفض
                                <input
                                  className="oriental-input w-full"
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
                              <label>
                                تعليمات التصحيح
                                <textarea
                                  className="oriental-textarea w-full"
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
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {accepted && !props.compact && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <label>
                      عدد الكراتين (اختياري)
                      <input
                        className="oriental-input w-full"
                        {...form.register(`orders.${index(oi)}.cartonCount`)}
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
                    <label>
                      أرقام الكراتين (اختياري)
                      <input
                        className="oriental-input w-full"
                        {...form.register(`orders.${index(oi)}.cartonNumbers`)}
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
                )}
                <label>
                  ملاحظات فاحص الجودة (اختياري)
                  <textarea
                    className="oriental-textarea w-full"
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
          <p role="status">جارٍ إرسال الإجراء؛ الإغلاق لا يلغي العملية.</p>
        )}

        {props.readAvailability === "refreshing" && (
          <p role="status">
            جارٍ تحديث بيانات الجودة؛ انتظر اكتمال التحديث قبل التأكيد.
          </p>
        )}
        {props.readAvailability === "error" && (
          <div role="alert">
            {readRetryFailure !== null &&
            readRetryFailure.readFailure === props.readFailure
              ? readRetryFailure.message
              : (props.readFailure ??
                "تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد.")}
            <button
              type="button"
              className="btn-pill btn-outline"
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
          <p role="alert">{failure || props.failure}</p>
        )}
        {form.formState.errors.orders?.root?.message && (
          <p role="alert">{form.formState.errors.orders.root.message}</p>
        )}
        {props.reviewRequired && (
          <button
            type="button"
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
