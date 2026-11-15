import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseCommandOperationSchema,
  warehouseDeliveredAtSchema,
  warehouseOptionalTextSchema,
  warehouseRetryDateSchema,
  type WarehouseCommandOperation,
} from "./warehouse-command.schema.ts";

const selection = () => ({
  orderId: randomUUID(),
  expectedVersion: 8,
  pieceIds: [randomUUID()],
});
const body = (operation: WarehouseCommandOperation) => {
  const group = selection();
  const identity = { commandId: randomUUID(), operation };
  switch (operation) {
    case "RECEIVE":
      return { ...identity, orders: [{ ...group }] };
    case "DISPATCH":
      return {
        ...identity,
        orders: [{ ...group, deliveryNote: "  Handle carefully  " }],
      };
    case "CONFIRM_DELIVERY":
      return {
        ...identity,
        orders: [
          {
            ...group,
            attemptId: randomUUID(),
            recipient: "Recipient",
            deliveredAt: "2026-11-13T14:30:00+02:00",
          },
        ],
      };
    case "FAIL_DELIVERY":
      return {
        ...identity,
        orders: [
          {
            ...group,
            attemptId: randomUUID(),
            returnedToWarehouse: true,
            reason: "Customer unavailable",
          },
        ],
      };
    case "RETRY_DELIVERY":
      return {
        ...identity,
        orders: [
          { ...group, attemptId: randomUUID(), retryDate: "2026-11-15" },
        ],
      };
  }
};
it.each(warehouseCommandOperationSchema.options)(
  "parses %s without inventing optional capture",
  (operation) => {
    const parsed = warehouseCommandBodySchema.parse(body(operation));
    expect(parsed.operation).toBe(operation);
    switch (parsed.operation) {
      case "RECEIVE":
        expect(parsed.orders[0]?.receipt).toEqual({
          cartonCount: null,
          storageLocation: null,
          notes: null,
        });
        break;
      case "DISPATCH":
        expect(parsed.orders[0]?.deliveryNote).toBe("  Handle carefully  ");
        break;
      case "CONFIRM_DELIVERY":
        expect(parsed.orders[0]).toMatchObject({
          recipient: "Recipient",
          deliveredAt: "2026-11-13T12:30:00.000Z",
          notes: null,
        });
        break;
      case "FAIL_DELIVERY":
        expect(parsed.orders[0]).toMatchObject({
          returnedToWarehouse: true,
          reason: "Customer unavailable",
          notes: null,
        });
        break;
      case "RETRY_DELIVERY":
        expect(parsed.orders[0]).toMatchObject({
          retryDate: "2026-11-15",
          notes: null,
        });
        break;
    }
  },
);
it.each([0, 1, 200, 201])(
  "enforces the %i-piece total budget across orders",
  (size) => {
    const request = {
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: Array.from({ length: size }, selection),
    };
    expect(warehouseCommandBodySchema.safeParse(request).success).toBe(
      size >= 1 && size <= 200,
    );
    expect(
      warehouseCommandBodySchema.safeParse({
        ...request,
        orders: [
          {
            ...selection(),
            pieceIds: Array.from({ length: size }, () => randomUUID()),
          },
        ],
      }).success,
    ).toBe(size >= 1 && size <= 200);
  },
);
it("rejects duplicate and cross-order physical identities rather than deduplicating", () => {
  const group = selection();
  const request = { commandId: randomUUID(), operation: "DISPATCH" };
  for (const orders of [
    [group, group],
    [{ ...group, pieceIds: [...group.pieceIds, ...group.pieceIds] }],
    [group, { ...selection(), pieceIds: group.pieceIds }],
  ])
    expect(
      warehouseCommandBodySchema.safeParse({ ...request, orders }).success,
    ).toBe(false);
});
it.each([undefined, null, "", " \n\t"])(
  "normalizes absent optional text and dates %j to null",
  (input) => {
    expect(warehouseOptionalTextSchema.parse(input)).toBeNull();
    expect(warehouseRetryDateSchema.parse(input)).toBeNull();
    expect(warehouseDeliveredAtSchema.parse(input)).toBeNull();
  },
);
it("preserves significant text and rejects invalid text before blank normalization", () => {
  for (const input of ["  Original note  ", "x".repeat(4000)])
    expect(warehouseOptionalTextSchema.parse(input)).toBe(input);
  for (const input of ["x".repeat(4001), " ".repeat(4001), "text\u0000"])
    expect(warehouseOptionalTextSchema.safeParse(input).success).toBe(false);
});
it.each([
  "2026-02-30",
  "2026-02-29",
  "0000-01-01",
  "2026-1-01",
  "2026-11-15T00:00:00Z",
  " 2026-11-15 ",
])("rejects invalid calendar retry date %s", (input) => {
  expect(warehouseRetryDateSchema.safeParse(input).success).toBe(false);
});
it.each(["0001-01-01", "2028-02-29", "9999-12-31"])(
  "retains valid retry calendar date %s",
  (input) => {
    expect(warehouseRetryDateSchema.parse(input)).toBe(input);
  },
);
it.each([
  "2026-02-30T14:30:00Z",
  "2026-11-13T14:30:00",
  "2026-11-13",
  "invalid",
])("rejects invalid or offsetless actual time %s", (input) => {
  expect(warehouseDeliveredAtSchema.safeParse(input).success).toBe(false);
});
it("requires acknowledged full return and entered reason and rejects authority/operation extras", () => {
  const request = body("FAIL_DELIVERY");
  const group = request.orders[0];
  if (!group) throw new Error("Group required");
  for (const changed of [
    { returnedToWarehouse: false },
    { returnedToWarehouse: undefined },
    { reason: null },
    { reason: undefined },
    { reason: " " },
    { reason: "x".repeat(4001) },
    { actorId: randomUUID() },
    { status: "DELIVERED" },
    { operation: "FAIL_DELIVERY" },
  ]) {
    expect(
      warehouseCommandBodySchema.safeParse({
        ...request,
        orders: [{ ...group, ...changed }],
      }).success,
    ).toBe(false);
  }
  expect(
    warehouseCommandBodySchema.safeParse({ ...request, actorId: randomUUID() })
      .success,
  ).toBe(false);
});
const commandResult = (operation: WarehouseCommandOperation) => ({
  kind: "warehouse-command",
  replayed: false,
  receipt: {
    commandId: randomUUID(),
    operation,
    actor: {
      id: randomUUID(),
      fullName: "Warehouse A",
      role: "USER",
      department: "WAREHOUSE",
    },
    occurredAt: "2026-11-14T00:00:00Z",
  },
  outcome: {
    orders: [
      {
        eventId: randomUUID(),
        orderId: randomUUID(),
        beforeVersion: 8,
        afterVersion: 9,
        status:
          operation === "RECEIVE"
            ? "APPROVED"
            : operation === "DISPATCH"
              ? "OUT_FOR_DELIVERY"
              : operation === "CONFIRM_DELIVERY"
                ? "DELIVERED"
                : operation === "FAIL_DELIVERY"
                  ? "DELIVERY_FAILED"
                  : "READY_FOR_DELIVERY",
        pieceIds: [randomUUID()],
        receiptGroupId: operation === "RECEIVE" ? randomUUID() : null,
        attemptId: operation === "RECEIVE" ? null : randomUUID(),
        retryId: operation === "RETRY_DELIVERY" ? randomUUID() : null,
      },
    ],
  },
});
it.each(warehouseCommandOperationSchema.options)(
  "binds %s results to exact versions/status/child identities",
  (operation) => {
    const result = commandResult(operation);
    expect(warehouseCommandDataSchema.parse(result)).toEqual(result);
    const group = result.outcome.orders[0];
    if (!group) throw new Error("Outcome required");
    for (const changed of [
      { afterVersion: 10 },
      { beforeVersion: 2147483647, afterVersion: 2147483647 },
      { status: "CANCELLED" },
      { pieceIds: [...group.pieceIds, ...group.pieceIds] },
      { receiptGroupId: operation === "RECEIVE" ? null : randomUUID() },
    ]) {
      expect(
        warehouseCommandDataSchema.safeParse({
          ...result,
          outcome: { orders: [{ ...group, ...changed }] },
        }).success,
      ).toBe(false);
    }
    expect(
      warehouseCommandDataSchema.safeParse({
        ...result,
        outcome: { orders: [group, group] },
      }).success,
    ).toBe(false);
    expect(
      warehouseCommandDataSchema.safeParse({
        ...result,
        receipt: {
          ...result.receipt,
          actor: { ...result.receipt.actor, department: "QUALITY" },
        },
      }).success,
    ).toBe(false);
    expect(
      warehouseCommandDataSchema.safeParse({ ...result, money: "private" })
        .success,
    ).toBe(false);
  },
);
