import {
  AdministrationSynchronizationError,
  AdministrationLocalCommandError,
} from "./administration-command-state";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import {
  MAX_DRAFT_PIECES,
  administrationCommandBodySchema,
  administrationCorrectionValuesSchema,
  administrationOrderDataSchema,
  salesOrderMoneySchema,
  salesUuidSchema,
  type AdministrationCommandBody,
  type AdministrationCorrectionValues,
  type AdministrationOrderData,
  type SalesOrderDto,
} from "@template/contracts";
import { ApiContractError, getApiError } from "@/services/api/api-client";

type SubmittedDetail = Extract<AdministrationOrderData, { kind: "submitted" }>;
export type AdministrationCancelReview = Readonly<{
  operation: "ADMIN_CANCEL";
  orderId: string;
  expectedVersion: number;
  scope: "ORDER" | "ITEM" | "QUANTITY";
  pieceIds: readonly string[];
  detail: SubmittedDetail;
}>;
export type AdministrationCancelForm = {
  scope: "ORDER" | "ITEM" | "QUANTITY";
  itemPieceId: string | null;
  selectedPieceIds: readonly string[];
  reason: string;
};
export type AdministrationCorrectionForm = {
  generalNotes: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  reason: string;
};
export type AdministrationCorrectionReview = Readonly<{
  operation: "ADMIN_CORRECT";
  orderId: string;
  expectedVersion: number;
  baseline: AdministrationCorrectionValues;
}>;
const cancelFields = administrationCommandBodySchema.out.options[0].shape;
const correctFields = administrationCommandBodySchema.out.options[1].shape;
const selectedIdsSchema = z
  .array(salesUuidSchema)
  .max(MAX_DRAFT_PIECES)
  .refine((ids) => new Set(ids).size === ids.length);
const correctionFields = [
  "generalNotes",
  "customerName",
  "customerPhone",
  "customerEmail",
  "customerAddress",
] as const;
const reviewMessage =
  "تغيرت بيانات الطلب أو القطع؛ اختر مراجعة البيانات الحالية قبل التأكيد.";
const noChangeMessage =
  "لم تتغير البيانات؛ عدّل أحد الحقول المسموح بها قبل الحفظ.";
const fail = (field: string, message = reviewMessage): never => {
  throw new z.ZodError([
    { code: "custom", path: field ? [field] : [], message },
  ]);
};
export const administrationCancelFormSchema = z
  .object({
    scope: cancelFields.scope,
    itemPieceId: salesUuidSchema.nullable(),
    selectedPieceIds: z.custom<readonly string[]>(
      (ids) => selectedIdsSchema.safeParse(ids).success,
      "اختر قطعاً مختلفة وصحيحة من الطلب.",
    ),
    reason: z.string(),
  })
  .strict()
  .superRefine((form, context) => {
    const reason = cancelFields.reason.safeParse(form.reason);
    if (!reason.success)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: reason.error.issues.some((issue) => issue.code === "too_big")
          ? "سبب الإلغاء أطول من المسموح؛ اختصره إلى ٤٠٠٠ حرف أو أقل."
          : "سبب الإلغاء يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد التأكيد.",
      });
  });
const correctionCapture = (form: AdministrationCorrectionForm) =>
  administrationCorrectionValuesSchema.parse({
    generalNotes: form.generalNotes,
    customerName: form.customerName,
    customerPhone: form.customerPhone,
    customerEmail: form.customerEmail,
    customerAddress: form.customerAddress,
  });
