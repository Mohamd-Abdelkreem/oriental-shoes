"use client";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import type { calculateOrderTotals } from "@/features/orders/paper/order-totals";
import type { OrderPaperFormProps } from "./order-paper-form-props";

export function PaperFinance({
  order,
  totals,
  editable,
  hideFinancials,
  onPaidChange,
  dataState,
  fieldErrorMessages,
}: {
  order: MvpOrder;
  totals: ReturnType<typeof calculateOrderTotals> | undefined;
  editable: boolean;
  hideFinancials: boolean;
  onPaidChange: (paid: string) => void;
} & Pick<OrderPaperFormProps, "dataState" | "fieldErrorMessages">) {
  if (hideFinancials)
    return (
      <div className="paper-finance flex items-center justify-center rounded border border-slate-200 bg-slate-100/70 p-2 text-center text-xs font-medium text-slate-500">
        <span>البيانات المالية محجوبة عن أقسام المصنع</span>
      </div>
    );
  if (dataState !== undefined)
    return (
      <div className="paper-finance">
        <span className="paper-finance-row">
          <span>الإجمالي</span>
          <b aria-label="الإجمالي غير متاح">—</b>
        </span>
        <span className="paper-finance-row">
          <span>المدفوع (مدخل مبدئي)</span>
          {editable ? (
            <input
              name="paidAmount"
              type="number"
              min="0"
              step="0.01"
              className="paper-ltr font-bold text-slate-900"
              aria-label="المبلغ المدفوع"
              aria-invalid={fieldErrorMessages?.["paidAmount"] !== undefined}
              aria-describedby={
                fieldErrorMessages?.["paidAmount"] === undefined
                  ? undefined
                  : "paper-paidAmount-error"
              }
              value={order.paid ?? ""}
              onChange={(event) => {
                onPaidChange(event.target.value);
              }}
              placeholder="—"
            />
          ) : (
            <b>{order.paid || "—"}</b>
          )}
          {fieldErrorMessages?.["paidAmount"] !== undefined && (
            <span id="paper-paidAmount-error" className="sr-only">
              {fieldErrorMessages["paidAmount"]}
            </span>
          )}
        </span>
        <span className="paper-finance-row">
          <span>الباقي</span>
          <b aria-label="الباقي غير متاح">—</b>
        </span>
        <small className="text-xs text-slate-500">
          التسعير غير متاح؛ القيمة المدخلة ليست إثبات دفع.
        </small>
      </div>
    );
  if (totals === undefined)
    throw new Error(
      "Calculated totals are required for the existing priced paper presentation.",
    );
  const paid = totals.paid,
    computedTotal = Number(totals.total),
    paidNum = Number(paid) || 0,
    computedBalance = Number(totals.balance);
  return (
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
  );
}
