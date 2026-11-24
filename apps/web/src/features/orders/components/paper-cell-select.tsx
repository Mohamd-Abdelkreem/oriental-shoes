"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, RotateCcw, X } from "lucide-react";
import type {
  PaperCatalogOption,
  CatalogSelectionChange,
} from "./order-paper-form-props";
import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import { PaperCellSelectMenu } from "./paper-cell-select-menu";
import { usePaperCellMenuPosition } from "./use-paper-cell-menu-position";

type PaperCellSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | PaperCatalogOption)[];
  selectedOptionId?: string | null | undefined;
  onSelectionChange?: ((selection: CatalogSelectionChange) => void) | undefined;
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
  columnLabel?: string;
  ltr?: boolean;
  errorMessage?: string | undefined;
  errorId?: string | undefined;
  onFieldElement?: ((element: HTMLElement | null) => void) | undefined;
  clearable?: boolean | undefined;
  onRestore?: (() => void) | undefined;
};

export function PaperCellSelect({
  value,
  onChange,
  options,
  selectedOptionId,
  onSelectionChange,
  placeholder = "اختر...",
  ariaLabel,
  invalid = false,
  columnLabel,
  ltr = false,
  errorMessage,
  errorId,
  onFieldElement,
  clearable = true,
  onRestore,
}: PaperCellSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const displayValue = paperCellText(value);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);
  const { position, updatePosition } = usePaperCellMenuPosition({
    isOpen,
    triggerRef,
    menuRef,
    closeMenu,
  });
  const openMenu = () => {
    updatePosition();
    setIsOpen(true);
  };
  const dismissMenu = () => {
    closeMenu();
    triggerRef.current?.focus();
  };
  const commitSelection = (nextValue: string | PaperCatalogOption) => {
    if (onSelectionChange !== undefined)
      onSelectionChange(
        typeof nextValue === "string"
          ? { displayValue: nextValue, entryId: null }
          : { displayValue: nextValue.label, entryId: nextValue.value },
      );
    else onChange(typeof nextValue === "string" ? nextValue : nextValue.label);
  };
  const selectValue = (nextValue: string | PaperCatalogOption) => {
    commitSelection(nextValue);
    dismissMenu();
  };
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      if (!isOpen) openMenu();
    }
  };

  return (
    <>
      <div
        ref={(element) => {
          triggerRef.current = element;
          onFieldElement?.(element);
        }}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={errorMessage === undefined ? undefined : errorId}
        tabIndex={0}
        onClick={() => {
          if (isOpen) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`paper-cell-box ${isOpen ? "is-open" : ""} ${invalid ? "is-invalid" : ""}`}
        title={displayValue || placeholder}
      >
        <span
          className={`paper-cell-value ${!displayValue ? "paper-cell-placeholder" : ""} ${ltr ? "paper-ltr" : ""}`}
        >
          {displayValue || placeholder}
        </span>
        <div className="paper-cell-icons">
          {displayValue && clearable && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                commitSelection("");
              }}
              className="paper-cell-clear-btn"
              title="مسح القيمة"
              aria-label="مسح القيمة"
            >
              <X size={11} />
            </button>
          )}
          {!displayValue && onRestore && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRestore();
                triggerRef.current?.focus();
              }}
              className="paper-cell-clear-btn"
              title="استعادة الأرضية المحفوظة"
              aria-label="استعادة الأرضية المحفوظة"
            >
              <RotateCcw size={11} />
            </button>
          )}
          <ChevronDown
            size={13}
            className={`paper-cell-chevron ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      {errorMessage !== undefined && (
        <span id={errorId} className="sr-only">
          {errorMessage}
        </span>
      )}
      {isOpen &&
        position &&
        createPortal(
          <PaperCellSelectMenu
            value={displayValue}
            selectedOptionId={selectedOptionId}
            selectionMode={
              onSelectionChange === undefined ? "legacy" : "source"
            }
            options={options}
            columnLabel={columnLabel}
            listboxId={listboxId}
            menuRef={menuRef}
            position={position}
            onSelect={selectValue}
            onEscape={dismissMenu}
          />,
          document.body,
        )}
    </>
  );
}
