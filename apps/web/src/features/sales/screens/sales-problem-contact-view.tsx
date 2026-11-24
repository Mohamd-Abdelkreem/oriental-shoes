"use client";

import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CircleAlert, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  salesUuidSchema,
  type ApprovalOrderData,
  type CatalogField,
  type ManufacturingIssueDto,
} from "@template/contracts";
import { useToast } from "@/components/toast";
import { ApprovalCommandRecovery } from "@/features/approval/components/approval-command-recovery";
import { useApprovalCommand } from "@/features/approval/hooks/approval-commands.hooks";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
} from "@/features/approval/model/approval-command-state";
import { apiFailureMessage, getApiError } from "@/services/api/api-client";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import { localValidationMessage } from "@/shared/validation/validation-copy";
import {
  isCurrentP04OperationalScope,
  useP04OperationalScope,
} from "@/shared/query/operational-scope";
import {
  OrderPaperForm,
  type CatalogSelectionChange,
} from "@/features/orders/components/order-paper-form";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { OrientalPageHeader } from "@/features/prototype/components/page-header";
import { useSalesContactOrder } from "../hooks/sales-contact.hooks";
import { useCatalog } from "../hooks/catalogs.hooks";
import {
  toAuthoritativePaperState,
  toSubmittedPaper,
} from "../model/order-view.model";
import {
  salesContactFormSchema,
  salesContactFields,
  type SalesContactField,
  toSubmitContactBody,
  type SalesContactFormValues,
  type ContactDirtyFields,
} from "../model/sales-contact.model";

