import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@template/database";
import {
  qualityCommandBodySchema,
  type QualityCommandBody,
} from "@template/contracts";
import { expect, it, vi } from "vitest";
import {
  hashQualityCommandIntent,
  QualityCommandExecutor,
} from "./quality-command-executor.js";

const selection = (): QualityCommandBody => ({
  commandId: randomUUID(),
  operation: "RECEIVE_AND_START",
  orders: [
    {
      orderId: randomUUID(),
      expectedVersion: 2,
      pieceIds: [randomUUID(), randomUUID()],
    },
    { orderId: randomUUID(), expectedVersion: 3, pieceIds: [randomUUID()] },
  ],
});
it("binds the operation and every exact order/version/member while ignoring only command identity and set order", () => {
  const capture = selection();
  if (capture.operation !== "RECEIVE_AND_START")
    throw new Error("Expected start");
  const hash = hashQualityCommandIntent(capture);
  expect(
    hashQualityCommandIntent({
      ...capture,
      commandId: randomUUID(),
      orders: [...capture.orders]
        .reverse()
        .map((g) => ({ ...g, pieceIds: [...g.pieceIds].reverse() })),
    }),
  ).toBe(hash);
  expect(
    hashQualityCommandIntent({
      ...capture,
      operation: "REPORT_ISSUES",
      reason: "Problem",
      notes: null,
    }),
  ).not.toBe(hash);
  for (const change of ["version", "piece", "order"]) {
    const orders = capture.orders.map((g) => ({
        ...g,
        pieceIds: [...g.pieceIds],
      })),
      first = orders[0];
    if (!first) throw new Error("Expected group");
    if (change === "version") first.expectedVersion++;
    if (change === "piece") first.pieceIds[0] = randomUUID();
    if (change === "order") first.orderId = randomUUID();
    expect(hashQualityCommandIntent({ ...capture, orders })).not.toBe(hash);
  }
});
it("binds rejection, note and literal packing inputs after shared normalization", () => {
  const body = qualityCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "INSPECT",
    orders: [
      {
        orderId: randomUUID(),
        expectedVersion: 3,
        decisions: [
          { pieceId: randomUUID(), decision: "ACCEPT" },
          {
            pieceId: randomUUID(),
            decision: "REJECT",
            target: "CUTTING",
            reason: "Wrong",
            instructions: "Cut again",
          },
        ],
        inspectorNote: "Inspect",
        packing: { cartonNumbers: "A-1" },
      },
    ],
  });
  if (body.operation !== "INSPECT") throw new Error("Expected inspection");
  const first = body.orders[0];
  if (!first) throw new Error("Expected group");
  const hash = hashQualityCommandIntent(body);
  expect(
    hashQualityCommandIntent({
      ...body,
      orders: [{ ...first, decisions: [...first.decisions].reverse() }],
    }),
  ).toBe(hash);
  for (const orders of [
    [{ ...first, inspectorNote: "Changed" }],
    [{ ...first, packing: { cartonNumbers: "A-2", cartonCount: null } }],
    [
      {
        ...first,
        decisions: first.decisions.map((d) =>
          d.decision === "REJECT" ? { ...d, target: "PRODUCTION" as const } : d,
        ),
      },
    ],
  ])
    expect(hashQualityCommandIntent({ ...body, orders })).not.toBe(hash);
  const blank = qualityCommandBodySchema.parse({
    ...body,
    orders: [{ ...first, inspectorNote: " ", packing: { cartonCount: " " } }],
  });
  expect(hashQualityCommandIntent(blank)).toBe(
    hashQualityCommandIntent({
      ...body,
      orders: [{ ...first, inspectorNote: null, packing: null }],
    }),
  );
});
it.each(["unknown", "serialization"] as const)(
  "bounds %s transaction failure without claiming rollback",
  async (kind) => {
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
      const attempt = new QualityCommandExecutor(database).execute({
        actorId: randomUUID(),
        body: selection(),
      });
      if (kind === "unknown") await expect(attempt).rejects.toBe(failure);
      else
        await expect(attempt).rejects.toMatchObject({
          code: "QUALITY_TRANSACTION_CONFLICT",
        });
      expect(transaction).toHaveBeenCalledTimes(kind === "unknown" ? 1 : 2);
    } finally {
      transaction.mockRestore();
      await database.$disconnect();
    }
  },
);

