"use client";

import React, { useState } from "react";
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
  const [reason, setReason] = useState("عيب في خامة الجلد");
  const [notes, setNotes] = useState("");
  const [worker, setWorker] = useState(workerName);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!notes.trim()) return;
    setSubmitting(true);
    store.reportPieceProblem(
      order.id,
      piece.id,
      reason,
      notes.trim(),
      deptName,
      worker || workerName,
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
            <label className="mb-1 block font-bold text-slate-700">
              سبب المشكلة المصنعية:
            </label>
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
            >
              <option value="عيب في خامة الجلد">
                عيب في خامة الجلد أو تشقق بالصبغ
              </option>
              <option value="خطأ في مقاس القص">
                خطأ في مقاس القص أو تفصيل البطانة
              </option>
              <option value="عدم توفر خامة التطعيم">
                عدم توفر خامة التطعيم المطلوبة بالمستودع
              </option>
              <option value="تلف أثناء الشد والتجميع">
                تلف أثناء مرحلة الشد أو كسر في القالب
              </option>
              <option value="خلل في النعل">
                خلل في النعل أو عدم ثبات اللصق
              </option>
              <option value="ملاحظة فنية خاصة بالعميل">
                ملاحظة فنية خاصة بالعميل غير واضحة للقسم
              </option>
              <option value="أخرى">أخرى (توضح في الملاحظات)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-bold text-slate-700">
              تفاصيل المشكلة والمقترح الفني *:
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              placeholder="اكتب شرحاً دقيقاً للمشكلة ليتمكن قسم الاعتماد من اتخاذ القرار المناسب..."
              rows={3}
              required
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block font-bold text-slate-700">
              الفني / الموظف القائم بالإبلاغ:
            </label>
            <input
              type="text"
              value={worker}
              onChange={(e) => {
                setWorker(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
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
              disabled={submitting || !notes.trim()}
              className="btn-pill bg-rose-700 px-4 text-xs text-white hover:bg-rose-800"
            >
              إرسال المشكلة للاعتماد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
