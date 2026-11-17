import { AdministrationCommandExecutor } from "../administration/administration-command-executor.js";
import { administrationCommandBodySchema } from "@template/contracts";
import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient } from "@template/database";
import {
  errorEnvelopeSchema,
  successEnvelopeSchema,
  qualityCommandDataSchema,
  qualityDashboardDataSchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityOrderDataSchema,
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
} from "@template/contracts";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";

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
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const graph = async () => ({
  roots: await db.salesDraft.findMany({ orderBy: { id: "asc" } }),
  headers: await db.salesOrder.findMany({ orderBy: { id: "asc" } }),
  specifications: await db.salesDraftPiece.findMany({ orderBy: { id: "asc" } }),
  pieces: await db.salesOrderPiece.findMany({ orderBy: { id: "asc" } }),
  approval: await db.approvalCommand.findMany({
    orderBy: { commandId: "asc" },
  }),
  issues: await db.manufacturingIssue.findMany({ orderBy: { id: "asc" } }),
  manufacturing: await db.manufacturingCommand.findMany({
    orderBy: { commandId: "asc" },
  }),
  salesCommands: await db.salesCommand.findMany({
    orderBy: { commandId: "asc" },
  }),
  proposals: await db.pieceContactProposal.findMany({ orderBy: { id: "asc" } }),
  manufacturingGroups: await db.manufacturingCommandOrder.findMany({
    orderBy: { eventId: "asc" },
  }),
  manufacturingEvents: await db.manufacturingPieceEvent.findMany({
    orderBy: { id: "asc" },
  }),
  manufacturingVisits: await db.manufacturingWorkVisit.findMany({
    orderBy: { id: "asc" },
  }),
  commands: await db.qualityCommand.findMany({ orderBy: { commandId: "asc" } }),
  groups: await db.qualityCommandOrder.findMany({
    orderBy: { eventId: "asc" },
  }),
  events: await db.qualityPieceEvent.findMany({ orderBy: { id: "asc" } }),
  visits: await db.qualityWorkVisit.findMany({ orderBy: { id: "asc" } }),
  cycles: await db.qualityCorrectionCycle.findMany({ orderBy: { id: "asc" } }),
  packing: await db.qualityPackingGroup.findMany({ orderBy: { id: "asc" } }),
  packingMembers: await db.qualityPackingPiece.findMany({
    orderBy: [{ groupId: "asc" }, { pieceId: "asc" }],
  }),
  reports: await db.qualityApprovalReport.findMany({
    orderBy: [{ commandId: "asc" }, { orderId: "asc" }, { ordinal: "asc" }],
  }),
});
const assertSafe = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const member of value) assertSafe(member);
    return;
  }
  if (value !== null && typeof value === "object")
    for (const [key, member] of Object.entries(value)) {
      expect(
        [
          "money",
          "unitPrice",
          "totalAmount",
          "paidAmount",
          "balance",
          "surplus",
          "customerId",
          "customerPhone",
          "customerEmail",
          "customerAddress",
          "email",
          "phone",
          "address",
          "proposed",
          "beforeFacts",
          "afterFacts",
          "payloadHash",
          "passwordHash",
        ],
        key,
      ).not.toContain(key);
      assertSafe(member);
    }
};
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const savedData = (body: unknown) =>
  qualityCommandDataSchema.parse(successEnvelopeSchema.parse(body).data);
