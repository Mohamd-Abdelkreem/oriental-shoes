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
  const rowCount = mode === "print" ? lines.length : Math.max(4, lines.length);

  return (
    <div className="w-full">
      <table className="paper-main-table">
        <caption className="sr-only">
          جدول منتجات أمر التفصيل: اثنا عشر عموداً مستقلاً يبدأ بعمود ترقيم
          القطعة
        </caption>
        <thead>
          <tr>
            <th
              className="col-piece"
              rowSpan={2}
              style={{ width: "90px", minWidth: "90px" }}
            >
              القطعة <small>PIECE</small>
            </th>
            <th
              className="col-rowTotal"
              rowSpan={2}
              style={{ width: "90px", minWidth: "90px" }}
            >
              الإجمالي
            </th>
            <th
              className="col-unitPrice"
              rowSpan={2}
              style={{ width: "90px", minWidth: "90px" }}
            >
              السعر
            </th>
            <th
              className="col-quantity"
              rowSpan={2}
              style={{ width: "65px", minWidth: "65px" }}
            >
              الكمية
            </th>
            <th colSpan={3}>
              الجلد <small>LEATHER</small>
            </th>
            <th colSpan={4}>
              تركيب الوجه <small>MIXING</small>
            </th>
            <th
              className="col-model"
              rowSpan={2}
              style={{ width: "160px", minWidth: "160px" }}
            >
              الموديل <small>MODEL</small>
            </th>
          </tr>
          <tr>
            <th
              className="col-decoration"
              style={{ width: "115px", minWidth: "115px" }}
            >
              التطعيم
            </th>
            <th
              className="col-decorationColor"
              style={{ width: "115px", minWidth: "115px" }}
            >
              لون التطعيم
            </th>
            <th
              className="col-leatherBase"
              style={{ width: "125px", minWidth: "125px" }}
            >
              الأساس
            </th>
            <th
              className="col-faceRight"
              style={{ width: "85px", minWidth: "85px" }}
            >
              م١
            </th>
            <th
              className="col-faceLeft"
              style={{ width: "85px", minWidth: "85px" }}
            >
              م٢
            </th>
            <th
              className="col-mixing"
              style={{ width: "85px", minWidth: "85px" }}
            >
              م٣
            </th>
            <th
              className="col-face"
              style={{ width: "125px", minWidth: "125px" }}
            >
              الوجه
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const line = lines[index];
            if (!line) {
              return (
                <tr className="paper-blank-row" key={`blank-${String(index)}`}>
                  <td className="col-piece" />
                  {ORDER_PAPER_COLUMNS.map(({ key }) => (
                    <td key={key} className={`col-${key}`} />
                  ))}
                </tr>
              );
            }

            const pieceDigits = String(index + 1).padStart(2, "0");

            return (
              <tr key={line.id}>
                {/* Dedicated Piece Column at the start of the row */}
                <td className="col-piece text-center">
                  <div className="paper-piece-cell paper-cell-box paper-cell-box-readonly">
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
