import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { createDatabaseClient } from "@template/database";
import {
  administrationDashboardDataSchema,
  administrationFilterOptionsDataSchema,
  administrationOrdersDataSchema,
  administrationOrderDataSchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsDataSchema,
  administrationActivityDataSchema,
  administrationReportDataSchema,
  administrationReportPrintDataSchema,
  administrationCommandDataSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  salesOrderTypeSchema,
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
} from "@template/contracts";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import { createManufacturingFixture } from "../../test-support/manufacturing.fixture.js";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { WarehouseCommandExecutor } from "../warehouse/warehouse-command-executor.js";
import { generateTokenPair } from "../../infrastructure/security/jwt.service.js";

const originalZone = vi.hoisted(() => {
  vi.resetModules();
  const prior = process.env["ORDER_BUSINESS_TIME_ZONE"];
  process.env["ORDER_BUSINESS_TIME_ZONE"] = "UTC";
  return prior;
});
const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri),
  logger = pino({ enabled: false }),
  emailDelivery = {
    provider: "console" as const,
    send: () => Promise.resolve({ providerMessageId: "unused" }),
  },
  app = createApp({ database: db, logger, emailDelivery });
const server = createServer(app);
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
});
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    if (server.listening)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
  } finally {
    try {
      await resetOwnedIdentityTestData(db);
    } finally {
      try {
        await db.$disconnect();
      } finally {
        if (originalZone === undefined)
          delete process.env["ORDER_BUSINESS_TIME_ZONE"];
        else process.env["ORDER_BUSINESS_TIME_ZONE"] = originalZone;
      }
    }
  }
});

const graph = () => db.$queryRaw`SELECT jsonb_build_object(
 'roots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_drafts r),
 'headers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_orders r),
 'pieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_order_pieces r),
 'commands',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_commands r),
 'corrections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_order_corrections r),
 'cancelled',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,piece_id) FROM administration_cancelled_pieces r),
 'visits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_work_visits r),
 'qualityVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_work_visits r)) AS graph`;
const safeResponseContext = (response: request.Response): string => {
  const error = errorEnvelopeSchema.safeParse(response.body);
  return JSON.stringify({
    contentType: response.headers["content-type"],
    code: error.success ? error.data.code : "non-error-envelope",
    requestId: error.success ? error.data.requestId : null,
  });
};
const get = async <T>(actorId: string, path: string, schema: ZodType<T>) => {
  const response = await request(server)
    .get("/api/v1" + path)
    .set(businessTestHeaders(actorId));
  expect(response.status, safeResponseContext(response)).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  return schema.parse(successEnvelopeSchema.parse(response.body).data);
};
const post = async (actorId: string, body: object) => {
  const response = await request(server)
    .post("/api/v1/administration/commands")
    .set(businessTestHeaders(actorId))
    .set("x-request-id", "p08-owned-http")
    .send(body);
  expect(response.status, safeResponseContext(response)).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(successEnvelopeSchema.parse(response.body).requestId).toBe(
    "p08-owned-http",
  );
  return administrationCommandDataSchema.parse(
    successEnvelopeSchema.parse(response.body).data,
  );
};
const version = async (orderId: string) =>
  (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: orderId },
      select: { version: true },
    })
  ).version;
