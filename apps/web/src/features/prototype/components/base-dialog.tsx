"use client";

import { X } from "lucide-react";
import type { BaseModalProps } from "./base-modal-props";

export function BaseDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: BaseModalProps) {
  if (!open) return null;

  return (
    <div
      className="oriental-modal-backdrop"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        className="oriental-modal-container"
        onClick={(e) => {
          e.stopPropagation();
        }}
        dir="rtl"
      >
        <div className="oriental-modal-header">
          <div>
            <h2 className="oriental-modal-title">{title}</h2>
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
