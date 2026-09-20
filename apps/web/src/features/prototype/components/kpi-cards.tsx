"use client";

import React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export type KpiCardItem = {
  title: string;
  value: string | number;
  unit?: string | undefined;
  subtitle: string;
  icon?: LucideIcon | undefined;
  href?: string | undefined;
  tone?:
    | "teal"
    | "amber"
    | "rose"
    | "blue"
    | "neutral"
    | "emerald"
    | "purple"
    | undefined;
};

export type KpiGridProps = {
  cards?: KpiCardItem[] | undefined;
  items?: KpiCardItem[] | undefined;
  columns?: 2 | 3 | 4 | 5 | undefined;
};

const toneIconStyles = {
  teal: { bg: "bg-teal-50", text: "text-teal-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600" },
};

export function KpiGrid({ cards, items, columns = 4 }: KpiGridProps) {
  const displayCards = cards || items || [];
  const colClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : columns === 5
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`oriental-kpi-grid grid ${colClass} mb-6 w-full gap-4`}>
      {displayCards.map((card, idx) => {
        const Icon = card.icon;
        const toneStyle = toneIconStyles[card.tone || "neutral"];

        const content = (
          <article className="oriental-kpi-card flex min-h-[110px] w-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:border-teal-500/40 hover:shadow-md">
            <div className="oriental-kpi-top flex items-center justify-between gap-2">
              <span className="oriental-kpi-title truncate text-xs font-bold text-slate-600">
                {card.title}
              </span>
              {Icon && (
                <div
                  className={`oriental-kpi-icon-wrap flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneStyle.bg} ${toneStyle.text} kpi-tone-${card.tone || "neutral"}`}
                >
                  <Icon size={16} />
                </div>
              )}
            </div>

            <div className="oriental-kpi-value-row mt-2 mb-1 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5 overflow-hidden">
                <strong className="oriental-kpi-value text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                  {card.value}
                </strong>
                {card.unit && (
                  <span className="text-xs font-bold whitespace-nowrap text-slate-500">
                    {card.unit}
                  </span>
                )}
              </div>
              {card.href && (
                <span className="oriental-kpi-arrow shrink-0 text-slate-400 transition-colors group-hover:text-teal-600">
                  <ArrowUpRight size={15} />
                </span>
              )}
            </div>

            <p className="oriental-kpi-sub line-clamp-2 text-[11px] leading-snug font-medium text-slate-500">
              {card.subtitle}
            </p>
          </article>
        );

        if (card.href) {
          return (
            <Link
              key={idx}
              href={card.href as Route}
              className="oriental-kpi-link group block focus:outline-none"
            >
              {content}
            </Link>
          );
        }

        return <React.Fragment key={idx}>{content}</React.Fragment>;
      })}
    </div>
  );
}

// Backward compatibility alias
export const OrientalKpiGrid = KpiGrid;
