import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createDatabaseClient, Prisma } from "@template/database";
import {
  qualityCommandBodySchema,
  warehouseCommandDataSchema,
  warehouseDashboardDataSchema,
  warehouseOrdersDataSchema,
  warehousePiecesDataSchema,
  warehouseOrderDataSchema,
  warehouseActivityDataSchema,
  warehouseOrderHistoryDataSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
} from "@template/contracts";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { appendQualityOrder } from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
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
const httpServer = createServer(app);
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
});
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    try {
      await resetOwnedIdentityTestData(db);
    } finally {
      await db.$disconnect();
    }
  }
});
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const acceptedFixture = async () => {
  const f = await createQualityFixture(db),
    orderId = f.order.id,
    pieceIds = f.order.pieces.map((piece) => piece.id),
    quality = new QualityCommandExecutor(db);
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [{ orderId, expectedVersion: await version(orderId), pieceIds }],
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          decisions: pieceIds.map((pieceId) => ({
            pieceId,
            decision: "ACCEPT",
          })),
          inspectorNote: "Original inspection",
          packing: { cartonCount: " 2 " },
        },
      ],
    }),
  });
  return { ...f, orderId, pieceIds };
};
const post = async (actorId: string, body: object) => {
  const response = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actorId))
    .send(body);
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  return warehouseCommandDataSchema.parse(
    successEnvelopeSchema.parse(response.body).data,
  );
};
const graph = () =>
  db.$queryRaw(Prisma.sql`SELECT jsonb_build_object(
  'roots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_drafts t),
  'headers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_orders t),
  'pieces',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_order_pieces t),
  'captures',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_draft_pieces t),
  'quality',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM quality_commands t),
  'packing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_packing_groups t),
  'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM warehouse_commands t),
  'orders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM warehouse_command_orders t),
  'groups',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_receipt_groups t),
  'receipts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY piece_id) FROM warehouse_receipt_pieces t),
  'attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_attempts t),
  'members',(SELECT jsonb_agg(to_jsonb(t) ORDER BY attempt_id,piece_id) FROM warehouse_delivery_attempt_members t),
  'outcomes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_outcomes t),
  'retries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warehouse_delivery_retries t),
  'corrections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_correction_cycles t),
  'issues',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_issues t),
  'approval',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM approval_commands t),
  'sales',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM sales_commands t),
  'manufacturing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM manufacturing_commands t),
  'manufacturingOrders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM manufacturing_command_orders t),
  'manufacturingEvents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_piece_events t),
  'manufacturingVisits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM manufacturing_work_visits t),
  'qualityOrders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id) FROM quality_command_orders t),
  'qualityEvents',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_piece_events t),
  'qualityVisits',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM quality_work_visits t),
  'packingMembers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY group_id,piece_id) FROM quality_packing_pieces t),
  'proposals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM piece_contact_proposals t),
  'qualityReports',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id,order_id,ordinal) FROM quality_approval_reports t),
  'catalogSelections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY piece_id,field) FROM sales_piece_catalog_selections t)) AS graph`);
const warehouseActor = async (adminId: string) => {
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      email: id + "@example.test",
      fullName: "Warehouse staff",
      passwordHash: "synthetic-only",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await new StaffService(db).approveStaff(adminId, id, {
    commandId: randomUUID(),
    expectedAccessVersion: 0,
    department: "WAREHOUSE",
  });
  return id;
};

