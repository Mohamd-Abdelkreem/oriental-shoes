import type { ComponentType } from "react";
import {
  CheckCircle2,
  Layers,
  PackageCheck,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  type MvpOrder,
  type Stage,
  requiredQuantity,
  stageQuantity,
  formatProductCount,
} from "@/features/prototype/state/mvp-store";

const PIPELINE_STAGES: {
  key: Stage;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "القص", label: "قسم القص", icon: Scissors },
  { key: "الإنتاج والإصلاح", label: "قسم الإنتاج", icon: Layers },
  { key: "العمليات الخاصة", label: "العمليات الخاصة", icon: Sparkles },
  { key: "الجودة والتغليف", label: "الجودة والتغليف", icon: ShieldCheck },
  { key: "المستودع", label: "المستودع", icon: PackageCheck },
  { key: "تم الاستلام", label: "تم التسليم", icon: CheckCircle2 },
];

export function OrderTrackingStagePipeline({ order }: { order: MvpOrder }) {
  const activeReq = requiredQuantity(order);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Layers size={16} className="text-teal-700" />
            <span>مسار مراحل التصنيع والتسليم</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            الموقع التشغيلي للكميات عبر خطوط الإنتاج والمستودع والتسليم
          </p>
        </div>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
          {activeReq > 0
            ? `${formatProductCount(activeReq)} نشطة`
            : "لا توجد قطع نشطة"}
        </span>
      </div>

      {/* 6 Stage Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_STAGES.map((stg, idx) => {
          const qty =
            stg.key === "تم الاستلام" && order.status === "تم الاستلام"
              ? activeReq
              : stageQuantity(order, stg.key);
          const isActive = qty > 0;
          const Icon = stg.icon;

          return (
            <div
              key={stg.key}
              className={`relative flex flex-col justify-between rounded-xl border p-3 transition-all ${
                isActive
                  ? "border-teal-500 bg-teal-50/80 shadow-sm ring-1 ring-teal-500/20"
                  : "border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`rounded-lg p-1.5 ${
                    isActive
                      ? "bg-teal-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  <Icon size={15} />
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  0{idx + 1}
                </span>
              </div>

              <div>
                <strong
                  className={`block text-xs font-bold ${
                    isActive ? "text-teal-950" : "text-slate-700"
                  }`}
                >
                  {stg.label}
                </strong>
                <div className="mt-1.5 flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold ${
                      isActive ? "font-mono text-teal-800" : "text-slate-400"
                    }`}
                  >
                    {isActive ? formatProductCount(qty) : "لا توجد قطع"}
                  </span>
                  {isActive && (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-500" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
