"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  approvalOrderDataSchema,
  type ApprovalOrderData,
} from "@template/contracts";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
} from "../model/approval-command-state";
import { getApiError } from "@/services/api/api-client";
import {
  isCurrentP04OperationalScope,
  useP04OperationalScope,
} from "@/shared/query/operational-scope";
import { useQueryClient } from "@tanstack/react-query";
import {
  approvalOrderOptions,
  approvalKeys,
  useApprovalOrder,
} from "../hooks/approval.hooks";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import {
  returnInitialFormSchema,
  toReturnInitialBody,
  type ReturnInitialFormValues,
} from "../model/approval-form.model";

type ReturnProps = {
  orderId: string;
  onClose: () => void;
  onReturned: (shouldNotify: boolean) => void;
};
export function ApprovalReturnModal(props: ReturnProps) {
  const scope = useP04OperationalScope("APPROVAL"),
    query = useApprovalOrder(props.orderId);
  return (
    <div className="oriental-modal-backdrop" onClick={props.onClose}>
      <div
        className="oriental-modal-container max-w-md"
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title">
            إعادة أمر التفصيل للمبيعات للتعديل
          </h2>
          <button
            type="button"
            className="oriental-modal-close"
            aria-label="إغلاق"
            onClick={props.onClose}
          >
            <X size={18} />
          </button>
        </div>
        {scope !== null && query.data ? (
          <ReturnForm
            key={`${scope.actorId}/${String(scope.accessVersion)}/${String(scope.epoch)}/${props.orderId}`}
            {...props}
            data={query.data}
            unavailable={query.isError || query.isFetching}
          />
        ) : (
          <p role={query.isError ? "alert" : "status"}>
            تعذّر إتاحة بيانات الاعتماد الحالية.
          </p>
        )}
      </div>
    </div>
  );
}
function ReturnForm({
  data,
  unavailable,
  onClose,
  onReturned,
  orderId,
}: ReturnProps & { data: ApprovalOrderData; unavailable: boolean }) {
  const client = useQueryClient(),
    scope = useP04OperationalScope("APPROVAL"),
    command = useApprovalCommand(orderId, "APPROVAL");
  const [baseVersion, setBaseVersion] = useState(data.order.version),
    [error, setError] = useState<string | null>(null);
  const form = useZodForm(returnInitialFormSchema, {
    defaultValues: { reason: "", notes: "" },
  });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [reviewRequired, setReviewRequired] = useState(false);
  const newer = data.order.version !== baseVersion || reviewRequired;
  const disabled =
    unavailable ||
    newer ||
    !data.workflow.allowedActions.canReturnInitial ||
    command.state.phase !== "idle" ||
    form.formState.isSubmitting;
  const submit = async (values: ReturnInitialFormValues) => {
    if (disabled || scope === null) return;
    setError(null);
    try {
      await command.submit({
        operation: "RETURN_INITIAL",
        orderId,
        body: toReturnInitialBody(values, {
          commandId: crypto.randomUUID(),
          expectedVersion: baseVersion,
        }),
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      onReturned(command.acknowledge());
    } catch (failure: unknown) {
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      if (failure instanceof ApprovalSynchronizationError) return;
      if (failure instanceof ApprovalLocalCommandError) {
        if (failure.code === "INVARIANT") setError(failure.message);
        return;
      }
      const safe = getApiError(failure);
      if (safe.statusCode === 409) setReviewRequired(true);
      setError(
        `${applyApiFormError(failure, form)}${safe.requestId ? ` (${safe.requestId})` : ""}`,
      );
    }
  };
  const review = async () => {
    if (scope === null) return;
    try {
      await client.fetchQuery({
        ...approvalOrderOptions(client, scope, orderId),
        staleTime: 0,
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      const published = approvalOrderDataSchema.parse(
        client.getQueryData(approvalKeys.order(scope, orderId)),
      );
      setBaseVersion(published.order.version);
      setReviewRequired(false);
      setError(null);
    } catch (failure: unknown) {
      if (mounted.current && isCurrentP04OperationalScope(client, scope))
        setError(applyApiFormError(failure, form));
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
      className="space-y-4 p-5 text-sm text-slate-700"
    >
      <p className="text-xs text-slate-500">
        يجب تحديد سبب الإعادة بدقة حتى يظهر لمندوب المبيعات في قائمة الطلبات
        المعادة للتصحيح.
      </p>
      {newer && (
        <div role="alert">
          تغيرت بيانات الطلب. راجع النسخة الحالية قبل إرسال قرار جديد.{" "}
          <button
            type="button"
            onClick={() => {
              void review();
            }}
          >
            مراجعة البيانات الحالية
          </button>
        </div>
      )}
      {unavailable && (
        <p role="alert">بيانات الاعتماد قيد التحديث أو تعذّر تحديثها.</p>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-800">
          سبب الإعادة الإلزامي *
        </span>
        <textarea
          {...form.register("reason")}
          rows={3}
          className="oriental-input w-full text-xs"
          aria-invalid={Boolean(form.formState.errors.reason)}
        />
      </label>
      {form.formState.errors.reason && (
        <p role="alert">{form.formState.errors.reason.message}</p>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-800">
          تفاصيل وملاحظات إضافية للمبيعات (اختياري):
        </span>
        <textarea
          {...form.register("notes")}
          rows={2}
          placeholder="حدد الأسطر أو البنود المحددة المطلوب تصحيحها..."
          className="oriental-textarea w-full text-xs"
        />
      </label>
      {form.formState.errors.notes && (
        <p role="alert">{form.formState.errors.notes.message}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        <button type="submit" disabled={disabled} className="btn-pill btn-rose">
          تأكيد الإعادة للمبيعات
        </button>
        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={onClose}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
