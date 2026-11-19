import { baseLayoutTemplate } from "./base-layout.template.js";

export const VERIFY_EMAIL_SUBJECT = "تأكيد البريد الإلكتروني | الحذاء الشرقي";

export const verifyEmailTemplate = (
  name: string,
  actionUrl: string,
  logoUrl: string,
): string =>
  baseLayoutTemplate({
    title: "تأكيد البريد الإلكتروني",
    previewText: "أكّد بريدك الإلكتروني لإكمال إعداد حسابك في الحذاء الشرقي.",
    name,
    description:
      "استخدم الزر أدناه لتأكيد بريدك الإلكتروني وإكمال إعداد حسابك.",
    actionLabel: "تأكيد البريد الإلكتروني",
    actionUrl,
    logoUrl,
    helpText: "إذا لم تتوقع إنشاء حساب بهذا البريد، يمكنك تجاهل الرسالة.",
  });
