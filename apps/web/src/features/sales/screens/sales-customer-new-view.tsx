"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Info, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customerCaptureSchema,
  customerDataSchema,
  createCustomerBodySchema,
  type CustomerCapture,
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
  customerKeys,
} from "@/features/customers/hooks/customers.hooks";
import {
  applyCustomerCommandError,
  customerRoute,
  makeCustomerDefaults,
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

export function SalesCustomerNewView() {
  const scope = useOperationalScope();
  if (scope === null)
    return <p role="status">البيانات غير متاحة لهذا الحساب.</p>;
  return (
    <CustomerNewEditor
      key={`${scope.actorId}:${String(scope.accessVersion)}:${String(scope.epoch)}`}
      scope={scope}
    />
  );
}
function CustomerNewEditor({ scope }: { scope: OperationalScope }) {
  "use no memo";
  const router = useRouter(),
    client = useQueryClient();
  const form = useZodForm(customerCaptureSchema, {
    defaultValues: makeCustomerDefaults(),
  });
  const phone = form.watch("phone"),
    email = form.watch("email") ?? "";
  const phoneQuery = useCustomerByPhone(phone);
  const emailQuery = useCustomerList({
    search: email.trim().slice(0, 150),
    page: 1,
    limit: 25,
  });
  const duplicateByPhone =
    phoneQuery.data !== undefined ? phoneQuery.data.customer : null;
  const duplicateByEmail =
    email.trim() === ""
      ? undefined
      : emailQuery.data?.customers.find(
          (row) =>
            row.customer.email?.toLowerCase() === email.trim().toLowerCase(),
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
  const locked = phase !== "editing";
  const finish = (saved: SalesCommandData) => {
    const intent = retained.current;
    if (!current() || intent === null) return;
    if (
      saved.kind !== "customer" ||
      saved.receipt.operation !== intent.variables.command.operation ||
      saved.receipt.commandId !== intent.variables.command.body.commandId ||
      saved.receipt.actor.id !== scope.actorId
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
        setErrorMessage(applyCustomerCommandError(error, form, "create"));
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
    const body = createCustomerBodySchema.parse({
      commandId: crypto.randomUUID(),
      customer: capture,
    });
    Object.freeze(body.customer);
    Object.freeze(body);
    const frozen = Object.freeze({
      operation: "CREATE_CUSTOMER" as const,
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
          saved.receipt.actor.id !== scope.actorId
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

  return (
    <div className="max-w-4xl space-y-6">
      <OrientalPageHeader
        eyebrow="المبيعات / دليل العملاء / عميل جديد"
        title="إضافة عميل جديد"
        subtitle="تسجيل عميل مشترك برقم اتصال سعودي؛ البريد اختياري ويمكن تكراره"
        actions={
          <Link href="/sales/customers" className="btn-pill btn-outline">
            <ArrowRight size={15} />
            <span>العودة لقائمة العملاء</span>
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
      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset disabled={locked} className="min-w-0 space-y-6 border-0 p-0">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">
              البيانات الأساسية للعميل
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              رقم الهاتف وسيلة للبحث والاتصال؛ يحتفظ العميل بمعرّف ثابت مستقل عن
              رقمه
            </p>
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
                placeholder="مثال: عبد الله بن حمد"
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
                placeholder="05XXXXXXXX"
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
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-rose-600" />
                    <span>
                      الرقم مسجل بالفعل للعميل:{" "}
                      <strong>{duplicateByPhone.name}</strong>
                    </span>
                  </div>
                  <Link
                    href={`/sales/customers/${encodeURIComponent(duplicateByPhone.phone)}`}
                    className="btn-pill btn-outline shrink-0 border-rose-300 bg-white text-xs text-rose-800 hover:bg-rose-100"
                  >
                    فتح ملف العميل
                  </Link>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="customer-email"
                className="block text-xs font-bold text-slate-700"
              >
                البريد الإلكتروني (اختياري)
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
                placeholder="customer@example.com"
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
                    تنبيه: هذا البريد مسجل أيضاً للعميل ({duplicateByEmail.name}
                    ).
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
                placeholder="مثال: الرياض — حي العليا"
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
                ملاحظات إضافية عن تفضيلات العميل
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
                placeholder="أي تفاصيل خاصة بمقاسات أو نوعية الجلود أو شروط التسليم..."
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
            <Link href="/sales/customers" className="btn-pill btn-outline">
              {locked ? "العودة" : "إلغاء"}
            </Link>
            <button
              type="submit"
              disabled={locked || conflict}
              className={`btn-pill btn-teal ${locked || conflict ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <UserPlus size={15} />
              <span>حفظ بيانات العميل</span>
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
