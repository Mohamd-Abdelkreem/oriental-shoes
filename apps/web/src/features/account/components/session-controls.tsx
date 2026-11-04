"use client";

import { CanceledError } from "axios";
import { useRef, useState } from "react";

import { useLogoutAll } from "@/features/auth/hooks/auth.hooks";
import { replaceWithLogin } from "@/features/auth/utils/session-navigation";
import { getApiError } from "@/services/api/api-client";

/**
 * A cancelled completion belongs to a superseded session scope. It is not a
 * server failure and must not affect the current session.
 */
const isSupersededCompletion = (error: unknown): boolean =>
  error instanceof CanceledError;

export function SessionControls({
  variant = "default",
}: {
  variant?: "default" | "oriental";
}) {
  const logoutAll = useLogoutAll();
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);
  const attemptRef = useRef(0);

  const endEverySession = (): void => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setLogoutAllError(null);

    logoutAll.mutate(undefined, {
      onSuccess: () => {
        // Only the current attempt may act on the confirmed ending. The hook
        // owns the session clear; the component repeats the navigation for the
        // confirmed success alone.
        if (attemptRef.current !== attempt) return;
        replaceWithLogin();
      },
      onError: (error: unknown) => {
        if (attemptRef.current !== attempt) return;
        if (isSupersededCompletion(error)) return;
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
            إنهاء جلسات كل الأجهزة
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            إلغاء جلسات التحديث الخاصة بهذا الحساب على كل الأجهزة وإنهاء جلسة
            هذا المتصفح، وتبقى رموز الوصول الصادرة سارية حتى انتهاء صلاحيتها.
          </p>
        </div>
        <button
          className="btn-pill btn-secondary px-5 py-2 text-xs"
          type="button"
          onClick={endEverySession}
          disabled={logoutAll.isPending}
        >
          {logoutAll.isPending ? "جارٍ إنهاء الجلسات…" : "إنهاء كل الجلسات"}
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
        <h2>End every device session</h2>
        <p>
          Revokes this account&apos;s refresh sessions on every device and ends
          this browser&apos;s session. Access tokens already issued stay valid
          until they expire.
        </p>
      </div>
      <button
        className="button button--danger"
        type="button"
        onClick={endEverySession}
        disabled={logoutAll.isPending}
      >
        {logoutAll.isPending ? "Ending sessions…" : "End all sessions"}
      </button>
      {logoutAllError === null ? null : (
        <p role="alert" className="form-error">
          {logoutAllError}
        </p>
      )}
    </section>
  );
}
