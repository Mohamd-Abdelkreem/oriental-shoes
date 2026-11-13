"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  readQualityOperationalScope,
  useQualityOperationalScope,
  isCurrentQualityOperationalScope,
} from "@/shared/query/operational-scope";
import { useQualityCommand } from "../hooks/quality-commands.hooks";
import { fetchQualityOrder } from "../hooks/quality.hooks";
import { captureQualitySelection } from "../model/quality-selection.model";
import {
  freezeQualityRows,
  resolveQualityTargets,
  type QualityWorkRow,
  type QualityReadAvailability,
} from "../model/quality-view.model";
import {
  type QualityIssueFormValues,
  qualityIssueFormSchema,
  toQualityIssueBody,
  applyQualityIssueFormErrors,
  qualityFailureMessage,
} from "../model/quality-form.model";
import { useSession } from "@/features/auth/hooks/auth.hooks";
import type {
  ManufacturingDepartment,
  ManufacturingOrderData,
} from "@template/contracts";
import { BaseDialog } from "@/features/prototype/components/base-dialog";
import { useZodForm, applyApiFormError } from "@/shared/forms/form";
import { useManufacturingCommand } from "../hooks/manufacturing-commands.hooks";
import { useManufacturingOrder } from "../hooks/manufacturing.hooks";
import {
  type ManufacturingIssueFormValues,
  manufacturingIssueFormSchema,
  manufacturingFailureMessage,
  toManufacturingIssueBody,
} from "../model/manufacturing-form.model";
import type { ManufacturingPieceTarget } from "../model/manufacturing-view.model";

import React, { useEffect, useRef, useId, useState } from "react";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";

