import { ChevronLeft, ChevronRight } from "lucide-react";

function pageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1);
  }
  const pages: (number | "...")[] = [1];
  if (currentPage > 3) pages.push("...");
  const firstNeighbor = Math.max(2, currentPage - 1);
  const lastNeighbor = Math.min(totalPages - 1, currentPage + 1);
  for (let page = firstNeighbor; page <= lastNeighbor; page++) {
    pages.push(page);
  }
  if (currentPage < totalPages - 2) pages.push("...");
  pages.push(totalPages);
  return pages;
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalCount,
  onPreviousPage,
  onNextPage,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="oriental-pagination-bar flex-col sm:flex-row">
      <div className="oriental-pagination-info">
        <span>صفحة</span>
        <strong className="font-bold text-slate-900">{currentPage}</strong>
        <span>من</span>
        <strong className="font-bold text-slate-900">{totalPages}</strong>
        <span className="text-slate-400">·</span>
        <span>(إجمالي {totalCount} عنصر)</span>
      </div>

      <div className="oriental-pagination-actions">
        <button
          type="button"
          className="oriental-page-btn shadow-2xs"
          disabled={currentPage === 1}
          onClick={onPreviousPage}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight size={15} />
          <span>السابق</span>
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers(currentPage, totalPages).map((pageNumber, tokenIndex) =>
            pageNumber === "..." ? (
              <span
                key={`ellipsis-${String(tokenIndex)}`}
                className="inline-flex h-8 w-8 items-center justify-center text-xs font-bold text-slate-400"
              >
                ...
              </span>
            ) : (
              <button
                key={pageNumber}
                type="button"
                onClick={() => {
                  onPageChange(pageNumber);
                }}
                aria-current={pageNumber === currentPage ? "page" : undefined}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                  pageNumber === currentPage
                    ? "bg-teal-700 text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {pageNumber}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="oriental-page-btn shadow-2xs"
          disabled={currentPage === totalPages}
          onClick={onNextPage}
          aria-label="الصفحة التالية"
        >
          <span>التالي</span>
          <ChevronLeft size={15} />
        </button>
      </div>
    </div>
  );
}
