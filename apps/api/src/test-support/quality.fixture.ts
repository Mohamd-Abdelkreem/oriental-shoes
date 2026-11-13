import { randomUUID } from "node:crypto";
import type { SalesOrderType } from "@template/contracts";
import type { DatabaseClient } from "@template/database";
import { ManufacturingCommandExecutor } from "../modules/manufacturing/manufacturing-command-executor.js";
import { StaffService } from "../modules/staff/staff.service.js";
import {
  appendManufacturingOrder,
  createManufacturingFixture,
} from "./manufacturing.fixture.js";

const advanceQualityIncoming = async (
  database: DatabaseClient,
  input: {
    orderId: string;
    pieceIds: readonly string[];
    cuttingActor: string;
    productionActor: string;
  },
): Promise<number> => {
  const executor = new ManufacturingCommandExecutor(database);
  for (const [department, operation, actorId] of [
    ["CUTTING", "RECEIVE_AND_START", input.cuttingActor],
    ["CUTTING", "COMPLETE_TRANSFER", input.cuttingActor],
    ["PRODUCTION", "RECEIVE_AND_START", input.productionActor],
    ["PRODUCTION", "COMPLETE_TRANSFER", input.productionActor],
  ] as const) {
    const root = await database.salesDraft.findUniqueOrThrow({
      where: { id: input.orderId },
      select: { version: true },
    });
    await executor.execute({
      actorId,
      department,
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: input.orderId,
            expectedVersion: root.version,
            pieceIds: [...input.pieceIds],
          },
        ],
      },
    });
  }
  return (
    await database.salesDraft.findUniqueOrThrow({
      where: { id: input.orderId },
      select: { version: true },
    })
  ).version;
};

export const createQualityFixture = async (
  database: DatabaseClient,
  type: SalesOrderType = "SHOP",
) => {
  const source = await createManufacturingFixture(database, type);
  const staff = new StaffService(database);
  const createColleague = async (label: string) => {
    const id = randomUUID();
    await database.user.create({
      data: {
        id,
        email: id + "@example.test",
        fullName: label,
        passwordHash: "synthetic-only",
        role: "USER",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await staff.approveStaff(source.approvalActorId, id, {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department: "QUALITY",
    });
    return id;
  };
  const qualityA = await createColleague("Quality A");
  const qualityB = await createColleague("Quality B");
  const version = await advanceQualityIncoming(database, {
    orderId: source.order.id,
    pieceIds: source.order.pieces.map((piece) => piece.id),
    cuttingActor: source.cuttingA,
    productionActor: source.productionA,
  });
  return { ...source, qualityA, qualityB, version };
};
export const appendQualityOrder = async (
  database: DatabaseClient,
  fixture: Awaited<ReturnType<typeof createQualityFixture>>,
  pieceCount = 2,
) => {
  const order = await appendManufacturingOrder(database, fixture, pieceCount);
  const version = await advanceQualityIncoming(database, {
    orderId: order.id,
    pieceIds: order.pieces.map((piece) => piece.id),
    cuttingActor: fixture.cuttingA,
    productionActor: fixture.productionA,
  });
  return { ...order, version };
};
