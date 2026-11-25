"use client";
import type { OrderTrackingPiece } from "@/features/orders/model/order-tracking-piece.model";
import type { AuthoritativeOrderTracking } from "@/features/sales/model/order-view.model";
import type { OrderTrackingProps } from "./order-tracking-view";

import { Boxes, AlertTriangle } from "lucide-react";
import {
  type MvpOrder,
  formatProductCount,
  formatPieceSequence,
} from "@/features/prototype/state/mvp-store";

const stages = {
  AWAITING_APPROVAL: "بانتظار الاعتماد",
  CUTTING: "القص",
  PRODUCTION: "الإنتاج والإصلاح",
  QUALITY: "الجودة والتغليف",
  WAREHOUSE: "المستودع",
  CANCELLED: "ملغاة",
} as const;
const states = {
  INCOMING: "بانتظار الاستلام",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل في المرحلة",
  BLOCKED: "متوقف",
} as const;
const stateTones = {
  INCOMING: "amber",
  IN_PROGRESS: "blue",
  COMPLETED: "emerald",
  BLOCKED: "rose",
} as const;
const statusDots = {
  slate: "bg-slate-400",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-600",
  rose: "bg-rose-500",
} as const;
const badgeTones = {
  slate: "border-slate-200 bg-slate-100/90 text-slate-800",
  amber: "border-amber-200/90 bg-amber-50/90 text-amber-900",
  blue: "border-blue-200/90 bg-blue-50/90 text-blue-900",
  emerald: "border-emerald-200/90 bg-emerald-50/90 text-emerald-900",
  rose: "border-rose-200/90 bg-rose-50/90 text-rose-900",
} as const;
const specifications = [
  ["leatherBase", "الأساس"],
  ["decoration", "التطعيم"],
  ["face", "الوجه"],
  ["sole", "الأرضية"],
] as const;
const trackingTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

