import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { salesActivityItemSchema } from "../sales-orders/sales-orders.schema.ts";
import {
  warehouseActivityEventSchema,
  warehouseAttemptSchema,
} from "./warehouse-event.schema.ts";

const actor = {
  id: randomUUID(),
  fullName: "Warehouse A",
  role: "USER",
  department: "WAREHOUSE",
};
const instant = "2026-11-14T00:00:00Z",
  later = "2026-11-14T01:00:00Z";
const dispatch = () => {
  const orderId = randomUUID(),
    pieceIds = [randomUUID()];
  return {
    id: randomUUID(),
    commandId: randomUUID(),
    orderId,
    orderVersion: 9,
    businessNumber: "SHOP-2026-0001",
    operation: "DISPATCH",
    actor,
    occurredAt: instant,
    pieceIds,
    beforeStatus: "READY_FOR_DELIVERY",
    afterStatus: "OUT_FOR_DELIVERY",
    receiptGroup: null,
    retry: null,
    attempt: {
      id: randomUUID(),
      orderId,
      number: 1,
      pieceIds,
      status: "DISPATCHED",
      dispatchedBy: actor,
      dispatchedAt: instant,
      deliveryNote: "  Original note  ",
      outcome: null,
      retry: null,
    },
  };
};
it("keeps original dispatch immutable in the shared activity discriminator", () => {
  const event = dispatch();
  expect(warehouseActivityEventSchema.parse(event)).toEqual(event);
  expect(salesActivityItemSchema.parse({ kind: "warehouse", event })).toEqual({
    kind: "warehouse",
    event,
  });
  const outcome = {
    kind: "DELIVERED",
    id: randomUUID(),
    recordedBy: actor,
    recordedAt: later,
    recipient: null,
    deliveredAt: null,
    notes: null,
  };
  const delivered = { ...event.attempt, status: "DELIVERED", outcome };
  expect(warehouseAttemptSchema.parse(delivered)).toEqual(delivered);
  expect(
    warehouseActivityEventSchema.safeParse({ ...event, attempt: delivered })
      .success,
  ).toBe(false);
  expect(
    warehouseActivityEventSchema.safeParse({
      ...event,
      attempt: { ...event.attempt, orderId: randomUUID() },
    }).success,
  ).toBe(false);
  expect(
    warehouseActivityEventSchema.safeParse({
      ...event,
      attempt: { ...event.attempt, pieceIds: [randomUUID()] },
    }).success,
  ).toBe(false);
});
it("binds complete receipt, failed-return and retry events to original actors/times and complete scope", () => {
  const event = dispatch();
  const failure = {
    kind: "FAILED",
    id: randomUUID(),
    recordedBy: actor,
    recordedAt: later,
    returnedToWarehouse: true,
    reason: "Customer unavailable",
    notes: null,
  };
  const attempt = { ...event.attempt, status: "FAILED", outcome: failure };
  const failed = {
    ...event,
    id: randomUUID(),
    operation: "FAIL_DELIVERY",
    orderVersion: 10,
    occurredAt: later,
    beforeStatus: "OUT_FOR_DELIVERY",
    afterStatus: "DELIVERY_FAILED",
    attempt,
  };
  expect(warehouseActivityEventSchema.parse(failed)).toEqual(failed);
  expect(
    warehouseAttemptSchema.safeParse({
      ...attempt,
      outcome: { ...failure, returnedToWarehouse: false },
    }).success,
  ).toBe(false);
  const retry = {
    id: randomUUID(),
    actor,
    occurredAt: later,
    retryDate: null,
    notes: "Retry later",
  };
  const retried = {
    ...failed,
    id: randomUUID(),
    operation: "RETRY_DELIVERY",
    orderVersion: 11,
    beforeStatus: "DELIVERY_FAILED",
    afterStatus: "READY_FOR_DELIVERY",
    retry,
    attempt: { ...attempt, retry },
  };
  expect(warehouseActivityEventSchema.parse(retried)).toEqual(retried);
  expect(
    warehouseActivityEventSchema.safeParse({
      ...failed,
      attempt: retried.attempt,
    }).success,
  ).toBe(false);
  expect(
    warehouseActivityEventSchema.safeParse({
      ...retried,
      retry: { ...retry, notes: "Changed" },
    }).success,
  ).toBe(false);
  const receipt = {
    id: randomUUID(),
    orderId: event.orderId,
    pieceIds: event.pieceIds,
    actor,
    receivedAt: instant,
    cartonCount: null,
    storageLocation: null,
    notes: null,
  };
  const received = {
    ...event,
    operation: "RECEIVE",
    beforeStatus: "APPROVED",
    afterStatus: "READY_FOR_DELIVERY",
    attempt: null,
    receiptGroup: receipt,
  };
  expect(warehouseActivityEventSchema.parse(received)).toEqual(received);
  expect(
    warehouseActivityEventSchema.safeParse({
      ...received,
      receiptGroup: { ...receipt, actor: { ...actor, id: randomUUID() } },
    }).success,
  ).toBe(false);
});
