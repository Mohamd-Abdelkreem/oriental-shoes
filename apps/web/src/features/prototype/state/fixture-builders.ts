import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import type { ProductLine } from "./mvp-types";

export const makePiece = (
  id: string,
  pieceIndex: number,
  model: string,
  overrides?: Partial<ProductLine>,
): ProductLine => ({
  id,
  pieceNumber: overrides?.pieceNumber || formatPieceSequence(pieceIndex),
  model,
  quantity: 1, // Every piece row is ALWAYS exactly 1 physical piece
  size: "٤٢",
  leatherBase: "جلد طبيعي أسود",
  decoration: "جلد بني محبب",
  decorationColor: "بني داكن",
  faceRight: "جلد طبيعي",
  faceLeft: "شمواه أسود",
  mixing: "خيط تطريز دقيق",
  face: "وجه سادة كلاسيكي",
  sole: "R.D1/2 ربل مدعم",
  soleColor: "١٢ عسلي",
  additions: "فرشة طبية مريحة",
  aField: "٢",
  fField: "١",
  sideNotes: "مطابقة عينة المعرض",
  unitPrice: "450",
  rowTotal: overrides?.unitPrice || "450",
  currentLocation: "في القص",
  deptStatus: "جاهزة للعمل",
  ...overrides,
});

export const makeLine = (
  id: string,
  model: string,
  quantityOrIndex: number,
  overrides?: Partial<ProductLine>,
): ProductLine => {
  return makePiece(
    id,
    typeof quantityOrIndex === "number" && quantityOrIndex < 20
      ? quantityOrIndex
      : 0,
    model,
    overrides,
  );
};
