import { randomUUID } from "node:crypto";
import {
  createCustomerBodySchema,
  customerListQuerySchema,
  updateCustomerBodySchema,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import { CustomersService } from "./customers.service.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri),
  otherConnection = createDatabaseClient(uri);
const service = new CustomersService(
  database,
  new SalesCommandExecutor(database),
);
const competingService = new CustomersService(
  otherConnection,
  new SalesCommandExecutor(otherConnection),
);
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
const create = (phone = "0500000001", email?: string) =>
  createCustomerBodySchema.parse({
    commandId: randomUUID(),
    customer: { name: "Customer", phone, email },
  });
const update = (expectedVersion: number, patch: unknown) =>
  updateCustomerBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion,
    patch,
  });
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  const now = new Date();
  await database.user.create({
    data: {
      id: admin,
      email: "customer-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic-hash",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const [id, email] of [
    [a, "customer-a@example.test"],
    [b, "customer-b@example.test"],
  ] as const) {
    await database.user.create({
      data: {
        id,
        email,
        fullName: email,
        passwordHash: "synthetic-hash",
        status: "ACTIVE",
        emailVerifiedAt: now,
        department: "SALES",
        staffApprovedAt: now,
        staffApprovedById: admin,
      },
    });
  }
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
  await otherConnection.$disconnect();
});
it("creates shared optional-email customers and returns actual actor/time and retained before/after evidence", async () => {
  const input = create();
  const result = await service.create(a, input),
    id = result.savedCustomer.id;
  expect(result.savedCustomer).toMatchObject({
    phone: "+966500000001",
    email: null,
    version: 1,
  });
  expect(result.receipt.actor).toMatchObject({
    id: a,
    fullName: "customer-a@example.test",
    department: "SALES",
  });
  expect(result.savedCustomer.updatedAt).toBe(result.receipt.occurredAt);
  expect((await service.get(b, id)).customer.id).toBe(id);
  expect((await service.getByPhone(b, "٠٥٠٠٠٠٠٠٠١")).customer.id).toBe(id);
  const stored = await database.salesCommand.findUniqueOrThrow({
    where: { commandId: input.commandId },
  });
  expect(stored.before).toBeNull();
  expect(stored.after).toEqual(result.savedCustomer);
  expect((await service.create(a, input)).replayed).toBe(true);
  expect(await database.customer.count()).toBe(1);
  expect(await database.salesCommand.count()).toBe(1);
});
it("allows email reuse but atomically rejects concurrent equivalent phone claims", async () => {
  const results = await Promise.allSettled([
    service.create(a, create("0500000001", "shared@example.test")),
    competingService.create(b, create("+966500000001", "shared@example.test")),
  ]);
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  const denied = results.find((row) => row.status === "rejected");
  expect(denied?.status === "rejected" ? denied.reason : null).toMatchObject({
    code: "CUSTOMER_PHONE_CONFLICT",
  });
  expect(await database.customer.count()).toBe(1);
  expect(await database.salesCommand.count()).toBe(1);
  const other = await service.create(
    b,
    create("0500000002", "SHARED@example.test"),
  );
  expect(other.savedCustomer.email).toBe("shared@example.test");
  expect(await database.customer.count()).toBe(2);
});
it("preserves stable links and old receipts when a phone changes and an old phone is reused", async () => {
  const initial = await service.create(a, create());
  const id = initial.savedCustomer.id,
    now = new Date();
  const draft = await database.salesDraft.create({
    data: {
      ownerId: a,
      customerId: id,
      type: "SHOP",
      createdAt: now,
      updatedAt: now,
    },
  });
  const changed = await service.update(
    a,
    id,
    update(1, {
      phone: "0500000002",
      address: "Address",
      email: "new@example.test",
    }),
  );
  expect(changed.savedCustomer).toMatchObject({
    id,
    phone: "+966500000002",
    version: 2,
  });
  expect(
    (await database.salesDraft.findUniqueOrThrow({ where: { id: draft.id } }))
      .customerId,
  ).toBe(id);
  await expect(service.getByPhone(a, "0500000001")).rejects.toMatchObject({
    code: "CUSTOMER_NOT_FOUND",
  });
  const reused = await service.create(b, create());
  expect((await service.getByPhone(a, "0500000001")).customer.id).toBe(
    reused.savedCustomer.id,
  );
  expect((await service.getByPhone(a, "0500000002")).customer.id).toBe(id);
  const cleared = await service.update(a, id, update(2, { email: "" }));
  expect(cleared.savedCustomer).toMatchObject({
    email: null,
    address: "Address",
  });
  expect(
    (
      await database.salesCommand.findUniqueOrThrow({
        where: { commandId: initial.receipt.commandId },
      })
    ).after,
  ).toEqual(initial.savedCustomer);
});
it("rejects a phone-changing collision without applying any supplied field or event", async () => {
  const first = await service.create(a, create()),
    second = await service.create(b, create("0500000002"));
  await expect(
    service.update(
      a,
      first.savedCustomer.id,
      update(1, { phone: second.savedCustomer.phone, name: "must not apply" }),
    ),
  ).rejects.toMatchObject({ code: "CUSTOMER_PHONE_CONFLICT" });
  expect((await service.get(a, first.savedCustomer.id)).customer).toEqual(
    first.savedCustomer,
  );
  expect(await database.salesCommand.count()).toBe(2);
});
it("allows one same-revision winner and retains the losing state without a false receipt", async () => {
  const initial = await service.create(a, create());
  const id = initial.savedCustomer.id;
  const results = await Promise.allSettled([
    service.update(a, id, update(1, { address: "A" })),
    competingService.update(b, id, update(1, { address: "B" })),
  ]);
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
  const denied = results.find((row) => row.status === "rejected");
  expect(denied?.status === "rejected" ? denied.reason : null).toMatchObject({
    code: "CUSTOMER_VERSION_CONFLICT",
  });
  expect((await service.get(a, id)).customer.version).toBe(2);
  expect(await database.salesCommand.count()).toBe(2);
});
it("uses owner-scoped related reads inside shared contact and ADMIN services", async () => {
  const initial = await service.create(a, create());
  const id = initial.savedCustomer.id,
    now = new Date();
  for (const [ownerId, size] of [
    [a, "42"],
    [b, "99"],
  ] as const) {
    const draft = await database.salesDraft.create({
      data: {
        ownerId,
        customerId: id,
        type: "SHOP",
        createdAt: now,
        updatedAt: now,
      },
    });
    await database.salesDraftPiece.create({
      data: {
        id: randomUUID(),
        draftId: draft.id,
        position: 1,
        size,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  for (const actor of [a, b, admin]) {
    const data = await service.get(actor, id),
      history = await service.measurements(actor, id, { page: 1, limit: 25 });
    const directory = await service.list(
      actor,
      customerListQuerySchema.parse({}),
    );
    expect(data.draftCount).toBe(actor === admin ? 2 : 1);
    expect(history.measurements).toHaveLength(actor === admin ? 2 : 1);
    if (actor !== admin) expect(history.measurements[0]?.owner.id).toBe(actor);
    expect(directory.customers[0]?.draftCount).toBe(data.draftCount);
  }
});
it("denies current restriction/department changes and never falls back from missing resources", async () => {
  const result = await service.create(a, create());
  await database.user.update({
    where: { id: a },
    data: { department: "CUTTING" },
  });
  await expect(service.get(a, result.savedCustomer.id)).rejects.toMatchObject({
    code: "DEPARTMENT_ACCESS_DENIED",
  });
  await expect(service.create(a, create("0500000002"))).rejects.toMatchObject({
    code: "DEPARTMENT_ACCESS_DENIED",
  });
  await database.user.update({
    where: { id: b },
    data: { status: "SUSPENDED" },
  });
  await expect(
    service.list(b, customerListQuerySchema.parse({})),
  ).rejects.toMatchObject({ code: "ACCOUNT_RESTRICTED" });
  const missing = randomUUID();
  await expect(service.get(admin, missing)).rejects.toMatchObject({
    code: "CUSTOMER_NOT_FOUND",
  });
  await expect(
    service.measurements(admin, missing, { page: 1, limit: 25 }),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  await expect(
    service.update(admin, missing, update(1, { notes: "missing" })),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  expect(await database.customer.count()).toBe(1);
  expect(await database.salesCommand.count()).toBe(1);
});
it("rejects exhausted revisions before writing", async () => {
  const initial = await service.create(a, create()),
    id = initial.savedCustomer.id;
  await database.customer.update({
    where: { id },
    data: { version: 2147483647 },
  });
  await expect(
    service.update(a, id, update(2147483647, { name: "must not apply" })),
  ).rejects.toMatchObject({ code: "CUSTOMER_VERSION_CONFLICT" });
  expect(
    (await database.customer.findUniqueOrThrow({ where: { id } })).name,
  ).toBe(initial.savedCustomer.name);
  expect(await database.salesCommand.count()).toBe(1);
});

it("distinguishes a shared customer with no scoped drafts from missing/restricted card reads", async () => {
  const saved = await service.create(a, create());
  expect(
    await service.drafts(b, saved.savedCustomer.id, { page: 1, limit: 25 }),
  ).toMatchObject({ drafts: [], pagination: { total: 0 } });
  await expect(
    service.drafts(a, randomUUID(), { page: 1, limit: 25 }),
  ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  await database.user.update({
    where: { id: b },
    data: { status: "SUSPENDED" },
  });
  await expect(
    service.drafts(b, saved.savedCustomer.id, { page: 1, limit: 25 }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(await database.salesCommand.count()).toBe(1);
});
