"use client";

import {
  PASSWORD_MIN_LENGTH,
  resetPasswordBodySchema,
  type ResetPasswordBody,
} from "@template/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import {
  useResetPassword,
  useValidateResetToken,
} from "@/features/auth/hooks/auth.hooks";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";

type ResetInput = z.input<typeof resetPasswordBodySchema>;

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
    if (token === null) return;
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ token, body });
    } catch (error) {
      setFormError(applyApiFormError(error, form));
    }
  });

  if (token === null || tokenQuery.isError) {
    return (
      <div className="success-panel">
        <h2>الرابط غير متاح</h2>
        <p>رابط الاستعادة مفقود أو منتهي الصلاحية أو تم استخدامه.</p>
        <Link className="button button--full" href="/auth/forgot-password">
          طلب رابط جديد
        </Link>
      </div>
    );
  }
  if (tokenQuery.isPending) {
    return (
      <p className="form-notice" aria-live="polite">
        جارٍ التحقق من رابط الاستعادة...
      </p>
    );
  }
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
    >
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
