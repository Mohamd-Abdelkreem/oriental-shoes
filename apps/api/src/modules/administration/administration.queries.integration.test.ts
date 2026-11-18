import {
  findAdministrationReport,
  findAdministrationPrintReport,
} from "./administration-report.queries.js";
import {
  administrationReportQuerySchema,
  administrationReportPrintQuerySchema,
  formatDraftReference,
  updateCustomerBodySchema,
} from "@template/contracts";
import { CustomersService } from "../customers/customers.service.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import { findAdministrationOrder } from "./administration.queries.js";
import { findAdministrationActivity } from "./administration-activity.queries.js";
import {
  administrationOrderHistoryQuerySchema,
  administrationActivityQuerySchema,
  toOrderActivityActionLabel,
} from "@template/contracts";
import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { createQualityFixture } from "../../test-support/quality.fixture.js";
import { QualityCommandExecutor } from "../quality/quality-command-executor.js";
import { WarehouseCommandExecutor } from "../warehouse/warehouse-command-executor.js";
import {
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  administrationCorrectionsQuerySchema,
  administrationFilterOptionsQuerySchema,
  administrationApprovalsQuerySchema,
  administrationDeliveryExceptionsQuerySchema,
} from "@template/contracts";
import {
  findAdministrationDashboard,
  findAdministrationFilterOptions,
  findAdministrationApprovals,
  findAdministrationCorrections,
  findAdministrationDeliveryExceptions,
} from "./administration.queries.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type { AdministrationObservation } from "./administration.types.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { Prisma, createDatabaseClient } from "@template/database";
import {
  administrationOrdersQuerySchema,
  administrationCommandBodySchema,
  createDraftBodySchema,
} from "@template/contracts";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  createManufacturingFixture,
  appendManufacturingOrder,
} from "../../test-support/manufacturing.fixture.js";
import { SalesDraftsService } from "../sales-drafts/sales-drafts.service.js";
import { SalesCommandExecutor } from "../sales-commands/sales-command-executor.js";
import {
  loadIdentityAccount,
  lockAccountRows,
  assertBusinessAuthority,
} from "../auth/account-authority.js";
import { AdministrationCommandExecutor } from "./administration-command-executor.js";
import { findAdministrationOrders } from "./administration.queries.js";

const uri = process.env["P01_TEST_DATABASE_URL"];
if (!uri || uri !== process.env["DATABASE_URL"])
  throw new Error("Owned migrated database required");
