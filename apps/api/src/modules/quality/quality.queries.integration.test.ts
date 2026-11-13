import {
  qualityOrderHistoryQuerySchema,
  qualityActivityQuerySchema,
  type QualityInspectionDecision,
} from "@template/contracts";
import {
  findQualityActivity,
  findQualityOrderHistory,
} from "./quality.queries.js";
import { findOrderActivity } from "../sales-orders/order-activity.queries.js";
import {
  qualityCommandBodySchema,
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  salesOrderTypeSchema,
} from "@template/contracts";
import {
  type AuthorityAccount,
  assertBusinessAuthority,
} from "../auth/account-authority.js";
import { QualityCommandExecutor } from "./quality-command-executor.js";
import { ManufacturingCommandExecutor } from "../manufacturing/manufacturing-command-executor.js";
import {
  findQualityOrders,
  findQualityPieces,
  findQualityOrder,
  findQualityDashboard,
} from "./quality.queries.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createP05LegacyUpgradeFixture } from "../../test-support/p05-legacy-upgrade.fixture.js";
import { MANUFACTURING_PHYSICAL_PIECE_SELECT } from "../manufacturing/manufacturing.mapper.js";
import { loadQualityPieceContexts } from "./quality.queries.js";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createDatabaseClient,
  Prisma,
  type DatabaseClient,
} from "@template/database";
import type { QualityCommandOperation } from "@template/contracts";
import {
  createQualityFixture,
  appendQualityOrder,
} from "../../test-support/quality.fixture.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  lockAccountRows,
  loadIdentityAccount,
} from "../auth/account-authority.js";
import { canonicalQualityOrders } from "./quality.rules.js";
import { lockQualityOrders } from "./quality.queries.js";

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
const graph = (database: DatabaseClient = db) =>
  database.$queryRaw(Prisma.sql`SELECT jsonb_build_object(
 'roots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_drafts r),
 'headers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_orders r),
 'specifications',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_draft_pieces r),
 'pieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_order_pieces r),
 'approval',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM approval_commands r),
 'issues',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_issues r),
 'manufacturing',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM manufacturing_commands r),
 'manufacturingOrders',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id) FROM manufacturing_command_orders r),
 'manufacturingEvents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_piece_events r),
 'manufacturingVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM manufacturing_work_visits r),
 'quality',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM quality_commands r),
 'qualityOrders',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id) FROM quality_command_orders r),
 'qualityVisits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_work_visits r),
 'qualityEvents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_piece_events r),
 'corrections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_correction_cycles r),
 'packing',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM quality_packing_groups r),
 'packingPieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY group_id,piece_id) FROM quality_packing_pieces r),
 'reports',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,order_id,ordinal) FROM quality_approval_reports r)) AS graph`);
