import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import {
  administrationActivityEventSchema,
  administrationOrderActivityEventSchema,
  administrationOperationalActivityEventSchema,
  salesActivityItemSchema,
} from "../index.ts";

const instant = "2026-11-15T10:00:00.000Z";
const summary = () => ({
  id: randomUUID(),
  orderId: randomUUID(),
  orderVersion: 2,
  businessNumber: "SHOP-2026-0001",
  operation: "ADMIN_CORRECT",
  actor: {
    id: randomUUID(),
    fullName: "Admin",
    role: "ADMIN",
    department: null,
  },
  occurredAt: instant,
  pieceIds: [],
  changedFields: ["customerAddress"],
});
const fullCorrection = () => {
  const event = summary();
  const before = {
    version: 1,
    status: "APPROVED",
    counts: {
      original: 1,
      cancelled: 0,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
    money: {
      total: "650.00",
      paidAmount: "0.00",
      remainingDue: "650.00",
      surplus: "0.00",
    },
    correction: {
      customerName: "Customer",
      customerPhone: "+966500000001",
      customerEmail: null,
      customerAddress: "Building A",
      generalNotes: null,
    },
    pieces: [
      {
        id: randomUUID(),
        stage: "CUTTING",
        workState: "IN_PROGRESS",
        issueId: null,
        currentWorkVisitId: randomUUID(),
        receivedAt: null,
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    returnProof: null,
  };
  return {
    ...event,
    reason: "Correct building",
    before,
    after: {
      ...before,
      version: 2,
      correction: { ...before.correction, customerAddress: "Building B" },
    },
  };
};
it("keeps full audit confined to its strict schema and accepts only the value-free summary in mixed sales history", () => {
  const full = fullCorrection();
  expect(administrationActivityEventSchema.parse(full)).toEqual(full);
  expect(
    salesActivityItemSchema.safeParse({ kind: "administration", event: full })
      .success,
  ).toBe(false);
  const safe = summary();
  expect(
    salesActivityItemSchema.parse({ kind: "administration", event: safe }),
  ).toEqual({ kind: "administration", event: safe });
  for (const extra of [
    { reason: full.reason },
    { before: full.before },
    { after: full.after },
    { customerAddress: "Private" },
    { money: full.before.money },
    { notes: "Private" },
  ])
    expect(
      administrationOrderActivityEventSchema.safeParse({ ...safe, ...extra })
        .success,
    ).toBe(false);
});
it("binds full audit fields and versions to its actual retained correction", () => {
  const full = fullCorrection();
  for (const invalid of [
    { ...full, changedFields: ["customerPhone"] },
    { ...full, changedFields: ["customerAddress", "customerAddress"] },
    { ...full, orderVersion: 3 },
    { ...full, pieceIds: [randomUUID()] },
    { ...full, after: { ...full.after, status: "DELIVERED" } },
    { ...full, actor: { ...full.actor, role: "USER", department: "SALES" } },
    { ...full, reason: " " },
  ])
    expect(administrationActivityEventSchema.safeParse(invalid).success).toBe(
      false,
    );
});
it("accepts only cancellation identity/status facts in operational history", () => {
  const { changedFields: _changed, ...event } = summary();
  const minimal = {
    ...event,
    operation: "ADMIN_CANCEL",
    pieceIds: [randomUUID()],
    beforeStatus: "APPROVED",
    afterStatus: "CANCELLED",
  };
  expect(administrationOperationalActivityEventSchema.parse(minimal)).toEqual(
    minimal,
  );
  for (const extra of [
    { reason: "Private" },
    { changedFields: ["status"] },
    { department: "CUTTING" },
    { before: {} },
    { paidAmount: "0.00" },
    { customerName: "Private" },
  ])
    expect(
      administrationOperationalActivityEventSchema.safeParse({
        ...minimal,
        ...extra,
      }).success,
    ).toBe(false);
  for (const invalid of [
    { ...minimal, operation: "ADMIN_CORRECT" },
    { ...minimal, pieceIds: [] },
    { ...minimal, pieceIds: [...minimal.pieceIds, ...minimal.pieceIds] },
  ])
    expect(
      administrationOperationalActivityEventSchema.safeParse(invalid).success,
    ).toBe(false);
});
it("requires exact operation-specific field labels and sorted retained selection", () => {
  const body = summary();
  for (const changedFields of [
    [],
    ["cancellation"],
    ["generalNotes", "customerAddress"],
    ["status"],
  ])
    expect(
      administrationOrderActivityEventSchema.safeParse({
        ...body,
        changedFields,
      }).success,
    ).toBe(false);
  const ids = Array.from({ length: 2 }, () => randomUUID()).sort();
  const cancel = {
    ...body,
    operation: "ADMIN_CANCEL",
    pieceIds: ids,
    changedFields: ["cancellation", "status", "total"],
  };
  expect(administrationOrderActivityEventSchema.parse(cancel)).toEqual(cancel);
  expect(
    administrationOrderActivityEventSchema.safeParse({
      ...cancel,
      pieceIds: ids.toReversed(),
    }).success,
  ).toBe(false);
  expect(
    administrationOrderActivityEventSchema.safeParse({
      ...cancel,
      changedFields: ["customerAddress"],
    }).success,
  ).toBe(false);
});

it("binds full cancellation field labels to exact selected effects and status/money changes", () => {
  const correction = fullCorrection();
  const event = {
    ...correction,
    operation: "ADMIN_CANCEL",
    pieceIds: correction.before.pieces.map((piece) => piece.id),
    changedFields: ["cancellation", "status", "total"],
    after: {
      ...correction.before,
      version: 2,
      status: "CANCELLED",
      counts: {
        original: 1,
        cancelled: 1,
        active: 0,
        received: 0,
        completionPercent: 0,
      },
      money: {
        total: "0.00",
        paidAmount: "0.00",
        remainingDue: "0.00",
        surplus: "0.00",
      },
      pieces: correction.before.pieces.map((piece) => ({
        ...piece,
        stage: "CANCELLED",
        workState: "BLOCKED",
        currentWorkVisitId: null,
        cancelledAt: instant,
        cancellationReason: correction.reason,
      })),
    },
  };
  expect(administrationActivityEventSchema.parse(event)).toEqual(event);
  for (const changedFields of [
    ["cancellation"],
    ["cancellation", "status"],
    ["cancellation", "total"],
  ])
    expect(
      administrationActivityEventSchema.safeParse({ ...event, changedFields })
        .success,
    ).toBe(false);
});
