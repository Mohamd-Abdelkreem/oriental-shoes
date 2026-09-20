"use client";

import type { ProductLine } from "@/features/prototype/state/mvp-store";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";

export const emptyLine = (id: string, pieceIndex: number = 0): ProductLine => ({
  id,
  pieceNumber: formatPieceSequence(pieceIndex),
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
