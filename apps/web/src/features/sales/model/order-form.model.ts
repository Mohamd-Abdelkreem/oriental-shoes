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
  draftChangeFieldLabels,
} from "./draft-form.model";
import { toSalesOrderStatusLabel } from "./order-view.model";

const captureFieldLabels: Readonly<Record<string, string>> = {
  ...draftChangeFieldLabels,
  model: "الموديل",
  size: "المقاس",
  leatherBase: "أساس الجلد",
  decoration: "التطعيم",
  decorationColor: "لون التطعيم",
  face: "الوجه",
  faceRight: "م١",
  faceLeft: "م٢",
  mixing: "م٣",
  sole: "الأرضية",
  soleAddition: "إضافة الأرضية",
  soleColor: "لون الأرضية",
  additions: "الإضافات",
  aField: "A",
  fField: "F",
  sideNotes: "الملاحظات الجانبية",
};
type CaptureIssue = Pick<z.core.$ZodIssue, "path"> & {
  code?: z.core.$ZodIssue["code"];
  maximum?: number | bigint;
};
export const orderCaptureIssueMessage = (
  issues: readonly CaptureIssue[],
  capture: DraftFormValues,
): string => {
  const issue = issues[0];
  const path = issue?.path ?? [];
  const pieceIndex = path[0] === "pieces" ? path[1] : undefined;
  const field =
    typeof pieceIndex === "number"
      ? path[path[2] === "catalogSelections" ? 3 : 2]
      : path[0];
  const label =
    typeof field === "string" ? captureFieldLabels[field] : undefined;
  if (label === undefined)
    return "راجع بيانات أمر التفصيل وأكمل الحقول المطلوبة قبل المتابعة.";
  const fields =
    typeof pieceIndex === "number" ? capture.pieces[pieceIndex] : capture;
  const captured: unknown = Object.entries(fields ?? {}).find(
    ([key]) => key === field,
  )?.[1];
  const missing =
    captured == null ||
    (typeof captured === "string" && captured.trim() === "");
  if (field === "customerId")
    return missing
      ? "اختر عميلاً أو أنشئ عميلاً جديداً قبل الإرسال."
      : "اختيار العميل غير صالح؛ اختره مجدداً من نتائج البحث.";
  const prefix =
    typeof pieceIndex === "number" ? `القطعة ${String(pieceIndex + 1)}: ` : "";
  if (missing) return `${prefix}أدخل ${label} قبل المتابعة.`;
  if (issue?.code === "too_big" && issue.maximum !== undefined)
    return `${prefix}${label} أطول من المسموح؛ اختصره إلى ${String(issue.maximum)} حرفاً أو أقل.`;
  if (typeof captured === "string" && captured.includes("\u0000"))
    return `${prefix}${label} يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد المحاولة.`;
  if (field === "deliveryDate")
    return "اختر تاريخ تسليم صحيحاً من التقويم ثم أعد المحاولة.";
  if (field === "paidAmount")
    return "أدخل المبلغ المدفوع كرقم غير سالب، بحد أقصى منزلتين عشريتين.";
  if (path[2] === "catalogSelections")
    return `${prefix}اختر قيمة صحيحة لحقل ${label} من القائمة الحالية.`;
  return `${prefix}راجع حقل ${label} وأدخل قيمة صحيحة قبل المتابعة.`;
};

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
  const invalidPath = Object.keys(failure.fieldErrors)[0];
  const message =
    messages[failure.code] ??
    (invalidPath === undefined
      ? "تعذّر إتمام الطلب. إدخالك محفوظ؛ تحقق من الاتصال وحاول مجدداً."
      : orderCaptureIssueMessage(
          [
            {
              path: invalidPath
                .replace(/^body\.(?:(?:capture|corrections)\.)?/u, "")
                .split(".")
                .map((part) => (/^[0-9]+$/u.test(part) ? Number(part) : part)),
            },
          ],
          form.getValues(),
        ));
  return failure.requestId ? `${message} (${failure.requestId})` : message;
};
