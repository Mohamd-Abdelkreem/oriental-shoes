"use client";

import { useState } from "react";

import { useLogoutAll } from "@/features/auth/hooks/auth.hooks";
import { replaceWithLogin } from "@/features/auth/utils/session-navigation";
import { getApiError } from "@/services/api/api-client";

export function SessionControls({
  variant = "default",
}: {
  variant?: "default" | "oriental";
}) {
  const logoutAll = useLogoutAll();
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const endEverySession = (): void => {
    setLogoutAllError(null);

    logoutAll.mutate(undefined, {
      onSuccess: () => {
        replaceWithLogin();
      },
      onError: (error: unknown) => {
        const apiError = getApiError(error);

        setLogoutAllError(
          `${apiError.message} ${variant === "oriental" ? "تعذر تأكيد تسجيل الخروج من الأجهزة الأخرى." : "Revocation of sessions on your other devices could not be confirmed."}`,
        );
      },
    });
  };

  if (variant === "oriental") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            تسجيل الخروج من جميع الأجهزة
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            إلغاء جلسات الدخول النشطة لهذا الحساب
          </p>
        </div>
        <button
          className="btn-pill btn-secondary px-5 py-2 text-xs"
          type="button"
          onClick={endEverySession}
          disabled={logoutAll.isPending}
        >
          {logoutAll.isPending
            ? "جارٍ تسجيل الخروج…"
            : "تسجيل الخروج من جميع الأجهزة"}
        </button>
        {logoutAllError && (
          <p role="alert" className="form-error w-full">
            {logoutAllError}
          </p>
        )}
      </section>
    );
  }
  return (
    <section className="danger-panel">
      <div>
        <p className="eyebrow">Session control</p>
        <h2>Sign out every device</h2>
        <p>Revoke the entire refresh-token family for this account.</p>
      </div>
      <button
        className="button button--danger"
        type="button"
        onClick={endEverySession}
        disabled={logoutAll.isPending}
      >
        {logoutAll.isPending ? "Revoking…" : "Sign out all devices"}
      </button>
      {logoutAllError === null ? null : (
        <p role="alert" className="form-error">
          {logoutAllError}
        </p>
      )}
    </section>
  );
}
