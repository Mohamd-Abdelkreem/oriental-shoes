"use client";

import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import type { calculateOrderTotals } from "@/features/orders/paper/order-totals";

export function PaperFinance({
  order,
  totals,
  editable,
  hideFinancials,
  onPaidChange,
}: {
  order: MvpOrder;
  totals: ReturnType<typeof calculateOrderTotals>;
  editable: boolean;
  hideFinancials: boolean;
  onPaidChange: (paid: string) => void;
}) {
  const paid = totals.paid;
  const computedTotal = Number(totals.total);
  const paidNum = Number(paid) || 0;
  const computedBalance = Number(totals.balance);

  return (
    <>
      {hideFinancials ? (
        <div className="paper-finance flex items-center justify-center rounded border border-slate-200 bg-slate-100/70 p-2 text-center text-xs font-medium text-slate-500">
          <span>البيانات المالية محجوبة عن أقسام المصنع</span>
        </div>
      ) : (
        <div className="paper-finance">
          <span className="paper-finance-row">
            <span>الإجمالي</span>
            {editable ? (
              <input
                name="total"
                readOnly
                tabIndex={-1}
                className="paper-ltr cursor-default bg-slate-50/70 font-bold text-slate-800"
                value={totals.total}
                aria-label="الإجمالي المحسوب تلقائياً"
                placeholder="0"
              />
            ) : (
              <b>
                {computedTotal > 0 ? String(computedTotal) : order.total || "—"}
              </b>
            )}
          </span>

          <span className="paper-finance-row">
            <span>المدفوع</span>
            {editable ? (
              <input
                name="paid"
                type="number"
                min="0"
                step="0.01"
                className="paper-ltr font-bold text-slate-900"
                aria-label="المبلغ المدفوع"
                value={paid}
                onChange={(event) => {
                  onPaidChange(event.target.value);
                }}
                placeholder="0"
              />
            ) : (
              <b>{paid || order.paid || "—"}</b>
            )}
          </span>

          <span className="paper-finance-row">
            <span>الباقي</span>
            {editable ? (
              <input
                name="balance"
                readOnly
                tabIndex={-1}
                className="paper-ltr cursor-default bg-slate-50/70 font-bold text-rose-700"
                value={totals.balance}
                aria-label="المبلغ المتبقي المحسوب تلقائياً"
                placeholder="0"
              />
            ) : (
              <b className={computedBalance > 0 ? "text-rose-700" : ""}>
                {computedTotal > 0 || paidNum > 0
                  ? String(computedBalance)
                  : order.balance || "—"}
              </b>
            )}
          </span>
        </div>
      )}
    </>
  );
}