it("loads exact incoming contexts with actual production witnesses and no invented visit", async () => {
  const f = await createQualityFixture(db),
    before = await graph();
  const result = await db.$transaction(async (tx) => {
    await lockAccountRows(tx, [f.qualityA], "read");
    const actor = await loadIdentityAccount(tx, f.qualityA);
    return lockQualityOrders(tx, {
      actor,
      operation: "RECEIVE_AND_START",
      orders: canonicalQualityOrders({
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: f.version,
            pieceIds: f.order.pieces.map((p) => p.id),
          },
        ],
      }),
    });
  });
  expect(result).toHaveLength(1);
  expect(result[0]?.pieces.map((c) => c.piece.id).sort()).toEqual(
    f.order.pieces.map((p) => p.id).sort(),
  );
  for (const context of result[0]?.pieces ?? []) {
    expect(context).toMatchObject({
      visit: null,
      lastAction: null,
      correction: null,
      issue: null,
      orderStatus: "APPROVED",
      productionArrival: { orderId: f.order.id, pieceId: context.piece.id },
    });
    expect(context.productionArrival?.occurredAt).toBeInstanceOf(Date);
  }
  expect(await graph()).toEqual(before);
});
it("denies mismatched and missing members before disclosing a stale root version", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    before = await graph();
  for (const pieceId of [other.pieces[0]?.id, randomUUID()]) {
    if (!pieceId) throw new Error("Expected fixture member");
    await expect(
      db.$transaction(async (tx) => {
        await lockAccountRows(tx, [f.qualityA], "read");
        const actor = await loadIdentityAccount(tx, f.qualityA);
        return lockQualityOrders(tx, {
          actor,
          operation: "CONTINUE",
          orders: canonicalQualityOrders({
            commandId: randomUUID(),
            operation: "CONTINUE",
            orders: [
              { orderId: f.order.id, expectedVersion: 1, pieceIds: [pieceId] },
            ],
          }),
        });
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    expect(await graph()).toEqual(before);
  }
});
it("checks each locked root's operation-specific overflow delta and always rolls synthetic heads back", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f, 3),
    before = await graph();
  const cases: Array<{
    operation: QualityCommandOperation;
    head: number;
    counts: [number, number];
    permitted: boolean;
  }> = [
    {
      operation: "RECEIVE_AND_START",
      head: 2147483646,
      counts: [2, 0],
      permitted: true,
    },
    {
      operation: "REPORT_ISSUES",
      head: 2147483646,
      counts: [2, 0],
      permitted: false,
    },
    {
      operation: "REPORT_ISSUES",
      head: 2147483646,
      counts: [1, 0],
      permitted: true,
    },
    {
      operation: "CONTINUE",
      head: 2147483647,
      counts: [1, 0],
      permitted: false,
    },
    {
      operation: "REPORT_ISSUES",
      head: 2147483645,
      counts: [1, 2],
      permitted: true,
    },
    {
      operation: "REPORT_ISSUES",
      head: 2147483645,
      counts: [1, 3],
      permitted: false,
    },
  ];
  for (const scenario of cases) {
    const sentinel = new Error("Rollback permitted quality preflight");
    const orders = [
      {
        orderId: f.order.id,
        expectedVersion: scenario.head,
        pieceIds: f.order.pieces.slice(0, scenario.counts[0]).map((p) => p.id),
      },
      {
        orderId: other.id,
        expectedVersion: scenario.head,
        pieceIds: other.pieces.slice(0, scenario.counts[1]).map((p) => p.id),
      },
    ]
      .filter((o) => o.pieceIds.length > 0)
      .sort((a, b) => a.orderId.localeCompare(b.orderId));
    const attempt = db.$transaction(async (tx) => {
      await lockAccountRows(tx, [f.qualityA], "read");
      const actor = await loadIdentityAccount(tx, f.qualityA);
      for (const order of orders)
        await tx.$queryRaw`SELECT id FROM sales_drafts WHERE id=${order.orderId}::uuid FOR UPDATE`;
      for (const order of orders)
        await tx.salesDraft.update({
          where: { id: order.orderId },
          data: { version: scenario.head },
        });
      const result = await lockQualityOrders(tx, {
        actor,
        operation: scenario.operation,
        orders: orders.map((o) => ({
          ...o,
          decisions: null,
          inspectorNote: null,
          packing: null,
        })),
      });
      expect(
        result.map((r) => ({
          id: r.id,
          version: r.version,
          count: r.pieces.length,
        })),
      ).toEqual(
        orders.map((o) => ({
          id: o.orderId,
          version: scenario.head,
          count: o.pieceIds.length,
        })),
      );
      throw sentinel;
    });
    if (scenario.permitted) await expect(attempt).rejects.toBe(sentinel);
    else
      await expect(attempt).rejects.toMatchObject({
        code: "ORDER_VERSION_CONFLICT",
      });
    expect(await graph()).toEqual(before);
  }
});

const runOwnedChildPrisma = async (
  database: DatabaseClient,
  args: readonly string[],
) => {
  const [current] = await database.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (!current || !uri) throw new Error("Owned child required");
  const childUri = new URL(uri);
  childUri.pathname = "/" + current.name;
  const pnpm = process.env["npm_execpath"];
  if (!pnpm) throw new Error("pnpm context required");
  try {
    await promisify(execFile)(
      process.execPath,
      [pnpm, "exec", "prisma", ...args],
      {
        cwd: fileURLToPath(
          new URL("../../../../../packages/database/", import.meta.url),
        ),
        env: { ...process.env, DATABASE_URL: childUri.toString() },
        timeout: 180000,
      },
    );
  } catch (error: unknown) {
    const diagnostics =
      error !== null &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr
        : "No stderr";
    throw new Error(
      "Owned legacy migration failed: " +
        diagnostics
          .replaceAll(childUri.toString(), "[owned database]")
          .replace(/postgres(?:ql)?:\/\/[^\s]+/gu, "[database redacted]"),
    );
  }
};

it("loads upgraded legacy quality work with a truthful unknown start and no fabricated arrival", async () => {
  const f = await createP05LegacyUpgradeFixture("PRE_P05_QUALITY_SOURCE");
  try {
    await runOwnedChildPrisma(f.database, ["migrate", "deploy"]);
    const pieces = await f.database.salesOrderPiece.findMany({
      where: { orderId: f.orderId },
      select: MANUFACTURING_PHYSICAL_PIECE_SELECT,
    });
    const contexts = await f.database.$transaction((tx) =>
      loadQualityPieceContexts(tx, pieces, new Map([[f.orderId, "APPROVED"]])),
    );
    expect(contexts.map((c) => c.piece.id).sort()).toEqual(
      [...f.pieceIds].sort(),
    );
    for (const context of contexts)
      expect(context).toMatchObject({
        productionArrival: null,
        lastAction: null,
        visit: {
          originKind: "LEGACY_BASELINE",
          legacyUnknownStart: true,
          startedAt: null,
          receivedAt: null,
          startedCommand: null,
        },
      });
  } finally {
    await f.dispose();
  }
});

