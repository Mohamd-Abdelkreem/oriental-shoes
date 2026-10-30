import type { Role } from "@/features/prototype/state/mvp-store";

export function getNextDept(role: Role): { nextStage: string; label: string } {
  if (role === "cutting") {
    return { nextStage: "الإنتاج والإصلاح", label: "قسم الإنتاج والإصلاح" };
  }
  if (role === "production") {
    return { nextStage: "الجودة والتغليف", label: "قسم الجودة والتغليف" };
  }
  if (role === "quality") {
    return { nextStage: "المستودع", label: "المستودع والتسليم" };
  }
  return { nextStage: "مع المندوب", label: "مندوب التوصيل" };
}