const db = createDatabaseClient(uri);
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  try {
    await resetOwnedIdentityTestData(db);
  } finally {
    await db.$disconnect();
  }
});
const read = (actorId: string, input: unknown) =>
  db.$transaction(
    async (tx) => {
      await lockAccountRows(tx, [actorId], "read");
      const actor = await loadIdentityAccount(tx, actorId);
      assertBusinessAuthority(actor);
      return findAdministrationOrders(
        tx,
        actor,
        administrationOrdersQuerySchema.parse(input),
        {
          generatedAt: new Date(),
          businessTimeZone: "Africa/Cairo",
          businessDate: null,
        },
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 10000,
    },
  );

it("counts and pages mixed roots once, preserves exact 200-piece completion and honest out-of-range metadata", async () => {
  const f = await createManufacturingFixture(db),
    large = await appendManufacturingOrder(db, f, 200);
  const draft = await new SalesDraftsService(
    db,
    new SalesCommandExecutor(db),
  ).create(
    f.approvalActorId,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: { type: "REPAIR", pieces: [{ id: randomUUID() }] },
    }),
  );
  const first = await read(f.approvalActorId, { limit: 1 });
  expect(first).toMatchObject({
    totalOrders: 3,
    totalPieces: 203,
    statusCounts: { DRAFT: 1, APPROVED: 2 },
    pagination: { total: 3, totalPages: 3 },
    context: { query: { page: 1, limit: 1, period: "ALL" } },
  });
  const all = await read(f.approvalActorId, {});
  expect(
    new Set(
      all.items.map((item) =>
        item.kind === "draft" ? item.draft.id : item.order.id,
      ),
    ),
  ).toEqual(new Set([f.order.id, large.id, draft.savedDraft.id]));
  const largeItem = all.items.find(
    (item) => item.kind === "submitted" && item.order.id === large.id,
  );
  expect(largeItem).toMatchObject({
    kind: "submitted",
    order: {
      counts: {
        original: 200,
        active: 200,
        cancelled: 0,
        received: 0,
        completionPercent: 0,
      },
      currentDepartments: ["CUTTING"],
    },
  });
  const beyond = await read(f.approvalActorId, { page: 5, limit: 1 });
  expect(beyond.items).toEqual([]);
  expect(beyond.pagination).toMatchObject({ page: 5, total: 3, totalPages: 3 });
  const drafts = await read(f.approvalActorId, { status: "DRAFT" });
  expect(drafts).toMatchObject({
    totalOrders: 1,
    totalPieces: 1,
    statusCounts: { DRAFT: 1, APPROVED: 0 },
  });
  const reference = formatDraftReference(
    draft.savedDraft.id,
    draft.savedDraft.draftSequence,
  );
  expect((await read(f.approvalActorId, { search: reference })).items).toEqual(
    drafts.items,
  );
  const none = await read(f.approvalActorId, { salespersonId: randomUUID() });
  expect(none).toMatchObject({
    items: [],
    totalOrders: 0,
    totalPieces: 0,
    pagination: { totalPages: 0 },
  });
});
it("applies literal latest-contact search, owner/type/current-department filters before both counts and paging", async () => {
  const f = await createManufacturingFixture(db),
    name = "Current %_\\ literal";
  const current = await db.salesDraft.findUniqueOrThrow({
    where: { id: f.order.id },
    select: { version: true },
  });
  await new AdministrationCommandExecutor(db, () => new Date()).execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: current.version,
      patch: { customerName: name },
      reason: "Correct order label",
    }),
  });
  const found = await read(f.approvalActorId, {
    search: "%_\\",
    department: "CUTTING",
    type: "SHOP",
    salespersonId: f.actorId,
  });
  expect(found).toMatchObject({
    totalOrders: 1,
    totalPieces: 2,
    items: [
      {
        kind: "submitted",
        order: {
          id: f.order.id,
          customerSnapshot: { name },
          currentDepartments: ["CUTTING"],
        },
      },
    ],
  });
  expect(
    (await read(f.approvalActorId, { search: "Frozen contact" })).totalOrders,
  ).toBe(0);
  expect(
    (await read(f.approvalActorId, { search: f.order.id })).totalOrders,
  ).toBe(1);
  expect(
    (await read(f.approvalActorId, { department: "WAREHOUSE" })).totalOrders,
  ).toBe(0);
  expect((await read(f.approvalActorId, { type: "REPAIR" })).totalOrders).toBe(
    0,
  );
  await expect(read(f.cuttingA, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("matches explicit calendar-day bounds and uses PostgreSQL's independent DST midnights", async () => {
  const f = await createManufacturingFixture(db);
  expect(
    (await read(f.approvalActorId, { from: "0001-01-01", to: "9999-12-31" }))
      .totalOrders,
  ).toBe(1);
  expect(
    (await read(f.approvalActorId, { from: "0001-01-01", to: "0001-01-01" }))
      .totalOrders,
  ).toBe(0);
  const hours = await db.$queryRaw<
    { spring: Prisma.Decimal; autumn: Prisma.Decimal }[]
  >`SELECT
 extract(epoch FROM ((('2026-03-09'::date::timestamp) AT TIME ZONE 'America/New_York')-(('2026-03-08'::date::timestamp) AT TIME ZONE 'America/New_York')))/3600 AS spring,
 extract(epoch FROM ((('2026-11-02'::date::timestamp) AT TIME ZONE 'America/New_York')-(('2026-11-01'::date::timestamp) AT TIME ZONE 'America/New_York')))/3600 AS autumn`;
  expect(
    hours.map((row) => ({
      spring: Number(row.spring),
      autumn: Number(row.autumn),
    })),
  ).toEqual([{ spring: 23, autumn: 25 }]);
});

const observe = async <T>(
  actorId: string,
  work: (
    tx: Prisma.TransactionClient,
    actor: AuthorityAccount,
    observation: AdministrationObservation,
  ) => Promise<T>,
) =>
  db.$transaction(
    async (tx) => {
      await lockAccountRows(tx, [actorId], "read");
      const actor = await loadIdentityAccount(tx, actorId);
      assertBusinessAuthority(actor);
      return work(tx, actor, {
        generatedAt: new Date(),
        businessTimeZone: "Africa/Cairo",
        businessDate: null,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 10000,
    },
  );
it("dashboard and correction oversight distinguish two live cycles in one order and retain the draft recent/total units", async () => {
  const f = await createQualityFixture(db),
    quality = new QualityCommandExecutor(db),
    pieces = f.order.pieces.map((piece) => piece.id);
  await new SalesDraftsService(db, new SalesCommandExecutor(db)).create(
    f.approvalActorId,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
    }),
  );
  const pendingId = randomUUID();
  await db.user.create({
    data: {
      id: pendingId,
      email: pendingId + "@example.test",
      fullName: "Pending colleague",
      passwordHash: "synthetic-only",
      role: "USER",
      status: "PENDING_APPROVAL",
      emailVerifiedAt: new Date(),
    },
  });
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        { orderId: f.order.id, expectedVersion: f.version, pieceIds: pieces },
      ],
    },
  });
  const version = (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    })
  ).version;
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: version,
          decisions: pieces.map((pieceId, index) => ({
            pieceId,
            decision: "REJECT",
            target: index === 0 ? "CUTTING" : "PRODUCTION",
            reason: "Original defect %_",
            instructions: "Repair retained work",
          })),
        },
      ],
    }),
  });
  const dashboard = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationDashboard(tx, actor, {}, o),
  );
  expect(dashboard.counts).toMatchObject({
    totalOrders: 2,
    activeOrders: 2,
    activeCorrections: 2,
    openCorrectionOrders: 1,
    pendingUsers: 1,
    activePieces: 2,
  });
  expect(dashboard.recentOrders[0]).toMatchObject({
    kind: "submitted",
    order: { id: f.order.id },
  });
  expect(dashboard.recentOrders.some((item) => item.kind === "draft")).toBe(
    true,
  );
  expect(dashboard.departments).toEqual([
    { department: "CUTTING", pieces: 1 },
    { department: "PRODUCTION", pieces: 1 },
    { department: "QUALITY", pieces: 0 },
    { department: "WAREHOUSE", pieces: 0 },
  ]);
  const active = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationCorrections(
      tx,
      actor,
      administrationCorrectionsQuerySchema.parse({ search: "%_" }),
      o,
    ),
  );
  expect(active).toMatchObject({
    counts: { active: 2, resolved: 0, all: 2, activePieces: 2 },
    pagination: { total: 2 },
  });
  const shared = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationPrintReport(
      tx,
      actor,
      administrationReportPrintQuerySchema.parse({ department: "CUTTING" }),
      o,
    ),
  );
  expect(shared.kpis).toMatchObject({ orders: 1, activePieces: 2 });
  expect(shared.departments.filter((row) => row.pieces > 0)).toEqual([
    { department: "CUTTING", pieces: 1 },
    { department: "PRODUCTION", pieces: 1 },
  ]);
  expect(shared.workforce).toMatchObject({ totalStaff: 2, activeStaff: 2 });
  expect(shared.exceptions).toMatchObject({
    categoryCases: 1,
    distinctOrders: 1,
    correctionHistoryOrders: 1,
  });
  expect(shared.exceptionRows).toHaveLength(1);
  const current = (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    })
  ).version;
  await new AdministrationCommandExecutor(db, () => new Date()).execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: f.order.id,
      expectedVersion: current,
      scope: "ITEM",
      pieceIds: [pieces[0]],
    }),
  });
  const resolved = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationCorrections(
      tx,
      actor,
      administrationCorrectionsQuerySchema.parse({ tab: "RESOLVED" }),
      o,
    ),
  );
  expect(resolved).toMatchObject({
    counts: { active: 1, resolved: 1, all: 2, activePieces: 1 },
    items: [{ state: "CANCELLED" }],
    pagination: { total: 1 },
  });
});
it("owner options use real distinct identities, exact retained/current name resolution and actual nullable phone", async () => {
  const f = await createManufacturingFixture(db),
    retainedName = (
      await db.user.findUniqueOrThrow({
        where: { id: f.actorId },
        select: { fullName: true },
      })
    ).fullName;
  await db.user.update({
    where: { id: f.actorId },
    data: { fullName: "Shared owner", phone: null },
  });
  const other = randomUUID();
  await db.user.create({
    data: {
      id: other,
      email: other + "@example.test",
      fullName: "Shared owner",
      phone: "+966500000099",
      passwordHash: "synthetic-only",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await new SalesDraftsService(db, new SalesCommandExecutor(db)).create(
    other,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
    }),
  );
  const options = (name?: string) =>
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationFilterOptions(
        tx,
        actor,
        administrationFilterOptionsQuerySchema.parse({ salespersonName: name }),
        o,
      ),
    );
  const ambiguous = await options("Shared owner");
  expect(ambiguous.legacySalesperson).toEqual({
    input: "Shared owner",
    match: "AMBIGUOUS",
    salespersonId: null,
  });
  expect(ambiguous.salespeople).toEqual(
    expect.arrayContaining([
      { id: f.actorId, fullName: "Shared owner", phone: null },
      { id: other, fullName: "Shared owner", phone: "+966500000099" },
    ]),
  );
  expect((await options(retainedName)).legacySalesperson).toEqual({
    input: retainedName,
    match: "UNIQUE",
    salespersonId: f.actorId,
  });
  expect((await options("Missing label")).legacySalesperson?.match).toBe(
    "MISSING",
  );
  expect(
    await observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationApprovals(
        tx,
        actor,
        administrationApprovalsQuerySchema.parse({ tab: "APPROVED" }),
        o,
      ),
    ),
  ).toMatchObject({
    counts: { approved: 1, pending: 0, returned: 0, all: 1 },
    pagination: { total: 1 },
  });
});
it("past-promise delivery transitions exclude ready, courier, failed and retry orders from overdue", async () => {
  const f = await createQualityFixture(db, "SHOP", "2020-01-01"),
    quality = new QualityCommandExecutor(db),
    warehouse = new WarehouseCommandExecutor(db),
    pieces = f.order.pieces.map((piece) => piece.id),
    version = async () =>
      (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        })
      ).version;
  await quality.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
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
          expectedVersion: await version(),
          decisions: pieces.map((pieceId) => ({ pieceId, decision: "ACCEPT" })),
        },
      ],
    }),
  });
  const incoming = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationReport(
      tx,
      actor,
      administrationReportQuerySchema.parse({}),
      o,
    ),
  );
  expect(incoming.kpis).toMatchObject({
    receivedPieces: 0,
    readyOrders: 0,
    overdueOrders: 1,
  });
  expect(
    incoming.departments.find((row) => row.department === "WAREHOUSE")?.pieces,
  ).toBe(2);
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
        },
      ],
    }),
  });
  const ready = await read(f.approvalActorId, { exception: "OVERDUE" });
  expect(ready.totalOrders).toBe(0);
  const dispatch = await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "DISPATCH",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
        },
      ],
    }),
  });
  const attemptId = dispatch.outcome.orders[0]?.attemptId;
  if (!attemptId) throw new Error("Real delivery attempt required");
  expect(
    (await read(f.approvalActorId, { department: "WAREHOUSE" })).totalOrders,
  ).toBe(0);
  const courier = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationPrintReport(
      tx,
      actor,
      administrationReportPrintQuerySchema.parse({}),
      o,
    ),
  );
  expect(
    courier.departments.find((row) => row.department === "WITH_COURIER")
      ?.pieces,
  ).toBe(2);
  expect(
    courier.departments.find((row) => row.department === "WAREHOUSE")?.pieces,
  ).toBe(0);
  const dispatched = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationDeliveryExceptions(
      tx,
      actor,
      administrationDeliveryExceptionsQuerySchema.parse({ tab: "ALL" }),
      o,
    ),
  );
  expect(dispatched.counts).toEqual({
    failed: 0,
    overdue: 0,
    dispatched: 1,
    all: 1,
  });
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
          attemptId,
          returnedToWarehouse: true,
          reason: "Complete physical return",
        },
      ],
    }),
  });
  const failed = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationDeliveryExceptions(
      tx,
      actor,
      administrationDeliveryExceptionsQuerySchema.parse({ tab: "ALL" }),
      o,
    ),
  );
  expect(failed.counts).toEqual({
    failed: 1,
    overdue: 0,
    dispatched: 0,
    all: 1,
  });
  expect(failed.items).toHaveLength(1);
  expect(failed.items[0]).toMatchObject({
    currentDepartments: ["WAREHOUSE"],
    isOverdue: false,
    status: "DELIVERY_FAILED",
  });
  const exceptionReport = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationPrintReport(
      tx,
      actor,
      administrationReportPrintQuerySchema.parse({}),
      o,
    ),
  );
  expect(exceptionReport.exceptions).toMatchObject({
    categoryCases: 1,
    distinctOrders: 1,
    overdueOrders: 0,
    failedOrders: 1,
  });
  expect(
    exceptionReport.exceptionRows.map((row) => row.category).sort(),
  ).toEqual(["DELIVERY_FAILED"]);
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: await version(),
          pieceIds: pieces,
          attemptId,
          retryDate: "2030-01-02",
          notes: "Explicit retry",
        },
      ],
    }),
  });
  expect(
    (await read(f.approvalActorId, { exception: "OVERDUE" })).totalOrders,
  ).toBe(0);
  const absent = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationDeliveryExceptions(
      tx,
      actor,
      administrationDeliveryExceptionsQuerySchema.parse({
        tab: "ALL",
        search: "No such order",
      }),
      o,
    ),
  );
  expect(absent).toMatchObject({
    items: [],
    counts: { failed: 0, overdue: 0, dispatched: 0, all: 0 },
    pagination: { total: 0 },
  });
});

