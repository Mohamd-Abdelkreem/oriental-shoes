"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";

import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { OrderPaperMode } from "./order-paper-mode";

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
  const rowCount =
    mode === "print" ? Math.max(8, lines.length) : Math.max(4, lines.length);
  const columns: {
    key: keyof ProductLine;
    label: string;
    datalistId?: string;
  }[] = [
    { key: "sole", label: "النوع والموديل", datalistId: "dl-sole" },
    { key: "soleColor", label: "رقم اللون", datalistId: "dl-sole-color" },
    { key: "additions", label: "الإضافات", datalistId: "dl-additions" },
  ];

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
          <th rowSpan={2} style={{ width: "34%" }}>
            الإضافات <small>OPTIONS</small>
          </th>
        </tr>
        <tr>
          <th style={{ width: "44%" }}>النوع والموديل</th>
          <th style={{ width: "22%" }}>رقم اللون</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, index) => {
          const line = lines[index];
          return (
            <tr key={line?.id ?? `side-blank-${String(index)}`}>
              {columns.map(({ key, label, datalistId }) => {
                const cellVal = line ? paperCellText(line[key]) : "";
                return (
                  <td
                    className={
                      line && invalidCells.has(`${line.id}:${key}`)
                        ? "paper-cell-invalid"
                        : ""
                    }
                    key={key}
                    title={cellVal}
                  >
                    {line ? (
                      editable ? (
                        <input
                          aria-label={`${label} — ${line.model || line.pieceNumber || "سطر جديد"}`}
                          list={datalistId}
                          title={cellVal}
                          value={cellVal}
                          onChange={(event) => {
                            update(index, key, event.target.value);
                          }}
                        />
                      ) : (
                        cellVal || "—"
                      )
                    ) : null}
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
