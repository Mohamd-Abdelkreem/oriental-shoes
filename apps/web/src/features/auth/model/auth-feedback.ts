import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@template/contracts";
import type { FieldValues } from "react-hook-form";

import { getApiError, type ApiError } from "@/services/api/api-client";
import { applyApiFormError } from "@/shared/forms/form";

const fieldCopy = {
  email: ["أدخل البريد الإلكتروني.", "أدخل بريدًا إلكترونيًا صحيحًا."],
  fullName: ["أدخل الاسم الكامل.", "أدخل اسمًا صالحًا لا يتجاوز ١٥٠ حرفًا."],
  phone: ["رقم الهاتف اختياري.", "أدخل رقم هاتف لا يتجاوز ٣٠ حرفًا."],
  loginPassword: ["أدخل كلمة المرور.", "أدخل كلمة مرور صالحة."],
  password: [
    "أدخل كلمة المرور.",
    `استخدم كلمة مرور من ${String(PASSWORD_MIN_LENGTH)} إلى ${String(PASSWORD_MAX_LENGTH)} حرفًا.`,
  ],
  newPassword: [
    "أدخل كلمة المرور الجديدة.",
    `استخدم كلمة مرور جديدة من ${String(PASSWORD_MIN_LENGTH)} إلى ${String(PASSWORD_MAX_LENGTH)} حرفًا.`,
  ],
  passwordConfirmation: [
    "أكّد كلمة المرور الجديدة.",
    "أدخل تأكيدًا مطابقًا لكلمة المرور الجديدة.",
  ],
} as const;

export const authFieldMessage = (
  field: keyof typeof fieldCopy,
  hasError: boolean,
  value: unknown,
): string | undefined => {
  if (!hasError) return undefined;
  const [missing, invalid] = fieldCopy[field];
  return value === "" || value === undefined || value === null
    ? missing
    : invalid;
};

const actionFailure = {
  login: "تعذّر تسجيل الدخول. أعد المحاولة.",
  register: "تعذّر إنشاء الحساب. أعد المحاولة.",
  verify: "تعذّر تأكيد البريد الإلكتروني. أعد المحاولة.",
  resend: "تعذّر إرسال رابط تأكيد البريد. أعد المحاولة بعد قليل.",
  forgot: "تعذّر طلب رابط الاستعادة. أعد المحاولة بعد قليل.",
  reset: "تعذّر تعيين كلمة المرور الجديدة. أعد المحاولة.",
  session: "تعذّر التحقق من جلسة الحساب. أعد المحاولة.",
};

export const authFailureMessage = (
  error: ApiError,
  action: keyof typeof actionFailure,
): string => {
  const { statusCode, code } = error;
  if (
    code === "AUTH_IDENTITY_CHANGED" ||
    code === "AUTH_REAUTHENTICATION_REQUIRED"
  )
    return "تعذّر التحقق من جلسة الحساب. سجّل الدخول مرة أخرى.";
  if (statusCode === 0) return error.message;
  if (statusCode === 429)
    return "تم تجاوز عدد المحاولات. انتظر قليلًا ثم حاول مرة أخرى.";
  if (code === "VALIDATION_ERROR")
    return "راجع البيانات الموضّحة في الحقول ثم أعد المحاولة.";
  if (action === "login" && statusCode === 401)
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة. راجع البيانات وحاول مرة أخرى.";
  if (action === "register" && statusCode === 409)
    return "البريد الإلكتروني مسجّل بالفعل. سجّل الدخول أو استعد كلمة المرور.";
  if (action === "reset" && statusCode === 401)
    return "رابط الاستعادة غير صالح الآن. اطلب رابطًا جديدًا.";
  if (action === "reset" && statusCode === 400) return error.message;
  if (
    code === "ACCOUNT_RESTRICTED" ||
    (action === "verify" && statusCode === 403)
  )
    return "حالة الحساب الحالية تمنع إكمال الطلب. تواصل مع إدارة المصنع.";
  if (statusCode >= 500) return error.message;
  return actionFailure[action];
};

export const applyAuthFormError = <TFields extends FieldValues>(
  error: unknown,
  form: Parameters<typeof applyApiFormError<TFields>>[1],
  action: keyof typeof actionFailure,
): string => {
  applyApiFormError(error, form);
  return authFailureMessage(getApiError(error), action);
};
