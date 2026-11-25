"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { warehouseOrderDataSchema } from "@template/contracts";
import { useWarehouseOperationalScope } from "@/shared/query/operational-scope";
import { warehouseKeys } from "../hooks/warehouse.hooks";
import { reviewWarehouseSelection } from "../model/warehouse-selection.model";
import { useForm, type FieldPath } from "react-hook-form";
import { localizedZodResolver } from "@/shared/forms/form";
import { BaseDialog } from "@/features/prototype/components/base-dialog";
import {
  WorkSelectionOrder,
  WorkSelectionPieces,
} from "@/features/manufacturing/components/work-selection-summary";
import {
  warehouseActionFormSchema,
  toWarehouseCommand,
  applyWarehouseFormErrors,
  invalidRetryDateMessage,
  warehouseFailureMessage,
  type WarehouseActionFormValues,
} from "../model/warehouse-form.model";
import type {
  WarehouseDialogProps,
  WarehouseReview,
} from "../model/warehouse-view.model";
import { toWarehouseOperationLabel } from "../model/warehouse-event.model";

const acceptanceDate = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

const defaults = (review: WarehouseReview): WarehouseActionFormValues => {
  const ids = review.orders.map((order) => order.orderId);
  switch (review.operation) {
    case "RECEIVE":
      return {
        operation: "RECEIVE",
        orders: ids.map((orderId) => ({
          orderId,
          cartonCount: "",
          storageLocation: "",
          notes: "",
        })),
      };
    case "DISPATCH":
      return {
        operation: "DISPATCH",
        orders: ids.map((orderId) => ({ orderId, deliveryNote: "" })),
      };
    case "CONFIRM_DELIVERY":
      return {
        operation: "CONFIRM_DELIVERY",
        orders: ids.map((orderId) => ({
          orderId,
          recipient: "",
          deliveredAtText: "",
          notes: "",
        })),
      };
    case "FAIL_DELIVERY":
      return {
        operation: "FAIL_DELIVERY",
        orders: ids.map((orderId) => ({
          orderId,
          reason: "",
          notes: "",
          returnedToWarehouse: false,
        })),
      };
    case "RETRY_DELIVERY":
      return {
        operation: "RETRY_DELIVERY",
        orders: ids.map((orderId) => ({
          orderId,
          retryDateText: "",
          notes: "",
        })),
      };
  }
};
type EditableField =
  | "cartonCount"
  | "storageLocation"
  | "notes"
  | "deliveryNote"
  | "recipient"
  | "deliveredAtText"
  | "reason"
  | "retryDateText";
