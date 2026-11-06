import type { z } from "zod";
import {
  catalogFieldSchema,
  draftPieceCaptureSchema,
  returnedOrderCorrectionsSchema,
  salesOrderListQuerySchema,
  type SalesOrderDto,
  type ReturnedOrderCorrections,
} from "@template/contracts";
import { getApiError } from "@/services/api/api-client";
import {
  parseDraftEntry,
  isDraftPieceCaptureField,
  type DraftFormValues,
  type DraftFormErrorTarget,
  type DraftSubmitSnapshot,
  type DraftPieceCaptureField,
} from "./draft-form.model";
import { toSalesOrderStatusLabel } from "./order-view.model";

export const parseOrderEditorEntry = parseDraftEntry;
type ListStatus = NonNullable<
  z.output<typeof salesOrderListQuerySchema>["status"]
>;
export type SalesOrderListEntry =
  | { kind: "orders"; status: "ALL" | ListStatus }
  | { kind: "unavailable"; status: string }
  | { kind: "invalid"; reason: "INVALID_STATUS_QUERY" };
export const parseSalesOrderListEntry = (
  status: string | string[] | undefined,
): SalesOrderListEntry => {
  if (status === undefined || status === "ALL" || status === "الكل")
    return { kind: "orders", status: "ALL" };
  if (status === "في المستودع") return { kind: "unavailable", status };
  if (typeof status !== "string")
    return { kind: "invalid", reason: "INVALID_STATUS_QUERY" };
  const aliases: Readonly<Record<string, ListStatus>> = {
    "مع المندوب": "OUT_FOR_DELIVERY",
    "تم الاستلام": "DELIVERED",
    "ملغي بالكامل": "CANCELLED",
  };
  const canonical =
    salesOrderListQuerySchema.shape.status
      .unwrap()
      .options.find(
        (value) =>
          value === status || toSalesOrderStatusLabel(value) === status,
      ) ?? aliases[status];
  return canonical === undefined
    ? { kind: "invalid", reason: "INVALID_STATUS_QUERY" }
    : { kind: "orders", status: canonical };
};
const correctionHeaders = [
  "deliveryDate",
  "generalNotes",
  "responsibleSignature",
  "repairNote",
  "adjustmentRequested",
  "adjustmentReason",
  "adjustmentActionTaken",
] as const;
export const makeReturnedOrderDefaults = (
  order: SalesOrderDto,
): DraftFormValues => ({
  type: order.type,
  customerId: order.customerId,
  paidAmount: order.money.paidAmount,
  deliveryDate: order.deliveryDate,
  generalNotes: order.generalNotes,
  responsibleSignature: order.responsibleSignature,
  repairNote: order.repairNote,
  adjustmentRequested: order.adjustmentRequested,
  adjustmentReason: order.adjustmentReason,
  adjustmentActionTaken: order.adjustmentActionTaken,
  pieces: order.pieces.map((piece) =>
    draftPieceCaptureSchema.strip().parse(piece),
  ),
});
export const toReturnedOrderCorrections = (
  values: DraftFormValues,
  original: SalesOrderDto,
): ReturnedOrderCorrections => {
  if (
    values.pieces.length !== original.pieces.length ||
    values.pieces.some(
      (piece, index) => piece.id !== original.pieces[index]?.id,
    )
  )
    throw new Error("Correction membership changed");
  const pieces = values.pieces.map((piece) => {
    const {
      decoration: _decoration,
      catalogSelections,
      ...permitted
    } = draftPieceCaptureSchema.parse(piece);
    if (catalogSelections === undefined) return permitted;
    const { decoration: _reference, ...editableSelections } = catalogSelections;
    return { ...permitted, catalogSelections: editableSelections };
  });
  return returnedOrderCorrectionsSchema.parse({
    ...Object.fromEntries(
      correctionHeaders.map((field) => [field, values[field]]),
    ),
    pieces,
  });
};
export const makeOrderPaidDefaults = (order: SalesOrderDto) => ({
  paidAmount: order.money.paidAmount,
});
export const applyOrderCommandError = (
  error: unknown,
  form: DraftFormErrorTarget,
  snapshot: DraftSubmitSnapshot,
): string => {
  const failure = getApiError(error);
  let first = true;
  const headers = [
    "type",
    "customerId",
    "paidAmount",
    ...correctionHeaders,
  ] as const;
  for (const [path, messages] of Object.entries(failure.fieldErrors)) {
    const message = messages[0];
    if (message === undefined) continue;
    const header = headers.find(
      (field) =>
        path === `body.capture.${field}` ||
        (correctionHeaders.some((allowed) => allowed === field) &&
          path === `body.corrections.${field}`) ||
        (field === "paidAmount" && path === "body.paidAmount"),
    );
    if (header !== undefined) {
      form.setError(
        header,
        { type: "server", message },
        { shouldFocus: first },
      );
      first = false;
      continue;
    }
    const match =
      /^body\.(capture|corrections)\.pieces\.([0-9]+)\.(?:(catalogSelections)\.)?([A-Za-z]+)$/u.exec(
        path,
      );
    const field = match?.[4],
      index = Number(match?.[2]);
    if (
      !Number.isSafeInteger(index) ||
      field === undefined ||
      !isDraftPieceCaptureField(field) ||
      (match?.[1] === "corrections" && field === "decoration") ||
      (match?.[3] !== undefined &&
        !catalogFieldSchema.options.some((key) => key === field))
    )
      continue;
    const id = snapshot.capture.pieces[index]?.id;
    const current =
      id === undefined
        ? -1
        : form.getValues().pieces.findIndex((piece) => piece.id === id);
    if (current < 0) continue;
    // findIndex supplies a validated integer for the frozen physical piece UUID.
    const position = String(current) as `${number}`;
    const target: `pieces.${number}.${DraftPieceCaptureField}` = `pieces.${position}.${field}`;
    form.setError(target, { type: "server", message }, { shouldFocus: first });
    first = false;
  }
  const messages: Readonly<Record<string, string>> = {
    ORDER_PAID_UNCHANGED: "المبلغ المدفوع مطابق للقيمة الحالية؛ لم يحدث تغيير.",
    ORDER_CALENDAR_UNAVAILABLE:
      "الإرسال غير متاح حتى تهيئة تقويم العمل؛ يمكنك حفظ المسودة دون فقد الإدخال.",
    ORDER_NUMBER_UNAVAILABLE:
      "تعذّر إصدار الرقم المعتمد؛ يمكنك حفظ المسودة والمحاولة بعد استعادة الخدمة.",
    ORDER_CATALOG_UNAVAILABLE:
      "القوائم المطلوبة للإرسال غير متاحة؛ احتفظ بالمواصفات واحفظ المسودة.",
    ORDER_CUSTOMER_CHANGED:
      "تغيرت بيانات العميل؛ احتفظ بالمواصفات وراجع بياناته الحالية قبل إرسال جديد.",
    ORDER_QUOTE_CHANGED:
      "تغير السعر أو مصدر القوائم؛ احتفظ بالمواصفات وراجع عرض السعر الحالي قبل إرسال جديد.",
    ORDER_VERSION_CONFLICT:
      "تغيرت نسخة الطلب؛ احتفظ بإدخالك وراجع البيانات الحالية قبل إرسال جديد.",
    ORDER_STATE_CONFLICT:
      "تغيرت حالة الطلب؛ راجع بياناته الحالية قبل المتابعة.",
    ORDER_CORRECTION_CONFLICT:
      "تغيرت القطع أو الشروط الثابتة؛ احتفظ بالتصحيح وراجع الطلب الحالي.",
  };
  const message =
    messages[failure.code] ??
    "تعذّر إتمام الطلب. احتفظ بإدخالك وراجع البيانات الحالية قبل إعادة المحاولة.";
  return failure.requestId ? `${message} (${failure.requestId})` : message;
};
