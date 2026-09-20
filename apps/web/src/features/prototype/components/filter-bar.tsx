"use client";

import React from "react";
import { RotateCcw, Search } from "lucide-react";

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
  return (
    <div className="oriental-filter-card">
      <div className="oriental-filter-row">
        {/* Search Input with Magnifying Glass */}
        <div className="oriental-search-wrap">
          <Search size={17} className="oriental-search-icon" />
          <input
            type="text"
            className="oriental-search-input"
            value={searchValue}
            onChange={(e) => {
              onSearchChange(e.target.value);
            }}
            placeholder={searchPlaceholder}
          />
          {searchValue && (
            <button
              type="button"
              className="oriental-search-clear"
              onClick={() => {
                onSearchChange("");
              }}
              aria-label="مسح البحث"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Dropdowns & Inputs */}
        <div className="oriental-filters-controls">{children}</div>

        {/* Reset Button */}
        {onReset && (
          <button
            type="button"
            className="oriental-reset-btn"
            onClick={onReset}
            title="إعادة ضبط الفلاتر"
          >
            <RotateCcw size={14} />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>

      {/* Count Indicator */}
      {(totalCount !== undefined || filteredCount !== undefined) && (
        <div className="oriental-filter-footer">
          <span className="oriental-filter-count">
            {filteredCount !== undefined
              ? `عرض ${String(filteredCount)} من أصل ${String(totalCount ?? filteredCount)} ${countLabel}`
              : `إجمالي ${String(totalCount ?? "")} ${countLabel}`}
          </span>
        </div>
      )}
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
  onChange: (val: string) => void;
  options: (string | { label: string; value: string })[];
}) {
  return (
    <div className="oriental-filter-select-wrap">
      {label && <span className="oriental-filter-label">{label}</span>}
      <select
        className="oriental-filter-select"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((opt) => {
          const optVal = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={optVal} value={optVal}>
              {optLabel}
            </option>
          );
        })}
      </select>
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
  onChange: (val: string) => void;
}) {
  return (
    <div className="oriental-filter-date-wrap">
      <span className="oriental-filter-label">{label}</span>
      <input
        type="date"
        className="oriental-filter-date-input"
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
