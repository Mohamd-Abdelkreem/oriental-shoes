"use client";

import type { ProductLine } from "@/features/prototype/state/mvp-store";

export const ORDER_PAPER_COLUMNS: {
  key: keyof ProductLine;
  label: string;
  group: "financial" | "quantity" | "leather" | "mixing" | "model";
  datalistId?: string | undefined;
}[] = [
  { key: "rowTotal", label: "الإجمالي", group: "financial" },
  { key: "unitPrice", label: "السعر", group: "financial" },
  { key: "quantity", label: "الكمية", group: "quantity" },
  {
    key: "decoration",
    label: "التطعيم",
    group: "leather",
    datalistId: "dl-decoration",
  },
  {
    key: "decorationColor",
    label: "لون التطعيم",
    group: "leather",
    datalistId: "dl-decoration-color",
  },
  {
    key: "leatherBase",
    label: "الأساس",
    group: "leather",
    datalistId: "dl-leather-base",
  },
  {
    key: "faceRight",
    label: "م١",
    group: "mixing",
    datalistId: "dl-face-right",
  },
  { key: "faceLeft", label: "م٢", group: "mixing", datalistId: "dl-face-left" },
  { key: "mixing", label: "م٣", group: "mixing", datalistId: "dl-mixing" },
  { key: "face", label: "الوجه", group: "mixing", datalistId: "dl-face" },
  { key: "model", label: "الموديل", group: "model", datalistId: "dl-model" },
];
