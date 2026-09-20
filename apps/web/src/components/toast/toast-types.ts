export type ToastType = "success" | "error" | "info" | "warning" | "delete";

export type ToastOptions = {
  description?: string | undefined;
};

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  description?: string | undefined;
  duration: number;
};