const correctionLabels = {
  generalNotes: "الملاحظات العامة",
  customerName: "اسم العميل",
  customerPhone: "رقم الهاتف",
  customerEmail: "البريد الإلكتروني",
  customerAddress: "عنوان التسليم",
} as const;
const correctionIssueMessage = (
  issue: z.core.$ZodIssue,
  field: (typeof correctionFields)[number],
  form: AdministrationCorrectionForm,
): string => {
  const label = correctionLabels[field],
    captured = form[field];
  if (
    captured.trim() === "" &&
    (field === "customerName" || field === "customerPhone")
  )
    return `أدخل ${label} قبل الحفظ.`;
  if (issue.code === "too_big")
    return `${label} أطول من المسموح؛ اختصره إلى ${String(issue.maximum)} حرفاً أو أقل.`;
  if (captured.includes("\u0000"))
    return `${label} يحتوي على أحرف غير مدعومة؛ احذفها قبل الحفظ.`;
  if (field === "customerPhone")
    return "أدخل رقم هاتف سعودي صحيحاً مثل 0501234567.";
  if (field === "customerEmail")
    return "أدخل بريداً إلكترونياً صحيحاً أو اتركه فارغاً.";
  return `راجع ${label} وأدخل قيمة صحيحة قبل الحفظ.`;
};
export const administrationCorrectionFormSchema = z
  .object({
    generalNotes: z.string(),
    customerName: z.string(),
    customerPhone: z.string(),
    customerEmail: z.string(),
    customerAddress: z.string(),
    reason: z.string(),
  })
  .strict()
  .superRefine((form, context) => {
    const capture = administrationCorrectionValuesSchema.safeParse({
      generalNotes: form.generalNotes,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      customerAddress: form.customerAddress,
    });
    if (!capture.success)
      for (const issue of capture.error.issues) {
        const field = correctionFields.find((name) => name === issue.path[0]);
        if (field)
          context.addIssue({
            code: "custom",
            path: [field],
            message: correctionIssueMessage(issue, field, form),
          });
      }
    if (!correctFields.reason.safeParse(form.reason).success)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "أدخل سبب التصحيح في حدود ٤٠٠٠ حرف.",
      });
  });
const submittedDetail = (input: AdministrationOrderData): SubmittedDetail => {
  const detail = administrationOrderDataSchema.parse(input);
  if (detail.kind !== "submitted") return fail("");
  return detail;
};
const validateSelection = (
  detail: SubmittedDetail,
  ids: readonly string[],
): string[] => {
  const parsed = cancelFields.pieceIds.safeParse(ids);
  if (!parsed.success)
    return fail(
      "selectedPieceIds",
      "اختر قطعة مؤهلة واحدة على الأقل دون تكرار.",
    );
  if (
    !detail.adminActions.canCancel ||
    ["OUT_FOR_DELIVERY", "DELIVERED"].includes(detail.order.status)
  )
    return fail("");
  for (const id of parsed.data) {
    if (
      !detail.cancellationCandidates.some(
        (piece) =>
          piece.pieceId === id && piece.eligible && piece.stage !== "CANCELLED",
      )
    )
      return fail("selectedPieceIds");
  }
  return parsed.data;
};
export const captureAdministrationCancellation = (
  input: AdministrationOrderData,
  values: AdministrationCancelForm,
): AdministrationCancelReview => {
  const detail = submittedDetail(input),
    form = administrationCancelFormSchema.parse(values);
  const ids =
    form.scope === "ORDER"
      ? detail.order.pieces
          .filter((piece) => piece.stage !== "CANCELLED")
          .map((piece) => piece.id)
      : form.scope === "ITEM"
        ? form.itemPieceId === null
          ? []
          : [form.itemPieceId]
        : form.selectedPieceIds;
  const pieceIds = validateSelection(detail, ids);
  cancelFields.expectedVersion.parse(detail.order.version);
  return {
    operation: "ADMIN_CANCEL",
    orderId: detail.order.id,
    expectedVersion: detail.order.version,
    scope: form.scope,
    pieceIds,
    detail,
  };
};
const validatedReview = (
  review: AdministrationCancelReview,
): AdministrationCancelReview => {
  const captured = captureAdministrationCancellation(review.detail, {
    scope: review.scope,
    itemPieceId: review.pieceIds[0] ?? null,
    selectedPieceIds: review.pieceIds,
    reason: "",
  });
  if (
    review.orderId !== captured.orderId ||
    review.expectedVersion !== captured.expectedVersion ||
    JSON.stringify([...review.pieceIds].toSorted()) !==
      JSON.stringify(captured.pieceIds)
  )
    return fail("");
  return captured;
};
export const reviewAdministrationCancellation = (
  review: AdministrationCancelReview,
  input: AdministrationOrderData,
): AdministrationCancelReview => {
  const retained = validatedReview(review),
    detail = submittedDetail(input);
  if (detail.order.id !== retained.orderId) return fail("");
  const refreshed = captureAdministrationCancellation(detail, {
    scope: retained.scope,
    itemPieceId: retained.pieceIds[0] ?? null,
    selectedPieceIds: retained.pieceIds,
    reason: "",
  });
  if (JSON.stringify(refreshed.pieceIds) !== JSON.stringify(retained.pieceIds))
    return fail("selectedPieceIds");
  return refreshed;
};
export const toAdministrationCancelCommand = (
  review: AdministrationCancelReview,
  reason: string,
  commandId: string,
): AdministrationCommandBody => {
  const retained = validatedReview(review);
  return administrationCommandBodySchema.parse({
    commandId,
    operation: retained.operation,
    orderId: retained.orderId,
    expectedVersion: retained.expectedVersion,
    scope: retained.scope,
    pieceIds: retained.pieceIds,
    reason,
  });
};
const decimal = (cents: bigint): string =>
  `${String(cents / 100n)}.${String(cents % 100n).padStart(2, "0")}`;
