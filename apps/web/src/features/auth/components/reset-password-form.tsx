"use client";

import {
  PASSWORD_MIN_LENGTH,
  resetPasswordBodySchema,
  type ResetPasswordBody,
} from "@template/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import {
  useResetPassword,
  useValidateResetToken,
} from "@/features/auth/hooks/auth.hooks";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import { getApiError } from "@/services/api/api-client";

type ResetInput = z.input<typeof resetPasswordBodySchema>;

/**
 * The classified outcome of the purpose-link check. Every failure keeps its
 * own meaning, and no failed check may render an authorized reset form.
 */
type LinkCheckOutcome = Readonly<{
  title: string;
  body: string;
  requestId: string;
  nextStep: "new-link" | "login" | "retry";
}>;

const MISSING_OR_INVALID_LINK: LinkCheckOutcome = {
  title: "الرابط غير متاح",
  body: "رابط الاستعادة مفقود أو منتهي الصلاحية أو تم استخدامه.",
  requestId: "",
  nextStep: "new-link",
};

const RESTRICTED_ACCOUNT: LinkCheckOutcome = {
  title: "الاستعادة غير متاحة حاليًا",
  body: "رابط الاستعادة صالح، لكن الحساب غير مؤهل حاليًا لاستعادة كلمة المرور. تواصل مع مسؤول الحساب.",
  requestId: "",
  nextStep: "login",
};

const SESSION_DENIED: LinkCheckOutcome = {
  title: "تعذر التحقق من الجلسة",
  body: "لم يكتمل التحقق من الرابط بسبب مشكلة في الجلسة أو الصلاحيات. أعد المحاولة.",
  requestId: "",
  nextStep: "retry",
};

const RATE_LIMITED: LinkCheckOutcome = {
  title: "تم تجاوز عدد المحاولات",
  body: "تم تجاوز عدد المحاولات المسموح به. أعد المحاولة بعد قليل.",
  requestId: "",
  nextStep: "retry",
};

const NETWORK_FAILURE: LinkCheckOutcome = {
  title: "تعذر الاتصال بالخادم",
  body: "لم يكتمل التحقق من الرابط بسبب مشكلة في الاتصال. أعد المحاولة.",
  requestId: "",
  nextStep: "retry",
};

const SERVICE_UNAVAILABLE: LinkCheckOutcome = {
  title: "الخدمة غير متاحة مؤقتًا",
  body: "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.",
  requestId: "",
  nextStep: "retry",
};

const INVALID_RESPONSE: LinkCheckOutcome = {
  title: "استجابة غير متوقعة",
  body: "تعذر التحقق من الرابط بسبب استجابة غير صالحة من الخادم. أعد المحاولة.",
  requestId: "",
  nextStep: "retry",
};

const UNEXPECTED_FAILURE: LinkCheckOutcome = {
  title: "تعذر التحقق من الرابط",
  body: "تعذر التحقق من الرابط بسبب خطأ غير متوقع. أعد المحاولة.",
  requestId: "",
  nextStep: "retry",
};

/**
 * Maps the real failure modes of the purpose-link read. Only a missing link
 * or a 401 credential is an unavailable/expired link. A valid-purpose link
 * rejected by the current account eligibility is not an expired link, and a
 * session, rate-limit, network, service or contract failure stays its own
 * retryable state.
 */
const classifyLinkCheckFailure = (error: unknown): LinkCheckOutcome => {
  const apiError = getApiError(error);
  const { code, requestId, statusCode } = apiError;

  if (statusCode === 401 || code === "UNAUTHORIZED") {
    return { ...MISSING_OR_INVALID_LINK, requestId };
  }
  if (statusCode === 403 && code === "ACCOUNT_RESTRICTED") {
    return { ...RESTRICTED_ACCOUNT, requestId };
  }
  if (statusCode === 403) {
    return { ...SESSION_DENIED, requestId };
  }
  if (statusCode === 429) {
    return { ...RATE_LIMITED, requestId };
  }
  if (code === "CONTRACT_ERROR") {
    return { ...INVALID_RESPONSE, requestId };
  }
  if (statusCode === 0) {
    return { ...NETWORK_FAILURE, requestId };
  }
  if (statusCode >= 500) {
    return { ...SERVICE_UNAVAILABLE, requestId };
  }
  return { ...UNEXPECTED_FAILURE, requestId };
};

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const tokenQuery = useValidateResetToken(token ?? "");
  const resetPassword = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm<ResetInput, ResetPasswordBody>(
    resetPasswordBodySchema,
    { defaultValues: { newPassword: "", passwordConfirmation: "" } },
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = form;

  const onSubmit = handleSubmit(async (body) => {
    if (token === null || token.length === 0) return;
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ token, body });
    } catch (error) {
      setFormError(applyApiFormError(error, form));
    }
  });

  /**
   * The pending form blocks every duplicate trigger, including an implicit
   * submission that never reaches the disabled button.
   */
  const submitOnce = (event: SubmitEvent<HTMLFormElement>): void => {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }
    void onSubmit(event);
  };

  const retryLinkCheck = (): void => {
    tokenQuery.retry();
  };

  if (token === null || token.length === 0) {
    return (
      <div className="success-panel">
        <h2>{MISSING_OR_INVALID_LINK.title}</h2>
        <p>{MISSING_OR_INVALID_LINK.body}</p>
        <Link className="button button--full" href="/auth/forgot-password">
          طلب رابط جديد
        </Link>
      </div>
    );
  }

  if (tokenQuery.isError) {
    const outcome = classifyLinkCheckFailure(tokenQuery.error);
    const isRetryable = outcome.nextStep === "retry";
    return (
      <div className="success-panel">
        <h2>{outcome.title}</h2>
        <p
          className={isRetryable ? "form-notice form-notice--error" : undefined}
          role={isRetryable ? "alert" : undefined}
        >
          {outcome.body}
          {outcome.requestId === "" ? null : (
            <>
              {" "}
              <small>رقم الطلب: {outcome.requestId}</small>
            </>
          )}
        </p>
        {isRetryable ? (
          <button
            className="button button--full"
            type="button"
            onClick={retryLinkCheck}
          >
            إعادة المحاولة
          </button>
        ) : outcome.nextStep === "login" ? (
          <Link className="button button--full" href="/auth/login">
            العودة إلى تسجيل الدخول
          </Link>
        ) : (
          <Link className="button button--full" href="/auth/forgot-password">
            طلب رابط جديد
          </Link>
        )}
      </div>
    );
  }

  if (!tokenQuery.isSuccess) {
    return (
      <p className="form-notice" aria-live="polite">
        جارٍ التحقق من رابط الاستعادة...
      </p>
    );
  }

  return (
    <form className="auth-form" onSubmit={submitOnce} noValidate>
      <FormField
        id="newPassword"
        label="كلمة المرور الجديدة"
        type="password"
        autoComplete="new-password"
        hint={`استخدم ${String(PASSWORD_MIN_LENGTH)} أحرف على الأقل.`}
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <FormField
        id="passwordConfirmation"
        label="تأكيد كلمة المرور الجديدة"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        {...register("passwordConfirmation")}
      />
      {formError === null ? null : (
        <p className="form-notice form-notice--error" role="alert">
          {formError}
        </p>
      )}
      <button
        className="button button--full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "جارٍ التحديث..." : "تعيين كلمة المرور"}
      </button>
    </form>
  );
}
