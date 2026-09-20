"use client";

import type { Role } from "@/features/prototype/state/mvp-store";

export function getDeptArabicName(role: Role): string {
  switch (role) {
    case "cutting":
      return "قسم القص والتفصيل";
    case "production":
      return "قسم الإنتاج والإصلاح";
    case "special":
      return "قسم العمليات الخاصة";
    case "quality":
      return "قسم الجودة والتغليف";
    case "warehouse":
      return "قسم المستودع والتسليم";
    default:
      return "المصنع";
  }
}
