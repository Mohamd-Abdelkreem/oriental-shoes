"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { useLogout, useSession } from "@/features/auth/hooks/auth.hooks";
import { getApiError } from "@/services/api/api-client";

import { AuthCard } from "./auth-card";

export function AccountSuspendedView() {
  const session = useSession({ enabled: false });
  const logout = useLogout();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const refreshStatus = (): void => {
    void session.refetch();
  };

  const signOut = (): void => {
    setSignOutError(null);

    logout.mutate(undefined, {
      onError: (error: unknown) => {
        const apiError = getApiError(error);
        setSignOutError(
          `${apiError.message} لم يتم تأكيد تسجيل الخروج، وقد تبقى جلستك نشطة.`,
        );
      },
    });
  };

  return (
    <AuthCard
      title="الحساب موقوف مؤقتاً"
      subtitle="تم إيقاف صلاحيات الوصول لهذا الحساب من قبل مدير النظام"
      footer={
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-pill btn-teal px-5 py-2.5 text-xs font-bold"
              onClick={refreshStatus}
              disabled={session.isFetching}
            >
              تحديث حالة الحساب
            </button>
            <button
              type="button"
              className="btn-pill btn-secondary px-5 py-2.5 text-xs font-bold"
              onClick={signOut}
              disabled={logout.isPending}
            >
              تسجيل الخروج
            </button>
            <Link
              href="/auth/login"
              className="font-bold text-teal-700 hover:underline"
            >
              العودة لتسجيل الدخول
            </Link>
          </div>
          {signOutError === null ? null : (
            <p className="form-notice form-notice--error" role="alert">
              {signOutError}
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert size={32} />
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          يرجى مراجعة الإدارة العامة لرفع الإيقاف واستعادة صلاحيات الدخول.
        </p>
      </div>
    </AuthCard>
  );
}