it.each(["ADMIN", "WAREHOUSE"] as const)(
  "serves all eight protected warehouse routes and five real operations for %s with original replay",
  async (role) => {
    const f = await acceptedFixture(),
      actorId =
        role === "ADMIN"
          ? f.approvalActorId
          : await warehouseActor(f.approvalActorId),
      orderId = f.orderId,
      pieceIds = f.pieceIds;
    const originalBody = {
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds,
          receipt: {
            cartonCount: " 1 ",
            storageLocation: "Shelf B-12",
            notes: "Keep dry",
          },
        },
      ],
    };
    const received = await post(actorId, originalBody);
    const dispatch = async () =>
      post(actorId, {
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds,
            deliveryNote: "Customer delivery",
          },
        ],
      });
    const first = await dispatch(),
      firstAttempt = first.outcome.orders[0]?.attemptId;
    if (!firstAttempt) throw new Error("First attempt required");
    await post(actorId, {
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds,
          attemptId: firstAttempt,
          returnedToWarehouse: true,
          reason: "Customer unavailable",
          notes: "Whole scope returned",
        },
      ],
    });
    await post(actorId, {
      commandId: randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds,
          attemptId: firstAttempt,
          retryDate: "2026-11-15",
          notes: "New date confirmed",
        },
      ],
    });
    const second = await dispatch(),
      secondAttempt = second.outcome.orders[0]?.attemptId;
    if (!secondAttempt) throw new Error("Second attempt required");
    await post(actorId, {
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds,
          attemptId: secondAttempt,
          recipient: "Test Recipient",
          deliveredAt: "2026-11-13T12:30:00Z",
          notes: "Complete delivery",
        },
      ],
    });
    for (const [path, schema] of [
      ["/warehouse/dashboard?search=", warehouseDashboardDataSchema],
      ["/warehouse/orders?view=DELIVERED", warehouseOrdersDataSchema],
      [
        "/warehouse/pieces?view=DELIVERED&orderId=" + orderId,
        warehousePiecesDataSchema,
      ],
      ["/warehouse/orders/" + orderId, warehouseOrderDataSchema],
      ["/warehouse/activity", warehouseActivityDataSchema],
      [
        "/warehouse/orders/" + orderId + "/history",
        warehouseOrderHistoryDataSchema,
      ],
      [
        "/warehouse-commands/" + originalBody.commandId,
        warehouseCommandDataSchema,
      ],
    ] as const) {
      const response = await request(httpServer)
        .get("/api/v1" + path)
        .set(businessTestHeaders(actorId));
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(
        schema.safeParse(successEnvelopeSchema.parse(response.body).data)
          .success,
      ).toBe(true);
    }
    const beforeReplay = await graph();
    expect(await post(actorId, originalBody)).toEqual({
      ...received,
      replayed: true,
    });
    expect(await graph()).toEqual(beforeReplay);
    expect(await db.warehouseReceiptPiece.count()).toBe(2);
    expect(await db.warehouseDeliveryAttempt.count()).toBe(2);
    expect(await db.warehouseDeliveryOutcome.count()).toBe(2);
  },
);

it("rejects current unverified, pending, suspended and reassigned identities without leaking warehouse resources", async () => {
  const f = await acceptedFixture(),
    staff = new StaffService(db),
    suspended = await warehouseActor(f.approvalActorId),
    reassigned = await warehouseActor(f.approvalActorId);
  await staff.suspendStaff(f.approvalActorId, suspended, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
  });
  await staff.changeDepartment(f.approvalActorId, reassigned, {
    commandId: randomUUID(),
    expectedAccessVersion: 1,
    department: "SALES",
  });
  const restricted: string[] = [];
  for (const status of ["PENDING_VERIFICATION", "PENDING_APPROVAL"] as const) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        email: id + "@example.test",
        fullName: "Restricted fixture",
        passwordHash: "synthetic-only",
        status,
        emailVerifiedAt: status === "PENDING_VERIFICATION" ? null : new Date(),
      },
    });
    restricted.push(id);
  }
  const before = await graph();
  for (const id of [...restricted, suspended, reassigned]) {
    const read = await request(httpServer)
      .get("/api/v1/warehouse/orders/" + f.orderId)
      .set(businessTestHeaders(id));
    expect(read.status).toBe(403);
    expect(errorEnvelopeSchema.parse(read.body).code).toBe(
      id === reassigned ? "DEPARTMENT_ACCESS_DENIED" : "ACCOUNT_RESTRICTED",
    );
    expect(read.headers["cache-control"]).toBe("no-store");
    const write = await request(httpServer)
      .post("/api/v1/warehouse/commands")
      .set(businessTestHeaders(id))
      .send({
        commandId: randomUUID(),
        operation: "RECEIVE",
        orders: [
          {
            orderId: f.orderId,
            expectedVersion: await version(f.orderId),
            pieceIds: f.pieceIds,
          },
        ],
      });
    expect(write.status).toBe(403);
    expect(errorEnvelopeSchema.parse(write.body).code).toBe(
      id === reassigned ? "DEPARTMENT_ACCESS_DENIED" : "ACCOUNT_RESTRICTED",
    );
    expect(await graph()).toEqual(before);
  }
});

