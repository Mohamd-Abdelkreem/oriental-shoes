"use client";
import type { QualityRailProjection } from "@/features/manufacturing/model/quality-view.model";
import type { ManufacturingRailProjection } from "@/features/manufacturing/model/manufacturing-view.model";

import React from "react";
import {
  Check,
  Clock,
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import {
  stageQuantity,
  type MvpOrder,
  type Stage,
} from "@/features/prototype/state/mvp-store";

type RailProps = {
  order: MvpOrder;
  currentRoleStage?: Stage | undefined;
};

const STAGES: { stage: Stage; label: string; isFactory: boolean }[] = [
  { stage: "القص", label: "القص", isFactory: true },
  { stage: "الإنتاج والإصلاح", label: "الإنتاج والإصلاح", isFactory: true },
  { stage: "الجودة والتغليف", label: "الجودة والتغليف", isFactory: true },
  { stage: "المستودع", label: "المستودع", isFactory: false },
];

function LegacyManufacturingRail({ order, currentRoleStage }: RailProps) {
  const isRepair = order.type === "REPAIR";

  return (
    <div className="oriental-rail-wrapper mb-6 box-border w-full rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="oriental-rail-header mb-5 flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <span className="oriental-rail-title text-sm font-bold text-slate-900">
          مسار التصنيع وتوزيع الكميات
        </span>
        <span className="oriental-rail-note text-xs font-medium text-slate-500">
          {isRepair
            ? "طلب إصلاح: يتجاوز مرحلة القص تلقائياً ويتوجه مباشرة إلى الإنتاج"
            : "مسار تفصيل قياسي: يمر بجميع المراحل وصولاً للمستودع والتسليم"}
        </span>
      </div>

      <div className="oriental-rail-track relative flex items-start justify-between gap-2 overflow-x-auto pt-1 pb-2">
        {/* Step 0: Approval */}
        <div
          className={`oriental-rail-node node-approval relative z-10 flex min-w-[95px] flex-1 flex-col items-center text-center ${order.status !== "بانتظار الاعتماد" && order.status !== "مسودة" ? "state-done" : "state-current"}`}
        >
          <div className="rail-node-marker mb-2 flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-all">
            {order.status !== "بانتظار الاعتماد" && order.status !== "مسودة" ? (
              <Check size={14} />
            ) : (
              <Clock size={14} />
            )}
          </div>
          <div className="rail-node-info flex flex-col gap-0.5">
            <strong className="rail-node-name text-xs font-bold text-slate-800">
              الاعتماد
            </strong>
            <span className="rail-node-status text-[11px] text-slate-500">
              {order.status === "مسودة"
                ? "مسودة"
                : order.status === "بانتظار الاعتماد"
                  ? "بانتظار المراجعة"
                  : "معتمد"}
            </span>
          </div>
        </div>

        <div className="oriental-rail-connector z-0 mt-[18px] h-[2px] min-w-[20px] flex-1 self-start bg-slate-200" />

        {/* Factory Stages */}
        {STAGES.map((s, idx) => {
          const qty = stageQuantity(order, s.stage);
          const isSkipped = isRepair && s.stage === "القص";
          const isCurrentHighlight = currentRoleStage === s.stage;

          const segmentsInStage = order.segments.filter(
            (seg) => seg.stage === s.stage,
          );
          const hasReturned = segmentsInStage.some((seg) =>
            seg.state.includes("معاد"),
          );
          const isComplete =
            qty === 0 &&
            !isSkipped &&
            order.segments.some((seg) => {
              const nextIdx = STAGES.findIndex((st) => st.stage === seg.stage);
              return nextIdx > idx;
            });

          let stateClass = "state-pending";
          if (isSkipped) stateClass = "state-skipped";
          else if (hasReturned) stateClass = "state-returned";
          else if (qty > 0) stateClass = "state-current";
          else if (isComplete) stateClass = "state-done";

          return (
            <React.Fragment key={s.stage}>
              <div
                className={`oriental-rail-node relative z-10 flex min-w-[95px] flex-1 flex-col items-center text-center ${stateClass} ${isCurrentHighlight ? "node-active-role" : ""}`}
                title={
                  isSkipped
                    ? "يتجاوزها طلب الإصلاح"
                    : `${s.label}: ${String(qty)} قطعة حالياً`
                }
              >
                <div className="rail-node-marker mb-2 flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-all">
                  {isSkipped ? (
                    "—"
                  ) : hasReturned ? (
                    <RotateCcw size={14} />
                  ) : isComplete ? (
                    <Check size={14} />
                  ) : qty > 0 ? (
                    qty
                  ) : (
                    "•"
                  )}
                </div>

                <div className="rail-node-info flex flex-col gap-0.5">
                  <strong className="rail-node-name text-xs font-bold text-slate-800">
                    {s.label}
                  </strong>
                  <span className="rail-node-status text-[11px] text-slate-500">
                    {isSkipped ? (
                      <em className="text-slate-400 not-italic">يتجاوزها</em>
                    ) : hasReturned ? (
                      <span className="font-medium text-amber-600">
                        معاد للتصحيح ({qty})
                      </span>
                    ) : qty > 0 ? (
                      <span className="font-bold text-teal-600">
                        {qty} قطعة حالياً
                      </span>
                    ) : isComplete ? (
                      <span className="text-slate-500">اكتملت</span>
                    ) : (
                      "لم تبدأ"
                    )}
                  </span>
                </div>
              </div>

              {idx < STAGES.length - 1 && (
                <div
                  className={`oriental-rail-connector z-0 mt-[18px] h-[2px] min-w-[20px] flex-1 self-start bg-slate-200 ${isComplete ? "connector-done" : ""}`}
                />
              )}
            </React.Fragment>
          );
        })}

        <div className="oriental-rail-connector z-0 mt-[18px] h-[2px] min-w-[20px] flex-1 self-start bg-slate-200" />

        {/* Final Step: Delivery */}
        <div
          className={`oriental-rail-node node-delivery relative z-10 flex min-w-[95px] flex-1 flex-col items-center text-center ${order.status === "تم الاستلام" ? "state-done" : order.status === "خرج مع المندوب" ? "state-current" : order.status === "تعذر التسليم" ? "state-returned" : "state-pending"}`}
        >
          <div className="rail-node-marker mb-2 flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-all">
            {order.status === "تم الاستلام" ? (
              <Check size={14} />
            ) : order.status === "تعذر التسليم" ? (
              <AlertTriangle size={14} />
            ) : (
              <ArrowLeft size={14} />
            )}
          </div>
          <div className="rail-node-info flex flex-col gap-0.5">
            <strong className="rail-node-name text-xs font-bold text-slate-800">
              التسليم للعميل
            </strong>
            <span className="rail-node-status text-[11px] text-slate-500">
              {order.status === "تم الاستلام"
                ? "تم الاستلام"
                : order.status === "خرج مع المندوب"
                  ? "مع المندوب"
                  : order.status === "تعذر التسليم"
                    ? "تعذر التسليم"
                    : order.status === "جاهز للتسليم"
                      ? "جاهز للتسليم"
                      : "بعد اكتمال ١٠٠٪"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ManufacturingRail(
  props:
    | (RailProps & { projection?: never })
    | {
        projection: ManufacturingRailProjection | QualityRailProjection;
        order?: never;
      },
) {
  if (props.projection)
    return <PersistedManufacturingRail projection={props.projection} />;
  return <LegacyManufacturingRail {...props} />;
}
function PersistedManufacturingRail({
  projection,
}: {
  projection: ManufacturingRailProjection | QualityRailProjection;
}) {
  const stages = [
    { id: "AWAITING_APPROVAL", label: "الاعتماد" },
    { id: "CUTTING", label: "القص" },
    { id: "PRODUCTION", label: "الإنتاج والإصلاح" },
    { id: "QUALITY", label: "الجودة والتغليف" },
    { id: "WAREHOUSE", label: "المستودع" },
  ] as const;
  return (
    <section
      aria-label="مسار التصنيع وتوزيع الكميات"
      className="w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-2xs sm:px-4"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <strong className="text-xs font-bold text-slate-900">
          مسار التصنيع وتوزيع الكميات
        </strong>
        {projection.isReturned && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
            <AlertTriangle
              size={12}
              aria-hidden="true"
              className="shrink-0 text-amber-600"
            />
            توجد قطع معادة أو موقوفة؛ راجع تعليمات القسم.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-1.5">
        {stages.map((stage, index) => {
          const isCurrent = projection.currentDepartment === stage.id;
          const count = projection.countsByStage[stage.id];
          return (
            <React.Fragment key={stage.id}>
              <div
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                  isCurrent
                    ? "border-teal-500/80 bg-teal-50/75 text-teal-950"
                    : count > 0
                      ? "border-slate-300/90 bg-slate-50/80 text-slate-800"
                      : "border-slate-200/70 bg-slate-50/35 text-slate-500"
                }`}
              >
                <div
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    isCurrent
                      ? "bg-teal-600 text-white"
                      : count > 0
                        ? "bg-slate-200/90 text-slate-700"
                        : "bg-slate-200/60 text-slate-400"
                  }`}
                >
                  <Clock size={12} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-[11.5px] font-bold">
                    {stage.label}
                  </strong>
                  <span
                    className={`block text-[10.5px] ${
                      isCurrent
                        ? "font-bold text-teal-800"
                        : count > 0
                          ? "font-semibold text-slate-700"
                          : "text-slate-400"
                    }`}
                  >
                    {count} قطعة حالياً
                  </span>
                </div>
              </div>
              {index < stages.length - 1 && (
                <ArrowLeft
                  size={12}
                  aria-hidden="true"
                  className="hidden shrink-0 text-slate-300 sm:block"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
