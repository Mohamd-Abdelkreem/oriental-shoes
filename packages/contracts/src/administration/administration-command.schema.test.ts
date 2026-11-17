import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  administrationCommandFactsSchema,
  type AdministrationCommandData,
} from "../index.ts";

const instant = "2026-11-15T12:00:00.000Z";
const intent = () => ({
  commandId: randomUUID(),
  orderId: randomUUID(),
  expectedVersion: 1,
});
const cancelBody = () => ({
  ...intent(),
  operation: "ADMIN_CANCEL",
  scope: "QUANTITY",
  pieceIds: [randomUUID()],
});
const correctBody = () => ({
  ...intent(),
  operation: "ADMIN_CORRECT",
  patch: { customerAddress: "Building B" },
  reason: "Correct address",
});
const correction = () => ({
  generalNotes: null,
  customerName: "Customer",
  customerPhone: "+966500000001",
  customerEmail: null,
  customerAddress: "Building A",
});
const piece = () => ({
  id: randomUUID(),
  stage: "PRODUCTION",
  workState: "IN_PROGRESS",
  issueId: null,
  currentWorkVisitId: randomUUID(),
  receivedAt: null,
  cancelledAt: null,
  cancellationReason: null,
});
const cancellationResult = (): AdministrationCommandData => {
  const before = administrationCommandFactsSchema.parse({
    version: 1,
    status: "APPROVED",
    counts: {
      original: 2,
      cancelled: 0,
      active: 2,
      received: 0,
      completionPercent: 0,
    },
    money: {
      total: "1300.00",
      paidAmount: "1000.00",
      remainingDue: "300.00",
      surplus: "0.00",
    },
    correction: correction(),
    pieces: [piece(), piece()],
    returnProof: null,
  });
  const selected = before.pieces[0];
  if (!selected) throw new Error("Missing synthetic selected piece");
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: 2,
    counts: { ...before.counts, cancelled: 1, active: 1 },
    money: {
      total: "650.00",
      paidAmount: "1000.00",
      remainingDue: "0.00",
      surplus: "350.00",
    },
    pieces: before.pieces.map((candidate) =>
      candidate.id === selected.id
        ? {
            ...candidate,
            stage: "CANCELLED",
            workState: "BLOCKED",
            currentWorkVisitId: null,
            cancelledAt: instant,
            cancellationReason: "Administrative cancellation",
          }
        : candidate,
    ),
  });
  const orderId = randomUUID();
  return administrationCommandDataSchema.parse({
    receipt: {
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId,
      beforeVersion: 1,
      afterVersion: 2,
      actor: {
        id: randomUUID(),
        fullName: "Administrator",
        role: "ADMIN",
        department: null,
      },
      occurredAt: instant,
    },
    replayed: false,
    before,
    after,
    result: {
      orderId,
      version: after.version,
      status: after.status,
      counts: after.counts,
      money: after.money,
      correction: after.correction,
      pieceIds: [selected.id],
    },
  });
};