it("refuses owner options above 5000 real retained identities without returning a partial dropdown", async () => {
  const f = await createManufacturingFixture(db),
    now = new Date(),
    owners = Array.from({ length: 5000 }, () => randomUUID());
  // These ordinary draft rows only seed the option-count boundary; no command/write acceptance is claimed.
  await db.$transaction(
    async (tx) => {
      await tx.user.createMany({
        data: owners.map((id) => ({
          id,
          email: id + "@example.test",
          fullName: "Retained option owner",
          passwordHash: "synthetic-only",
          role: "ADMIN" as const,
          status: "ACTIVE" as const,
          emailVerifiedAt: now,
        })),
      });
      await tx.salesDraft.createMany({
        data: owners.map((ownerId) => ({
          id: randomUUID(),
          ownerId,
          type: "SHOP" as const,
          status: "DRAFT" as const,
          createdAt: now,
          updatedAt: now,
        })),
      });
    },
    { timeout: 10000 },
  );
  await expect(
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationFilterOptions(
        tx,
        actor,
        administrationFilterOptionsQuerySchema.parse({}),
        o,
      ),
    ),
  ).rejects.toMatchObject({ code: "REPORT_SCOPE_TOO_LARGE", statusCode: 422 });
  expect(await db.salesDraft.count()).toBe(5001);
});