const correctionBody = (orderId: string, expectedVersion: number) => ({
  commandId: randomUUID(),
  operation: "ADMIN_CORRECT",
  orderId,
  expectedVersion,
  patch: { customerAddress: "Corrected delivery address" },
  reason: "Fix copied address",
});
it("serves every canonical read/command/recovery route with strict context and original replay", async () => {
  const f = await createManufacturingFixture(db),
    id = f.order.id,
    actor = f.approvalActorId;
  const reads: [string, ZodType][] = [
    ["/administration/dashboard", administrationDashboardDataSchema],
    ["/administration/filter-options", administrationFilterOptionsDataSchema],
    ["/administration/orders", administrationOrdersDataSchema],
    [`/administration/orders/${id}`, administrationOrderDataSchema],
    [`/administration/orders/${id}/history`, administrationActivityDataSchema],
    ["/administration/approvals", administrationApprovalsDataSchema],
    ["/administration/corrections", administrationCorrectionsDataSchema],
    [
      "/administration/delivery-exceptions",
      administrationDeliveryExceptionsDataSchema,
    ],
    ["/administration/activity", administrationActivityDataSchema],
    ["/administration/reports", administrationReportDataSchema],
    ["/administration/reports/print", administrationReportPrintDataSchema],
  ];
  for (const [path, schema] of reads) await get(actor, path, schema);
  const body = correctionBody(id, await version(id)),
    saved = await post(actor, body);
  expect(saved.replayed).toBe(false);
  expect(await post(actor, body)).toEqual({ ...saved, replayed: true });
  expect(
    await get(
      actor,
      `/administration-commands/${body.commandId}`,
      administrationCommandDataSchema,
    ),
  ).toEqual({ ...saved, replayed: true });
  const detail = await get(
    actor,
    `/administration/orders/${id}`,
    administrationOrderDataSchema,
  );
  expect(detail).toMatchObject({
    kind: "submitted",
    order: {
      version: saved.receipt.afterVersion,
      customerSnapshot: { address: "Corrected delivery address" },
    },
    correction: {
      lastCorrection: { id: body.commandId, actor: saved.receipt.actor },
    },
  });
  const conflict = await request(server)
    .post("/api/v1/administration/commands")
    .set(businessTestHeaders(actor))
    .send({ ...body, reason: "Changed intent" });
  expect(conflict.status).toBe(409);
  expect(errorEnvelopeSchema.parse(conflict.body).code).toBe(
    "ADMINISTRATION_COMMAND_CONFLICT",
  );
  const unknown = await request(server)
    .get(`/api/v1/administration-commands/${randomUUID()}`)
    .set(businessTestHeaders(actor));
  expect(unknown.status).toBe(404);
  expect(errorEnvelopeSchema.parse(unknown.body).code).toBe(
    "ADMINISTRATION_COMMAND_NOT_FOUND",
  );
  const absent = await request(server)
    .get(`/api/v1/administration/orders/${randomUUID()}`)
    .set(businessTestHeaders(actor));
  expect(absent.status).toBe(404);
  expect(errorEnvelopeSchema.parse(absent.body).code).toBe("ORDER_NOT_FOUND");
  const unchangedBefore = await graph();
  for (const [invalid, code, status] of [
    [
      {
        ...correctionBody(id, await version(id)),
        patch: { customerAddress: "Corrected delivery address" },
      },
      "ADMINISTRATION_CORRECTION_UNCHANGED",
      409,
    ],
    [correctionBody(id, body.expectedVersion), "ORDER_VERSION_CONFLICT", 409],
    [
      {
        commandId: randomUUID(),
        operation: "ADMIN_CANCEL",
        orderId: id,
        expectedVersion: await version(id),
        scope: "ORDER",
        pieceIds: [f.order.pieces[0]?.id],
      },
      "ADMINISTRATION_SELECTION_CONFLICT",
      409,
    ],
    [
      {
        commandId: randomUUID(),
        operation: "ADMIN_CANCEL",
        orderId: id,
        expectedVersion: await version(id),
        scope: "ITEM",
        pieceIds: [randomUUID()],
      },
      "ORDER_NOT_FOUND",
      404,
    ],
  ] as const) {
    const response = await request(server)
      .post("/api/v1/administration/commands")
      .set(businessTestHeaders(actor))
      .send(invalid);
    expect(response.status).toBe(status);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(code);
  }
  const other = randomUUID();
  await db.user.create({
    data: {
      id: other,
      email: other + "@example.test",
      fullName: "Other current admin",
      passwordHash: "synthetic-only",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const privateResult = await request(server)
    .get(`/api/v1/administration-commands/${body.commandId}`)
    .set(businessTestHeaders(other));
  expect(privateResult.status).toBe(404);
  expect(errorEnvelopeSchema.parse(privateResult.body).code).toBe(
    "ADMINISTRATION_COMMAND_NOT_FOUND",
  );
  expect(await graph()).toEqual(unchangedBefore);
});
it("all six employee departments, restricted identities and stale ADMIN claims are denied without domain mutation", async () => {
  const f = await createManufacturingFixture(db),
    staff = new StaffService(db),
    actors = [f.cuttingA, f.productionA];
  for (const department of [
    "SALES",
    "APPROVAL",
    "QUALITY",
    "WAREHOUSE",
  ] as const) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        email: id + "@example.test",
        fullName: "Scoped colleague",
        passwordHash: "synthetic-only",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await staff.approveStaff(f.approvalActorId, id, {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department,
    });
    actors.push(id);
  }
  const restricted = randomUUID();
  await db.user.create({
    data: {
      id: restricted,
      email: restricted + "@example.test",
      fullName: "Pending colleague",
      passwordHash: "synthetic-only",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  const before = await graph(),
    paths = [
      "/administration/dashboard",
      "/administration/filter-options",
      "/administration/orders",
      `/administration/orders/${f.order.id}`,
      `/administration/orders/${f.order.id}/history`,
      "/administration/approvals",
      "/administration/corrections",
      "/administration/delivery-exceptions",
      "/administration/activity",
      "/administration/reports",
      "/administration/reports/print",
      `/administration-commands/${randomUUID()}`,
    ];
  for (const actor of [...actors, restricted]) {
    for (const path of paths) {
      const response = await request(server)
        .get("/api/v1" + path)
        .set(businessTestHeaders(actor));
      expect(response.status, safeResponseContext(response)).toBe(403);
      errorEnvelopeSchema.parse(response.body);
    }
    const write = await request(server)
      .post("/api/v1/administration/commands")
      .set(businessTestHeaders(actor))
      .send(correctionBody(f.order.id, await version(f.order.id)));
    expect(write.status).toBe(403);
  }
  const staleId = actors[0];
  if (!staleId) throw new Error("Current employee required");
  const stale = generateTokenPair({
    userId: staleId,
    tokenId: randomUUID(),
    role: "ADMIN",
    email: staleId + "@example.test",
    rememberMe: false,
    absoluteExpiresAt: new Date(Date.now() + 3600000),
  });
  const denied = await request(server)
    .get("/api/v1/administration/orders")
    .set("Authorization", `Bearer ${stale.accessToken}`);
  expect(denied.status).toBe(403);
  const anonymous = await request(server).get("/api/v1/administration/orders");
  expect(anonymous.status).toBe(401);
  expect(await graph()).toEqual(before);
});
it("rejects missing CSRF, unknown fields, invalid pagination, excessive intent and global parser excess unchanged", async () => {
  const f = await createManufacturingFixture(db),
    body = correctionBody(f.order.id, await version(f.order.id)),
    before = await graph(),
    headers = businessTestHeaders(f.approvalActorId);
  const noCsrf = await request(server)
    .post("/api/v1/administration/commands")
    .set({ Authorization: headers.Authorization })
    .send(body);
  expect(noCsrf.status).toBe(403);
  for (const invalid of [
    { ...body, actorId: f.approvalActorId },
    { ...body, patch: { paidAmount: "1.00" } },
    { ...body, expectedVersion: 2147483647 },
    { ...body, reason: "é".repeat(40000) },
  ]) {
    const response = await request(server)
      .post("/api/v1/administration/commands")
      .set(headers)
      .send(invalid);
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(
      "VALIDATION_ERROR",
    );
  }
  for (const path of [
    "/administration/orders?limit=101",
    "/administration/orders?actorId=forged",
    "/administration/reports/print?page=1",
  ]) {
    const response = await request(server)
      .get("/api/v1" + path)
      .set(headers);
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(
      "VALIDATION_ERROR",
    );
  }
  const large = await request(server)
    .post("/api/v1/administration/commands")
    .set(headers)
    .send({ ...body, reason: "é".repeat(600000) });
  expect(large.status).toBe(413);
  expect(errorEnvelopeSchema.parse(large.body).code).toBe("PAYLOAD_TOO_LARGE");
  expect(await graph()).toEqual(before);
});
it.each(salesOrderTypeSchema.options)(
  "keeps %s preapproval cancellation/correction and full cancellation bound to exact physical IDs",
  async (type) => {
    const f = await createApprovalOrderFixture(db, type, [
        "زبيري - z",
        "زبيري - z",
      ]),
      ids = f.order.pieces.map((piece) => piece.id),
      selected = ids[0];
    if (!selected) throw new Error("Physical member required");
    const partial = await post(f.approvalActorId, {
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: f.order.id,
      expectedVersion: await version(f.order.id),
      scope: "QUANTITY",
      pieceIds: [selected],
    });
    expect(partial.after).toMatchObject({
      status: "AWAITING_APPROVAL",
      counts: { original: 2, cancelled: 1, active: 1 },
      money: { paidAmount: f.order.money.paidAmount },
    });
    const corrected = await post(
      f.approvalActorId,
      correctionBody(f.order.id, await version(f.order.id)),
    );
    expect(corrected.after.status).toBe("AWAITING_APPROVAL");
    const remaining = ids.filter((id) => id !== selected),
      complete = await post(f.approvalActorId, {
        commandId: randomUUID(),
        operation: "ADMIN_CANCEL",
        orderId: f.order.id,
        expectedVersion: await version(f.order.id),
        scope: "ORDER",
        pieceIds: remaining,
      });
    expect(complete.after).toMatchObject({
      status: "CANCELLED",
      counts: { active: 0 },
      money: { total: "0.00", paidAmount: f.order.money.paidAmount },
    });
    const terminal = await post(f.approvalActorId, {
      ...correctionBody(f.order.id, await version(f.order.id)),
      patch: { generalNotes: "Terminal administrative note" },
    });
    expect(terminal.after.status).toBe("CANCELLED");
    expect(terminal.after.pieces).toEqual(complete.after.pieces);
    const detail = await get(
      f.approvalActorId,
      `/administration/orders/${f.order.id}`,
      administrationOrderDataSchema,
    );
    expect(detail).toMatchObject({
      kind: "submitted",
      adminActions: { canCancel: false, canCorrect: true },
      order: { type },
    });
  },
);
it("corrects delivered contact without restarting work or rewriting the original delivery attempt", async () => {
  const f = await createQualityFixture(db),
    quality = new QualityCommandExecutor(db),
    warehouse = new WarehouseCommandExecutor(db),
    pieces = f.order.pieces.map((piece) => piece.id);
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds: pieces,
        },
      ],
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          decisions: pieces.map((pieceId) => ({ pieceId, decision: "ACCEPT" })),
        },
      ],
    }),
  });
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds: pieces,
        },
      ],
    }),
  });
  const dispatched = await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds: pieces,
        },
      ],
    }),
  });
  const attemptId = dispatched.outcome.orders[0]?.attemptId;
  if (!attemptId) throw new Error("Real dispatch required");
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "CONFIRM_DELIVERY",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(f.order.id),
          pieceIds: pieces,
          attemptId,
          recipient: "Actual recipient",
          deliveredAt: new Date().toISOString(),
        },
      ],
    }),
  });
  const attempts = await db.warehouseDeliveryAttempt.findMany(),
    outcomes = await db.warehouseDeliveryOutcome.findMany(),
    physical = await db.salesOrderPiece.findMany({
      where: { orderId: f.order.id },
      orderBy: { id: "asc" },
    });
  const saved = await post(
    f.approvalActorId,
    correctionBody(f.order.id, await version(f.order.id)),
  );
  expect(saved.after.status).toBe("DELIVERED");
  expect(await db.warehouseDeliveryAttempt.findMany()).toEqual(attempts);
  expect(await db.warehouseDeliveryOutcome.findMany()).toEqual(outcomes);
  expect(
    await db.salesOrderPiece.findMany({
      where: { orderId: f.order.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(physical);
});
it("returns a safe failure rather than an empty successful list when the transaction boundary fails", async () => {
  const f = await createManufacturingFixture(db),
    before = await graph();
  // Controlled database-boundary fault; this asserts HTTP failure mapping, not a live outage.
  const fault = vi
    .spyOn(db, "$transaction")
    .mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DIAGNOSTIC"));
  try {
    const response = await request(server)
      .get("/api/v1/administration/orders")
      .set(businessTestHeaders(f.approvalActorId));
    expect(response.status).toBe(500);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
    expect(JSON.stringify(response.body)).not.toContain(
      "PRIVATE_DATABASE_DIAGNOSTIC",
    );
  } finally {
    fault.mockRestore();
  }
  expect(await graph()).toEqual(before);
});
it("calendar-dependent HTTP reads fail explicitly while detail/history/command recovery remain available", async () => {
  const f = await createManufacturingFixture(db),
    prior = process.env["ORDER_BUSINESS_TIME_ZONE"];
  try {
    process.env["ORDER_BUSINESS_TIME_ZONE"] = "Invalid/OwnedTestZone";
    vi.resetModules();
    const { createApp: build } = await import("../../app.js"),
      missing = build({ database: db, logger, emailDelivery });
    const response = await request(missing)
      .get("/api/v1/administration/reports")
      .set(businessTestHeaders(f.approvalActorId));
    expect(response.status).toBe(503);
    expect(errorEnvelopeSchema.parse(response.body).code).toBe(
      "ORDER_CALENDAR_UNAVAILABLE",
    );
    for (const path of [
      `/administration/orders/${f.order.id}`,
      `/administration/orders/${f.order.id}/history`,
    ]) {
      const allowed = await request(missing)
        .get("/api/v1" + path)
        .set(businessTestHeaders(f.approvalActorId));
      expect(allowed.status).toBe(200);
    }
    const body = correctionBody(f.order.id, await version(f.order.id)),
      saved = await request(missing)
        .post("/api/v1/administration/commands")
        .set(businessTestHeaders(f.approvalActorId))
        .send(body);
    expect(saved.status).toBe(200);
    const observed = await request(missing)
      .get(`/api/v1/administration-commands/${body.commandId}`)
      .set(businessTestHeaders(f.approvalActorId));
    expect(observed.status).toBe(200);
    expect(
      administrationCommandDataSchema.parse(
        successEnvelopeSchema.parse(observed.body).data,
      ).replayed,
    ).toBe(true);
  } finally {
    if (prior === undefined) delete process.env["ORDER_BUSINESS_TIME_ZONE"];
    else process.env["ORDER_BUSINESS_TIME_ZONE"] = prior;
    vi.resetModules();
  }
});

it("HTTP report excess is a truthful 422 error envelope with no partial report", async () => {
  const f = await createManufacturingFixture(db),
    ids = Array.from({ length: 5000 }, () => randomUUID());
  await db.user.createMany({
    data: ids.map((id) => ({
      id,
      email: id + "@example.test",
      fullName: "Current directory guard fixture",
      passwordHash: "synthetic-only",
    })),
  });
  const response = await request(server)
    .get("/api/v1/administration/reports")
    .set(businessTestHeaders(f.approvalActorId));
  expect(response.status).toBe(422);
  expect(errorEnvelopeSchema.parse(response.body)).toMatchObject({
    success: false,
    statusCode: 422,
    code: "REPORT_SCOPE_TOO_LARGE",
  });
  expect(response.body).not.toHaveProperty("data");
});