const labels: Record<EditableField, string> = {
  cartonCount: "عدد الكراتين المستلمة",
  storageLocation: "موقع التخزين بالرفوف",
  notes: "ملاحظات",
  deliveryNote: "ملاحظات التوصيل (اختياري)",
  recipient: "اسم المستلم الفعلي (اختياري)",
  deliveredAtText: "وقت وتاريخ التسليم الفعلي (اختياري)",
  reason: "سبب تعذر التسليم",
  retryDateText: "موعد المحاولة الجديدة (اختياري)",
};
const fields = (
  operation: WarehouseReview["operation"],
): readonly EditableField[] => {
  switch (operation) {
    case "RECEIVE":
      return ["cartonCount", "storageLocation", "notes"];
    case "DISPATCH":
      return ["deliveryNote"];
    case "CONFIRM_DELIVERY":
      return ["recipient", "deliveredAtText", "notes"];
    case "FAIL_DELIVERY":
      return ["reason", "notes"];
    case "RETRY_DELIVERY":
      return ["retryDateText", "notes"];
  }
};
export function WarehouseConfirmationDialog(props: WarehouseDialogProps) {
  const client = useQueryClient(),
    scope = useWarehouseOperationalScope();
  const subscribe = useCallback(
    (changed: () => void) =>
      client.getQueryCache().subscribe(notifyManager.batchCalls(changed)),
    [client],
  );
  const readState = () => {
    if (!scope) return "error";
    const details = [];
    for (const order of props.review.orders) {
      const key = warehouseKeys.order(scope, order.orderId),
        state = client.getQueryState(key);
      if (state?.fetchStatus === "fetching") return "refreshing";
      if (!state || state.status !== "success" || state.isInvalidated)
        return "error";
      const parsed = warehouseOrderDataSchema.safeParse(
        client.getQueryData(key),
      );
      if (!parsed.success) return "error";
      details.push(parsed.data);
    }
    try {
      const checked = reviewWarehouseSelection(props.review, details);
      return checked.orders.some((order, index) => {
        const original = props.review.orders[index];
        return (
          !original ||
          order.expectedVersion !== original.expectedVersion ||
          order.pieceIds.join() !== original.pieceIds.join() ||
          ("attemptId" in order &&
            "attemptId" in original &&
            order.attemptId !== original.attemptId)
        );
      })
        ? "stale"
        : "ready";
    } catch {
      return "stale";
    }
  };
  const cachedReadState = useSyncExternalStore(
    subscribe,
    readState,
    () => "error",
  );
  const availability =
    props.readAvailability !== "ready"
      ? props.readAvailability
      : cachedReadState === "stale"
        ? "error"
        : cachedReadState;
  const form = useForm<WarehouseActionFormValues>({
    defaultValues: defaults(props.review),
    resolver: localizedZodResolver(warehouseActionFormSchema),
  });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const formId = useId(),
    retrying = useRef(false),
    sending = useRef(false),
    bodyRef = useRef<HTMLDivElement>(null);
  const [readBusy, setReadBusy] = useState(false),
    [readFailure, setReadFailure] = useState<string | null>(null),
    [localFailure, setLocalFailure] = useState<string | null>(null);
  const allowed = () =>
    availability === "ready" &&
    !props.pending &&
    !props.reviewRequired &&
    !retrying.current &&
    !sending.current;
  const read = async (action: () => Promise<void>) => {
    if (retrying.current) return;
    retrying.current = true;
    setReadBusy(true);
    setReadFailure(null);
    bodyRef.current?.closest<HTMLElement>('[role="dialog"]')?.focus();
    try {
      await action();
    } catch (error: unknown) {
      if (mounted.current)
        setReadFailure(warehouseFailureMessage(error, "review"));
    } finally {
      retrying.current = false;
      if (mounted.current) setReadBusy(false);
    }
  };
  const submit = async (values: WarehouseActionFormValues) => {
    if (!allowed()) return;
    sending.current = true;
    setLocalFailure(null);
    try {
      await props.onConfirm(values);
    } catch (error: unknown) {
      if (mounted.current)
        setLocalFailure(
          applyWarehouseFormErrors(
            error,
            form,
            toWarehouseCommand(
              values,
              props.review,
              "00000000-0000-4000-8000-000000000000",
            ),
          ),
        );
    } finally {
      sending.current = false;
    }
  };
  return (
    <BaseDialog
      open={props.open}
      onClose={props.onClose}
      returnFocusRef={props.returnFocusRef}
      title={toWarehouseOperationLabel(props.review.operation)}
      actions={
        <>
          <button
            type="submit"
            form={formId}
            className="btn-pill btn-teal disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              availability !== "ready" ||
              props.pending ||
              props.reviewRequired ||
              readBusy ||
              form.formState.isSubmitting
            }
          >
            تأكيد الإجراء
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={props.onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div ref={bodyRef} className="space-y-3 text-sm text-slate-700">
        {availability === "refreshing" && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            جارٍ تحديث البيانات؛ التأكيد متوقف مع الاحتفاظ بالقيم.
          </p>
        )}
        {((availability === "error" && cachedReadState !== "stale") ||
          props.readFailure ||
          readFailure) && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs leading-relaxed text-rose-800"
          >
            <p>
              {readFailure ??
                props.readFailure ??
                "تعذر تحميل البيانات المطلوبة. أعد التحميل قبل التأكيد."}
            </p>
            <button
              type="button"
              className="btn-pill btn-outline px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-50"
              disabled={readBusy}
              onClick={() => {
                void read(props.onReadRetry);
              }}
            >
              إعادة تحميل البيانات
            </button>
          </div>
        )}
        {(props.reviewRequired || cachedReadState === "stale") && (
          <button
            type="button"
            className="btn-pill btn-outline px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-50"
            disabled={readBusy || props.pending}
            onClick={() => {
              void read(props.onReview);
            }}
          >
            مراجعة النطاق الحالي
          </button>
        )}
        {(props.failure || localFailure) && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
          >
            {props.failure ?? localFailure}
          </p>
        )}
        {props.pending && (
          <p
            role="status"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            تابع نتيجة الإجراء المحفوظة. إغلاق النافذة لا يلغي الإرسال.
          </p>
        )}
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!allowed()) return;
            const invalidDate =
              event.currentTarget.querySelector<HTMLInputElement>(
                'input[type="date"]:invalid',
              );
            const orderIndex = invalidDate?.name.match(
              /^orders\.(\d+)\.retryDateText$/u,
            )?.[1];
            if (orderIndex !== undefined) {
              form.setError(
                `orders.${orderIndex as `${number}`}.retryDateText`,
                { type: "validate", message: invalidRetryDateMessage },
                { shouldFocus: true },
              );
              return;
            }
            void form.handleSubmit(submit)(event);
          }}
          className="space-y-3"
        >
          {props.review.orders.map((order) => {
            const index = form
              .getValues("orders")
              .findIndex((value) => value.orderId === order.orderId);
            if (index < 0)
              return (
                <p key={order.orderId} role="alert">
                  تغير نطاق الطلب؛ أغلق النافذة وراجع التحديد.
                </p>
              );
            const detail = "detail" in order ? order.detail : null;
            const receiptRows =
              props.review.operation === "RECEIVE"
                ? props.review.rows.filter(
                    (row) => row.order.id === order.orderId,
                  )
                : [];
            // This numeric path is built from our own stable-ID lookup, never a server field.
            const formIndex = String(index) as `${number}`;
            return (
              <WorkSelectionOrder
                key={order.orderId}
                orderNumber={
                  detail?.summary.businessNumber ??
                  receiptRows[0]?.order.businessNumber ??
                  "غير متاح"
                }
                count={order.pieceIds.length}
                version={order.expectedVersion}
              >
                {detail ? (
                  <>
                    <WorkSelectionPieces
                      rows={detail.paper.order.pieces
                        .filter((piece) => order.pieceIds.includes(piece.id))
                        .map((piece) => ({ piece }))}
                    />
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/40 px-3.5 py-2.5 text-xs sm:grid-cols-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">العميل:</span>
                        <strong className="font-semibold text-slate-900">
                          {detail.deliveryContact.name}
                        </strong>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500">الهاتف:</span>
                        <bdi className="font-mono font-semibold text-slate-900">
                          {detail.deliveryContact.phone}
                        </bdi>
                      </div>
                      <div className="flex items-baseline gap-1.5 sm:col-span-2">
                        <span className="shrink-0 text-slate-500">
                          العنوان:
                        </span>
                        <span className="font-medium text-slate-800">
                          {detail.deliveryContact.address ?? "غير مسجل"}
                        </span>
                      </div>
                      {"attemptId" in order &&
                        order.attemptId &&
                        detail.currentAttempt && (
                          <div className="sm:col-span-2">
                            <span className="inline-flex items-center rounded-md border border-teal-200/80 bg-teal-50/70 px-2 py-0.5 text-[11px] font-bold text-teal-900">
                              محاولة التوصيل رقم {detail.currentAttempt.number}
                            </span>
                          </div>
                        )}
                    </div>
                  </>
                ) : (
                  <WorkSelectionPieces
                    rows={receiptRows}
                    details={(row) => {
                      const handoff = row.work.acceptedHandoff;
                      if (!handoff) return null;
                      return (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                          <span>قبول الجودة: {handoff.actor.fullName}</span>
                          <time dateTime={handoff.acceptedAt}>
                            {acceptanceDate.format(
                              new Date(handoff.acceptedAt),
                            )}
                          </time>
                          {handoff.packingGroupId && (
                            <span>تغليف الجودة مسجّل</span>
                          )}
                        </div>
                      );
                    }}
                  />
                )}
                <div className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50/80 p-3.5 sm:grid-cols-2">
                  {fields(props.review.operation).map((field) => {
                    const path: FieldPath<WarehouseActionFormValues> = `orders.${formIndex}.${field}`,
                      id = `${formId}-${formIndex}-${field}`,
                      error = form.getFieldState(path, form.formState).error;
                    const deliveryTime = field === "deliveredAtText";
                    const retryDate = field === "retryDateText";
                    const fullWidth =
                      field === "notes" ||
                      field === "deliveryNote" ||
                      field === "reason" ||
                      retryDate;
                    return (
                      <div
                        key={field}
                        className={
                          fullWidth
                            ? "space-y-1.5 sm:col-span-2"
                            : "space-y-1.5"
                        }
                      >
                        <label
                          htmlFor={id}
                          className="block text-xs font-bold text-slate-700"
                        >
                          {labels[field]}
                        </label>
                        {field === "reason" ? (
                          <>
                            <textarea
                              id={id}
                              rows={3}
                              placeholder="اكتب سبب تعذر التسليم..."
                              className="oriental-textarea min-h-[76px]! w-full rounded-[10px]! text-xs! leading-relaxed placeholder:text-slate-400 aria-invalid:border-rose-400!"
                              {...form.register(path)}
                              aria-invalid={!!error}
                              aria-describedby={
                                error ? `${id}-error` : undefined
                              }
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {[
                                "العميل لم يجب على الاتصال",
                                "الهاتف مغلق طوال اليوم",
                                "العنوان غير واضح وتعذر الوصول",
                                "طلب العميل تأجيل موعد الاستلام",
                                "العميل غير متواجد بالموقع",
                              ].map((reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50 hover:text-slate-900"
                                  onClick={() => {
                                    form.setValue(
                                      `orders.${formIndex}.reason`,
                                      reason,
                                      {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      },
                                    );
                                  }}
                                >
                                  {reason}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <input
                            id={id}
                            type={
                              deliveryTime
                                ? "datetime-local"
                                : retryDate
                                  ? "date"
                                  : "text"
                            }
                            dir={deliveryTime || retryDate ? "ltr" : undefined}
                            min={retryDate ? "0001-01-01" : undefined}
                            max={retryDate ? "9999-12-31" : undefined}
                            className="oriental-input h-10! min-h-10! w-full rounded-[10px]! px-3! py-0! text-xs! font-medium! placeholder:text-slate-400 aria-invalid:border-rose-400!"
                            placeholder={
                              field === "notes" || field === "deliveryNote"
                                ? "أضف أي ملاحظات اختيارية..."
                                : undefined
                            }
                            {...form.register(path)}
                            onInput={
                              retryDate
                                ? (event) => {
                                    if (event.currentTarget.validity.valid)
                                      form.clearErrors(path);
                                  }
                                : undefined
                            }
                            aria-invalid={!!error}
                            aria-describedby={error ? `${id}-error` : undefined}
                          />
                        )}
                        {error && (
                          <span
                            id={`${id}-error`}
                            role="alert"
                            className="block text-xs font-medium text-rose-700"
                          >
                            {error.message}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {props.review.operation === "FAIL_DELIVERY" && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition-colors select-none hover:border-teal-300 has-checked:border-teal-300 has-checked:bg-teal-50/70 has-checked:text-teal-900">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-teal-700"
                          {...form.register(
                            `orders.${formIndex}.returnedToWarehouse`,
                          )}
                          aria-invalid={
                            !!form.getFieldState(
                              `orders.${formIndex}.returnedToWarehouse`,
                              form.formState,
                            ).error
                          }
                          aria-describedby={`${formId}-${String(index)}-return-error`}
                        />
                        <span>
                          أؤكد عودة جميع قطع هذا الطلب فعلياً إلى المستودع
                        </span>
                      </label>
                      <span
                        id={`${formId}-${String(index)}-return-error`}
                        role="alert"
                        className="block text-xs font-medium text-rose-700"
                      >
                        {
                          form.getFieldState(
                            `orders.${formIndex}.returnedToWarehouse`,
                            form.formState,
                          ).error?.message
                        }
                      </span>
                    </div>
                  )}
                </div>
              </WorkSelectionOrder>
            );
          })}
        </form>
      </div>
    </BaseDialog>
  );
}