it("serves all eight protected quality routes and all four operations with original private replay after movement", async () => {
  const f = await createQualityFixture(db),
    [p1, p2] = f.order.pieces.map((piece) => piece.id);
  if (!p1 || !p2) throw new Error("Owned members required");
  const post = async (actorId: string, body: object) => {
    const response = await request(app)
      .post("/api/v1/quality/commands")
      .set(businessTestHeaders(actorId))
      .send(body);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    assertSafe(response.body);
    return savedData(response.body);
  };
  const start = {
    commandId: randomUUID(),
    operation: "RECEIVE_AND_START",
    orders: [
      { orderId: f.order.id, expectedVersion: f.version, pieceIds: [p1, p2] },
    ],
  };
  const started = await post(f.qualityA, start);
  await post(f.qualityB, {
    commandId: randomUUID(),
    operation: "CONTINUE",
    orders: [
      {
        orderId: f.order.id,
        expectedVersion: await version(f.order.id),
        pieceIds: [p1],
      },
    ],
  });
  const accepted = await post(f.qualityA, {
    commandId: randomUUID(),
    operation: "INSPECT",
    orders: [
      {
        orderId: f.order.id,
        expectedVersion: await version(f.order.id),
        decisions: [{ pieceId: p1, decision: "ACCEPT" }],
        inspectorNote: "HTTP note",
        packing: { cartonNumbers: "HTTP carton" },
      },
    ],
  });
  await post(f.qualityA, {
    commandId: randomUUID(),
    operation: "REPORT_ISSUES",
    orders: [
      {
        orderId: f.order.id,
        expectedVersion: await version(f.order.id),
        pieceIds: [p2],
      },
    ],
    reason: "HTTP issue",
    notes: "Safe HTTP report",
  });
  const replayed = await post(f.qualityA, start);
  expect(replayed.replayed).toBe(true);
  expect(replayed.outcome).toEqual(started.outcome);
  const observed = await request(app)
    .get(`/api/v1/quality-commands/${start.commandId}`)
    .set(businessTestHeaders(f.qualityA));
  expect(observed.status).toBe(200);
  expect(savedData(observed.body).outcome).toEqual(started.outcome);
  for (const commandId of [start.commandId, randomUUID()]) {
    const privateResult = await request(app)
      .get(`/api/v1/quality-commands/${commandId}`)
      .set(businessTestHeaders(f.qualityB));
    expect(privateResult.status).toBe(404);
    expect(errorEnvelopeSchema.parse(privateResult.body).code).toBe(
      "QUALITY_COMMAND_NOT_FOUND",
    );
  }
  const reads = [
    ["/quality/dashboard", qualityDashboardDataSchema],
    ["/quality/orders?view=ACCEPTED", qualityOrdersDataSchema],
    ["/quality/pieces?view=ACCEPTED&limit=1", qualityPiecesDataSchema],
    [`/quality/orders/${f.order.id}`, qualityOrderDataSchema],
    ["/quality/activity", qualityActivityDataSchema],
    [
      `/quality/orders/${f.order.id}/history?pieceId=${p1}`,
      qualityOrderHistoryDataSchema,
    ],
  ] as const;
  for (const [path, schema] of reads) {
    const response = await request(app)
      .get("/api/v1" + path)
      .set(businessTestHeaders(f.qualityB));
    expect(response.status, path).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    schema.parse(successEnvelopeSchema.parse(response.body).data);
    assertSafe(response.body);
  }
  expect(
    (
      await request(app)
        .get("/api/v1/quality/dashboard")
        .set(businessTestHeaders(f.approvalActorId))
    ).status,
  ).toBe(200);
  const physical = await db.salesOrderPiece.findMany({
    where: { orderId: f.order.id },
    orderBy: { id: "asc" },
  });
  expect(physical.find((piece) => piece.id === p1)).toMatchObject({
    stage: "WAREHOUSE",
    receivedAt: null,
    issueId: null,
  });
  expect(physical.find((piece) => piece.id === p2)).toMatchObject({
    stage: "QUALITY",
    workState: "BLOCKED",
    receivedAt: null,
  });
  expect(await db.qualityCommand.count()).toBe(4);
  expect(accepted.outcome.orders[0]?.packingGroupId).not.toBeNull();
  expect(await version(f.order.id)).toBe(f.version + 4);
});
it("rejects auth, CSRF, malformed/stale/oversized authority and fields without partial writes while preserving 4000-character text", async () => {
  const f = await createQualityFixture(db),
    pieceId = f.order.pieces[0]?.id;
  if (!pieceId) throw new Error("Owned member required");
  const base = {
    commandId: randomUUID(),
    operation: "REPORT_ISSUES",
    orders: [
      { orderId: f.order.id, expectedVersion: f.version, pieceIds: [pieceId] },
    ],
    reason: "Confirmed issue",
  };
  const before = await graph();
  expect(
    (await request(app).post("/api/v1/quality/commands").send(base)).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post("/api/v1/quality/commands")
        .set({ Authorization: businessTestHeaders(f.qualityA).Authorization })
        .send(base)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/v1/quality/commands")
        .set(businessTestHeaders(f.cuttingA))
        .send(base)
    ).status,
  ).toBe(403);
  for (const body of [
    { ...base, actorId: f.qualityA },
    { ...base, quantity: 1 },
    { ...base, reason: "x".repeat(4001) },
    { ...base, orders: [] },
    { ...base, orders: [{ ...base.orders[0], pieceIds: [pieceId, pieceId] }] },
  ]) {
    const response = await request(app)
      .post("/api/v1/quality/commands")
      .set(businessTestHeaders(f.qualityA))
      .send(body);
    expect(response.status).toBe(400);
    errorEnvelopeSchema.parse(response.body);
  }
  for (const path of [
    "/quality/dashboard?unknown=1",
    "/quality/orders?view=INCOMING&limit=26",
    "/quality/orders?view=INCOMING&search=x&search=y",
    "/quality/activity?actor=me",
    "/quality/orders/not-an-id",
  ]) {
    const response = await request(app)
      .get("/api/v1" + path)
      .set(businessTestHeaders(f.qualityA));
    expect(response.status, path).toBe(400);
    errorEnvelopeSchema.parse(response.body);
  }
  expect(
    (
      await request(app)
        .get(`/api/v1/quality/orders/${randomUUID()}`)
        .set(businessTestHeaders(f.qualityA))
    ).status,
  ).toBe(404);
  const oversized = await request(app)
    .post("/api/v1/quality/commands")
    .set(businessTestHeaders(f.qualityA))
    .send({ ...base, reason: "x".repeat(1024 * 1024) });
  expect(oversized.status).toBe(413);
  expect(errorEnvelopeSchema.parse(oversized.body).code).toBe(
    "PAYLOAD_TOO_LARGE",
  );
  expect(await graph()).toEqual(before);
  const accepted = await request(app)
    .post("/api/v1/quality/commands")
    .set(businessTestHeaders(f.qualityA))
    .send({ ...base, reason: "r".repeat(4000), notes: "n".repeat(4000) });
  expect(accepted.status).toBe(200);
  const saved = savedData(accepted.body),
    after = await graph();
  expect(
    (await db.manufacturingIssue.findFirstOrThrow({ where: { pieceId } }))
      .reason,
  ).toBe("r".repeat(4000));
  const stale = await request(app)
    .post("/api/v1/quality/commands")
    .set(businessTestHeaders(f.qualityA))
    .send({ ...base, commandId: randomUUID() });
  expect(stale.status).toBe(409);
  expect(errorEnvelopeSchema.parse(stale.body).code).toBe(
    "ORDER_VERSION_CONFLICT",
  );
  const changedIntent = await request(app)
    .post("/api/v1/quality/commands")
    .set(businessTestHeaders(f.qualityA))
    .send(base);
  expect(changedIntent.status).toBe(409);
  expect(errorEnvelopeSchema.parse(changedIntent.body).code).toBe(
    "QUALITY_COMMAND_CONFLICT",
  );
  await new StaffService(db).changeDepartment(f.approvalActorId, f.qualityA, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "CUTTING",
  });
  expect(
    (
      await request(app)
        .get("/api/v1/quality/dashboard")
        .set(businessTestHeaders(f.qualityA))
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get(`/api/v1/quality-commands/${saved.receipt.commandId}`)
        .set(businessTestHeaders(f.qualityA))
    ).status,
  ).toBe(403);
  expect(await graph()).toEqual(after);
});
it("returns a safe internal HTTP failure and rolls the complete required save back through commit", async () => {
  const f = await createQualityFixture(db),
    before = await graph();
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p06_owned_http_save_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned HTTP required save failure'; END $$",
  );
  try {
    await db.$executeRawUnsafe(
      "CREATE CONSTRAINT TRIGGER p06_owned_http_save_failure AFTER INSERT ON quality_piece_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION p06_owned_http_save_failure()",
    );
    const response = await request(app)
      .post("/api/v1/quality/commands")
      .set(businessTestHeaders(f.qualityA))
      .send({
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: f.version,
            pieceIds: f.order.pieces.map((piece) => piece.id),
          },
        ],
      });
    expect(response.status).toBe(500);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
    expect(JSON.stringify(response.body)).not.toContain(
      "Owned HTTP required save failure",
    );
    expect(await graph()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS p06_owned_http_save_failure ON quality_piece_events",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p06_owned_http_save_failure()");
  }
});

it("protected quality order history exposes minimal cancellation only and cannot enable admin events in its feed", async () => {
  const f = await createQualityFixture(db),
    reader = f.qualityA,
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
    .get(`/api/v1/quality/orders/${f.order.id}/history`)
    .set(businessTestHeaders(reader));
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  const history = qualityOrderHistoryDataSchema.parse(
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
    .get("/api/v1/quality/activity")
    .set(businessTestHeaders(reader));
  expect(own.status).toBe(200);
  expect(
    qualityActivityDataSchema
      .parse(successEnvelopeSchema.parse(own.body).data)
      .events.map((item) => item.kind),
  ).not.toContain("administration");
  const invalid = await request(app)
    .get("/api/v1/quality/activity?includeAdministration=true")
    .set(businessTestHeaders(reader));
  expect(invalid.status).toBe(400);
});
