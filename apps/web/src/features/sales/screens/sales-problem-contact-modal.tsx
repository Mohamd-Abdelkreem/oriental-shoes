"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  useMvpStore,
  type MvpOrder,
  type ProductLine,
} from "@/features/prototype/state/mvp-store";
import {
  MODEL_OPTIONS,
  SIZE_OPTIONS,
  LEATHER_BASE_OPTIONS,
  SOLE_OPTIONS,
} from "@/features/orders/paper/paper-options";

export function SalesProblemContactModal({
  order,
  piece,
  onClose,
}: {
  order: MvpOrder;
  piece: ProductLine;
  onClose: () => void;
}) {
  const store = useMvpStore();
  const [model, setModel] = useState(piece.model || "");
  const [size, setSize] = useState(piece.size || "٤٢");
  const [leatherBase, setLeatherBase] = useState(piece.leatherBase || "");
  const decoration = piece.decoration || "";
  const [sole, setSole] = useState(piece.sole || "");
  const [salesNotes, setSalesNotes] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleSave = () => {
    store.salesUpdateProblemPiece(
      order.id,
      piece.id,
      { model, size, leatherBase, decoration, sole },
      salesNotes || "تم التواصل مع العميل وتعديل المواصفات بنجاح",
      "ريم خالد",
    );
    onClose();
  };

  const handleDelete = () => {
    store.deletePieceDraft(order.id, piece.id);
    onClose();
  };

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
            <h2 className="oriental-modal-title">
              تعديل مواصفات القطعة بعد التواصل مع العميل
            </h2>
            <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-900">
              {order.id} · {piece.pieceNumber || "القطعة"}
            </span>
          </div>
          <button
            type="button"
            className="oriental-modal-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
            <strong className="block font-bold text-rose-900">
              المشكلة المسجلة من قِبل الورشة (
              {piece.problem?.reportedByDept || "المصنع"}):
            </strong>
            <p className="text-rose-800">
              {piece.problem?.reason} — {piece.problem?.notes}
            </p>
            {piece.problem?.approvalNotes && (
              <p className="border-t border-rose-200/60 pt-1 text-slate-700">
                <b>ملاحظة مسؤول الاعتماد:</b> {piece.problem.approvalNotes}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span>العميل:</span> <b>{order.customer}</b>
              </div>
              <div>
                <span>الهاتف:</span> <b dir="ltr">{order.phone}</b>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">
                الموديل:
              </span>
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                }}
                className="oriental-input w-full"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">
                المقاس:
              </span>
              <select
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                }}
                className="oriental-input w-full"
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">
                الأساس (الجلد):
              </span>
              <select
                value={leatherBase}
                onChange={(e) => {
                  setLeatherBase(e.target.value);
                }}
                className="oriental-input w-full"
              >
                {LEATHER_BASE_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-semibold text-slate-700">
                الأرضية:
              </span>
              <select
                value={sole}
                onChange={(e) => {
                  setSole(e.target.value);
                }}
                className="oriental-input w-full"
              >
                {SOLE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block font-semibold text-slate-700">
              ملاحظات تواصل المبيعات مع العميل *:
            </span>
            <textarea
              rows={2}
              value={salesNotes}
              onChange={(e) => {
                setSalesNotes(e.target.value);
              }}
              placeholder="مثال: تم التواصل مع العميل هاتفياً ووافق على تغيير الأساس إلى جلد طبيعي بني والمقاس 43..."
              className="oriental-textarea w-full text-xs"
            />
          </label>

          {deleteConfirmOpen ? (
            <div className="space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
              <p className="font-bold">
                هل أنت متأكد من إلغاء هذه القطعة نهائياً بطلب العميل؟
              </p>
              <p className="text-[11px] text-rose-700">
                سيتم شطب القطعة من الطلب وتحديث إجمالي القطع والمبالغ المتبقية
                تلقائياً.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn-pill btn-outline text-xs"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                  }}
                >
                  تراجع
                </button>
                <button
                  type="button"
                  className="btn-pill btn-rose text-xs"
                  onClick={handleDelete}
                >
                  تأكيد إلغاء القطعة
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t pt-3">
              <button
                type="button"
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                }}
              >
                إلغاء القطعة بطلب العميل
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-pill btn-outline text-xs"
                  onClick={onClose}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="btn-pill btn-teal text-xs"
                  onClick={handleSave}
                >
                  حفظ وإعادة القطعة للتصنيع
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
