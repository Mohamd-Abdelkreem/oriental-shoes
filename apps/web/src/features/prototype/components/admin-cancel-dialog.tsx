"use client";

import { useState } from "react";
import type { CancellationScope } from "./cancellation-scope";
import { BaseDialog } from "./base-dialog";

export function AdminCancelDialog({
  open,
  onClose,
  orderId,
  totalQty,
  cancelledSoFar,
  activeReqQty,
  warehouseQty,
  items,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  totalQty: number;
  cancelledSoFar: number;
  activeReqQty: number;
  warehouseQty: number;
  items?: { id: string | undefined; model: string; quantity: number }[];
  onConfirm: (cancelQty: number, reason: string, itemId?: string) => void;
}) {
  const [scope, setScope] = useState<CancellationScope>("QUANTITY");
  const [selectedItemId, setSelectedItemId] = useState<string>(
    items?.[0]?.id || "",
  );
  const [cancelQty, setCancelQty] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const selectedItem =
    items?.find((i) => i.id === selectedItemId) || items?.[0];

  let effectiveCancelQty = cancelQty;
  if (scope === "ORDER") {
    effectiveCancelQty = activeReqQty;
  } else if (scope === "ITEM" && selectedItem) {
    effectiveCancelQty = Math.min(selectedItem.quantity, activeReqQty);
  }

  const handleConfirm = () => {
    if (effectiveCancelQty <= 0 || effectiveCancelQty > activeReqQty) {
      setError(
        `الكمية المراد إلغاؤها يجب أن تكون بين ١ و ${String(activeReqQty)}`,
      );
      return;
    }
    setError("");
    onConfirm(
      effectiveCancelQty,
      reason ||
        (scope === "ORDER"
          ? "إلغاء إداري شامل لكامل أمر التفصيل"
          : scope === "ITEM"
            ? `إلغاء بند ${selectedItem?.model || ""}`
            : "إلغاء إداري جزئي للكمية"),
      scope !== "ORDER" ? selectedItemId : undefined,
    );
    onClose();
  };

  const remainingAfter = Math.max(0, activeReqQty - effectiveCancelQty);
  const canContinue = remainingAfter > 0;

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="الإلغاء الإداري للكميات وأوامر التفصيل"
      subtitle={`أمر التفصيل: ${orderId} · صلاحية حصرية للإدارة العامة`}
      actions={
        <>
          <button
            type="button"
            className="btn-pill btn-rose"
            onClick={handleConfirm}
          >
            تأكيد إلغاء {effectiveCancelQty} قطعة
          </button>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={onClose}
          >
            تراجع
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ <strong>تنبيه إداري رقابي:</strong> الإلغاء يخصم الكمية المحددة
          فورياً من طوابير المصنع، ويعيد ضبط المقام التشغيلي للكمية النشطة
          المطلوبة، مع توثيق السجل بالكامل لعدم ضياع التاريخ.
        </div>

        {/* Display Current Order Items and Active Quantities */}
        {items && items.length > 0 && (
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-800">
              بنود أمر التفصيل الحالية:
            </span>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2"
                >
                  <span className="font-semibold text-slate-800">
                    {item.model}
                  </span>
                  <span className="font-bold text-slate-600">
                    {item.quantity} قطع
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancellation Scope Selector */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-800">
            نوع الإلغاء المطلوب:
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setScope("ORDER");
              }}
              className={`rounded-lg border p-2 text-center text-xs font-bold transition ${
                scope === "ORDER"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              كامل أمر التفصيل
            </button>
            <button
              type="button"
              onClick={() => {
                setScope("ITEM");
              }}
              className={`rounded-lg border p-2 text-center text-xs font-bold transition ${
                scope === "ITEM"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              بند كامل
            </button>
            <button
              type="button"
              onClick={() => {
                setScope("QUANTITY");
              }}
              className={`rounded-lg border p-2 text-center text-xs font-bold transition ${
                scope === "QUANTITY"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              كمية محددة من بند
            </button>
          </div>
        </div>

        {/* Select Item if scope !== ORDER */}
        {scope !== "ORDER" && items && items.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              البند المستهدف:
            </span>
            <select
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
              }}
              className="oriental-input w-full text-xs"
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.model} ({it.quantity} قطع)
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Custom Quantity Input when scope is QUANTITY */}
        {scope === "QUANTITY" && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800">
              الكمية المراد إلغاؤها (بين ١ و {activeReqQty}):
            </span>
            <input
              type="number"
              min={1}
              max={activeReqQty}
              value={cancelQty}
              onChange={(e) => {
                setCancelQty(Number(e.target.value));
                setError("");
              }}
              className="oriental-input w-full font-mono text-xs"
            />
          </label>
        )}

        {/* Reason Textarea */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-800">
            سبب الإلغاء الإداري (اختياري):
          </span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            placeholder="مثال: رغبة العميل في إلغاء بند واسترداد قيمته..."
            className="oriental-textarea w-full text-xs"
          />
        </label>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        {/* Quantity Reconciliation Card */}
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>الكمية الأصلية للطلب:</span>
            <strong>{totalQty} قطعة</strong>
          </div>
          {cancelledSoFar > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>الملغى سابقاً:</span>
              <span>{cancelledSoFar} قطعة</span>
            </div>
          )}
          <div className="flex justify-between text-slate-700">
            <span>المطلوب النشط قبل الإلغاء:</span>
            <strong>{activeReqQty} قطعة</strong>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-rose-700">
            <span>الكمية الجاري إلغاؤها الآن:</span>
            <strong>{effectiveCancelQty} قطعة</strong>
          </div>
          <div className="flex justify-between font-bold text-teal-800">
            <span>المطلوب النشط بعد الإلغاء:</span>
            <strong>{remainingAfter} قطعة</strong>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-500">
            <span>المنجز بالمستودع:</span>
            <span>{warehouseQty} قطعة</span>
          </div>
          <div className="flex justify-between pt-0.5 text-xs font-semibold">
            <span>إمكانية مواصلة تشغيل باقي الطلب:</span>
            <span
              className={
                canContinue ? "font-bold text-emerald-700" : "text-slate-500"
              }
            >
              {canContinue
                ? "نعم، يستمر إنتاج باقي الكميات"
                : "لا، تم إلغاء الطلب بالكامل"}
            </span>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
