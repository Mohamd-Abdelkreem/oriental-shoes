"use client";

import { paperCellText } from "@/features/orders/paper/paper-cell-text";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Plus } from "lucide-react";
import { Ltr } from "@/features/prototype/components/shared-ui";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import {
  TOP_5_BOXES,
  BOTTOM_12_BOX_PAIRS,
} from "@/features/orders/paper/paper-options";
import type { OrderPaperFormProps } from "./order-paper-form-props";
import { isEditable } from "./is-editable";
import { blankLine } from "./blank-line";
import { FormDatalists } from "./form-datalists";
import { SideTable } from "./side-table";
import { ProductTable } from "./product-table";

export function OrderPaperForm({
  order,
  mode = "readOnly",
  lines = order.items,
  onLinesChange,
  invalidCells = new Set(),
  showZoomControls = false,
  hideFinancials = false,
  onDuplicatePiece,
  onDeletePiece,
  onAddPiece,
  selectedBoxes = order.selectedBoxes || [],
  onSelectedBoxesChange,
  onTotalsChange,
}: OrderPaperFormProps) {
  const editable = isEditable(mode);
  const [zoom, setZoom] = useState(1);
  const [localBoxes, setLocalBoxes] = useState<string[]>(selectedBoxes);

  const activeBoxes = onSelectedBoxesChange ? selectedBoxes : localBoxes;

  const toggleBox = (code: string) => {
    if (!editable) return;
    const next = activeBoxes.includes(code)
      ? activeBoxes.filter((c) => c !== code)
      : [...activeBoxes, code];
    setLocalBoxes(next);
    onSelectedBoxesChange?.(next);
  };

  const update = (index: number, key: keyof ProductLine, value: string) => {
    const updatedLines = lines.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const updated = {
        ...line,
        [key]: key === "quantity" ? 1 : value,
      };
      // Auto-calculate row total = unitPrice (since quantity is always 1)
      if (key === "unitPrice") {
        const uPrice = Number(value || 0);
        updated.rowTotal = uPrice > 0 ? String(uPrice) : "";
      }
      return updated;
    });

    onLinesChange?.(updatedLines);

    // If unitPrice changed, recalculate total
    if (key === "unitPrice") {
      const sum = updatedLines.reduce(
        (acc, l) => acc + (Number(l.unitPrice) || 0),
        0,
      );
      const paidNum = Number(order.paid) || 0;
      const balanceNum = Math.max(0, sum - paidNum);
      onTotalsChange?.({
        total: String(sum),
        paid: String(paidNum),
        balance: String(balanceNum),
      });
    }
  };

  const first = lines[0] ?? blankLine("paper-empty", 1);
  const changeFirst = (key: keyof ProductLine, value: string) => {
    update(0, key, value);
  };

  // If pieces > 8 and print mode, chunk into pages of 8 lines
  const isPrint = mode === "print";
  const piecesPerPage = 8;
  const totalPages =
    isPrint && lines.length > piecesPerPage
      ? Math.ceil(lines.length / piecesPerPage)
      : 1;

  return (
    <div className="paper-component-wrap">
      <FormDatalists />

      {/* Zoom / View Control Bar */}
      {mode !== "print" && showZoomControls && (
        <div className="paper-controls-bar">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">
              التحكم في عرض النموذج:
            </span>
            <button
              type="button"
              className="paper-zoom-btn"
              onClick={() => {
                setZoom((z) => Math.min(1.3, z + 0.1));
              }}
              title="تكبير"
            >
              <ZoomIn size={14} />
            </button>
            <span className="px-1 text-xs font-bold text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="paper-zoom-btn"
              onClick={() => {
                setZoom((z) => Math.max(0.75, z - 0.1));
              }}
              title="تصغير"
            >
              <ZoomOut size={14} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                className="paper-zoom-btn text-xs text-slate-500"
                onClick={() => {
                  setZoom(1);
                }}
                title="إعادة التعيين إلى ١٠٠٪"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {editable
                ? "اكتب مباشرة داخل خلايا الجدول أو اختر من القوائم"
                : "عرض للقراءة والمراجعة"}
            </span>
            {editable && onAddPiece && (
              <button
                type="button"
                onClick={onAddPiece}
                className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 transition hover:bg-teal-100"
              >
                <Plus size={13} />
                <span>إضافة قطعة جديدة</span>
              </button>
            )}
          </div>
        </div>
      )}

      {mode !== "print" && (
        <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-center text-xs font-semibold text-teal-800 sm:hidden">
          <span>⇄</span>
          <span>مرر أفقيًا لعرض نموذج أمر التفصيل بالكامل</span>
        </div>
      )}

      <div className="paper-scroll-wrap">
        {Array.from({ length: totalPages }, (_, pageIndex) => {
          const pageLines =
            isPrint && totalPages > 1
              ? lines.slice(
                  pageIndex * piecesPerPage,
                  (pageIndex + 1) * piecesPerPage,
                )
              : lines;

          return (
            <article
              key={`page-${String(pageIndex)}`}
              className={`order-paper print-document ${pageIndex > 0 ? "paper-page-continuation" : ""}`}
              style={{
                transform:
                  zoom !== 1 && mode !== "print"
                    ? `scale(${String(zoom)})`
                    : undefined,
                transformOrigin: "top right",
              }}
              aria-label={`أمر تفصيل الحذاء الشرقي ${totalPages > 1 ? `— صفحة ${String(pageIndex + 1)} من ${String(totalPages)}` : ""}`}
            >
              {/* Header */}
              <header className="paper-header">
                <div className="paper-brand">
                  <strong>الحذاء الشرقي</strong>
                  <span className="paper-mark">◇</span>
                  <small>ORIENTAL SHOES</small>
                </div>
                <div className="paper-title">
                  <b>
                    {pageIndex > 0
                      ? `تابع أمر تفصيل (${String(pageIndex + 1)}/${String(totalPages)})`
                      : "أمر تفصيل / ط خ"}
                  </b>
                  <Ltr>{order.id}</Ltr>
                </div>
                <div className="paper-dates">
                  <span>
                    التاريخ: <b>{order.created}</b>
                  </span>
                  <span>
                    الموافق: <b>{order.hijriDate ?? "٢٩ / ٠٣ / ١٤٤٨ هـ"}</b>
                  </span>
                </div>
              </header>

              {/* Customer Strip */}
              <section className="paper-customer">
                <span>
                  اسم العميل: <b>{order.customer}</b>
                </span>
                <span>
                  هاتف: <Ltr>{order.phone}</Ltr>
                </span>
                <span>
                  تاريخ التسليم: <b>{order.delivery}</b>
                </span>
              </section>

              {/* Tables Side-by-Side */}
              <div className="paper-tables">
                <SideTable
                  lines={pageLines}
                  editable={editable}
                  invalidCells={invalidCells}
                  update={update}
                  mode={mode}
                />
                <ProductTable
                  lines={pageLines}
                  editable={editable}
                  invalidCells={invalidCells}
                  update={update}
                  hideFinancials={hideFinancials}
                  mode={mode}
                  onDuplicatePiece={onDuplicatePiece}
                  onDeletePiece={onDeletePiece}
                />
              </div>

              {/* Lower Area (Shown on all pages or summary on final page) */}
              <section className="paper-lower">
                {/* Side Lower: Size, A, F, Notes */}
                <div className="paper-side-lower">
                  <table className="paper-size-table">
                    <tbody>
                      <tr>
                        <th>المقاس</th>
                        <th>A</th>
                        <th>F</th>
                      </tr>
                      <tr>
                        {(
                          ["size", "aField", "fField"] as (keyof ProductLine)[]
                        ).map((key) => (
                          <td key={key}>
                            {editable ? (
                              <input
                                aria-label={
                                  key === "size"
                                    ? "المقاس"
                                    : key.charAt(0).toUpperCase()
                                }
                                list={key === "size" ? "dl-size" : undefined}
                                value={paperCellText(first[key])}
                                onChange={(event) => {
                                  changeFirst(key, event.target.value);
                                }}
                              />
                            ) : (
                              paperCellText(first[key]) || "—"
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>

                  <label className="paper-notes">
                    <b>ملاحظات</b>
                    {editable ? (
                      <textarea
                        aria-label="الملاحظات الجانبية"
                        value={first.sideNotes ?? ""}
                        onChange={(event) => {
                          changeFirst("sideNotes", event.target.value);
                        }}
                      />
                    ) : (
                      <span>{first.sideNotes || " "}</span>
                    )}
                  </label>
                </div>

                {/* Main Lower: Signatures, General Notes, Finance, Code Strip, Code Groups */}
                <div className="paper-main-lower">
                  <div className="paper-signature">
                    <span>توقيع المسؤول</span>
                    {editable ? (
                      <input
                        name="responsibleSignature"
                        aria-label="توقيع المسؤول"
                        defaultValue={order.responsibleSignature}
                      />
                    ) : (
                      <i>{order.responsibleSignature || "ريم خالد"}</i>
                    )}
                  </div>

                  <div className="paper-general-notes">
                    <b>ملاحظات</b>
                    {editable ? (
                      <textarea
                        name="generalNotes"
                        aria-label="الملاحظات العامة"
                        defaultValue={order.generalNotes}
                      />
                    ) : (
                      <span>
                        {order.generalNotes || "مطابقة العينة المعتمدة"}
                      </span>
                    )}
                  </div>

                  {hideFinancials ? (
                    <div className="paper-finance flex items-center justify-center rounded border border-slate-200 bg-slate-100/70 p-2 text-center text-xs font-medium text-slate-500">
                      <span>البيانات المالية محجوبة عن أقسام المصنع</span>
                    </div>
                  ) : (
                    <div className="paper-finance">
                      {(
                        [
                          ["الإجمالي", "total"],
                          ["المدفوع", "paid"],
                          ["الباقي", "balance"],
                        ] as const
                      ).map(([label, key]) => (
                        <span className="paper-finance-row" key={key}>
                          <span>{label}</span>
                          {editable ? (
                            <input
                              name={key}
                              type="number"
                              aria-label={`${label} الاختياري`}
                              defaultValue={order[key]}
                            />
                          ) : (
                            <b>{order[key] || "—"}</b>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Top 5 Box Strip (T, K, S, H, X) */}
                  <div className="paper-code-strip">
                    {TOP_5_BOXES.map((box) => {
                      const isSelected = activeBoxes.includes(box.code);
                      return (
                        <span
                          key={box.code}
                          className={`${editable ? "selectable" : ""} ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            toggleBox(box.code);
                          }}
                          title={
                            editable
                              ? `انقر لتحديد أو إلغاء تحديد ${box.label} (${box.code})`
                              : box.label
                          }
                        >
                          <small>{box.label}</small>
                          <b>{box.code}</b>
                        </span>
                      );
                    })}
                  </div>

                  {/* Bottom 12 Boxes (6 Pairs) */}
                  <div className="paper-code-groups">
                    {BOTTOM_12_BOX_PAIRS.map(([boxA, boxB], index) => {
                      const isSelectedA = activeBoxes.includes(boxA.code);
                      const isSelectedB = activeBoxes.includes(boxB.code);
                      return (
                        <span key={index}>
                          <b
                            className={`${editable ? "selectable" : ""} ${isSelectedA ? "selected" : ""}`}
                            onClick={() => {
                              toggleBox(boxA.code);
                            }}
                            title={
                              editable
                                ? `انقر لتحديد ${boxA.label} (${boxA.code})`
                                : boxA.label
                            }
                          >
                            {boxA.code}
                          </b>
                          <b
                            className={`${editable ? "selectable" : ""} ${isSelectedB ? "selected" : ""}`}
                            onClick={() => {
                              toggleBox(boxB.code);
                            }}
                            title={
                              editable
                                ? `انقر لتحديد ${boxB.label} (${boxB.code})`
                                : boxB.label
                            }
                          >
                            {boxB.code}
                          </b>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Footer */}
              <footer>
                المركز الرئيسي: جدة — المملكة العربية السعودية · Head Office:
                Jeddah · E-Mail: orientalshoe_est@hotmail.com
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