const readAs = async <T>(
  actorId: string,
  query: (tx: Prisma.TransactionClient, actor: AuthorityAccount) => Promise<T>,
) =>
  db.$transaction(
    async (tx) => {
      await lockAccountRows(tx, [actorId], "read");
      const actor = await loadIdentityAccount(tx, actorId);
      assertBusinessAuthority(actor, "QUALITY");
      return query(tx, actor);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
const assertQualityPrivate = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const member of value) assertQualityPrivate(member);
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
      assertQualityPrivate(member);
    }
};
it("pages accepted physical identities while retaining complete original packing, safe historical detail and unchanged receipts", async () => {
  const f = await createQualityFixture(db),
    executor = new QualityCommandExecutor(db),
    ids = f.order.pieces.map((p) => p.id);
  const started = await executor.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        { orderId: f.order.id, expectedVersion: f.version, pieceIds: ids },
      ],
    }),
  });
  const inspecting = await readAs(f.qualityB, (tx, actor) =>
    findQualityOrder(tx, actor, f.order.id),
  );
  expect(
    inspecting.work.every(
      (work) =>
        work.allowedActions.canContinue && work.allowedActions.canInspect,
    ),
  ).toBe(true);
  await executor.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: started.outcome.orders[0]?.afterVersion,
          decisions: ids.map((pieceId) => ({ pieceId, decision: "ACCEPT" })),
          inspectorNote: "  Original note  ",
          packing: { cartonCount: "  carton A  ", cartonNumbers: "X/2" },
        },
      ],
    }),
  });
  const before = await graph();
  const pages = await Promise.all(
    [1, 2].map((page) =>
      readAs(f.qualityB, (tx, actor) =>
        findQualityPieces(
          tx,
          actor,
          qualityPiecesQuerySchema.parse({ view: "ACCEPTED", page, limit: 1 }),
        ),
      ),
    ),
  );
  expect(
    pages.flatMap((page) => page.items.map((row) => row.piece.id)),
  ).toEqual(
    f.order.pieces
      .slice()
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((piece) => piece.id),
  );
  for (const page of pages) {
    expect(page.counts).toEqual({ orders: 1, pieces: 2 });
    expect(page.packingGroups).toHaveLength(1);
    expect(page.packingGroups[0]).toMatchObject({
      acceptedPieceIds: [...ids].sort(),
      cartonCount: "  carton A  ",
      inspectorNote: "  Original note  ",
    });
    expect(page.items[0]?.work.latestInspection?.decision).toBe("ACCEPT");
    expect(
      Object.values(page.items[0]?.work.allowedActions ?? {}).every(
        (action) => !action,
      ),
    ).toBe(true);
    assertQualityPrivate(page);
  }
  const detail = await readAs(f.qualityB, (tx, actor) =>
    findQualityOrder(tx, actor, f.order.id),
  );
  expect(detail.paper.order.pieces.map((piece) => piece.id).sort()).toEqual(
    [...ids].sort(),
  );
  expect(detail.paper.order.counts.received).toBe(0);
  expect(detail.packingGroups).toHaveLength(1);
  assertQualityPrivate(detail);
  const grouped = await readAs(f.qualityB, (tx, actor) =>
    findQualityOrders(
      tx,
      actor,
      qualityOrdersQuerySchema.parse({ view: "ACCEPTED", search: f.order.id }),
    ),
  );
  expect(grouped.items[0]?.matchingPieceIds).toEqual([...ids].sort());
  expect(
    (
      await readAs(f.qualityB, (tx, actor) =>
        findQualityOrders(
          tx,
          actor,
          qualityOrdersQuerySchema.parse({ view: "ACCEPTED", search: ids[0] }),
        ),
      )
    ).items[0]?.matchingPieceCount,
  ).toBe(1);
  expect(
    (
      await readAs(f.qualityB, (tx, actor) =>
        findQualityOrders(
          tx,
          actor,
          qualityOrdersQuerySchema.parse({
            view: "ACCEPTED",
            search: "Quality A",
          }),
        ),
      )
    ).counts.pieces,
  ).toBe(2);
  const missingPage = await readAs(f.qualityB, (tx, actor) =>
    findQualityPieces(
      tx,
      actor,
      qualityPiecesQuerySchema.parse({ view: "ACCEPTED", page: 3, limit: 1 }),
    ),
  );
  expect(missingPage.items).toEqual([]);
  expect(missingPage.pagination).toMatchObject({ total: 2, totalPages: 2 });
  for (const search of ["%", "_", "\\", "'; SELECT 1 --"]) {
    const empty = await readAs(f.qualityB, (tx, actor) =>
      findQualityOrders(
        tx,
        actor,
        qualityOrdersQuerySchema.parse({ view: "ACCEPTED", search }),
      ),
    );
    expect(empty.items).toEqual([]);
    expect(empty.pagination.totalPages).toBe(0);
  }
  const dashboard = await readAs(f.qualityB, findQualityDashboard);
  expect(dashboard.counts).toEqual({
    incoming: { orders: 0, pieces: 0 },
    inspection: { orders: 0, pieces: 0 },
    accepted: { orders: 1, pieces: 2 },
    corrections: { orders: 0, pieces: 0 },
  });
  await expect(
    readAs(f.qualityB, (tx, actor) =>
      findQualityPieces(
        tx,
        actor,
        qualityPiecesQuerySchema.parse({
          view: "ACCEPTED",
          orderId: randomUUID(),
        }),
      ),
    ),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  expect(await graph()).toEqual(before);
});
it("keeps correction queues overlapping real reinspection and shows held work safely without action authority", async () => {
  const f = await createQualityFixture(db),
    executor = new QualityCommandExecutor(db),
    [pieceId] = f.order.pieces.map((piece) => piece.id);
  if (!pieceId) throw new Error("Owned member required");
  const execute = async (operation: "RECEIVE_AND_START" | "REPORT_ISSUES") =>
    executor.execute({
      actorId: f.qualityA,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: (
              await db.salesDraft.findUniqueOrThrow({
                where: { id: f.order.id },
              })
            ).version,
            pieceIds: [pieceId],
          },
        ],
        ...(operation === "REPORT_ISSUES"
          ? { reason: "Safe held correction", notes: "Safe report note" }
          : {}),
      }),
    });
  const started = await execute("RECEIVE_AND_START");
  await executor.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: started.outcome.orders[0]?.afterVersion,
          decisions: [
            {
              pieceId,
              decision: "REJECT",
              target: "PRODUCTION",
              reason: "Original defect",
              instructions: "Original correction",
            },
          ],
        },
      ],
    }),
  });
  const detail = () =>
    readAs(f.qualityB, (tx, actor) => findQualityOrder(tx, actor, f.order.id));
  expect(
    (await detail()).work.find((work) => work.pieceId === pieceId)
      ?.currentCorrection?.phase,
  ).toBe("WAITING_CORRECTION");
  const manufacturing = new ManufacturingCommandExecutor(db);
  for (const operation of ["RECEIVE_AND_START", "COMPLETE_TRANSFER"] as const)
    await manufacturing.execute({
      actorId: f.productionA,
      department: "PRODUCTION",
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: (
              await db.salesDraft.findUniqueOrThrow({
                where: { id: f.order.id },
              })
            ).version,
            pieceIds: [pieceId],
          },
        ],
      },
    });
  const dashboard = await readAs(f.qualityB, findQualityDashboard);
  expect(dashboard.counts.incoming.pieces).toBe(2);
  expect(dashboard.counts.corrections.pieces).toBe(1);
  expect(
    (await detail()).work.find((work) => work.pieceId === pieceId)
      ?.currentCorrection?.phase,
  ).toBe("AWAITING_REINSPECTION");
  await execute("RECEIVE_AND_START");
  expect(
    (await detail()).work.find((work) => work.pieceId === pieceId)
      ?.currentCorrection?.phase,
  ).toBe("INSPECTING");
  await execute("REPORT_ISSUES");
  const held = await detail(),
    context = held.work.find((work) => work.pieceId === pieceId);
  expect(context?.currentCorrection).toMatchObject({
    phase: "WAITING_CORRECTION",
    reason: "Original defect",
    instructions: "Original correction",
  });
  expect(
    Object.values(context?.allowedActions ?? {}).every((action) => !action),
  ).toBe(true);
  expect(held.paper.issues).toEqual([
    expect.objectContaining({
      pieceId,
      reason: "Safe held correction",
      reportNotes: "Safe report note",
    }),
  ]);
  assertQualityPrivate(held);
  const corrections = await readAs(f.qualityB, (tx, actor) =>
    findQualityPieces(
      tx,
      actor,
      qualityPiecesQuerySchema.parse({ view: "CORRECTIONS" }),
    ),
  );
  expect(corrections.items.map((row) => row.piece.id)).toEqual([pieceId]);
  expect(corrections.counts).toEqual({ orders: 1, pieces: 1 });
  assertQualityPrivate(corrections);
});
it.each(salesOrderTypeSchema.options)(
  "filters actual %s quality orders without changing safe specifications or physical counts",
  async (type) => {
    const f = await createQualityFixture(db, type);
    const rows = await readAs(f.qualityA, (tx, actor) =>
      findQualityOrders(
        tx,
        actor,
        qualityOrdersQuerySchema.parse({ view: "INCOMING", type }),
      ),
    );
    expect(rows.items.map((row) => row.id)).toEqual([f.order.id]);
    expect(rows.counts).toEqual({ orders: 1, pieces: 2 });
    const flat = await readAs(f.qualityB, (tx, actor) =>
      findQualityPieces(
        tx,
        actor,
        qualityPiecesQuerySchema.parse({
          view: "INCOMING",
          type,
          orderId: f.order.id,
        }),
      ),
    );
    expect(flat.items.map((row) => row.piece.id).sort()).toEqual(
      f.order.pieces.map((piece) => piece.id).sort(),
    );
    expect(
      flat.items.every(
        (row) =>
          row.order.type === type &&
          row.work.visit === null &&
          row.work.allowedActions.canReceiveAndStart,
      ),
    ).toBe(true);
    assertQualityPrivate(flat);
  },
);

