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
  return (
    <section
      aria-label="موقف وتتبع قطع الطلب"
      className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5"
    >
      <h3 className="flex items-center gap-2 border-b border-slate-200 py-3.5 text-sm font-bold text-slate-900">
        موقف وتتبع قطع الطلب
        <span className="text-xs font-medium text-slate-600">
          ({counts.original})
        </span>
      </h3>
      <ul className="list-none divide-y divide-slate-100 p-0">
        {pieces.map((piece) => (
          <TrackingPieceRow
            key={piece.pieceId}
            piece={piece}
            orderStatus={orderStatus}
          />
        ))}
      </ul>
    </section>
  );
}

function TrackingPieceRow({
  piece,
  orderStatus,
}: {
  piece: OrderTrackingPiece;
  orderStatus: AuthoritativeOrderTracking["orderStatus"];
}) {
  const { location, state, tone } = custodyLocation(piece, orderStatus);
  return (
    <li className="space-y-2 py-3.5 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <h4 className="font-bold text-slate-900">{piece.label}</h4>
          <strong className="font-semibold text-slate-800">
            <bdi>{piece.model?.trim() || "موديل غير مسجل"}</bdi>
          </strong>
          {piece.size?.trim() ? (
            <span className="text-xs text-slate-600">
              مقاس <bdi>{piece.size}</bdi>
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${statusDots[tone]}`}
            />
            <span>{location}</span>
          </div>
          {state ? <span className="text-slate-600">{state}</span> : null}
        </div>
      </div>

      <TrackingPieceSpecifications piece={piece} />
      {piece.sideNotes?.trim() ? (
        <p className="text-xs leading-relaxed text-slate-700">
          <span className="me-2 font-medium text-slate-600">
            ملاحظات القطعة
          </span>
          <bdi className="whitespace-pre-line">{piece.sideNotes}</bdi>
        </p>
      ) : null}
      <TrackingPieceRecordedEvent piece={piece} />
    </li>
  );
}

function TrackingPieceSpecifications({ piece }: { piece: OrderTrackingPiece }) {
  const filledSpecifications = specifications.filter(([key]) =>
    piece[key]?.trim(),
  );
  if (filledSpecifications.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs leading-relaxed sm:flex sm:flex-wrap sm:gap-x-5">
      {filledSpecifications.map(([key, label]) => (
        <div key={key} className="min-w-0">
          <dt className="me-2 inline text-slate-600">{label}</dt>
          <dd className="inline font-medium text-slate-800">
            <bdi>{piece[key]}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TrackingPieceRecordedEvent({ piece }: { piece: OrderTrackingPiece }) {
  if (piece.cancelledAt !== null)
    return (
      <div className="space-y-1 text-xs leading-relaxed text-slate-600">
        <p>
          <span className="me-2 font-medium text-slate-700">وقت الإلغاء</span>
          <time dateTime={piece.cancelledAt}>
            {trackingTime.format(new Date(piece.cancelledAt))}
          </time>
        </p>
        {piece.cancellationReason ? (
          <p>
            <span className="me-2 font-medium text-slate-700">سبب الإلغاء</span>
            <bdi className="whitespace-pre-line">
              {piece.cancellationReason}
            </bdi>
          </p>
        ) : null}
      </div>
    );
  if (piece.receivedAt === null) return null;
  return (
    <p className="text-xs leading-relaxed text-slate-600">
      <span className="me-2 font-medium text-slate-700">
        وقت استلام المستودع
      </span>
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
