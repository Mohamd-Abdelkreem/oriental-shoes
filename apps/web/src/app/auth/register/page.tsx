import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="بوابة تسجيل العاملين في مصنع الحذاء الشرقي"
      title="طلب تسجيل حساب جديد"
      summary="أدخل بياناتك لإنشاء الحساب والتحقق من بريدك الإلكتروني"
    >
      <RegisterForm />
    </AuthShell>
  );
}
