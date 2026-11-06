"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  customerCaptureSchema,
  customerDataSchema,
  createCustomerBodySchema,
  type CustomerCapture,
  type CustomerDto,
  type SalesCommandData,
} from "@template/contracts";
import { useZodForm } from "@/shared/forms/form";
import {
  isCurrentOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import {
  useCustomerByPhone,
  useCustomerList,
  customerKeys,
  customerDetailOptions,
} from "@/features/customers/hooks/customers.hooks";
import {
  applyCustomerCommandError,
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

export function InlineCustomerModal({
  onClose,
  onCreated,
  originScope,
  originFormToken,
}: {
  onClose: () => void;
  onCreated: (customer: CustomerDto) => void;
  originScope: OperationalScope;
  originFormToken: object;
}) {
  "use no memo";
  const client = useQueryClient(),
    scope = originScope;
  const initialToken = useRef(originFormToken),
    containerRef = useRef<HTMLDivElement | null>(null),
    choosing = useRef(false);
  const titleId = useId();
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
    mounted.current &&
    initialToken.current === originFormToken &&
    isCurrentOperationalScope(client, scope);
  const [phase, setPhase] = useState<
    "editing" | "pending" | "unknown" | "confirmed" | "retryable" | "checking"
  >("editing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const locked = phase !== "editing";
  const busy = phase === "pending" || phase === "checking";
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
    form.reset(makeCustomerDefaults(detail.data.customer));
    retained.current = null;
    setReceiptId(null);
    setPhase("editing");
    setErrorMessage(null);
    if (current()) onCreated(detail.data.customer);
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
        setErrorMessage(applyCustomerCommandError(error, form, "create"));
      }
    } finally {
      intent.running = false;
    }
  };
  const submit = (capture: CustomerCapture) => {
    if (retained.current !== null || !current() || phase !== "editing") return;
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

  const requestClose = useCallback(() => {
    if (retained.current?.running === true || choosing.current) return;
    onClose();
  }, [onClose]);
  useEffect(() => {
    form.setFocus("name");
  }, [form]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (container === null) return;
      const controls = Array.from(
        container.querySelectorAll<HTMLElement>(
          "input:not(:disabled),button:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        ),
      );
      const first = controls[0],
        last = controls.at(-1),
        active = document.activeElement;
      if (first === undefined || last === undefined) {
        event.preventDefault();
        container.focus();
        return;
      }
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !container.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
    };
  }, [requestClose]);
  const chooseExisting = async () => {
    if (
      duplicateByPhone === null ||
      choosing.current ||
      phase !== "editing" ||
      !current()
    )
      return;
    choosing.current = true;
    setPhase("checking");
    try {
      const chosen = await client.fetchQuery({
        ...customerDetailOptions(client, scope, duplicateByPhone.id),
        staleTime: 0,
      });
      if (current()) onCreated(chosen.customer);
    } catch (error: unknown) {
      if (current()) {
        setErrorMessage(applyCustomerCommandError(error, form, "create"));
        setPhase("editing");
      }
    } finally {
      choosing.current = false;
    }
  };
  return (
    <div className="oriental-modal-backdrop" onClick={requestClose}>
      <div
        ref={containerRef}
        className="oriental-modal-container max-w-md"
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="oriental-modal-header">
          <h2 id={titleId} className="oriental-modal-title">
            إنشاء عميل جديد داخل أمر التفصيل
          </h2>
          <button
            type="button"
            aria-label="إغلاق النافذة"
            disabled={busy}
            className="oriental-modal-close"
            onClick={requestClose}
          >
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event);
          }}
          noValidate
          className="space-y-4 p-5 text-sm"
        >
          {errorMessage !== null && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {errorMessage}
            </div>
          )}
          <fieldset
            disabled={locked}
            className="min-w-0 space-y-4 border-0 p-0"
          >
            <label className="block" htmlFor="inline-customer-name">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                اسم العميل *:
              </span>
              <input
                {...form.register("name")}
                id="inline-customer-name"
                required
                type="text"
                className="oriental-input w-full"
                placeholder="الاسم الكامل"
                aria-invalid={form.formState.errors.name !== undefined}
                aria-describedby={
                  form.formState.errors.name === undefined
                    ? undefined
                    : "inline-customer-name-error"
                }
              />
              {form.formState.errors.name !== undefined && (
                <span
                  id="inline-customer-name-error"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة هذا الحقل.
                </span>
              )}
            </label>
            <label className="block" htmlFor="inline-customer-phone">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                رقم الهاتف *:
              </span>
              <input
                {...form.register("phone")}
                id="inline-customer-phone"
                required
                type="text"
                className="oriental-input w-full"
                placeholder="05xxxxxxxx"
                aria-invalid={form.formState.errors.phone !== undefined}
                aria-describedby={
                  form.formState.errors.phone === undefined
                    ? undefined
                    : "inline-customer-phone-error"
                }
              />
              {form.formState.errors.phone !== undefined && (
                <span
                  id="inline-customer-phone-error"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة هذا الحقل.
                </span>
              )}
            </label>
            <label className="block" htmlFor="inline-customer-address">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                العنوان:
              </span>
              <input
                {...form.register("address")}
                id="inline-customer-address"
                type="text"
                className="oriental-input w-full"
                placeholder="المدينة، الحي"
                aria-invalid={form.formState.errors.address !== undefined}
                aria-describedby={
                  form.formState.errors.address === undefined
                    ? undefined
                    : "inline-customer-address-error"
                }
              />
              {form.formState.errors.address !== undefined && (
                <span
                  id="inline-customer-address-error"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة هذا الحقل.
                </span>
              )}
            </label>
            <label className="block" htmlFor="inline-customer-email">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                البريد الإلكتروني (اختياري):
              </span>
              <input
                {...form.register("email")}
                id="inline-customer-email"
                type="email"
                className="oriental-input w-full"
                placeholder="example@domain.com"
                aria-invalid={form.formState.errors.email !== undefined}
                aria-describedby={
                  form.formState.errors.email === undefined
                    ? undefined
                    : "inline-customer-email-error"
                }
              />
              {form.formState.errors.email !== undefined && (
                <span
                  id="inline-customer-email-error"
                  className="text-xs text-rose-700"
                >
                  يرجى مراجعة هذا الحقل.
                </span>
              )}
            </label>
            {duplicateByPhone !== null && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p>
                  رقم الهاتف مسجل للعميل:{" "}
                  <strong>{duplicateByPhone.name}</strong>{" "}
                  <bdi>{duplicateByPhone.phone}</bdi>
                </p>
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={() => {
                    void chooseExisting();
                  }}
                >
                  اختيار هذا العميل
                </button>
              </div>
            )}
            {duplicateByEmail !== undefined && (
              <p className="text-xs text-amber-700">
                تنبيه: البريد مسجل أيضاً للعميل {duplicateByEmail.name}؛ لا يمنع
                ذلك الحفظ.
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-3">
              <button type="submit" className="btn-pill btn-teal">
                حفظ وربط بالطلب
              </button>
              <button
                type="button"
                className="btn-pill btn-outline"
                onClick={requestClose}
              >
                إلغاء
              </button>
            </div>
          </fieldset>
          {phase !== "editing" && (
            <div
              role="status"
              className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <p>
                {busy
                  ? "جارٍ الحفظ أو التحقق؛ الإغلاق لا يؤكد التراجع عن عملية مرسلة."
                  : phase === "confirmed"
                    ? "تم الحفظ؛ تعذّر تحديث العرض."
                    : "لم تتأكد نتيجة الحفظ بعد؛ الإغلاق لا يعني إلغاء العملية."}
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
              {!busy && (
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={requestClose}
                >
                  مغادرة النافذة
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
