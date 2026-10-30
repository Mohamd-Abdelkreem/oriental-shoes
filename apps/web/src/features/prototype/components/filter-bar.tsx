"use client";

import React from "react";
import { ChevronDown, RotateCcw, Search, X } from "lucide-react";

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterBarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string | undefined;
  children?: React.ReactNode | undefined;
  onReset?: () => void;
  totalCount?: number | undefined;
  filteredCount?: number | undefined;
  countLabel?: string | undefined;
};

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "ابحث بالرقم، الاسم، أو الموديل...",
  children,
  onReset,
  totalCount,
  filteredCount,
  countLabel = "سجل",
}: FilterBarProps) {
  const hasCount = totalCount !== undefined || filteredCount !== undefined;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition-all sm:p-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative max-w-full min-w-[220px] flex-1 sm:max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pr-10 pl-9 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 focus:outline-none"
              value={searchValue}
              onChange={(e) => {
                onSearchChange(e.target.value);
              }}
              placeholder={searchPlaceholder}
            />
            {searchValue && (
              <button
                type="button"
                className="absolute top-1/2 left-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200/80 text-slate-500 transition-colors hover:bg-slate-300 hover:text-slate-700"
                onClick={() => {
                  onSearchChange("");
                }}
                aria-label="مسح البحث"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {children && (
            <div className="flex flex-wrap items-center gap-2">{children}</div>
          )}

          {onReset && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
              onClick={onReset}
              title="إعادة ضبط الفلاتر"
            >
              <RotateCcw size={13} className="text-slate-500" />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>

        {hasCount && (
          <div className="flex shrink-0 items-center justify-end border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
              <span>
                {filteredCount !== undefined
                  ? `عرض ${String(filteredCount)} من أصل ${String(totalCount ?? filteredCount)} ${countLabel}`
                  : `إجمالي ${String(totalCount ?? "")} ${countLabel}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  options: (string | FilterOption)[];
}) {
  return (
    <div className="relative inline-flex items-center">
      {label && (
        <span className="ml-2 text-xs font-semibold whitespace-nowrap text-slate-500">
          {label}:
        </span>
      )}
      <div className="relative min-w-[140px]">
        <select
          className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50/70 pr-3.5 pl-8 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100/70 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 focus:outline-none"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          {options.map((option) => {
            const optionValue =
              typeof option === "string" ? option : option.value;
            const optionLabel =
              typeof option === "string" ? option : option.label;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
        />
      </div>
    </div>
  );
}

export function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <span className="ml-2 text-xs font-semibold whitespace-nowrap text-slate-500">
        {label}:
      </span>
      <input
        type="date"
        className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100/70 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 focus:outline-none"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

// Backward compatibility alias
export const OrientalFilterBar = FilterBar;