function LegacyPieceReportProblemModal({
  order,
  piece,
  deptName,
  workerName,
  onClose,
}: {
  order: MvpOrder;
  piece: ProductLine;
  deptName: string;
  workerName: string;
  onClose: () => void;
}) {
  const store = useMvpStore();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reason.trim() || !notes.trim()) return;
    setSubmitting(true);
    store.reportPieceProblem(
      order.id,
      piece.id,
      reason.trim(),
      notes.trim(),
      deptName,
      workerName,
    );
    onClose();
  };

  return (
    <div className="oriental-modal-backdrop" onClick={onClose}>
      <div
        className="oriental-modal-container max-w-md"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-rose-50 p-2 text-rose-700">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                تسجيل مشكلة تصنيع على القطعة
              </h3>
              <p className="text-xs text-slate-500">
                {order.id} · {piece.pieceNumber || "القطعة"} · موديل{" "}
                {piece.model} (مقاس {piece.size})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 p-4 text-xs">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
            <AlertCircle size={14} className="ml-1 inline text-amber-700" />
            عند إرسال المشكلة، سيتم تحويل هذه القطعة إلى{" "}
            <strong>قسم الاعتماد</strong> مع استمرار باقي قطع الطلب في خط
            الإنتاج دون توقف.
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-reason`}
              className="mb-1 block font-bold text-slate-700"
            >
              سبب المشكلة المصنعية <span className="text-rose-600">*</span>:
            </label>
            <input
              id={`${fieldId}-reason`}
              type="text"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder="اكتب سبب المشكلة المصنعية (مثال: عيب بالجلد، خطأ بالمقاس، تلف بالقالب...)"
              required
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-rose-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-notes`}
              className="mb-1 block font-bold text-slate-700"
            >
              تفاصيل المشكلة والمقترح الفني{" "}
              <span className="text-rose-600">*</span>:
            </label>
            <textarea
              id={`${fieldId}-notes`}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              placeholder="اكتب تفاصيل المشكلة وشرحاً دقيقاً مع المقترح الفني للحل ليتمكن قسم الاعتماد من اتخاذ القرار المناسب..."
              rows={3}
              required
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-rose-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor={`${fieldId}-worker`}
                className="font-bold text-slate-700"
              >
                الفني / الموظف القائم بالإبلاغ:
              </label>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                حسابك الحالي (غير قابل للتعديل)
              </span>
            </div>
            <input
              id={`${fieldId}-worker`}
              type="text"
              value={workerName}
              readOnly
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs font-semibold text-slate-700 opacity-90 select-none"
            />
          </div>

          <div className="oriental-modal-footer pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-pill btn-secondary text-xs"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim() || !notes.trim()}
              className="btn-pill bg-rose-700 px-4 text-xs text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              إرسال المشكلة للاعتماد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type PersistedReportProps = {
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  source: "persisted";
  department: ManufacturingDepartment;
  data: ManufacturingOrderData;
  target: ManufacturingPieceTarget;
  onClose: () => void;
};
export function PieceReportProblemModal(
  props:
    | Parameters<typeof LegacyPieceReportProblemModal>[0]
    | PersistedReportProps
    | QualityReportProps,
) {
  if ("source" in props && props.source === "quality")
    return <QualityPieceReportProblemModal {...props} />;
  return "source" in props ? (
    <PersistedPieceReportProblemModal
      {...props}
      key={`${props.department}/${props.target.orderId}/${props.target.pieceId}`}
    />
  ) : (
    <LegacyPieceReportProblemModal {...props} />
  );
}
function PersistedPieceReportProblemModal({
  returnFocusRef,
  department,
  data,
  target,
  onClose,
}: PersistedReportProps) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const session = useSession();
  const command = useManufacturingCommand(department),
    query = useManufacturingOrder(department, target.orderId);
  const [base, setBase] = useState(target),
    [failure, setFailure] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(false);
  const form = useZodForm(manufacturingIssueFormSchema, {
      defaultValues: { reason: "", notes: "" },
    }),
    fieldId = useId();
  const current = query.data,
    work = current?.work.find((context) => context.pieceId === base.pieceId);
  const stale =
    query.isError ||
    !current ||
    current.paper.order.version !== base.expectedVersion ||
    !work?.allowedActions.canReportIssue;
  const busy = command.state.phase !== "idle";
  const review = async () => {
    try {
      const response = await query.refetch({ throwOnError: true });
      const fresh = response.data;
      if (
        !fresh ||
        !fresh.work.some(
          (context) =>
            context.pieceId === base.pieceId &&
            context.allowedActions.canReportIssue,
        )
      ) {
        setFailure("القطعة لم تعد مؤهلة للإبلاغ. راجع حالة الطلب.");
        return;
      }
      setBase({ ...base, expectedVersion: fresh.paper.order.version });
      setReviewed(true);
      setFailure(null);
    } catch (error: unknown) {
      setFailure(manufacturingFailureMessage(error, "مراجعة القطعة"));
    }
  };
  const submit = async (values: ManufacturingIssueFormValues) => {
    if (stale || busy) return;
    try {
      await command.submit({
        kind: "report",
        department,
        orderId: base.orderId,
        pieceId: base.pieceId,
        body: toManufacturingIssueBody(values, {
          commandId: crypto.randomUUID(),
          expectedVersion: base.expectedVersion,
        }),
      });
      if (mounted.current) {
        command.acknowledge();
        onClose();
      }
    } catch (error: unknown) {
      applyApiFormError(error, form);
      for (const field of ["reason", "notes"] as const)
        if (form.getFieldState(field).error)
          form.setError(field, {
            type: "server",
            message: manufacturingFailureMessage(error, "تسجيل المشكلة", field),
          });
      setFailure(manufacturingFailureMessage(error, "تسجيل المشكلة"));
      setReviewed(false);
    }
  };
  return (
    <BaseDialog
      {...(returnFocusRef ? { returnFocusRef } : {})}
      open
      onClose={onClose}
      title="تسجيل مشكلة تصنيع على القطعة"
      subtitle={`${data.paper.order.businessNumber} · القطعة ${target.pieceId}`}
    >
      <p>
        الموظف القائم بالإبلاغ:{" "}
        {session.data?.user.fullName ?? "جارٍ التحقق من الحساب"}
      </p>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="space-y-4"
      >
        <label htmlFor={`${fieldId}-reason`}>سبب المشكلة (مطلوب)</label>
        <textarea
          id={`${fieldId}-reason`}
          {...form.register("reason")}
          aria-invalid={Boolean(form.formState.errors.reason)}
          aria-describedby={
            form.formState.errors.reason ? `${fieldId}-reason-error` : undefined
          }
        />
        {form.formState.errors.reason && (
          <p id={`${fieldId}-reason-error`} role="alert">
            {manufacturingFailureMessage(
              form.formState.errors.reason,
              "تسجيل المشكلة",
              "reason",
            )}
          </p>
        )}
        <label htmlFor={`${fieldId}-notes`}>ملاحظات إضافية (اختيارية)</label>
        <textarea
          id={`${fieldId}-notes`}
          {...form.register("notes")}
          aria-invalid={Boolean(form.formState.errors.notes)}
          aria-describedby={
            form.formState.errors.notes ? `${fieldId}-notes-error` : undefined
          }
        />
        {form.formState.errors.notes && (
          <p id={`${fieldId}-notes-error`} role="alert">
            {manufacturingFailureMessage(
              form.formState.errors.notes,
              "تسجيل المشكلة",
              "notes",
            )}
          </p>
        )}
        {(stale || (!reviewed && failure)) && (
          <div role="alert">
            تغيرت البيانات أو تعذر حفظ المشكلة. تبقى كتابتك محفوظة هنا. حدّث
            وراجع نفس القطعة قبل التأكيد.
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void review();
              }}
            >
              تحديث ومراجعة القطعة
            </button>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
        <button
          type="submit"
          className="btn-pill btn-teal"
          disabled={
            stale ||
            busy ||
            form.formState.isSubmitting ||
            (!reviewed && failure !== null)
          }
        >
          تسجيل المشكلة
        </button>
        {busy && (
          <p role="status">
            تابع نتيجة الإجراء من مساحة العمل؛ الإغلاق لا يلغي الإرسال.
          </p>
        )}
      </form>
    </BaseDialog>
  );
}

