import type { ProductLine } from "@/features/prototype/state/mvp-store";

export function calculateOrderTotals(lines: ProductLine[], paid: string) {
  const total = lines.reduce(
    (sum, line) => sum + Number(line.unitPrice || line.rowTotal || 0),
    0,
  );
  const paidAmount = Number(paid || 0);

  return {
    total: String(total),
    paid,
    balance: String(Math.max(0, total - paidAmount)),
  };
}
