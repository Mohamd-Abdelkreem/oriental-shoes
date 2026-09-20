"use client";

import { Boxes, X } from "lucide-react";
import {
  formatPieceSequence,
  type MvpOrder,
  type ProductLine,
  type Role,
} from "@/features/prototype/state/mvp-store";
import {
  statusTone,
  OrientalStatusPill,
} from "@/features/prototype/components/data-table";
import { PieceLocationBadge } from "./piece-location-badge";

export function OrderAllPiecesModal({
  order,
  onClose,
  onReportProblem,
}: {
  order: MvpOrder;
  onClose: () => void;
  deptRole?: Role | undefined;
  onReportProblem?: (piece: ProductLine) => void;
}) {
  const activePieces = order.items.filter((p) => !p.isDeleted);
  const inWh = activePieces.filter(
    (p) =>
      p.currentLocation === "في المستودع" || p.currentLocation === "تم التسليم",
  ).length;
  const inProblems = activePieces.filter(
    (p) =>
      p.currentLocation === "لدى الاعتماد بسبب مشكلة" ||
      p.deptStatus === "بها مشكلة",
  ).length;
  const inMfg = Math.max(0, activePieces.length - inWh - inProblems);

  return (
    <div className="oriental-modal-backdrop" onClick={onClose}>
      <div
        className="oriental-modal-container max-w-4xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-800">
              <Boxes size={20} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                جميع قطع أمر التفصيل:{" "}
                <span className="font-mono text-teal-800">{order.id}</span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                العميل: <strong>{order.customer || order.customerName}</strong>{" "}
                · موعد التسليم:{" "}
                <strong>{order.deliveryDate || order.delivery}</strong> · إجمالي
                القطع: <strong>{activePieces.length} قطع</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Metric summary banner */}
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="block text-[11px] text-slate-500">
              إجمالي قطع الأمر
            </span>
            <strong className="text-sm font-bold text-slate-900">
              {activePieces.length} قطع
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="block text-[11px] text-slate-500">
              قيد التصنيع بالمصنع
            </span>
            <strong className="text-sm font-bold text-teal-900">
              {inMfg} قطع
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="block text-[11px] text-slate-500">
              اكتملت بالمستودع
            </span>
            <strong className="text-sm font-bold text-emerald-900">
              {inWh} قطع
            </strong>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="block text-[11px] text-slate-500">
              بها مشكلة (لدى الاعتماد)
            </span>
            <strong
              className={
                inProblems > 0
                  ? "text-sm font-bold text-rose-700"
                  : "text-sm text-slate-400"
              }
            >
              {inProblems} قطع
            </strong>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-x-auto p-4">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/60 font-semibold text-slate-500">
                <th className="p-2.5">رقم القطعة</th>
                <th className="p-2.5">الموديل والمقاس</th>
                <th className="p-2.5">المواصفات الفنية</th>
                <th className="p-2.5">مكان القطعة الآن</th>
                <th className="p-2.5">حالة التشغيل بالقسم</th>
                <th className="p-2.5">الموظف المسؤول</th>
                <th className="p-2.5 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activePieces.map((p, idx) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="p-2.5">
                    <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-900">
                      {p.pieceNumber || formatPieceSequence(idx)}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <strong className="block font-mono text-slate-800">
                      {p.model}
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      مقاس {p.size}
                    </span>
                  </td>
                  <td className="max-w-[200px] p-2.5 text-[11px] text-slate-600">
                    <div>الأساس: {p.leatherBase || "طبيعي"}</div>
                    <div>
                      الوجه: {p.faceRight || p.face || "سادة"} · النعل:{" "}
                      {p.sole || "ربل"}
                    </div>
                  </td>
                  <td className="p-2.5">
                    <PieceLocationBadge location={p.currentLocation} />
                  </td>
                  <td className="p-2.5">
                    <OrientalStatusPill
                      tone={statusTone(p.deptStatus || "جاهزة للعمل")}
                    >
                      {p.deptStatus || "جاهزة للعمل"}
                    </OrientalStatusPill>
                    {p.problem && (
                      <div className="mt-1 rounded border border-rose-200 bg-rose-50 p-1 text-[10px] text-rose-700">
                        <strong>مشكلة:</strong> {p.problem.reason}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5 text-[11px] text-slate-600">
                    {p.responsibleWorker || "—"}
                  </td>
                  <td className="p-2.5 text-center">
                    {p.currentLocation !== "لدى الاعتماد بسبب مشكلة" &&
                      p.currentLocation !== "في المستودع" &&
                      p.currentLocation !== "تم التسليم" &&
                      onReportProblem && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onReportProblem(p);
                          }}
                          className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-100 hover:text-rose-900"
                        >
                          تسجيل مشكلة
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="oriental-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn-pill btn-secondary text-xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