type QualityReportProps = Readonly<{
  source: "quality";
  readAvailability: QualityReadAvailability;
  readFailure: string | null;
  onReadRetry: () => Promise<void>;
  rows: readonly QualityWorkRow[];
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}>;
function QualityPieceReportProblemModal(props: QualityReportProps) {
  const client = useQueryClient(),
    currentScope = useQualityOperationalScope(),
    [originScope] = useState(() => readQualityOperationalScope(client)),
    command = useQualityCommand(),
    session = useSession({ enabled: false }),
    mounted = useRef(false),
    guard = useRef(false),
    readRetry = useRef(false),
    [base, setBase] = useState(() => freezeQualityRows(props.rows)),
    [failure, setFailure] = useState<string | null>(null),
    [readRetryFailure, setReadRetryFailure] = useState<{
      readFailure: string | null;
      message: string;
    } | null>(null),
    [writing, setWriting] = useState(false),
    [reviewRequired, setReviewRequired] = useState(false),
    form = useZodForm(qualityIssueFormSchema, {
      defaultValues: { reason: "", notes: "" },
    }),
    fieldId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy =
    writing || command.state.phase !== "idle" || form.formState.isSubmitting;
  const review = async () => {
    if (guard.current || busy) return;
    const scope = originScope;
    if (!scope || !isCurrentQualityOperationalScope(client, scope)) return;
    guard.current = true;
    try {
      const fresh: QualityWorkRow[] = [];
      const ids = [...new Set(base.map((row) => row.order.id))].toSorted();
      for (let offset = 0; offset < ids.length; offset += 10) {
        const details = await Promise.all(
          ids
            .slice(offset, offset + 10)
            .map((id) => fetchQualityOrder(client, scope, id)),
        );
        if (
          !mounted.current ||
          !isCurrentQualityOperationalScope(client, scope)
        )
          return;
        for (const detail of details) {
          const original = base.filter(
            (row) => row.order.id === detail.paper.order.id,
          );
          fresh.push(
            ...resolveQualityTargets(
              detail,
              original.map((row) => ({
                ...row.target,
                expectedVersion: detail.paper.order.version,
              })),
            ),
          );
        }
      }
      captureQualitySelection("REPORT_ISSUES", fresh);
      if (mounted.current && isCurrentQualityOperationalScope(client, scope)) {
        setBase(freezeQualityRows(fresh));
        setReviewRequired(false);
        setFailure(null);
      }
    } catch (error: unknown) {
      if (mounted.current && isCurrentQualityOperationalScope(client, scope))
        setFailure(
          qualityFailureMessage(error, "مراجعة جميع القطع", undefined, "read"),
        );
    } finally {
      guard.current = false;
    }
  };
  const submit = async (values: QualityIssueFormValues) => {
    if (
      guard.current ||
      busy ||
      reviewRequired ||
      props.readAvailability !== "ready"
    )
      return;
    const scope = originScope;
    if (!scope || !isCurrentQualityOperationalScope(client, scope)) return;
    guard.current = true;
    setWriting(true);
    setFailure(null);
    try {
      const orders = captureQualitySelection("REPORT_ISSUES", base);
      await command.submit(
        toQualityIssueBody(values, { commandId: crypto.randomUUID(), orders }),
      );
      if (mounted.current && isCurrentQualityOperationalScope(client, scope)) {
        command.acknowledge();
        props.onClose();
      }
    } catch (error: unknown) {
      if (mounted.current && isCurrentQualityOperationalScope(client, scope)) {
        setFailure(applyQualityIssueFormErrors(error, form));
        setReviewRequired(true);
      }
    } finally {
      guard.current = false;
      if (mounted.current) setWriting(false);
    }
  };
  const retryRead = async () => {
    if (readRetry.current || props.readAvailability !== "error") return;
    readRetry.current = true;
    setReadRetryFailure(null);
    try {
      await props.onReadRetry();
    } catch (error: unknown) {
      if (mounted.current)
        setReadRetryFailure({
          readFailure: props.readFailure,
          message: qualityFailureMessage(
            error,
            "تحديث بيانات الجودة",
            undefined,
            "read",
          ),
        });
    } finally {
      readRetry.current = false;
    }
  };
  if (
    !currentScope ||
    !originScope ||
    !isCurrentQualityOperationalScope(client, originScope)
  )
    return null;
  return (
    <BaseDialog
      open
      onClose={props.onClose}
      title="تسجيل مشكلة تصنيع على القطع المحددة"
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
    >
      <p>
        الموظف القائم بالإبلاغ:{" "}
        {session.data?.user.fullName ?? "جارٍ التحقق من الحساب"}
      </p>
      <p>
        طلب إيقاف القطع المحددة لدى الاعتماد؛ ليس قرار رفض أو تصحيح. لن تتغير
        القطع الأخرى.
      </p>
      <ul>
        {base.map((row) => (
          <li key={row.key}>
            {row.order.businessNumber} · القطعة {row.piece.position} ·{" "}
            {row.piece.id}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          if (props.readAvailability !== "ready") {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        className="space-y-4"
      >
        <fieldset disabled={busy}>
          <label htmlFor={`${fieldId}-reason`}>سبب المشكلة (مطلوب)</label>
          <textarea
            id={`${fieldId}-reason`}
            className="oriental-textarea w-full"
            {...form.register("reason")}
            aria-describedby={`${fieldId}-reason-error`}
            aria-invalid={form.formState.errors.reason !== undefined}
          />
          {form.formState.errors.reason && (
            <p id={`${fieldId}-reason-error`} role="alert">
              {form.formState.errors.reason.message}
            </p>
          )}
          <label htmlFor={`${fieldId}-notes`}>ملاحظات إضافية (اختيارية)</label>
          <textarea
            id={`${fieldId}-notes`}
            className="oriental-textarea w-full"
            {...form.register("notes")}
            aria-describedby={`${fieldId}-notes-error`}
            aria-invalid={form.formState.errors.notes !== undefined}
          />
          {form.formState.errors.notes && (
            <p id={`${fieldId}-notes-error`} role="alert">
              {form.formState.errors.notes.message}
            </p>
          )}
        </fieldset>

        {props.readAvailability === "refreshing" && (
          <p role="status">
            جارٍ تحديث بيانات الجودة؛ انتظر اكتمال التحديث قبل التأكيد.
          </p>
        )}
        {props.readAvailability === "error" && (
          <div role="alert">
            {readRetryFailure !== null &&
            readRetryFailure.readFailure === props.readFailure
              ? readRetryFailure.message
              : (props.readFailure ??
                "تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد.")}
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={(event) => {
                event.currentTarget
                  .closest<HTMLElement>('[role="dialog"]')
                  ?.focus();
                void retryRead();
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
        {reviewRequired && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void review();
            }}
          >
            تحديث ومراجعة جميع القطع
          </button>
        )}
        <button
          className="btn-pill btn-teal"
          type="submit"
          disabled={
            busy || reviewRequired || props.readAvailability !== "ready"
          }
        >
          تسجيل المشكلة
        </button>
        {busy && (
          <p role="status">
            تابع نتيجة الإجراء من مساحة العمل؛ الإغلاق لا يلغي الإرسال.
          </p>
        )}
      </form>
    </BaseDialog>
  );
}
