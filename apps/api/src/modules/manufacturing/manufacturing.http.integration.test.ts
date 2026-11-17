import { AdministrationCommandExecutor } from "../administration/administration-command-executor.js";
import { administrationCommandBodySchema } from "@template/contracts";
import {
  errorEnvelopeSchema,
  approvalCommandDataSchema,
} from "@template/contracts";
import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { createDatabaseClient } from "@template/database";
import {
  manufacturingCommandDataSchema,
  manufacturingDashboardDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingOrderDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHistoryDataSchema,
  successEnvelopeSchema,
} from "@template/contracts";
import { beforeEach, afterAll, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import {
  createManufacturingFixture,
  appendManufacturingOrder,
} from "../../test-support/manufacturing.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";

const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Expected owned fixture value");
  return value;
};
const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  app = createApp({
    database: db,
    logger: pino({ enabled: false }),
    emailDelivery: {
      provider: "console",
      send: () => Promise.resolve({ providerMessageId: "unused" }),
    },
  });
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
});
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const snapshot = async () => ({
  roots: await db.salesDraft.findMany({ orderBy: { id: "asc" } }),
  headers: await db.salesOrder.findMany({ orderBy: { id: "asc" } }),
  pieces: await db.salesOrderPiece.findMany({ orderBy: { id: "asc" } }),
  visits: await db.manufacturingWorkVisit.findMany({ orderBy: { id: "asc" } }),
  events: await db.manufacturingPieceEvent.findMany({ orderBy: { id: "asc" } }),
  commands: await db.manufacturingCommand.findMany({
    orderBy: { commandId: "asc" },
  }),
  orderEvents: await db.manufacturingCommandOrder.findMany({
    orderBy: { eventId: "asc" },
  }),
});
it("enforces actual auth/CSRF/dept/strict input and serves all eight safe P05 routes with retained two-order replay", async () => {
  const f = await createManufacturingFixture(db),
    o2 = await appendManufacturingOrder(db, f),
    path = "/api/v1/manufacturing/cutting",
    body = {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [f.order, o2].map((o) => ({
        orderId: o.id,
        expectedVersion: 2,
        pieceIds: [required(o.pieces[0]).id],
      })),
    };
  const adminRead = await request(app)
    .get(`${path}/dashboard`)
    .set(businessTestHeaders(f.approvalActorId));
  expect(adminRead.status).toBe(200);
  manufacturingDashboardDataSchema.parse(
    successEnvelopeSchema.parse(adminRead.body).data,
  );
  const before = await snapshot();
  expect((await request(app).post(`${path}/commands`).send(body)).status).toBe(
    401,
  );
  expect(
    (
      await request(app)
        .post(`${path}/commands`)
        .set({ Authorization: businessTestHeaders(f.cuttingA).Authorization })
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`${path}/commands`)
        .set(businessTestHeaders(f.productionA))
        .send(body)
    ).status,
  ).toBe(403);
  for (const [index, invalid] of [
    { ...body, actorId: f.cuttingA },
    {
      ...body,
      orders: [
        {
          ...body.orders[0],
          pieceIds: [
            required(body.orders[0]).pieceIds[0],
            required(body.orders[0]).pieceIds[0],
          ],
        },
      ],
    },
    { ...body, orders: [{ ...body.orders[0], expectedVersion: 0 }] },
    {
      ...body,
      orders: [
        {
          ...body.orders[0],
          pieceIds: Array.from({ length: 201 }, () => randomUUID()),
        },
      ],
    },
  ].entries()) {
    const result = await request(app)
      .post(`${path}/commands`)
      .set(businessTestHeaders(f.cuttingA))
      .send(invalid);
    expect(result.status).toBe(400);
    const error = errorEnvelopeSchema.parse(result.body);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.errors?.map((item) => item.field)).toContain(
      required(
        [
          "body",
          "body.orders",
          "body.orders.0.expectedVersion",
          "body.orders.0.pieceIds",
        ][index],
      ),
    );
    expect(await snapshot()).toEqual(before);
  }
  const stale = await request(app)
    .post(`${path}/commands`)
    .set(businessTestHeaders(f.cuttingA))
    .send({ ...body, orders: [{ ...body.orders[0], expectedVersion: 1 }] });
  expect(stale.status).toBe(409);
  expect(errorEnvelopeSchema.parse(stale.body).code).toBe(
    "ORDER_VERSION_CONFLICT",
  );
  expect(await snapshot()).toEqual(before);
  const accepted = await request(app)
    .post(`${path}/commands`)
    .set(businessTestHeaders(f.cuttingA))
    .set("x-request-id", "p05-owned-http")
    .send(body);
  expect(accepted.status).toBe(200);
  expect(accepted.headers["cache-control"]).toBe("private, no-store");
  expect(successEnvelopeSchema.parse(accepted.body).requestId).toBe(
    "p05-owned-http",
  );
  successEnvelopeSchema.parse(accepted.body);
  const result = manufacturingCommandDataSchema.parse(
    successEnvelopeSchema.parse(accepted.body).data,
  );
  expect(result.outcome.orders).toHaveLength(2);
  const after = await snapshot();
  const replay = await request(app)
    .post(`${path}/commands`)
    .set(businessTestHeaders(f.cuttingA))
    .send({ ...body, orders: [...body.orders].reverse() });
  expect(replay.status).toBe(200);
  expect(successEnvelopeSchema.parse(replay.body).data).toEqual({
    ...result,
    replayed: true,
  });
  expect(await snapshot()).toEqual(after);
  for (const [commandId, operation, code] of [
    [randomUUID(), "RECEIVE_AND_START", "MANUFACTURING_SELECTION_CONFLICT"],
    [randomUUID(), "CONTINUE", "MANUFACTURING_WORK_UNCHANGED"],
    [body.commandId, "CONTINUE", "MANUFACTURING_COMMAND_CONFLICT"],
  ] as const) {
    const rejected = await request(app)
      .post(`${path}/commands`)
      .set(businessTestHeaders(f.cuttingA))
      .send({
        ...body,
        commandId,
        operation,
        orders: body.orders.map((order) => ({ ...order, expectedVersion: 3 })),
      });
    expect(rejected.status).toBe(409);
    expect(errorEnvelopeSchema.parse(rejected.body).code).toBe(code);
    expect(await snapshot()).toEqual(after);
  }
  const hiddenId = randomUUID(),
    unknown = await request(app)
      .get(`/api/v1/manufacturing-commands/${hiddenId}`)
      .set(businessTestHeaders(f.cuttingA));
  expect(unknown.status).toBe(404);
  expect(errorEnvelopeSchema.parse(unknown.body).code).toBe(
    "MANUFACTURING_COMMAND_NOT_FOUND",
  );
  expect(JSON.stringify(unknown.body)).not.toContain("pieceIds");
  const observed = await request(app)
    .get(`/api/v1/manufacturing-commands/${body.commandId}`)
    .set(businessTestHeaders(f.cuttingA));
  expect(observed.status).toBe(200);
  expect(successEnvelopeSchema.parse(observed.body).data).toEqual({
    ...result,
    replayed: true,
  });
  const foreign = await request(app)
    .get(`/api/v1/manufacturing-commands/${body.commandId}`)
    .set(businessTestHeaders(f.cuttingB));
  expect(foreign.status).toBe(404);
  const reads = [
    ["/dashboard", manufacturingDashboardDataSchema],
    ["/orders?view=IN_PROGRESS", manufacturingOrdersDataSchema],
    ["/pieces?view=IN_PROGRESS", manufacturingPiecesDataSchema],
    [`/orders/${f.order.id}`, manufacturingOrderDataSchema],
    ["/activity?actor=me", manufacturingActivityDataSchema],
    [`/orders/${f.order.id}/history`, manufacturingOrderHistoryDataSchema],
  ] as const;
  for (const [suffix, schema] of reads) {
    const response = await request(app)
      .get(path + suffix)
      .set(businessTestHeaders(f.cuttingA));
    expect(response.status, suffix).toBe(200);
    schema.parse(successEnvelopeSchema.parse(response.body).data);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(
      JSON.stringify(successEnvelopeSchema.parse(response.body).data),
    ).not.toMatch(
      /unitPrice|paidAmount|totalAmount|customerPhone|customerAddress|contactNotes|proposed/u,
    );
  }
  const missing = await request(app)
    .get(`${path}/orders/${randomUUID()}`)
    .set(businessTestHeaders(f.cuttingA));
  expect(missing.status).toBe(404);
  expect(await snapshot()).toEqual(after);
  const report = await request(app)
    .post(
      `/api/v1/manufacturing-orders/${f.order.id}/pieces/${required(f.order.pieces[0]).id}/issues`,
    )
    .set(businessTestHeaders(f.cuttingB))
    .send({
      commandId: randomUUID(),
      expectedVersion: 3,
      reason: "Actual source issue",
      notes: "  ",
    });
  expect(report.status).toBe(200);
  const reportData = approvalCommandDataSchema.parse(
    successEnvelopeSchema.parse(report.body).data,
  );
  expect(reportData.receipt.operation).toBe("REPORT_ISSUE");
  const reportObservation = await request(app)
    .get(`/api/v1/approval-commands/${reportData.receipt.commandId}`)
    .set(businessTestHeaders(f.cuttingB));
  expect(reportObservation.status).toBe(200);
  const history = await request(app)
    .get(`${path}/activity?actor=me`)
    .set(businessTestHeaders(f.cuttingB));
  expect(
    manufacturingActivityDataSchema.parse(
      successEnvelopeSchema.parse(history.body).data,
    ).events[0]?.kind,
  ).toBe("issue");
  expect(
    manufacturingActivityDataSchema.parse(
      successEnvelopeSchema.parse(history.body).data,
    ).events[0]?.event.commandId,
  ).toBe(reportData.receipt.commandId);
  await new StaffService(db).changeDepartment(f.approvalActorId, f.cuttingA, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "PRODUCTION",
  });
  const prior = await snapshot();
  expect(
    (
      await request(app)
        .post(`${path}/commands`)
        .set(businessTestHeaders(f.cuttingA))
        .send(body)
    ).status,
  ).toBe(403);

  expect(
    (
      await request(app)
        .get(`/api/v1/manufacturing-commands/${body.commandId}`)
        .set(businessTestHeaders(f.cuttingA))
    ).status,
  ).toBe(403);
  expect(await snapshot()).toEqual(prior);
  await new StaffService(db).suspendStaff(f.approvalActorId, f.cuttingB, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
  });
  expect(
    (
      await request(app)
        .get(`${path}/dashboard`)
        .set(businessTestHeaders(f.cuttingB))
    ).status,
  ).toBe(403);
  expect(await snapshot()).toEqual(prior);
});

