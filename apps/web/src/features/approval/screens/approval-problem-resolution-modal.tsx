"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import {
  useMvpStore,
  type PieceLocation,
  type ProductLine,
  type MvpOrder,
} from "@/features/prototype/state/mvp-store";

export function ApprovalProblemResolutionModal({
  order,
  piece,
  onClose,
}: {
  order: MvpOrder;
  piece: ProductLine;
  onClose: () => void;
}) {
  const store = useMvpStore();
  const [decision, setDecision] = useState<
    "return_to_dept" | "send_to_sales" | "delete"
  >("return_to_dept");
  const [targetDept, setTargetDept] = useState<PieceLocation>(
    piece.problem?.reportedByDept === "القص" ? "في القص" : "في الإنتاج",
  );
  const [notes, setNotes] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleSubmit = () => {
    if (decision === "delete" && !deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    store.resolveApprovalProblem(
      order.id,
      piece.id,
      decision,
      notes ||
        (decision === "return_to_dept"
          ? "تم حل المشكلة وتوجيه القطعة للمتابعة"
          : decision === "send_to_sales"
            ? "إحالة للمبيعات للتواصل مع العميل"
            : "حذف القطعة نهائياً"),
      decision === "return_to_dept" ? targetDept : undefined,
      "خالد منصور",
    );
    onClose();
  };

  const otherPieces = order.items.filter(
    (p) => p.id !== piece.id && !p.isDeleted,
  );

  return (
    <div className="oriental-modal-backdrop" onClick={onClose}>
      <div
        className="oriental-modal-container max-w-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <div className="flex items-center gap-2">
            <h2 className="oriental-modal-title">قرار معالجة مشكلة التصنيع</h2>
            <Link
              href={`/approval/orders/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 font-mono text-xs font-bold text-rose-800 transition-colors hover:bg-rose-200"
              title="فتح صفحة وتفاصيل أمر التفصيل في قسم الاعتماد"
            >
              <span>
                {order.id} · {piece.pieceNumber || "القطعة"}
              </span>
              <ExternalLink size={11} className="opacity-70" />
            </Link>
          </div>
          <button
            type="button"
            className="oriental-modal-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs">
          {/* Issue summary */}
          <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="flex items-center justify-between">
              <strong className="block font-bold text-rose-900">
                المشكلة المسجلة من قِبل{" "}
                {piece.problem?.reportedByDept || "المصنع"} (
                {piece.problem?.reportedByWorker || "العامل"}):
              </strong>
              <span className="font-mono text-[10px] text-rose-600">
                {piece.problem?.reportedAt}
              </span>
            </div>
            <p className="font-semibold text-rose-800">
              {piece.problem?.reason}
            </p>
            <p className="text-slate-700">{piece.problem?.notes}</p>
          </div>

          {/* Context of this order */}
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                العميل: <b>{order.customer}</b> (
                <span dir="ltr">{order.phone}</span>)
              </span>
              <div className="flex items-center gap-3">
                <span>
                  المواصفات:{" "}
                  <b>
                    {piece.model} · {piece.leatherBase} · مقاس {piece.size}
                  </b>
                </span>
                <Link
                  href={`/approval/orders/${order.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 hover:underline"
                  title="عرض تفاصيل أمر التفصيل وتتبع القطع في قسم الاعتماد"
                >
                  <FileText size={12} />
                  <span>عرض أمر التفصيل</span>
                  <ExternalLink size={11} />
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-200 pt-1.5 text-slate-600">
              <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
              <span>
                حالة بقية قطع الطلب:{" "}
                <b>
                  {otherPieces
                    .map(
                      (p) =>
                        `${p.pieceNumber || "قطعة"}: ${p.currentLocation || "في المصنع"}`,
                    )
                    .join(" · ")}
                </b>{" "}
                (مستمرة في مسارها دون تعطيل)
              </span>
            </div>
          </div>

          {/* 3 Decision Options */}
          <div className="space-y-2 pt-1">
            <span className="block text-sm font-bold text-slate-800">
              اختر قرار الاعتماد:
            </span>

            {/* Option A */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                decision === "return_to_dept"
                  ? "border-teal-500 bg-teal-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="decision"
                checked={decision === "return_to_dept"}
                onChange={() => {
                  setDecision("return_to_dept");
                  setDeleteConfirm(false);
                }}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <strong className="block font-bold text-teal-900">
                  الخيار (أ): حل المشكلة وإعادة القطعة إلى القسم لمتابعة العمل
                </strong>
                <p className="text-[11px] text-slate-600">
                  تُعاد القطعة إلى خط الإنتاج فوراً (تم توفير خامة بديلة أو
                  تصحيح العيب الفني).
                </p>
                {decision === "return_to_dept" && (
                  <div className="flex items-center gap-2 pt-2">
                    <span className="font-semibold text-slate-700">
                      توجيه إلى قسم:
                    </span>
                    <select
                      value={targetDept}
                      onChange={(e) => {
                        setTargetDept(e.target.value as PieceLocation);
                      }}
                      className="oriental-input py-1 text-xs"
                    >
                      <option value="في القص">قسم القص</option>
                      <option value="في العمليات الخاصة">
                        العمليات الخاصة
                      </option>
                      <option value="في الإنتاج">الإنتاج والإصلاح</option>
                    </select>
                  </div>
                )}
              </div>
            </label>

            {/* Option B */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                decision === "send_to_sales"
                  ? "border-amber-500 bg-amber-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="decision"
                checked={decision === "send_to_sales"}
                onChange={() => {
                  setDecision("send_to_sales");
                  setDeleteConfirm(false);
                }}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <strong className="block font-bold text-amber-900">
                  الخيار (ب): إرسال القطعة إلى المبيعات للتواصل مع العميل
                </strong>
                <p className="text-[11px] text-slate-600">
                  تُحال القطعة لقائمة &quot;طلبات تحتاج تواصلًا مع العميل&quot;
                  لدى المبيعات لاختيار لون أو جلد بديل.
                </p>
              </div>
            </label>

            {/* Option C */}
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                decision === "delete"
                  ? "border-rose-500 bg-rose-50/70 shadow-sm"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="decision"
                checked={decision === "delete"}
                onChange={() => {
                  setDecision("delete");
                }}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <strong className="block font-bold text-rose-900">
                  الخيار (ج): حذف / إلغاء القطعة نهائياً من أمر التفصيل
                </strong>
                <p className="text-[11px] text-slate-600">
                  شطب هذه القطعة فقط دون المساس ببقية قطع الطلب، مع إعادة احتساب
                  القطع والمبالغ تلقائياً.
                </p>
              </div>
            </label>
          </div>

          {/* Warning banner for Option C */}
          {decision === "delete" && (
            <div className="space-y-1.5 rounded-lg border border-rose-300 bg-rose-100/70 p-3 text-rose-900">
              <strong className="block flex items-center gap-1.5 font-bold text-rose-800">
                <AlertTriangle size={15} />
                <span>
                  تحذير: سيتم حذف {piece.pieceNumber || "هذه القطعة"} نهائياً من
                  الطلب
                </span>
              </strong>
              <p className="text-[11px]">
                سيتم إعادة احتساب عدد قطع الطلب فوراً ليصبح {otherPieces.length}{" "}
                قطع بدلاً من {order.items.filter((p) => !p.isDeleted).length}،
                وتحديث إجمالي المبلغ المالي والمتبقي، وتستمر القطع الأخرى في
                مسارها الطبيعي.
              </p>
            </div>
          )}

          {/* Notes input */}
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-700">
              {decision === "return_to_dept"
                ? "ملاحظات وتوجيه حل المشكلة للقسم *:"
                : decision === "send_to_sales"
                  ? "تعليمات المبيعات للتواصل مع العميل *:"
                  : "سبب إلغاء وشطب القطعة *:"}
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              placeholder={
                decision === "return_to_dept"
                  ? "مثال: تم توفير جلد عسلي مطابق من مخزن الجلد، استئناف القص..."
                  : decision === "send_to_sales"
                    ? "مثال: يرجى التواصل مع العميل لاختيار بديل لجلد النعام الجملي لعدم توفره..."
                    : "مثال: عدم توفر الخامة وتفضيل إلغاء القطعة بناءً على التقييم الإداري..."
              }
              className="oriental-textarea w-full text-xs"
            />
          </label>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-pill btn-outline text-xs"
                onClick={onClose}
              >
                إلغاء
              </button>
              <Link
                href={`/approval/orders/${order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pill btn-secondary flex items-center gap-1.5 text-xs"
                title="فتح صفحة وتفاصيل أمر التفصيل في قسم الاعتماد"
              >
                <FileText size={13} className="text-teal-700" />
                <span>صفحة أمر التفصيل</span>
                <ExternalLink size={11} className="text-slate-400" />
              </Link>
            </div>
            <button
              type="button"
              className={`btn-pill px-4 text-xs font-bold ${
                decision === "delete" ? "btn-rose" : "btn-teal"
              }`}
              onClick={handleSubmit}
            >
              {decision === "delete"
                ? "تأكيد حذف القطعة نهائياً"
                : "تنفيذ قرار الاعتماد"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
