"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateProfileBodySchema,
  type UpdateProfileBody,
} from "@template/contracts";
import { useState } from "react";
import { Mail, Phone, Save, Shield, User } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { useSession } from "@/features/auth/hooks/auth.hooks";
import { useUpdateProfile } from "@/features/users/hooks/users.hooks";
import { applyApiFormError } from "@/shared/forms/form";

type ProfileInput = z.input<typeof updateProfileBodySchema>;

export function ProfileForm({
  variant = "default",
}: {
  variant?: "default" | "oriental";
}) {
  const user = useSession().data?.user ?? null;
  const updateProfile = useUpdateProfile();
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    setError,
  } = useForm<ProfileInput, unknown, UpdateProfileBody>({
    resolver: zodResolver(updateProfileBodySchema),
    values: {
      fullName: user?.fullName ?? "",
      phone: user?.phone ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    setMessageIsError(false);
    try {
      await updateProfile.mutateAsync(values);
      setMessage(
        variant === "oriental"
          ? "تم حفظ وتحديث البيانات الشخصية بنجاح."
          : "Profile details saved.",
      );
    } catch (error) {
      setMessageIsError(true);
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
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg font-bold text-white shadow-sm">
            {user?.fullName.trim().slice(0, 1) || "م"}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {user?.fullName || "الحساب الشخصي"}
            </h2>
            <span className="block text-xs text-slate-500">
              {user?.role === "ADMIN" ? "الإدارة العامة" : "مستخدم النظام"}
            </span>
          </div>
        </div>
        {message && (
          <p
            className={`rounded-xl border p-3 text-xs ${messageIsError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
            role={messageIsError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="profileEmail"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Mail size={14} className="text-slate-400" />
              البريد الإلكتروني (غير قابل للتعديل)
            </label>
            <input
              id="profileEmail"
              type="email"
              value={user?.email ?? ""}
              disabled
              readOnly
              dir="ltr"
              className="oriental-input w-full cursor-not-allowed bg-slate-50 font-mono text-xs text-slate-500"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              البريد الإلكتروني مرتبط بحسابك ولا يمكن تغييره من الملف الشخصي.
            </span>
          </div>
          <div>
            <label
              htmlFor="fullName"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <User size={14} className="text-slate-400" />
              الاسم الكامل
            </label>
            <input
              id="fullName"
              autoComplete="name"
              className="oriental-input w-full text-xs"
              {...register("fullName")}
            />
            {errors.fullName && (
              <p className="form-error" role="alert">
                {errors.fullName.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="phone"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"
            >
              <Phone size={14} className="text-slate-400" />
              رقم الجوال
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              dir="ltr"
              className="oriental-input w-full font-mono text-xs"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="form-error" role="alert">
                {errors.phone.message}
              </p>
            )}
          </div>
          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Shield size={14} className="text-slate-400" />
              دور الحساب الحالي
            </span>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-teal-800">
              {user?.role === "ADMIN" ? "الإدارة العامة" : "مستخدم النظام"}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-2">
          <button
            className="btn-pill btn-teal inline-flex items-center gap-1.5 px-5 py-2 text-xs"
            type="submit"
            disabled={isSubmitting}
          >
            <Save size={14} />
            {isSubmitting ? "جارٍ الحفظ…" : "حفظ التعديلات"}
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
          <p className="eyebrow">Profile</p>
          <h2>Personal details</h2>
        </div>
        <p>Only explicitly safe account fields reach the browser.</p>
      </div>
      <div className="settings-form__fields">
        <FormField
          id="fullName"
          label="Full name"
          autoComplete="name"
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <FormField
          id="phone"
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register("phone")}
        />
        <FormField
          id="profileEmail"
          label="Email"
          type="email"
          value={user?.email ?? ""}
          disabled
          readOnly
        />
      </div>
      {message === null ? null : (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