it("returns bounded lock conflict and safe unexpected failure without partial work, then recovers with the same original intent", async () => {
  const f = await createManufacturingFixture(db),
    body = {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: 2,
          pieceIds: [required(f.order.pieces[0]).id],
        },
      ],
    },
    before = await snapshot(),
    blocker = createDatabaseClient(uri);
  let release = () => {},
    entered = () => {};
  const hold = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const gate = blocker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${f.order.id}::uuid FOR UPDATE`;
      entered();
      await hold;
    },
    { timeout: 15000 },
  );
  const post = () =>
    request(app)
      .post("/api/v1/manufacturing/cutting/commands")
      .set(businessTestHeaders(f.cuttingA))
      .send(body);
  try {
    await inside;
    const conflict = await post();
    expect(conflict.status).toBe(409);
    expect(errorEnvelopeSchema.parse(conflict.body).code).toBe(
      "MANUFACTURING_TRANSACTION_CONFLICT",
    );
  } finally {
    release();
    await gate;
    await blocker.$disconnect();
  }
  expect(await snapshot()).toEqual(before);
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p05_owned_http_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned internal event defect'; END $$",
  );
  try {
    await db.$executeRawUnsafe(
      "CREATE TRIGGER p05_owned_http_fault BEFORE INSERT ON manufacturing_piece_events FOR EACH ROW EXECUTE FUNCTION p05_owned_http_fault()",
    );
    const failed = await post();
    expect(failed.status).toBe(500);
    expect(errorEnvelopeSchema.parse(failed.body).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
    expect(JSON.stringify(failed.body)).not.toMatch(
      /Owned internal|INSERT|manufacturing_piece_events|Prisma/u,
    );
    expect(await snapshot()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS p05_owned_http_fault ON manufacturing_piece_events",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p05_owned_http_fault()");
  }
  const missing = await request(app)
    .get(`/api/v1/manufacturing-commands/${body.commandId}`)
    .set(businessTestHeaders(f.cuttingA));
  expect(missing.status).toBe(404);
  const retried = await post();
  expect(retried.status).toBe(200);
  expect(
    manufacturingCommandDataSchema.parse(
      successEnvelopeSchema.parse(retried.body).data,
    ).receipt.commandId,
  ).toBe(body.commandId);
  expect(await db.manufacturingCommand.count()).toBe(1);
});

it("protected manufacturing order history exposes minimal cancellation only and cannot enable admin events in its feed", async () => {
  const f = await createManufacturingFixture(db),
    reader = f.cuttingA,
    commands = new AdministrationCommandExecutor(db, () => new Date()),
    selected = f.order.pieces[0]?.id;
  if (!selected) throw new Error("Real physical member required");
  const current = async () =>
    (
      await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      })
    ).version;
  const accepted = await commands.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: f.order.id,
      expectedVersion: await current(),
      scope: "ITEM",
      pieceIds: [selected],
      reason: "Private administrative cancellation note",
    }),
  });
  await commands.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: await current(),
      patch: { customerName: "Private corrected contact" },
      reason: "Private administrative correction note",
    }),
  });
  const response = await request(app)
    .get(`/api/v1/manufacturing/cutting/orders/${f.order.id}/history`)
    .set(businessTestHeaders(reader));
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  const history = manufacturingOrderHistoryDataSchema.parse(
      successEnvelopeSchema.parse(response.body).data,
    ),
    events = history.events.filter((item) => item.kind === "administration");
  expect(events).toHaveLength(1);
  expect(events[0]?.event).toMatchObject({
    id: accepted.receipt.commandId,
    pieceIds: [selected],
    actor: accepted.receipt.actor,
  });
  expect(Object.keys(events[0]?.event ?? {}).sort()).toEqual(
    [
      "id",
      "orderId",
      "orderVersion",
      "businessNumber",
      "operation",
      "actor",
      "occurredAt",
      "pieceIds",
      "beforeStatus",
      "afterStatus",
    ].sort(),
  );
  expect(JSON.stringify(events)).not.toContain("Private");
  const own = await request(app)
    .get("/api/v1/manufacturing/cutting/activity")
    .set(businessTestHeaders(reader));
  expect(own.status).toBe(200);
  expect(
    manufacturingActivityDataSchema
      .parse(successEnvelopeSchema.parse(own.body).data)
      .events.map((item) => item.kind),
  ).not.toContain("administration");
  const invalid = await request(app)
    .get("/api/v1/manufacturing/cutting/activity?includeAdministration=true")
    .set(businessTestHeaders(reader));
  expect(invalid.status).toBe(400);
});
