import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SessionLoader } from "@/components/auth/session-loader";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="بوابة الدخول الموحدة للعاملين وإدارة عمليات التصنيع"
      title="تسجيل الدخول للنظام"
      summary="أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى مساحة عملك"
    >
      <Suspense fallback={<SessionLoader />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
