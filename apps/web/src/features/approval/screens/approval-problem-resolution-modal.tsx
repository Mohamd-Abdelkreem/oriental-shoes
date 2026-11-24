"use client";
import { useToast } from "@/components/toast";

import { useEffect, useId, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  MessageSquareText,
  X,
} from "lucide-react";
import type {
  ApprovalOrderData,
  ContactSpecifications,
  ManufacturingIssueDto,
} from "@template/contracts";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { applyApiFormError, useZodForm } from "@/shared/forms/form";
import { apiFailureMessage, getApiError } from "@/services/api/api-client";
import {
  useP04OperationalScope,
  isCurrentP04OperationalScope,
} from "@/shared/query/operational-scope";
import { useApprovalOrder } from "../hooks/approval.hooks";
import { useApprovalCommand } from "../hooks/approval-commands.hooks";
import {
  ApprovalLocalCommandError,
  ApprovalSynchronizationError,
  type ApprovalCommandIntent,
} from "../model/approval-command-state";
import {
  issueDecisionFormSchema,
  contactReviewFormSchema,
  toResolveIssueBody,
  toReviewContactBody,
  type IssueDecisionFormValues,
  type ContactReviewFormValues,
} from "../model/approval-form.model";

type DecisionSelection = {
  orderId: string;
  pieceId: string;
  issueId: string;
  mode: "issue" | "reapproval";
  onClose: () => void;
};
type DecisionContext = DecisionSelection & {
  data: ApprovalOrderData;
  issue: ManufacturingIssueDto;
  unavailable: boolean;
};
const extraSpecificationLabels = {
  decoration: "التطعيم",
  decorationColor: "لون التطعيم",
  faceRight: "م١",
  faceLeft: "م٢",
  mixing: "م٣",
  face: "الوجه",
  soleAddition: "الإضافة",
  soleColor: "رقم اللون",
  additions: "الإضافات",
  aField: "A",
  fField: "F",
  sideNotes: "الملاحظات الجانبية",
  paperCodes: "أكواد القطعة",
} satisfies Record<
  Exclude<keyof ContactSpecifications, "catalogSelections">,
  string
>;

function extraSpecificationChanges(
  before: ContactSpecifications | undefined,
  proposed: ContactSpecifications | undefined,
) {
  if (before === undefined || proposed === undefined) return [];
  return Object.keys(extraSpecificationLabels).flatMap((key) => {
    if (!Object.hasOwn(extraSpecificationLabels, key)) return [];
    const field = key as keyof typeof extraSpecificationLabels;
    const from = before[field],
      to = proposed[field];
    const previous = Array.isArray(from) ? from.join(" · ") : from;
    const next = Array.isArray(to) ? to.join(" · ") : to;
    return previous === next
      ? []
      : [{ field, label: extraSpecificationLabels[field], previous, next }];
  });
}

const departmentLabels = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج",
  QUALITY: "الجودة",
};
const reviewDateFormat = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function ReviewTimestamp({ timestamp }: { timestamp: string }) {
  return (
    <time dateTime={timestamp}>
      {reviewDateFormat.format(new Date(timestamp))}
    </time>
  );
}

