"use client";

import {
  emailRequestBodySchema,
  type EmailRequestBody,
  type SafeUser,
} from "@template/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import {
  useResendVerification,
  useVerifyEmail,
} from "@/features/auth/hooks/auth.hooks";
import { getApiError } from "@/services/api/api-client";
import { applyApiFormError } from "@/shared/forms/form";

type VerifyOutcome =
  | { readonly kind: "working" }
  | { readonly kind: "verified"; readonly user: SafeUser }
  | { readonly kind: "invalid" }
  | { readonly kind: "failed"; readonly message: string };

type AttemptOutcome = Readonly<{
  token: string | null;
  retry: number;
  outcome: VerifyOutcome;
}>;

type EmailInput = z.input<typeof emailRequestBodySchema>;

/**
 * The verification copy follows the returned account and never assumes an
 * activation. A verified employee waits for administrator review, and only an
 * account the server reports as active is described as active.
 */
const verificationFeedback = (user: SafeUser): string => {
  if (user.status === "ACTIVE") {
    return "تم تأكيد بريدك الإلكتروني. حسابك نشط وجاهز لتسجيل الدخول.";
  }
  if (user.status === "PENDING_APPROVAL") {
    return "تم تأكيد بريدك الإلكتروني. حسابك في انتظار مراجعة الإدارة قبل الدخول إلى النظام.";
  }
  return "تم تأكيد بريدك الإلكتروني. يمكنك متابعة تسجيل الدخول.";
};

export function VerifyEmailPanel() {
  const verifyEmailAsync = useVerifyEmail().mutateAsync;
  const resendVerification = useResendVerification();
  const token = useSearchParams().get("token");
  const [retryCount, setRetryCount] = useState(0);
  const [attemptOutcome, setAttemptOutcome] = useState<AttemptOutcome | null>(
    null,
  );
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const attemptedRef = useRef<Readonly<{
    token: string | null;
    retry: number;
  }> | null>(null);
  const generationRef = useRef(0);
  const resendPendingRef = useRef(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    setError,
  } = useForm<EmailInput, unknown, EmailRequestBody>({
    resolver: zodResolver(emailRequestBodySchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    const attempted = attemptedRef.current;
    if (
      attempted !== null &&
      attempted.token === token &&
      attempted.retry === retryCount
    ) {
      return;
    }
    // Every new token or explicit retry opens a new generation, so a late
    // completion of an older link can never publish into the current one.
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    attemptedRef.current = { token, retry: retryCount };
    if (token === null || token.length === 0) return;
    void verifyEmailAsync(token).then(
      (result) => {
        if (generationRef.current !== generation) return;
        setAttemptOutcome({
          token,
          retry: retryCount,
          outcome: { kind: "verified", user: result.data.user },
        });
      },
      (error: unknown) => {
        if (generationRef.current !== generation) return;
        const apiError = getApiError(error);
        setAttemptOutcome({
          token,
          retry: retryCount,
          outcome:
            apiError.statusCode === 400
              ? { kind: "invalid" }
              : { kind: "failed", message: apiError.message },
        });
      },
    );
  }, [token, retryCount, verifyEmailAsync]);

  const resend = handleSubmit(async (values) => {
    setResendMessage(null);
    setResendError(null);
    try {
      const result = await resendVerification.mutateAsync(values);
      setResendMessage(result.data.message);
    } catch (error) {
      setResendError(applyApiFormError(error, { getValues, setError }));
    }
  });

  /**
   * The confirmed request owns the resend. A repeated trigger cannot issue a
   * second request while the first one is still in flight.
   */
  const handleResendSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    if (resendPendingRef.current) {
      event.preventDefault();
      return;
    }
    resendPendingRef.current = true;
    try {
      await resend(event);
    } finally {
      resendPendingRef.current = false;
    }
  };

  const outcome: VerifyOutcome =
    token === null || token.length === 0
      ? { kind: "invalid" }
      : attemptOutcome !== null &&
          attemptOutcome.token === token &&
          attemptOutcome.retry === retryCount
        ? attemptOutcome.outcome
        : { kind: "working" };

  if (outcome.kind === "working") {
    return (
      <p className="form-notice" aria-live="polite">
        جارٍ التحقق من الرابط…
      </p>
    );
  }
  if (outcome.kind === "verified") {
    return (
      <div className="success-panel" aria-live="polite">
        <span className="success-panel__mark" aria-hidden="true">
          ✓
        </span>
        <h2>تم تأكيد البريد الإلكتروني</h2>
        <p>{verificationFeedback(outcome.user)}</p>
        <Link className="button button--full" href="/auth/login">
          المتابعة إلى تسجيل الدخول
        </Link>
      </div>
    );
  }
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void handleResendSubmit(event);
      }}
      noValidate
    >
      {outcome.kind === "invalid" ? (
        <p className="form-notice form-notice--error" role="alert">
          رابط التحقق مفقود أو غير صالح أو منتهي الصلاحية.
        </p>
      ) : (
        <>
          <p className="form-notice form-notice--error" role="alert">
            {outcome.message}
          </p>
          <button
            className="button button--full"
            type="button"
            onClick={() => {
              setRetryCount((count) => count + 1);
            }}
          >
            إعادة المحاولة
          </button>
        </>
      )}
      <FormField
        id="email"
        label="البريد الإلكتروني للحساب"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      {resendMessage === null ? null : (
        <p className="form-notice" role="status">
          {resendMessage}
        </p>
      )}
      {resendError === null ? null : (
        <p className="form-notice form-notice--error" role="alert">
          {resendError}
        </p>
      )}
      <button
        className="button button--full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "جارٍ الإرسال…" : "إرسال رابط جديد"}
      </button>
    </form>
  );
}