it("detail keeps original submission, effective correction metadata, exact candidates and draft history in one observation", async () => {
  const f = await createManufacturingFixture(db),
    executor = new AdministrationCommandExecutor(db, () => new Date());
  const original = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationOrder(tx, actor, f.order.id),
  );
  expect(original).toMatchObject({
    kind: "submitted",
    correction: { lastCorrection: null },
    adminActions: { canCorrect: true, canCancel: true, canPrint: true },
  });
  const current = (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    })
  ).version;
  const accepted = await executor.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: current,
      patch: {
        generalNotes: "Current admin note",
        customerName: "Effective name",
        customerEmail: null,
      },
      reason: "Correct source transcription",
    }),
  });
  const detail = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationOrder(tx, actor, f.order.id),
  );
  if (detail.kind !== "submitted" || original.kind !== "submitted")
    throw new Error("Submitted detail required");
  expect(detail.correction.originalSubmitted).toEqual(
    original.correction.originalSubmitted,
  );
  expect(detail.correction.effective).toMatchObject({
    customerName: "Effective name",
    generalNotes: "Current admin note",
    customerEmail: null,
  });
  expect(detail.correction.lastCorrection).toMatchObject({
    id: accepted.receipt.commandId,
    actor: accepted.receipt.actor,
    occurredAt: accepted.receipt.occurredAt,
    reason: "Correct source transcription",
    changedFields: ["customerName", "generalNotes"],
  });
  expect(detail.cancellationCandidates.map((piece) => piece.pieceId)).toEqual(
    detail.order.pieces.map((piece) => piece.id),
  );
  expect(
    detail.cancellationCandidates.every(
      (piece) => piece.eligible && piece.denialReason === null,
    ),
  ).toBe(true);
  const history = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationOrderHistoryQuerySchema.parse({}),
      f.order.id,
    ),
  );
  expect(history.pagination.total).toBe(detail.historyCount);
  expect(history.events[0]).toMatchObject({
    kind: "administration",
    event: {
      reason: "Correct source transcription",
      before: accepted.before,
      after: accepted.after,
    },
  });
  const draft = await new SalesDraftsService(
    db,
    new SalesCommandExecutor(db),
  ).create(
    f.approvalActorId,
    createDraftBodySchema.parse({
      commandId: randomUUID(),
      draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
    }),
  );
  const draftDetail = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationOrder(tx, actor, draft.savedDraft.id),
  );
  expect(draftDetail).toMatchObject({
    kind: "draft",
    historyCount: 1,
    adminActions: { canCancel: false, canCorrect: false, canPrint: false },
  });
  const draftHistory = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationOrderHistoryQuerySchema.parse({}),
      draft.savedDraft.id,
    ),
  );
  expect(draftHistory.events).toHaveLength(1);
  expect(draftHistory.events[0]).toMatchObject({
    kind: "draft",
    change: { operation: "CREATE_DRAFT" },
  });
  await expect(
    observe(f.approvalActorId, (tx, actor) =>
      findAdministrationOrder(tx, actor, randomUUID()),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});
