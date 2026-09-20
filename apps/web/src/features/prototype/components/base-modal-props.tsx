"use client";

import type React from "react";

export type BaseModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  children: React.ReactNode;
  actions?: React.ReactNode | undefined;
};
