"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  changePasswordBodySchema,
  PASSWORD_MIN_LENGTH,
  type ChangePasswordBody,
} from "@template/contracts";
import { useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { useChangePassword } from "@/features/auth/hooks/auth.hooks";
import { applyApiFormError } from "@/shared/forms/form";

type PasswordInput = z.input<typeof changePasswordBodySchema>;

export function PasswordForm({
  variant = "default",
}: {
  variant?: "default" | "oriental";
}) {
  const changePassword = useChangePassword();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    setError,
  } = useForm<PasswordInput, unknown, ChangePasswordBody>({
    resolver: zodResolver(changePasswordBodySchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      passwordConfirmation: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await changePassword.mutateAsync(values);
    } catch (error) {
      setMessage(applyApiFormError(error, { getValues, setError }));
    }
  });

  if (variant === "oriental") {
    return (
      <form
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        noValidate
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <KeyRound size={18} className="text-teal-600" />
            تغيير كلمة المرور
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            تحديث كلمة المرور الخاصة بحسابك في النظام
          </p>
        </div>
        {message && (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            role="alert"
          >
            {message}
          </p>
        )}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Lock size={14} className="text-slate-400" />
              كلمة المرور الحالية
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              className="oriental-input w-full font-mono text-xs"
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="form-error" role="alert">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="newPassword"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Lock size={14} className="text-slate-400" />
              كلمة المرور الجديدة
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className="oriental-input w-full font-mono text-xs"
              {...register("newPassword")}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              يجب أن تحتوي على {PASSWORD_MIN_LENGTH} خانة على الأقل.
            </span>
            {errors.newPassword && (
              <p className="form-error" role="alert">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="passwordConfirmation"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Lock size={14} className="text-slate-400" />
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              id="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              className="oriental-input w-full font-mono text-xs"
              {...register("passwordConfirmation")}
            />
            {errors.passwordConfirmation && (
              <p className="form-error" role="alert">
                {errors.passwordConfirmation.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-2">
          <button
            className="btn-pill btn-secondary inline-flex items-center gap-1.5 px-5 py-2 text-xs"
            type="submit"
            disabled={isSubmitting}
          >
            <KeyRound size={14} />
            {isSubmitting ? "جارٍ التحديث…" : "تحديث كلمة المرور"}
          </button>
        </div>
      </form>
    );
  }
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
    >
      <div className="settings-form__heading">
        <div>
          <p className="eyebrow">Credential</p>
          <h2>Change password</h2>
        </div>
        <p>A successful change signs out every active device.</p>
      </div>
      <div className="settings-form__fields">
        <FormField
          id="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <FormField
          id="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <FormField
          id="passwordConfirmation"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.passwordConfirmation?.message}
          {...register("passwordConfirmation")}
        />
      </div>
      {message === null ? null : (
        <p className="form-notice form-notice--error" role="alert">
          {message}
        </p>
      )}
      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
