import { expect, it } from "vitest";
import {
  administrationCommandBodySchema,
  administrationCommandDataSchema,
} from "@template/contracts";
import { ApiContractError } from "@/services/api/api-client";
import {
  p08CorrectionCommandFixture,
  p08CommandFactsFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import { bindAdministrationCommandResult } from "./administration-command-binding.model";

it("binds original and historical replay without treating it as current order state", () => {
  const { body, result } = p08CorrectionCommandFixture();
  expect(bindAdministrationCommandResult(result, body, p03Ids.actor)).toEqual(
    result,
  );
  expect(
    bindAdministrationCommandResult(
      { ...result, replayed: true },
      body,
      p03Ids.actor,
    ),
  ).toEqual({ ...result, replayed: true });
  for (const changed of [
    { ...body, commandId: p03Ids.customer },
    { ...body, orderId: p03Ids.customer },
    { ...body, expectedVersion: 2 },
    { ...body, patch: { customerAddress: "Another address" } },
    {
      ...body,
      patch: {
        customerAddress: body.patch.customerAddress,
        customerName: "Unexpected name",
      },
    },
  ])
    expect(() =>
      bindAdministrationCommandResult(result, changed, p03Ids.actor),
    ).toThrow(ApiContractError);
  expect(() =>
    bindAdministrationCommandResult(result, body, p03Ids.customer),
  ).toThrow(ApiContractError);
});
it("rejects a malformed rewrite of the original returned proof", () => {
  const { body, result } = p08CorrectionCommandFixture();
  const before = {
      ...result.before,
      status: "RETURNED",
      returnProof: {
        decisionId: p03Ids.customer,
        reason: "Original return",
        returnedAt: p03Instant,
        version: 1,
      },
    },
    after = {
      ...result.after,
      status: "RETURNED",
      returnProof: {
        decisionId: p03Ids.customer,
        reason: "Original return",
        returnedAt: p03Instant,
        version: 2,
      },
    };
  const returned = administrationCommandDataSchema.parse({
    ...result,
    before,
    after,
    result: { ...result.result, status: "RETURNED" },
  });
  expect(bindAdministrationCommandResult(returned, body, p03Ids.actor)).toEqual(
    returned,
  );
  const rewritten = {
    ...returned,
    after: {
      ...returned.after,
      returnProof: { ...after.returnProof, reason: "Fabricated replacement" },
    },
  };
  expect(() =>
    bindAdministrationCommandResult(rewritten, body, p03Ids.actor),
  ).toThrow(ApiContractError);
});
it("binds the exact cancellation set, whole-active scope, custom reason and preserved paid", () => {
  const before = p08CommandFactsFixture(),
    after = p08CommandFactsFixture(2);
  before.pieces.push({
    ...before.pieces[0],
    id: p03Ids.source,
    stage: "AWAITING_APPROVAL",
    workState: "INCOMING",
    issueId: null,
    currentWorkVisitId: null,
    receivedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  });
  before.counts = {
    original: 2,
    active: 2,
    cancelled: 0,
    received: 0,
    completionPercent: 0,
  };
  before.money = {
    total: "3600.00",
    paidAmount: "0.00",
    remainingDue: "3600.00",
    surplus: "0.00",
  };
  after.pieces = before.pieces.map((piece) =>
    piece.id === p03Ids.piece
      ? {
          ...piece,
          stage: "CANCELLED",
          workState: "BLOCKED",
          cancelledAt: p03Instant,
          cancellationReason: "Exact reason",
        }
      : piece,
  );
  after.counts = {
    original: 2,
    active: 1,
    cancelled: 1,
    received: 0,
    completionPercent: 0,
  };
  const original = p08CorrectionCommandFixture().result;
  const saved = administrationCommandDataSchema.parse({
    ...original,
    receipt: { ...original.receipt, operation: "ADMIN_CANCEL" },
    before,
    after,
    result: {
      ...original.result,
      correction: after.correction,
      counts: after.counts,
      money: after.money,
      pieceIds: [p03Ids.piece],
    },
  });
  const body = administrationCommandBodySchema.parse({
    commandId: p03Ids.command,
    orderId: p03Ids.order,
    expectedVersion: 1,
    operation: "ADMIN_CANCEL",
    scope: "QUANTITY",
    pieceIds: [p03Ids.piece],
    reason: "Exact reason",
  });
  if (body.operation !== "ADMIN_CANCEL")
    throw new Error("Expected owned cancellation intent");
  expect(bindAdministrationCommandResult(saved, body, p03Ids.actor)).toEqual(
    saved,
  );
  expect(() =>
    bindAdministrationCommandResult(
      saved,
      { ...body, scope: "ORDER" },
      p03Ids.actor,
    ),
  ).toThrow(ApiContractError);
  expect(() =>
    bindAdministrationCommandResult(
      saved,
      { ...body, pieceIds: [p03Ids.source] },
      p03Ids.actor,
    ),
  ).toThrow(ApiContractError);
  expect(() =>
    bindAdministrationCommandResult(
      saved,
      { ...body, reason: "Changed reason" },
      p03Ids.actor,
    ),
  ).toThrow(ApiContractError);
  const paid = {
    ...saved,
    after: {
      ...after,
      money: { ...after.money, paidAmount: "100.00", remainingDue: "1700.00" },
    },
    result: {
      ...saved.result,
      money: { ...after.money, paidAmount: "100.00", remainingDue: "1700.00" },
    },
  };
  expect(() =>
    bindAdministrationCommandResult(paid, body, p03Ids.actor),
  ).toThrow(ApiContractError);
});

it.each(["OUT_FOR_DELIVERY", "DELIVERED"] as const)(
  "rejects otherwise structured cancellation in %s custody",
  (status) => {
    const before = p08CommandFactsFixture(),
      after = p08CommandFactsFixture(2),
      original = p08CorrectionCommandFixture().result;
    before.status = status;
    before.counts = { ...before.counts, received: 1, completionPercent: 100 };
    before.pieces = before.pieces.map((piece) => ({
      ...piece,
      stage: "WAREHOUSE",
      workState: "COMPLETED",
      receivedAt: p03Instant,
    }));
    after.status = "CANCELLED";
    after.counts = {
      original: 1,
      cancelled: 1,
      active: 0,
      received: 0,
      completionPercent: 0,
    };
    after.money = {
      total: "0.00",
      paidAmount: "0.00",
      remainingDue: "0.00",
      surplus: "0.00",
    };
    after.pieces = before.pieces.map((piece) => ({
      ...piece,
      stage: "CANCELLED",
      workState: "BLOCKED",
      cancelledAt: p03Instant,
      cancellationReason: "Denied custody",
    }));
    const saved = administrationCommandDataSchema.parse({
      ...original,
      receipt: { ...original.receipt, operation: "ADMIN_CANCEL" },
      before,
      after,
      result: {
        ...original.result,
        status: after.status,
        counts: after.counts,
        money: after.money,
        correction: after.correction,
        pieceIds: [p03Ids.piece],
      },
    });
    const body = administrationCommandBodySchema.parse({
      commandId: p03Ids.command,
      orderId: p03Ids.order,
      expectedVersion: 1,
      operation: "ADMIN_CANCEL",
      scope: "ITEM",
      pieceIds: [p03Ids.piece],
      reason: "Denied custody",
    });
    expect(() =>
      bindAdministrationCommandResult(saved, body, p03Ids.actor),
    ).toThrow(ApiContractError);
  },
);
