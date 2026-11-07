import { StaffService } from "../modules/staff/staff.service.js";
import { randomUUID } from "node:crypto";
import {
  createCustomerBodySchema,
  type SalesOrderType,
  submitOrderBodySchema,
} from "@template/contracts";
import type { DatabaseClient } from "@template/database";
import { CatalogLoaderService } from "../modules/catalogs/catalog-loader.service.js";
import { CatalogsService } from "../modules/catalogs/catalogs.service.js";
import { CustomersService } from "../modules/customers/customers.service.js";
import { SalesCommandExecutor } from "../modules/sales-commands/sales-command-executor.js";
import { SalesOrdersService } from "../modules/sales-orders/sales-orders.service.js";
import { syntheticCatalogPreview } from "./reviewed-catalog.fixture.js";

export const createApprovalOrderFixture = async (
  database: DatabaseClient,
  type: SalesOrderType = "SHOP",
  decorations: readonly string[] = ["زبيري - z"],
  ownerKind: "ADMIN" | "SALES" = "ADMIN",
) => {
  const uri = process.env["P01_TEST_DATABASE_URL"];
  if (uri === undefined || uri !== process.env["DATABASE_URL"])
    throw new Error("Owned integration database required");
  const [current] = await database.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (current?.name !== new URL(uri).pathname.slice(1))
    throw new Error("Owned database mismatch");
  const approvalActorId = randomUUID();
  let actorId = approvalActorId;
  await database.user.create({
    data: {
      id: approvalActorId,
      email: `${approvalActorId}@example.test`,
      fullName: "Approval fixture admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  if (ownerKind === "SALES") {
    actorId = randomUUID();
    await database.user.create({
      data: {
        id: actorId,
        email: `${actorId}@example.test`,
        fullName: "Actual sales owner",
        passwordHash: "synthetic",
        role: "USER",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await new StaffService(database).approveStaff(approvalActorId, actorId, {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department: "SALES",
    });
  }
  const commands = new SalesCommandExecutor(database),
    customers = new CustomersService(database, commands),
    sales = new SalesOrdersService(database, commands, "UTC");
  const customer = await customers.create(
    actorId,
    createCustomerBodySchema.parse({
      commandId: randomUUID(),
      customer: {
        name: "Frozen contact",
        phone: "0501234567",
        address: "Frozen address",
      },
    }),
  );
  await new CatalogLoaderService(database).apply(
    syntheticCatalogPreview(),
    current.name,
  );
  const capture = {
    type,
    customerId: customer.savedCustomer.id,
    paidAmount: "100.50",
    pieces: decorations.map((decoration) => ({
      id: randomUUID(),
      model: "SM",
      size: "40",
      leatherBase: "synthetic I3",
      decoration,
      face: "standard",
    })),
  };
  const quote = await new CatalogsService(database).quote(actorId, {
    requestId: randomUUID(),
    pieces: capture.pieces,
  });
  if (quote.availability !== "available")
    throw new Error("Expected a synthetic quote");
  const submitted = await sales.submit(
    actorId,
    submitOrderBodySchema.parse({
      origin: "new",
      commandId: randomUUID(),
      capture,
      expectedCustomerVersion: customer.savedCustomer.version,
      reviewedQuote: {
        sourceId: quote.sourceId,
        fingerprint: quote.fingerprint,
      },
    }),
  );
  return { actorId, approvalActorId, order: submitted.savedOrder, sales };
};
