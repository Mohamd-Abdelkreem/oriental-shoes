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
  warehouseActionFormSchema,
  toWarehouseCommand,
  applyWarehouseFormErrors,
  warehouseFailureMessage,
  type WarehouseActionFormValues,
} from "../model/warehouse-form.model";
import type {
  WarehouseDialogProps,
  WarehouseReview,
} from "../model/warehouse-view.model";
import { toWarehouseOperationLabel } from "../model/warehouse-event.model";

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
            className="btn-pill btn-teal"
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
        {props.review.operation !== "RECEIVE" && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            يشمل الإجراء جميع القطع النشطة لكل طلب أدناه، بما فيها القطع خارج
            التحديد والصفحة الحالية. راجع النطاق الكامل قبل التأكيد.
          </p>
        )}
        {availability === "refreshing" && (
          <p role="status">
            جارٍ تحديث البيانات؛ التأكيد متوقف مع الاحتفاظ بالقيم.
          </p>
        )}
        {((availability === "error" && cachedReadState !== "stale") ||
          props.readFailure ||
          readFailure) && (
          <div role="alert">
            <p>
              {readFailure ??
                props.readFailure ??
                "تعذر تحميل البيانات المطلوبة. أعد التحميل قبل التأكيد."}
            </p>
            <button
              type="button"
              className="btn-pill btn-outline"
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
            className="btn-pill btn-outline"
            disabled={readBusy || props.pending}
            onClick={() => {
              void read(props.onReview);
            }}
          >
            مراجعة النطاق الحالي
          </button>
        )}
        {(props.failure || localFailure) && (
          <p role="alert">{props.failure ?? localFailure}</p>
        )}
        {props.pending && (
          <p role="status">
            تابع نتيجة الإجراء المحفوظة. إغلاق النافذة لا يلغي الإرسال.
          </p>
        )}
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (allowed()) void form.handleSubmit(submit)(event);
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
            // This numeric path is built from our own stable-ID lookup, never a server field.
            const formIndex = String(index) as `${number}`;
            return (
              <section
                key={order.orderId}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <h3 className="text-xs font-semibold text-slate-800">
                  أمر التفصيل: {detail?.summary.businessNumber ?? order.orderId}{" "}
                  · {order.pieceIds.length} قطعة · الإصدار{" "}
                  {order.expectedVersion}
                </h3>
                <p className="text-xs break-words">
                  القطع المشمولة: {order.pieceIds.join("، ")}
                </p>
                {detail && (
                  <>
                    <p>العميل: {detail.deliveryContact.name}</p>
                    <p>الهاتف: {detail.deliveryContact.phone}</p>
                    <p>
                      العنوان: {detail.deliveryContact.address ?? "غير مسجل"}
                    </p>
                    {"attemptId" in order && order.attemptId && (
                      <p className="text-xs break-all">
                        محاولة التوصيل: {order.attemptId}
                      </p>
                    )}
                  </>
                )}
                {props.review.operation === "RECEIVE" &&
                  props.review.rows
                    .filter((row) => row.order.id === order.orderId)
                    .map((row) => (
                      <p key={row.key} className="text-xs">
                        القطعة {row.piece.id} · قبول الجودة:{" "}
                        {row.work.acceptedHandoff?.actor.fullName} ·{" "}
                        {row.work.acceptedHandoff?.acceptedAt}
                      </p>
                    ))}
                {props.review.operation === "RECEIVE" &&
                  [
                    ...new Set(
                      props.review.rows
                        .filter((row) => row.order.id === order.orderId)
                        .flatMap((row) =>
                          row.work.acceptedHandoff?.packingGroupId
                            ? [row.work.acceptedHandoff.packingGroupId]
                            : [],
                        ),
                    ),
                  ].map((packingId) => (
                    <p key={packingId} className="text-xs break-words">
                      مرجع تغليف الجودة: {packingId} — مستقل عن بيانات هذا
                      الاستلام الفعلي.
                    </p>
                  ))}
                {fields(props.review.operation).map((field) => {
                  const path: FieldPath<WarehouseActionFormValues> = `orders.${formIndex}.${field}`,
                    id = `${formId}-${order.orderId}-${field}`,
                    error = form.getFieldState(path, form.formState).error;
                  return (
                    <div key={field} className="block">
                      <label htmlFor={id}>
                        <span className="mb-1 block text-xs font-semibold text-slate-800">
                          {labels[field]}
                        </span>
                      </label>
                      {field === "reason" ? (
                        <>
                          <textarea
                            id={id}
                            rows={3}
                            className="oriental-input w-full text-xs"
                            {...form.register(path)}
                            aria-invalid={!!error}
                            aria-describedby={error ? `${id}-error` : undefined}
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
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                                onClick={() => {
                                  form.setValue(
                                    `orders.${formIndex}.reason`,
                                    reason,
                                    { shouldDirty: true, shouldValidate: true },
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
                          type="text"
                          className="oriental-input w-full text-xs"
                          placeholder={
                            field === "deliveredAtText"
                              ? "YYYY-MM-DD HH:mm +/-HH:mm"
                              : field === "retryDateText"
                                ? "YYYY-MM-DD"
                                : undefined
                          }
                          {...form.register(path)}
                          aria-invalid={!!error}
                          aria-describedby={error ? `${id}-error` : undefined}
                        />
                      )}
                      {error && (
                        <span
                          id={`${id}-error`}
                          role="alert"
                          className="text-xs text-rose-700"
                        >
                          {error.message}
                        </span>
                      )}
                    </div>
                  );
                })}
                {props.review.operation === "FAIL_DELIVERY" && (
                  <div className="block">
                    <label>
                      <input
                        type="checkbox"
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
                      />{" "}
                      أؤكد عودة جميع قطع هذا الطلب فعلياً إلى المستودع{" "}
                    </label>
                    <span
                      id={`${formId}-${String(index)}-return-error`}
                      role="alert"
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
              </section>
            );
          })}
        </form>
      </div>
    </BaseDialog>
  );
}