it("enforces strict wire fields, selection bounds, failure acknowledgement and real dates before business effects", async () => {
  const f = await acceptedFixture(),
    actor = f.approvalActorId,
    group = {
      orderId: f.orderId,
      expectedVersion: await version(f.orderId),
      pieceIds: f.pieceIds,
    },
    before = await graph();
  const receiveBody = () => ({
    commandId: randomUUID(),
    operation: "RECEIVE",
    orders: [group],
  });
  const invalid: object[] = [
    { ...receiveBody(), actorId: actor },
    { ...receiveBody(), status: "DELIVERED" },
    { ...receiveBody(), counts: { received: 2 } },
    { ...receiveBody(), orders: [] },
    { ...receiveBody(), orders: [group, group] },
    {
      ...receiveBody(),
      orders: [{ ...group, pieceIds: [f.pieceIds[0], f.pieceIds[0]] }],
    },
    {
      ...receiveBody(),
      orders: [
        { ...group, pieceIds: Array.from({ length: 201 }, () => randomUUID()) },
      ],
    },
    ...[
      {},
      { returnedToWarehouse: false },
      { returnedToWarehouse: true, reason: " " },
      { returnedToWarehouse: true, reason: "x".repeat(4001) },
    ].map((capture) => ({
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [{ ...group, attemptId: randomUUID(), ...capture }],
    })),
    {
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          ...group,
          attemptId: randomUUID(),
          deliveredAt: "2026-02-30T12:30:00Z",
        },
      ],
    },
    {
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          ...group,
          attemptId: randomUUID(),
          deliveredAt: "2026-11-13T12:30:00",
        },
      ],
    },
    {
      commandId: randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [{ ...group, attemptId: randomUUID(), retryDate: "2026-02-30" }],
    },
  ];
  for (const body of invalid) {
    const response = await request(httpServer)
      .post("/api/v1/warehouse/commands")
      .set(businessTestHeaders(actor))
      .send(body);
    expect(response.status).toBe(400);
    const error = errorEnvelopeSchema.parse(response.body);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.errors?.some((field) => field.field.startsWith("body"))).toBe(
      true,
    );
    expect(error.stack).toBeUndefined();
    expect(await graph()).toEqual(before);
  }
  const oversized = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actor))
    .send({ ...receiveBody(), notes: "x".repeat(1_100_000) });
  expect(oversized.status).toBe(413);
  expect(errorEnvelopeSchema.parse(oversized.body).code).toBe(
    "PAYLOAD_TOO_LARGE",
  );
  expect(await graph()).toEqual(before);
});