export function OrderTrackingPieceLocations(props: OrderTrackingProps) {
  if (props.projection === undefined)
    return <LegacyLocations order={props.order} />;
  const { pieces, counts, orderStatus } = props.projection;
  const tableGridColumns =
    "md:grid-cols-[94px_minmax(84px,0.75fr)_64px_minmax(105px,1fr)_minmax(110px,1fr)_minmax(145px,1.35fr)_76px_minmax(185px,1.15fr)]";
  return (
    <section
      aria-label="موقف وتتبع قطع الطلب"
      className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Boxes
            size={16}
            aria-hidden="true"
            className="shrink-0 text-teal-700"
          />
          <span>موقف وتتبع قطع الطلب</span>
          <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800 ring-1 ring-teal-600/15 ring-inset">
            ({counts.original})
          </span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <div
          aria-hidden="true"
          className={`hidden border-b border-slate-200 bg-slate-50/90 text-[11.5px] font-bold text-slate-600 md:grid md:min-w-[870px] ${tableGridColumns}`}
        >
          <span className="px-3 py-2.5">القطعة</span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            الموديل
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5 text-center">
            المقاس
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            الأساس
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            التطعيم
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            الوجه
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            الأرضية
          </span>
          <span className="border-s border-slate-200/80 px-3 py-2.5">
            الموقف الحالي
          </span>
        </div>
        <ul className="m-0 list-none divide-y divide-slate-200/80 p-0 md:min-w-[870px]">
          {pieces.map((piece) => (
            <TrackingPieceRow
              key={piece.pieceId}
              piece={piece}
              orderStatus={orderStatus}
              tableGridColumns={tableGridColumns}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function TrackingPieceRow({
  piece,
  orderStatus,
  tableGridColumns,
}: {
  piece: OrderTrackingPiece;
  orderStatus: AuthoritativeOrderTracking["orderStatus"];
  tableGridColumns: string;
}) {
  const { location, state, tone } = custodyLocation(piece, orderStatus);
  const hasDetails =
    Boolean(piece.sideNotes?.trim()) ||
    piece.cancelledAt !== null ||
    piece.receivedAt !== null;
  return (
    <li
      className={`grid grid-cols-2 gap-x-3 gap-y-2 p-3.5 [overflow-wrap:anywhere] transition-colors md:gap-0 md:p-0 ${tableGridColumns} ${
        piece.stage === "CANCELLED"
          ? "bg-rose-50/35"
          : "odd:bg-white even:bg-slate-50/35 hover:bg-teal-50/30"
      }`}
    >
      <div className="flex items-center md:px-3 md:py-2.5">
        <h4 className="text-xs font-bold whitespace-nowrap text-slate-900">
          {piece.label}
        </h4>
      </div>

      <div className="flex items-center gap-1 md:border-s md:border-slate-100 md:px-3 md:py-2.5">
        <span className="text-[11px] text-slate-500 md:hidden">الموديل:</span>
        <strong className="text-xs font-bold text-slate-800">
          <bdi>{piece.model?.trim() || "موديل غير مسجل"}</bdi>
        </strong>
      </div>

      <div className="flex items-center gap-1 md:justify-center md:border-s md:border-slate-100 md:px-3 md:py-2.5">
        <span className="text-[11px] text-slate-500 md:hidden">المقاس:</span>
        {piece.size?.trim() ? (
          <bdi className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
            {piece.size}
          </bdi>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>

      {specifications.map(([key, label]) => {
        const value = piece[key]?.trim();
        return (
          <div
            key={key}
            className={`${value ? "flex" : "hidden md:flex"} items-center gap-1 md:border-s md:border-slate-100 md:px-3 md:py-2.5`}
          >
            {value ? (
              <>
                <span className="text-[11px] text-slate-500 md:hidden">
                  {label}:
                </span>
                <span className="text-xs font-medium text-slate-700">
                  <bdi>{value}</bdi>
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-300">—</span>
            )}
          </div>
        );
      })}

      <div className="col-span-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 md:col-span-1 md:border-s md:border-t-0 md:border-slate-100 md:px-3 md:py-2.5 md:pt-2.5">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold ${badgeTones[tone]}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${statusDots[tone]}`}
          />
          <span>{location}</span>
        </div>
        {state ? (
          <span className="text-[11px] font-medium text-slate-600">
            {state}
          </span>
        ) : null}
      </div>

      {hasDetails ? (
        <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200/80 pt-2 md:col-span-8 md:bg-slate-50/40 md:px-3 md:py-2">
          {piece.sideNotes?.trim() ? (
            <p className="inline-flex flex-wrap items-baseline gap-1.5 rounded-md border border-amber-200/70 bg-amber-50/60 px-2.5 py-0.5 text-xs leading-5 text-slate-700">
              <span className="text-[11px] font-semibold text-amber-900">
                ملاحظات القطعة
              </span>
              <bdi className="font-medium whitespace-pre-line text-slate-800">
                {piece.sideNotes}
              </bdi>
            </p>
          ) : null}
          <TrackingPieceRecordedEvent piece={piece} />
        </div>
      ) : null}
    </li>
  );
}

function TrackingPieceRecordedEvent({ piece }: { piece: OrderTrackingPiece }) {
  if (piece.cancelledAt !== null)
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] leading-5 text-rose-800">
        <p className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2.5 py-0.5">
          <span className="font-semibold text-rose-900">وقت الإلغاء</span>
          <time dateTime={piece.cancelledAt}>
            {trackingTime.format(new Date(piece.cancelledAt))}
          </time>
        </p>
        {piece.cancellationReason ? (
          <p className="inline-flex flex-wrap items-baseline gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-2.5 py-0.5">
            <span className="font-semibold text-rose-900">سبب الإلغاء</span>
            <bdi className="whitespace-pre-line">
              {piece.cancellationReason}
            </bdi>
          </p>
        ) : null}
      </div>
    );
  if (piece.receivedAt === null) return null;
  return (
    <p className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-2.5 py-0.5 text-[11.5px] leading-5 text-emerald-900">
      <span className="font-semibold">وقت استلام المستودع</span>
      <time dateTime={piece.receivedAt}>
        {trackingTime.format(new Date(piece.receivedAt))}
      </time>
    </p>
  );
}

function LegacyLocations({ order }: { order: MvpOrder }) {
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

function custodyLocation(
  piece: OrderTrackingPiece,
  orderStatus: AuthoritativeOrderTracking["orderStatus"],
): { location: string; state?: string; tone: keyof typeof statusDots } {
  if (piece.stage === "CANCELLED")
    return { location: stages.CANCELLED, tone: "rose" };
  if (piece.stage === "AWAITING_APPROVAL")
    return {
      location:
        orderStatus === "RETURNED"
          ? "معادة للمبيعات"
          : stages.AWAITING_APPROVAL,
      tone: "slate",
    };
  if (piece.receivedAt === null)
    return {
      location: stages[piece.stage],
      state: states[piece.workState],
      tone: stateTones[piece.workState],
    };
  switch (orderStatus) {
    case "OUT_FOR_DELIVERY":
      return { location: "مع المندوب", state: "خرج للتوصيل", tone: "blue" };
    case "DELIVERED":
      return {
        location: "لدى العميل",
        state: "تم تسليم الطلب بالكامل",
        tone: "emerald",
      };
    case "DELIVERY_FAILED":
      return {
        location: "المستودع",
        state: "عادت بالكامل — بانتظار إعادة التجهيز",
        tone: "rose",
      };
    case "READY_FOR_DELIVERY":
      return { location: "المستودع", state: "جاهزة للتوصيل", tone: "emerald" };
    default:
      return {
        location: "المستودع",
        state: "تم الاستلام الفعلي",
        tone: "emerald",
      };
  }
}
