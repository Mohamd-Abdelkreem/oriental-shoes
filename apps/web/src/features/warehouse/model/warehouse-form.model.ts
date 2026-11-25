import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import {
  salesUuidSchema,
  warehouseOptionalTextSchema,
  warehouseRequiredReasonSchema,
  warehouseCommandBodySchema,
  type WarehouseCommandBody,
  type WarehouseCommandOperation,
} from "@template/contracts";
import { apiFailureMessage, getApiError } from "@/services/api/api-client";
import type { WarehouseReview } from "./warehouse-view.model";
import {
  WarehouseLocalCommandError,
  WarehouseSynchronizationError,
} from "./warehouse-command-state";
import {
  toWarehouseDeliveredAt,
  toWarehouseRetryDate,
} from "./warehouse-date.model";

const invalidDeliveryTimeMessage =
  "وقت وتاريخ التسليم غير صالحين. اختر تاريخًا ووقتًا صحيحين أو اترك الخانة فارغة.";

export const invalidRetryDateMessage =
  "موعد المحاولة الجديدة غير صالح. اختر تاريخًا صحيحًا أو اترك الخانة فارغة.";

const editableText = (label: string, required = false) =>
  z
    .string({ error: `${label} غير صالح؛ راجع القيمة ثم أعد التأكيد.` })
    .superRefine((text, ctx) => {
      const parsed = (
        required ? warehouseRequiredReasonSchema : warehouseOptionalTextSchema
      ).safeParse(text);
      if (!parsed.success)
        ctx.addIssue({
          code: "custom",
          message:
            text.length > 4000
              ? `${label} بحد أقصى ٤٠٠٠ حرف؛ اختصر النص دون حذف بقية القيم.`
              : text.includes("\u0000")
                ? `${label} يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد التأكيد.`
                : `${label} مطلوب؛ أدخله ثم أعد التأكيد.`,
        });
    });
const editableDate = (
  label: string,
  parse: (text: string) => string | null,
  message: string,
) =>
  z.string({ error: `${label} غير صالح.` }).superRefine((text, ctx) => {
    try {
      parse(text);
    } catch (error: unknown) {
      if (!(error instanceof z.ZodError)) throw error;
      ctx.addIssue({
        code: "custom",
        message,
      });
    }
  });
const orderId = { orderId: salesUuidSchema };
const orders = <T extends z.ZodType>(entry: T) =>
  z.array(entry).min(1).max(200);
