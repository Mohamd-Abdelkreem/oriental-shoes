import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@template/database";
import type { ManufacturingCommandBody } from "@template/contracts";
import { expect, it, vi } from "vitest";
import {
  hashManufacturingCommandIntent,
  ManufacturingCommandExecutor,
} from "./manufacturing-command-executor.js";

const body = (): ManufacturingCommandBody => ({
  commandId: randomUUID(),
  operation: "RECEIVE_AND_START",
  orders: [
    {
      orderId: randomUUID(),
      expectedVersion: 2,
      pieceIds: [randomUUID(), randomUUID()],
    },
    { orderId: randomUUID(), expectedVersion: 4, pieceIds: [randomUUID()] },
  ],
});

it("hashes the same exact set identically while binding department, operation, every version and piece", () => {
  const capture = body(),
    first = capture.orders[0];
  if (!first) throw new Error("Expected exact group");
  const hash = hashManufacturingCommandIntent({
    department: "CUTTING",
    body: capture,
  });
  const reordered = {
    ...capture,
    commandId: randomUUID(),
    orders: [...capture.orders]
      .reverse()
      .map((order) => ({ ...order, pieceIds: [...order.pieceIds].reverse() })),
  };
  expect(
    hashManufacturingCommandIntent({ department: "CUTTING", body: reordered }),
  ).toBe(hash);
  expect(
    hashManufacturingCommandIntent({ department: "PRODUCTION", body: capture }),
  ).not.toBe(hash);
  expect(
    hashManufacturingCommandIntent({
      department: "CUTTING",
      body: { ...capture, operation: "CONTINUE" },
    }),
  ).not.toBe(hash);
  expect(
    hashManufacturingCommandIntent({
      department: "CUTTING",
      body: {
        ...capture,
        orders: [{ ...first, expectedVersion: 3 }, ...capture.orders.slice(1)],
      },
    }),
  ).not.toBe(hash);
  expect(
    hashManufacturingCommandIntent({
      department: "CUTTING",
      body: {
        ...capture,
        orders: [
          { ...first, pieceIds: [randomUUID()] },
          ...capture.orders.slice(1),
        ],
      },
    }),
  ).not.toBe(hash);
  const pieceId = first.pieceIds[0];
  if (!pieceId) throw new Error("Expected piece");
  expect(() =>
    hashManufacturingCommandIntent({
      department: "CUTTING",
      body: {
        ...capture,
        orders: [{ ...first, pieceIds: [pieceId, pieceId] }],
      },
    }),
  ).toThrow();
});

it.each(["unknown", "serialization"] as const)(
  "bounds %s transaction failures without claiming persistence",
  async (kind) => {
    // The mocked database transaction is outside this retry-policy claim, never rollback evidence.
    const database = createDatabaseClient(
      "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
    );
    const failure =
      kind === "unknown"
        ? new Error("Commit outcome unknown")
        : Object.assign(new Error("Serialization abort"), { code: "P2034" });
    const transaction = vi
      .spyOn(database, "$transaction")
      .mockRejectedValue(failure);
    try {
      const attempt = new ManufacturingCommandExecutor(database).execute({
        actorId: randomUUID(),
        department: "CUTTING",
        body: body(),
      });
      if (kind === "unknown") await expect(attempt).rejects.toBe(failure);
      else
        await expect(attempt).rejects.toMatchObject({
          code: "MANUFACTURING_TRANSACTION_CONFLICT",
        });
      expect(transaction).toHaveBeenCalledTimes(kind === "unknown" ? 1 : 2);
    } finally {
      transaction.mockRestore();
      await database.$disconnect();
    }
  },
);
