import { randomUUID } from "node:crypto";
import { createDatabaseClient, Prisma } from "@template/database";
import { warehouseCommandBodySchema } from "@template/contracts";
import { expect, it, vi } from "vitest";
import {
  hashWarehouseCommandIntent,
  WarehouseCommandExecutor,
} from "./warehouse-command-executor.js";
import {
  isWarehouseCommandIdConflict,
  isWarehouseTransactionConflict,
} from "./warehouse.errors.js";
import { mapWarehouseCommandResult } from "./warehouse.mapper.js";
import type { WarehouseCommandRecord } from "./warehouse.types.js";

const capture = () =>
  warehouseCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "RECEIVE",
    orders: [1, 2].map(() => ({
      orderId: randomUUID(),
      expectedVersion: 7,
      pieceIds: [randomUUID(), randomUUID()],
      receipt: { cartonCount: " 2 ", storageLocation: " B-12 ", notes: null },
    })),
  });
it("hashes all normalized captures and scope while ignoring only key and set ordering", () => {
  const body = capture();
  if (body.operation !== "RECEIVE") throw new Error("Receipt capture required");
  const hash = hashWarehouseCommandIntent(body),
    first = body.orders[0];
  if (first === undefined) throw new Error("Group required");
  expect(
    hashWarehouseCommandIntent({
      ...body,
      commandId: randomUUID(),
      orders: [...body.orders].reverse().map((group) => ({
        ...group,
        pieceIds: [...group.pieceIds].reverse(),
      })),
    }),
  ).toBe(hash);
  for (const group of [
    { ...first, expectedVersion: 8 },
    { ...first, orderId: randomUUID() },
    { ...first, pieceIds: [randomUUID()] },
    { ...first, receipt: { ...first.receipt, notes: "Changed" } },
    { ...first, receipt: { ...first.receipt, cartonCount: "2" } },
    { ...first, receipt: { ...first.receipt, storageLocation: "B-12" } },
  ])
    expect(
      hashWarehouseCommandIntent({
        ...body,
        orders: [group, ...body.orders.slice(1)],
      }),
    ).not.toBe(hash);
  expect(
    hashWarehouseCommandIntent({
      ...body,
      orders: [
        { ...first, receipt: { ...first.receipt, notes: "   " } },
        ...body.orders.slice(1),
      ],
    }),
  ).toBe(hash);
});
it("binds attempt, recipient, delivery instant, return reason and retry date to intent", () => {
  const scope = {
    orderId: randomUUID(),
    expectedVersion: 9,
    pieceIds: [randomUUID()],
    attemptId: randomUUID(),
  };
  for (const [operation, fields, changes] of [
    [
      "CONFIRM_DELIVERY",
      {
        recipient: "Recipient",
        deliveredAt: "2026-11-14T10:00:00Z",
        notes: null,
      },
      [{ recipient: "Another" }, { deliveredAt: "2026-11-14T10:01:00Z" }],
    ],
    [
      "FAIL_DELIVERY",
      {
        returnedToWarehouse: true,
        reason: "Entire order returned",
        notes: null,
      },
      [{ reason: "Another reason" }],
    ],
    [
      "RETRY_DELIVERY",
      { retryDate: "2026-11-15", notes: null },
      [{ retryDate: "2026-11-16" }],
    ],
  ] as const) {
    const body = warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation,
        orders: [{ ...scope, ...fields }],
      }),
      hash = hashWarehouseCommandIntent(body);
    for (const change of [...changes, { attemptId: randomUUID() }])
      expect(
        hashWarehouseCommandIntent(
          warehouseCommandBodySchema.parse({
            ...body,
            orders: [{ ...scope, ...fields, ...change }],
          }),
        ),
      ).not.toBe(hash);
  }
});
it("maps the original immutable result without replacing it with current domain state", () => {
  const record: WarehouseCommandRecord = {
    commandId: randomUUID(),
    operation: "RECEIVE",
    actorId: randomUUID(),
    actorFullName: "Original warehouse operator",
    actorRole: "USER",
    actorDepartment: "WAREHOUSE",
    payloadHash: "b".repeat(64),
    occurredAt: new Date("2026-11-14T10:00:00Z"),
    outcome: {
      orders: [
        {
          eventId: randomUUID(),
          orderId: randomUUID(),
          beforeVersion: 7,
          afterVersion: 8,
          status: "APPROVED",
          pieceIds: [randomUUID()],
          receiptGroupId: randomUUID(),
          attemptId: null,
          retryId: null,
        },
      ],
    },
  };
  const result = mapWarehouseCommandResult(record, true);
  expect(result.outcome).toEqual(record.outcome);
  expect(result.receipt).toMatchObject({
    commandId: record.commandId,
    actor: { id: record.actorId },
    occurredAt: record.occurredAt.toISOString(),
  });
  expect(() =>
    mapWarehouseCommandResult({ ...record, operation: "DISPATCH" }, true),
  ).toThrow();
});
it("retries only true transaction aborts and the own command-key unique violation", () => {
  const conflict = {
    code: "P2002",
    meta: {
      modelName: "WarehouseCommand",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["command_id"] },
        },
      },
    },
  };
  expect(isWarehouseCommandIdConflict(conflict)).toBe(true);
  expect(
    isWarehouseCommandIdConflict({
      ...conflict,
      meta: { ...conflict.meta, modelName: "WarehouseReceiptPiece" },
    }),
  ).toBe(false);
  expect(isWarehouseTransactionConflict({ code: "P2034" })).toBe(true);
  for (const code of ["40001", "40P01", "55P03", "23514", "23505"]) {
    const kind = code === "40001" ? "TransactionWriteConflict" : "postgres";
    expect(
      isWarehouseTransactionConflict({
        code: "P2010",
        meta: {
          driverAdapterError: { cause: { kind, code, originalCode: code } },
        },
      }),
    ).toBe(code === "40001" || code === "40P01");
  }
});
it.each(["unknown", "serialization", "lock-timeout"] as const)(
  "bounds %s failure without inventing a committed result",
  async (kind) => {
    const db = createDatabaseClient(
      "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
    );
    const failure =
      kind === "unknown"
        ? new Error("Commit outcome unknown")
        : kind === "serialization"
          ? Object.assign(new Error("Aborted"), { code: "P2034" })
          : Object.assign(new Error("Lock timeout"), {
              code: "P2010",
              meta: {
                driverAdapterError: {
                  cause: {
                    kind: "postgres",
                    code: "55P03",
                    originalCode: "55P03",
                  },
                },
              },
            });
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValue(failure);
    try {
      const result = new WarehouseCommandExecutor(db).observe(
        randomUUID(),
        randomUUID(),
      );
      if (kind === "unknown") await expect(result).rejects.toBe(failure);
      else
        await expect(result).rejects.toMatchObject({
          code: "WAREHOUSE_TRANSACTION_CONFLICT",
        });
      expect(transaction).toHaveBeenCalledTimes(
        kind === "serialization" ? 2 : 1,
      );
    } finally {
      transaction.mockRestore();
      await db.$disconnect();
    }
  },
);

