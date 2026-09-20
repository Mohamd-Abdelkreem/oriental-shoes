import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="استعادة الوصول إلى حسابك"
      title="استعادة كلمة المرور"
      summary="أدخل بريدك الإلكتروني لاستلام رابط إعادة تعيين كلمة المرور"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
