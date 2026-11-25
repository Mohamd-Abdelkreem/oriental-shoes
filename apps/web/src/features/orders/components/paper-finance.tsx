"use client";
import type { MvpOrder } from "@/features/prototype/state/mvp-store";
import type { calculateOrderTotals } from "@/features/orders/paper/order-totals";
import type { OrderPaperFormProps } from "./order-paper-form-props";

export function PaperFinance({
  order,
  totals,
  editable,
  onPaidChange,
  dataState,
  paidEdit,
  fieldErrorMessages,
}: {
  order: Pick<MvpOrder, "total" | "paid" | "balance">;
  totals: ReturnType<typeof calculateOrderTotals> | undefined;
  editable: boolean;
  onPaidChange: (paid: string) => void;
} & Pick<
  OrderPaperFormProps,
  "dataState" | "fieldErrorMessages" | "paidEdit"
>) {
  if (
    dataState?.kind === "authoritative" &&
    dataState.finance.kind === "submitted"
  ) {
    const { money } = dataState.finance;
    return (
      <div className="paper-finance">
        <span className="paper-finance-row">
          <span>الإجمالي</span>
          <b aria-label="الإجمالي المعتمد">{money.total}</b>
        </span>
        <span className="paper-finance-row">
          <span>المدفوع</span>
          {paidEdit === undefined ? (
            <b aria-label="المدفوع المعتمد">{money.paidAmount}</b>
          ) : (
            <span className="space-y-1">
              <input
                aria-label="تعديل المبلغ المدفوع"
                aria-invalid={paidEdit.error !== null}
                inputMode="decimal"
                className="paper-ltr font-bold text-slate-900"
                disabled={paidEdit.pending}
                value={paidEdit.value}
                onChange={(event) => {
                  paidEdit.onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    paidEdit.onSave();
                  }
                }}
              />
              <button
                type="button"
                disabled={paidEdit.pending}
                className="btn-pill btn-outline px-2 py-0.5 text-xs"
                onClick={paidEdit.onSave}
              >
                حفظ المدفوع
              </button>
              <button
                type="button"
                disabled={paidEdit.pending}
                className="btn-pill btn-outline px-2 py-0.5 text-xs"
                onClick={paidEdit.onCancel}
              >
                إلغاء تعديل المدفوع
              </button>
              {paidEdit.error !== null && (
                <span role="alert">{paidEdit.error}</span>
              )}
            </span>
          )}
        </span>
        <span className="paper-finance-row">
          <span>الباقي</span>
          <b aria-label="الباقي المعتمد">{money.remainingDue}</b>
        </span>
        {money.surplus !== "0.00" && (
          <span className="paper-finance-row">
            <span>رصيد زائد للعميل</span>
            <b aria-label="رصيد العميل الزائد">{money.surplus}</b>
          </span>
        )}
      </div>
    );
  }
  const quote =
    dataState?.kind === "authoritative" && dataState.finance.kind === "quote"
      ? dataState.finance
      : null;
  if (dataState !== undefined)
    return (
      <div className="paper-finance">
        <span className="paper-finance-row">
          <span>الإجمالي</span>
          <b
            aria-label={
              quote === null ? "الإجمالي غير متاح" : "الإجمالي المعروض للمراجعة"
            }
          >
            {quote?.total ?? "—"}
          </b>
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
          {quote === null
            ? "التسعير غير متاح؛ القيمة المدخلة ليست إثبات دفع."
            : "عرض سعر للمراجعة؛ المدفوع مدخل مبدئي وليس إثبات دفع."}
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
