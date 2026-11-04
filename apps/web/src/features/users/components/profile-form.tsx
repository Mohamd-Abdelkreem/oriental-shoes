"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateProfileBodySchema,
  type SafeUser,
  type UpdateProfileBody,
} from "@template/contracts";
import { useEffect, useState } from "react";
import { Mail, Phone, Save, Shield, User } from "lucide-react";
import { useForm, type FieldNamesMarkedBoolean } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { useSession } from "@/features/auth/hooks/auth.hooks";
import { useUpdateProfile } from "@/features/users/hooks/users.hooks";
import { applyApiFormError } from "@/shared/forms/form";

type ProfileInput = z.input<typeof updateProfileBodySchema>;

/**
 * The editable draft. The optional phone stays a text field here, so a blank
 * phone is the deliberate clear of that field.
 */
type ProfileDraft = Readonly<{ fullName: string; phone: string }>;

/**
 * The server record the draft is based on. It never owns the draft itself.
 */
type ProfileRecord = Readonly<{
  identity: string;
  fullName: string;
  phone: string;
}>;

type ProfileNotice = Readonly<{
  tone: "success" | "error" | "newer";
  text: string;
}>;

const EMPTY_DRAFT: ProfileDraft = { fullName: "", phone: "" };

const toProfileRecord = (user: SafeUser): ProfileRecord => ({
  identity: user.id,
  fullName: user.fullName,
  phone: user.phone ?? "",
});

const toProfileDraft = (record: ProfileRecord): ProfileDraft => ({
  fullName: record.fullName,
  phone: record.phone,
});

const isSameProfileRecord = (
  current: ProfileRecord | null,
  incoming: ProfileRecord,
): boolean =>
  current !== null &&
  current.identity === incoming.identity &&
  current.fullName === incoming.fullName &&
  current.phone === incoming.phone;

/**
 * The deliberate changed-field mapping. A changed field carries its parsed
 * value, a cleared optional phone is the explicit null clear and an untouched
 * field stays absent from the request.
 */
const buildUpdateBody = (
  parsed: UpdateProfileBody,
  dirtyFields: FieldNamesMarkedBoolean<ProfileInput>,
): UpdateProfileBody | null => {
  const body: { fullName?: string; phone?: string | null } = {};
  if (dirtyFields.fullName === true && parsed.fullName !== undefined) {
    body.fullName = parsed.fullName;
  }
  if (dirtyFields.phone === true && parsed.phone !== undefined) {
    body.phone = parsed.phone;
  }
  const validated = updateProfileBodySchema.safeParse(body);
  return validated.success ? validated.data : null;
};

const successNotice = (variant: "default" | "oriental"): string =>
  variant === "oriental"
    ? "تم حفظ وتحديث البيانات الشخصية بنجاح."
    : "Profile details saved.";

const newerRecordNotice = (variant: "default" | "oriental"): string =>
  variant === "oriental"
    ? "تم تحميل بيانات أحدث للحساب مع الاحتفاظ بتعديلاتك غير المحفوظة."
    : "Newer account data was loaded. Your unsaved changes were kept.";

export function ProfileForm({
  variant = "default",
}: {
  variant?: "default" | "oriental";
}) {
  const identity = useSession().data?.user.id ?? "signed-out";

  // Another account owns another draft. The identity key discards the previous
  // account's draft, and a late result of that account can no longer reach the
  // current display.
  return <ProfileEditor key={identity} variant={variant} />;
}

function ProfileEditor({ variant }: { variant: "default" | "oriental" }) {
  // Clean RHF resets clear the field registry, so register must run again.
  "use no memo";

  const updateProfile = useUpdateProfile();
  const [notice, setNotice] = useState<ProfileNotice | null>(null);
  const [applied, setApplied] = useState<{
    record: ProfileRecord;
    keepDirty: boolean;
  } | null>(null);

  // The editor reads the session itself. A record delivered as a prop could be
  // stale when the editor re-renders for its own draft, and a stale record is
  // not a newer one.
  const user = useSession().data?.user ?? null;
  const record = user === null ? null : toProfileRecord(user);

  // The draft follows the server record. A newer record of the same account is
  // applied to the draft without discarding the edits the user made.
  if (
    record !== null &&
    !isSameProfileRecord(applied?.record ?? null, record)
  ) {
    const anotherAccount =
      applied !== null && applied.record.identity !== record.identity;
    setApplied({ record, keepDirty: applied !== null && !anotherAccount });
    if (applied !== null && !anotherAccount) {
      setNotice({ tone: "newer", text: newerRecordNotice(variant) });
    }
  }

  const {
    formState: { dirtyFields, errors, isSubmitting },
    handleSubmit,
    getValues,
    register,
    reset,
    setError,
  } = useForm<ProfileInput, unknown, UpdateProfileBody>({
    resolver: zodResolver(updateProfileBodySchema),
    defaultValues: record === null ? EMPTY_DRAFT : toProfileDraft(record),
  });

  useEffect(() => {
    if (applied === null) return;
    // A newer record of the same account keeps the dirty entries of the draft.
    // The first record of an account replaces the draft of that account.
    reset(
      toProfileDraft(applied.record),
      applied.keepDirty ? { keepDirtyValues: true } : undefined,
    );
  }, [applied, reset]);

  const hasChanges =
    dirtyFields.fullName === true || dirtyFields.phone === true;

  const onSubmit = handleSubmit(async (parsed) => {
    const body = buildUpdateBody(parsed, dirtyFields);
    // An unchanged draft has no changed field, so no request is dispatched.
    if (body === null) return;

    setNotice(null);
    try {
      const confirmed = await updateProfile.mutateAsync(body);
      const confirmedRecord = toProfileRecord(confirmed.user);
      setApplied({ record: confirmedRecord, keepDirty: false });
      // The confirmed values become the clean draft.
      reset(toProfileDraft(confirmedRecord));
      setNotice({ tone: "success", text: successNotice(variant) });
    } catch (error) {
      // A rejected update keeps the draft and the current account untouched.
      setNotice({
        tone: "error",
        text: applyApiFormError(error, { getValues, setError }),
      });
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
        {notice !== null && (
          <p
            className={`rounded-xl border p-3 text-xs ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
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
            disabled={isSubmitting || !hasChanges}
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
          disabled={isSubmitting}
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <FormField
          id="phone"
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          disabled={isSubmitting}
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
      {notice === null ? null : (
        <p className="form-notice" role="status">
          {notice.text}
        </p>
      )}
      <button
        className="button"
        type="submit"
        disabled={isSubmitting || !hasChanges}
      >
        {isSubmitting ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
