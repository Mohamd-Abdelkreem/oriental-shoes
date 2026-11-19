import { baseLayoutTemplate } from "./base-layout.template.js";

export const RESET_PASSWORD_SUBJECT = "إعادة تعيين كلمة المرور | الحذاء الشرقي";

export const resetPasswordTemplate = (
  name: string,
  actionUrl: string,
  logoUrl: string,
): string =>
  baseLayoutTemplate({
    title: "إعادة تعيين كلمة المرور",
    previewText: "استخدم الرابط لاختيار كلمة مرور جديدة لحسابك.",
    name,
    description:
      "وصلنا طلب لاستعادة حسابك. استخدم الزر أدناه لاختيار كلمة مرور جديدة.",
    actionLabel: "تعيين كلمة مرور جديدة",
    actionUrl,
    logoUrl,
    helpText: "إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل الرسالة.",
  });
