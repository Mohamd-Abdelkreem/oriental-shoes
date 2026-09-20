"use client";

import { Copy, Trash2 } from "lucide-react";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
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
          جدول منتجات أمر التفصيل: اثنا عشر عموداً مستقلاً يبدأ بعمود ترقيم
          القطعة
        </caption>
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: "8%", minWidth: "75px" }}>
              القطعة <small>PIECE</small>
            </th>
            <th rowSpan={2} style={{ width: "7%" }}>
              الإجمالي
            </th>
            <th rowSpan={2} style={{ width: "7%" }}>
              السعر
            </th>
            <th rowSpan={2} style={{ width: "5%" }}>
              الكمية
            </th>
            <th colSpan={3}>
              الجلد <small>LEATHER</small>
            </th>
            <th colSpan={4}>
              تركيب الوجه <small>MIXING</small>
            </th>
            <th rowSpan={2} style={{ width: "12.5%", minWidth: "100px" }}>
              الموديل <small>MODEL</small>
            </th>
          </tr>
          <tr>
            <th style={{ width: "9%" }}>التطعيم</th>
            <th style={{ width: "9%" }}>لون التطعيم</th>
            <th style={{ width: "10%" }}>الأساس</th>
            <th style={{ width: "7.5%" }}>م١</th>
            <th style={{ width: "7.5%" }}>م٢</th>
            <th style={{ width: "7.5%" }}>م٣</th>
            <th style={{ width: "10%" }}>الوجه</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const line = lines[index];
            if (!line) {
              return (
                <tr className="paper-blank-row" key={`blank-${String(index)}`}>
                  <td />
                  {ORDER_PAPER_COLUMNS.map(({ key }) => (
                    <td key={key} />
                  ))}
                </tr>
              );
            }

            const pieceDigits = String(index + 1).padStart(2, "0");

            return (
              <tr key={line.id}>
                {/* Dedicated Piece Column at the start of the row */}
                <td className="p-0 text-center">
                  <div className="paper-piece-cell">
                    <span
                      className="paper-piece-num"
                      title={line.pieceNumber || `القطعة ${pieceDigits}`}
                    >
                      {pieceDigits}
                    </span>
                    {mode !== "print" && editable && (
                      <div className="paper-piece-actions">
                        {onDuplicatePiece && (
                          <button
                            type="button"
                            onClick={() => {
                              onDuplicatePiece(line.id);
                            }}
                            className="paper-duplicate-btn"
                            title="تكرار هذه القطعة وإضافتها كقطعة جديدة"
                          >
                            <Copy size={9} />
                            <span>تكرار</span>
                          </button>
                        )}
                        {onDeletePiece && lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onDeletePiece(line.id);
                            }}
                            className="paper-delete-btn"
                            title="حذف هذه القطعة من المسودة"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                {/* Data Columns */}
                {ORDER_PAPER_COLUMNS.map((column) => (
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
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