it("merged history pages/searches real identities and gives existing sales/approval only value-free admin summaries", async () => {
  const f = await createQualityFixture(db),
    executor = new AdministrationCommandExecutor(db, () => new Date()),
    reason = "Private reason %_\\ exact",
    version = async () =>
      (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        })
      ).version;
  const corrected = await executor.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: await version(),
      patch: { customerAddress: "Hidden correction contact value" },
      reason,
    }),
  });
  const cancelled = await executor.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: f.order.id,
      expectedVersion: await version(),
      scope: "ITEM",
      pieceIds: [f.order.pieces[0]?.id],
      reason: "Private cancellation reason",
    }),
  });
  const full = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationActivityQuerySchema.parse({ orderId: f.order.id }),
      undefined,
    ),
  );
  expect(
    full.events
      .filter((item) => item.kind === "administration")
      .map((item) => item.event.id),
  ).toEqual([cancelled.receipt.commandId, corrected.receipt.commandId]);
  const page = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationActivityQuerySchema.parse({
        orderId: f.order.id,
        limit: 1,
        page: 2,
      }),
      undefined,
    ),
  );
  expect(page.pagination.total).toBe(full.pagination.total);
  expect(page.events[0]).toEqual(full.events[1]);
  const search = (search: string) =>
    observe(f.approvalActorId, (tx, actor) =>
      findAdministrationActivity(
        tx,
        actor,
        administrationActivityQuerySchema.parse({ search }),
        undefined,
      ),
    );
  expect((await search("%_\\")).events).toMatchObject([
    { kind: "administration", event: { id: corrected.receipt.commandId } },
  ]);
  expect((await search("Hidden correction contact value")).events).toEqual([]);
  expect(
    (
      await search(
        toOrderActivityActionLabel({
          kind: "administration",
          operation: "ADMIN_CORRECT",
        }),
      )
    ).events,
  ).toMatchObject([
    { kind: "administration", event: { id: corrected.receipt.commandId } },
  ]);
  const safe = await f.sales.activity(
      f.approvalActorId,
      { page: 1, limit: 100 },
      f.order.id,
    ),
    approval = await new ApprovalService(
      db,
      new ApprovalCommandExecutor(db),
      "UTC",
    ).orderHistory(f.approvalActorId, f.order.id, { page: 1, limit: 100 });
  for (const events of [safe.events, approval.events]) {
    const administrative = events.filter(
      (item) => item.kind === "administration",
    );
    expect(administrative).toHaveLength(2);
    for (const item of administrative) {
      expect(Object.keys(item.event).sort()).toEqual(
        [
          "actor",
          "businessNumber",
          "changedFields",
          "id",
          "occurredAt",
          "operation",
          "orderId",
          "orderVersion",
          "pieceIds",
        ].sort(),
      );
    }
    expect(JSON.stringify(administrative)).not.toContain("Private reason");
    expect(JSON.stringify(administrative)).not.toContain(
      "Hidden correction contact value",
    );
  }
});