const qualityScenarioOrder = (
  input: Record<string, unknown>,
): Record<string, unknown> => {
  const order = input["order"];
  if (order === null || typeof order !== "object" || Array.isArray(order))
    throw new Error("Owned order selection required");
  return Object.fromEntries(Object.entries(order));
};
const qualityHistoryScenario = async () => {
  const f = await createQualityFixture(db),
    commands = new QualityCommandExecutor(db),
    ids = f.order.pieces.map((piece) => piece.id);
  const currentVersion = async () =>
    (
      await db.salesDraft.findUniqueOrThrow({
        where: { id: f.order.id },
        select: { version: true },
      })
    ).version;
  const act = async (input: Record<string, unknown>) =>
    commands.execute({
      actorId: f.qualityA,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        ...Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== "order"),
        ),
        orders: [
          {
            orderId: f.order.id,
            expectedVersion: await currentVersion(),
            ...qualityScenarioOrder(input),
          },
        ],
      }),
    });
  const start = (pieceIds: string[]) =>
    act({ operation: "RECEIVE_AND_START", order: { pieceIds } });
  const inspect = (
    decisions: QualityInspectionDecision[],
    packing: unknown = null,
  ) =>
    act({
      operation: "INSPECT",
      order: { decisions, packing, inspectorNote: "Immutable inspection note" },
    });
  const route = async (pieceId: string, target: "CUTTING" | "PRODUCTION") => {
    const manufacturing = new ManufacturingCommandExecutor(db);
    for (const department of target === "CUTTING"
      ? (["CUTTING", "PRODUCTION"] as const)
      : (["PRODUCTION"] as const))
      for (const operation of [
        "RECEIVE_AND_START",
        "COMPLETE_TRANSFER",
      ] as const)
        await manufacturing.execute({
          actorId: department === "CUTTING" ? f.cuttingA : f.productionA,
          department,
          body: {
            commandId: randomUUID(),
            operation,
            orders: [
              {
                orderId: f.order.id,
                expectedVersion: await currentVersion(),
                pieceIds: [pieceId],
              },
            ],
          },
        });
  };
  const history = (pieceId?: string, page = 1, limit = 100) =>
    readAs(f.qualityB, (tx, actor) =>
      findQualityOrderHistory(
        tx,
        actor,
        f.order.id,
        qualityOrderHistoryQuerySchema.parse({ pieceId, page, limit }),
      ),
    );
  return { f, ids, currentVersion, act, start, inspect, route, history };
};
it("pages original grouped inspection and terminal cycle witnesses without truncating piece-filtered packing history", async () => {
  const s = await qualityHistoryScenario(),
    [p1, p2] = s.ids;
  if (!p1 || !p2) throw new Error("Owned members required");
  await s.start(s.ids);
  const opened = await s.inspect(
    [
      {
        pieceId: p1,
        decision: "REJECT",
        target: "CUTTING",
        reason: "First actual defect",
        instructions: "First actual instruction",
      },
      { pieceId: p2, decision: "ACCEPT" },
    ],
    { cartonNumbers: "Original carton" },
  );
  const cycle1 = await db.qualityCorrectionCycle.findFirstOrThrow({
    where: { pieceId: p1, cycle: 1 },
  });
  await s.route(p1, "CUTTING");
  await s.start([p1]);
  const failed = await s.inspect([
    {
      pieceId: p1,
      decision: "REJECT",
      target: "PRODUCTION",
      reason: "Second actual defect",
      instructions: "Second actual instruction",
    },
  ]);
  const cycle2 = await db.qualityCorrectionCycle.findFirstOrThrow({
    where: { pieceId: p1, cycle: 2 },
  });
  await s.route(p1, "PRODUCTION");
  await s.start([p1]);
  const accepted = await s.inspect([{ pieceId: p1, decision: "ACCEPT" }]);
  const detail = await readAs(s.f.qualityB, (tx, actor) =>
    findQualityOrder(tx, actor, s.f.order.id),
  );
  expect(
    detail.work.find((work) => work.pieceId === p1)?.currentCorrection,
  ).toBeNull();
  const all = await s.history(),
    quality = all.events
      .filter((entry) => entry.kind === "quality")
      .map((entry) => entry.event);
  const original = quality.find(
    (event) => event.commandId === opened.receipt.commandId,
  );
  expect(original?.pieces.map((piece) => piece.pieceId)).toEqual(
    [...s.ids].sort(),
  );
  expect(original?.correctionLinks).toEqual([
    { pieceId: p1, correctionId: cycle1.id, cycle: 1, action: "OPENED" },
  ]);
  expect(original?.inspection?.packing?.acceptedPieceIds).toEqual([p2]);
  expect(original?.inspection?.decisions).toContainEqual({
    pieceId: p1,
    decision: "REJECT",
    target: "CUTTING",
    reason: "First actual defect",
    instructions: "First actual instruction",
  });
  expect(
    quality.find((event) => event.commandId === failed.receipt.commandId)
      ?.correctionLinks,
  ).toEqual([
    { pieceId: p1, correctionId: cycle1.id, cycle: 1, action: "REJECTED" },
    { pieceId: p1, correctionId: cycle2.id, cycle: 2, action: "OPENED" },
  ]);
  expect(
    quality.find((event) => event.commandId === accepted.receipt.commandId)
      ?.correctionLinks,
  ).toEqual([
    { pieceId: p1, correctionId: cycle2.id, cycle: 2, action: "ACCEPTED" },
  ]);
  const filtered = await s.history(p2),
    filteredOriginal = filtered.events.find(
      (entry) =>
        entry.kind === "quality" &&
        entry.event.commandId === opened.receipt.commandId,
    );
  expect(filteredOriginal).toEqual({ kind: "quality", event: original });
  expect(
    filtered.events.filter((entry) => entry.kind === "quality"),
  ).toHaveLength(2);
  const pageIds: string[] = [];
  for (let page = 1; page <= all.pagination.total; page++) {
    const slice = await s.history(undefined, page, 1);
    expect(slice.pagination.total).toBe(all.pagination.total);
    expect(slice.events).toHaveLength(1);
    const entry = slice.events[0];
    if (!entry) throw new Error("Expected original history event");
    pageIds.push(entry.kind + "/" + entry.event.id);
  }
  expect(pageIds).toEqual(
    all.events.map((entry) => entry.kind + "/" + entry.event.id),
  );
  expect(new Set(pageIds).size).toBe(pageIds.length);
  expect(
    all.events.filter((entry) => entry.kind === "manufacturing"),
  ).toHaveLength(7);
  assertQualityPrivate(all);
  assertQualityPrivate(filtered);
  await expect(s.history(randomUUID())).rejects.toMatchObject({
    code: "ORDER_NOT_FOUND",
  });
  const shared = await db.$transaction((tx) =>
    findOrderActivity(
      tx,
      { kind: "OWNER", ownerId: s.f.actorId },
      { page: 1, limit: 100 },
      s.f.order.id,
    ),
  );
  expect(
    shared.events
      .filter((entry) => entry.kind === "quality")
      .map((entry) => entry.event.id)
      .sort(),
  ).toEqual(quality.map((event) => event.id).sort());
  expect(
    (
      await db.$transaction((tx) =>
        findOrderActivity(
          tx,
          { kind: "OWNER", ownerId: s.f.qualityB },
          { page: 1, limit: 100 },
          s.f.order.id,
        ),
      )
    ).events,
  ).toEqual([]);
});
it.each(["CUTTING", "PRODUCTION"] as const)(
  "retains actual %s correction cancellation and independent P04 decisions in quality/shared history",
  async (department) => {
    const s = await qualityHistoryScenario(),
      [pieceId] = s.ids;
    if (!pieceId) throw new Error("Owned member required");
    await s.start([pieceId]);
    await s.inspect([
      {
        pieceId,
        decision: "REJECT",
        target: department,
        reason: "Quality rejection",
        instructions: "Original required repair",
      },
    ]);
    const cycle = await db.qualityCorrectionCycle.findFirstOrThrow({
      where: { pieceId, state: "OPEN" },
    });
    const reported = await s.f.approval.reportIssue(
      department === "CUTTING" ? s.f.cuttingA : s.f.productionA,
      s.f.order.id,
      pieceId,
      {
        commandId: randomUUID(),
        expectedVersion: await s.currentVersion(),
        reason: "Manufacturing correction issue",
        notes: "Safe report note",
      },
    );
    if (reported.outcome.issueId === null)
      throw new Error("Actual issue required");
    const cancelled = await s.f.approval.resolveIssue(
      s.f.approvalActorId,
      s.f.order.id,
      pieceId,
      reported.outcome.issueId,
      {
        commandId: randomUUID(),
        expectedVersion: await s.currentVersion(),
        decision: "CANCEL",
        reason: "Actual cancellation",
        confirmed: true,
      },
    );
    const history = await s.history(pieceId),
      events = history.events
        .filter((entry) => entry.kind === "issue")
        .map((entry) => entry.event);
    expect(events.map((event) => event.commandId).sort()).toEqual(
      [reported.receipt.commandId, cancelled.receipt.commandId].sort(),
    );
    expect(
      events.find((event) => event.commandId === cancelled.receipt.commandId),
    ).toMatchObject({
      sourceDepartment: department,
      result: "CANCELLED",
      reason: "Actual cancellation",
      notes: null,
      correctionResolution: {
        correctionId: cycle.id,
        cycle: 1,
        outcome: "CANCELLED",
      },
    });
    expect(
      events.find((event) => event.commandId === reported.receipt.commandId)
        ?.correctionResolution,
    ).toBeNull();
    const shared = await db.$transaction((tx) =>
      findOrderActivity(
        tx,
        { kind: "APPROVAL" },
        { page: 1, limit: 100 },
        s.f.order.id,
      ),
    );
    expect(
      shared.events
        .filter((entry) => entry.kind === "approval")
        .map((entry) => entry.event.id),
    ).toContain(reported.receipt.commandId);
    expect(
      shared.events
        .filter((entry) => entry.kind === "approval")
        .map((entry) => entry.event.id),
    ).toContain(cancelled.receipt.commandId);
    assertQualityPrivate(history);
  },
);
it("suppresses only linked report children and keeps standalone quality reports and later P04 outcomes with exact page totals", async () => {
  const s = await qualityHistoryScenario(),
    [p1, p2] = s.ids;
  if (!p1 || !p2) throw new Error("Owned members required");
  const grouped = await s.act({
    operation: "REPORT_ISSUES",
    order: { pieceIds: [p1] },
    reason: "Parent report",
    notes: "Parent note",
  });
  const child = await db.qualityApprovalReport.findFirstOrThrow({
    where: { commandId: grouped.receipt.commandId },
  });
  const standalone = await s.f.approval.reportIssue(
    s.f.qualityB,
    s.f.order.id,
    p2,
    {
      commandId: randomUUID(),
      expectedVersion: await s.currentVersion(),
      reason: "Standalone report",
      notes: null,
    },
  );
  if (standalone.outcome.issueId === null)
    throw new Error("Actual issue required");
  const decision = await s.f.approval.resolveIssue(
    s.f.approvalActorId,
    s.f.order.id,
    p2,
    standalone.outcome.issueId,
    {
      commandId: randomUUID(),
      expectedVersion: await s.currentVersion(),
      decision: "RETURN_TO_DEPARTMENT",
      target: "PRODUCTION",
      notes: "Approved instruction",
    },
  );
  const quality = await s.history(),
    shared = await db.$transaction((tx) =>
      findOrderActivity(
        tx,
        { kind: "OWNER", ownerId: s.f.actorId },
        { page: 1, limit: 100 },
        s.f.order.id,
      ),
    );
  expect(
    quality.events.filter((entry) => entry.kind === "quality"),
  ).toHaveLength(1);
  expect(
    quality.events
      .filter((entry) => entry.kind === "issue")
      .map((entry) => entry.event.commandId)
      .sort(),
  ).toEqual([standalone.receipt.commandId, decision.receipt.commandId].sort());
  const sharedApprovalIds = shared.events
    .filter((entry) => entry.kind === "approval")
    .map((entry) => entry.event.id);
  expect(sharedApprovalIds).not.toContain(child.approvalCommandId);
  expect(sharedApprovalIds).toContain(standalone.receipt.commandId);
  expect(sharedApprovalIds).toContain(decision.receipt.commandId);
  expect(
    shared.events.filter((entry) => entry.kind === "quality"),
  ).toHaveLength(1);
  expect(quality.pagination.total).toBe(quality.events.length);
  expect(shared.pagination.total).toBe(shared.events.length);
  const activity = await readAs(s.f.qualityA, (tx, actor) =>
    findQualityActivity(
      tx,
      actor,
      qualityActivityQuerySchema.parse({ limit: 100 }),
    ),
  );
  expect(activity.events).toEqual(quality.events);
  assertQualityPrivate(activity);
});

