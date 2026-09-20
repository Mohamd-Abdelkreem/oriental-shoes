"use client";

import type { OrderPaperMode } from "./order-paper-mode";

export const isEditable = (mode: OrderPaperMode) =>
  mode === "create" || mode === "edit" || mode === "admin";
