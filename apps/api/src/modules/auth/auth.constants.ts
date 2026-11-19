import { authConfig } from "../../core/config/auth.config.js";
import { cookieConfig } from "../../core/config/cookie.config.js";

export const AUTH_CONSTANTS = Object.freeze({
  refreshTokenCookieName: cookieConfig.refreshName,
  csrfTokenCookieName: cookieConfig.csrfName,
  messages: Object.freeze({
    register: "تم إنشاء الحساب. راجع بريدك لتأكيده.",
    verify: "تم تأكيد البريد الإلكتروني.",
    resend: "تم استلام طلب إعادة إرسال رابط التأكيد.",
    login: "تم تسجيل الدخول.",
    refresh: "تم تجديد الجلسة.",
    logout: "تم تسجيل الخروج.",
    logoutAll: "تم تسجيل الخروج من جميع الأجهزة.",
    forgot: "تم استلام طلب استعادة كلمة المرور.",
    reset: "تم تعيين كلمة المرور الجديدة.",
    validateReset: "رابط الاستعادة صالح.",
    changePassword: "تم تغيير كلمة المرور.",
  }),
});

export const RESEND_NEUTRAL_RESPONSE = Object.freeze({
  message:
    "إذا كان الحساب مسجّلًا ومؤهلًا للتأكيد، سيصلك رابط لتأكيد البريد الإلكتروني.",
});

export const FORGOT_PASSWORD_NEUTRAL_RESPONSE = Object.freeze({
  message:
    "إذا كان الحساب مسجّلًا ومؤهلًا للاستعادة، سيصلك رابط لإعادة تعيين كلمة المرور.",
});

export const VERIFICATION_TOKEN_TTL_MS =
  authConfig.verifyTokenTtlSeconds * 1_000;
export const RESET_TOKEN_TTL_MS = authConfig.resetTokenTtlSeconds * 1_000;
export const RESEND_COOLDOWN_MS =
  authConfig.verifyResendCooldownSeconds * 1_000;