it("pages two orders tied by one actual quality command using order UUID then physical position without count drift", async () => {
  const f = await createQualityFixture(db),
    other = await appendQualityOrder(db, f),
    commands = new QualityCommandExecutor(db);
  await commands.execute({
    actorId: f.qualityA,
    body: {
      commandId: randomUUID(),
      operation: "RECEIVE_AND_START",
      orders: [
        {
          orderId: f.order.id,
          expectedVersion: f.version,
          pieceIds: f.order.pieces.map((piece) => piece.id),
        },
        {
          orderId: other.id,
          expectedVersion: other.version,
          pieceIds: other.pieces.map((piece) => piece.id),
        },
      ],
    },
  });
  const expectedOrders = [f.order, other].sort((a, b) =>
    b.id.localeCompare(a.id),
  );
  const pages = [];
  for (const page of [1, 2])
    pages.push(
      await readAs(f.qualityB, (tx, actor) =>
        findQualityOrders(
          tx,
          actor,
          qualityOrdersQuerySchema.parse({
            view: "INSPECTION",
            page,
            limit: 1,
          }),
        ),
      ),
    );
  expect(pages.map((page) => page.items[0]?.id)).toEqual(
    expectedOrders.map((order) => order.id),
  );
  expect(pages[0]?.items[0]?.lastWorkAt).toBe(pages[1]?.items[0]?.lastWorkAt);
  for (const page of pages) {
    expect(page.counts).toEqual({ orders: 2, pieces: 4 });
    expect(page.pagination).toMatchObject({ total: 2, totalPages: 2 });
  }
  const flat = await readAs(f.qualityB, (tx, actor) =>
    findQualityPieces(
      tx,
      actor,
      qualityPiecesQuerySchema.parse({ view: "INSPECTION" }),
    ),
  );
  expect(flat.items.map((row) => row.piece.id)).toEqual(
    expectedOrders.flatMap((order) =>
      order.pieces
        .slice()
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((piece) => piece.id),
    ),
  );
  expect(flat.counts).toEqual({ orders: 2, pieces: 4 });
  const orderSearch = await readAs(f.qualityB, (tx, actor) =>
    findQualityOrders(
      tx,
      actor,
      qualityOrdersQuerySchema.parse({
        view: "INSPECTION",
        search: f.order.businessNumber,
      }),
    ),
  );
  expect(orderSearch.items.map((order) => order.id)).toEqual([f.order.id]);
  expect(orderSearch.counts.pieces).toBe(2);
  assertQualityPrivate(flat);
});

