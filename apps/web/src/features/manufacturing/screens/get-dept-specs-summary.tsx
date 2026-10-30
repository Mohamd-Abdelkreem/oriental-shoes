"use client";

import type { ProductLine, Role } from "@/features/prototype/state/mvp-store";

export function getDeptSpecsSummary(role: Role, item: ProductLine): string {
  if (role === "cutting") {
    return `الأساس: ${item.leatherBase || "جلد طبيعي"} · التطعيم: ${item.decoration || "سادة"} (${item.decorationColor || "مطابق"})`;
  }
  if (role === "production") {
    return `الوجه: ${item.faceRight || item.face || "سادة"} · النعل: ${item.sole || "ربل"} (${item.soleColor || "عسلي"}) · ${item.additions || "فرشة طبية"}`;
  }
  if (role === "quality") {
    return `مطابقة فنية: ${item.model} مقاس ${item.size} · فحص التقفيل والنعل والجلد`;
  }
  if (role === "warehouse") {
    return `تجهيز التعبئة والتخزين · كراتين رسمية فاخرة`;
  }
  return item.leatherBase || "مطابق للمواصفات الفنية";
}
