"use client";

import { Copy, Trash2 } from "lucide-react";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import type { OrderPaperMode } from "./order-paper-mode";
import { ORDER_PAPER_COLUMNS } from "./order_paper_columns";
import { Cell } from "./cell";

export function ProductTable({
  lines,
  editable,
  invalidCells,
  update,
  hideFinancials,
  mode,
  onDuplicatePiece,
  onDeletePiece,
}: {
  lines: ProductLine[];
  editable: boolean;
  invalidCells: Set<string>;
  update: (index: number, key: keyof ProductLine, value: string) => void;
  hideFinancials?: boolean | undefined;
  mode: OrderPaperMode;
  onDuplicatePiece?: ((lineId: string) => void) | undefined;
  onDeletePiece?: ((lineId: string) => void) | undefined;
}) {
  const rowCount =
    mode === "print" ? Math.max(8, lines.length) : Math.max(4, lines.length);

  return (
    <div className="w-full">
      <table className="paper-main-table">
        <caption className="sr-only">
          جدول منتجات أمر التفصيل: أحد عشر عموداً مستقلاً
        </caption>
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: "9%" }}>
              الإجمالي
            </th>
            <th rowSpan={2} style={{ width: "9%" }}>
              السعر
            </th>
            <th rowSpan={2} style={{ width: "7%" }}>
              الكمية
            </th>
            <th colSpan={3}>
              الجلد <small>LEATHER</small>
            </th>
            <th colSpan={4}>
              تركيب الوجه <small>MIXING</small>
            </th>
            <th
              rowSpan={2}
              style={{ width: mode !== "print" && editable ? "16%" : "12%" }}
            >
              الموديل <small>MODEL</small>
            </th>
          </tr>
          <tr>
            <th>التطعيم</th>
            <th>لون التطعيم</th>
            <th>الأساس</th>
            <th>م١</th>
            <th>م٢</th>
            <th>م٣</th>
            <th>الوجه</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const line = lines[index];
            if (!line) {
              return (
                <tr className="paper-blank-row" key={`blank-${String(index)}`}>
                  {ORDER_PAPER_COLUMNS.map(({ key }) => (
                    <td key={key} />
                  ))}
                </tr>
              );
            }

            const pieceLabel = line.pieceNumber || formatPieceSequence(index);

            return (
              <tr key={line.id}>
                {ORDER_PAPER_COLUMNS.map((column) => {
                  // If it's the model column, in digital mode we also show the piece badge and duplicate button
                  if (column.key === "model" && mode !== "print" && editable) {
                    return (
                      <td
                        key={column.key}
                        className={
                          invalidCells.has(`${line.id}:model`)
                            ? "paper-cell-invalid"
                            : ""
                        }
                      >
                        <div className="flex flex-col gap-1 p-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="paper-piece-badge"
                              title="هوية القطعة"
                            >
                              {pieceLabel}
                            </span>
                            <div className="flex items-center gap-1">
                              {onDuplicatePiece && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDuplicatePiece(line.id);
                                  }}
                                  className="paper-duplicate-btn px-1.5 py-0.5 text-[10px]"
                                  title="تكرار هذه القطعة وإضافتها كقطعة جديدة"
                                >
                                  <Copy size={10} />
                                  <span>تكرار</span>
                                </button>
                              )}
                              {onDeletePiece && lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeletePiece(line.id);
                                  }}
                                  className="rounded p-0.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                                  title="حذف هذه القطعة من المسودة"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                          <input
                            aria-label={`الموديل — ${pieceLabel}`}
                            list="dl-model"
                            className="paper-ltr border-t border-slate-200 text-xs font-semibold"
                            value={line.model}
                            onChange={(e) => {
                              update(index, "model", e.target.value);
                            }}
                            placeholder="اختر الموديل..."
                          />
                        </div>
                      </td>
                    );
                  }

                  return (
                    <Cell
                      key={column.key}
                      line={line}
                      column={column}
                      editable={editable}
                      invalid={invalidCells.has(`${line.id}:${column.key}`)}
                      update={(key, value) => {
                        update(index, key, value);
                      }}
                      hideFinancials={hideFinancials}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
