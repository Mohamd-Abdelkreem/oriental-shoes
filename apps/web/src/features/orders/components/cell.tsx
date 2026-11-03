"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import { COLUMN_OPTIONS_MAP } from "@/features/orders/paper/paper-options";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { ORDER_PAPER_COLUMNS } from "./order_paper_columns";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";

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
      <td
        className={`col-${column.key} text-center font-mono text-slate-300 select-none`}
      >
        <PaperCellValue value="—" className="text-slate-300" />
      </td>
    );
  }

  if (column.key === "quantity") {
    return (
      <td
        className={`col-${column.key} paper-quantity-fixed`}
        title="الكمية مُثبّتة: قطعة واحدة لكل سطر"
      >
        <div className="paper-cell-box paper-cell-box-readonly">
          <span
            className="paper-cell-value font-bold text-slate-800"
            aria-label={`كمية ${line.pieceNumber || "القطعة"} مُثبّتة بقيمة 1`}
          >
            1
          </span>
        </div>
      </td>
    );
  }

  if (column.key === "unitPrice" || column.key === "rowTotal") {
    const isUnitPrice = column.key === "unitPrice";
    const amount =
      line[column.key] || (isUnitPrice ? "0" : line.unitPrice || "0");
    return (
      <td
        className={`col-${column.key} bg-slate-50/50 font-bold text-slate-800`}
        title={
          isUnitPrice
            ? "السعر محدد تلقائياً من قاعدة البيانات وغير قابل للتعديل"
            : "الإجمالي محتسب تلقائياً"
        }
      >
        <div className="paper-cell-box paper-cell-box-readonly bg-slate-100/60 font-bold">
          <span
            className="paper-cell-value paper-ltr font-bold text-slate-800"
            aria-label={`${isUnitPrice ? "سعر" : "إجمالي"} ${line.pieceNumber || "القطعة"}`}
          >
            {amount}
          </span>
        </div>
      </td>
    );
  }

  const value = line[column.key] ?? "";
  const displayValue = paperCellText(value);
  const isLtr = column.group === "financial" || column.group === "model";

  if (!editable) {
    return (
      <td
        title={displayValue}
        className={`col-${column.key} ${isLtr ? "paper-ltr" : ""}`}
      >
        <PaperCellValue value={displayValue} />
      </td>
    );
  }

  const options = COLUMN_OPTIONS_MAP[column.key];
  if (options) {
    return (
      <td
        className={`col-${column.key} ${invalid ? "paper-cell-invalid" : ""}`}
      >
        <PaperCellSelect
          value={displayValue}
          onChange={(value) => {
            update(column.key, value);
          }}
          options={options}
          placeholder={
            column.key === "model"
              ? "اختر الموديل..."
              : `اختر ${column.label}...`
          }
          ariaLabel={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
          invalid={invalid}
          columnLabel={column.label}
          ltr={column.group === "model"}
        />
      </td>
    );
  }

  return (
    <td className={`col-${column.key} ${invalid ? "paper-cell-invalid" : ""}`}>
      <div className={`paper-cell-box ${invalid ? "is-invalid" : ""}`}>
        <input
          aria-label={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
          aria-invalid={invalid}
          title={displayValue}
          className={`paper-cell-input ${isLtr ? "paper-ltr" : ""}`}
          type={column.group === "financial" ? "number" : "text"}
          value={displayValue}
          onChange={(event) => {
            update(column.key, event.target.value);
          }}
          placeholder={
            column.group === "financial" ? "0" : `${column.label}...`
          }
        />
      </div>
    </td>
  );
}