export const warehouseActionFormSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("RECEIVE"),
      orders: orders(
        z
          .object({
            ...orderId,
            cartonCount: editableText("عدد الكراتين"),
            storageLocation: editableText("موقع التخزين"),
            notes: editableText("ملاحظات الاستلام"),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      operation: z.literal("DISPATCH"),
      orders: orders(
        z
          .object({
            ...orderId,
            deliveryNote: editableText("ملاحظات التسليم للمندوب"),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CONFIRM_DELIVERY"),
      orders: orders(
        z
          .object({
            ...orderId,
            recipient: editableText("اسم المستلم"),
            deliveredAtText: editableDate(
              "وقت التسليم الفعلي",
              toWarehouseDeliveredAt,
              invalidDeliveryTimeMessage,
            ),
            notes: editableText("ملاحظات التسليم"),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      operation: z.literal("FAIL_DELIVERY"),
      orders: orders(
        z
          .object({
            ...orderId,
            reason: editableText("سبب تعذر التسليم", true),
            notes: editableText("ملاحظات الإرجاع"),
            returnedToWarehouse: z
              .boolean({ error: "تأكيد عودة جميع القطع مطلوب." })
              .refine((acknowledged) => acknowledged, {
                message:
                  "أكد عودة جميع قطع الطلب فعلياً إلى المستودع قبل تسجيل التعذر.",
              }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      operation: z.literal("RETRY_DELIVERY"),
      orders: orders(
        z
          .object({
            ...orderId,
            retryDateText: editableDate(
              "موعد المحاولة الجديدة",
              toWarehouseRetryDate,
              invalidRetryDateMessage,
            ),
            notes: editableText("ملاحظات المحاولة الجديدة"),
          })
          .strict(),
      ),
    })
    .strict(),
]);
export type WarehouseActionFormValues = z.input<
  typeof warehouseActionFormSchema
>;

export const toWarehouseCommand = (
  input: WarehouseActionFormValues,
  review: WarehouseReview,
  commandId: string,
): WarehouseCommandBody => {
  const values = warehouseActionFormSchema.parse(input);
  if (
    values.operation !== review.operation ||
    values.orders.length !== review.orders.length ||
    new Set(values.orders.map((order) => order.orderId)).size !==
      values.orders.length ||
    !values.orders.every((order) =>
      review.orders.some((group) => group.orderId === order.orderId),
    )
  )
    throw new WarehouseLocalCommandError("MISMATCH");
  const base = (orderId: string) => {
    const group = review.orders.find((group) => group.orderId === orderId);
    if (group === undefined) throw new WarehouseLocalCommandError("MISMATCH");
    return {
      orderId,
      expectedVersion: group.expectedVersion,
      pieceIds: [...group.pieceIds],
    };
  };
  const attempt = (orderId: string) => {
    if (review.operation === "RECEIVE")
      throw new WarehouseLocalCommandError("MISMATCH");
    const group = review.orders.find((group) => group.orderId === orderId);
    if (group?.attemptId === null || group === undefined)
      throw new WarehouseLocalCommandError("MISMATCH");
    return { ...base(orderId), attemptId: group.attemptId };
  };
  switch (values.operation) {
    case "RECEIVE":
      return warehouseCommandBodySchema.parse({
        commandId,
        operation: values.operation,
        orders: values.orders.map((order) => ({
          ...base(order.orderId),
          receipt: {
            cartonCount: order.cartonCount,
            storageLocation: order.storageLocation,
            notes: order.notes,
          },
        })),
      });
    case "DISPATCH":
      return warehouseCommandBodySchema.parse({
        commandId,
        operation: values.operation,
        orders: values.orders.map((order) => ({
          ...base(order.orderId),
          deliveryNote: order.deliveryNote,
        })),
      });
    case "CONFIRM_DELIVERY":
      return warehouseCommandBodySchema.parse({
        commandId,
        operation: values.operation,
        orders: values.orders.map((order) => ({
          ...attempt(order.orderId),
          recipient: order.recipient,
          deliveredAt: toWarehouseDeliveredAt(order.deliveredAtText),
          notes: order.notes,
        })),
      });
    case "FAIL_DELIVERY":
      return warehouseCommandBodySchema.parse({
        commandId,
        operation: values.operation,
        orders: values.orders.map((order) => ({
          ...attempt(order.orderId),
          reason: order.reason,
          notes: order.notes,
          returnedToWarehouse: order.returnedToWarehouse,
        })),
      });
    case "RETRY_DELIVERY":
      return warehouseCommandBodySchema.parse({
        commandId,
        operation: values.operation,
        orders: values.orders.map((order) => ({
          ...attempt(order.orderId),
          retryDate: toWarehouseRetryDate(order.retryDateText),
          notes: order.notes,
        })),
      });
  }
};
const operationLabels = {
  RECEIVE: "استلام القطع",
  DISPATCH: "إخراج الطلب للتسليم",
  CONFIRM_DELIVERY: "تأكيد استلام العميل",
  FAIL_DELIVERY: "تسجيل تعذر التسليم وعودة القطع",
  RETRY_DELIVERY: "إعادة الطلب إلى الجاهز",
  read: "قراءة بيانات المستودع",
  review: "مراجعة الطلبات والقطع",
};
const fieldLabels: Readonly<Record<string, string>> = {
  cartonCount: "عدد الكراتين",
  storageLocation: "موقع التخزين",
  notes: "الملاحظات",
  deliveryNote: "ملاحظات التسليم للمندوب",
  recipient: "اسم المستلم",
  deliveredAtText: "وقت التسليم الفعلي",
  deliveredAt: "وقت التسليم الفعلي",
  reason: "سبب تعذر التسليم",
  returnedToWarehouse: "تأكيد عودة جميع القطع",
  retryDateText: "موعد المحاولة الجديدة",
  retryDate: "موعد المحاولة الجديدة",
};
export const warehouseFailureMessage = (
  error: unknown,
  action: WarehouseCommandOperation | "read" | "review",
  field?: string,
): string => {
  const label = operationLabels[action];
  if (action === "review")
    return `تعذر ${label}. لم يتم إرسال إجراء حفظ من هذه المراجعة؛ أعد تحميل البيانات وراجع الطلبات المحددة. الحد الأقصى ٢٠٠ قطعة للإجراء الكامل؛ قلل التحديد عند تجاوز النطاق.`;
  if (action === "read")
    return `تعذر ${label}. ${apiFailureMessage(error)} لم يتم إرسال إجراء حفظ من هذه المراجعة؛ أعد تحميل البيانات وراجع الطلبات المحددة.`;
  if (field === "returnedToWarehouse")
    return "تأكيد عودة جميع قطع الطلب فعلياً إلى المستودع مطلوب قبل تسجيل التعذر.";
  if (field === "deliveredAt" || field === "deliveredAtText")
    return invalidDeliveryTimeMessage;
  if (field === "retryDate" || field === "retryDateText")
    return invalidRetryDateMessage;
  if (field !== undefined)
    return `${fieldLabels[field] ?? "الحقل"} ${field === "reason" ? "مطلوب" : "اختياري"} وبحد أقصى ٤٠٠٠ حرف، دون أحرف غير مدعومة؛ راجع القيمة ثم أعد التأكيد.`;
  if (error instanceof WarehouseSynchronizationError) return error.message;
  if (error instanceof WarehouseLocalCommandError)
    return `تعذر ${label}. راجع نتيجة الإجراء الحالي والتحديد قبل تأكيد جديد.`;
  if (error instanceof z.ZodError)
    return `تعذر ${label}: راجع الحقول والتحديد قبل التأكيد؛ لم يتم إرسال طلب حفظ.`;
  const { code, message, statusCode, requestId } = getApiError(error),
    reference = requestId.replace(/[^\w.-]/g, "").slice(0, 128);
  switch (code) {
    case "PAYLOAD_TOO_LARGE":
      return `رُفض هذا الطلب لحجمه؛ قلّل النص أو التحديد ثم راجعه مجدداً دون تقسيم تلقائي. إذا كانت نتيجة طلب سابق غير مؤكدة فتحقق منه أولاً.`;
    case "ORDER_VERSION_CONFLICT":
    case "ORDER_STATE_CONFLICT":
    case "WAREHOUSE_SELECTION_CONFLICT":
      return `تعذر ${label}: تغيّر التحديد أو حالته؛ لم يُحفظ أي جزء من هذا الطلب. حدّث جميع الطلبات وراجع النطاق كاملاً قبل التأكيد.`;
    case "WAREHOUSE_COMMAND_CONFLICT":
      return `معرّف الإجراء مرتبط بتأكيد مختلف؛ تحقق من النتيجة الأصلية قبل إجراء جديد.`;
    case "WAREHOUSE_TRANSACTION_CONFLICT":
      return `نتيجة ${label} غير مؤكدة؛ تحقق من النتيجة الأصلية قبل إعادة الإرسال بنفس المعرّف والبيانات.`;
    case "ACCOUNT_RESTRICTED":
    case "DEPARTMENT_ACCESS_DENIED":
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return `تعذر ${label}: صلاحية المستودع غير متاحة الآن؛ راجع الحساب ومساحة العمل المسموحة.`;
    case "ORDER_NOT_FOUND":
    case "WAREHOUSE_COMMAND_NOT_FOUND":
      return `الطلب أو النتيجة الأصلية غير متاح الآن؛ حدّث العرض. غياب النتيجة لا يثبت فشل الحفظ.`;
  }
  const unknownResult = statusCode === 0 || statusCode >= 500;
  return `تعذر ${label}. ${message}${unknownResult ? " قد تكون النتيجة غير مؤكدة؛ تحقق من الإجراء الأصلي قبل إرساله مجدداً." : ""}${reference ? ` المرجع: ${reference}` : ""}`;
};
// The index comes from a successful array lookup, never from a server field path.
const formIndex = (index: number): `${number}` => String(index) as `${number}`;
export const applyWarehouseFormErrors = (
  error: unknown,
  form: Pick<
    UseFormReturn<WarehouseActionFormValues>,
    "getValues" | "setError"
  >,
  submittedBody: WarehouseCommandBody,
): string => {
  const current = form.getValues();
  if (current.operation !== submittedBody.operation)
    return warehouseFailureMessage(error, submittedBody.operation);
  for (const rawField of Object.keys(getApiError(error).fieldErrors)) {
    const match =
      /^orders\.(\d+)\.(receipt\.(?:cartonCount|storageLocation|notes)|deliveryNote|recipient|deliveredAt|reason|notes|returnedToWarehouse|retryDate)$/u.exec(
        rawField.replace(/^body\./u, "").replace(/\[(\d+)\]/gu, ".$1"),
      );
    if (match === null) continue;
    const submitted = submittedBody.orders[Number(match[1])];
    if (submitted === undefined) continue;
    const index = current.orders.findIndex(
        (order) => order.orderId === submitted.orderId,
      ),
      field = match[2];
    if (index < 0 || field === undefined) continue;
    const i = formIndex(index),
      failure = {
        type: "server",
        message: warehouseFailureMessage(
          error,
          submittedBody.operation,
          field.replace(/^receipt\./u, ""),
        ),
      };
    switch (field) {
      case "receipt.cartonCount":
        if (current.operation === "RECEIVE")
          form.setError(`orders.${i}.cartonCount`, failure);
        break;
      case "receipt.storageLocation":
        if (current.operation === "RECEIVE")
          form.setError(`orders.${i}.storageLocation`, failure);
        break;
      case "receipt.notes":
        if (current.operation === "RECEIVE")
          form.setError(`orders.${i}.notes`, failure);
        break;
      case "deliveryNote":
        if (current.operation === "DISPATCH")
          form.setError(`orders.${i}.deliveryNote`, failure);
        break;
      case "recipient":
        if (current.operation === "CONFIRM_DELIVERY")
          form.setError(`orders.${i}.recipient`, failure);
        break;
      case "deliveredAt":
        if (current.operation === "CONFIRM_DELIVERY")
          form.setError(`orders.${i}.deliveredAtText`, failure);
        break;
      case "reason":
        if (current.operation === "FAIL_DELIVERY")
          form.setError(`orders.${i}.reason`, failure);
        break;
      case "returnedToWarehouse":
        if (current.operation === "FAIL_DELIVERY")
          form.setError(`orders.${i}.returnedToWarehouse`, failure);
        break;
      case "retryDate":
        if (current.operation === "RETRY_DELIVERY")
          form.setError(`orders.${i}.retryDateText`, failure);
        break;
      case "notes":
        if (current.operation !== "DISPATCH" && current.operation !== "RECEIVE")
          form.setError(`orders.${i}.notes`, failure);
        break;
    }
  }
  return warehouseFailureMessage(error, submittedBody.operation);
};
