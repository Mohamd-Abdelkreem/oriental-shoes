"use client";

import type { ToastItem } from "./toast-types";
import { ToastItemCard } from "./toast-item";

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="قائمة الإشعارات"
      className="pointer-events-none fixed bottom-6 left-6 z-[9999] flex w-full max-w-sm flex-col gap-2.5"
    >
      {toasts.map((toast) => (
        <ToastItemCard key={toast.id} item={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
