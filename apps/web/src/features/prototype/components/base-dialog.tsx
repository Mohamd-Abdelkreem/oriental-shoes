"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { BaseModalProps } from "./base-modal-props";

const focusableControls = (dialog: HTMLElement): HTMLElement[] =>
  [
    ...dialog.querySelectorAll<HTMLElement>(
      "button, input, textarea, select, a[href], [tabindex]",
    ),
  ].filter((control) => {
    if (
      control.tabIndex < 0 ||
      control.matches(":disabled") ||
      control.closest('[hidden], [aria-hidden="true"]')
    )
      return false;
    if (getComputedStyle(control).visibility === "hidden") return false;
    // A child can report display:block while its responsive parent is hidden.
    for (
      let parent: HTMLElement | null = control;
      parent !== null;
      parent = parent.parentElement
    ) {
      if (getComputedStyle(parent).display === "none") return false;
      if (parent === dialog) break;
    }
    return true;
  });

export function BaseDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  initialFocusRef,
  returnFocusRef,
}: BaseModalProps) {
  const titleId = useId(),
    dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = returnFocusRef?.current ?? document.activeElement;
    const focusable =
      dialogRef.current === null
        ? undefined
        : focusableControls(dialogRef.current)[0];
    (initialFocusRef?.current ?? focusable ?? dialogRef.current)?.focus();
    return () => {
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        !trigger.matches(":disabled")
      )
        trigger.focus();
    };
  }, [open, initialFocusRef, returnFocusRef]);
  if (!open) return null;

  return (
    <div className="oriental-modal-backdrop" onClick={onClose}>
      <div
        className="oriental-modal-container"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") return;
          event.stopPropagation();
          const nodes = focusableControls(event.currentTarget);
          const first = nodes[0],
            last = nodes.at(-1);
          if (!first) {
            event.preventDefault();
            event.currentTarget.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === event.currentTarget)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <div>
            <h2 id={titleId} className="oriental-modal-title">
              {title}
            </h2>
            {subtitle && <p className="oriental-modal-sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="oriental-modal-close"
            onClick={onClose}
            aria-label="إغلاق النافذة"
          >
            <X size={18} />
          </button>
        </div>

        <div className="oriental-modal-body">{children}</div>

        {actions && <div className="oriental-modal-footer">{actions}</div>}
      </div>
    </div>
  );
}
