import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { beforeEach, afterAll, it, expect, vi } from "vitest";
import { createDatabaseClient } from "@template/database";
import {
  submitOrderBodySchema,
  successEnvelopeSchema,
  salesOrderCommandDataSchema,
  salesOrderListDataSchema,
  salesDashboardDataSchema,
  salesOrderDataSchema,
  salesOrderTrackingDataSchema,
  salesOrderEditorDataSchema,
  salesOrderActivityDataSchema,
  salesOrderRevisionDataSchema,
  customerOrdersDataSchema,
  customerOrderMeasurementsDataSchema,
  errorEnvelopeSchema,
  resubmitOrderBodySchema,
} from "@template/contracts";
import { createApp } from "../../app.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";
import { CatalogLoaderService } from "../catalogs/catalog-loader.service.js";
import { CatalogsService } from "../catalogs/catalogs.service.js";

const originalZone = vi.hoisted(() => {
  vi.resetModules();
  const previous = process.env["ORDER_BUSINESS_TIME_ZONE"];
  process.env["ORDER_BUSINESS_TIME_ZONE"] = "UTC";
  return previous;
});
const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  app = createApp({
    database: db,
    logger: pino({ level: "silent" }),
    emailDelivery: {
      provider: "console",
      send: () => Promise.resolve({ providerMessageId: "unused" }),
    },
  });
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  factory = randomUUID(),
  customerId = randomUUID();
