import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SessionLoader } from "@/components/auth/session-loader";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";

export default function VerifyEmailPage() {
  return (
    <AuthShell
      eyebrow="التحقق من البريد الإلكتروني"
      title="تأكيد البريد الإلكتروني"
      summary="أكّد بريدك الإلكتروني أو اطلب رابط تأكيد جديد."
    >
      <Suspense fallback={<SessionLoader />}>
        <VerifyEmailPanel />
      </Suspense>
    </AuthShell>
  );
}
