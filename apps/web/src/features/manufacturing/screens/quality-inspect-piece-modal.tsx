"use client";

import { useState } from "react";
import { CheckCircle2, PackageCheck, RotateCcw, X } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";

const responsibleDepartments = [
  "القص",
  "الإنتاج والإصلاح",
  "العمليات الخاصة",
] as const;

export function QualityInspectPieceModal({
  order,
  piece,
  onClose,
}: {
  order: MvpOrder;
  piece: ProductLine;
  onClose: () => void;
}) {
  const store = useMvpStore();
  const [decision, setDecision] = useState<"accept" | "reject">("accept");
  const [responsibleDept, setResponsibleDept] =
    useState<(typeof responsibleDepartments)[number]>("الإنتاج والإصلاح");
  const [reason, setReason] = useState("خلل في تقفيل الخياطة");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (decision === "accept") {
      store.qualityInspectPiece(order.id, piece.id, "accept");
    } else {
      store.qualityInspectPiece(order.id, piece.id, "reject", {
        responsibleDept,
        reason,
        notes: notes || "إعادة للقسم لتصحيح العيب المصنعي",
      });
    }
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
            <span className="rounded-lg bg-teal-50 p-2 text-teal-800">
              <PackageCheck size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                فحص جودة وتغليف القطعة
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

        <div className="space-y-3 p-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDecision("accept");
              }}
              className={`rounded-lg border p-3 text-center font-bold transition ${
                decision === "accept"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2
                size={20}
                className="mx-auto mb-1 text-emerald-600"
              />
              <span>إجازة وتغليف (مطابقة)</span>
              <span className="mt-0.5 block text-[10px] font-normal text-emerald-700">
                تحويل إلى المستودع والتسليم
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision("reject");
              }}
              className={`rounded-lg border p-3 text-center font-bold transition ${
                decision === "reject"
                  ? "border-rose-500 bg-rose-50 text-rose-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <RotateCcw size={20} className="mx-auto mb-1 text-rose-600" />
              <span>رفض وإعادة للتصحيح</span>
              <span className="mt-0.5 block text-[10px] font-normal text-rose-700">
                إعادة للقسم المسؤول لإصلاح العيب
              </span>
            </button>
          </div>

          {decision === "reject" && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  القسم المسؤول عن العيب:
                </label>
                <select
                  value={responsibleDept}
                  onChange={(e) => {
                    const selected = responsibleDepartments.find(
                      (dept) => dept === e.target.value,
                    );
                    if (selected) setResponsibleDept(selected);
                  }}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                >
                  <option value="القص">قسم القص والتفصيل</option>
                  <option value="الإنتاج والإصلاح">قسم الإنتاج والإصلاح</option>
                  <option value="العمليات الخاصة">قسم العمليات الخاصة</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  سبب الرفض:
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                  }}
                  placeholder="سبب الرفض والملاحظة الفنية"
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  ملاحظات وتعليمات الإصلاح:
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                  }}
                  placeholder="تعليمات فنية للقسم لإصلاح هذا العيب بالقطعة..."
                  rows={2}
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
                />
              </div>
            </div>
          )}

          <div className="oriental-modal-footer pt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-pill btn-secondary text-xs"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`btn-pill px-4 text-xs text-white ${
                decision === "accept"
                  ? "bg-emerald-700 hover:bg-emerald-800"
                  : "bg-rose-700 hover:bg-rose-800"
              }`}
            >
              {decision === "accept"
                ? "تأكيد الإجازة والتحويل للمستودع"
                : "تأكيد الإرجاع للقسم للتصحيح"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
