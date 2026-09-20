"use client";

import type { Role, PieceLocation } from "@/features/prototype/state/mvp-store";

export function getDeptLocation(role: Role): PieceLocation {
  switch (role) {
    case "cutting":
      return "في القص";
    case "production":
      return "في الإنتاج";
    case "special":
      return "في العمليات الخاصة";
    case "quality":
      return "في الجودة";
    case "warehouse":
      return "في المستودع";
    default:
      return "في القص";
  }
}
