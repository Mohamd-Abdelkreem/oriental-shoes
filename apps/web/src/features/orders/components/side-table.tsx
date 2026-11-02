"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import {
  SOLE_OPTIONS,
  SOLE_COLOR_OPTIONS,
  ADDITIONS_OPTIONS,
} from "@/features/orders/paper/paper-options";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { OrderPaperMode } from "./order-paper-mode";
import { PaperCellSelect } from "./paper-cell-select";
import { PaperCellValue } from "./paper-cell-value";

const SIDE_COLUMNS: {
  key: keyof ProductLine;
  label: string;
  options: readonly string[];
  placeholder: string;
}[] = [
  {
    key: "sole",
    label: "النوع والموديل",
    options: SOLE_OPTIONS,
    placeholder: "اختر النوع والموديل...",
  },
  {
    key: "soleColor",
    label: "رقم اللون",
    options: SOLE_COLOR_OPTIONS,
    placeholder: "اختر اللون...",
  },
  {
    key: "additions",
    label: "الإضافات",
    options: ADDITIONS_OPTIONS,
    placeholder: "اختر الإضافات...",
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
          <th colSpan={2}>
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
            style={{ width: "190px", minWidth: "190px" }}
          >
            النوع والموديل
          </th>
          <th
            className="col-soleColor"
            style={{ width: "95px", minWidth: "95px" }}
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
              {SIDE_COLUMNS.map(({ key, label, options, placeholder }) => {
                const cellVal = line ? paperCellText(line[key]) : "";
                const isInvalid = Boolean(
                  line && invalidCells.has(`${line.id}:${key}`),
                );

                if (!line) {
                  return <td key={key} className={`col-${key}`} />;
                }

                if (!editable) {
                  return (
                    <td key={key} className={`col-${key}`} title={cellVal}>
                      <PaperCellValue value={cellVal} />
                    </td>
                  );
                }

                return (
                  <td
                    className={`col-${key} ${isInvalid ? "paper-cell-invalid" : ""}`}
                    key={key}
                  >
                    <PaperCellSelect
                      value={cellVal}
                      onChange={(value) => {
                        update(index, key, value);
                      }}
                      options={options}
                      placeholder={placeholder}
                      ariaLabel={`${label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
                      invalid={isInvalid}
                      columnLabel={label}
                    />
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
