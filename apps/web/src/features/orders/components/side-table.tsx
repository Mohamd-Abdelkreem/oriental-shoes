"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import {
  SOLE_OPTIONS,
  SOLE_ADDITION_OPTIONS,
  SOLE_COLOR_OPTIONS,
} from "@/features/orders/paper/paper-options";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { OrderPaperMode } from "./order-paper-mode";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";

type SideColumnConfig =
  | {
      key: "sole" | "soleAddition" | "soleColor";
      label: string;
      type: "select";
      options: readonly string[];
      placeholder: string;
    }
  | {
      key: "additions";
      label: string;
      type: "text";
      placeholder: string;
    };

const SIDE_COLUMNS: readonly SideColumnConfig[] = [
  {
    key: "sole",
    label: "النوع والموديل",
    type: "select",
    options: SOLE_OPTIONS,
    placeholder: "اختر النوع والموديل...",
  },
  {
    key: "soleAddition",
    label: "الإضافة",
    type: "select",
    options: SOLE_ADDITION_OPTIONS,
    placeholder: "اختر الإضافة...",
  },
  {
    key: "soleColor",
    label: "رقم اللون",
    type: "select",
    options: SOLE_COLOR_OPTIONS,
    placeholder: "اختر اللون...",
  },
  {
    key: "additions",
    label: "الإضافات",
    type: "text",
    placeholder: "الإضافات...",
  },
];

export function SideTable({
  lines,
  editable,
  invalidCells,
  update,
  mode,
}: {
  lines: ProductLine[];
  editable: boolean;
  invalidCells: Set<string>;
  update: (index: number, key: keyof ProductLine, value: string) => void;
  mode: OrderPaperMode;
}) {
  const rowCount = mode === "print" ? lines.length : Math.max(4, lines.length);

  return (
    <table className="paper-side-table">
      <caption className="sr-only">
        الأرضية والإضافات المرتبطة بصفوف المنتجات
      </caption>
      <thead>
        <tr>
          <th colSpan={3}>
            الأرضية <small>SOLE</small>
          </th>
          <th
            className="col-additions"
            rowSpan={2}
            style={{ width: "135px", minWidth: "135px" }}
          >
            الإضافات <small>OPTIONS</small>
          </th>
        </tr>
        <tr>
          <th
            className="col-sole"
            style={{ width: "165px", minWidth: "165px" }}
          >
            النوع والموديل
          </th>
          <th
            className="col-soleAddition"
            style={{ width: "140px", minWidth: "140px" }}
          >
            الإضافة
          </th>
          <th
            className="col-soleColor"
            style={{ width: "90px", minWidth: "90px" }}
          >
            رقم اللون
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, index) => {
          const line = lines[index];
          return (
            <tr
              key={line?.id ?? `side-blank-${String(index)}`}
              className={!line ? "paper-blank-row" : undefined}
            >
              {SIDE_COLUMNS.map((column) => {
                const cellValue = line ? paperCellText(line[column.key]) : "";
                const isInvalid = Boolean(
                  line && invalidCells.has(`${line.id}:${column.key}`),
                );

                if (!line) {
                  return (
                    <td key={column.key} className={`col-${column.key}`} />
                  );
                }

                if (!editable) {
                  return (
                    <td
                      key={column.key}
                      className={`col-${column.key}`}
                      title={cellValue}
                    >
                      <PaperCellValue value={cellValue} />
                    </td>
                  );
                }

                return (
                  <td
                    className={`col-${column.key} ${isInvalid ? "paper-cell-invalid" : ""}`}
                    key={column.key}
                  >
                    {column.type === "text" ? (
                      <div
                        className={`paper-cell-box ${isInvalid ? "is-invalid" : ""}`}
                      >
                        <input
                          aria-label={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
                          aria-invalid={isInvalid}
                          title={cellValue}
                          className="paper-cell-input"
                          type="text"
                          value={cellValue}
                          onChange={(event) => {
                            update(index, column.key, event.target.value);
                          }}
                          placeholder={column.placeholder}
                        />
                      </div>
                    ) : (
                      <PaperCellSelect
                        value={cellValue}
                        onChange={(value) => {
                          update(index, column.key, value);
                        }}
                        options={column.options}
                        placeholder={column.placeholder}
                        ariaLabel={`${column.label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
                        invalid={isInvalid}
                        columnLabel={column.label}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
