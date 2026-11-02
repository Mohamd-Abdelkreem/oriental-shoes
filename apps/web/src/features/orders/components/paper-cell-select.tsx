"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { paperCellText } from "@/features/orders/paper/paper-cell-text";
import { PaperCellSelectMenu } from "./paper-cell-select-menu";
import { usePaperCellMenuPosition } from "./use-paper-cell-menu-position";

type PaperCellSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
  columnLabel?: string;
  ltr?: boolean;
};

export function PaperCellSelect({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  ariaLabel,
  invalid = false,
  columnLabel,
  ltr = false,
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
  const selectValue = (nextValue: string) => {
    onChange(nextValue);
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
        ref={triggerRef}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid}
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
          {displayValue && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
              }}
              className="paper-cell-clear-btn"
              title="مسح القيمة"
              aria-label="مسح القيمة"
            >
              <X size={11} />
            </button>
          )}
          <ChevronDown
            size={13}
            className={`paper-cell-chevron ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      {isOpen &&
        position &&
        createPortal(
          <PaperCellSelectMenu
            value={displayValue}
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
