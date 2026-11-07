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

it("restricts resubmit and paid hints after department reassignment while preserving the ADMIN paid exception", async () => {
  const { deriveSalesOrderActions } = await import("./sales-orders.mapper.js");
  const order = {
    ownerId: "owner",
    status: "APPROVED" as const,
    approvedAt: new Date("2026-11-07T01:00:00Z"),
    currentReturn: false,
  };
  expect(
    deriveSalesOrderActions(order, {
      id: "owner",
      role: "USER",
      department: "APPROVAL",
    }),
  ).toEqual({ canResubmit: false, canSetPaid: false });
  expect(
    deriveSalesOrderActions(order, {
      id: "owner",
      role: "USER",
      department: "SALES",
    }).canSetPaid,
  ).toBe(true);
  expect(
    deriveSalesOrderActions(order, {
      id: "other",
      role: "ADMIN",
      department: null,
    }).canSetPaid,
  ).toBe(true);
  expect(
    deriveSalesOrderActions(order, {
      id: "other",
      role: "USER",
      department: "SALES",
    }).canSetPaid,
  ).toBe(false);
  const returned = {
    ...order,
    status: "RETURNED" as const,
    currentReturn: true,
  };
  expect(
    deriveSalesOrderActions(returned, {
      id: "owner",
      role: "USER",
      department: "APPROVAL",
    }),
  ).toEqual({ canResubmit: false, canSetPaid: false });
  expect(
    deriveSalesOrderActions(returned, {
      id: "owner",
      role: "USER",
      department: "SALES",
    }),
  ).toEqual({ canResubmit: true, canSetPaid: false });
  expect(
    deriveSalesOrderActions(returned, {
      id: "other",
      role: "ADMIN",
      department: null,
    }),
  ).toEqual({ canResubmit: false, canSetPaid: false });
});
