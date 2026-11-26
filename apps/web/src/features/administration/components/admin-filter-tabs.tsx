"use client";

import type { LucideIcon } from "lucide-react";

export type AdminFilterTabTone = "amber" | "rose" | "teal" | "slate";

export type AdminFilterTabItem<T extends string = string> = {
  id: T;
  label: string;
  count?: number | undefined;
  tone: AdminFilterTabTone;
  icon?: LucideIcon | undefined;
};

type AdminFilterTabsProps<T extends string = string> = {
  items: readonly AdminFilterTabItem<T>[];
  activeTab: string;
  onSelect: (tab: T) => void;
};

const ACTIVE_TAB_STYLES: Record<AdminFilterTabTone, string> = {
  amber: "border-amber-700 bg-amber-600 text-white shadow-xs",
  rose: "border-rose-700 bg-rose-600 text-white shadow-xs",
  teal: "border-teal-800 bg-teal-700 text-white shadow-xs",
  slate: "border-slate-900 bg-slate-800 text-white shadow-xs",
};

const ACTIVE_COUNT_STYLES: Record<AdminFilterTabTone, string> = {
  amber: "bg-amber-800/45 text-white",
  rose: "bg-rose-900/45 text-white",
  teal: "bg-teal-900/55 text-white",
  slate: "bg-slate-950/55 text-white",
};

function inactiveCountStyle(
  tone: AdminFilterTabTone,
  count: number | undefined,
): string {
  if ((count ?? 0) > 0) {
    if (tone === "rose") {
      return "border border-rose-200/80 bg-rose-50 text-rose-700";
    }
    if (tone === "amber") {
      return "border border-amber-200/80 bg-amber-50 text-amber-800";
    }
  }
  return "border border-slate-200/80 bg-white text-slate-600";
}

/**
 * Shared segmented status/filter tab bar for administration oversight queues.
 */
export function AdminFilterTabs<T extends string = string>({
  items,
  activeTab,
  onSelect,
}: AdminFilterTabsProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xs">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = activeTab === item.id;
        const countText = item.count ?? "—";

        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onSelect(item.id);
            }}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all select-none ${
              selected
                ? ACTIVE_TAB_STYLES[item.tone]
                : "border-slate-200/90 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {Icon && <Icon size={15} className="shrink-0" aria-hidden="true" />}
            <span>{item.label}</span>{" "}
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                selected
                  ? ACTIVE_COUNT_STYLES[item.tone]
                  : inactiveCountStyle(item.tone, item.count)
              }`}
            >
              ({countText})
            </span>
          </button>
        );
      })}
    </div>
  );
}
