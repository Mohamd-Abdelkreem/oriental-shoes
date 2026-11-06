import type { Route } from "next";
import type { FieldNamesMarkedBoolean, UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import {
  customerCaptureSchema,
  customerPhoneSchema,
  type CustomerCapture,
  type CustomerDto,
  type UpdateCustomerBody,
} from "@template/contracts";
import { getApiError } from "@/services/api/api-client";

export type CustomerFormValues = z.input<typeof customerCaptureSchema>;
export type CustomerDirtyFields = Partial<
  Readonly<FieldNamesMarkedBoolean<CustomerFormValues>>
>;
export type CustomerFormErrorTarget = Pick<
  UseFormReturn<CustomerFormValues, CustomerFormValues, CustomerCapture>,
  "getValues" | "setError"
>;
const fields = ["name", "phone", "email", "address", "notes"] as const;
export const makeCustomerDefaults = (
  customer?: CustomerDto,
): CustomerFormValues => ({
  name: customer?.name ?? "",
  phone: customer?.phone ?? "",
  email: customer?.email ?? "",
  address: customer?.address ?? "",
  notes: customer?.notes ?? "",
});
export const toCustomerPatch = (
  values: CustomerFormValues,
  dirtyFields: CustomerDirtyFields,
): UpdateCustomerBody["patch"] => {
  const capture = customerCaptureSchema.parse(values);
  const patch: UpdateCustomerBody["patch"] = {};
  for (const field of fields) {
    if (dirtyFields[field] !== true) continue;
    // Separate required values from nullable optional captures for strict assignment.
    if (field === "name" || field === "phone") patch[field] = capture[field];
    else patch[field] = capture[field];
  }
  return patch;
};
export const parseCustomerRoutePhone = (segment: string): string | null => {
  let phone: string;
  try {
    phone = decodeURIComponent(segment);
  } catch (error: unknown) {
    if (error instanceof URIError) return null;
    throw error;
  }
  const parsed = customerPhoneSchema.safeParse(phone);
  return parsed.success ? parsed.data : null;
};
export const customerRoute = (
  phone: string,
  workspace: "sales" | "admin",
  edit = false,
): Route => {
  const canonical = customerPhoneSchema.parse(phone);
  if (workspace === "admin") {
    if (edit) throw new Error("There is no administrator customer edit route.");
    return `/admin/customers/${encodeURIComponent(canonical)}` as Route;
  }
  return `/sales/customers/${encodeURIComponent(canonical)}${edit ? "/edit" : ""}` as Route;
};
export const applyCustomerCommandError = (
  error: unknown,
  form: CustomerFormErrorTarget,
  operation: "create" | "update",
): string => {
  const failure = getApiError(error),
    prefix = operation === "create" ? "body.customer." : "body.patch.";
  let first = true;
  for (const [path, messages] of Object.entries(failure.fieldErrors)) {
    const field = fields.find((candidate) => path === `${prefix}${candidate}`),
      message = messages[0];
    if (field === undefined || message === undefined) continue;
    form.setError(field, { type: "server", message }, { shouldFocus: first });
    first = false;
  }
  if (failure.code === "CUSTOMER_PHONE_CONFLICT")
    form.setError(
      "phone",
      { type: "server", message: "رقم الهاتف مسجل لعميل آخر." },
      { shouldFocus: first },
    );
  const message =
    failure.code === "CUSTOMER_PHONE_CONFLICT"
      ? "رقم الهاتف مسجل بالفعل؛ اختر العميل الموجود أو راجع الرقم."
      : failure.code === "CUSTOMER_VERSION_CONFLICT"
        ? "تغيرت بيانات العميل؛ احتفظ بإدخالك وأعد التحميل للمراجعة."
        : "تعذّر حفظ بيانات العميل. احتفظ بإدخالك وراجع البيانات أو حاول مجدداً.";
  return failure.requestId ? `${message} (${failure.requestId})` : message;
};