export const previewAdministrationCancellation = (
  input: SubmittedDetail,
  pieceIds: readonly string[],
): SalesOrderDto["money"] => {
  const detail = submittedDetail(input),
    selection = new Set(validateSelection(detail, pieceIds));
  const total = detail.order.pieces
    .filter((piece) => piece.stage !== "CANCELLED" && !selection.has(piece.id))
    .reduce((sum, piece) => sum + BigInt(piece.unitPrice.replace(".", "")), 0n);
  const paid = BigInt(detail.order.money.paidAmount.replace(".", ""));
  return salesOrderMoneySchema.parse({
    total: decimal(total),
    paidAmount: decimal(paid),
    remainingDue: decimal(total > paid ? total - paid : 0n),
    surplus: decimal(paid > total ? paid - total : 0n),
  });
};
export const makeAdministrationCorrectionDefaults = (
  input: AdministrationCorrectionValues,
): AdministrationCorrectionForm => {
  const values = administrationCorrectionValuesSchema.parse(input);
  return {
    ...values,
    generalNotes: values.generalNotes ?? "",
    customerEmail: values.customerEmail ?? "",
    customerAddress: values.customerAddress ?? "",
    reason: "",
  };
};
export const toAdministrationCorrectionCommand = (
  review: AdministrationCorrectionReview,
  values: AdministrationCorrectionForm,
  commandId: string,
): AdministrationCommandBody => {
  const form = administrationCorrectionFormSchema.parse(values),
    normalized = correctionCapture(form);
  const baseline = administrationCorrectionValuesSchema.parse(review.baseline);
  const patch: Partial<AdministrationCorrectionValues> = {};
  for (const field of correctionFields) {
    if (normalized[field] === baseline[field]) continue;
    if (field === "customerName" || field === "customerPhone")
      patch[field] = normalized[field];
    else patch[field] = normalized[field];
  }
  if (Object.keys(patch).length === 0) return fail("", noChangeMessage);
  return administrationCommandBodySchema.parse({
    commandId,
    operation: review.operation,
    orderId: review.orderId,
    expectedVersion: review.expectedVersion,
    patch,
    reason: form.reason,
  });
};
const administrationFailureCopy = (
  error: unknown,
  action: "review" | "ADMIN_CANCEL" | "ADMIN_CORRECT" | "report",
): string => {
  if (
    error instanceof AdministrationSynchronizationError ||
    error instanceof AdministrationLocalCommandError
  )
    return error.message;
  if (error instanceof z.ZodError)
    return error.issues.some((issue) => issue.message === noChangeMessage)
      ? noChangeMessage
      : "راجع الحقول والقطع المحددة قبل التأكيد.";
  const failure = getApiError(error);
  if (failure.code === "REPORT_SCOPE_TOO_LARGE")
    return "نطاق التقرير كبير؛ ضيّق الفلاتر ثم أعد المحاولة.";
  if (failure.statusCode === 401 || failure.statusCode === 403)
    return "تعذر التحقق من صلاحيتك؛ راجع الحساب والصلاحيات ثم حدّث البيانات.";
  if (
    failure.code.includes("VERSION") ||
    failure.code.includes("SELECTION") ||
    failure.code.includes("INELIGIBLE")
  )
    return reviewMessage;
  if (
    action.startsWith("ADMIN_") &&
    (error instanceof ApiContractError ||
      failure.statusCode === 0 ||
      failure.statusCode >= 500)
  )
    return "نتيجة الحفظ غير مؤكدة؛ راجع نتيجة الإجراء الأصلي من لوحة الاستعادة قبل أي محاولة جديدة.";
  return action === "report"
    ? "تعذر تحميل التقرير؛ احتفظ بالفلاتر وأعد المحاولة."
    : action === "review"
      ? "تعذر تحميل البيانات الحالية؛ احتفظ باختيارك وأعد المحاولة."
      : "تعذر إكمال الإجراء؛ احتفظ بإدخالك وراجع البيانات ثم أعد المحاولة.";
};
export const administrationFailureMessage = (
  error: unknown,
  action: "review" | "ADMIN_CANCEL" | "ADMIN_CORRECT" | "report",
): string => {
  const message = administrationFailureCopy(error, action),
    reference = getApiError(error)
      .requestId.replace(/[^a-zA-Z0-9_-]/gu, "")
      .slice(0, 128);
  return reference ? `${message} (مرجع الطلب: ${reference})` : message;
};
type CancelTarget = Pick<
  UseFormReturn<AdministrationCancelForm>,
  "getValues" | "setError"
