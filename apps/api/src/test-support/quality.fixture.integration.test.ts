import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient } from "@template/database";
import { createQualityFixture, appendQualityOrder } from "./quality.fixture.js";
import { resetOwnedIdentityTestData } from "./reset-test-data.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Active owned integration database required");
const database = createDatabaseClient(uri);
beforeEach(() => resetOwnedIdentityTestData(database));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(database);
  } finally {
    await database.$disconnect();
  }
});
it("produces real quality incoming arrivals through submitted approval and both manufacturing departments", async () => {
  const fixture = await createQualityFixture(database, "REPAIR");
  const appended = await appendQualityOrder(database, fixture, 3);
  for (const [orderId, version, count] of [
    [fixture.order.id, fixture.version, 2],
    [appended.id, appended.version, 3],
  ] as const) {
    const root = await database.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    });
    expect(root.version).toBe(version);
    const pieces = await database.salesOrderPiece.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        stage: true,
        workState: true,
        currentWorkVisitId: true,
        receivedAt: true,
        cancelledAt: true,
        issueId: true,
      },
    });
    expect(pieces).toHaveLength(count);
    for (const piece of pieces)
      expect(piece).toMatchObject({
        stage: "QUALITY",
        workState: "INCOMING",
        currentWorkVisitId: null,
        receivedAt: null,
        cancelledAt: null,
        issueId: null,
      });
    const arrivals = await database.manufacturingPieceEvent.findMany({
      where: {
        orderId,
        operation: "COMPLETE_TRANSFER",
        beforeStage: "PRODUCTION",
        afterStage: "QUALITY",
      },
      select: {
        pieceId: true,
        commandOrder: {
          select: { command: { select: { actorId: true, occurredAt: true } } },
        },
      },
    });
    expect(arrivals.map((arrival) => arrival.pieceId).sort()).toEqual(
      pieces.map((piece) => piece.id),
    );
    for (const arrival of arrivals) {
      expect(arrival.commandOrder.command.actorId).toBe(fixture.productionA);
      expect(arrival.commandOrder.command.occurredAt).toBeInstanceOf(Date);
    }
    expect(await database.qualityWorkVisit.count({ where: { orderId } })).toBe(
      0,
    );
    expect(
      await database.qualityCommandOrder.count({ where: { orderId } }),
    ).toBe(0);
    const header = await database.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { paidAmount: true },
    });
    expect(header.paidAmount.toFixed(2)).toBe("100.50");
  }
  for (const id of [fixture.qualityA, fixture.qualityB])
    expect(
      await database.user.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          department: true,
          accessVersion: true,
          staffApprovedById: true,
        },
      }),
    ).toEqual({
      status: "ACTIVE",
      department: "QUALITY",
      accessVersion: 1,
      staffApprovedById: fixture.approvalActorId,
    });
});
