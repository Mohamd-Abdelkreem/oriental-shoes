"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  emailRequestBodySchema,
  type EmailRequestBody,
} from "@template/contracts";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { useForgotPassword } from "@/features/auth/hooks/auth.hooks";
import { applyApiFormError } from "@/shared/forms/form";

type EmailInput = z.input<typeof emailRequestBodySchema>;

export function ForgotPasswordForm() {
  const forgotPassword = useForgotPassword();
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
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

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    setFailure(null);
    try {
      const result = await forgotPassword.mutateAsync(values);
      setMessage(result.data.message);
    } catch (error) {
      setFailure(applyApiFormError(error, { getValues, setError }));
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

  return (
    <form className="auth-form" onSubmit={submitOnce} noValidate>
      <FormField
        id="email"
        label="البريد الإلكتروني للحساب"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      {message === null ? null : (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
      {failure === null ? null : (
        <p className="form-notice form-notice--error" role="alert">
          {failure}
        </p>
      )}
      <button
        className="button button--full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "جارٍ الإرسال…" : "إرسال رابط الاستعادة"}
      </button>
      <p className="auth-form__footer">
        <Link href="/auth/login">العودة إلى تسجيل الدخول</Link>
      </p>
    </form>
  );
}