>;
type CorrectionTarget = Pick<
  UseFormReturn<AdministrationCorrectionForm>,
  "getValues" | "setError"
>;
const isCancelTarget = (
  form: CancelTarget | CorrectionTarget,
): form is CancelTarget => "scope" in form.getValues();
export const applyAdministrationFormError = (
  error: unknown,
  form: CancelTarget | CorrectionTarget,
): string => {
  const errors =
    error instanceof z.ZodError
      ? error.issues.map((issue) => ({
          path: issue.path.join("."),
          message:
            issue.code === "custom" ? issue.message : "راجع القيمة المدخلة.",
        }))
      : Object.entries(getApiError(error).fieldErrors).flatMap(
          ([path, messages]) =>
            messages[0]
              ? [
                  {
                    path: path.replace(/^body\./, "").replace(/^patch\./, ""),
                    message: "راجع القيمة المدخلة قبل الحفظ.",
                  },
                ]
              : [],
        );
  for (const issue of errors) {
    if (isCancelTarget(form)) {
      const field = issue.path.startsWith("pieceIds")
        ? "selectedPieceIds"
        : ["scope", "itemPieceId", "selectedPieceIds", "reason"].find(
            (name) => name === issue.path,
          );
      if (
        field === "scope" ||
        field === "itemPieceId" ||
        field === "selectedPieceIds" ||
        field === "reason"
      )
        form.setError(field, {
          type: "server",
          message:
            error instanceof z.ZodError
              ? issue.message
              : field === "reason"
                ? "راجع سبب الإلغاء واختصره عند الحاجة."
                : "راجع اختيار القطع ونوع الإلغاء ثم اختر مراجعة البيانات الحالية.",
        });
    } else {
      const field = [...correctionFields, "reason" as const].find(
        (name) => name === issue.path,
      );
      if (field)
        form.setError(field, {
          type: "server",
          message:
            error instanceof z.ZodError
              ? issue.message
              : `راجع ${field === "reason" ? "سبب التصحيح" : correctionLabels[field]} قبل الحفظ.`,
        });
    }
  }
  return administrationFailureMessage(
    error,
    isCancelTarget(form) ? "ADMIN_CANCEL" : "ADMIN_CORRECT",
  );
};
