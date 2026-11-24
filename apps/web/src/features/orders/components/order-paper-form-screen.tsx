"use client";

import { calculateOrderTotals } from "@/features/orders/paper/order-totals";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Plus } from "lucide-react";
import { Ltr } from "@/features/prototype/components/shared-ui";
import type { ProductLine } from "@/features/prototype/state/mvp-store";
import type { OrderPaperFormProps } from "./order-paper-form-props";
import { isEditable } from "./is-editable";
import { blankLine } from "./blank-line";
import { SideTable } from "./side-table";
import { ProductTable } from "./product-table";
import { PaperFinance } from "./paper-finance";
import { getPaperFormTitle } from "../order-types";
import { OrientalBrandHeader } from "./oriental-brand-header";
import { PaperCodeChoices } from "./paper-code-choices";
import { canEditPieceField } from "./order-paper-form-props";
import { AdjustmentPaperFields } from "./adjustment-paper-fields";
import { PaperSizeTable } from "./paper-size-table";
import { getPrintablePaperLines } from "../paper/paper-print-lines";

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
  onGeneralNotesChange,
  onSignatureChange,
  onTotalsChange,
  onAdjustmentFieldsChange,
  dataState,
  pieceEdit,
  showCatalogUnavailableNotice = true,
  showInteractionHint = true,
  fieldErrorMessages,
  onFieldElement,
  onCatalogSelection,
  displayReference,
  approvalAnnotation,
  paidEdit,
}: OrderPaperFormProps) {
  const editable = isEditable(mode);
  const scopedEdit = mode === "readOnly" ? pieceEdit : undefined;
  const [zoom, setZoom] = useState(1);
  const [localBoxes, setLocalBoxes] = useState<string[]>(selectedBoxes);
  const paid = order.paid || "";

  const totals =
    dataState === undefined ? calculateOrderTotals(lines, paid) : undefined;

  const handlePaidChange = (newPaid: string) => {
    onTotalsChange?.(
      dataState === undefined
        ? calculateOrderTotals(lines, newPaid)
        : { total: undefined, paid: newPaid, balance: "" },
    );
  };

  const activeBoxes =
    scopedEdit !== undefined || onSelectedBoxesChange !== undefined
      ? selectedBoxes
      : localBoxes;

  const toggleBox = (code: string) => {
    const next = activeBoxes.includes(code)
      ? activeBoxes.filter((c) => c !== code)
      : [...activeBoxes, code];
    if (onSelectedBoxesChange === undefined) setLocalBoxes(next);
    else onSelectedBoxesChange(next);
  };

  const update = (index: number, key: keyof ProductLine, value: string) => {
    if (scopedEdit !== undefined) {
      if (
        lines[index]?.id === scopedEdit.pieceId &&
        canEditPieceField(scopedEdit, scopedEdit.pieceId, key)
      )
        scopedEdit.onTextChange?.(key, value);
      return;
    }
    if (
      dataState !== undefined &&
      (key === "unitPrice" || key === "rowTotal" || key === "quantity")
    )
      return;
    const updatedLines = lines.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const { unitPrice: _unitPrice, rowTotal: _rowTotal, ...unpriced } = line;
      const updated: ProductLine = {
        ...(dataState === undefined ||
        (dataState.kind === "authoritative" &&
          dataState.finance.kind === "submitted")
          ? line
          : unpriced),
        [key]: key === "quantity" ? 1 : value,
      };
      // Auto-calculate row total = unitPrice (since quantity is always 1)
      if (dataState === undefined && key === "unitPrice") {
        const uPrice = Number(value || 0);
        updated.rowTotal = uPrice > 0 ? String(uPrice) : "";
      }
      return updated;
    });

    onLinesChange?.(updatedLines);

    if (dataState === undefined && key === "unitPrice") {
      onTotalsChange?.(calculateOrderTotals(updatedLines, paid));
    }
  };

  const isPrint = mode === "print";
  const activeLines = isPrint ? getPrintablePaperLines(lines) : lines;

  const first = activeLines[0] ?? lines[0] ?? blankLine("paper-empty", 1);
  const measurementLine =
    activeLines.find((line) => line.id === scopedEdit?.pieceId) ?? first;
  const changeFirst = (key: keyof ProductLine, value: string) => {
    update(
      scopedEdit === undefined ? 0 : lines.indexOf(measurementLine),
      key,
      value,
    );
  };

  // If pieces > 8 and print mode, chunk into pages of 8 lines
  const piecesPerPage = 8;
  const totalPages =
    isPrint && activeLines.length > piecesPerPage
      ? Math.ceil(activeLines.length / piecesPerPage)
      : 1;

  return (
    <div className="paper-component-wrap">
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

      {mode !== "print" && showInteractionHint && (
        <div className="mb-2.5 flex items-center justify-between rounded-lg border border-teal-200/90 bg-teal-50/70 px-3.5 py-2 text-xs font-medium text-teal-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[11px] font-bold text-white">
              ⇄
            </span>
            <span>
              نموذج أمر التفصيل الموسّع — تم تكبير الخانات وإتاحة القوائم الذكية
              للبحث السريع والاختيار المرن. مرر أفقيًا لتصفح كامل النموذج.
            </span>
          </div>
          <span className="hidden items-center gap-1 rounded bg-teal-100/90 px-2 py-0.5 text-[11px] font-bold text-teal-800 md:inline-flex">
            انقر على أي خانة للبحث السريع والاختيار
          </span>
        </div>
      )}

      {dataState !== undefined &&
        (showCatalogUnavailableNotice ||
          (dataState.kind === "authoritative" &&
            dataState.catalogSourceId !== null)) &&
        !(
          dataState.kind === "authoritative" &&
          dataState.finance.kind === "submitted"
        ) && (
          <p className="mb-2 text-xs text-slate-500">
            {dataState.kind === "authoritative" &&
            dataState.catalogSourceId !== null
              ? "القيم الحالية للمراجعة؛ حفظ المسودة لا يقدم الطلب."
              : "القوائم لم تُفعّل بعد؛ القيم المدخلة مبدئية. التسعير والإرسال غير متاحين حالياً."}
          </p>
        )}
      <div className="paper-scroll-wrap">
        {Array.from({ length: totalPages }, (_, pageIndex) => {
          const pageLines =
            isPrint && totalPages > 1
              ? activeLines.slice(
                  pageIndex * piecesPerPage,
                  (pageIndex + 1) * piecesPerPage,
                )
              : activeLines;

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
                <OrientalBrandHeader />
                <div className="paper-sub-header">
                  <div className="paper-sub-header-spacer" aria-hidden="true" />
                  <div className="paper-title">
                    <b>
                      {pageIndex > 0
                        ? `تابع أمر تفصيل (${String(pageIndex + 1)}/${String(totalPages)})`
                        : getPaperFormTitle(order.type)}
                    </b>
                    <Ltr>{displayReference ?? order.id}</Ltr>
                  </div>
                  <div className="paper-dates">
                    <span>
                      التاريخ: <b>{order.created}</b>
                    </span>
                    <span>
                      الموافق:{" "}
                      <b>
                        {order.hijriDate ??
                          (dataState === undefined ? "٢٩ / ٠٣ / ١٤٤٨ هـ" : "")}
                      </b>
                    </span>
                  </div>
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

              {order.type === "READY" && (
                <div className="paper-banner-strip">
                  <b>مدير الإنتاج /</b> يعتمد عمل الكمية الموضحة أدناه وحسب
                  المواصفات المحددة ويضاف إلى الفاترينا ( المعرض )
                </div>
              )}

              {/* Tables Side-by-Side */}
              <div className="paper-tables">
                <SideTable
                  lines={pageLines}
                  editable={editable}
                  pieceEdit={scopedEdit}
                  invalidCells={invalidCells}
                  update={update}
                  mode={mode}
                  dataState={dataState}
                  onCatalogSelection={onCatalogSelection}
                  fieldErrorMessages={fieldErrorMessages}
                  onFieldElement={onFieldElement}
                />
                <ProductTable
                  lines={pageLines}
                  editable={editable}
                  pieceEdit={scopedEdit}
                  invalidCells={invalidCells}
                  update={update}
                  hideFinancials={hideFinancials}
                  mode={mode}
                  dataState={dataState}
                  onCatalogSelection={onCatalogSelection}
                  fieldErrorMessages={fieldErrorMessages}
                  onFieldElement={onFieldElement}
                  onDuplicatePiece={onDuplicatePiece}
                  onDeletePiece={onDeletePiece}
                />
              </div>

              {order.type === "GIFT" && (
                <div className="paper-gift-strip">
                  <b>مسؤول المعمل:</b> يلزم عمل الكمية الموضحة أعلاه و حسب
                  المواصفات المحددة
                </div>
              )}

              {order.type === "ADJUSTMENT" && (
                <AdjustmentPaperFields
                  fields={order}
                  mode={mode}
                  onChange={onAdjustmentFieldsChange}
                />
              )}

              {/* Lower Area (Shown on all pages or summary on final page) */}
              <section className="paper-lower">
                {/* Side Lower: Size, A, F, Notes */}
                <div className="paper-side-lower">
                  <PaperSizeTable
                    line={measurementLine}
                    editable={editable}
                    pieceEdit={scopedEdit}
                    onChange={changeFirst}
                    dataState={dataState}
                    onCatalogSelection={onCatalogSelection}
                    fieldErrorMessages={fieldErrorMessages}
                    onFieldElement={onFieldElement}
                  />

                  <label className="paper-notes">
                    <b>ملاحظات</b>
                    {editable ||
                    canEditPieceField(
                      scopedEdit,
                      measurementLine.id,
                      "sideNotes",
                    ) ? (
                      <>
                        <textarea
                          aria-label="الملاحظات الجانبية"
                          aria-invalid={
                            fieldErrorMessages?.[
                              `${measurementLine.id}:sideNotes`
                            ] !== undefined
                          }
                          aria-describedby={
                            fieldErrorMessages?.[
                              `${measurementLine.id}:sideNotes`
                            ] === undefined
                              ? undefined
                              : `paper-error-${measurementLine.id}-sideNotes`
                          }
                          ref={(element) => {
                            onFieldElement?.(
                              measurementLine.id,
                              "sideNotes",
                              element,
                            );
                          }}
                          className="print:hidden"
                          value={measurementLine.sideNotes ?? ""}
                          onChange={(event) => {
                            changeFirst("sideNotes", event.target.value);
                          }}
                        />
                        {fieldErrorMessages?.[
                          `${measurementLine.id}:sideNotes`
                        ] !== undefined && (
                          <span
                            id={`paper-error-${measurementLine.id}-sideNotes`}
                            className="sr-only"
                          >
                            {
                              fieldErrorMessages[
                                `${measurementLine.id}:sideNotes`
                              ]
                            }
                          </span>
                        )}
                        <span className="hidden whitespace-pre-wrap print:block">
                          {measurementLine.sideNotes || " "}
                        </span>
                      </>
                    ) : (
                      <span>{measurementLine.sideNotes || " "}</span>
                    )}
                  </label>
                </div>

                {/* Main Lower: Signatures, General Notes, Finance, Code Strip, Code Groups */}
                <div className="paper-main-lower">
                  <div className="paper-signature">
                    <span>توقيع المسؤول</span>
                    {editable ? (
                      <>
                        <input
                          name="responsibleSignature"
                          aria-invalid={
                            fieldErrorMessages?.["responsibleSignature"] !==
                            undefined
                          }
                          aria-describedby={
                            fieldErrorMessages?.["responsibleSignature"] ===
                            undefined
                              ? undefined
                              : "paper-responsibleSignature-error"
                          }
                          aria-label="توقيع المسؤول"
                          className="print:hidden"
                          value={order.responsibleSignature ?? ""}
                          onChange={(event) => {
                            onSignatureChange?.(event.target.value);
                          }}
                        />
                        {fieldErrorMessages?.["responsibleSignature"] !==
                          undefined && (
                          <span
                            id="paper-responsibleSignature-error"
                            className="sr-only"
                          >
                            {fieldErrorMessages["responsibleSignature"]}
                          </span>
                        )}
                        <i className="hidden print:block">
                          {order.responsibleSignature ||
                            (dataState === undefined ? "ريم خالد" : "")}
                        </i>
                      </>
                    ) : (
                      <i>
                        {order.responsibleSignature ||
                          (dataState === undefined ? "ريم خالد" : "")}
                      </i>
                    )}
                    {approvalAnnotation !== undefined && (
                      <small className="paper-approval-annotation">
                        الاعتماد الأولي: {approvalAnnotation.initialActorName} ·{" "}
                        {approvalAnnotation.initialApprovedAt} · النسخة:{" "}
                        {approvalAnnotation.orderVersion} · تعديلات معتمدة:{" "}
                        {approvalAnnotation.approvedAmendmentCount}
                      </small>
                    )}
                  </div>

                  <div className="paper-general-notes">
                    <b>ملاحظات</b>
                    {editable ? (
                      <>
                        <textarea
                          name="generalNotes"
                          aria-invalid={
                            fieldErrorMessages?.["generalNotes"] !== undefined
                          }
                          aria-describedby={
                            fieldErrorMessages?.["generalNotes"] === undefined
                              ? undefined
                              : "paper-generalNotes-error"
                          }
                          aria-label="الملاحظات العامة"
                          className="print:hidden"
                          value={order.generalNotes ?? ""}
                          onChange={(event) => {
                            onGeneralNotesChange?.(event.target.value);
                          }}
                        />
                        {fieldErrorMessages?.["generalNotes"] !== undefined && (
                          <span
                            id="paper-generalNotes-error"
                            className="sr-only"
                          >
                            {fieldErrorMessages["generalNotes"]}
                          </span>
                        )}
                        <span className="hidden whitespace-pre-wrap print:block">
                          {order.generalNotes ||
                            (dataState === undefined
                              ? "مطابقة العينة المعتمدة"
                              : "")}
                        </span>
                      </>
                    ) : (
                      <span>
                        {order.generalNotes ||
                          (dataState === undefined
                            ? "مطابقة العينة المعتمدة"
                            : "")}
                      </span>
                    )}
                  </div>

                  <PaperFinance
                    paidEdit={paidEdit}
                    order={order}
                    totals={totals}
                    editable={editable}
                    hideFinancials={hideFinancials}
                    onPaidChange={handlePaidChange}
                    dataState={dataState}
                    fieldErrorMessages={fieldErrorMessages}
                  />

                  <PaperCodeChoices
                    target={
                      scopedEdit === undefined ? undefined : measurementLine
                    }
                    selected={activeBoxes}
                    onToggle={
                      editable ||
                      (scopedEdit !== undefined &&
                        onSelectedBoxesChange !== undefined)
                        ? toggleBox
                        : undefined
                    }
                  />
                  {scopedEdit === undefined &&
                    pageLines.some((line) => line.paperCodes?.length) && (
                      <ul className="col-span-full text-xs">
                        {pageLines
                          .filter((line) => line.paperCodes?.length)
                          .map((line) => (
                            <li key={line.id}>
                              <b>{line.pieceNumber}</b>{" "}
                              {line.paperCodes?.length ? (
                                <bdi>{line.paperCodes.join(" · ")}</bdi>
                              ) : null}
                            </li>
                          ))}
                      </ul>
                    )}
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