type ContactRoute = {
  orderId: string;
  issueId: string;
};
type ContactContext = ContactRoute & {
  data: ApprovalOrderData;
  issue: ManufacturingIssueDto;
  unavailable: boolean;
};
const departmentLabels = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج",
  QUALITY: "الجودة",
};
const instructionDate = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});
export function SalesProblemContactView({ orderId, issueId }: ContactRoute) {
  const validRoute =
    salesUuidSchema.safeParse(orderId).success &&
    salesUuidSchema.safeParse(issueId).success;
  const scope = useP04OperationalScope("SALES_CONTACT"),
    query = useSalesContactOrder(validRoute ? orderId : null);
  const { refetch } = query,
    eligible = validRoute && scope !== null;
  useEffect(() => {
    if (eligible) void refetch();
  }, [
    eligible,
    scope?.actorId,
    scope?.accessVersion,
    scope?.epoch,
    orderId,
    refetch,
  ]);
  const issue = query.data?.workflow.issues.find(
    (candidate) => candidate.id === issueId,
  );
  const canAuthor =
    scope !== null && issue?.allowedActions.canSubmitContact === true;
  const loading = eligible && (!query.isFetchedAfterMount || query.isPending);
  const identity = JSON.stringify([scope, orderId, issueId]);
  const [opened, setOpened] = useState<{
    identity: string;
    data: ApprovalOrderData;
    issue: ManufacturingIssueDto;
  } | null>(null);
  const authored = opened?.identity === identity ? opened : null;
  if (authored === null && !loading && canAuthor && query.data !== undefined)
    setOpened({ identity, data: query.data, issue });
  return (
    <div className="min-w-0 space-y-5">
      <OrientalPageHeader
        eyebrow="المبيعات / التواصل مع العميل"
        title={
          query.data
            ? `تصحيح القطعة في ${query.data.order.businessNumber}`
            : "تصحيح القطعة بعد التواصل مع العميل"
        }
        subtitle={query.data?.order.customerSnapshot.name}
        actions={
          validRoute ? (
            <Link
              href={`/sales/orders/${orderId}`}
              className="btn-pill btn-outline"
            >
              العودة للطلب
            </Link>
          ) : (
            <Link
              href="/sales/orders/returned"
              className="btn-pill btn-outline"
            >
              الطلبات المعادة للتعديل
            </Link>
          )
        }
      />
      {eligible && (
        <ApprovalCommandRecovery orderId={orderId} capability="SALES_CONTACT" />
      )}
      {query.isError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800"
        >
          تعذّر تحديث بيانات التواصل. {apiFailureMessage(query.error)}{" "}
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => {
              void refetch();
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">جارٍ تحميل أمر التفصيل وبيانات التواصل…</p>
      ) : authored !== null && eligible ? (
        <ContactForm
          key={identity}
          orderId={orderId}
          issueId={issueId}
          data={query.data ?? authored.data}
          issue={issue ?? authored.issue}
          unavailable={query.isError || query.isFetching || !canAuthor}
        />
      ) : (
        !query.isError && (
          <p
            role="alert"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
          >
            {issue?.state === "REAPPROVAL"
              ? "تم إرسال المقترح وهذه القطعة بانتظار إعادة الاعتماد."
              : "تعذّر فتح نموذج التواصل لهذه القطعة. راجع حالة القطعة وصلاحيات حسابك."}
          </p>
        )
      )}
    </div>
  );
}
function ContactForm(context: ContactContext) {
  const [captured] = useState({ data: context.data, issue: context.issue });
  const piece = captured.data.order.pieces.find(
    (candidate) => candidate.id === captured.issue.pieceId,
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
  const router = useRouter();
  const { toast } = useToast();
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
  const [draftLabels, setDraftLabels] = useState<
    Partial<Record<SalesContactField, string>>
  >({});
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
  const needsNewSelection = salesContactFields.some(
    (key) =>
      dirty[key] === true &&
      values[key] !== null &&
      values[key] !== (piece.catalogSelections?.[key] ?? null),
  );
  const selectCatalogField = (
    pieceId: string,
    field: CatalogField,
    selection: CatalogSelectionChange,
  ) => {
    const key = salesContactFields.find((candidate) => candidate === field);
    if (disabled || pieceId !== piece.id || key === undefined) return;
    const { entryId, displayValue } = selection;
    if (entryId === null ? key !== "sole" : !catalogAvailable) return;
    form.setValue(key, entryId, { shouldDirty: true });
    form.clearErrors(key);
    setDraftLabels((previous) => ({ ...previous, [key]: displayValue }));
    if (key === "sole") setSoleClear(entryId === null);
  };
  const restoreSole = () => {
    if (disabled) return;
    form.setValue("sole", piece.catalogSelections?.sole ?? null, {
      shouldDirty: true,
    });
    form.clearErrors("sole");
    setDraftLabels((previous) => ({ ...previous, sole: piece.sole ?? "" }));
    setSoleClear(false);
  };
  const showFailure = (failure: unknown) => {
    if (failure instanceof ApprovalSynchronizationError) return;
    if (failure instanceof ApprovalLocalCommandError) {
      if (failure.code === "INVARIANT")
        setError("تغيّر سياق العملية. ارجع للطلب وراجع بيانات القطعة من جديد.");
      return;
    }
    if (failure instanceof z.ZodError) {
      for (const issue of failure.issues) {
        const field = salesContactFields.find(
          (candidate) => issue.path[issue.path.length - 1] === candidate,
        );
        if (field)
          form.setError(field, {
            message: localValidationMessage(issue.message, field),
          });
      }
      setError("راجع الاختيارات المطلوبة قبل إرسال المقترح.");
      return;
    }
    const safe = getApiError(failure);
    for (const [path, messages] of Object.entries(safe.fieldErrors)) {
      const field = salesContactFields.find(
        (candidate) =>
          path === `body.changes.${candidate}` ||
          path === `changes.${candidate}`,
      );
      if (field && messages[0])
        form.setError(field, { type: "server", message: messages[0] });
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
        pieceId: piece.id,
        issueId: context.issueId,
        body,
      });
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      command.acknowledge();
      toast.success(
        kind === "CANCEL_REQUEST"
          ? "تم إرسال طلب إلغاء القطعة للاعتماد"
          : "تم إرسال مقترح تعديل القطعة للاعتماد",
      );
      router.push(`/sales/orders/${context.orderId}`);
    } catch (failure: unknown) {
      if (mounted.current && isCurrentP04OperationalScope(client, scope))
        showFailure(failure);
    }
  };
  const issue = captured.issue,
    order = captured.data.order;
  const pieceLabel = formatPieceSequence(piece.position - 1);
  const paper = toSubmittedPaper(order);
  const paperState = toAuthoritativePaperState(
    order,
    catalogAvailable ? (catalog.data ?? null) : null,
  );
  const fieldErrors = Object.fromEntries(
    salesContactFields.flatMap((key) => {
      const message = form.formState.errors[key]?.message;
      return message === undefined
        ? []
        : [[`${piece.id}:${key}`, message] as const];
    }),
  );
  const contactNotesError = form.formState.errors.contactNotes?.message;
  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit((submitted) => save(submitted, "AMEND"))(event);
      }}
      className="min-w-0 space-y-5"
      aria-label="مراجعة أمر التفصيل بعد التواصل مع العميل"
    >
      <section
        aria-label="المشكلة وتعليمات الاعتماد"
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-slate-900">{pieceLabel}</h2>
          <a
            href="#sales-contact-paper"
            className="btn-pill btn-outline text-xs"
          >
            الانتقال لتعديل القطعة
            <ArrowDown size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="grid gap-3 p-4 text-sm sm:px-5 md:grid-cols-2">
          <div className="flex min-w-0 gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
            <CircleAlert
              size={18}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-amber-700"
            />
            <div className="min-w-0 space-y-1.5">
              <h3 className="font-bold text-amber-950">المشكلة المسجلة</h3>
              <p className="leading-relaxed wrap-anywhere whitespace-pre-wrap text-slate-900">
                {issue.reason}
              </p>
              {issue.notes && (
                <p className="leading-relaxed wrap-anywhere whitespace-pre-wrap text-slate-700">
                  {issue.notes}
                </p>
              )}
              <p className="pt-1 text-xs wrap-anywhere text-slate-600">
                {issue.reporter.fullName} ·{" "}
                {departmentLabels[issue.source.department]}
              </p>
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
            {issue.instructions && (
              <div className="mb-3 flex gap-3 border-b border-slate-200 pb-3">
                <ClipboardList
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-teal-700"
                />
                <div className="min-w-0 space-y-1.5">
                  <h3 className="font-bold text-slate-900">
                    تعليمات مسؤول الاعتماد الحالية
                  </h3>
                  <p className="leading-relaxed wrap-anywhere whitespace-pre-wrap text-slate-900">
                    {issue.instructions.text}
                  </p>
                  <p className="pt-1 text-xs wrap-anywhere text-slate-600">
                    {issue.instructions.actor.fullName} ·{" "}
                    <time dateTime={issue.instructions.occurredAt}>
                      {instructionDate.format(
                        new Date(issue.instructions.occurredAt),
                      )}
                    </time>
                  </p>
                </div>
              </div>
            )}
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <b>الوجهة المحفوظة:</b>{" "}
              <span className="rounded-md bg-white px-2 py-1 font-semibold ring-1 ring-slate-200">
                {issue.resumeTarget === null
                  ? "—"
                  : departmentLabels[issue.resumeTarget]}
              </span>
            </p>
          </div>
        </div>
      </section>
      <section
        id="sales-contact-paper"
        tabIndex={-1}
        aria-label="أمر التفصيل الحالي"
        className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            أمر التفصيل الحالي
          </h2>
          <p className="text-xs text-slate-600">
            عدّل خانات {pieceLabel} مباشرةً. مرّر أفقيًا لعرض كل الأعمدة.
          </p>
        </div>
        <OrderPaperForm
          order={paper}
          lines={paper.items.map((line) =>
            line.id === piece.id ? { ...line, ...draftLabels } : line,
          )}
          displayReference={order.businessNumber}
          mode="readOnly"
          showInteractionHint={false}
          dataState={{
            ...paperState,
            selectionsByPiece: {
              ...paperState.selectionsByPiece,
              [piece.id]: {
                ...piece.catalogSelections,
                model: values.model ?? null,
                size: values.size ?? null,
                leatherBase: values.leatherBase ?? null,
                sole: values.sole ?? null,
              },
            },
          }}
          pieceCatalogEdit={{
            pieceId: piece.id,
            fields: disabled
              ? []
              : catalogAvailable
                ? salesContactFields
                : ["sole"],
            restoreSole: soleClear ? restoreSole : undefined,
          }}
          onCatalogSelection={selectCatalogField}
          fieldErrorMessages={fieldErrors}
          invalidCells={new Set(Object.keys(fieldErrors))}
        />
      </section>
      <section
        id="sales-contact-changes"
        tabIndex={-1}
        aria-labelledby="sales-contact-heading"
        className="scroll-mt-24 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <h2
          id="sales-contact-heading"
          className="text-sm font-bold text-slate-900"
        >
          تواصل المبيعات مع العميل
        </h2>
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
            تغير سياق القطعة. راجع بيانات الطلب الحالية قبل إرسال مقترح جديد.
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
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-700">
            ملاحظات تواصل المبيعات مع العميل *:
          </span>
          <textarea
            {...form.register("contactNotes")}
            rows={2}
            aria-required="true"
            aria-invalid={contactNotesError !== undefined}
            aria-describedby={
              contactNotesError === undefined
                ? undefined
                : "sales-contact-notes-error"
            }
            className="oriental-textarea block w-full text-xs aria-invalid:border-rose-600!"
          />
        </label>
        {contactNotesError !== undefined && (
          <p
            id="sales-contact-notes-error"
            role="alert"
            className="-mt-2 text-xs font-semibold text-rose-700"
          >
            {contactNotesError}
          </p>
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
                className="btn-pill bg-red-700 text-xs text-white hover:bg-red-800 disabled:opacity-50"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <button
            type="button"
            disabled={disabled}
            className="btn-pill bg-red-700 text-xs text-white hover:bg-red-800 disabled:opacity-50"
            onClick={() => {
              void form
                .trigger("contactNotes", { shouldFocus: true })
                .then((valid) => {
                  if (valid) setRequestOpen(true);
                });
            }}
          >
            طلب إلغاء القطعة
          </button>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={disabled || (needsNewSelection && !catalogAvailable)}
              className="btn-pill btn-teal text-xs"
            >
              إرسال المقترح للاعتماد
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
