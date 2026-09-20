"use client";

import React from "react";

export type PageHeaderProps = {
  title: string;
  badge?: React.ReactNode | undefined;
  subtitle?: string | undefined;
  actions?: React.ReactNode | undefined;
  eyebrow?: string | undefined;
};

export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <div className="oriental-page-head mb-6 flex w-full flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs md:flex-row md:items-center">
      {/* Right Column (Title, Eyebrow, Badge, Subtitle) */}
      <div className="oriental-head-main min-w-0 flex-1 space-y-1.5">
        {eyebrow && (
          <div className="oriental-head-eyebrow text-[11px] font-bold tracking-wider text-slate-400">
            {eyebrow}
          </div>
        )}

        <div className="oriental-head-title-row flex flex-wrap items-center gap-3">
          <h1 className="oriental-head-title text-xl font-black tracking-tight text-slate-900 md:text-2xl">
            {title}
          </h1>
          {badge && (
            <div className="oriental-head-badge inline-flex items-center">
              {badge}
            </div>
          )}
        </div>

        {subtitle && (
          <p className="oriental-head-sub max-w-4xl text-xs leading-relaxed font-medium text-slate-500 md:text-sm">
            {subtitle}
          </p>
        )}
      </div>

      {/* Left Column (Action Buttons) */}
      {actions && (
        <div className="oriental-head-actions flex shrink-0 flex-wrap items-center gap-2.5 self-start md:self-center">
          {actions}
        </div>
      )}
    </div>
  );
}

// Backward compatibility alias
export const OrientalPageHeader = PageHeader;
