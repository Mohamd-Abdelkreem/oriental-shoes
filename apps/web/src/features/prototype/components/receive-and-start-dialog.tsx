"use client";
import type { ManufacturingWorkRow } from "@/features/manufacturing/model/manufacturing-view.model";
import type {
  ManufacturingCommandOperation,
  ManufacturingDepartment,
} from "@template/contracts";

import { useState, useRef, useEffect, type RefObject } from "react";
import { useSession } from "@/features/auth/hooks/auth.hooks";
import type {
  QualityWorkRow,
  QualityReadAvailability,
} from "@/features/manufacturing/model/quality-view.model";
import { qualityFailureMessage } from "@/features/manufacturing/model/quality-form.model";
import { WorkSelectionSummary } from "@/features/manufacturing/components/work-selection-summary";
import { BaseDialog } from "./base-dialog";

function LegacyReceiveAndStartDialog({
  open,
  onClose,
  orderId,
  quantity,
  deptName,
  department,
  actionLabel,
  actionTitle,
  assignedWorker,
  defaultWorker,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  quantity: number;
  deptName?: string | undefined;
  department?: string | undefined;
  actionLabel?: string | undefined;
  actionTitle?: string | undefined;
  assignedWorker?: string | undefined;
  defaultWorker?: string | undefined;
  onConfirm: (worker: string) => void;
}) {
  const finalDept = deptName || department || "القسم";
  const finalAction = actionLabel || actionTitle || "استلام وبدء العمل";
  const finalWorker = assignedWorker || defaultWorker || "الموظف المسؤول";

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={finalAction}
      subtitle={`أمر التفصيل: ${orderId} · الكمية: ${String(quantity)} قطعة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-teal"
            onClick={() => {
              onConfirm(finalWorker);
              onClose();
            }}
          >
            {finalAction} الآن
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
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          تأكيد استلام كمية <strong>{quantity} قطعة</strong> وبدء تشغيلها فوراً
          في <strong>{finalDept}</strong>.
        </p>
        <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
          <div>
            ✓ سيتم تسجيل استلام الكمية وبدء العمل مباشرة على خط التشغيل.
          </div>
          <div>
            ✓ الموظف المنفذ: <strong>{finalWorker}</strong> (سيصبح العامل المعين
            لهذا الجزء).
          </div>
          <div>
            ✓ ستتحول حالة الكمية فوراً إلى: <strong>قيد التنفيذ</strong> في قسم{" "}
            {finalDept}.
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}

export type PersistedManufacturingDialogProps = Readonly<{
  returnFocusRef?: RefObject<HTMLElement | null>;
  source: "persisted";
  open: boolean;
  onClose: () => void;
  rows: readonly ManufacturingWorkRow[];
  department: ManufacturingDepartment;
  operation: ManufacturingCommandOperation;
  pending: boolean;
  failure: string | null;
  reviewRequired: boolean;
  onReview: () => Promise<void>;
  onConfirm: () => Promise<void>;
}>;
export function ReceiveAndStartDialog(
  props:
    | Parameters<typeof LegacyReceiveAndStartDialog>[0]
    | PersistedManufacturingDialogProps
    | QualityReceiveDialogProps,
) {
  if ("source" in props && props.source === "quality")
    return <QualityReceiveAndStartDialog {...props} />;
  return "source" in props ? (
    <PersistedReceiveAndStartDialog {...props} />
  ) : (
    <LegacyReceiveAndStartDialog {...props} />
  );
}
export function PersistedReceiveAndStartDialog(
  props: PersistedManufacturingDialogProps,
) {
  const [sending, setSending] = useState(false);
  const title =
    props.operation === "COMPLETE_TRANSFER"
      ? "إتمام وتحويل العمل"
      : props.operation === "CONTINUE"
        ? "متابعة العمل"
        : "استلام وبدء العمل";
  const confirm = async () => {
    if (sending || props.pending || props.reviewRequired) return;
    setSending(true);
    try {
      await props.onConfirm();
    } finally {
      setSending(false);
    }
  };
  return (
    <BaseDialog
      open={props.open}
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
      onClose={props.onClose}
      title={title}
      subtitle={`القسم: ${props.department === "CUTTING" ? "القص" : "الإنتاج والإصلاح"} · المحدد: ${String(props.rows.length)} قطعة`}
      actions={
        <>
          <button
            className="btn-pill btn-teal"
            disabled={sending || props.pending || props.reviewRequired}
            onClick={() => {
              void confirm();
            }}
          >
            تأكيد {title}
          </button>
          <button className="btn-pill btn-outline" onClick={props.onClose}>
            إغلاق
          </button>
        </>
      }
    >
      <WorkSelectionSummary rows={props.rows} />
      {props.operation === "COMPLETE_TRANSFER" && (
        <p>
          الوجهة الثابتة:{" "}
          {props.department === "CUTTING"
            ? "الإنتاج والإصلاح"
            : "الجودة والتغليف"}{" "}
          · سيتم إتمام وتحويل جميع القطع المحددة معاً.
        </p>
      )}
      {(sending || props.pending) && (
        <p role="status">
          جارٍ إرسال الإجراء؛ الإغلاق لا يلغي العملية. تابع النتيجة من مساحة
          العمل.
        </p>
      )}
      {props.failure && <p role="alert">{props.failure}</p>}
      {props.reviewRequired && (
        <button
          onClick={() => {
            void props.onReview();
          }}
        >
          تحديث ومراجعة القطع المحددة
        </button>
      )}
    </BaseDialog>
  );
}

export type QualityReceiveDialogProps = Omit<
  PersistedManufacturingDialogProps,
  "source" | "rows" | "department" | "operation"
> & {
  source: "quality";
  readAvailability: QualityReadAvailability;
  readFailure: string | null;
  onReadRetry: () => Promise<void>;
  rows: readonly QualityWorkRow[];
  operation: "RECEIVE_AND_START" | "CONTINUE";
};
function QualityReceiveAndStartDialog(props: QualityReceiveDialogProps) {
  const [sending, setSending] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [localFailure, setLocalFailure] = useState<string | null>(null),
    [readRetryFailure, setReadRetryFailure] = useState<{
      readFailure: string | null;
      message: string;
    } | null>(null),
    guard = useRef(false),
    readRetry = useRef(false),
    mounted = useRef(false),
    session = useSession({ enabled: false });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const title =
    props.operation === "CONTINUE" ? "متابعة الفحص" : "استلام وبدء الفحص";
  const confirm = async () => {
    if (
      guard.current ||
      props.pending ||
      props.reviewRequired ||
      props.readAvailability !== "ready"
    )
      return;
    guard.current = true;
    setSending(true);
    setLocalFailure(null);
    try {
      await props.onConfirm();
    } catch (error: unknown) {
      if (mounted.current) setLocalFailure(qualityFailureMessage(error, title));
    } finally {
      guard.current = false;
      if (mounted.current) setSending(false);
    }
  };
  const review = async () => {
    if (guard.current || props.pending) return;
    guard.current = true;
    setReviewing(true);
    setLocalFailure(null);
    try {
      await props.onReview();
    } catch (error: unknown) {
      if (mounted.current)
        setLocalFailure(
          qualityFailureMessage(error, "مراجعة القطع", undefined, "read"),
        );
    } finally {
      guard.current = false;
      if (mounted.current) setReviewing(false);
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
  return (
    <BaseDialog
      open={props.open}
      {...(props.returnFocusRef
        ? { returnFocusRef: props.returnFocusRef }
        : {})}
      onClose={props.onClose}
      title={title}
      subtitle={`القسم: الجودة · المحدد: ${String(props.rows.length)} قطعة`}
      actions={
        <>
          <button
            className="btn-pill btn-teal"
            disabled={
              sending ||
              reviewing ||
              props.pending ||
              props.reviewRequired ||
              props.readAvailability !== "ready"
            }
            onClick={() => {
              void confirm();
            }}
          >
            تأكيد {title}
          </button>
          <button className="btn-pill btn-outline" onClick={props.onClose}>
            إغلاق
          </button>
        </>
      }
    >
      <WorkSelectionSummary
        rows={props.rows}
        details={
          props.operation === "CONTINUE"
            ? (row) => (
                <p className="text-slate-600">
                  بدأ الفحص:{" "}
                  {row.work.visit?.startedBy?.fullName ??
                    "بداية سابقة غير مسجلة"}
                </p>
              )
            : undefined
        }
      />
      <p className="mt-3 text-xs text-slate-600">
        المنفذ الحالي:{" "}
        <strong>{session.data?.user.fullName ?? "غير متاح"}</strong>
      </p>

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
      {localFailure && <p role="alert">{localFailure}</p>}
      {(sending || props.pending) && (
        <p role="status">
          جارٍ إرسال الإجراء؛ الإغلاق لا يلغي العملية. تابع النتيجة من مساحة
          العمل.
        </p>
      )}
      {props.failure && <p role="alert">{props.failure}</p>}
      {reviewing && <p role="status">جارٍ تحديث جميع القطع…</p>}
      {props.reviewRequired && (
        <button
          disabled={reviewing || sending || props.pending}
          onClick={() => {
            void review();
          }}
        >
          تحديث ومراجعة القطع المحددة
        </button>
      )}
    </BaseDialog>
  );
}
