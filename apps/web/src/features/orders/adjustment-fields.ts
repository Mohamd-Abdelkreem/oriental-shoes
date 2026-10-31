import type { MvpOrder } from "@/features/prototype/state/mvp-types";

export type OrderAdjustmentFields = Pick<
  MvpOrder,
  "adjustmentRequested" | "adjustmentReason" | "adjustmentActionTaken"
>;

export const adjustmentFieldDefinitions = [
  {
    key: "adjustmentRequested",
    label: "التعديل المطلوب :",
    rows: 3,
    prefixes: ["1", "2", "3"],
    paperPlaceholder: "1. \n2. \n3. ",
  },
  {
    key: "adjustmentReason",
    label: "سبب التعديل :",
    rows: 2,
    prefixes: ["*", "*"],
    paperPlaceholder: "* سبب التعديل...",
  },
  {
    key: "adjustmentActionTaken",
    label: "الإجراء المتخذ :",
    rows: 2,
    prefixes: ["*", "*"],
    paperPlaceholder: "* الإجراء المتخذ...",
  },
] as const;