describe("exact administrative command intent", () => {
  it("canonicalizes exact unique identities and optional reason while retaining the caller's array", () => {
    const ids = Array.from({ length: 200 }, () => randomUUID())
      .sort()
      .reverse();
    const body = { ...cancelBody(), pieceIds: ids, reason: "  " };
    expect(administrationCommandBodySchema.parse(body)).toEqual({
      ...body,
      pieceIds: ids.toSorted(),
      reason: null,
    });
    expect(body.pieceIds).toEqual(ids);
    expect(administrationCommandBodySchema.parse(cancelBody())).toMatchObject({
      reason: null,
    });
    expect(
      administrationCommandBodySchema.parse({
        ...cancelBody(),
        reason: "Custom reason",
      }),
    ).toMatchObject({ reason: "Custom reason" });
  });
  it.each(["ORDER", "ITEM", "QUANTITY"])(
    "rejects empty, duplicate, foreign-shaped and oversized %s selections",
    (scope) => {
      const body = { ...cancelBody(), scope };
      const id = randomUUID();
      for (const pieceIds of [
        [],
        [id, id],
        ["bad-id"],
        Array.from({ length: 201 }, () => randomUUID()),
      ])
        expect(
          administrationCommandBodySchema.safeParse({ ...body, pieceIds })
            .success,
        ).toBe(false);
      expect(
        administrationCommandBodySchema.safeParse({ ...body, pieceIds: [id] })
          .success,
      ).toBe(true);
      expect(
        administrationCommandBodySchema.safeParse({
          ...body,
          pieceIds: [id, randomUUID()],
        }).success,
      ).toBe(scope !== "ITEM");
    },
  );
  it("rejects caller authority, quantities and correction fields outside the allowlist", () => {
    for (const extra of [
      { quantity: 1 },
      { actor: "ADMIN" },
      { paidAmount: "0.00" },
      { timestamp: instant },
      { eligible: true },
    ])
      expect(
        administrationCommandBodySchema.safeParse({ ...cancelBody(), ...extra })
          .success,
      ).toBe(false);
    for (const extra of [
      { scope: "ORDER" },
      { pieceIds: [] },
      { total: "0.00" },
    ])
      expect(
        administrationCommandBodySchema.safeParse({
          ...correctBody(),
          ...extra,
        }).success,
      ).toBe(false);
    for (const patch of [
      {},
      { price: "0.00" },
      { paidAmount: "0.00" },
      { customerId: randomUUID() },
      { status: "APPROVED" },
      { sideNotes: "piece note" },
    ])
      expect(
        administrationCommandBodySchema.safeParse({ ...correctBody(), patch })
          .success,
      ).toBe(false);
  });
  it("normalizes permitted contacts and distinguishes omitted fields from explicit clears", () => {
    const body = correctBody();
    expect(administrationCommandBodySchema.parse(body)).toEqual(body);
    const patch = {
      customerName: "  Customer  ",
      customerPhone: "050 000 0001",
      customerEmail: " ",
      customerAddress: " ",
      generalNotes: " ",
    };
    expect(
      administrationCommandBodySchema.parse({
        ...body,
        patch,
        reason: "  Correct details  ",
      }),
    ).toMatchObject({
      patch: { ...correction(), customerAddress: null },
      reason: "Correct details",
    });
    expect(
      administrationCommandBodySchema.parse({
        ...body,
        patch: { customerEmail: null },
      }),
    ).toMatchObject({ patch: { customerEmail: null } });
    for (const patch of [
      { customerName: " " },
      { customerName: null },
      { customerPhone: null },
      { customerPhone: "123" },
      { customerEmail: "bad" },
      { customerAddress: "A".repeat(2001) },
      { generalNotes: "\u0000" },
    ])
      expect(
        administrationCommandBodySchema.safeParse({ ...body, patch }).success,
      ).toBe(false);
  });
  it("bounds reasons, pre-normalization UTF-8 input and executable versions", () => {
    const body = correctBody();
    for (const reason of ["", " ", "x".repeat(4001), "\u0000"])
      expect(
        administrationCommandBodySchema.safeParse({ ...body, reason }).success,
      ).toBe(false);
    expect(
      administrationCommandBodySchema.safeParse({
        ...body,
        reason: "x".repeat(4000),
      }).success,
    ).toBe(true);
    expect(
      administrationCommandBodySchema.safeParse({
        ...body,
        patch: { customerName: " ".repeat(65_536) + "A" },
      }).success,
    ).toBe(false);
    expect(
      administrationCommandBodySchema.safeParse({
        ...body,
        patch: { customerName: "\u3000".repeat(22_000) + "A" },
      }).success,
    ).toBe(false);
    expect(
      administrationCommandBodySchema.safeParse({
        ...body,
        expectedVersion: 2_147_483_646,
      }).success,
    ).toBe(true);
    for (const expectedVersion of [0, 1.5, 2_147_483_647])
      expect(
        administrationCommandBodySchema.safeParse({ ...body, expectedVersion })
          .success,
      ).toBe(false);
  });
});

