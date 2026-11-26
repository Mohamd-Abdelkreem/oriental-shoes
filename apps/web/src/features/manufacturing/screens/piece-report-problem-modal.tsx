"use client";
import { toLegacyOrderReference } from "@/features/orders/model/order-display-reference";
import { useToast } from "@/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  readQualityOperationalScope,
  useQualityOperationalScope,
  isCurrentQualityOperationalScope,
} from "@/shared/query/operational-scope";
import { useQualityCommand } from "../hooks/quality-commands.hooks";
import { fetchQualityOrder } from "../hooks/quality.hooks";
import { captureQualitySelection } from "../model/quality-selection.model";
import { qualityActionSuccessMessage } from "../model/manufacturing-action-success";
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
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import { useZodForm, applyApiFormError } from "@/shared/forms/form";
import type { UseFormRegisterReturn } from "react-hook-form";
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
                {toLegacyOrderReference(order.id) ?? "أمر التفصيل"} ·{" "}
                {piece.pieceNumber || "القطعة"} · موديل {piece.model} (مقاس{" "}
                {piece.size})
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
/** Displays the authenticated reporter name inside problem report dialogs. */
function ReportReporterBanner({ reporterName }: { reporterName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-2.5 text-xs">
      <span className="font-medium text-slate-600">
        الموظف القائم بالإبلاغ:
      </span>
      <strong className="font-bold text-slate-900">{reporterName}</strong>
    </div>
  );
}

