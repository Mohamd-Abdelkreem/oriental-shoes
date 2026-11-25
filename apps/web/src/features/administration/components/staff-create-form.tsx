"use client";

import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import {
  PASSWORD_MIN_LENGTH,
  staffCreateBodySchema,
} from "@template/contracts";

import { FormField } from "@/components/forms/form-field";
import { getApiError } from "@/services/api/api-client";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import { useCreateStaff } from "../hooks/staff.hooks";
import { STAFF_DEPARTMENT_OPTIONS } from "../model/staff-management.model";

const fieldMessage = (
  error:
    | Readonly<{ type?: string | undefined; message?: string | undefined }>
    | undefined,
  value: unknown,
  missing: string,
  invalid: string,
): string | undefined => {
  if (error === undefined) return undefined;
  if (error.type === "server") return error.message;
  return value === undefined || value === "" ? missing : invalid;
};

const creationFailureMessage = (
  error: ReturnType<typeof getApiError>,
): string => {
  if (
    error.statusCode === 401 ||
    error.statusCode === 403 ||
    error.code === "AUTH_IDENTITY_CHANGED" ||
    error.code === "AUTH_REAUTHENTICATION_REQUIRED"
  )
    return "تعذّر إنشاء الموظف. سجّل الدخول بحساب إدارة ثم أعد المحاولة.";
  if (error.statusCode === 503) return `تعذّر إنشاء الموظف. ${error.message}`;
  if (error.statusCode === 400 || error.statusCode === 422)
    return "تعذّر قبول البيانات. راجع حقول الحساب والقسم ثم أعد المحاولة.";
  if (error.statusCode === 429)
    return "تعذّر إنشاء الموظف بسبب كثرة المحاولات. انتظر قليلاً ثم حاول مجددًا.";
  return `${error.message} ابحث عن البريد في جميع المستخدمين للتحقق من إنشاء الموظف قبل إعادة المحاولة.`;
};

export function StaffCreateForm({
  id,
  onCancel,
  onCreated,
}: {
  id: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const inputId = useId();
  const createStaff = useCreateStaff();
  const submitting = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setError,
    setFocus,
  } = useZodForm(staffCreateBodySchema, {
    defaultValues: { fullName: "", email: "", password: "" },
  });
  useEffect(() => {
    setFocus("fullName");
  }, [setFocus]);

  const submit = handleSubmit(async (body) => {
    setFailure(null);
    try {
      await createStaff(body);
      onCreated();
    } catch (error) {
      const apiError = getApiError(error);
      if (apiError.code === "CONFLICT") {
        setError("email", {
          type: "server",
          message:
            "البريد الإلكتروني مستخدم بالفعل. ابحث عنه في جميع المستخدمين أو أدخل بريدًا آخر.",
        });
        return;
      }
      applyApiFormError(error, { getValues, setError });
      setFailure(creationFailureMessage(apiError));
    }
  });

  const onSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      await submit(event);
    } finally {
      submitting.current = false;
    }
  };

  const departmentError = fieldMessage(
    errors.department,
    getValues("department"),
    "اختر قسم الموظف.",
    "اختر قسمًا من القائمة.",
  );

  return (
    <form
      id={id}
      aria-labelledby={`${id}-title`}
      className="oriental-table-card space-y-4 p-5"
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <header>
        <h2 id={`${id}-title`} className="text-base font-bold text-slate-900">
          إنشاء موظف
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          يتفعّل الحساب في القسم المحدد بعد تأكيد البريد الإلكتروني.
        </p>
      </header>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={isSubmitting}>
        <FormField
          id={`${inputId}-name`}
          label="الاسم الكامل"
          autoComplete="off"
          required
          error={fieldMessage(
            errors.fullName,
            getValues("fullName").trim(),
            "أدخل اسم الموظف.",
            "أدخل اسمًا صالحًا لا يزيد على 150 حرفًا.",
          )}
          {...register("fullName")}
        />
        <FormField
          id={`${inputId}-email`}
          label="البريد الإلكتروني"
          type="email"
          autoComplete="off"
          dir="ltr"
          required
          error={fieldMessage(
            errors.email,
            getValues("email"),
            "أدخل البريد الإلكتروني للموظف.",
            "أدخل بريدًا إلكترونيًا صحيحًا.",
          )}
          {...register("email")}
        />
        <FormField
          id={`${inputId}-password`}
          label="كلمة المرور الأولية"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          hint={`استخدم ${String(PASSWORD_MIN_LENGTH)} حرفًا على الأقل.`}
          error={fieldMessage(
            errors.password,
            getValues("password"),
            "أدخل كلمة مرور أولية للموظف.",
            "أدخل كلمة مرور بين 15 و128 حرفًا.",
          )}
          {...register("password")}
        />
        <label className="form-field" htmlFor={`${inputId}-department`}>
          <span>القسم</span>
          <select
            id={`${inputId}-department`}
            className="oriental-select w-full"
            required
            defaultValue=""
            aria-invalid={departmentError === undefined ? undefined : true}
            aria-describedby={
              departmentError === undefined
                ? undefined
                : `${inputId}-department-error`
            }
            {...register("department")}
          >
            <option value="" disabled>
              اختر القسم
            </option>
            {STAFF_DEPARTMENT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {departmentError === undefined ? null : (
            <small
              className="form-field__error"
              id={`${inputId}-department-error`}
              role="alert"
            >
              {departmentError}
            </small>
          )}
        </label>
      </fieldset>
      {failure === null ? null : (
        <p role="alert" className="text-sm text-rose-700">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn-pill btn-teal"
          disabled={isSubmitting}
        >
          {isSubmitting ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
        </button>
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
