"use client";

import { catalogFieldSchema } from "@template/contracts";
import type { PaperCatalogOption } from "./order-paper-form-props";
import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import { COLUMN_OPTIONS_MAP } from "@/features/orders/paper/paper-options";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { ORDER_PAPER_COLUMNS } from "./order_paper_columns";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";
import type { OrderPaperFormProps } from "./order-paper-form-props";

export function Cell({
  line,
  column,
  editable,
  clearable,
  invalid,
  update,
  hideFinancials,
  dataState,
  fieldErrorMessages,
  onFieldElement,
  onCatalogSelection,
}: {
  line: ProductLine;
  column: (typeof ORDER_PAPER_COLUMNS)[number];
  editable: boolean;
  clearable?: boolean | undefined;
  invalid: boolean;
  update: (key: keyof ProductLine, value: string) => void;
  hideFinancials?: boolean | undefined;
} & Pick<
  OrderPaperFormProps,
  "dataState" | "fieldErrorMessages" | "onFieldElement" | "onCatalogSelection"
>) {
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
      dataState?.kind === "authoritative"
        ? (dataState.finance.piecePrices[line.id] ?? "—")
        : dataState === undefined
          ? line[column.key] || (isUnitPrice ? "0" : line.unitPrice || "0")
          : "—";
    return (
      <td
        className={`col-${column.key} bg-slate-50/50 font-bold text-slate-800`}
        title={
          dataState?.kind === "authoritative" &&
          dataState.finance.piecePrices[line.id] != null
            ? "قيمة معتمدة من الخادم وغير قابلة للتعديل"
            : dataState !== undefined
              ? "السعر غير متاح لهذه القطعة"
              : isUnitPrice
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

  const catalogField = catalogFieldSchema.safeParse(column.key);
  const locked =
    dataState?.kind === "authoritative" &&
    catalogField.success &&
    dataState.lockedCatalogFields.includes(catalogField.data);
  if (!editable || locked) {
    return (
      <td
        title={displayValue}
        className={`col-${column.key} ${isLtr ? "paper-ltr" : ""}`}
      >
        <PaperCellValue value={displayValue} />
      </td>
    );
  }

  const draftOptions:
    Partial<Record<keyof ProductLine, readonly string[]>> | undefined =
    dataState?.kind === "draft" ? dataState.catalogOptions : undefined;
  const options: readonly (string | PaperCatalogOption)[] | undefined =
    dataState?.kind === "authoritative"
      ? catalogField.success
        ? dataState.catalogOptions[catalogField.data]
        : undefined
      : dataState === undefined
        ? COLUMN_OPTIONS_MAP[column.key]
        : draftOptions?.[column.key];
  const errorMessage = fieldErrorMessages?.[`${line.id}:${column.key}`];
  const errorId = `paper-error-${line.id}-${column.key}`;
  if (options) {
    return (
      <td
        className={`col-${column.key} ${invalid ? "paper-cell-invalid" : ""}`}
      >
        <PaperCellSelect
          clearable={clearable}
          value={displayValue}
          onChange={(value) => {
            update(column.key, value);
          }}
          options={options}
          selectedOptionId={
            dataState?.kind === "authoritative" && catalogField.success
              ? (dataState.selectionsByPiece[line.id]?.[catalogField.data] ??
                null)
              : undefined
          }
          onSelectionChange={
            dataState?.kind === "authoritative" &&
            catalogField.success &&
            onCatalogSelection !== undefined
              ? (selection) => {
                  onCatalogSelection(line.id, catalogField.data, selection);
                }
              : undefined
          }
          placeholder={
            column.key === "model"
              ? "اختر الموديل..."
              : `اختر ${column.label}...`
          }
          ariaLabel={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
          invalid={invalid}
          errorMessage={errorMessage}
          errorId={errorId}
          onFieldElement={(element) => {
            onFieldElement?.(line.id, column.key, element);
          }}
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
          aria-describedby={errorMessage === undefined ? undefined : errorId}
          ref={(element) => {
            onFieldElement?.(line.id, column.key, element);
          }}
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
        {errorMessage !== undefined && (
          <span id={errorId} className="sr-only">
            {errorMessage}
          </span>
        )}
      </div>
    </td>
  );
}
