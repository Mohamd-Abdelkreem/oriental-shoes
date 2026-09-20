"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ToastItem, ToastOptions, ToastType } from "./toast-types";
import { ToastContainer } from "./toast-container";

type ToastMethod = (message: string, options?: ToastOptions) => void;
type ToastApi = Record<ToastType, ToastMethod>;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const notice: ToastItem = {
        id: crypto.randomUUID(),
        type,
        message,
        description: options?.description,
        duration: 4000,
      };
      setToasts((current) => [...current.slice(-4), notice]);
    },
    [],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      success: (message, options) => {
        notify("success", message, options);
      },
      error: (message, options) => {
        notify("error", message, options);
      },
      info: (message, options) => {
        notify("info", message, options);
      },
      warning: (message, options) => {
        notify("warning", message, options);
      },
      delete: (message, options) => {
        notify("delete", message, options);
      },
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return { toast };
}
