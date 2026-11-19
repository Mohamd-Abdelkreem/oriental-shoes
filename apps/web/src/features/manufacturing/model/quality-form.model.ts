import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import {
  qualityCommandBodySchema,
  salesUuidSchema,
  salesVersionSchema,
  MAX_DRAFT_PIECES,
  type QualityCommandBody,
} from "@template/contracts";
import { getApiError } from "@/services/api/api-client";
import {
  QualityLocalCommandError,
  QualitySynchronizationError,
} from "./quality-command-state";

const text = (label: string) =>
  z
    .string({ error: `${label} غير صالح؛ أدخل نصاً ثم أعد التأكيد.` })
    .nullish()
    .transform((value) => value ?? "");
const validateInspectionText = (
  draft: string,
  label: string,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
) => {
  if (draft.length > 4000)
    ctx.addIssue({
      code: "custom",
      path,
      message: `${label} بحد أقصى ٤٠٠٠ حرف؛ اختصره ثم أعد التأكيد.`,
    });
  if (draft.includes("\u0000"))
    ctx.addIssue({
      code: "custom",
      path,
      message: `${label} يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد التأكيد.`,
    });
};
const inspectionPiece = z
  .object({
    pieceId: salesUuidSchema,
    included: z.boolean(),
    decision: z.enum(["UNDECIDED", "ACCEPT", "REJECT"], {
      error:
        "نتيجة القطعة غير صالحة؛ اختر قبول القطعة أو رفضها ثم أعد التأكيد.",
    }),
    target: z
      .string({
        error: "قسم التصحيح غير صالح؛ اختر قسم القص أو الإنتاج ثم أعد التأكيد.",
      })
      .nullish()
      .transform((value) => (value === "" ? null : (value ?? null))),
    reason: text("سبب الرفض"),
    instructions: text("تعليمات التصحيح"),
  })
  .strict();
