"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import type { ToastItem } from "./toast-types";

export function ToastItemCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (item.duration <= 0) return;

    // Start exit transition 300ms before removing
    const leaveTimer = setTimeout(
      () => {
        setIsLeaving(true);
      },
      Math.max(0, item.duration - 300),
    );

    const removeTimer = setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, [item.id, item.duration, onDismiss]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss(item.id);
    }, 200);
  };

  const config = {
    success: {
      icon: CheckCircle2,
      iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-200",
      cardBorder: "border-emerald-200 hover:border-emerald-300",
      accentBar: "bg-emerald-500",
      titleColor: "text-emerald-950",
    },
    delete: {
      icon: Trash2,
      iconBg: "bg-rose-50 text-rose-600 border border-rose-200",
      cardBorder: "border-rose-200 hover:border-rose-300",
      accentBar: "bg-rose-500",
      titleColor: "text-rose-950",
    },
    error: {
      icon: AlertCircle,
      iconBg: "bg-rose-50 text-rose-600 border border-rose-200",
      cardBorder: "border-rose-200 hover:border-rose-300",
      accentBar: "bg-rose-500",
      titleColor: "text-rose-950",
    },
    info: {
      icon: Info,
      iconBg: "bg-teal-50 text-teal-600 border border-teal-200",
      cardBorder: "border-teal-200 hover:border-teal-300",
      accentBar: "bg-teal-500",
      titleColor: "text-teal-950",
    },
    warning: {
      icon: AlertTriangle,
      iconBg: "bg-amber-50 text-amber-600 border border-amber-200",
      cardBorder: "border-amber-200 hover:border-amber-300",
      accentBar: "bg-amber-500",
      titleColor: "text-amber-950",
    },
  }[item.type];

  const IconComponent = config.icon;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border bg-white/95 p-3.5 shadow-xl backdrop-blur-md transition-all duration-300 ${
        config.cardBorder
      } ${
        isLeaving
          ? "translate-y-2 scale-95 opacity-0"
          : "animate-in fade-in slide-in-from-bottom-3 translate-y-0 scale-100 opacity-100"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${config.iconBg}`}
        >
          <IconComponent size={16} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <h4
              className={`text-xs leading-tight font-bold ${config.titleColor}`}
            >
              {item.message}
            </h4>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="إغلاق الإشعار"
            >
              <X size={13} />
            </button>
          </div>

          {item.description && (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Auto-dismiss progress line */}
      {item.duration > 0 && (
        <div
          className={`absolute right-0 bottom-0 left-0 h-0.5 opacity-60 ${config.accentBar}`}
          style={{
            animation: `toast-progress ${String(item.duration)}ms linear forwards`,
          }}
        />
      )}
    </div>
  );
}
