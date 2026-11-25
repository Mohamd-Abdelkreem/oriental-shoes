"use client";

import type { FactoryOrderPaperData } from "@template/contracts";
import { Wrench } from "lucide-react";
import { toSubmittedPaperLine } from "../model/submitted-paper-line";
import { formatPieceSequence } from "../paper/paper-options";
import { OrderPaperForm } from "./order-paper-form-screen";

export function FactoryOrderPaper({ data }: { data: FactoryOrderPaperData }) {
  const { order } = data;
  return (
    <OrderPaperForm
      order={{
        id: order.id,
        type: order.type,
        customer: order.customerName,
        phone: "",
        created: order.createdAt,
        delivery: order.deliveryDate ?? "",
        items: order.pieces.map(toSubmittedPaperLine),
        generalNotes: order.generalNotes ?? "",
        adjustmentRequested: order.adjustmentRequested ?? "",
        adjustmentReason: order.adjustmentReason ?? "",
        adjustmentActionTaken: order.adjustmentActionTaken ?? "",
      }}
      displayReference={order.businessNumber}
      audience="factory"
      showInteractionHint={false}
    />
  );
}

export function FactoryWorkInstructions({
  data,
}: {
  data: FactoryOrderPaperData;
}) {
  const pieceLabels = new Map(
    data.order.pieces.map((piece, index) => [
      piece.id,
      formatPieceSequence(index),
    ]),
  );
  return (
    <>
      {data.order.repairNote && (
        <section className="rounded-xl border border-s-4 border-rose-200/90 border-s-rose-500 bg-rose-50/65 px-4 py-3 text-xs shadow-2xs">
          <h3 className="mb-1 flex items-center gap-2 text-[13px] font-bold text-rose-950">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700">
              <Wrench size={12} aria-hidden="true" />
            </span>
            <span>ملاحظات الإصلاح</span>
          </h3>
          <p className="ps-7 text-[13px] leading-5 font-semibold whitespace-pre-wrap text-slate-800">
            {data.order.repairNote}
          </p>
        </section>
      )}
      {data.issues.map((issue) => {
        const resolved = issue.state === "RESOLVED";
        return (
          <div
            role="status"
            key={issue.issueId}
            className={`overflow-hidden rounded-xl border text-xs shadow-2xs ${
              resolved
                ? "border-slate-200/90 bg-white"
                : "border-amber-200/90 bg-amber-50/45"
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2 ${
                resolved
                  ? "border-slate-200/80 bg-slate-50/70"
                  : "border-amber-200/70 bg-amber-50/80"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-bold text-slate-900">
                  {pieceLabels.get(issue.pieceId)}
                </strong>
                <p
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    resolved
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-300 bg-amber-100/80 text-amber-950"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 rounded-full ${
                      resolved ? "bg-emerald-600" : "bg-amber-600"
                    }`}
                  />
                  {resolved
                    ? "مشكلة سابقة تم حسمها"
                    : "القطعة موقوفة للمراجعة — انتظر القرار المعتمد"}
                </p>
              </div>
            </div>
            <div
              className={`grid gap-2.5 p-3 ${
                issue.approvedInstructions ? "md:grid-cols-2" : ""
              }`}
            >
              <div
                className={`min-w-0 space-y-1 rounded-lg border px-3 py-2 ${
                  resolved
                    ? "border-slate-200/80 bg-slate-50/60"
                    : "border-amber-200/80 bg-white/80"
                }`}
              >
                <p className="flex items-start gap-2 leading-5 font-semibold wrap-anywhere whitespace-pre-wrap text-slate-800">
                  <span
                    aria-hidden="true"
                    className={`mt-2 size-1.5 shrink-0 rounded-full ${
                      resolved ? "bg-slate-400" : "bg-amber-500"
                    }`}
                  />
                  <span>{issue.reason}</span>
                </p>
                {issue.reportNotes && (
                  <p className="ps-3.5 leading-5 wrap-anywhere whitespace-pre-wrap text-slate-600">
                    {issue.reportNotes}
                  </p>
                )}
              </div>
              {issue.approvedInstructions && (
                <div className="min-w-0 rounded-lg border border-teal-200/90 bg-teal-50/60 px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-1.5 leading-5 text-teal-950">
                    <span className="font-bold text-teal-900">
                      التعليمات المعتمدة:
                    </span>{" "}
                    <span className="font-semibold wrap-anywhere whitespace-pre-wrap">
                      {issue.approvedInstructions}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
