import { Boxes } from "lucide-react";
import {
  type MvpOrder,
  formatProductCount,
  formatPieceSequence,
} from "@/features/prototype/state/mvp-store";

export function OrderTrackingPieceLocations({ order }: { order: MvpOrder }) {
  const activePieces = order.items.filter((piece) => !piece.isDeleted);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Boxes size={16} className="text-teal-700" />
            <span>موقف وتتبع قطع الطلب</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            الموقع التشغيلي الدقيق لكل قطعة في المصنع، وحالتها، والمسؤول عنها
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {formatProductCount(activePieces.length)}
        </span>
      </div>

      {activePieces.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          لا توجد قطع نشطة مسجلة في هذا الطلب حالياً
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {activePieces.map((piece, idx) => {
            const pieceNum = piece.pieceNumber || formatPieceSequence(idx);
            const loc = piece.currentLocation || "لم يبدأ التصنيع";
            const deptStatus = piece.deptStatus || "لم يبدأ";
            const worker = piece.responsibleWorker || "غير معين";

            return (
              <div
                key={piece.id || idx}
                className="flex flex-col justify-between gap-3 rounded-xl px-2.5 py-3 transition hover:bg-slate-50/70 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3 sm:items-center">
                  <span className="inline-flex shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 font-mono text-xs font-bold text-teal-900">
                    {pieceNum}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-xs font-bold text-slate-900">
                        {piece.model ? `موديل ${piece.model}` : "موديل شرقي"}
                      </strong>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
                        مقاس {piece.size || "—"}
                      </span>
                      {piece.specialOpRequired && (
                        <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                          عمليات خاصة
                        </span>
                      )}
                      {piece.problem && (
                        <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          ملاحظة جودة / مشكلة
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {piece.leatherBase && (
                        <span>
                          الجلد:{" "}
                          <strong className="text-slate-700">
                            {piece.leatherBase}
                          </strong>
                        </span>
                      )}
                      {piece.decoration && (
                        <span>
                          • التطعيم:{" "}
                          <strong className="text-slate-700">
                            {piece.decoration} ({piece.decorationColor || "—"})
                          </strong>
                        </span>
                      )}
                      {piece.sole && (
                        <span>
                          • الأرضية:{" "}
                          <strong className="text-slate-700">
                            {piece.sole} ({piece.soleColor || "—"})
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
                  <div className="text-left sm:text-right">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-100/80 px-3 py-0.5 text-xs font-bold text-teal-950">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                      <span>{loc}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      <span>{deptStatus}</span>
                      <span className="mx-1">•</span>
                      <span>{worker}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
