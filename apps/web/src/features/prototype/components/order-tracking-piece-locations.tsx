"use client";

import { Boxes, AlertTriangle } from "lucide-react";
import {
  type MvpOrder,
  formatProductCount,
  formatPieceSequence,
} from "@/features/prototype/state/mvp-store";

export function OrderTrackingPieceLocations({ order }: { order: MvpOrder }) {
  const activePieces = order.items.filter((piece) => !piece.isDeleted);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Boxes size={15} className="text-teal-700" />
          <h3 className="text-xs font-bold text-slate-800">
            موقف وتتبع قطع الطلب ({formatProductCount(activePieces.length)})
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">
          الموقع الفعلي وحالة كل قطعة
        </span>
      </div>

      {activePieces.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          لا توجد قطع نشطة مسجلة في هذا الطلب حالياً
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {activePieces.map((piece, pieceIndex) => {
            const pieceLabel =
              piece.pieceNumber || formatPieceSequence(pieceIndex);
            const location = piece.currentLocation || "لم يبدأ التصنيع";
            const deptStatus = piece.deptStatus || "بانتظار العمل";
            const worker = piece.responsibleWorker;

            return (
              <div
                key={piece.id}
                className="flex flex-col justify-between gap-2.5 px-1 py-2.5 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                    {pieceLabel}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <strong className="font-bold text-slate-900">
                      {piece.model ? `موديل ${piece.model}` : "موديل شرقي"}
                    </strong>
                    <span className="font-semibold text-slate-500">
                      · مقاس {piece.size || "—"}
                    </span>
                    {piece.problem && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        <AlertTriangle size={11} />
                        <span>مشكلة: {piece.problem.reason}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="mr-auto flex items-center gap-2 text-xs sm:mr-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                    <span>{location}</span>
                  </span>

                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {deptStatus}
                  </span>

                  {worker && (
                    <span className="text-[11px] text-slate-400">
                      ({worker})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
