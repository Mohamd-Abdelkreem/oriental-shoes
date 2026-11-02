"use client";

import type { ProductLine } from "@/features/prototype/state/mvp-store";

export const ORDER_PAPER_COLUMNS: {
  key: keyof ProductLine;
  label: string;
  group: "financial" | "quantity" | "leather" | "mixing" | "model";
}[] = [
  { key: "rowTotal", label: "الإجمالي", group: "financial" },
  { key: "unitPrice", label: "السعر", group: "financial" },
  { key: "quantity", label: "الكمية", group: "quantity" },
  {
    key: "decoration",
    label: "التطعيم",
    group: "leather",
  },
  {
    key: "decorationColor",
    label: "لون التطعيم",
    group: "leather",
  },
  {
    key: "leatherBase",
    label: "الأساس",
    group: "leather",
  },
  {
    key: "faceRight",
    label: "م١",
    group: "mixing",
  },
  { key: "faceLeft", label: "م٢", group: "mixing" },
  { key: "mixing", label: "م٣", group: "mixing" },
  { key: "face", label: "الوجه", group: "mixing" },
  { key: "model", label: "الموديل", group: "model" },
];