it("activity action search keeps matching CONTINUE labels qualified by their actual source kind", async () => {
  const f = await createQualityFixture(db),
    manufacturing = new ManufacturingCommandExecutor(db),
    quality = new QualityCommandExecutor(db),
    order = await appendManufacturingOrder(db, f),
    version = async (orderId: string) =>
      (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: { version: true },
        })
      ).version;
  for (const [operation, actorId] of [
    ["RECEIVE_AND_START", f.cuttingA],
    ["CONTINUE", f.cuttingB],
  ] as const)
    await manufacturing.execute({
      actorId,
      department: "CUTTING",
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: order.id,
            expectedVersion: await version(order.id),
            pieceIds: order.pieces.map((piece) => piece.id),
          },
        ],
      },
    });
  for (const [operation, actorId] of [
    ["RECEIVE_AND_START", f.qualityA],
    ["CONTINUE", f.qualityB],
  ] as const)
    await quality.execute({
      actorId,
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: await version(f.order.id),
            pieceIds: f.order.pieces.map((piece) => piece.id),
          },
        ],
      },
    });
  const common = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationActivityQuerySchema.parse({ search: "متابعة" }),
    ),
  );
  expect(common.pagination.total).toBe(2);
  expect(new Set(common.events.map((item) => item.kind))).toEqual(
    new Set(["manufacturing", "quality"]),
  );
  const specific = await observe(f.approvalActorId, (tx, actor) =>
    findAdministrationActivity(
      tx,
      actor,
      administrationActivityQuerySchema.parse({
        search: toOrderActivityActionLabel({
          kind: "quality",
          operation: "CONTINUE",
        }),
      }),
    ),
  );
  expect(specific.events).toMatchObject([
    { kind: "quality", event: { operation: "CONTINUE", orderId: f.order.id } },
  ]);
});

