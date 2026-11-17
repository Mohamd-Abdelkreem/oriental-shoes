import { ManufacturingCommandExecutor } from "../modules/manufacturing/manufacturing-command-executor.js";
import { randomUUID } from "node:crypto";
import {
  submitOrderBodySchema,
  type SalesOrderType,
} from "@template/contracts";
import type { DatabaseClient } from "@template/database";
import { ApprovalCommandExecutor } from "../modules/approval/approval-command-executor.js";
import { ApprovalService } from "../modules/approval/approval.service.js";
import { CatalogsService } from "../modules/catalogs/catalogs.service.js";
import { StaffService } from "../modules/staff/staff.service.js";
import { createApprovalOrderFixture } from "./approval.fixture.js";

export const createManufacturingFixture = async (
  database: DatabaseClient,
  type: SalesOrderType = "SHOP",
  customerName = "Frozen contact",
  deliveryDate: string | null = null,
) => {
  const source = await createApprovalOrderFixture(
    database,
    type,
    ["زبيري - z", "زبيري - z"],
    "ADMIN",
    customerName,
    deliveryDate,
  );
  const staff = new StaffService(database);
  const createWorker = async (
    department: "CUTTING" | "PRODUCTION",
    label: string,
  ) => {
    const id = randomUUID();
    await database.user.create({
      data: {
        id,
        email: `${id}@example.test`,
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
      department,
    });
    return id;
  };
  const cuttingA = await createWorker("CUTTING", "Cutting A");
  const cuttingB = await createWorker("CUTTING", "Cutting B");
  const productionA = await createWorker("PRODUCTION", "Production A");
  const productionB = await createWorker("PRODUCTION", "Production B");
  const approval = new ApprovalService(
    database,
    new ApprovalCommandExecutor(database),
    "UTC",
  );
  const released = await approval.approveInitial(
    source.approvalActorId,
    source.order.id,
    { commandId: randomUUID(), expectedVersion: source.order.version },
  );
  return {
    ...source,
    approval,
    released,
    cuttingA,
    cuttingB,
    productionA,
    productionB,
  };
};

// Reuse the owned customer and catalogue; produce every second root through real sales/approval commands.
export const appendManufacturingOrder = async (
  database: DatabaseClient,
  fixture: Awaited<ReturnType<typeof createManufacturingFixture>>,
  pieceCount = 2,
) => {
  const customer = await database.customer.findUniqueOrThrow({
    where: { id: fixture.order.customerId },
  });
  const capture = {
    type: fixture.order.type,
    customerId: customer.id,
    paidAmount: "100.50",
    pieces: Array.from({ length: pieceCount }, () => ({
      id: randomUUID(),
      model: "SM",
      size: "40",
      leatherBase: "synthetic I3",
      decoration: "زبيري - z",
      face: "standard",
    })),
  };
  const quote = await new CatalogsService(database).quote(fixture.actorId, {
    requestId: randomUUID(),
    pieces: capture.pieces,
  });
  if (quote.availability !== "available")
    throw new Error("Expected an owned quote");
  const submitted = await fixture.sales.submit(
    fixture.actorId,
    submitOrderBodySchema.parse({
      origin: "new",
      commandId: randomUUID(),
      capture,
      expectedCustomerVersion: customer.version,
      reviewedQuote: {
        sourceId: quote.sourceId,
        fingerprint: quote.fingerprint,
      },
    }),
  );
  await fixture.approval.approveInitial(
    fixture.approvalActorId,
    submitted.savedOrder.id,
    { commandId: randomUUID(), expectedVersion: submitted.savedOrder.version },
  );
  return submitted.savedOrder;
};

// Upstream QUALITY reports consume a real incoming transfer; no P06 start is invented.
export const advanceManufacturingReportFixture = async (
  database: DatabaseClient,
  actorId: string,
  orderId: string,
  pieceId: string,
  target: "CUTTING" | "PRODUCTION" | "QUALITY",
) => {
  const executor = new ManufacturingCommandExecutor(database);
  const work = async (
    department: "CUTTING" | "PRODUCTION",
    operation: "RECEIVE_AND_START" | "COMPLETE_TRANSFER",
  ) => {
    const root = await database.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
    });
    await executor.execute({
      actorId,
      department,
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          { orderId, expectedVersion: root.version, pieceIds: [pieceId] },
        ],
      },
    });
  };
  await work("CUTTING", "RECEIVE_AND_START");
  if (target !== "CUTTING") {
    await work("CUTTING", "COMPLETE_TRANSFER");
    await work("PRODUCTION", "RECEIVE_AND_START");
    if (target === "QUALITY") await work("PRODUCTION", "COMPLETE_TRANSFER");
  }
  return (
    await database.salesDraft.findUniqueOrThrow({ where: { id: orderId } })
  ).version;
};
