"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";

export type Column<T> = {
  header: string;
  accessor?: keyof T | undefined;
  render?: (row: T, index: number) => React.ReactNode | undefined;
  className?: string | undefined;
};

export type TableProps<T> = {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  pageSize?: number | undefined;
  emptyTitle?: string | undefined;
  emptySubtitle?: string | undefined;
  isSearchEmpty?: boolean | undefined;
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  emptyTitle = "لا توجد سجلات",
  emptySubtitle = "ستظهر السجلات الجديدة هنا فور توفرها.",
  isSearchEmpty = false,
}: TableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  const pageData = data.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="oriental-table-card">
      <div className="oriental-table-container">
        <table className="oriental-data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length > 0 ? (
              pageData.map((row, rowIdx) => (
                <tr key={keyExtractor(row, rowIdx)}>
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={col.className}>
                      {col.render
                        ? col.render(row, (currentPage - 1) * pageSize + rowIdx)
                        : col.accessor
                          ? String(row[col.accessor] ?? "—")
                          : "—"}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="oriental-empty-cell">
                  <div className="oriental-empty-wrap">
                    {isSearchEmpty ? (
                      <Search size={32} className="oriental-empty-icon" />
                    ) : (
                      <Inbox size={32} className="oriental-empty-icon" />
                    )}
                    <h3 className="oriental-empty-title">{emptyTitle}</h3>
                    <p className="oriental-empty-sub">{emptySubtitle}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="oriental-pagination-bar">
          <span className="oriental-pagination-info">
            صفحة {currentPage} من {totalPages} (إجمالي {data.length} عنصر)
          </span>

          <div className="oriental-pagination-actions">
            <button
              type="button"
              className="oriental-page-btn"
              disabled={currentPage === 1}
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
              }}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight size={16} />
              <span>السابق</span>
            </button>

            <span className="oriental-current-page-num">{currentPage}</span>

            <button
              type="button"
              className="oriental-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
              }}
              aria-label="الصفحة التالية"
            >
              <span>التالي</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const pillToneStyles = {
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  teal: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    dot: "bg-teal-500",
  },
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  rose: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    dot: "bg-rose-500",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    dot: "bg-purple-500",
  },
  neutral: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-400",
  },
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?:
    | "teal"
    | "emerald"
    | "blue"
    | "amber"
    | "rose"
    | "purple"
    | "neutral"
    | undefined;
}) {
  const style = pillToneStyles[tone];
  return (
    <span
      className={`oriental-status-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${style.bg} ${style.text} ${style.border}`}
    >
      <span
        className={`status-pill-dot h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
      />
      <span>{children}</span>
    </span>
  );
}

export function statusTone(
  status: string,
): "teal" | "emerald" | "blue" | "amber" | "rose" | "purple" | "neutral" {
  if (["معتمد", "تم الاستلام", "فعال"].includes(status)) return "emerald";
  if (
    ["جاهز للتسليم", "مكتمل في المرحلة", "مكتمل في قسم القص"].includes(status)
  )
    return "teal";
  if (
    [
      "قيد التنفيذ",
      "قيد التصنيع",
      "قيد القص",
      "مع المندوب",
      "خرج مع المندوب",
    ].includes(status)
  )
    return "blue";
  if (
    [
      "مسودة",
      "بانتظار الاعتماد",
      "بانتظار الاستلام",
      "بانتظار بدء العمل",
      "بانتظار الفحص",
      "إعادة فحص",
    ].includes(status)
  )
    return "amber";
  if (
    [
      "معاد للتعديل",
      "معادة من الجودة",
      "تعذر التسليم",
      "مرفوض",
      "موقوف",
      "ملغي بالكامل",
    ].includes(status)
  )
    return "rose";
  if (["العمليات الخاصة", "تطريز", "نقش"].includes(status)) return "purple";
  return "neutral";
}

// Backward compatibility aliases
export const OrientalTable = DataTable;
export const OrientalStatusPill = StatusPill;
