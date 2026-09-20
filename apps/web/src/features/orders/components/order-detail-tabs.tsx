"use client";

import { Boxes, Clock, FileText } from "lucide-react";

export type OrderDetailTab = "tracking" | "form" | "history";

type OrderDetailTabsProps = {
  activeTab: OrderDetailTab;
  onTabChange: (tab: OrderDetailTab) => void;
  activePiecesCount: number;
  eventsCount: number;
  formLabel?: string;
  historyLabel?: string;
};

export function OrderDetailTabs({
  activeTab,
  onTabChange,
  activePiecesCount,
  eventsCount,
  formLabel = "الورقة الرسمية لأمر التفصيل",
  historyLabel = "سجل الحركات والتوقيتات",
}: OrderDetailTabsProps) {
  const tabs = [
    {
      key: "tracking",
      label: "تتبع أمر التفصيل ومسار الكميات",
      icon: Boxes,
      count: activePiecesCount,
    },
    { key: "form", label: formLabel, icon: FileText },
    { key: "history", label: historyLabel, icon: Clock, count: eventsCount },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {tabs.map(({ key, label, icon: Icon, ...tab }) => {
        const selected = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onTabChange(key);
            }}
            className={[
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition",
              selected
                ? "bg-teal-700 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            <Icon size={14} />
            <span>{label}</span>
            {"count" in tab && (
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  selected
                    ? "bg-teal-900 text-teal-100"
                    : "bg-slate-100 text-slate-700",
                ].join(" ")}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
