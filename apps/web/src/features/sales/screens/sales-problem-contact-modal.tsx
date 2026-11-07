"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { X } from "lucide-react";
import type {
  ApprovalOrderData,
  ManufacturingIssueDto,
} from "@template/contracts";
import { useApprovalCommand } from "@/features/approval/hooks/approval-commands.hooks";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
} from "@/features/approval/model/approval-command-state";
import { getApiError } from "@/services/api/api-client";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import {
  isCurrentP04OperationalScope,
  useP04OperationalScope,
} from "@/shared/query/operational-scope";
import { useSalesContactOrder } from "../hooks/sales-contact.hooks";
import { useCatalog } from "../hooks/catalogs.hooks";
import { toPaperCatalogOptions } from "../model/catalog-paper.model";
import {
  salesContactFormSchema,
  toSubmitContactBody,
  type SalesContactFormValues,
  type ContactDirtyFields,
} from "../model/sales-contact.model";

type ContactSelection = {
  orderId: string;
  pieceId: string;
  issueId: string;
  onClose: () => void;
};
type ContactContext = ContactSelection & {
  data: ApprovalOrderData;
  issue: ManufacturingIssueDto;
  unavailable: boolean;
};
const contactFields = [
  { key: "model", label: "الموديل:" },
  { key: "size", label: "المقاس:" },
  { key: "leatherBase", label: "الأساس (الجلد):" },
  { key: "sole", label: "الأرضية:" },
] as const;
const departmentLabels = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج",
  QUALITY: "الجودة",
};
export function SalesProblemContactModal(selection: ContactSelection) {
  const scope = useP04OperationalScope("SALES_CONTACT"),
    query = useSalesContactOrder(selection.orderId);
  const { refetch } = query,
    eligible = scope !== null;
  useEffect(() => {
    if (eligible) void refetch();
  }, [
    eligible,
    scope?.actorId,
    scope?.accessVersion,
    scope?.epoch,
    selection.orderId,
    refetch,
  ]);
  const issue = query.data?.workflow.issues.find(
    (candidate) =>
      candidate.id === selection.issueId &&
      candidate.pieceId === selection.pieceId,
  );
  const canAuthor =
    scope !== null &&
    query.data?.order.owner.id === scope.actorId &&
    issue?.allowedActions.canSubmitContact === true;
  const loading = eligible && (!query.isFetchedAfterMount || query.isPending);
  const identity = JSON.stringify([
    scope,
    selection.orderId,
    selection.pieceId,
    selection.issueId,
  ]);
  const [opened, setOpened] = useState<{
    identity: string;
    data: ApprovalOrderData;
    issue: ManufacturingIssueDto;
  } | null>(null);
  const authored = opened?.identity === identity ? opened : null;
  if (authored === null && !loading && canAuthor && query.data !== undefined)
    setOpened({ identity, data: query.data, issue });
  return (
    <div className="oriental-modal-backdrop" onClick={selection.onClose}>
      <div
        className="oriental-modal-container max-w-xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title">
            تعديل مواصفات القطعة بعد التواصل مع العميل
          </h2>
          <button
            type="button"
            className="oriental-modal-close"
            aria-label="إغلاق"
            onClick={selection.onClose}
          >
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <p role="status" className="p-5">
            جارٍ تحميل بيانات التواصل…
          </p>
        ) : authored !== null && scope !== null ? (
          <ContactForm
            key={identity}
            {...selection}
            data={query.data ?? authored.data}
            issue={issue ?? authored.issue}
            unavailable={query.isError || query.isFetching || !canAuthor}
          />
        ) : (
          <p role="alert" className="p-5">
            هذه القطعة غير متاحة لاستجابة هذا الحساب؛ يلزم مالك الطلب وحالة
            تواصل حالية.
          </p>
        )}
        {query.isError && (
          <div role="alert" className="p-5">
            تعذّر تحديث بيانات التواصل.{" "}
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function ContactForm(context: ContactContext) {
  const [captured] = useState({ data: context.data, issue: context.issue });
  const piece = captured.data.order.pieces.find(
    (candidate) => candidate.id === context.pieceId,
  );
  if (!piece) return <p role="alert">القطعة غير موجودة في النسخة الحالية.</p>;
  return <ContactEditor {...context} captured={captured} piece={piece} />;
}
function ContactEditor({
  captured,
  piece,
  ...context
}: ContactContext & {
  captured: Pick<ContactContext, "data" | "issue">;
  piece: ApprovalOrderData["order"]["pieces"][number];
}) {
  const client = useQueryClient(),
    scope = useP04OperationalScope("SALES_CONTACT"),
    command = useApprovalCommand(context.orderId, "SALES_CONTACT"),
    catalog = useCatalog();
  const form = useZodForm(salesContactFormSchema, {
    defaultValues: {
      model: piece.catalogSelections?.model ?? null,
      size: piece.catalogSelections?.size ?? null,
      leatherBase: piece.catalogSelections?.leatherBase ?? null,
      sole: piece.catalogSelections?.sole ?? null,
      contactNotes: "",
    },
  });
  const values = useWatch({ control: form.control });
  const [soleClear, setSoleClear] = useState(false),
    [requestOpen, setRequestOpen] = useState(false),
    [error, setError] = useState<string | null>(null),
    [reviewRequired, setReviewRequired] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const stale =
    context.data.order.version !== captured.data.order.version ||
    context.issue.state !== captured.issue.state ||
    context.issue.currentProposal?.id !== captured.issue.currentProposal?.id;
  const disabled =
    context.unavailable ||
    stale ||
    reviewRequired ||
    command.state.phase !== "idle" ||
    form.formState.isSubmitting;
  const dirty: ContactDirtyFields = {
    ...form.formState.dirtyFields,
    ...(soleClear ? { sole: true } : {}),
  };
  const catalogAvailable =
    !catalog.isError &&
    !catalog.isFetching &&
    catalog.data?.availability === "available";
  const needsNewSelection = contactFields.some(
    ({ key }) =>
      dirty[key] === true &&
      values[key] !== null &&
      values[key] !== (piece.catalogSelections?.[key] ?? null),
  );
  const options = toPaperCatalogOptions(
    catalog.data ?? {
      availability: "unavailable",
      reason: "CATALOG_NOT_LOADED",
    },
  );
  const showFailure = (failure: unknown) => {
    if (failure instanceof ApprovalSynchronizationError) return;
    if (failure instanceof ApprovalLocalCommandError) {
      if (failure.code === "INVARIANT") setError(failure.message);
      return;
    }
    if (failure instanceof z.ZodError) {
      for (const issue of failure.issues) {
        const field = contactFields.find(
          (candidate) => issue.path[issue.path.length - 1] === candidate.key,
        );
        if (field) form.setError(field.key, { message: issue.message });
      }
      setError("راجع الاختيارات المطلوبة قبل إرسال المقترح.");
      return;
    }
    const safe = getApiError(failure);
    for (const [path, messages] of Object.entries(safe.fieldErrors)) {
      const field = contactFields.find(
        (candidate) =>
          path === `body.changes.${candidate.key}` ||
          path === `changes.${candidate.key}`,
      );
      if (field && messages[0])
        form.setError(field.key, { type: "server", message: messages[0] });
    }
    if (safe.statusCode === 409) setReviewRequired(true);
    setError(
      `${applyApiFormError(failure, form)}${safe.requestId ? ` (${safe.requestId})` : ""}`,
    );
  };
  const save = async (
    submitted: SalesContactFormValues,
    kind: "AMEND" | "CANCEL_REQUEST",
  ) => {
    if (
      disabled ||
      scope === null ||
      (kind === "AMEND" && needsNewSelection && !catalogAvailable)
    )
      return;
    setError(null);
    try {
      const body = toSubmitContactBody(
        submitted,
        dirty,
        piece,
        {
          commandId: crypto.randomUUID(),
          expectedVersion: captured.data.order.version,
        },
        kind,
      );
      await command.submit({
        operation: "SUBMIT_CONTACT",
        orderId: context.orderId,
        pieceId: context.pieceId,
        issueId: context.issueId,
        body,
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      command.acknowledge();
      context.onClose();
    } catch (failure: unknown) {
      if (mounted.current && isCurrentP04OperationalScope(client, scope))
        showFailure(failure);
    }
  };
  const issue = captured.issue,
    order = captured.data.order;
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit((submitted) => save(submitted, "AMEND"))(event);
      }}
      className="space-y-4 p-5"
    >
      <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
        <strong className="block font-bold text-rose-900">
          المشكلة المسجلة من قِبل {departmentLabels[issue.source.department]} (
          {issue.reporter.fullName}):
        </strong>
        <p className="text-rose-800">{issue.reason}</p>
        <p>{issue.notes}</p>
        <p>
          <b>الوجهة المحفوظة:</b>{" "}
          {issue.resumeTarget === null
            ? "—"
            : departmentLabels[issue.resumeTarget]}
        </p>
        {issue.instructions && (
          <div className="border-t border-rose-200/60 pt-1 text-slate-700">
            <b>تعليمات مسؤول الاعتماد الحالية:</b>
            <p>{issue.instructions.text}</p>
            <p>
              {issue.instructions.actor.fullName} ·{" "}
              {issue.instructions.occurredAt}
            </p>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            العميل: <b>{order.customerSnapshot.name}</b>
          </div>
          <div>
            الهاتف: <b dir="ltr">{order.customerSnapshot.phone}</b>
          </div>
          <div>
            الزخرفة المحفوظة: <b>{piece.decoration}</b>
          </div>
          <div>
            السعر المحفوظ: <b>{piece.unitPrice}</b>
          </div>
        </div>
      </div>
      {issue.currentProposal && (
        <div className="rounded-lg border border-slate-200 p-3 text-xs">
          <strong>المقترح السابق للمراجعة فقط</strong>
          <p>{issue.currentProposal.contactNotes}</p>
          {issue.currentProposal.proposed && (
            <p>
              {issue.currentProposal.proposed.model} ·{" "}
              {issue.currentProposal.proposed.size} ·{" "}
              {issue.currentProposal.proposed.leatherBase} ·{" "}
              {issue.currentProposal.proposed.sole ?? "—"}
            </p>
          )}
        </div>
      )}
      {(stale || reviewRequired) && (
        <p role="alert">
          تغير سياق القطعة؛ المدخلات محفوظة هنا. أغلق النافذة وراجع النسخة
          الحالية قبل مقترح جديد.
        </p>
      )}
      {context.unavailable && (
        <p role="alert">بيانات التواصل غير محدثة؛ لا يمكن الإرسال حالياً.</p>
      )}
      {(!catalogAvailable || catalog.isFetching) && (
        <div
          role={
            catalog.isError || catalog.data?.availability === "unavailable"
              ? "alert"
              : "status"
          }
          className="text-xs"
        >
          {catalog.isFetching
            ? "جارٍ تحديث الكتالوج…"
            : "الكتالوج غير متاح؛ تبقى القيم المحفوظة. يمكن تأكيد المواصفات دون تغيير أو طلب الإلغاء."}
          <button
            type="button"
            onClick={() => {
              void catalog.refetch();
            }}
          >
            تحديث الكتالوج
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {contactFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">
                {label}
              </span>
              <Controller
                control={form.control}
                name={key}
                render={({ field }) => {
                  const retainedId = piece.catalogSelections?.[key] ?? null,
                    retainedLabel = piece[key] ?? "—";
                  return (
                    <select
                      {...field}
                      value={field.value ?? ""}
                      disabled={!catalogAvailable || disabled}
                      onChange={(event) => {
                        const selected =
                          event.target.value === "" ? null : event.target.value;
                        field.onChange(selected);
                        if (key === "sole") setSoleClear(selected === null);
                      }}
                      className="oriental-input w-full"
                    >
                      <option value="">
                        {key === "sole" && soleClear
                          ? "بدون أرضية"
                          : retainedId === null
                            ? `القيمة المحفوظة: ${retainedLabel}`
                            : key === "sole"
                              ? "بدون أرضية"
                              : "اختر قيمة صالحة"}
                      </option>
                      {retainedId !== null &&
                        !options[key].some(
                          (option) => option.value === retainedId,
                        ) && (
                          <option value={retainedId}>
                            {retainedLabel} (القيمة المحفوظة)
                          </option>
                        )}
                      {options[key].map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  );
                }}
              />
            </label>
            <p className="text-[10px] text-slate-500">
              المحفوظ: {piece[key] ?? "—"}
            </p>
            {key === "sole" && (
              <button
                type="button"
                disabled={disabled}
                className="text-xs text-rose-600"
                onClick={() => {
                  form.setValue("sole", null, { shouldDirty: true });
                  setSoleClear(true);
                }}
              >
                مسح الأرضية
              </button>
            )}
            {key === "sole" && soleClear && (
              <button
                type="button"
                disabled={disabled}
                className="text-xs text-slate-600"
                onClick={() => {
                  form.setValue("sole", piece.catalogSelections?.sole ?? null, {
                    shouldDirty: true,
                  });
                  setSoleClear(false);
                }}
              >
                الاحتفاظ بالأرضية المحفوظة
              </button>
            )}
            {form.formState.errors[key] && (
              <p role="alert">{form.formState.errors[key].message}</p>
            )}
          </div>
        ))}
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-700">
          ملاحظات تواصل المبيعات مع العميل *:
        </span>
        <textarea
          {...form.register("contactNotes")}
          rows={2}
          className="oriental-textarea w-full text-xs"
        />
      </label>
      {form.formState.errors.contactNotes && (
        <p role="alert">{form.formState.errors.contactNotes.message}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {requestOpen && (
        <div
          role="alertdialog"
          aria-label="طلب إلغاء القطعة"
          className="space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900"
        >
          <p className="font-bold">إرسال طلب إلغاء هذه القطعة للاعتماد؟</p>
          <p>
            تبقى القطعة متوقفة ولا يتغير السعر أو المبلغ أو التصنيع حتى قرار
            الاعتماد.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn-pill btn-outline text-xs"
              onClick={() => {
                setRequestOpen(false);
              }}
            >
              تراجع
            </button>
            <button
              type="button"
              disabled={disabled}
              className="btn-pill btn-rose text-xs"
              onClick={() => {
                void form.handleSubmit((submitted) =>
                  save(submitted, "CANCEL_REQUEST"),
                )();
              }}
            >
              تأكيد طلب الإلغاء
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-t pt-3">
        <button
          type="button"
          disabled={disabled}
          className="text-xs font-bold text-rose-600 hover:text-rose-800"
          onClick={() => {
            void form.trigger("contactNotes").then((valid) => {
              if (valid) setRequestOpen(true);
            });
          }}
        >
          طلب إلغاء القطعة
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-pill btn-outline text-xs"
            onClick={context.onClose}
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={disabled || (needsNewSelection && !catalogAvailable)}
            className="btn-pill btn-teal text-xs"
          >
            إرسال المقترح للاعتماد
          </button>
        </div>
      </div>
    </form>
  );
}