export const qualityInspectionFormSchema = z
  .object({
    orders: z
      .array(
        z
          .object({
            orderId: salesUuidSchema,
            expectedVersion: salesVersionSchema,
            inspectorNote: text("ملاحظات الفحص"),
            cartonCount: text("عدد الكراتين"),
            cartonNumbers: text("أرقام الكراتين"),
            pieces: z.array(inspectionPiece).min(1).max(MAX_DRAFT_PIECES),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_DRAFT_PIECES),
  })
  .strict()
  .superRefine((values, ctx) => {
    let included = 0;
    values.orders.forEach((order, i) => {
      order.pieces.forEach((piece, j) => {
        if (!piece.included) return;
        included++;
        const path = ["orders", i, "pieces", j];
        if (piece.decision === "UNDECIDED")
          ctx.addIssue({
            code: "custom",
            path: [...path, "decision"],
            message: "اختر قبول القطعة أو رفضها قبل التأكيد.",
          });
        if (piece.decision !== "REJECT") return;
        if (piece.target !== "CUTTING" && piece.target !== "PRODUCTION")
          ctx.addIssue({
            code: "custom",
            path: [...path, "target"],
            message: "قسم التصحيح مطلوب؛ اختر القص أو الإنتاج ثم أعد التأكيد.",
          });
        validateInspectionText(piece.reason, "سبب الرفض", ctx, [
          ...path,
          "reason",
        ]);
        if (piece.reason.trim() === "")
          ctx.addIssue({
            code: "custom",
            path: [...path, "reason"],
            message: "سبب الرفض مطلوب؛ أدخله ثم أعد التأكيد.",
          });
        validateInspectionText(piece.instructions, "تعليمات التصحيح", ctx, [
          ...path,
          "instructions",
        ]);
        if (piece.instructions.trim() === "")
          ctx.addIssue({
            code: "custom",
            path: [...path, "instructions"],
            message: "تعليمات التصحيح مطلوبة؛ أدخلها ثم أعد التأكيد.",
          });
      });
      if (
        order.pieces.some(
          (piece) => piece.included && piece.decision === "ACCEPT",
        )
      ) {
        validateInspectionText(order.cartonCount, "عدد الكراتين", ctx, [
          "orders",
          i,
          "cartonCount",
        ]);
        validateInspectionText(order.cartonNumbers, "أرقام الكراتين", ctx, [
          "orders",
          i,
          "cartonNumbers",
        ]);
      }
      if (order.pieces.some((piece) => piece.included))
        validateInspectionText(order.inspectorNote, "ملاحظات الفحص", ctx, [
          "orders",
          i,
          "inspectorNote",
        ]);
    });
    if (included === 0 || included > MAX_DRAFT_PIECES)
      ctx.addIssue({
        code: "custom",
        path: ["orders"],
        message: "اختر من قطعة واحدة إلى ٢٠٠ قطعة للفحص.",
      });
  });
export type QualityInspectionFormValues = z.input<
  typeof qualityInspectionFormSchema
>;
// Canonical fields retain wire validation and normalization; only UI messages change.
const reportFields = qualityCommandBodySchema.options[3].shape;
const localReportText =
  <T>(schema: z.ZodType<T>, label: string) =>
  (draft: string | null | undefined, ctx: z.RefinementCtx): T => {
    const parsed = schema.safeParse(draft);
    if (parsed.success) return parsed.data;
    const message =
      typeof draft === "string" && draft.length > 4000
        ? `${label} بحد أقصى ٤٠٠٠ حرف؛ اختصره ثم أعد التأكيد.`
        : typeof draft === "string" && draft.includes("\u0000")
          ? `${label} يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد التأكيد.`
          : `${label} مطلوب؛ أدخل نصاً صالحاً ثم أعد التأكيد.`;
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  };
export const qualityIssueFormSchema = z.object({
  reason: z
    .string({ error: "سبب المشكلة مطلوب؛ أدخله ثم أعد التأكيد." })
    .transform(localReportText(reportFields.reason, "سبب المشكلة")),
  notes: z
    .string({
      error:
        "ملاحظات إضافية غير صالحة؛ أدخل نصاً أو اتركها فارغة ثم أعد التأكيد.",
    })
    .nullish()
    .transform(localReportText(reportFields.notes, "ملاحظات إضافية")),
});
export type QualityIssueFormValues = z.input<typeof qualityIssueFormSchema>;
export const toQualityIssueBody = (
  values: QualityIssueFormValues,
  base: {
    commandId: string;
    orders: Extract<
      QualityCommandBody,
      { operation: "REPORT_ISSUES" }
    >["orders"];
  },
): QualityCommandBody =>
  qualityCommandBodySchema.parse({
    ...base,
    ...qualityIssueFormSchema.parse(values),
    operation: "REPORT_ISSUES",
  });

const fieldLabels: Readonly<Record<string, string>> = {
  reason: "السبب",
  instructions: "تعليمات التصحيح",
  target: "قسم التصحيح",
  decision: "نتيجة القطعة",
  notes: "الملاحظات",
  inspectorNote: "ملاحظات الفحص",
  cartonCount: "عدد الكراتين",
  cartonNumbers: "أرقام الكراتين",
};
export const qualityFailureMessage = (
  error: unknown,
  action: string,
  field?: string,
  context: "read" | "write" = "write",
): string => {
  if (field === "target")
    return `تعذر ${action}: اختر قسم القص أو الإنتاج للتصحيح ثم أعد التأكيد.`;
  if (field === "decision")
    return `تعذر ${action}: اختر قبول القطعة أو رفضها، أو اتركها صراحةً دون فحص.`;
  if (field !== undefined) {
    const label = fieldLabels[field] ?? "الحقل";
    return field === "reason" || field === "instructions"
      ? `تعذر ${action}: أدخل ${label} المطلوب، بحد أقصى ٤٠٠٠ حرف، ثم أعد التأكيد.`
      : `تعذر ${action}: ${label} اختياري وبحد أقصى ٤٠٠٠ حرف. اختصر النص أو اتركه فارغاً ثم أعد التأكيد.`;
  }
  if (error instanceof QualitySynchronizationError) return error.message;
  if (error instanceof QualityLocalCommandError)
    return `تعذر ${action}: راجع نتيجة الإجراء الحالي والقطع المحددة قبل تأكيد جديد.`;
  const {
    code,
    message,
    requestId: rawRequestId,
    statusCode,
  } = getApiError(error);
  const requestId = rawRequestId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 100);
  if (context === "read") {
    const reason = [
      "ACCOUNT_RESTRICTED",
      "DEPARTMENT_ACCESS_DENIED",
      "FORBIDDEN",
      "UNAUTHORIZED",
    ].includes(code)
      ? "صلاحية الجودة غير متاحة الآن؛ راجع الحساب ومساحة العمل المسموحة."
      : code === "QUALITY_COMMAND_NOT_FOUND"
        ? "النتيجة الأصلية غير متاحة الآن؛ غيابها لا يثبت فشل حفظ الإجراء."
        : `البيانات غير متاحة للقراءة الآن. ${message} حدّث العرض وراجع القطع قبل التأكيد.`;
    return `تعذر ${action}: ${reason}${requestId ? ` مرجع المتابعة: ${requestId}` : ""}`;
  }
  switch (code) {
    case "PAYLOAD_TOO_LARGE":
      return `تعذر ${action}: رُفض الطلب قبل الحفظ لأن حجمه كبير. قلّل القطع المحددة أو النص، ثم راجع الاختيار وأعد التأكيد. لم تُقسّم العملية تلقائياً.`;
    case "QUALITY_TRANSACTION_CONFLICT":
      return `نتيجة ${action} غير مؤكدة. تحقّق من الإجراء الأصلي قبل إعادة المحاولة بنفس المعرّف والبيانات.`;
    case "QUALITY_WORK_UNCHANGED":
      return `لم تُسجّل متابعة جديدة: أنت آخر منفّذ لهذا العمل بالفعل. راجع القطع وتابع الفحص إذا كان متاحاً.`;
    case "QUALITY_COMMAND_CONFLICT":
      return `تعذر ${action}: معرّف الإجراء مرتبط بطلب مختلف. تحقّق من النتيجة الأصلية قبل تأكيد إجراء جديد.`;
    case "ORDER_VERSION_CONFLICT":
    case "ORDER_STATE_CONFLICT":
    case "QUALITY_SELECTION_CONFLICT":
      return `تعذر ${action}: تغيرت القطع أو إصدارات الطلبات. رُفض التحديد كاملاً دون تغيير. حدّث جميع الطلبات وراجع القطع ثم أعد التأكيد.`;
    case "ACCOUNT_RESTRICTED":
    case "DEPARTMENT_ACCESS_DENIED":
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return `تعذر ${action}: صلاحية الجودة غير متاحة الآن. حدّث الحساب أو عد إلى مساحة العمل المسموح بها وسجّل الدخول عند الحاجة.`;
    case "ORDER_NOT_FOUND":
    case "QUALITY_COMMAND_NOT_FOUND":
      return `تعذر ${action}: العمل المطلوب غير متاح. حدّث القائمة وراجع الطلب المحدد؛ غياب نتيجة الإجراء لا يثبت فشل حفظه.`;
  }
  return `تعذر ${action}. ${message}${statusCode === 0 || statusCode >= 500 ? " قد تكون نتيجة الإجراء غير مؤكدة؛ تحقّق من الإجراء الأصلي قبل إرساله مجدداً." : ""}${requestId ? ` مرجع المتابعة: ${requestId}` : ""}`;
};
export const applyQualityIssueFormErrors = (
  error: unknown,
  form: Pick<UseFormReturn<QualityIssueFormValues>, "getValues" | "setError">,
): string => {
  for (const rawField of Object.keys(getApiError(error).fieldErrors)) {
    const field = rawField.replace(/^body\./u, "");
    if (field === "reason" || field === "notes")
      form.setError(field, {
        type: "server",
        message: qualityFailureMessage(error, "تسجيل المشكلة", field),
      });
  }
  return qualityFailureMessage(error, "تسجيل المشكلة");
};
// Successful array lookups supply these indices; server field strings never become typed paths.
const formIndex = (index: number): `${number}` => String(index) as `${number}`;
export const applyQualityFormErrors = (
  error: unknown,
  form: Pick<
    UseFormReturn<QualityInspectionFormValues>,
    "getValues" | "setError"
  >,
  submittedBody: Pick<
    Extract<QualityCommandBody, { operation: "INSPECT" }>,
    "orders"
  >,
): string => {
  const current = form.getValues();
  for (const rawField of Object.keys(getApiError(error).fieldErrors)) {
    const path = rawField.replace(/^body\./u, "").replace(/\[(\d+)\]/gu, ".$1");
    const match =
      /^orders\.(\d+)\.(?:(decisions)\.(\d+)\.(reason|instructions|target)|(inspectorNote)|packing\.(cartonCount|cartonNumbers))$/u.exec(
        path,
      );
    if (match === null) continue;
    const submitted = submittedBody.orders[Number(match[1])];
    if (submitted === undefined) continue;
    const oi = current.orders.findIndex(
      (order) =>
        order.orderId === submitted.orderId &&
        order.expectedVersion === submitted.expectedVersion,
    );
    const order = current.orders[oi];
    if (oi < 0 || order === undefined) continue;
    if (match[2] !== undefined) {
      const decision = submitted.decisions[Number(match[3])];
      if (decision === undefined) continue;
      const pi = order.pieces.findIndex(
        (piece) => piece.pieceId === decision.pieceId,
      );
      if (pi < 0) continue;
      const field = match[4],
        failure = {
          type: "server",
          message: qualityFailureMessage(error, "تسجيل الفحص", field),
        };
      if (field === "reason")
        form.setError(
          `orders.${formIndex(oi)}.pieces.${formIndex(pi)}.reason`,
          failure,
        );
      if (field === "instructions")
        form.setError(
          `orders.${formIndex(oi)}.pieces.${formIndex(pi)}.instructions`,
          failure,
        );
      if (field === "target")
        form.setError(
          `orders.${formIndex(oi)}.pieces.${formIndex(pi)}.target`,
          failure,
        );
    } else if (match[5] !== undefined)
      form.setError(`orders.${formIndex(oi)}.inspectorNote`, {
        type: "server",
        message: qualityFailureMessage(error, "تسجيل الفحص", "inspectorNote"),
      });
    else if (match[6] === "cartonCount")
      form.setError(`orders.${formIndex(oi)}.cartonCount`, {
        type: "server",
        message: qualityFailureMessage(error, "تسجيل الفحص", "cartonCount"),
      });
    else if (match[6] === "cartonNumbers")
      form.setError(`orders.${formIndex(oi)}.cartonNumbers`, {
        type: "server",
        message: qualityFailureMessage(error, "تسجيل الفحص", "cartonNumbers"),
      });
  }
  return qualityFailureMessage(error, "تسجيل الفحص");
};