it("returns exact resource, scope and command conflicts without saving a partial delivery", async () => {
  const f = await acceptedFixture(),
    actor = f.approvalActorId,
    orderId = f.orderId,
    other = await appendQualityOrder(db, f);
  const before = await graph();
  for (const id of [other.id, randomUUID()]) {
    const missing = await request(httpServer)
      .get("/api/v1/warehouse/orders/" + id)
      .set(businessTestHeaders(actor));
    expect(missing.status).toBe(404);
    expect(errorEnvelopeSchema.parse(missing.body).code).toBe(
      "ORDER_NOT_FOUND",
    );
  }
  const foreign = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actor))
    .send({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId,
          expectedVersion: 1,
          pieceIds: other.pieces.map((piece) => piece.id),
        },
      ],
    });
  expect(foreign.status).toBe(404);
  expect(errorEnvelopeSchema.parse(foreign.body).code).toBe("ORDER_NOT_FOUND");
  expect(await graph()).toEqual(before);
  const receipt = {
    commandId: randomUUID(),
    operation: "RECEIVE",
    orders: [
      {
        orderId,
        expectedVersion: await version(orderId),
        pieceIds: f.pieceIds,
        receipt: { notes: "Original" },
      },
    ],
  };
  await post(actor, receipt);
  const ready = await graph();
  const changed = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actor))
    .send({
      ...receipt,
      orders: receipt.orders.map((group) => ({
        ...group,
        receipt: { notes: "Changed" },
      })),
    });
  expect(changed.status).toBe(409);
  expect(errorEnvelopeSchema.parse(changed.body).code).toBe(
    "WAREHOUSE_COMMAND_CONFLICT",
  );
  const subset = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actor))
    .send({
      commandId: randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds.slice(0, 1),
        },
      ],
    });
  expect(subset.status).toBe(409);
  expect(errorEnvelopeSchema.parse(subset.body).code).toBe(
    "WAREHOUSE_SELECTION_CONFLICT",
  );
  expect(await graph()).toEqual(ready);
  await post(actor, {
    commandId: randomUUID(),
    operation: "DISPATCH",
    orders: [
      {
        orderId,
        expectedVersion: await version(orderId),
        pieceIds: f.pieceIds,
      },
    ],
  });
  const dispatched = await graph();
  const old = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(actor))
    .send({
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId,
          expectedVersion: await version(orderId),
          pieceIds: f.pieceIds,
          attemptId: randomUUID(),
        },
      ],
    });
  expect(old.status).toBe(409);
  expect(errorEnvelopeSchema.parse(old.body).code).toBe(
    "WAREHOUSE_SELECTION_CONFLICT",
  );
  expect(await graph()).toEqual(dispatched);
});

it.each(["23514", "23503"] as const)(
  "returns safe500 and unchanged state after unexpected required-save SQLSTATE %s",
  async (sqlState) => {
    const f = await acceptedFixture(),
      before = await graph();
    await db.$executeRawUnsafe(
      "CREATE FUNCTION p07_owned_http_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private controlled SQL detail' USING ERRCODE='" +
        sqlState +
        "'; END $$",
    );
    await db.$executeRawUnsafe(
      "CREATE TRIGGER p07_owned_http_fault BEFORE INSERT ON warehouse_receipt_groups FOR EACH ROW EXECUTE FUNCTION p07_owned_http_fault()",
    );
    try {
      const response = await request(httpServer)
        .post("/api/v1/warehouse/commands")
        .set(businessTestHeaders(f.approvalActorId))
        .send({
          commandId: randomUUID(),
          operation: "RECEIVE",
          orders: [
            {
              orderId: f.orderId,
              expectedVersion: await version(f.orderId),
              pieceIds: f.pieceIds,
            },
          ],
        });
      expect(response.status).toBe(500);
      const error = errorEnvelopeSchema.parse(response.body);
      expect(error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(error.stack).toBeUndefined();
      expect(error.requestId.length).toBeGreaterThan(0);
      expect(JSON.stringify(error)).not.toMatch(
        /private controlled|23514|Prisma|warehouse_receipt/iu,
      );
      expect(await graph()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER p07_owned_http_fault ON warehouse_receipt_groups",
      );
      await db.$executeRawUnsafe("DROP FUNCTION p07_owned_http_fault()");
    }
  },
);

it("rejects unauthenticated, wrong-department, CSRF, malformed and stale requests without domain effects", async () => {
  const f = await acceptedFixture(),
    body = {
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.orderId,
          expectedVersion: await version(f.orderId),
          pieceIds: f.pieceIds,
        },
      ],
    },
    before = await graph();
  const anonymous = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .send(body);
  expect(anonymous.status).toBe(401);
  expect(errorEnvelopeSchema.safeParse(anonymous.body).success).toBe(true);
  const wrongDepartment = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(f.qualityA))
    .send(body);
  expect(wrongDepartment.status).toBe(403);
  const missingCsrf = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set("Authorization", businessTestHeaders(f.approvalActorId).Authorization)
    .send(body);
  expect(missingCsrf.status).toBe(403);
  const invalid = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(f.approvalActorId))
    .send({ ...body, actorId: f.qualityA });
  expect(invalid.status).toBe(400);
  const stale = await request(httpServer)
    .post("/api/v1/warehouse/commands")
    .set(businessTestHeaders(f.approvalActorId))
    .send({
      ...body,
      orders: body.orders.map((group) => ({
        ...group,
        expectedVersion: group.expectedVersion - 1,
      })),
    });
  expect(stale.status).toBe(409);
  expect(await graph()).toEqual(before);
});

