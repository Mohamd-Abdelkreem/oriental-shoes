"use client";

import type React from "react";

export type BaseModalProps = {
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  children: React.ReactNode;
  actions?: React.ReactNode | undefined;
};
