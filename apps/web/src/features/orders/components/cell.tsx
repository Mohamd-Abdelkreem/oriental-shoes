"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";

import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { ORDER_PAPER_COLUMNS } from "./order_paper_columns";

export function Cell({
  line,
  column,
  editable,
  invalid,
  update,
  hideFinancials,
}: {
  line: ProductLine;
  column: (typeof ORDER_PAPER_COLUMNS)[number];
  editable: boolean;
  invalid: boolean;
  update: (key: keyof ProductLine, value: string) => void;
  hideFinancials?: boolean | undefined;
}) {
  if (hideFinancials && column.group === "financial") {
    return (
      <td className="text-center font-mono text-slate-300 select-none">—</td>
    );
  }

  // Quantity is strictly 1 per row
  if (column.key === "quantity") {
    return (
      <td
        className="paper-quantity-fixed"
        title="الكمية مُثبّتة: قطعة واحدة لكل سطر"
      >
        <input
          readOnly
          tabIndex={-1}
          value="1"
          aria-label={`كمية ${line.pieceNumber || "القطعة"} مُثبّتة بقيمة 1`}
        />
      </td>
    );
  }

  // Row Total is read-only calculated from unitPrice
  if (column.key === "rowTotal") {
    const totalVal = line.rowTotal || line.unitPrice || "";
    return (
      <td className="bg-slate-50/50 font-bold text-slate-800">
        <input
          readOnly
          tabIndex={-1}
          value={totalVal}
          className="paper-ltr cursor-default"
          aria-label={`إجمالي ${line.pieceNumber || "القطعة"}`}
        />
      </td>
    );
  }

  const value = line[column.key] ?? "";
  if (!editable) {
    return (
      <td
        className={
          column.group === "model" || column.group === "financial"
            ? "paper-ltr"
            : ""
        }
      >
        {paperCellText(value) || "—"}
      </td>
    );
  }

  return (
    <td className={invalid ? "paper-cell-invalid" : ""}>
      <input
        aria-label={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
        aria-invalid={invalid}
        list={column.datalistId}
        className={
          column.group === "model" || column.group === "financial"
            ? "paper-ltr"
            : ""
        }
        type={column.group === "financial" ? "number" : "text"}
        value={paperCellText(value)}
        onChange={(event) => {
          update(column.key, event.target.value);
        }}
        placeholder={column.group === "financial" ? "0" : ""}
      />
    </td>
  );
}