it("recovers the original committed HTTP result after its response body is deliberately lost", async () => {
  const f = await acceptedFixture(),
    actorId = await warehouseActor(f.approvalActorId),
    otherId = await warehouseActor(f.approvalActorId),
    commandId = randomUUID();
  const body = {
    commandId,
    operation: "RECEIVE",
    orders: [
      {
        orderId: f.orderId,
        expectedVersion: await version(f.orderId),
        pieceIds: f.pieceIds,
        receipt: { notes: "Original uncertain arrival" },
      },
    ],
  };
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Owned HTTP listener required");
    await new Promise<void>((resolve, reject) => {
      const encoded = JSON.stringify(body),
        outgoing = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/api/v1/warehouse/commands",
            method: "POST",
            headers: {
              ...businessTestHeaders(actorId),
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(encoded),
            },
          },
          (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              reject(
                new Error(
                  "Expected a real committed success before response loss",
                ),
              );
              return;
            }
            // No response body is delivered to the caller; service COMMIT preceded these success headers.
            response.on("error", reject);
            response.destroy();
            resolve();
          },
        );
      outgoing.on("error", reject);
      outgoing.end(encoded);
    });
    const observed = await request(httpServer)
      .get("/api/v1/warehouse-commands/" + commandId)
      .set(businessTestHeaders(actorId));
    expect(observed.status).toBe(200);
    const original = warehouseCommandDataSchema.parse(
      successEnvelopeSchema.parse(observed.body).data,
    );
    expect(original).toMatchObject({
      replayed: true,
      receipt: { commandId, actor: { id: actorId } },
    });
    const after = await graph();
    expect(await post(actorId, body)).toEqual(original);
    const changed = await request(httpServer)
      .post("/api/v1/warehouse/commands")
      .set(businessTestHeaders(actorId))
      .send({
        ...body,
        orders: body.orders.map((group) => ({
          ...group,
          receipt: { notes: "Changed capture" },
        })),
      });
    expect(changed.status).toBe(409);
    const foreign = await request(httpServer)
      .get("/api/v1/warehouse-commands/" + commandId)
      .set(businessTestHeaders(otherId));
    expect(foreign.status).toBe(404);
    expect(await graph()).toEqual(after);
    await new StaffService(db).suspendStaff(f.approvalActorId, actorId, {
      commandId: randomUUID(),
      expectedAccessVersion: 1,
    });
    const denied = await request(httpServer)
      .get("/api/v1/warehouse-commands/" + commandId)
      .set(businessTestHeaders(actorId));
    expect(denied.status).toBe(403);
    expect(await db.warehouseCommand.count()).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

it("does not treat observation 404 as permanent absence before a delayed original POST", async () => {
  const f = await acceptedFixture(),
    actorId = f.approvalActorId,
    commandId = randomUUID(),
    body = {
      commandId,
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.orderId,
          expectedVersion: await version(f.orderId),
          pieceIds: f.pieceIds,
        },
      ],
    };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = gate.then(() => post(actorId, body));
  try {
    const missing = await request(httpServer)
      .get("/api/v1/warehouse-commands/" + commandId)
      .set(businessTestHeaders(actorId));
    expect(missing.status).toBe(404);
    expect(await db.warehouseCommand.count()).toBe(0);
    release();
    const saved = await original;
    const recovered = await request(httpServer)
      .get("/api/v1/warehouse-commands/" + commandId)
      .set(businessTestHeaders(actorId));
    expect(recovered.status).toBe(200);
    expect(
      warehouseCommandDataSchema.parse(
        successEnvelopeSchema.parse(recovered.body).data,
      ),
    ).toEqual({ ...saved, replayed: true });
    expect(await post(actorId, body)).toEqual({ ...saved, replayed: true });
    expect(await db.warehouseCommand.count()).toBe(1);
    expect(await db.warehouseReceiptPiece.count()).toBe(2);
  } finally {
    release();
    await Promise.allSettled([original]);
  }
});
