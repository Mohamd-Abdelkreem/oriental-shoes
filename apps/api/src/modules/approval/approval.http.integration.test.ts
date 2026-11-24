import { createServer } from "node:http";
import { advanceManufacturingReportFixture } from "../../test-support/manufacturing.fixture.js";
import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import type { ZodType } from "zod";
import { createDatabaseClient } from "@template/database";
import {
  approvalCommandDataSchema,
  approvalOrdersDataSchema,
  approvalIssuesDataSchema,
  approvalHistoryDataSchema,
  approvalDashboardDataSchema,
  approvalOrderDataSchema,
  approvalEventDataSchema,
  officialOrderPaperDataSchema,
  factoryOrderPaperDataSchema,
  salesContactDataSchema,
  salesOrderActivityDataSchema,
  salesOrderCommandDataSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  resubmitOrderBodySchema,
} from "@template/contracts";
import { createApp } from "../../app.js";
import { businessTestHeaders } from "../../test-support/business-http.fixture.js";
import { createApprovalOrderFixture } from "../../test-support/approval.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { StaffService } from "../staff/staff.service.js";

const originalZone = vi.hoisted(() => {
  vi.resetModules();
  const prior = process.env["ORDER_BUSINESS_TIME_ZONE"];
  process.env["ORDER_BUSINESS_TIME_ZONE"] = "UTC";
  return prior;
});
const uri = process.env["P01_TEST_DATABASE_URL"];
if (uri === undefined || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  app = createApp({
    database: db,
    logger: pino({ enabled: false }),
    emailDelivery: {
      provider: "console",
      send: () => Promise.resolve({ providerMessageId: "unused" }),
    },
  });
// Keep this file's real HTTP target bound until teardown, avoiding per-request port churn.
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
let fixture: Awaited<ReturnType<typeof createApprovalOrderFixture>>;
const actors = new Map<string, string>();
const actor = (key: string) => {
  const id = actors.get(key);
  if (id === undefined) throw new Error("Expected actual HTTP actor");
  return id;
};
beforeEach(async () => {
  await resetOwnedIdentityTestData(db);
  actors.clear();
  fixture = await createApprovalOrderFixture(
    db,
    "SHOP",
    ["زبيري - z", "نعام - O"],
    "SALES",
  );
  for (const [key, department] of [
    ["approvalA", "APPROVAL"],
    ["approvalB", "APPROVAL"],
    ["salesB", "SALES"],
    ["cutting", "CUTTING"],
    ["production", "PRODUCTION"],
    ["quality", "QUALITY"],
  ] as const) {
    const user = await db.user.create({
      data: {
        email: `${key.toLowerCase()}@example.test`,
        fullName: key,
        passwordHash: "synthetic",
        status: "PENDING_APPROVAL",
        emailVerifiedAt: new Date(),
      },
    });
    await new StaffService(db).approveStaff(fixture.approvalActorId, user.id, {
      commandId: randomUUID(),
      expectedAccessVersion: 0,
      department,
    });
    actors.set(key, user.id);
  }
  const restricted = await db.user.create({
    data: {
      email: "restricted-approval@example.test",
      fullName: "Pending account",
      passwordHash: "synthetic",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  actors.set("restricted", restricted.id);
});
afterAll(async () => {
  try {
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    try {
      await resetOwnedIdentityTestData(db);
    } finally {
      await db.$disconnect();
      if (originalZone === undefined)
        delete process.env["ORDER_BUSINESS_TIME_ZONE"];
      else process.env["ORDER_BUSINESS_TIME_ZONE"] = originalZone;
    }
  }
});

const get = async <T>(
  id: string,
  path: string,
  schema: ZodType<T>,
): Promise<T> => {
  const requestId = randomUUID(),
    response = await request(server)
      .get(`/api/v1${path}`)
      .set(businessTestHeaders(id))
      .set("x-request-id", requestId);
  expect(response.status, response.text).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers["x-request-id"]).toBe(requestId);
  return schema.parse(
    successEnvelopeSchema.parse(response.body as unknown).data,
  );
};
const post = async (id: string, path: string, body: object) => {
  const response = await request(server)
    .post(`/api/v1${path}`)
    .set(businessTestHeaders(id))
    .send(body);
  expect(response.status, response.text).toBe(200);
  return approvalCommandDataSchema.parse(
    successEnvelopeSchema.parse(response.body as unknown).data,
  );
};
const orderPath = () => `/approvals/orders/${fixture.order.id}`;
const pieceId = () => {
  const id = fixture.order.pieces[0]?.id;
  if (id === undefined) throw new Error("Expected piece");
  return id;
};
const issuePath = (id: string, piece = pieceId()) =>
  `${orderPath()}/pieces/${piece}/issues/${id}`;
const approve = () =>
  post(actor("approvalA"), `${orderPath()}/approve`, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
const report = async (version = 2, source = "cutting", piece = pieceId()) => {
  const result = await post(
    actor(source),
    `/manufacturing-orders/${fixture.order.id}/pieces/${piece}/issues`,
    {
      commandId: randomUUID(),
      expectedVersion: version,
      reason: "Actual source issue",
      notes: "Safe source notes",
    },
  );
  const issueId = result.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  return { issueId, result };
};
const graph = async () => ({
  workVisits: await db.manufacturingWorkVisit.findMany({
    where: { orderId: fixture.order.id },
    orderBy: [{ pieceId: "asc" }, { sequence: "asc" }],
  }),
  workOrders: await db.manufacturingCommandOrder.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { afterVersion: "asc" },
  }),
  workEvents: await db.manufacturingPieceEvent.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  workCommands: await db.manufacturingCommand.findMany({
    where: { orders: { some: { orderId: fixture.order.id } } },
    orderBy: { commandId: "asc" },
  }),

  root: await db.salesDraft.findUnique({ where: { id: fixture.order.id } }),
  order: await db.salesOrder.findUnique({ where: { id: fixture.order.id } }),
  pieces: await db.salesOrderPiece.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  capture: await db.salesDraftPiece.findMany({
    where: { draftId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  issues: await db.manufacturingIssue.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  proposals: await db.pieceContactProposal.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { id: "asc" },
  }),
  references: await db.salesPieceCatalogSelection.findMany({
    where: { piece: { draftId: fixture.order.id } },
    orderBy: [{ pieceId: "asc" }, { field: "asc" }],
  }),
  events: await db.approvalCommand.findMany({
    where: { orderId: fixture.order.id },
    orderBy: { afterVersion: "asc" },
  }),
  sales: await db.salesCommand.findMany({
    where: { draftId: fixture.order.id },
    orderBy: { afterVersion: "asc" },
  }),
});

it("serves all approval reads and real return→P03 resubmit→approval with current history and private responses", async () => {
  const pending = await get(
    actor("approvalA"),
    "/approvals/orders",
    approvalOrdersDataSchema,
  );
  expect(pending.pagination.total).toBe(1);
  expect(
    (
      await get(
        actor("approvalB"),
        "/approvals/dashboard",
        approvalDashboardDataSchema,
      )
    ).counts.initialOrders,
  ).toBe(1);
  expect(
    (
      await get(
        actor("approvalA"),
        "/approvals/issues",
        approvalIssuesDataSchema,
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await get(
        actor("approvalB"),
        "/approvals/history",
        approvalHistoryDataSchema,
      )
    ).events,
  ).toEqual([]);
  expect(
    (await get(actor("approvalA"), orderPath(), approvalOrderDataSchema))
      .workflow.allowedActions.canApproveInitial,
  ).toBe(true);
  const returned = await post(actor("approvalA"), `${orderPath()}/return`, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Actual HTTP return reason",
    notes: "Separate actual HTTP return notes",
  });
  expect(
    (
      await get(
        fixture.actorId,
        `/sales-contact/orders/${fixture.order.id}`,
        approvalOrderDataSchema,
      )
    ).workflow.currentReturn?.notes,
  ).toBe("Separate actual HTTP return notes");
  const corrections = resubmitOrderBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 2,
    corrections: {
      deliveryDate: null,
      generalNotes: "Corrected HTTP revision",
      responsibleSignature: null,
      repairNote: null,
      adjustmentRequested: null,
      adjustmentReason: null,
      adjustmentActionTaken: null,
      pieces: fixture.order.pieces.map((piece) => {
        const {
          position: _position,
          quantity: _quantity,
          decoration: _decoration,
          catalogSelections: _selections,
          decorationEntryId: _decorationEntry,
          catalogSourceId: _catalogSource,
          unitPrice: _unitPrice,
          stage: _stage,
          workState: _workState,
          receivedAt: _receivedAt,
          cancelledAt: _cancelledAt,
          cancellationReason: _cancellationReason,
          ...capture
        } = piece;
        return capture;
      }),
    },
  });
  const response = await request(server)
    .post(`/api/v1/sales-orders/${fixture.order.id}/resubmit`)
    .set(businessTestHeaders(fixture.actorId))
    .send(corrections);
  expect(response.status, response.text).toBe(200);
  expect(
    salesOrderCommandDataSchema.parse(
      successEnvelopeSchema.parse(response.body as unknown).data,
    ).savedOrder.version,
  ).toBe(3);
  const approved = await post(actor("approvalB"), `${orderPath()}/approve`, {
    commandId: randomUUID(),
    expectedVersion: 3,
  });
  expect(approved.receipt.afterVersion).toBe(4);
  const history = await get(
    fixture.actorId,
    `${orderPath()}/history`,
    salesOrderActivityDataSchema,
  );
  expect(history.events.map((row) => row.kind).sort()).toEqual([
    "approval",
    "approval",
    "order",
    "order",
  ]);
  const event = await get(
    fixture.actorId,
    `${orderPath()}/events/${returned.receipt.commandId}`,
    approvalEventDataSchema,
  );
  expect(event.after.currentReturn?.notes).toBe(
    "Separate actual HTTP return notes",
  );
  expect(
    (
      await get(
        actor("approvalA"),
        "/approvals/history",
        approvalHistoryDataSchema,
      )
    ).events.map((event) => event.operation),
  ).toEqual(["RETURN_INITIAL"]);
  const paper = await get(
    fixture.actorId,
    `/order-paper/${fixture.order.id}`,
    officialOrderPaperDataSchema,
  );
  expect(paper.approval.initial.actor.id).toBe(actor("approvalB"));
  expect(paper.printVersion).toBe(4);
  expect(paper.order.money.total).toBe("3300.00");
});
it("lets the owner and an administrator submit contact proposals while protecting other sales orders", async () => {
  await approve();
  const { issueId, result } = await report();
  const before = await graph();
  const wrong = await request(server)
    .post(`/api/v1${issuePath(issueId)}/resolve`)
    .set(businessTestHeaders(actor("cutting")))
    .send({
      commandId: randomUUID(),
      expectedVersion: 3,
      decision: "CANCEL",
      confirmed: true,
      reason: "Not an approver",
    });
  expect(wrong.status).toBe(403);
  expect(await graph()).toEqual(before);
  await post(actor("approvalA"), `${issuePath(issueId)}/resolve`, {
    commandId: randomUUID(),
    expectedVersion: 3,
    decision: "SEND_TO_SALES",
    target: "PRODUCTION",
    notes: "Private referral instructions",
  });
  const contacts = await get(
    fixture.actorId,
    "/sales-contact",
    salesContactDataSchema,
  );
  expect(contacts.pagination.total).toBe(1);
  expect(
    (await get(actor("salesB"), "/sales-contact", salesContactDataSchema))
      .items,
  ).toEqual([]);
  const held = await graph(),
    proposalBody = {
      commandId: randomUUID(),
      expectedVersion: 4,
      kind: "AMEND",
      contactNotes: "Private customer response",
      changes: {},
    };
  const contactPath = `/sales-contact/orders/${fixture.order.id}/pieces/${pieceId()}/issues/${issueId}/proposals`;
  const denied = await request(server)
    .post(`/api/v1${contactPath}`)
    .set(businessTestHeaders(actor("salesB")))
    .send(proposalBody);
  expect(denied.status).toBe(404);
  expect(await graph()).toEqual(held);
  for (const changes of [
    { decoration: randomUUID() },
    { soleAddition: randomUUID() },
    { model: null },
  ]) {
    const denied = await request(server)
      .post(`/api/v1${contactPath}`)
      .set(businessTestHeaders(fixture.actorId))
      .send({ ...proposalBody, changes });
    expect(denied.status).toBe(400);
    expect(errorEnvelopeSchema.parse(denied.body as unknown).code).toBe(
      "VALIDATION_ERROR",
    );
    expect(await graph()).toEqual(held);
  }
  const submitted = await post(fixture.actorId, contactPath, proposalBody),
    proposalId = submitted.outcome.proposalId;
  if (proposalId === null) throw new Error("Expected proposal");
  const blocked = await request(server)
    .get(`/api/v1/order-paper/${fixture.order.id}`)
    .set(businessTestHeaders(fixture.actorId));
  expect(blocked.status).toBe(409);
  expect(errorEnvelopeSchema.parse(blocked.body as unknown).code).toBe(
    "ORDER_PRINT_REAPPROVAL_PENDING",
  );
  const factory = await get(
    actor("cutting"),
    `/manufacturing-orders/${fixture.order.id}`,
    factoryOrderPaperDataSchema,
  );
  expect(factory.order.counts.original).toBe(2);
  expect(JSON.stringify(factory)).not.toMatch(
    /customerPhone|customerEmail|paidAmount|unitPrice|money|catalogSourceId|contactNotes|currentProposal|beforeFacts|afterFacts|Private/u,
  );
  await post(actor("approvalB"), `${issuePath(issueId)}/review`, {
    commandId: randomUUID(),
    expectedVersion: 5,
    proposalId,
    decision: "RETURN_TO_SALES",
    reason: "Reconfirm private response",
  });
  const admin = fixture.approvalActorId;
  const adminContact = await get(
    admin,
    "/sales-contact",
    salesContactDataSchema,
  );
  expect(adminContact.items[0]).toMatchObject({
    order: { owner: { id: fixture.actorId } },
    issue: { id: issueId, allowedActions: { canSubmitContact: true } },
  });
  const renewedBody = {
    ...proposalBody,
    commandId: randomUUID(),
    expectedVersion: 6,
  };
  const renewed = await post(admin, contactPath, renewedBody),
    renewedId = renewed.outcome.proposalId;
  if (renewedId === null) throw new Error("Expected renewed proposal");
  expect(renewed).toMatchObject({
    receipt: { actor: { id: admin, role: "ADMIN" } },
    outcome: { issueState: "REAPPROVAL", pieceWorkState: "BLOCKED" },
  });
  expect(
    (await graph()).proposals.find((proposal) => proposal.id === renewedId),
  ).toMatchObject({ submittedById: admin });
  const adminReceipt = await get(
    admin,
    `/approval-commands/${renewed.receipt.commandId}`,
    approvalCommandDataSchema,
  );
  expect(adminReceipt).toEqual({ ...renewed, replayed: true });
  expect(await post(admin, contactPath, renewedBody)).toEqual(adminReceipt);
  await post(actor("approvalB"), `${issuePath(issueId)}/review`, {
    commandId: randomUUID(),
    expectedVersion: 7,
    proposalId: renewedId,
    decision: "ACCEPT",
    notes: "Positive manufacturing instructions",
  });
  expect(
    (
      await get(
        fixture.actorId,
        `/order-paper/${fixture.order.id}`,
        officialOrderPaperDataSchema,
      )
    ).printVersion,
  ).toBe(8);
  const recovered = await get(
    actor("cutting"),
    `/approval-commands/${result.receipt.commandId}`,
    approvalCommandDataSchema,
  );
  expect(recovered.replayed).toBe(true);
  expect(JSON.stringify(recovered)).not.toMatch(
    /Private|savedOrder|currentProposal|money|reason/u,
  );
  const physical = await db.salesOrderPiece.findUniqueOrThrow({
    where: { id: pieceId() },
  });
  expect(physical).toMatchObject({
    stage: "PRODUCTION",
    workState: "INCOMING",
    issueId: null,
  });
  const worker = await db.user.findUniqueOrThrow({
    where: { id: actor("cutting") },
  });
  await new StaffService(db).changeDepartment(
    fixture.approvalActorId,
    worker.id,
    {
      commandId: randomUUID(),
      expectedAccessVersion: worker.accessVersion,
      department: "PRODUCTION",
    },
  );
  const reassigned = await request(server)
    .get(`/api/v1/approval-commands/${result.receipt.commandId}`)
    .set(businessTestHeaders(worker.id));
  expect(reassigned.status).toBe(403);
  expect(errorEnvelopeSchema.parse(reassigned.body as unknown).code).toBe(
    "DEPARTMENT_ACCESS_DENIED",
  );
});
it.each(["cutting", "production", "quality"] as const)(
  "reports actual %s source and returns one selected piece to an explicit department",
  async (source) => {
    await approve();
    const department = (
      {
        cutting: "CUTTING",
        production: "PRODUCTION",
        quality: "QUALITY",
      } as const
    )[source];
    const reportVersion = await advanceManufacturingReportFixture(
      db,
      fixture.approvalActorId,
      fixture.order.id,
      pieceId(),
      department,
    );
    const companion = await db.salesOrderPiece.findFirstOrThrow({
      where: { orderId: fixture.order.id, id: { not: pieceId() } },
    });
    const originalVisit = await db.manufacturingWorkVisit.findFirst({
      where: { pieceId: pieceId(), endedAt: null },
    });
    const { issueId } = await report(reportVersion, source);
    if (department !== "QUALITY") {
      if (originalVisit === null || originalVisit.startedCommandId === null)
        throw new Error("Actual source start required");
      const issue = await db.manufacturingIssue.findUniqueOrThrow({
        where: { id: issueId },
      });
      expect(issue).toMatchObject({
        sourceWorkState: "IN_PROGRESS",
        reporterId: actor(source),
      });
      expect(
        await db.manufacturingWorkVisit.findUniqueOrThrow({
          where: { id: originalVisit.id },
        }),
      ).toMatchObject({
        originKind: originalVisit.originKind,
        sourceApprovalCommandId: originalVisit.sourceApprovalCommandId,
        sourceTransferEventId: originalVisit.sourceTransferEventId,
        receivedAt: originalVisit.receivedAt,
        receivedCommandId: originalVisit.receivedCommandId,
        startedAt: originalVisit.startedAt,
        startedCommandId: originalVisit.startedCommandId,
        endReason: "ISSUE_REPORTED",
        endApprovalCommandId: issue.reportedCommandId,
        endManufacturingCommandId: null,
        destination: null,
      });
      expect(
        (
          await db.salesOrderPiece.findUniqueOrThrow({
            where: { id: pieceId() },
          })
        ).currentWorkVisitId,
      ).toBeNull();
    }
    await post(actor("approvalA"), `${issuePath(issueId)}/resolve`, {
      commandId: randomUUID(),
      expectedVersion: reportVersion + 1,
      decision: "RETURN_TO_DEPARTMENT",
      target: "CUTTING",
      notes: "Explicit positive return instruction",
    });
    expect(
      await db.salesOrderPiece.findUnique({ where: { id: companion.id } }),
    ).toEqual(companion);
    expect(
      await db.salesOrderPiece.findUnique({ where: { id: pieceId() } }),
    ).toMatchObject({
      stage: "CUTTING",
      workState: "INCOMING",
      issueId: null,
      receivedAt: null,
    });
  },
);
it("enforces real authentication/current eligibility, CSRF, strict input, command identity and unknown-result observation", async () => {
  const before = await graph(),
    path = `/api/v1${orderPath()}/approve`,
    body = { commandId: randomUUID(), expectedVersion: 1 };
  expect((await request(server).post(path).send(body)).status).toBe(401);
  expect(
    (
      await request(server)
        .post(path)
        .set(businessTestHeaders(actor("restricted")))
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(server)
        .post(path)
        .set(businessTestHeaders(fixture.actorId))
        .send(body)
    ).status,
  ).toBe(403);
  const headers = businessTestHeaders(actor("approvalA"));
  expect(
    (
      await request(server)
        .post(path)
        .set({ Authorization: headers.Authorization })
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(server)
        .post(path)
        .set({ ...headers, "x-csrf-token": "mismatch" })
        .send(body)
    ).status,
  ).toBe(403);
  const invalid = await request(server)
    .post(path)
    .set(headers)
    .send({ ...body, approvedBy: fixture.actorId });
  expect(invalid.status).toBe(400);
  expect(errorEnvelopeSchema.parse(invalid.body as unknown).code).toBe(
    "VALIDATION_ERROR",
  );
  expect(
    (
      await request(server)
        .get(`/api/v1${orderPath()}?ownerId=spoof`)
        .set(headers)
    ).status,
  ).toBe(400);
  expect(await graph()).toEqual(before);
  const unknown = await request(server)
    .get(`/api/v1/approval-commands/${body.commandId}`)
    .set(headers);
  expect(unknown.status).toBe(404);
  // Simulate a client discarding a successful response: reconcile only through the actual metadata endpoint.
  await request(server).post(path).set(headers).send(body).expect(200);
  const committed = await graph(),
    observed = await get(
      actor("approvalA"),
      `/approval-commands/${body.commandId}`,
      approvalCommandDataSchema,
    );
  expect(observed.replayed).toBe(true);
  const replay = await post(actor("approvalA"), `${orderPath()}/approve`, body);
  expect(replay).toEqual(observed);
  expect(await graph()).toEqual(committed);
  const other = await request(server)
    .get(`/api/v1/approval-commands/${body.commandId}`)
    .set(businessTestHeaders(actor("approvalB")));
  expect(other.status, other.text).toBe(404);
  const changed = await request(server)
    .post(path)
    .set(headers)
    .send({ ...body, expectedVersion: 2 });
  expect(changed.status).toBe(409);
  expect(errorEnvelopeSchema.parse(changed.body as unknown).code).toBe(
    "APPROVAL_COMMAND_CONFLICT",
  );
  const stale = await request(server)
    .post(path)
    .set(headers)
    .send({ ...body, commandId: randomUUID() });
  expect(stale.status).toBe(409);
  expect(errorEnvelopeSchema.parse(stale.body as unknown).code).toBe(
    "ORDER_VERSION_CONFLICT",
  );
  expect(await graph()).toEqual(committed);
  const approver = await db.user.findUniqueOrThrow({
    where: { id: actor("approvalA") },
  });
  await new StaffService(db).suspendStaff(
    fixture.approvalActorId,
    approver.id,
    { commandId: randomUUID(), expectedAccessVersion: approver.accessVersion },
  );
  const suspended = await request(server)
    .get(`/api/v1/approval-commands/${body.commandId}`)
    .set(businessTestHeaders(approver.id));
  expect(suspended.status).toBe(403);
  expect(errorEnvelopeSchema.parse(suspended.body as unknown).code).toBe(
    "ACCOUNT_RESTRICTED",
  );
  expect(await graph()).toEqual(committed);
});

it("retains exact partial/full cancellation and paid terms through actual HTTP commands", async () => {
  await approve();
  const before = await graph(),
    second = fixture.order.pieces[1]?.id;
  if (second === undefined) throw new Error("Expected second piece");
  const paid = await request(server)
    .patch(`/api/v1/sales-orders/${fixture.order.id}/paid`)
    .set(businessTestHeaders(fixture.actorId))
    .send({
      commandId: randomUUID(),
      expectedVersion: 2,
      paidAmount: "2000.00",
    });
  expect(paid.status, paid.text).toBe(200);
  const { issueId } = await report(3, "cutting", second),
    input = {
      commandId: randomUUID(),
      expectedVersion: 4,
      decision: "CANCEL",
      confirmed: true,
      reason: "Confirmed 1500 cancellation",
    };
  const cancelled = await post(
    actor("approvalA"),
    `${issuePath(issueId, second)}/resolve`,
    input,
  );
  const partial = await get(
    fixture.actorId,
    `/order-paper/${fixture.order.id}`,
    officialOrderPaperDataSchema,
  );
  expect(partial.order.money).toEqual({
    total: "1800.00",
    paidAmount: "2000.00",
    remainingDue: "0.00",
    surplus: "200.00",
  });
  expect(partial.order.counts).toMatchObject({
    original: 2,
    active: 1,
    cancelled: 1,
  });
  const after = await graph();
  expect(after.capture).toEqual(before.capture);
  expect(
    await post(
      actor("approvalA"),
      `${issuePath(issueId, second)}/resolve`,
      input,
    ),
  ).toEqual({ ...cancelled, replayed: true });
  expect(await graph()).toEqual(after);
  const last = await report(5);
  await post(actor("approvalB"), `${issuePath(last.issueId)}/resolve`, {
    commandId: randomUUID(),
    expectedVersion: 6,
    decision: "CANCEL",
    confirmed: true,
    reason: "Confirmed last cancellation",
  });
  const final = await get(
    fixture.actorId,
    `/order-paper/${fixture.order.id}`,
    officialOrderPaperDataSchema,
  );
  expect(final.order).toMatchObject({
    status: "CANCELLED",
    money: {
      total: "0.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "2000.00",
    },
    counts: { original: 2, active: 0, cancelled: 2, completionPercent: 0 },
  });
  expect(final.order.pieces).toHaveLength(2);
});
it("returns cancellation intent to sales and cancels its fresh request without acceptance or restoring work", async () => {
  await approve();
  const { issueId } = await report();
  await post(actor("approvalA"), `${issuePath(issueId)}/resolve`, {
    commandId: randomUUID(),
    expectedVersion: 3,
    decision: "SEND_TO_SALES",
    target: "CUTTING",
    notes: "Ask the customer",
  });
  const path = `/sales-contact/orders/${fixture.order.id}/pieces/${pieceId()}/issues/${issueId}/proposals`,
    first = await post(fixture.actorId, path, {
      commandId: randomUUID(),
      expectedVersion: 4,
      kind: "CANCEL_REQUEST",
      contactNotes: "Customer requests cancellation",
    }),
    proposalId = first.outcome.proposalId;
  if (proposalId === null) throw new Error("Expected request");
  const before = await graph(),
    invalid = await request(server)
      .post(`/api/v1${issuePath(issueId)}/review`)
      .set(businessTestHeaders(actor("approvalA")))
      .send({
        commandId: randomUUID(),
        expectedVersion: 5,
        proposalId,
        decision: "ACCEPT",
        notes: "Must not resume cancellation intent",
      });
  expect(invalid.status).toBe(409);
  expect(errorEnvelopeSchema.parse(invalid.body as unknown).code).toBe(
    "APPROVAL_PROPOSAL_CONFLICT",
  );
  expect(await graph()).toEqual(before);
  await post(actor("approvalA"), `${issuePath(issueId)}/review`, {
    commandId: randomUUID(),
    expectedVersion: 5,
    proposalId,
    decision: "RETURN_TO_SALES",
    reason: "Confirm request again",
  });
  expect(
    (await db.salesOrderPiece.findUniqueOrThrow({ where: { id: pieceId() } }))
      .workState,
  ).toBe("BLOCKED");
  const renewed = await post(fixture.actorId, path, {
    commandId: randomUUID(),
    expectedVersion: 6,
    kind: "CANCEL_REQUEST",
    contactNotes: "Customer confirmed cancellation",
  });
  await post(actor("approvalB"), `${issuePath(issueId)}/review`, {
    commandId: randomUUID(),
    expectedVersion: 7,
    proposalId: renewed.outcome.proposalId,
    decision: "CANCEL",
    confirmed: true,
    reason: "Confirmed current cancellation request",
  });
  const after = await graph();
  expect(after.capture).toEqual(before.capture);
  expect(after.references).toEqual(before.references);
  expect(after.proposals).toHaveLength(2);
  expect(after.issues[0]).toMatchObject({ state: "RESOLVED" });
  expect(after.pieces.find((piece) => piece.id === pieceId())).toMatchObject({
    stage: "CANCELLED",
    issueId: null,
  });
});
it("permits an administrator contact response on their own retained order", async () => {
  await resetOwnedIdentityTestData(db);
  fixture = await createApprovalOrderFixture(
    db,
    "SHOP",
    ["زبيري - z"],
    "ADMIN",
  );
  const id = fixture.actorId;
  await post(id, `${orderPath()}/approve`, {
    commandId: randomUUID(),
    expectedVersion: 1,
  });
  const reported = await post(
      id,
      `/manufacturing-orders/${fixture.order.id}/pieces/${pieceId()}/issues`,
      {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: "Actual ADMIN source",
        notes: null,
      },
    ),
    issueId = reported.outcome.issueId;
  if (issueId === null) throw new Error("Expected issue");
  await post(id, `${issuePath(issueId)}/resolve`, {
    commandId: randomUUID(),
    expectedVersion: 3,
    decision: "SEND_TO_SALES",
    target: "CUTTING",
    notes: "Own order contact",
  });
  const submitted = await post(
    id,
    `/sales-contact/orders/${fixture.order.id}/pieces/${pieceId()}/issues/${issueId}/proposals`,
    {
      commandId: randomUUID(),
      expectedVersion: 4,
      kind: "AMEND",
      contactNotes: "Own customer confirmation",
      changes: {},
    },
  );
  expect(submitted.receipt.actor).toMatchObject({ id, role: "ADMIN" });
  expect((await graph()).proposals[0]?.submittedById).toBe(id);
});
it("serializes actual competing HTTP initial decisions on independent PostgreSQL connections", async () => {
  const blocker = createDatabaseClient(uri);
  let release: () => void = () => {
      throw new Error("Barrier missing");
    },
    entered: () => void = () => {
      throw new Error("Barrier missing");
    };
  const hold = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const gate = blocker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${fixture.order.id}::uuid FOR UPDATE`;
      entered();
      await hold;
    },
    { timeout: 10000 },
  );
  const requests: Array<Promise<request.Response>> = [];
  try {
    await inside;
    requests.push(
      request(server)
        .post(`/api/v1${orderPath()}/approve`)
        .set(businessTestHeaders(actor("approvalA")))
        .send({ commandId: randomUUID(), expectedVersion: 1 })
        .then((response) => response),
      request(server)
        .post(`/api/v1${orderPath()}/return`)
        .set(businessTestHeaders(actor("approvalB")))
        .send({
          commandId: randomUUID(),
          expectedVersion: 1,
          reason: "Concurrent return",
          notes: null,
        })
        .then((response) => response),
    );
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted`;
      if ((rows[0]?.count ?? 0) >= 2) {
        waiting = true;
        break;
      }
    }
    expect(waiting).toBe(true);
    release();
    await gate;
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const loser = responses.find((response) => response.status === 409);
    expect(errorEnvelopeSchema.parse(loser?.body as unknown).code).toBe(
      "ORDER_VERSION_CONFLICT",
    );
    const after = await graph();
    expect(after.root?.version).toBe(2);
    expect(after.events).toHaveLength(1);
    expect(after.proposals).toEqual([]);
    expect(after.issues).toEqual([]);
    expect(after.order?.totalAmount.toFixed(2)).toBe("3300.00");
    expect(after.order?.paidAmount.toFixed(2)).toBe("100.50");
    expect(
      after.pieces.every(
        (piece) =>
          piece.stage ===
          (after.order?.status === "APPROVED"
            ? "CUTTING"
            : "AWAITING_APPROVAL"),
      ),
    ).toBe(true);
  } finally {
    release();
    await Promise.allSettled([gate, ...requests]);
    await blocker.$disconnect();
  }
});