it("upgrades populated P06 reporting forward without changing its history, triggers or full parent validator", async () => {
  const f = await createP05LegacyUpgradeFixture("PRE_P05_QUALITY_SOURCE");
  const original = "20261111000200_p06_quality_workspaces",
    next = "20261112000100_p06_quality_validation_dispatch";
  const migrationFile = (name: string) =>
    fileURLToPath(
      new URL(
        `../../../../../packages/database/prisma/migrations/${name}/migration.sql`,
        import.meta.url,
      ),
    );
  try {
    await runOwnedChildPrisma(f.database, [
      "db",
      "execute",
      "--file",
      migrationFile(original),
    ]);
    await runOwnedChildPrisma(f.database, [
      "migrate",
      "resolve",
      "--applied",
      original,
    ]);
    const actorId = f.qualityActorId;
    if (!actorId) throw new Error("Owned quality actor required");
    const root = await f.database.salesDraft.findUniqueOrThrow({
      where: { id: f.orderId },
      select: { version: true },
    });
    const commands = new QualityCommandExecutor(f.database);
    const saved = await commands.execute({
      actorId,
      body: qualityCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "REPORT_ISSUES",
        orders: [
          {
            orderId: f.orderId,
            expectedVersion: root.version,
            pieceIds: f.pieceIds,
          },
        ],
        reason: "Retained pre-upgrade report",
        notes: " Original notes ",
      }),
    });
    const before = await graph(f.database),
      ledgerBefore = await f.database
        .$queryRaw`SELECT * FROM _prisma_migrations ORDER BY migration_name`;
    const triggers = () =>
      f.database
        .$queryRaw`SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
    const validator = () =>
      f.database
        .$queryRaw`SELECT pg_get_functiondef('check_p06_quality_command(uuid)'::regprocedure) AS definition`;
    const triggersBefore = await triggers(),
      validatorBefore = await validator();
    await runOwnedChildPrisma(f.database, ["migrate", "deploy"]);
    expect(await graph(f.database)).toEqual(before);
    expect(
      await f.database
        .$queryRaw`SELECT * FROM _prisma_migrations WHERE migration_name<>${next} ORDER BY migration_name`,
    ).toEqual(ledgerBefore);
    expect(await triggers()).toEqual(triggersBefore);
    expect(await validator()).toEqual(validatorBefore);
    expect(await commands.observe(actorId, saved.receipt.commandId)).toEqual({
      ...saved,
      replayed: true,
    });
    const applied = await f.database.$queryRaw<
      Array<{
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
      }>
    >`SELECT migration_name,checksum,finished_at FROM _prisma_migrations WHERE migration_name=${next}`;
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      migration_name: next,
      checksum: createHash("sha256")
        .update(await readFile(migrationFile(next)))
        .digest("hex"),
    });
    expect(applied[0]?.finished_at).toBeInstanceOf(Date);
    const completeLedger = await f.database
      .$queryRaw`SELECT * FROM _prisma_migrations ORDER BY migration_name`;
    await runOwnedChildPrisma(f.database, ["migrate", "deploy"]);
    expect(
      await f.database
        .$queryRaw`SELECT * FROM _prisma_migrations ORDER BY migration_name`,
    ).toEqual(completeLedger);
    expect(await graph(f.database)).toEqual(before);
  } finally {
    await f.dispose();
  }
});
