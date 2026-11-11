"use client";
import type { ManufacturingWorkRow } from "@/features/manufacturing/model/manufacturing-view.model";
import type {
  ManufacturingCommandOperation,
  ManufacturingDepartment,
} from "@template/contracts";

import { useState, type RefObject } from "react";
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
    | PersistedManufacturingDialogProps,
) {
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
      <ul>
        {props.rows.map((row) => (
          <li key={row.key}>
            {row.order.businessNumber} · القطعة {row.piece.position} ·{" "}
            {row.piece.model ?? "—"} · {row.piece.id}
          </li>
        ))}
      </ul>
      <p>
        الكمية المحددة: <output>{props.rows.length}</output> قطعة
      </p>
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