it("report shares one mixed 26-order cohort and complete print while keeping the current roster independent and contact scopes exact", async () => {
  const f = await createManufacturingFixture(db),
    drafts = new SalesDraftsService(db, new SalesCommandExecutor(db)),
    customerId = f.order.customerId;
  const customer = await db.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { version: true },
  });
  await new CustomersService(db, new SalesCommandExecutor(db)).update(
    f.approvalActorId,
    customerId,
    updateCustomerBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: customer.version,
      patch: { address: "Current master address" },
    }),
  );
  for (let index = 0; index < 25; index++)
    await drafts.create(
      f.approvalActorId,
      createDraftBodySchema.parse({
        commandId: randomUUID(),
        draft: { type: "REPAIR", customerId, pieces: [{ id: randomUUID() }] },
      }),
    );
  const report = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationReport(
      tx,
      actor,
      administrationReportQuerySchema.parse({}),
      o,
    ),
  );
  expect(report).toMatchObject({
    meta: {
      cohort: { kind: "MIXED", orderCount: 26 },
      filters: { period: "MONTH" },
    },
    kpis: { orders: 26, originalPieces: 2, activePieces: 2 },
    orders: { pagination: { total: 26, totalPages: 2 } },
  });
  expect(report.orders.items).toHaveLength(25);
  const printed = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationPrintReport(
      tx,
      actor,
      administrationReportPrintQuerySchema.parse({}),
      o,
    ),
  );
  expect(printed.orders.items).toHaveLength(26);
  expect(printed.orders.total).toBe(26);
  expect(printed.meta).toMatchObject({
    complete: true,
    effectiveFrom: null,
    effectiveTo: null,
    filters: { period: "ALL" },
  });
  expect(printed.kpis).toEqual(report.kpis);
  expect(
    printed.orders.items.find((row) => row.orderId === f.order.id)?.customer
      .address,
  ).toBe(f.order.customerSnapshot.address);
  expect(
    printed.orders.items
      .filter((row) => row.kind === "draft")
      .every(
        (row) =>
          row.customer.address === "Current master address" &&
          row.businessNumber === null &&
          /^DRAFT-[0-9]{3,19}$/u.test(row.displayReference) &&
          row.counts.original === 0,
      ),
  ).toBe(true);
  expect(printed.exceptionRows).toEqual([]);
  expect(printed.endorsements).toEqual({ mode: "MANUAL", signatories: [] });
  expect(printed.departments).toHaveLength(7);
  const scoped = (salespersonId?: string) =>
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationReport(
        tx,
        actor,
        administrationReportQuerySchema.parse({
          department: "CUTTING",
          salespersonId,
        }),
        o,
      ),
    );
  const cutting = await scoped(),
    emptyOrders = await scoped(randomUUID());
  expect(cutting).toMatchObject({
    kpis: { orders: 1, activePieces: 2 },
    workforce: {
      scope: { kind: "CURRENT_DIRECTORY", department: "CUTTING" },
      totalStaff: 2,
      activeStaff: 2,
    },
  });
  expect(emptyOrders.kpis.orders).toBe(0);
  expect(emptyOrders.workforce).toEqual(cutting.workforce);
  expect(new Set(cutting.workforce.items.map((row) => row.id))).toEqual(
    new Set([f.cuttingA, f.cuttingB]),
  );
  const current = (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    })
  ).version;
  await new AdministrationCommandExecutor(db, () => new Date()).execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: current,
      patch: { customerAddress: "Order-only corrected address" },
      reason: "Correct order delivery contact",
    }),
  });
  const corrected = await scoped();
  expect(corrected.orders.items[0]?.customer.address).toBe(
    "Order-only corrected address",
  );
  const afterVersion = (
    await db.salesDraft.findUniqueOrThrow({
      where: { id: f.order.id },
      select: { version: true },
    })
  ).version;
  await new AdministrationCommandExecutor(db, () => new Date()).execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: f.order.id,
      expectedVersion: afterVersion,
      patch: { customerAddress: null },
      reason: "Clear incorrect order-only address",
    }),
  });
  expect((await scoped()).orders.items[0]?.customer.address).toBeNull();
});
it("one RepeatableRead report observation stays coherent across a later committed correction", async () => {
  const f = await createManufacturingFixture(db),
    query = administrationReportQuerySchema.parse({});
  await observe(f.approvalActorId, async (tx, actor, o) => {
    const before = await findAdministrationReport(tx, actor, query, o),
      version = (
        await db.salesDraft.findUniqueOrThrow({
          where: { id: f.order.id },
          select: { version: true },
        })
      ).version;
    await new AdministrationCommandExecutor(db, () => new Date()).execute({
      actorId: f.approvalActorId,
      body: administrationCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "ADMIN_CORRECT",
        orderId: f.order.id,
        expectedVersion: version,
        patch: { customerName: "Later committed name" },
        reason: "Later observation",
      }),
    });
    expect(await findAdministrationReport(tx, actor, query, o)).toEqual(before);
  });
  const after = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationReport(tx, actor, query, o),
  );
  expect(after.orders.items[0]?.customer.name).toBe("Later committed name");
});
const seedReportDrafts = async (
  ownerId: string,
  count: number,
  customerId: string | null = null,
) => {
  const now = new Date(),
    rows = Array.from({ length: count }, () => ({
      id: randomUUID(),
      ownerId,
      customerId,
      type: "REPAIR" as const,
      status: "DRAFT" as const,
      createdAt: now,
      updatedAt: now,
    }));
  // SQL-valid draft/specification fixtures exercise report capacity, not command acceptance.
  await db.$transaction(
    async (tx) => {
      await tx.salesDraft.createMany({ data: rows });
      await tx.salesDraftPiece.createMany({
        data: rows.map((row) => ({
          id: randomUUID(),
          draftId: row.id,
          position: 1,
          quantity: 1,
          createdAt: now,
          updatedAt: now,
        })),
      });
    },
    { timeout: 10000 },
  );
  return rows.map((row) => row.id);
};
it("print includes exactly 5000 draft roots but rejects 5001 mixed orders instead of truncating", async () => {
  const f = await createManufacturingFixture(db),
    ids = await seedReportDrafts(f.approvalActorId, 5000);
  await expect(
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationPrintReport(
        tx,
        actor,
        administrationReportPrintQuerySchema.parse({}),
        o,
      ),
    ),
  ).rejects.toMatchObject({ code: "REPORT_SCOPE_TOO_LARGE", statusCode: 422 });
  const all = await observe(f.approvalActorId, (tx, actor, o) =>
    findAdministrationPrintReport(
      tx,
      actor,
      administrationReportPrintQuerySchema.parse({ status: "DRAFT" }),
      o,
    ),
  );
  expect(all.orders.total).toBe(5000);
  expect(new Set(all.orders.items.map((row) => row.orderId))).toEqual(
    new Set(ids),
  );
  expect(all.kpis.originalPieces).toBe(0);
  expect(all.meta.complete).toBe(true);
});
it("report refuses a current directory above 5000 even when the order cohort is empty", async () => {
  const f = await createManufacturingFixture(db),
    ids = Array.from({ length: 5000 }, () => randomUUID());
  await db.user.createMany({
    data: ids.map((id) => ({
      id,
      email: id + "@example.test",
      fullName: "Current unassigned directory member",
      passwordHash: "synthetic-only",
    })),
  });
  await expect(
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationReport(
        tx,
        actor,
        administrationReportQuerySchema.parse({ salespersonId: randomUUID() }),
        o,
      ),
    ),
  ).rejects.toMatchObject({ code: "REPORT_SCOPE_TOO_LARGE", statusCode: 422 });
});
it("complete print enforces UTF-8 bytes below the order limit while its screen page remains valid", async () => {
  const f = await createManufacturingFixture(db),
    customerId = f.order.customerId,
    customer = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { version: true },
    });
  await new CustomersService(db, new SalesCommandExecutor(db)).update(
    f.approvalActorId,
    customerId,
    updateCustomerBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: customer.version,
      patch: { address: "ع".repeat(2000) },
    }),
  );
  await seedReportDrafts(f.approvalActorId, 2500, customerId);
  const query = administrationReportQuerySchema.parse({ status: "DRAFT" }),
    page = await observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationReport(tx, actor, query, o),
    );
  expect(page.orders.pagination.total).toBe(2500);
  expect(page.orders.items).toHaveLength(25);
  await expect(
    observe(f.approvalActorId, (tx, actor, o) =>
      findAdministrationPrintReport(
        tx,
        actor,
        administrationReportPrintQuerySchema.parse({ status: "DRAFT" }),
        o,
      ),
    ),
  ).rejects.toMatchObject({ code: "REPORT_SCOPE_TOO_LARGE", statusCode: 422 });
  expect(await db.salesDraft.count()).toBe(2501);
});
