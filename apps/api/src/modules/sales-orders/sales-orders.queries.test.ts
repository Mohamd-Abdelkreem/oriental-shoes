import { expect, it } from "vitest";
import { mapCurrentOrderReturnProof } from "./sales-orders.queries.js";

it("rejects incomplete or stale projected return evidence defensively", () => {
  // Defensive projected-record fixtures; migrated PostgreSQL rejects these incomplete graphs.
  const proof = {
    status: "RETURNED",
    currentReturnDecisionId: "canonical",
    currentReturnOrderVersion: 2,
    currentReturnReason: "Review size",
    currentReturnedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const root = { status: "SUBMITTED" as const, version: 2, order: proof };
  expect(mapCurrentOrderReturnProof(root, "order")).toEqual({
    orderId: "order",
    decisionId: "canonical",
    orderVersion: 2,
    reason: "Review size",
    returnedAt: proof.currentReturnedAt,
  });
  for (const invalid of [
    null,
    { ...root, status: "DRAFT" as const },
    { ...root, order: null },
    ...Object.entries({
      status: "APPROVED",
      currentReturnDecisionId: null,
      currentReturnOrderVersion: 1,
      currentReturnReason: null,
      currentReturnedAt: null,
    }).map(([key, value]) => ({ ...root, order: { ...proof, [key]: value } })),
  ])
    expect(mapCurrentOrderReturnProof(invalid, "order")).toBeNull();
});
