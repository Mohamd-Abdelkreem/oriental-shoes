"use client";
import { useToast } from "@/components/toast";

import { useEffect, useId, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import Link from "next/link";
import type { Route } from "next";
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
  ContactValues,
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
  orderHref?: Route<`/admin/approvals/${string}`> | undefined;
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
        className={`oriental-modal-container ${selection.mode === "reapproval" ? "max-w-[640px]!" : ""}`}
        role="dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header shrink-0 items-center! gap-3 px-4! py-3! sm:px-5!">
          <h2 id={titleId} className="oriental-modal-title text-[15px]!">
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
  const orderLink = (
    <Link
      href={context.orderHref ?? `/approval/orders/${order.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-[11.5px] font-bold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50/70"
    >
      <FileText size={13} aria-hidden="true" />
      <span>عرض أمر التفصيل</span>
      <bdi>{order.businessNumber}</bdi>
      <ExternalLink size={11} aria-hidden="true" />
    </Link>
  );
  return (
    <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-[13px] leading-5 sm:px-5 sm:py-3.5">
      {context.mode === "reapproval" &&
        issue.currentProposal?.kind === "CANCEL_REQUEST" && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
            <AlertTriangle
              aria-hidden="true"
              size={16}
              className="mt-0.5 shrink-0 text-rose-700"
            />
            <div>
              <h3 className="font-bold text-rose-950">
                طلب إلغاء القطعة من المبيعات
              </h3>
              <p className="mt-0.5 text-xs text-rose-900">
                القطعة بانتظار قرار الاعتماد.
              </p>
            </div>
          </div>
        )}
      <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-2.5">
        {context.mode === "reapproval" ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-500">
                  العميل:{" "}
                </span>
                <span className="text-[13px] font-bold wrap-anywhere text-slate-900">
                  {order.customerSnapshot.name}
                </span>
              </div>
              <span className="text-[11.5px] font-medium text-slate-500">
                <bdi>{order.customerSnapshot.phone}</bdi>
              </span>
              {piece && (
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {formatPieceSequence(piece.position - 1)}
                </span>
              )}
            </div>
            {orderLink}
          </div>
        ) : (
          <>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold text-slate-500">
                  العميل
                </dt>
                <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-bold wrap-anywhere text-slate-900">
                    {order.customerSnapshot.name}
                  </span>
                  <span className="text-[11.5px] font-medium text-slate-500">
                    <bdi>{order.customerSnapshot.phone}</bdi>
                  </span>
                </dd>
              </div>
              {piece && (
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-500">
                    {formatPieceSequence(piece.position - 1)}
                  </dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-slate-800">
                    {piece.model && (
                      <bdi className="rounded-md border border-slate-200 bg-white px-2 py-0.5 wrap-anywhere">
                        {piece.model}
                      </bdi>
                    )}
                    {piece.leatherBase && (
                      <bdi className="rounded-md border border-slate-200 bg-white px-2 py-0.5 wrap-anywhere">
                        {piece.leatherBase}
                      </bdi>
                    )}
                    {piece.size && (
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
                        مقاس <bdi>{piece.size}</bdi>
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2">
              {companionPositions.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11.5px] leading-4 text-slate-600">
                  <CheckCircle2
                    size={13}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />
                  <span>
                    بقية القطع مستمرة في مسارها دون تعطيل:{" "}
                    <bdi>{companionPositions.join("، ")}</bdi>
                  </span>
                </p>
              )}
              {orderLink}
            </div>
          </>
        )}
      </div>
      <div
        className={
          issue.instructions ? "grid gap-2.5 sm:grid-cols-2" : undefined
        }
      >
        <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-rose-200/90 bg-rose-50/60 px-3.5 py-2.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-rose-500"
                />
                المشكلة المسجلة
              </h3>
              {context.mode === "reapproval" && (
                <span className="rounded-md border border-rose-200/90 bg-white/80 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-800">
                  {departmentLabels[issue.source.department]}
                </span>
              )}
            </div>
            <p className="text-[12.5px] leading-5 font-semibold wrap-anywhere whitespace-pre-wrap text-slate-900">
              {issue.reason}
            </p>
            {issue.notes && (
              <p className="text-xs leading-5 wrap-anywhere whitespace-pre-wrap text-slate-600">
                {issue.notes}
              </p>
            )}
          </div>
          {context.mode !== "reapproval" && (
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-rose-200/70 pt-1.5 text-[11px] leading-4 wrap-anywhere text-slate-500">
              <p className="font-medium text-slate-600">
                <bdi>{issue.reporter.fullName}</bdi> ·{" "}
                {departmentLabels[issue.source.department]}
              </p>
              <ReviewTimestamp timestamp={issue.reportedAt} />
            </div>
          )}
        </div>
        {issue.instructions && (
          <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/55 px-3.5 py-2.5">
            <div className="space-y-1">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                />
                تعليمات الاعتماد الحالية
              </h3>
              <p className="text-[12.5px] leading-5 font-medium wrap-anywhere whitespace-pre-wrap text-slate-900">
                {issue.instructions.text}
              </p>
            </div>
            {context.mode !== "reapproval" && (
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-amber-200/70 pt-1.5 text-[11px] leading-4 wrap-anywhere text-slate-500">
                <p className="font-medium text-slate-600">
                  <bdi>{issue.instructions.actor.fullName}</bdi>
                </p>
                <ReviewTimestamp timestamp={issue.instructions.occurredAt} />
              </div>
            )}
          </div>
        )}
      </div>
      {stale && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
        >
          تغيرت بيانات الطلب أو المقترح. المدخلات محفوظة هنا؛ أغلق النافذة وراجع
          البيانات الحالية قبل قرار جديد.
        </p>
      )}
      {(context.unavailable || !allowed) && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
        >
          بيانات القرار غير محدثة أو لم تعد هذه العملية متاحة.
        </p>
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
      const shouldNotify = command.acknowledge();
      context.onClose();
      if (shouldNotify)
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
      className="space-y-2 rounded-xl border border-rose-300 bg-rose-50/90 p-3 text-xs text-rose-900"
    >
      <strong className="flex items-center gap-1.5 text-[12.5px]">
        <AlertTriangle size={14} />
        إلغاء القطعة مع الاحتفاظ بسجلها
      </strong>
      <p className="leading-5 text-rose-800">
        تُلغى هذه القطعة فقط. تظل بقية القطع مستمرة ويحدّث الخادم المبالغ
        المحفوظة.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={disabled}
          className="btn-pill btn-rose px-3.5! py-1.5! text-xs!"
          onClick={onConfirm}
        >
          تأكيد إلغاء القطعة
        </button>
        <button
          type="button"
          className="btn-pill btn-outline bg-white! px-3.5! py-1.5! text-xs!"
          onClick={onCancel}
        >
          العودة دون إلغاء
        </button>
      </div>
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
        <label className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-xs font-bold text-slate-700">
            توجيه إلى قسم:
          </span>
          <select
            {...form.register("target", {
              setValueAs: (selected: unknown) =>
                selected === "" ? null : selected,
            })}
            aria-invalid={Boolean(form.formState.errors.target)}
            className="oriental-select min-w-[210px] flex-1 sm:flex-initial"
          >
            <option value="">اختر القسم</option>
            <option value="CUTTING">قسم القص</option>
            <option value="PRODUCTION">الإنتاج والإصلاح</option>
          </select>
        </label>
      )}
      {form.formState.errors.target && (
        <p role="alert" className="text-xs font-medium text-rose-700">
          {form.formState.errors.target.message}
        </p>
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
      className="min-w-0 space-y-3"
    >
      <ContactProposalReview
        proposal={proposal}
        target={context.issue.resumeTarget}
      />
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-bold text-slate-800">
          قرار الاعتماد
        </legend>
        <div className="space-y-1.5">
          {(
            [
              {
                value: "ACCEPT",
                title: "قبول التعديل وإعادة الاعتماد",
                activeClass:
                  "border-teal-500 bg-teal-50/75 text-teal-950 ring-1 ring-teal-500/20",
                radioClass: "accent-teal-700",
              },
              {
                value: "RETURN_TO_SALES",
                title: "إرجاع القطعة للمبيعات مع السبب",
                activeClass:
                  "border-amber-500 bg-amber-50/75 text-amber-950 ring-1 ring-amber-500/20",
                radioClass: "accent-amber-600",
              },
              {
                value: "CANCEL",
                title: "إلغاء القطعة مع الاحتفاظ بسجلها",
                activeClass:
                  "border-rose-500 bg-rose-50/75 text-rose-950 ring-1 ring-rose-500/20",
                radioClass: "accent-rose-600",
              },
            ] as const
          )
            .filter(
              (option) =>
                option.value !== "ACCEPT" || proposal.kind === "AMEND",
            )
            .map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs leading-5 transition focus-within:ring-2 focus-within:ring-teal-500/40 ${decision === option.value ? option.activeClass : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80"}`}
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
                  className={`size-3.5 shrink-0 ${option.radioClass}`}
                />
                <strong className="font-bold">{option.title}</strong>
              </label>
            ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-700">
          {decision === "ACCEPT"
            ? "ملاحظات إعادة الاعتماد *:"
            : "سبب القرار *:"}
        </span>
        <textarea
          {...form.register(decision === "ACCEPT" ? "notes" : "reason")}
          rows={2}
          aria-invalid={fieldError !== undefined}
          aria-describedby={fieldError === undefined ? undefined : fieldErrorId}
          className="oriental-textarea block min-h-[62px]! w-full px-3! py-2! text-[13px]! leading-5 aria-invalid:border-rose-600!"
        />
      </label>
      {fieldError && (
        <p
          id={fieldErrorId}
          role="alert"
          className="text-xs leading-5 font-medium text-rose-700"
        >
          {fieldError}
        </p>
      )}
      {form.formState.errors.decision && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
        >
          {form.formState.errors.decision.message}
        </p>
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
      {submission.error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
        >
          {submission.error}
        </p>
      )}
      {submission.reviewRequired && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
        >
          أغلق النافذة وراجع البيانات الحالية قبل قرار جديد.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200/90 pt-3">
        <button
          type="button"
          className="btn-pill btn-outline px-4! py-1.5! text-xs!"
          onClick={context.onClose}
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={disabled}
          className={`btn-pill px-5! py-1.5! text-xs! font-bold ${decision === "CANCEL" ? "btn-rose" : "btn-teal"}`}
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
  return (
    <>
      <section
        aria-labelledby={notesHeadingId}
        className="rounded-xl border border-teal-200/90 bg-teal-50/55 px-3.5 py-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-teal-200/75 pb-1.5">
          <h3
            id={notesHeadingId}
            className="flex items-center gap-1.5 text-xs font-bold text-teal-950"
          >
            <MessageSquareText
              size={15}
              aria-hidden="true"
              className="shrink-0 text-teal-700"
            />
            ملاحظات تواصل المبيعات مع العميل
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-4 wrap-anywhere text-slate-600">
            <bdi className="font-semibold text-teal-900">
              {proposal.submittedBy.fullName}
            </bdi>
            <span aria-hidden="true" className="text-teal-300">
              ·
            </span>
            <ReviewTimestamp timestamp={proposal.submittedAt} />
          </p>
        </div>
        <p className="pt-2 text-[13px] leading-5.5 font-medium wrap-anywhere whitespace-pre-wrap text-slate-900">
          {proposal.contactNotes}
        </p>
      </section>
      {proposal.proposed !== null && (
        <ContactSpecificationComparison
          before={proposal.before}
          proposed={proposal.proposed}
          target={target}
        />
      )}
    </>
  );
}

function ContactSpecificationComparison({
  before,
  proposed,
  target,
}: {
  before: ContactValues;
  proposed: ContactValues;
  target: ManufacturingIssueDto["resumeTarget"];
}) {
  const coreFields = Object.keys(
    coreSpecificationLabels,
  ) as (keyof typeof coreSpecificationLabels)[];
  const rows = [
    ...coreFields.map((field) => ({
      field,
      label: coreSpecificationLabels[field],
      previous: before[field],
      next: proposed[field],
    })),
    ...extraSpecificationChanges(
      before.specifications,
      proposed.specifications,
    ),
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
      <table className="w-full table-fixed text-start text-xs">
        <caption className="caption-top border-b border-slate-200 bg-slate-50/60 px-3.5 py-2 text-start">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900">
              مقارنة المواصفات
            </span>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              الوجهة المحفوظة:{" "}
              {target === null ? "—" : departmentLabels[target]}
            </span>
          </span>
        </caption>
        <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold text-slate-600">
          <tr>
            <th scope="col" className="w-[28%] px-3 py-1.5 text-start">
              المواصفة
            </th>
            <th scope="col" className="px-3 py-1.5 text-start">
              المعتمد الحالي
            </th>
            <th scope="col" className="px-3 py-1.5 text-start">
              المقترح
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
          {rows.map(({ field, label, previous, next }) => (
            <tr key={field} className="transition-colors hover:bg-slate-50/50">
              <th
                scope="row"
                className="px-3 py-1.5 text-start align-middle font-semibold wrap-anywhere text-slate-800"
              >
                {label}
              </th>
              <td className="px-3 py-1.5 align-middle wrap-anywhere whitespace-pre-wrap text-slate-600">
                <bdi>{previous || "—"}</bdi>
              </td>
              <td
                className={`px-3 py-1.5 align-middle wrap-anywhere whitespace-pre-wrap ${previous !== next ? "bg-teal-50/80 font-bold text-teal-900" : "text-slate-800"}`}
              >
                <bdi>{next || "—"}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