describe("retained administrative facts and result binding", () => {
  it("retains exact cancellation, unchanged paid and companion facts with a replayable receipt", () => {
    const command = cancellationResult();
    expect(
      administrationCommandDataSchema.parse({ ...command, replayed: true }),
    ).toEqual({ ...command, replayed: true });
    expect(command.after.money.surplus).toBe("350.00");
    expect(command.after.pieces[1]).toEqual(command.before.pieces[1]);
    for (const invalid of [
      {
        ...command,
        receipt: {
          ...command.receipt,
          actor: {
            ...command.receipt.actor,
            role: "USER",
            department: "SALES",
          },
        },
      },
      { ...command, receipt: { ...command.receipt, orderId: randomUUID() } },
      { ...command, receipt: { ...command.receipt, afterVersion: 3 } },
      { ...command, result: { ...command.result, pieceIds: [randomUUID()] } },
      { ...command, result: { ...command.result, pieceIds: [] } },
      {
        ...command,
        after: {
          ...command.after,
          money: {
            ...command.after.money,
            paidAmount: "999.00",
            surplus: "349.00",
          },
        },
      },
      {
        ...command,
        after: {
          ...command.after,
          counts: { ...command.after.counts, cancelled: 0, active: 2 },
        },
      },
      {
        ...command,
        before: {
          ...command.before,
          pieces: [command.before.pieces[0], command.before.pieces[0]],
        },
      },
    ])
      expect(administrationCommandDataSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("accepts terminal-order information correction without lifecycle, paid or physical rewrites", () => {
    const cancelled = cancellationResult();
    const before = { ...cancelled.before, status: "DELIVERED" };
    const after = {
      ...before,
      version: 2,
      correction: { ...before.correction, customerAddress: "Building B" },
    };
    const command = {
      ...cancelled,
      receipt: { ...cancelled.receipt, operation: "ADMIN_CORRECT" },
      before,
      after,
      result: {
        ...cancelled.result,
        status: after.status,
        counts: after.counts,
        money: after.money,
        correction: after.correction,
        pieceIds: [],
      },
    };
    expect(administrationCommandDataSchema.parse(command)).toEqual(command);
    for (const invalid of [
      { ...command, after: { ...after, status: "APPROVED" } },
      {
        ...command,
        after: { ...after, correction: before.correction },
        result: { ...command.result, correction: before.correction },
      },
      {
        ...command,
        result: { ...command.result, pieceIds: cancelled.result.pieceIds },
      },
      {
        ...command,
        after: {
          ...after,
          returnProof: {
            decisionId: randomUUID(),
            reason: "forged",
            returnedAt: instant,
            version: 2,
          },
        },
      },
    ])
      expect(administrationCommandDataSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("binds carried returned proof to unchanged decision, reason and time", () => {
    const command = cancellationResult();
    const proof = {
      decisionId: randomUUID(),
      reason: "Original return",
      returnedAt: instant,
      version: 1,
    };
    const returned = {
      ...command,
      before: { ...command.before, status: "RETURNED", returnProof: proof },
      after: {
        ...command.after,
        status: "RETURNED",
        returnProof: { ...proof, version: 2 },
      },
      result: { ...command.result, status: "RETURNED" },
    };
    expect(administrationCommandDataSchema.safeParse(returned).success).toBe(
      true,
    );
    for (const patch of [
      { reason: "Changed return" },
      { version: 1 },
      { decisionId: randomUUID() },
      { returnedAt: "2026-11-16T12:00:00.000Z" },
    ])
      expect(
        administrationCommandDataSchema.safeParse({
          ...returned,
          after: {
            ...returned.after,
            returnProof: { ...proof, version: 2, ...patch },
          },
        }).success,
      ).toBe(false);
  });
});
