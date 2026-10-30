"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";

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
  const tabs: {
    id: DepartmentTab;
    label: string;
    count: number;
    icon: LucideIcon;
  }[] = [
    {
      id: "ready",
      label: "جاهزة للعمل",
      count: readyCount,
      icon: Clock,
    },
    {
      id: "in_progress",
      label: "جاري العمل",
      count: inProgressCount,
      icon: PlayCircle,
    },
    {
      id: "completed",
      label: "المنجز والمحوّل",
      count: completedCount,
      icon: CheckCircle2,
    },
    {
      id: "problems",
      label: "مشكلات ومحالات",
      count: problemCount,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1.5 shadow-2xs">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        const isProblem = tab.id === "problems";
        const buttonColor = isActive
          ? isProblem
            ? "bg-rose-700 text-white shadow-xs"
            : "bg-teal-700 text-white shadow-xs"
          : isProblem && tab.count > 0
            ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
            : "text-slate-600 hover:bg-white/80 hover:text-slate-900";
        const badgeColor = isActive
          ? isProblem
            ? "bg-rose-900 text-rose-100"
            : "bg-teal-900 text-teal-100"
          : isProblem
            ? tab.count > 0
              ? "bg-rose-200 text-rose-900"
              : "bg-slate-200/80 text-slate-600"
            : "bg-slate-200/80 text-slate-700";
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              onSelect(tab.id);
            }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all select-none ${buttonColor}`}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${badgeColor}`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
