"use client";
import { useToast } from "@/components/toast";

import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import type {
  ApprovalOrderData,
  ManufacturingIssueDto,
} from "@template/contracts";
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
const departmentLabels = {
  CUTTING: "القص",
  PRODUCTION: "الإنتاج",
  QUALITY: "الجودة",
};
export function ApprovalProblemResolutionModal(selection: DecisionSelection) {
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
        className="oriental-modal-container max-w-xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <h2 className="oriental-modal-title">
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
  return (
    <div className="space-y-4 p-5 text-xs">
      <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <div className="flex items-center justify-between">
          <strong className="font-bold text-rose-900">
            المشكلة المسجلة من قِبل {departmentLabels[issue.source.department]}{" "}
            ({issue.reporter.fullName}):
          </strong>
          <span className="font-mono text-[10px] text-rose-600">
            {issue.reportedAt}
          </span>
        </div>
        <p className="font-semibold text-rose-800">{issue.reason}</p>
        <p className="text-slate-700">{issue.notes}</p>
      </div>
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            العميل: <b>{order.customerSnapshot.name}</b> (
            <span dir="ltr">{order.customerSnapshot.phone}</span>)
          </span>
          <span>
            المواصفات:{" "}
            <b>
              {piece?.model} · {piece?.leatherBase} · مقاس {piece?.size}
            </b>
          </span>
          <Link
            href={`/approval/orders/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline"
          >
            <FileText size={12} />
            <span>{order.businessNumber} · عرض أمر التفصيل</span>
            <ExternalLink size={11} />
          </Link>
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-200 pt-1.5 text-slate-600">
          <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
          <span>
            بقية القطع مستمرة في مسارها دون تعطيل:{" "}
            {order.pieces
              .filter(
                (candidate) =>
                  candidate.id !== context.pieceId &&
                  candidate.cancelledAt === null,
              )
              .map((candidate) => candidate.position)
              .join(" · ")}
          </span>
        </div>
      </div>
      {issue.instructions && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <strong>تعليمات الاعتماد الحالية</strong>
          <p>{issue.instructions.text}</p>
          <p>
            {issue.instructions.actor.fullName} ·{" "}
            {issue.instructions.occurredAt}
          </p>
        </div>
      )}
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
      className="space-y-4"
    >
      <div className="rounded-lg border border-slate-200 p-3">
        <strong>
          الوجهة المحفوظة:{" "}
          {context.issue.resumeTarget === null
            ? "—"
            : departmentLabels[context.issue.resumeTarget]}
        </strong>
        <p>ملاحظات تواصل العميل: {proposal.contactNotes}</p>
        <p>
          {proposal.submittedBy.fullName} · {proposal.submittedAt}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th>المواصفة</th>
              <th>المعتمد الحالي</th>
              <th>المقترح</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                { key: "model", label: "الموديل" },
                { key: "size", label: "المقاس" },
                { key: "leatherBase", label: "الأساس" },
                { key: "sole", label: "الأرضية" },
              ] as const
            ).map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td>{proposal.before[field.key] ?? "—"}</td>
                <td>{proposal.proposed?.[field.key] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
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
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${decision === option.value ? "border-teal-500 bg-teal-50/60 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
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
                className="mt-0.5"
              />
              <strong>{option.title}</strong>
            </label>
          ))}
      </div>
      <label className="block">
        <span className="mb-1 block font-semibold text-slate-700">
          {decision === "ACCEPT"
            ? "ملاحظات إعادة الاعتماد *:"
            : "سبب القرار *:"}
        </span>
        <textarea
          {...form.register(decision === "ACCEPT" ? "notes" : "reason")}
          rows={2}
          className="oriental-textarea w-full text-xs"
        />
      </label>
      {form.formState.errors.notes && decision === "ACCEPT" && (
        <p role="alert">{form.formState.errors.notes.message}</p>
      )}
      {form.formState.errors.reason && decision !== "ACCEPT" && (
        <p role="alert">{form.formState.errors.reason.message}</p>
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
