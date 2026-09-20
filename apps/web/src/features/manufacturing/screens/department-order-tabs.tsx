import { AlertTriangle, CheckCircle2, Clock, Scissors } from "lucide-react";

export type DepartmentTab = "ready" | "in_progress" | "completed" | "problems";

type Props = {
  activeTab: DepartmentTab;
  readyCount: number;
  inProgressCount: number;
  completedCount: number;
  problemCount: number;
  onSelect: (tab: DepartmentTab) => void;
};

export function DepartmentOrderTabs({
  activeTab,
  readyCount,
  inProgressCount,
  completedCount,
  problemCount,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      <button
        type="button"
        onClick={() => {
          onSelect("ready");
        }}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
          activeTab === "ready"
            ? "bg-teal-700 text-white shadow-sm"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Clock size={14} />
        <span>جاهزة للعمل</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "ready" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
        >
          {readyCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onSelect("in_progress");
        }}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
          activeTab === "in_progress"
            ? "bg-teal-700 text-white shadow-sm"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Scissors size={14} />
        <span>جاري العمل</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "in_progress" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
        >
          {inProgressCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onSelect("completed");
        }}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
          activeTab === "completed"
            ? "bg-teal-700 text-white shadow-sm"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <CheckCircle2 size={14} />
        <span>المنجز والمحوّل</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "completed" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"}`}
        >
          {completedCount}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onSelect("problems");
        }}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
          activeTab === "problems"
            ? "bg-rose-700 text-white shadow-sm"
            : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
        }`}
      >
        <AlertTriangle size={14} />
        <span>المشكلات والمحالات</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === "problems" ? "bg-rose-900 text-rose-100" : "bg-rose-100 text-rose-800"}`}
        >
          {problemCount}
        </span>
      </button>
    </div>
  );
}