export function ApprovalProblemResolutionModal(selection: DecisionSelection) {
  const titleId = useId();
  const scope = useP04OperationalScope("APPROVAL"),
    query = useApprovalOrder(selection.orderId);
  const { refetch } = query;
  const eligible = scope !== null;
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
  const identity = JSON.stringify([
    scope,
    selection.orderId,
    selection.pieceId,
    selection.issueId,
    selection.mode,
  ]);
  const [opened, setOpened] = useState<{
    identity: string;
    data: ApprovalOrderData;
    issue: ManufacturingIssueDto;
  } | null>(null);
  const authored = opened?.identity === identity ? opened : null;
  if (
    authored === null &&
    scope !== null &&
    query.isFetchedAfterMount &&
    query.data !== undefined &&
    issue !== undefined
  ) {
    setOpened({ identity, data: query.data, issue });
  }
  return (
    <div className="oriental-modal-backdrop" onClick={selection.onClose}>
      <div
        className={`oriental-modal-container ${selection.mode === "reapproval" ? "max-w-2xl!" : ""}`}
        role="dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header shrink-0 gap-3">
          <h2 id={titleId} className="oriental-modal-title">
            {selection.mode === "issue"
              ? "قرار معالجة مشكلة التصنيع"
              : "مراجعة تواصل العميل وإعادة الاعتماد"}
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
        {scope !== null && authored !== null ? (
          <CapturedDecision
            key={identity}
            {...selection}
            data={query.data ?? authored.data}
            issue={issue ?? authored.issue}
            unavailable={
              query.isError || query.isFetching || issue === undefined
            }
          />
        ) : (
          <div
            className="p-5"
            role={
              eligible && (!query.isFetchedAfterMount || query.isPending)
                ? "status"
                : "alert"
            }
          >
            {query.isError
              ? apiFailureMessage(query.error)
              : eligible && (!query.isFetchedAfterMount || query.isPending)
                ? "جارٍ تحميل بيانات القرار…"
                : "المشكلة غير موجودة أو تغير سياقها؛ راجع الطلب الحالي."}
            {query.isError && (
              <button
                type="button"
                onClick={() => {
                  void query.refetch();
                }}
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function CapturedDecision(context: DecisionContext) {
  // Keep the authored context and dirty form until the user explicitly closes/reopens it.
  const [captured] = useState({ data: context.data, issue: context.issue });
  const issue = captured.issue,
    order = captured.data.order;
  const stale =
    context.data.order.version !== order.version ||
    context.issue.currentProposal?.id !== issue.currentProposal?.id ||
    context.issue.state !== issue.state;
  const piece = order.pieces.find(
    (candidate) => candidate.id === context.pieceId,
  );
  const allowed =
    context.mode === "issue"
      ? context.issue.allowedActions.canResolve
      : context.issue.allowedActions.canReviewContact;
  const formContext = {
    ...context,
    ...captured,
    unavailable: context.unavailable || stale || !allowed,
  };
  const companionPositions = order.pieces
    .filter(
      (candidate) =>
        candidate.id !== context.pieceId && candidate.cancelledAt === null,
    )
    .map((candidate) => candidate.position);
  return (
    <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm leading-6 sm:p-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-slate-600">العميل</dt>
            <dd className="font-bold wrap-anywhere text-slate-900">
              {order.customerSnapshot.name}
            </dd>
            <dd className="text-xs text-slate-600">
              <bdi>{order.customerSnapshot.phone}</bdi>
            </dd>
          </div>
          {piece && (
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-slate-600">
                {formatPieceSequence(piece.position - 1)}
              </dt>
              <dd className="flex flex-wrap gap-x-2 gap-y-0.5 font-semibold text-slate-900">
                {piece.model && (
                  <bdi className="wrap-anywhere">{piece.model}</bdi>
                )}
                {piece.leatherBase && (
                  <bdi className="wrap-anywhere">{piece.leatherBase}</bdi>
                )}
                {piece.size && (
                  <span>
                    مقاس <bdi>{piece.size}</bdi>
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
        <Link
          href={`/approval/orders/${order.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-teal-700 hover:underline"
        >
          <FileText size={14} aria-hidden="true" />
          <span>عرض أمر التفصيل</span>
          <bdi>{order.businessNumber}</bdi>
          <ExternalLink size={12} aria-hidden="true" />
        </Link>
        {companionPositions.length > 0 && (
          <p className="flex items-start gap-2 border-t border-slate-200 pt-2 text-xs leading-5 text-slate-600">
            <CheckCircle2
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-emerald-700"
            />
            <span>
              بقية القطع مستمرة في مسارها دون تعطيل:{" "}
              <bdi>{companionPositions.join("، ")}</bdi>
            </span>
          </p>
        )}
      </div>
      <div
        className={issue.instructions ? "grid gap-3 sm:grid-cols-2" : undefined}
      >
        <div className="min-w-0 space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
          <h3 className="font-bold text-rose-900">المشكلة المسجلة</h3>
          <p className="font-semibold wrap-anywhere whitespace-pre-wrap text-slate-900">
            {issue.reason}
          </p>
          {issue.notes && (
            <p className="wrap-anywhere whitespace-pre-wrap text-slate-700">
              {issue.notes}
            </p>
          )}
          <div className="border-t border-rose-200/70 pt-2 text-xs leading-5 wrap-anywhere text-slate-600">
            <p>
              <bdi>{issue.reporter.fullName}</bdi> ·{" "}
              {departmentLabels[issue.source.department]}
            </p>
            <ReviewTimestamp timestamp={issue.reportedAt} />
          </div>
        </div>
        {issue.instructions && (
          <div className="min-w-0 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="font-bold text-amber-950">
              تعليمات الاعتماد الحالية
            </h3>
            <p className="wrap-anywhere whitespace-pre-wrap text-slate-900">
              {issue.instructions.text}
            </p>
            <div className="border-t border-amber-200/70 pt-2 text-xs leading-5 wrap-anywhere text-slate-600">
              <p>
                <bdi>{issue.instructions.actor.fullName}</bdi>
              </p>
              <ReviewTimestamp timestamp={issue.instructions.occurredAt} />
            </div>
          </div>
        )}
      </div>
      {stale && (
        <p role="alert">
          تغيرت بيانات الطلب أو المقترح. المدخلات محفوظة هنا؛ أغلق النافذة وراجع
          البيانات الحالية قبل قرار جديد.
        </p>
      )}
      {(context.unavailable || !allowed) && (
        <p role="alert">بيانات القرار غير محدثة أو لم تعد هذه العملية متاحة.</p>
      )}
      {context.mode === "issue" ? (
        <IssueDecisionForm {...formContext} />
      ) : (
        <ContactReviewForm {...formContext} />
      )}
    </div>
  );
}
function useDecisionSubmission(context: DecisionContext) {
  const { toast } = useToast();
  const client = useQueryClient(),
    scope = useP04OperationalScope("APPROVAL"),
    command = useApprovalCommand(context.orderId, "APPROVAL");
  const [error, setError] = useState<string | null>(null),
    [reviewRequired, setReviewRequired] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disabled =
    context.unavailable || reviewRequired || command.state.phase !== "idle";
  const execute = async (
    intent: ApprovalCommandIntent,
    onFailure: (failure: unknown) => void,
  ) => {
    if (disabled || scope === null) return;
    setError(null);
    try {
      const result = await command.submit(intent);
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      command.acknowledge();
      context.onClose();
      toast.success(
        result.outcome.issueState === "SALES_CONTACT"
          ? "تم إرسال المشكلة للمبيعات لمتابعتها مع العميل"
          : result.outcome.pieceStage === "CANCELLED"
            ? "تم إلغاء القطعة وحفظ القرار"
            : "تم اعتماد إعادة القطعة للعمل",
      );
    } catch (failure: unknown) {
      if (!mounted.current || !isCurrentP04OperationalScope(client, scope))
        return;
      if (failure instanceof ApprovalSynchronizationError) return;
      if (failure instanceof ApprovalLocalCommandError) {
        if (failure.code === "INVARIANT") setError(failure.message);
        return;
      }
      const safe = getApiError(failure);
      setError(
        `${safe.message}${safe.requestId ? ` (${safe.requestId})` : ""}`,
      );
      if (safe.statusCode === 409) setReviewRequired(true);
      onFailure(failure);
    }
  };
  return { disabled, error, reviewRequired, execute };
}
function CancelConfirmation({
  onConfirm,
  onCancel,
  disabled,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="تأكيد إلغاء القطعة"
      className="space-y-2 rounded-lg border border-rose-300 bg-rose-100/70 p-3 text-rose-900"
    >
      <strong className="flex items-center gap-1.5">
        <AlertTriangle size={15} />
        إلغاء القطعة مع الاحتفاظ بسجلها
      </strong>
      <p>
        تُلغى هذه القطعة فقط. تظل بقية القطع مستمرة ويحدّث الخادم المبالغ
        المحفوظة.
      </p>
      <button
        type="button"
        disabled={disabled}
        className="btn-pill btn-rose"
        onClick={onConfirm}
      >
        تأكيد إلغاء القطعة
      </button>
      <button type="button" className="btn-pill btn-outline" onClick={onCancel}>
        العودة دون إلغاء
      </button>
    </div>
  );
}
function IssueDecisionForm(context: DecisionContext) {
  const form = useZodForm(issueDecisionFormSchema, {
    defaultValues: {
      decision: "RETURN_TO_DEPARTMENT",
      target: null,
      notes: "",
      reason: "",
      confirmed: false,
    },
  });
  const decision = useWatch({ control: form.control, name: "decision" }),
    submission = useDecisionSubmission(context);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disabled = submission.disabled || form.formState.isSubmitting;
  const save = async (values: IssueDecisionFormValues) => {
    if (disabled) return;
    await submission.execute(
      {
        operation: "RESOLVE_ISSUE",
        orderId: context.orderId,
        pieceId: context.pieceId,
        issueId: context.issueId,
        body: toResolveIssueBody(values, {
          commandId: crypto.randomUUID(),
          expectedVersion: context.data.order.version,
        }),
      },
      (failure) => {
        applyApiFormError(failure, form);
      },
    );
  };
  const changedDecision = () => {
    setConfirmOpen(false);
    form.setValue("confirmed", false);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (decision === "CANCEL") {
          void form.trigger("reason").then((valid) => {
            if (valid && !disabled) setConfirmOpen(true);
          });
        } else {
          void form.handleSubmit(save)(event);
        }
      }}
      className="space-y-4"
    >
      <div className="space-y-2 pt-1">
        <span className="block text-sm font-bold text-slate-800">
          اختر قرار الاعتماد:
        </span>
        {(
          [
            {
              value: "RETURN_TO_DEPARTMENT",
              title:
                "الخيار (أ): حل المشكلة وإعادة القطعة إلى القسم لمتابعة العمل",
              tone: "teal",
            },
            {
              value: "SEND_TO_SALES",
              title: "الخيار (ب): إرسال القطعة إلى المبيعات للتواصل مع العميل",
              tone: "amber",
            },
            {
              value: "CANCEL",
              title: "الخيار (ج): إلغاء القطعة مع الاحتفاظ بسجلها",
              tone: "rose",
            },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${decision === option.value ? "border-teal-500 bg-teal-50/60 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <input
              type="radio"
              {...form.register("decision", { onChange: changedDecision })}
              value={option.value}
              className="mt-0.5"
            />
            <strong className="block font-bold text-slate-900">
              {option.title}
            </strong>
          </label>
        ))}
      </div>
      {decision !== "CANCEL" && (
        <label className="flex items-center gap-2 pt-2">
          <span className="font-semibold text-slate-700">توجيه إلى قسم:</span>
          <select
            {...form.register("target", {
              setValueAs: (selected: unknown) =>
                selected === "" ? null : selected,
            })}
            className="oriental-input py-1 text-xs"
          >
            <option value="">اختر القسم صراحةً</option>
            <option value="CUTTING">قسم القص</option>
            <option value="PRODUCTION">الإنتاج والإصلاح</option>
          </select>
        </label>
      )}
      {form.formState.errors.target && (
        <p role="alert">{form.formState.errors.target.message}</p>
      )}
      <label className="block">
        <span className="mb-1 block font-semibold text-slate-700">
          {decision === "CANCEL"
            ? "سبب إلغاء القطعة *:"
            : decision === "SEND_TO_SALES"
              ? "تعليمات المبيعات للتواصل مع العميل *:"
              : "ملاحظات وتوجيه حل المشكلة للقسم *:"}
        </span>
        <textarea
          {...form.register(decision === "CANCEL" ? "reason" : "notes")}
          rows={2}
          className="oriental-textarea w-full text-xs"
        />
      </label>
      {form.formState.errors.notes && decision !== "CANCEL" && (
        <p role="alert">{form.formState.errors.notes.message}</p>
      )}
      {form.formState.errors.reason && decision === "CANCEL" && (
        <p role="alert">{form.formState.errors.reason.message}</p>
      )}
      {confirmOpen && decision === "CANCEL" && (
        <CancelConfirmation
          disabled={disabled}
          onCancel={() => {
            setConfirmOpen(false);
            form.setValue("confirmed", false);
          }}
          onConfirm={() => {
            form.setValue("confirmed", true);
            void form.handleSubmit(save)();
          }}
        />
      )}
      {submission.error && <p role="alert">{submission.error}</p>}
      {submission.reviewRequired && (
        <p role="alert">أغلق النافذة وراجع البيانات الحالية قبل قرار جديد.</p>
      )}
      <div className="flex items-center justify-between border-t pt-3">
        <button
          type="button"
          className="btn-pill btn-outline text-xs"
          onClick={context.onClose}
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={disabled}
          className={`btn-pill px-4 text-xs font-bold ${decision === "CANCEL" ? "btn-rose" : "btn-teal"}`}
        >
          {decision === "CANCEL"
            ? "مراجعة إلغاء القطعة"
            : "تنفيذ قرار الاعتماد"}
        </button>
      </div>
    </form>
  );
}
function ContactReviewForm(context: DecisionContext) {
  const proposal = context.issue.currentProposal;
  const form = useZodForm(contactReviewFormSchema, {
    defaultValues: {
      decision: proposal?.kind === "AMEND" ? "ACCEPT" : "RETURN_TO_SALES",
      notes: "",
      reason: "",
      confirmed: false,
    },
  });
  const decision = useWatch({ control: form.control, name: "decision" }),
    submission = useDecisionSubmission(context);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fieldErrorId = useId();
  const fieldError =
    form.formState.errors[decision === "ACCEPT" ? "notes" : "reason"]?.message;
  const disabled =
    submission.disabled || form.formState.isSubmitting || proposal === null;
  const save = async (values: ContactReviewFormValues) => {
    if (disabled) return;
    if (values.decision === "ACCEPT" && proposal.kind !== "AMEND") {
      form.setError("decision", {
        message:
          "هذا المقترح طلب إلغاء. اختر الإلغاء أو أعده إلى المبيعات للمراجعة.",
      });
      return;
    }
    await submission.execute(
      {
        operation: "REVIEW_CONTACT",
        orderId: context.orderId,
        pieceId: context.pieceId,
        issueId: context.issueId,
        body: toReviewContactBody(
          values,
          {
            commandId: crypto.randomUUID(),
            expectedVersion: context.data.order.version,
          },
          proposal.id,
        ),
      },
      (failure) => {
        applyApiFormError(failure, form);
      },
    );
  };
  if (proposal === null)
    return <p role="alert">لا يوجد مقترح حالي للمراجعة.</p>;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (decision === "CANCEL") {
          void form.trigger("reason").then((valid) => {
            if (valid && !disabled) setConfirmOpen(true);
          });
        } else {
          void form.handleSubmit(save)(event);
        }
      }}
      className="min-w-0 space-y-5"
    >
      <ContactProposalReview
        proposal={proposal}
        target={context.issue.resumeTarget}
      />
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 font-bold text-slate-900">قرار الاعتماد</legend>
        {(
          [
            { value: "ACCEPT", title: "قبول التعديل وإعادة الاعتماد" },
            {
              value: "RETURN_TO_SALES",
              title: "إرجاع القطعة للمبيعات مع السبب",
            },
            { value: "CANCEL", title: "إلغاء القطعة مع الاحتفاظ بسجلها" },
          ] as const
        )
          .filter(
            (option) => option.value !== "ACCEPT" || proposal.kind === "AMEND",
          )
          .map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 focus-within:ring-2 focus-within:ring-teal-500/40 ${decision === option.value ? "border-teal-500 bg-teal-50/60 text-teal-950" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
            >
              <input
                type="radio"
                {...form.register("decision", {
                  onChange: () => {
                    setConfirmOpen(false);
                    form.setValue("confirmed", false);
                  },
                })}
                value={option.value}
                className="size-4 shrink-0 accent-teal-700"
              />
              <strong>{option.title}</strong>
            </label>
          ))}
      </fieldset>
      <label className="block">
        <span className="mb-2 block font-semibold text-slate-700">
          {decision === "ACCEPT"
            ? "ملاحظات إعادة الاعتماد *:"
            : "سبب القرار *:"}
        </span>
        <textarea
          {...form.register(decision === "ACCEPT" ? "notes" : "reason")}
          rows={3}
          aria-invalid={fieldError !== undefined}
          aria-describedby={fieldError === undefined ? undefined : fieldErrorId}
          className="oriental-textarea block w-full leading-relaxed aria-invalid:border-rose-600!"
        />
      </label>
      {fieldError && (
        <p
          id={fieldErrorId}
          role="alert"
          className="text-sm leading-6 text-rose-700"
        >
          {fieldError}
        </p>
      )}
      {form.formState.errors.decision && (
        <p role="alert">{form.formState.errors.decision.message}</p>
      )}
      {confirmOpen && decision === "CANCEL" && (
        <CancelConfirmation
          disabled={disabled}
          onCancel={() => {
            setConfirmOpen(false);
            form.setValue("confirmed", false);
          }}
          onConfirm={() => {
            form.setValue("confirmed", true);
            void form.handleSubmit(save)();
          }}
        />
      )}
      {submission.error && <p role="alert">{submission.error}</p>}
      {submission.reviewRequired && (
        <p role="alert">أغلق النافذة وراجع البيانات الحالية قبل قرار جديد.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="btn-pill btn-outline text-xs"
          onClick={context.onClose}
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={disabled}
          className={`btn-pill px-4 text-xs font-bold ${decision === "CANCEL" ? "btn-rose" : "btn-teal"}`}
        >
          {decision === "CANCEL"
            ? "مراجعة إلغاء القطعة"
            : "تنفيذ قرار الاعتماد"}
        </button>
      </div>
    </form>
  );
}

const coreSpecificationLabels = {
  model: "الموديل",
  size: "المقاس",
  leatherBase: "الأساس",
  sole: "الأرضية",
} as const;

function ContactProposalReview({
  proposal,
  target,
}: {
  proposal: NonNullable<ManufacturingIssueDto["currentProposal"]>;
  target: ManufacturingIssueDto["resumeTarget"];
}) {
  const notesHeadingId = useId();
  const coreFields = Object.keys(
    coreSpecificationLabels,
  ) as (keyof typeof coreSpecificationLabels)[];
  const rows = [
    ...coreFields.map((field) => ({
      field,
      label: coreSpecificationLabels[field],
      previous: proposal.before[field],
      next: proposal.proposed?.[field],
    })),
    ...extraSpecificationChanges(
      proposal.before.specifications,
      proposal.proposed?.specifications,
    ),
  ];
  return (
    <>
      <section
        aria-labelledby={notesHeadingId}
        className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4"
      >
        <h3
          id={notesHeadingId}
          className="flex items-center gap-2 font-bold text-teal-950"
        >
          <MessageSquareText
            size={17}
            aria-hidden="true"
            className="shrink-0 text-teal-700"
          />
          ملاحظات تواصل المبيعات مع العميل
        </h3>
        <p className="text-base leading-7 wrap-anywhere whitespace-pre-wrap text-slate-900">
          {proposal.contactNotes}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-teal-200/80 pt-3 text-xs leading-5 wrap-anywhere text-slate-600">
          <bdi className="font-semibold text-teal-900">
            {proposal.submittedBy.fullName}
          </bdi>
          <ReviewTimestamp timestamp={proposal.submittedAt} />
        </p>
      </section>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full table-fixed text-start text-xs sm:text-sm">
          <caption className="caption-top border-b border-slate-200 px-4 py-3 text-start">
            <span className="block font-bold text-slate-900">
              مقارنة المواصفات
            </span>
            <span className="mt-1 block text-xs text-slate-600">
              الوجهة المحفوظة:{" "}
              {target === null ? "—" : departmentLabels[target]}
            </span>
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th scope="col" className="w-[30%] px-3 py-2.5 text-start">
                المواصفة
              </th>
              <th scope="col" className="px-3 py-2.5 text-start">
                المعتمد الحالي
              </th>
              <th scope="col" className="px-3 py-2.5 text-start">
                المقترح
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map(({ field, label, previous, next }) => (
              <tr key={field}>
                <th
                  scope="row"
                  className="px-3 py-2.5 text-start align-top font-semibold wrap-anywhere text-slate-900"
                >
                  {label}
                </th>
                <td className="px-3 py-2.5 align-top wrap-anywhere whitespace-pre-wrap">
                  <bdi>{previous || "—"}</bdi>
                </td>
                <td
                  className={`px-3 py-2.5 align-top wrap-anywhere whitespace-pre-wrap ${proposal.proposed !== null && previous !== next ? "bg-teal-50 font-semibold text-teal-950" : ""}`}
                >
                  <bdi>{next || "—"}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
