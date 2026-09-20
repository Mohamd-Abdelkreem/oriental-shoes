"use client";

import type { ProductLine, Role } from "@/features/prototype/state/mvp-store";

export function getNextDeptForPiece(
  role: Role,
  piece: ProductLine,
): { nextStage: string; label: string } {
  if (role === "cutting") {
    if (
      piece.specialOpRequired ||
      (piece.specialOpNote && piece.specialOpNote.trim())
    ) {
      return { nextStage: "العمليات الخاصة", label: "قسم العمليات الخاصة" };
    }
    return { nextStage: "الإنتاج والإصلاح", label: "قسم الإنتاج والإصلاح" };
  }
  if (role === "production") {
    if (
      piece.specialOpRequired &&
      piece.currentLocation !== "في العمليات الخاصة"
    ) {
      return { nextStage: "العمليات الخاصة", label: "قسم العمليات الخاصة" };
    }
    return { nextStage: "الجودة والتغليف", label: "قسم الجودة والتغليف" };
  }
  if (role === "special") {
    return { nextStage: "الجودة والتغليف", label: "قسم الجودة والتغليف" };
  }
  if (role === "quality") {
    return { nextStage: "المستودع", label: "المستودع والتسليم" };
  }
  return { nextStage: "مع المندوب", label: "مندوب التوصيل" };
}