/** Shared labeled textarea field with inline validation feedback for report forms. */
function ReportTextareaField({
  id,
  label,
  placeholder,
  rows = 3,
  registration,
  invalid,
  errorId,
  describedBy,
  errorMessage,
}: {
  id: string;
  label: string;
  placeholder: string;
  rows?: number;
  registration: UseFormRegisterReturn;
  invalid: boolean;
  errorId: string;
  describedBy: string | undefined;
  errorMessage: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-slate-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        className="oriental-textarea w-full text-xs leading-relaxed placeholder:text-slate-400 aria-invalid:border-rose-400 aria-invalid:focus:border-rose-500 aria-invalid:focus:shadow-[0_0_0_2px_rgba(244,63,94,0.15)]"
        {...registration}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-rose-700"
        >
          {errorMessage}
        </p>
      )}
    </div>
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
  const { toast } = useToast();
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
  const piece = data.paper.order.pieces.find(
    (candidate) => candidate.id === target.pieceId,
  );
  const pieceSubtitle = piece
    ? `${formatPieceSequence(piece.position - 1)}${piece.model ? ` · ${piece.model}` : ""}${piece.size ? ` (مقاس ${piece.size})` : ""}`
    : "القطعة المحددة";
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
        const shouldNotify = command.acknowledge();
        onClose();
        if (shouldNotify)
          toast.success("تم تسجيل المشكلة وإحالة القطعة للاعتماد");
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
  const formId = `${fieldId}-form`;
  return (
    <BaseDialog
      {...(returnFocusRef ? { returnFocusRef } : {})}
      open
      onClose={onClose}
      title="تسجيل مشكلة تصنيع على القطعة"
      subtitle={`${data.paper.order.businessNumber} · ${pieceSubtitle}`}
      actions={
        <>
          <button
            type="submit"
            form={formId}
            className="btn-pill btn-rose disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              stale ||
              busy ||
              form.formState.isSubmitting ||
              (!reviewed && failure !== null)
            }
          >
            تسجيل المشكلة
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            إلغاء
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ReportReporterBanner
          reporterName={session.data?.user.fullName ?? "جارٍ التحقق من الحساب"}
        />
        <form
          id={formId}
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event);
          }}
          noValidate
          className="space-y-4"
        >
          <ReportTextareaField
            id={`${fieldId}-reason`}
            label="سبب المشكلة (مطلوب)"
            placeholder="اكتب سبب المشكلة المصنعية بوضوح (مثال: عيب بالجلد، خطأ بالمقاس، تلف بالقالب...)"
            registration={form.register("reason")}
            invalid={Boolean(form.formState.errors.reason)}
            errorId={`${fieldId}-reason-error`}
            describedBy={
              form.formState.errors.reason
                ? `${fieldId}-reason-error`
                : undefined
            }
            errorMessage={
              form.formState.errors.reason
                ? manufacturingFailureMessage(
                    form.formState.errors.reason,
                    "تسجيل المشكلة",
                    "reason",
                  )
                : undefined
            }
          />
          <ReportTextareaField
            id={`${fieldId}-notes`}
            label="ملاحظات إضافية (اختيارية)"
            placeholder="أضف أي تفاصيل إضافية أو مقترح فني يساعد فريق الاعتماد..."
            registration={form.register("notes")}
            invalid={Boolean(form.formState.errors.notes)}
            errorId={`${fieldId}-notes-error`}
            describedBy={
              form.formState.errors.notes ? `${fieldId}-notes-error` : undefined
            }
            errorMessage={
              form.formState.errors.notes
                ? manufacturingFailureMessage(
                    form.formState.errors.notes,
                    "تسجيل المشكلة",
                    "notes",
                  )
                : undefined
            }
          />
          {(stale || (!reviewed && failure)) && (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs leading-relaxed text-amber-900"
            >
              <p>
                تغيرت البيانات أو تعذر حفظ المشكلة. تبقى كتابتك محفوظة هنا. حدّث
                وراجع نفس القطعة قبل التأكيد.
              </p>
              <button
                type="button"
                className="btn-pill btn-secondary px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  void review();
                }}
              >
                تحديث ومراجعة القطعة
              </button>
            </div>
          )}
          {failure && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
            >
              {failure}
            </p>
          )}
          {busy && (
            <p
              role="status"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              تابع نتيجة الإجراء من مساحة العمل؛ الإغلاق لا يلغي الإرسال.
            </p>
          )}
        </form>
      </div>
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
  const { toast } = useToast();
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
      const result = await command.submit(
        toQualityIssueBody(values, { commandId: crypto.randomUUID(), orders }),
      );
      if (mounted.current && isCurrentQualityOperationalScope(client, scope)) {
        const shouldNotify = command.acknowledge();
        props.onClose();
        if (shouldNotify) toast.success(qualityActionSuccessMessage(result));
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
  const formId = `${fieldId}-form`;
  return (
    <BaseDialog
      open
      onClose={props.onClose}
      title="تسجيل مشكلة تصنيع على القطع المحددة"
      subtitle={`المحدد: ${String(base.length)} قطعة`}
      actions={
        <>
          <button
            className="btn-pill btn-rose disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            form={formId}
            disabled={
              busy || reviewRequired || props.readAvailability !== "ready"
            }
          >
            تسجيل المشكلة
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={props.onClose}
          >
            إلغاء
          </button>
        </>
      }
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
    >
      <div className="space-y-4">
        <ReportReporterBanner
          reporterName={session.data?.user.fullName ?? "جارٍ التحقق من الحساب"}
        />
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
          طلب إيقاف القطع المحددة لدى الاعتماد؛ ليس قرار رفض أو تصحيح. لن تتغير
          القطع الأخرى.
        </p>
        <ul className="max-h-36 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {base.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <bdi className="font-mono font-bold text-slate-900">
                  {row.order.businessNumber}
                </bdi>
                <span className="rounded bg-rose-50 px-2 py-0.5 font-bold text-rose-800">
                  {formatPieceSequence(row.piece.position - 1)}
                </span>
                {row.piece.model && (
                  <span className="text-slate-600">{row.piece.model}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form
          id={formId}
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
          <fieldset disabled={busy} className="space-y-4">
            <ReportTextareaField
              id={`${fieldId}-reason`}
              label="سبب المشكلة (مطلوب)"
              placeholder="اكتب سبب المشكلة المصنعية بوضوح..."
              registration={form.register("reason")}
              invalid={form.formState.errors.reason !== undefined}
              errorId={`${fieldId}-reason-error`}
              describedBy={`${fieldId}-reason-error`}
              errorMessage={form.formState.errors.reason?.message}
            />
            <ReportTextareaField
              id={`${fieldId}-notes`}
              label="ملاحظات إضافية (اختيارية)"
              placeholder="أضف أي تفاصيل إضافية أو مقترح فني..."
              registration={form.register("notes")}
              invalid={form.formState.errors.notes !== undefined}
              errorId={`${fieldId}-notes-error`}
              describedBy={`${fieldId}-notes-error`}
              errorMessage={form.formState.errors.notes?.message}
            />
          </fieldset>

          {props.readAvailability === "refreshing" && (
            <p
              role="status"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              جارٍ تحديث بيانات الجودة؛ انتظر اكتمال التحديث قبل التأكيد.
            </p>
          )}
          {props.readAvailability === "error" && (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs leading-relaxed text-rose-800"
            >
              <p>
                {readRetryFailure !== null &&
                readRetryFailure.readFailure === props.readFailure
                  ? readRetryFailure.message
                  : (props.readFailure ??
                    "تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد.")}
              </p>
              <button
                type="button"
                className="btn-pill btn-outline px-3! py-1.5! text-xs!"
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
          {failure && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
            >
              {failure}
            </p>
          )}
          {reviewRequired && (
            <button
              type="button"
              className="btn-pill btn-outline px-3! py-1.5! text-xs! disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                void review();
              }}
            >
              تحديث ومراجعة جميع القطع
            </button>
          )}
          {busy && (
            <p
              role="status"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              تابع نتيجة الإجراء من مساحة العمل؛ الإغلاق لا يلغي الإرسال.
            </p>
          )}
        </form>
      </div>
    </BaseDialog>
  );
}
