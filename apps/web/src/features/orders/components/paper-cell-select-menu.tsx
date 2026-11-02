import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, Plus, Search, X } from "lucide-react";
import type { PaperCellMenuPosition } from "./use-paper-cell-menu-position";

function normalizeArabicText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const normQuery = normalizeArabicText(query);
  const normText = normalizeArabicText(text);
  const index = normText.indexOf(normQuery);
  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <span className="rounded bg-teal-100 px-0.5 font-bold text-teal-900">
        {match}
      </span>
      {after}
    </>
  );
}

export function PaperCellSelectMenu({
  value,
  options,
  columnLabel,
  listboxId,
  menuRef,
  position,
  onSelect,
  onEscape,
}: {
  value: string;
  options: readonly string[];
  columnLabel: string | undefined;
  listboxId: string;
  menuRef: RefObject<HTMLDivElement | null>;
  position: PaperCellMenuPosition;
  onSelect: (value: string) => void;
  onEscape: () => void;
}) {
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const filteredOptions = useMemo(() => {
    const query = normalizeArabicText(search);
    return query
      ? options.filter((option) => normalizeArabicText(option).includes(query))
      : options;
  }, [options, search]);
  const hasExactMatch = useMemo(() => {
    if (!search.trim()) return false;
    const query = normalizeArabicText(search);
    return options.some((option) => normalizeArabicText(option) === query);
  }, [options, search]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const highlightedOption =
      listContainerRef.current?.children[highlightedIndex];
    if (
      highlightedOption instanceof HTMLElement &&
      typeof highlightedOption.scrollIntoView === "function"
    ) {
      highlightedOption.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length > 0)
        setHighlightedIndex((index) =>
          index < filteredOptions.length - 1 ? index + 1 : 0,
        );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length > 0)
        setHighlightedIndex((index) =>
          index > 0 ? index - 1 : filteredOptions.length - 1,
        );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selectedOption = filteredOptions[highlightedIndex];
      if (selectedOption !== undefined) {
        if (selectedOption) onSelect(selectedOption);
      } else if (search.trim()) {
        onSelect(search.trim());
      }
    }
  };
  return (
    <div
      ref={menuRef}
      dir="rtl"
      className="paper-cell-menu"
      style={{
        top: `${String(position.top)}px`,
        left: `${String(position.left)}px`,
        width: `${String(position.width)}px`,
      }}
    >
      <div className="paper-cell-menu-search">
        <Search size={14} className="paper-cell-menu-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            columnLabel ? `ابحث في ${columnLabel}...` : "ابحث في الخيارات..."
          }
          className="paper-cell-menu-search-input"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              searchInputRef.current?.focus();
            }}
            className="paper-cell-menu-search-clear"
            title="مسح البحث"
          >
            <X size={12} />
          </button>
        )}
        <span className="paper-cell-menu-count-badge">
          {filteredOptions.length}
        </span>
      </div>

      {value && (
        <button
          type="button"
          onClick={() => {
            onSelect("");
          }}
          className="paper-cell-menu-clear-action"
        >
          <X size={12} />
          <span>مسح الاختيار الحالي ({value})</span>
        </button>
      )}

      <div
        ref={listContainerRef}
        id={listboxId}
        role="listbox"
        aria-label={columnLabel || "قائمة الخيارات"}
        className="paper-cell-menu-list"
      >
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option, optionIndex) => {
            const isSelected = option === value;
            const isHighlighted = optionIndex === highlightedIndex;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(option);
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(optionIndex);
                }}
                className={`paper-cell-menu-item ${
                  isSelected ? "is-selected" : ""
                } ${isHighlighted ? "is-highlighted" : ""}`}
              >
                <span className="truncate">
                  {highlightMatch(option, search)}
                </span>
                {isSelected && (
                  <Check size={14} className="paper-cell-menu-check" />
                )}
              </button>
            );
          })
        ) : (
          <div className="paper-cell-menu-empty">
            لا توجد خيارات مطابقة للبحث
          </div>
        )}
      </div>

      {search.trim() && !hasExactMatch && (
        <button
          type="button"
          onClick={() => {
            onSelect(search.trim());
          }}
          className="paper-cell-menu-custom-action"
        >
          <Plus size={13} />
          <span>استخدام القيمة المكتوبة: &quot;{search.trim()}&quot;</span>
        </button>
      )}
    </div>
  );
}
