import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SessionLoader } from "@/components/auth/session-loader";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="استعادة الوصول إلى حسابك"
      title="تعيين كلمة مرور جديدة"
      summary="اختر كلمة مرور جديدة لحسابك"
    >
      <Suspense fallback={<SessionLoader />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
