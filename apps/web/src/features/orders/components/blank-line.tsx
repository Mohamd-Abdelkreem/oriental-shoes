"use client";

import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";

export const blankLine = (id: string, pieceNum: number = 1): ProductLine => ({
  id,
  pieceNumber: formatPieceSequence(pieceNum - 1),
  model: "",
  quantity: 1,
  size: "",
  leatherBase: "",
  decoration: "",
  decorationColor: "",
  face: "",
  faceRight: "",
  faceLeft: "",
  mixing: "",
  sole: "",
  soleColor: "",
  additions: "",
  aField: "",
  fField: "",
  sideNotes: "",
  unitPrice: "",
  rowTotal: "",
});
