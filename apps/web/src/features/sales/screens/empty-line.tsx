"use client";

import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";

export const emptyLine = (id: string, pieceIndex: number = 0): ProductLine => ({
  id,
  pieceNumber: formatPieceSequence(pieceIndex),
  model: "شرقي ملكي كلاسيك",
  quantity: 1,
  size: "٤٢",
  leatherBase: "جلد طبيعي أسود",
  decoration: "سادة بدون تطعيم",
  decorationColor: "مطابق للأساس",
  face: "وجه شرقي ملكي",
  faceRight: "سادة",
  faceLeft: "سادة بدون م٢",
  mixing: "تقفيل يدوي مقوى",
  sole: "R.D1/2 ربل مدعم",
  soleColor: "٠١ أسود",
  additions: "بدون إضافات",
  aField: "",
  fField: "",
  sideNotes: "",
  unitPrice: "350",
  rowTotal: "350",
});