it.each(["RECEIVE_AND_START", "REPORT_ISSUES"] as const)(
  "forwards %s unchanged to operation-aware locking before any effect",
  async (operation) => {
    // Only Prisma is doubled: exercise the real executor and lock helper together.
    // This is orchestration evidence; T011 owns rollback-only real version boundaries.
    const db = createDatabaseClient(
        "postgresql://synthetic:unused@127.0.0.1:1/never_connected",
      ),
      actorId = randomUUID(),
      orderId = randomUUID(),
      ids = [randomUUID(), randomUUID()],
      now = new Date();
    const sentinel = new Error(
      "Reached context read after permitted +1 preflight",
    );
    vi.spyOn(db, "$transaction").mockImplementation(async (work) => {
      if (typeof work !== "function")
        throw new Error("Interactive transaction required");
      return work(db);
    });
    vi.spyOn(db.user, "findUnique").mockResolvedValue({
      id: actorId,
      email: "synthetic@example.test",
      passwordHash: "unused",
      fullName: "Inspector",
      phone: null,
      role: "ADMIN",
      status: "ACTIVE",
      department: null,
      emailVerifiedAt: now,
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      enrolledById: null,
      enrollmentDepartment: null,
      accessVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    vi.spyOn(db.qualityCommand, "findUnique").mockResolvedValue(null);
    const root = {
      id: orderId,
      ownerId: actorId,
      customerId: null,
      type: "SHOP" as const,
      status: "SUBMITTED" as const,
      deliveryDate: null,
      generalNotes: null,
      repairNote: null,
      adjustmentRequested: null,
      adjustmentReason: null,
      adjustmentActionTaken: null,
      responsibleSignature: null,
      paidAmount: null,
      version: 2147483646,
      createdAt: now,
      updatedAt: now,
      order: { status: "APPROVED" as const },
    };
    vi.spyOn(db.salesDraft, "findMany").mockResolvedValue([root]);
    const raw = vi.spyOn(db, "$queryRaw").mockResolvedValue([]);
    for (let i = 0; i < (operation === "REPORT_ISSUES" ? 5 : 3); i++)
      raw.mockResolvedValueOnce([]);
    raw
      .mockResolvedValueOnce([{ id: orderId }])
      .mockResolvedValueOnce(ids.map((id) => ({ id, orderId })));
    vi.spyOn(db.salesOrderPiece, "findMany").mockRejectedValue(sentinel);
    const mutations = [
      vi.spyOn(db.salesOrderPiece, "updateMany"),
      vi.spyOn(db.salesDraft, "updateMany"),
      vi.spyOn(db.manufacturingIssue, "create"),
      vi.spyOn(db.approvalCommand, "create"),
      vi.spyOn(db.qualityCommand, "create"),
      vi.spyOn(db.qualityWorkVisit, "create"),
      vi.spyOn(db.qualityPieceEvent, "createMany"),
    ];
    try {
      const body = qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation,
        orders: [{ orderId, expectedVersion: 2147483646, pieceIds: ids }],
        ...(operation === "REPORT_ISSUES" ? { reason: "Problem" } : {}),
      });
      const attempt = new QualityCommandExecutor(db).execute({ actorId, body });
      if (operation === "REPORT_ISSUES")
        await expect(attempt).rejects.toMatchObject({
          code: "ORDER_VERSION_CONFLICT",
        });
      else await expect(attempt).rejects.toBe(sentinel);
      for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await db.$disconnect();
    }
  },
);
