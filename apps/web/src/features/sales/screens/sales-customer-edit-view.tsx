"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Info, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customerCaptureSchema,
  customerDataSchema,
  updateCustomerBodySchema,
  type CustomerCapture,
  type CustomerDto,
  type SalesCommandData,
} from "@template/contracts";
import { useZodForm } from "@/shared/forms/form";
import {
  useOperationalScope,
  isCurrentOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import {
  useCustomerByPhone,
  useCustomerList,
  useCustomer,
  customerKeys,
} from "@/features/customers/hooks/customers.hooks";
import {
  applyCustomerCommandError,
  customerRoute,
  parseCustomerRoutePhone,
  makeCustomerDefaults,
  toCustomerPatch,
} from "@/features/customers/model/customer-form.model";
import {
  SalesSynchronizationError,
  isUnknownSalesWrite,
  type SalesCommandVariables,
} from "@/features/sales/model/sales-command-state";
import {
  useSalesCommand,
  useSalesCommandReceipt,
  synchronizeSalesCommand,
} from "@/features/sales/hooks/sales-commands.hooks";
import { ApiContractError, getApiError } from "@/services/api/api-client";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";

export function SalesCustomerEditView({ customerId }: { customerId: string }) {
  const scope = useOperationalScope();
  const phone = parseCustomerRoutePhone(customerId);
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  if (phone === null) return <p role="alert">رقم العميل غير صالح.</p>;
  return (
    <CustomerEditRoute
      key={`${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}:${customerId}`}
      scope={scope}
      phone={phone}
    />
  );
}
function CustomerEditRoute({
  scope,
  phone,
}: {
  scope: OperationalScope;
  phone: string;
}) {
  const [stableId, setStableId] = useState<string | null>(null);
  const resolved = useCustomerByPhone(stableId === null ? phone : null),
    detail = useCustomer(stableId);
  if (stableId === null && resolved.data !== undefined)
    setStableId(resolved.data.customer.id);
  if (
    (stableId === null && resolved.isError) ||
    (detail.isError && detail.data === undefined)
  )
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4"
      >
        تعذّر تحميل العميل.{" "}
        <button
          className="btn-pill btn-outline"
          type="button"
          onClick={() => {
            void (stableId === null ? resolved.refetch() : detail.refetch());
          }}
        >
          إعادة المحاولة
        </button>
        <Link href="/sales/customers">دليل العملاء</Link>
      </div>
    );
  if (
    stableId === null &&
    resolved.fetchStatus === "idle" &&
    resolved.status === "pending"
  )
    return (
      <div role="alert">
        العميل غير موجود أو رقم الهاتف غير صالح.
        <Link href="/sales/customers">دليل العملاء</Link>
      </div>
    );
  if (detail.data === undefined)
    return <p role="status">جارٍ تحميل العميل...</p>;
  const record = detail.data.customer;
  const reload = async (): Promise<CustomerDto> => {
    const current = await detail.refetch({ throwOnError: true });
    if (current.data === undefined || current.data.customer.id !== record.id)
      throw new ApiContractError();
    return current.data.customer;
  };
  return (
    <>
      {detail.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs"
        >
          تعذّر تحديث بيانات العميل؛ إدخالك لم يتغير.{" "}
          {getApiError(detail.error).requestId}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void detail.refetch();
            }}
          >
            إعادة تحديث العميل
          </button>
        </div>
      )}
      <CustomerEditEditor
        key={record.id}
        scope={scope}
        customer={record}
        onReload={reload}
      />
    </>
  );
}
function CustomerEditEditor({
  scope,
  customer,
  onReload,
}: {
  scope: OperationalScope;
  customer: CustomerDto;
  onReload: () => Promise<CustomerDto>;
}) {
  "use no memo";
  const router = useRouter(),
    client = useQueryClient();
  const form = useZodForm(customerCaptureSchema, {
    defaultValues: makeCustomerDefaults(customer),
  });
  const dirtyFields = form.formState.dirtyFields;
  const phone = form.watch("phone"),
    email = form.watch("email") ?? "";
  const phoneQuery = useCustomerByPhone(phone);
  const emailQuery = useCustomerList({
    search: email.trim().slice(0, 150),
    page: 1,
    limit: 25,
  });
  const duplicateByPhone =
    phoneQuery.data !== undefined && phoneQuery.data.customer.id !== customer.id
      ? phoneQuery.data.customer
      : null;
  const duplicateByEmail =
    email.trim() === ""
      ? undefined
      : emailQuery.data?.customers.find(
          (row) =>
            row.customer.email?.toLowerCase() === email.trim().toLowerCase() &&
            row.customer.id !== customer.id,
        )?.customer;
  const command = useSalesCommand();
  const retained = useRef<{
    variables: SalesCommandVariables;
    unknown: boolean;
    confirmed: SalesCommandData | null;
    running: boolean;
  } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const receipt = useSalesCommandReceipt(receiptId);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current && isCurrentOperationalScope(client, scope);
  const [phase, setPhase] = useState<
    "editing" | "pending" | "unknown" | "confirmed" | "retryable" | "checking"
  >("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [baseVersion, setBaseVersion] = useState(customer.version);
  const locked = phase !== "editing";
  const finish = (saved: SalesCommandData) => {
    const intent = retained.current;
    if (!current() || intent === null) return;
    if (
      saved.kind !== "customer" ||
      saved.receipt.operation !== intent.variables.command.operation ||
      saved.receipt.commandId !== intent.variables.command.body.commandId ||
      saved.receipt.actor.id !== scope.actorId ||
      saved.receipt.resourceId !== customer.id
    )
      throw new ApiContractError();
    const detail = customerDataSchema.safeParse(
      client.getQueryData(customerKeys.detail(scope, saved.receipt.resourceId)),
    );
    if (
      !detail.success ||
      detail.data.customer.id !== saved.receipt.resourceId ||
      detail.data.customer.version < saved.receipt.afterVersion
    )
      throw new SalesSynchronizationError(saved, null);
    const destination = customerRoute(detail.data.customer.phone, "sales");
    form.reset(makeCustomerDefaults(detail.data.customer));
    setBaseVersion(detail.data.customer.version);
    retained.current = null;
    setReceiptId(null);
    setPhase("editing");
    setErrorMessage(null);
    setConflict(false);
    if (current()) router.push(destination);
  };
  const perform = async (intent: NonNullable<typeof retained.current>) => {
    if (intent.running || !current()) return;
    intent.running = true;
    setPhase("pending");
    setErrorMessage(null);
    try {
      const saved = await command.mutateAsync(intent.variables);
      intent.confirmed = saved;
      finish(saved);
    } catch (error: unknown) {
      if (!current()) return;
      if (error instanceof SalesSynchronizationError) {
        intent.confirmed = error.result;
        setPhase("confirmed");
        setErrorMessage("تم الحفظ؛ تعذّر تحديث العرض.");
      } else if (
        intent.unknown ||
        isUnknownSalesWrite(error) ||
        getApiError(error).code === "SALES_COMMAND_CONFLICT"
      ) {
        intent.unknown = true;
        setPhase("unknown");
        setErrorMessage(
          "لم يتأكد الحفظ بعد. احتفظ بإدخالك وتحقق من نتيجة العملية قبل إنشاء عملية أخرى.",
        );
      } else if (getApiError(error).code === "SALES_TRANSACTION_CONFLICT") {
        setPhase("retryable");
        setErrorMessage("تعذّر إتمام العملية؛ يمكنك إعادة محاولة الحفظ نفسه.");
      } else {
        retained.current = null;
        setReceiptId(null);
        setPhase("editing");
        setConflict(getApiError(error).code === "CUSTOMER_VERSION_CONFLICT");
        setErrorMessage(applyCustomerCommandError(error, form, "update"));
      }
    } finally {
      intent.running = false;
    }
  };
  const submit = (capture: CustomerCapture) => {
    if (
      retained.current !== null ||
      !current() ||
      conflict ||
      phase !== "editing"
    )
      return;
    const patch = toCustomerPatch(capture, dirtyFields);
    if (Object.keys(patch).length === 0) {
      setErrorMessage("لا توجد تغييرات للحفظ.");
      return;
    }
    const body = updateCustomerBodySchema.parse({
      commandId: crypto.randomUUID(),
      expectedVersion: baseVersion,
      patch,
    });
    Object.freeze(body.patch);
    Object.freeze(body);
    const frozen = Object.freeze({
      operation: "UPDATE_CUSTOMER" as const,
      customerId: customer.id,
      body,
    });
    const variables = Object.freeze({
      scope: Object.freeze({ ...scope }),
      command: frozen,
    });
    const intent = {
      variables,
      unknown: false,
      confirmed: null,
      running: false,
    };
    retained.current = intent;
    setReceiptId(intent.variables.command.body.commandId);
    void perform(intent);
  };
  const observe = async () => {
    const intent = retained.current;
    if (intent === null || intent.running || !current()) return;
    intent.running = true;
    setPhase("checking");
    try {
      if (intent.confirmed === null) {
        const observed = await receipt.refetch({ throwOnError: true }),
          saved = observed.data;
        if (
          saved === undefined ||
          saved.kind !== "customer" ||
          saved.receipt.operation !== intent.variables.command.operation ||
          saved.receipt.commandId !== intent.variables.command.body.commandId ||
          saved.receipt.actor.id !== scope.actorId ||
          saved.receipt.resourceId !== customer.id
        )
          throw new ApiContractError();
        intent.confirmed = saved;
      }
      await synchronizeSalesCommand(client, scope, intent.confirmed);
      finish(intent.confirmed);
    } catch (error: unknown) {
      if (!current()) return;
      setPhase(intent.confirmed === null ? "unknown" : "confirmed");
      setErrorMessage(
        intent.confirmed === null
          ? getApiError(error).statusCode === 404
            ? "لم تظهر نتيجة محفوظة بعد؛ لم تتأكد نتيجة العملية السابقة."
            : "تعذّر التحقق من الحفظ؛ احتفظ بالعملية نفسها وحاول التحقق مجدداً."
          : "تم الحفظ؛ تعذّر تحديث العرض.",
      );
    } finally {
      intent.running = false;
    }
  };
  const retrySame = () => {
    const intent = retained.current;
    if (intent !== null) void perform(intent);
  };
  const phoneChanged = phone.trim() !== customer.phone;
  const newer = customer.version > baseVersion;
  const reload = async () => {
    if (locked || !current()) return;
    setPhase("checking");
    try {
      const fresh = await onReload();
      if (!current()) return;
      form.reset(makeCustomerDefaults(fresh));
      setBaseVersion(fresh.version);
      retained.current = null;
      setReceiptId(null);
      setConflict(false);
      setErrorMessage(null);
    } catch {
      if (current())
        setErrorMessage(
          "تعذّر تحميل البيانات الحالية؛ احتفظ بإدخالك وحاول مجدداً.",
        );
    } finally {
      if (current()) setPhase("editing");
    }
  };
  return (
    <div className="max-w-4xl space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / دليل العملاء / تعديل بيانات العميل"
        title={`تعديل: ${customer.name}`}
        subtitle="تحديث بيانات الاتصال مع الحفاظ على معرّف العميل وروابطه الثابتة"
        actions={
          <Link
            href={`/sales/customers/${encodeURIComponent(customer.phone)}`}
            className="btn-pill btn-secondary"
          >
            <ArrowRight size={15} />
            <span>العودة لملف العميل</span>
          </Link>
        }
      />

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <AlertCircle size={18} className="shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {phoneChanged && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <strong className="block font-bold">تغيير رقم الاتصال:</strong>
            <p className="mt-0.5 text-xs text-amber-800">
              يبقى معرّف العميل وروابط مسوداته ثابتة عند تغيير الرقم؛ تبقى
              بيانات الطلبات المقدمة التاريخية ضمن مرحلتها.
            </p>
          </div>
        </div>
      )}

      {phase !== "editing" && (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>
            {phase === "pending"
              ? "جارٍ حفظ البيانات؛ المغادرة لا تؤكد التراجع عن العملية."
              : phase === "checking"
                ? "جارٍ التحقق وتحديث العرض..."
                : phase === "confirmed"
                  ? "تم الحفظ؛ تعذّر تحديث العرض."
                  : "نتيجة الحفظ غير مؤكدة؛ احتفظ بالعملية نفسها."}
          </p>
          {(phase === "unknown" || phase === "confirmed") && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                void observe();
              }}
            >
              {phase === "confirmed" ? "تحديث العرض" : "التحقق من الحفظ"}
            </button>
          )}
          {(phase === "unknown" || phase === "retryable") && (
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={retrySame}
            >
              إعادة محاولة الحفظ نفسه
            </button>
          )}
        </div>
      )}
      {(newer || conflict) && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          توجد بيانات أحدث؛ لن يستبدل التحديث إدخالك تلقائياً.
          <button
            type="button"
            disabled={locked}
            className="btn-pill btn-outline"
            onClick={() => {
              void reload();
            }}
          >
            إعادة التحميل والمراجعة
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset disabled={locked} className="min-w-0 space-y-6 border-0 p-0">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                بيانات العميل الحالية
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                تعديل تفاصيل الاتصال والعنوان
              </p>
            </div>
            <span
              className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700"
              dir="ltr"
            >
              ID: {customer.id}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="customer-name"
                className="block text-xs font-bold text-slate-700"
              >
                اسم العميل <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                {...form.register("name")}
                id="customer-name"
                aria-invalid={form.formState.errors.name !== undefined}
                aria-describedby={
                  form.formState.errors.name ? "customer-name-error" : undefined
                }
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
              />
              {form.formState.errors.name && (
                <p
                  id="customer-name-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة اسم العميل (حتى 150 حرفًا).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="customer-phone"
                className="block text-xs font-bold text-slate-700"
              >
                رقم الهاتف / الجوال <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                {...form.register("phone")}
                id="customer-phone"
                aria-invalid={form.formState.errors.phone !== undefined}
                aria-describedby={
                  form.formState.errors.phone
                    ? "customer-phone-error"
                    : undefined
                }
                dir="ltr"
                className={`w-full rounded-lg border px-3.5 py-2.5 font-mono text-sm focus:outline-none ${
                  duplicateByPhone
                    ? "border-rose-400 bg-rose-50/40 text-rose-900"
                    : "border-slate-200 focus:border-teal-500"
                }`}
              />
              {form.formState.errors.phone && (
                <p
                  id="customer-phone-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  يرجى إدخال رقم اتصال سعودي صالح.
                </p>
              )}
              {duplicateByPhone && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                  <AlertCircle size={13} />
                  <span>
                    الرقم مسجل مسبقاً لعميل آخر ({duplicateByPhone.name})!
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="customer-email"
                className="block text-xs font-bold text-slate-700"
              >
                البريد الإلكتروني
              </label>
              <input
                type="email"
                {...form.register("email")}
                id="customer-email"
                aria-invalid={form.formState.errors.email !== undefined}
                aria-describedby={
                  form.formState.errors.email
                    ? "customer-email-error"
                    : undefined
                }
                dir="ltr"
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
              />
              {form.formState.errors.email && (
                <p
                  id="customer-email-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  يرجى إدخال بريد إلكتروني صالح أو تركه فارغًا.
                </p>
              )}
              {duplicateByEmail && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                  <Info size={13} />
                  <span>
                    تنبيه: هذا البريد مسجل لعميل آخر ({duplicateByEmail.name}).
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="customer-address"
                className="block text-xs font-bold text-slate-700"
              >
                العنوان / المدينة
              </label>
              <input
                type="text"
                {...form.register("address")}
                id="customer-address"
                aria-invalid={form.formState.errors.address !== undefined}
                aria-describedby={
                  form.formState.errors.address
                    ? "customer-address-error"
                    : undefined
                }
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
              />
              {form.formState.errors.address && (
                <p
                  id="customer-address-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة العنوان (حتى 2000 حرف).
                </p>
              )}
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label
                htmlFor="customer-notes"
                className="block text-xs font-bold text-slate-700"
              >
                ملاحظات إضافية
              </label>
              <textarea
                rows={3}
                {...form.register("notes")}
                id="customer-notes"
                aria-invalid={form.formState.errors.notes !== undefined}
                aria-describedby={
                  form.formState.errors.notes
                    ? "customer-notes-error"
                    : undefined
                }
                className="w-full resize-none rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
              />
              {form.formState.errors.notes && (
                <p
                  id="customer-notes-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة الملاحظات (حتى 4000 حرف).
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href={`/sales/customers/${encodeURIComponent(customer.phone)}`}
              className="btn-pill btn-outline"
            >
              {locked ? "العودة" : "إلغاء"}
            </Link>
            <button
              type="submit"
              disabled={locked || conflict}
              className={`btn-pill btn-teal ${locked || conflict ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <CheckCircle2 size={15} />
              <span>حفظ التعديلات</span>
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