it("checks current authority before consulting private saved commands", async () => {
  const db = createDatabaseClient(
      "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
    ),
    actorId = randomUUID(),
    now = new Date();
  vi.spyOn(db, "$transaction").mockImplementation(async (work) => {
    if (typeof work !== "function")
      throw new Error("Interactive transaction required");
    return work(db);
  });
  vi.spyOn(db, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(db.user, "findUnique").mockResolvedValue({
    id: actorId,
    email: "synthetic@example.test",
    passwordHash: "unused",
    fullName: "Suspended warehouse operator",
    phone: null,
    role: "ADMIN",
    status: "SUSPENDED",
    department: null,
    emailVerifiedAt: now,
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    staffApprovedAt: null,
    staffApprovedById: null,
    accessVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  const saved = vi.spyOn(db.warehouseCommand, "findUnique");
  try {
    await expect(
      new WarehouseCommandExecutor(db).observe(actorId, randomUUID()),
    ).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
    expect(saved).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    await db.$disconnect();
  }
});

it.each([
  "receipt-race",
  "unexpected-foreign-key",
  "unexpected-child-id",
] as const)(
  "classifies %s without retrying a failed business save or exposing database details",
  async (kind) => {
    const db = createDatabaseClient(
      "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
    );
    const failure = new Prisma.PrismaClientKnownRequestError(
      "Private SQL diagnostics",
      {
        code: kind === "unexpected-foreign-key" ? "P2003" : "P2002",
        clientVersion: "test",
        meta: {
          modelName: "WarehouseReceiptPiece",
          driverAdapterError: {
            cause: {
              kind: "UniqueConstraintViolation",
              constraint: {
                fields: [kind === "receipt-race" ? "piece_id" : "id"],
              },
            },
          },
        },
      },
    );
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValue(failure);
    try {
      await expect(
        new WarehouseCommandExecutor(db).observe(randomUUID(), randomUUID()),
      ).rejects.toMatchObject({
        code:
          kind === "receipt-race"
            ? "WAREHOUSE_SELECTION_CONFLICT"
            : "INTERNAL_SERVER_ERROR",
      });
      expect(transaction).toHaveBeenCalledTimes(1);
    } finally {
      transaction.mockRestore();
      await db.$disconnect();
    }
  },
);
