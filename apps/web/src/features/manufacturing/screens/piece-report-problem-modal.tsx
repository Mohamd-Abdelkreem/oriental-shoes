"use client";

import React, { useId, useState } from "react";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";

export function PieceReportProblemModal({
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
