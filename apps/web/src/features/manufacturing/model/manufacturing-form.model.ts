import {
  ManufacturingSynchronizationError,
  ManufacturingLocalCommandError,
} from "./manufacturing-command-state";
import type { z } from "zod";
import {
  reportIssueBodySchema,
  type ReportIssueBody,
} from "@template/contracts";
import { getApiError } from "@/services/api/api-client";

export const manufacturingIssueFormSchema = reportIssueBodySchema.omit({
  commandId: true,
  expectedVersion: true,
});
export type ManufacturingIssueFormValues = z.input<
  typeof manufacturingIssueFormSchema
>;
export const toManufacturingIssueBody = (
  values: ManufacturingIssueFormValues,
  base: { commandId: string; expectedVersion: number },
): ReportIssueBody => reportIssueBodySchema.parse({ ...values, ...base });
export const manufacturingFailureMessage = (
  error: unknown,
  action: string,
  field?: string,
): string => {
  const tooLong =
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "too_big";
  if (field === "reason" && tooLong)
    return "تعذر تسجيل المشكلة: سبب المشكلة يتجاوز ٤٠٠٠ حرف. اختصر السبب ثم أعد المحاولة.";
  if (field === "notes" && tooLong)
    return "تعذر تسجيل المشكلة: الملاحظات تتجاوز ٤٠٠٠ حرف. اختصرها أو اتركها فارغة ثم أعد المحاولة.";
  if (field === "reason")
    return "تعذر تسجيل المشكلة: أدخل سبب المشكلة المطلوب، بحد أقصى ٤٠٠٠ حرف، ثم أعد المحاولة.";
  if (field === "notes")
    return "تعذر تسجيل المشكلة: الملاحظات اختيارية وبحد أقصى ٤٠٠٠ حرف. صححها ثم أعد المحاولة.";
  if (error instanceof ManufacturingSynchronizationError) return error.message;
  if (error instanceof ManufacturingLocalCommandError)
    return `تعذر ${action}: راجع نتيجة الإجراء الحالي والقطع المحددة قبل فتح تأكيد جديد.`;
  const { code, message, statusCode } = getApiError(error);
  if (
    code === "MANUFACTURING_TRANSACTION_CONFLICT" ||
    code === "APPROVAL_TRANSACTION_CONFLICT"
  )
    return `نتيجة ${action} غير مؤكدة. احتفظ بنفس الإجراء وتحقّق من نتيجته قبل إعادة المحاولة بنفس المعرّف.`;
  if (code === "MANUFACTURING_WORK_UNCHANGED")
    return `تعذر ${action}: أنت آخر منفذ لهذه القطعة بالفعل، ولم تسجل متابعة جديدة. راجع القطع أو تابع بالإتمام إذا كان متاحاً.`;
  if (code === "MANUFACTURING_COMMAND_CONFLICT")
    return `تعذر ${action}: معرّف الإجراء مرتبط بطلب مختلف. تحقّق من النتيجة الأصلية وراجع البيانات قبل إجراء جديد.`;
  if (
    code.includes("VERSION") ||
    code.includes("STALE") ||
    code.includes("CONFLICT") ||
    code.includes("INELIGIBLE")
  )
    return `تعذر ${action}: تغيرت حالة القطع أو إصدار الطلب. رُفضت المجموعة كاملة دون تغيير. حدّث البيانات وراجع القطع المختارة قبل التأكيد.`;
  if (
    code.includes("FORBIDDEN") ||
    code.includes("DEPARTMENT") ||
    code.includes("SUSPENDED")
  )
    return `تعذر ${action}: صلاحية القسم غير متاحة الآن. حدّث الحساب أو عد إلى مساحة العمل المسموح بها.`;
  if (code.includes("NOT_FOUND"))
    return `تعذر ${action}: البيانات غير متاحة. حدّث القائمة وراجع الطلب المحدد.`;
  return `تعذر ${action}. ${message}${statusCode === 0 || statusCode >= 500 ? " إذا أُرسل إجراء عمل بالفعل، تحقّق من نتيجته قبل إرساله مجددًا." : ""}`;
};
