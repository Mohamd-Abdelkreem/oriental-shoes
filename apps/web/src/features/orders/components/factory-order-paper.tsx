"use client";
import type { FactoryOrderPaperData } from "@template/contracts";
import { getPaperFormTitle } from "../order-types";
import { OrientalBrandHeader } from "./oriental-brand-header";
import { toFactoryPaperLines } from "@/features/manufacturing/model/manufacturing-view.model";
import { ProductTable } from "./product-table";
import { SideTable } from "./side-table";
import { PaperSizeTable } from "./paper-size-table";
import { AdjustmentPaperFields } from "./adjustment-paper-fields";

const noEdit = () => {};
export function FactoryOrderPaper({ data }: { data: FactoryOrderPaperData }) {
  const { order } = data,
    lines = toFactoryPaperLines(data),
    invalidCells = new Set<string>();
  return (
    <div className="overflow-x-auto">
      <section className="order-paper" aria-label="مواصفات أمر التفصيل للمصنع">
        <header className="paper-header">
          <OrientalBrandHeader />
          <div className="paper-sub-header">
            <div className="paper-sub-header-spacer" aria-hidden="true" />
            <div className="paper-title">
              <b>{getPaperFormTitle(order.type)}</b>
              <span dir="ltr">{order.businessNumber}</span>
            </div>
            <div className="paper-sub-header-spacer" aria-hidden="true" />
          </div>
        </header>
        <section className="paper-customer">
          <span>
            اسم العميل: <b>{order.customerName}</b>
          </span>
          <span>
            تاريخ التسليم: <b>{order.deliveryDate ?? "غير محدد"}</b>
          </span>
        </section>
        <div className="paper-tables">
          <SideTable
            lines={lines}
            editable={false}
            mode="readOnly"
            invalidCells={invalidCells}
            update={noEdit}
          />
          <ProductTable
            lines={lines}
            editable={false}
            mode="readOnly"
            invalidCells={invalidCells}
            update={noEdit}
            hideFinancials
          />
        </div>
        {lines.map((line) => (
          <section className="paper-lower" key={line.id}>
            <div className="paper-side-lower">
              <strong>{line.pieceNumber}</strong>
              <PaperSizeTable line={line} editable={false} onChange={noEdit} />
              <div className="paper-notes">
                <b>ملاحظات</b>
                <span>{line.sideNotes ?? "—"}</span>
              </div>
            </div>
            <div className="paper-main-lower">
              {order.generalNotes && <p>ملاحظات عامة: {order.generalNotes}</p>}
              {order.repairNote && <p>ملاحظات الإصلاح: {order.repairNote}</p>}
            </div>
          </section>
        ))}
        {(order.type === "ADJUSTMENT" ||
          order.adjustmentRequested ||
          order.adjustmentReason ||
          order.adjustmentActionTaken) && (
          <AdjustmentPaperFields
            mode="readOnly"
            fields={{
              adjustmentRequested: order.adjustmentRequested ?? "",
              adjustmentReason: order.adjustmentReason ?? "",
              adjustmentActionTaken: order.adjustmentActionTaken ?? "",
            }}
          />
        )}
        {data.issues.map((issue) => (
          <div
            key={issue.pieceId}
            className="rounded-xl border border-amber-200 p-3"
          >
            <strong>تعليمات القطعة: {issue.pieceId}</strong>
            <p>{issue.reason}</p>
            {issue.reportNotes && <p>{issue.reportNotes}</p>}
            {issue.approvedInstructions && <p>{issue.approvedInstructions}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
