"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginBodySchema, type LoginBody } from "@template/contracts";
import { CanceledError } from "axios";
import Link from "next/link";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { useLogin } from "@/features/auth/hooks/auth.hooks";
import { applyApiFormError } from "@/shared/forms/form";

type LoginInput = z.input<typeof loginBodySchema>;

/**
 * The credential form owns its draft, its field feedback and its pending state
 * only. The accepted account is published by the login hook and the guest guard
 * owns every success navigation, so the form never reads the token, the
 * credential or a private status, and never navigates on its own.
 */
export function LoginForm() {
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    setError,
  } = useForm<LoginInput, unknown, LoginBody>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onSubmit = handleSubmit(async (values: LoginBody) => {
    await login.mutateAsync(values);
  });

  /**
   * The confirmed attempt owns the feedback. A superseded attempt never
   * replaces a newer attempt's message, and a cancelled or obsolete completion
   * is not current feedback at all.
   */
  const handleFormSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setFormError(null);
    try {
      await onSubmit(event);
    } catch (error: unknown) {
      if (attempt !== attemptRef.current) return;
      if (!mountedRef.current) return;
      if (error instanceof CanceledError) return;
      setFormError(applyApiFormError(error, { getValues, setError }));
    }
  };

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void handleFormSubmit(event);
      }}
      noValidate
    >
      <FormField
        id="email"
        label="البريد الإلكتروني"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        id="password"
        label="كلمة المرور"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="form-row">
        <label className="check-field">
          <input type="checkbox" {...register("rememberMe")} />
          <span>البقاء مسجلاً للدخول</span>
        </label>
        <Link href="/auth/forgot-password">نسيت كلمة المرور؟</Link>
      </div>
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
        {isSubmitting ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
      </button>
      <p className="auth-form__footer">
        ليس لديك حساب؟ <Link href="/auth/register">طلب تسجيل حساب جديد</Link>
      </p>
    </form>
  );
}