const approvalFixture = () =>
  new ApprovalService(db, new ApprovalCommandExecutor(db), "UTC");
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  const now = new Date();
  await db.user.create({
    data: {
      id: admin,
      email: "http-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const id of [a, b, factory])
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        fullName: id,
        passwordHash: "synthetic",
        department: id === factory ? "PRODUCTION" : "SALES",
        status: "ACTIVE",
        emailVerifiedAt: now,
        staffApprovedAt: now,
        staffApprovedById: admin,
      },
    });
  await db.customer.create({
    data: {
      id: customerId,
      name: "HTTP contact",
      phone: "+966501234567",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  const [target] = await db.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (!target) throw new Error("Missing database");
  await new CatalogLoaderService(db).apply(
    syntheticCatalogPreview(),
    target.name,
  );
});
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await db.$disconnect();
  if (originalZone === undefined)
    delete process.env["ORDER_BUSINESS_TIME_ZONE"];
  else process.env["ORDER_BUSINESS_TIME_ZONE"] = originalZone;
});
const submission = async () => {
  const pieces = [
      {
        id: randomUUID(),
        model: "SM",
        size: "40",
        leatherBase: "synthetic I3",
        decoration: "زبيري - z",
        face: "standard",
      },
    ],
    quote = await new CatalogsService(db).quote(a, {
      requestId: randomUUID(),
      pieces,
    });
  if (quote.availability !== "available") throw new Error("Missing quote");
  return submitOrderBodySchema.parse({
    origin: "new",
    commandId: randomUUID(),
    expectedCustomerVersion: 1,
    capture: { type: "SHOP", customerId, pieces },
    reviewedQuote: { sourceId: quote.sourceId, fingerprint: quote.fingerprint },
  });
};
it("serves every read ledger through the app and preserves first/replay status and original-actor observation", async () => {
  const input = await submission(),
    headers = businessTestHeaders(a),
    created = await request(app)
      .post("/api/v1/sales-orders")
      .set(headers)
      .send(input);
  expect(created.status, created.text).toBe(201);
  const result = successEnvelopeSchema
      .safeExtend({ data: salesOrderCommandDataSchema })
      .parse(created.body as unknown).data,
    orderId = result.savedOrder.id;
  const replay = await request(app)
    .post("/api/v1/sales-orders")
    .set(headers)
    .send(input);
  expect(replay.status).toBe(201);
  expect(
    successEnvelopeSchema
      .safeExtend({ data: salesOrderCommandDataSchema })
      .parse(replay.body as unknown).data.replayed,
  ).toBe(true);
  for (const [path, schema] of [
    ["/sales-orders", salesOrderListDataSchema],
    ["/sales-orders/dashboard", salesDashboardDataSchema],
    ["/sales-orders/activity", salesOrderActivityDataSchema],
    [`/sales-orders/${orderId}`, salesOrderDataSchema],
    [`/sales-orders/${orderId}/tracking`, salesOrderTrackingDataSchema],
    [`/sales-orders/${orderId}/activity`, salesOrderActivityDataSchema],
    [
      `/sales-orders/${orderId}/activity/${input.commandId}`,
      salesOrderRevisionDataSchema,
    ],
    [`/sales-order-editor/${orderId}`, salesOrderEditorDataSchema],
    [`/customers/${customerId}/orders`, customerOrdersDataSchema],
    [
      `/customers/${customerId}/order-measurements`,
      customerOrderMeasurementsDataSchema,
    ],
  ] as const) {
    const response = await request(app).get(`/api/v1${path}`).set(headers);
    expect(response.status, response.text).toBe(200);
    expect(
      successEnvelopeSchema
        .safeExtend({ data: schema })
        .safeParse(response.body as unknown).success,
    ).toBe(true);
    expect(response.headers["cache-control"]).toContain("no-store");
  }
  expect(
    (
      await request(app)
        .get(`/api/v1/sales-orders/${orderId}`)
        .set(businessTestHeaders(b))
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get(`/api/v1/sales-orders/${orderId}`)
        .set(businessTestHeaders(admin))
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .get(`/api/v1/sales-commands/${input.commandId}`)
        .set(businessTestHeaders(admin))
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get(`/api/v1/sales-commands/${input.commandId}`)
        .set(headers)
    ).status,
  ).toBe(200);
  expect(await db.salesCommand.count({ where: { draftId: orderId } })).toBe(1);
});
it("rejects missing authority, CSRF, malformed input and forged authority without issuing any order", async () => {
  const input = await submission(),
    headers = businessTestHeaders(a);
  expect(
    (await request(app).post("/api/v1/sales-orders").send(input)).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/v1/sales-orders")
        .set(businessTestHeaders(factory))
        .send(input)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/v1/sales-orders")
        .set({ Authorization: headers.Authorization })
        .send(input)
    ).status,
  ).toBe(403);
  for (const forged of [
    { ...input, status: "APPROVED" },
    { ...input, number: "SHOP-2026-9999" },
    {
      ...input,
      capture: {
        ...input.capture,
        pieces: input.capture.pieces.map((p) => ({ ...p, unitPrice: "0.00" })),
      },
    },
  ]) {
    const response = await request(app)
      .post("/api/v1/sales-orders")
      .set(headers)
      .send(forged);
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(response.body as unknown).code).toBe(
      "VALIDATION_ERROR",
    );
  }
  for (const path of [
    "/sales-orders?limit=101",
    "/sales-orders?status=UNKNOWN",
    "/sales-orders/not-uuid",
    "/sales-orders/activity?unexpected=yes",
    `/customers/${customerId}/orders?limit=26`,
  ])
    expect((await request(app).get(`/api/v1${path}`).set(headers)).status).toBe(
      400,
    );
  expect(await db.salesOrder.count()).toBe(0);
  expect(await db.salesDraft.count()).toBe(0);
  expect(await db.salesCommand.count()).toBe(0);
  expect(
    (
      await db.businessOrderCounter.findUniqueOrThrow({
        where: { id: "global" },
      })
    ).lastIssued,
  ).toBe(0n);
});
it("publishes permitted resubmit and paid commands while rejecting direct approval and unchanged paid", async () => {
  const headers = businessTestHeaders(a),
    input = await submission(),
    response = await request(app)
      .post("/api/v1/sales-orders")
      .set(headers)
      .send(input);
  expect(response.status, response.text).toBe(201);
  const order = successEnvelopeSchema
    .safeExtend({ data: salesOrderCommandDataSchema })
    .parse(response.body as unknown).data.savedOrder;
  await approvalFixture().returnInitial(admin, order.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Isolated P04 consumer fixture",
    notes: null,
  });
  const returnedList = await request(app)
    .get("/api/v1/sales-orders?status=RETURNED")
    .set(headers);
  expect(returnedList.status, returnedList.text).toBe(200);
  const returnedItems = successEnvelopeSchema
    .safeExtend({ data: salesOrderListDataSchema })
    .parse(returnedList.body as unknown).data.items;
  expect(returnedItems[0]).toMatchObject({
    kind: "submitted",
    order: {
      returnInfo: {
        reason: "Isolated P04 consumer fixture",
      },
    },
  });
  const source = input.capture.pieces[0];
  if (!source) throw new Error("Missing piece");
  const { decoration: _decoration, ...piece } = source;
  const correction = resubmitOrderBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 2,
    corrections: {
      deliveryDate: null,
      generalNotes: "Header only",
      responsibleSignature: null,
      repairNote: null,
      adjustmentRequested: null,
      adjustmentReason: null,
      adjustmentActionTaken: null,
      pieces: [piece],
    },
  });
  const invalidRequired = await request(app)
    .post(`/api/v1/sales-orders/${order.id}/resubmit`)
    .set(headers)
    .send({
      ...correction,
      corrections: {
        ...correction.corrections,
        pieces: correction.corrections.pieces.map((piece) => ({
          ...piece,
          face: null,
        })),
      },
    });
  expect(invalidRequired.status, invalidRequired.text).toBe(400);
  expect(errorEnvelopeSchema.parse(invalidRequired.body as unknown).code).toBe(
    "VALIDATION_ERROR",
  );
  expect(
    (await db.salesDraft.findUniqueOrThrow({ where: { id: order.id } }))
      .version,
  ).toBe(2);
  expect(await db.salesCommand.count({ where: { draftId: order.id } })).toBe(1);
  const resubmitted = await request(app)
    .post(`/api/v1/sales-orders/${order.id}/resubmit`)
    .set(headers)
    .send(correction);
  expect(resubmitted.status, resubmitted.text).toBe(200);
  const activity = await request(app)
    .get(`/api/v1/sales-orders/${order.id}/activity`)
    .set(headers);
  const events = successEnvelopeSchema
    .safeExtend({ data: salesOrderActivityDataSchema })
    .parse(activity.body as unknown).data.events;
  expect(events[0]).toMatchObject({
    kind: "order",
    event: { pieceIds: [], changedFields: ["status", "generalNotes"] },
  });
  await approvalFixture().approveInitial(admin, order.id, {
    commandId: randomUUID(),
    expectedVersion: 3,
  });
  const paid = {
      commandId: randomUUID(),
      expectedVersion: 4,
      paidAmount: "450.50",
    },
    updated = await request(app)
      .patch(`/api/v1/sales-orders/${order.id}/paid`)
      .set(businessTestHeaders(admin))
      .send(paid);
  expect(updated.status, updated.text).toBe(200);
  expect(
    successEnvelopeSchema
      .safeExtend({ data: salesOrderCommandDataSchema })
      .parse(updated.body as unknown).data.savedOrder.money.paidAmount,
  ).toBe("450.50");
  const unchanged = await request(app)
    .patch(`/api/v1/sales-orders/${order.id}/paid`)
    .set(headers)
    .send({ ...paid, commandId: randomUUID(), expectedVersion: 5 });
  expect(unchanged.status).toBe(409);
  expect(errorEnvelopeSchema.parse(unchanged.body as unknown).code).toBe(
    "ORDER_PAID_UNCHANGED",
  );
  expect(
    (
      await request(app)
        .post(`/api/v1/sales-orders/${order.id}/approve`)
        .set(headers)
        .send({})
    ).status,
  ).toBe(404);
});
