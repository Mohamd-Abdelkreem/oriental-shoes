import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual, promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { createDatabaseClient, type DatabaseClient } from "@template/database";
import {
  administrationCommandBodySchema,
  administrationOrderDataSchema,
  qualityCommandBodySchema,
  warehouseCommandBodySchema,
  errorEnvelopeSchema,
  successEnvelopeSchema,
} from "@template/contracts";
import {
  createQualityFixture,
  appendQualityOrder,
} from "./test-support/quality.fixture.js";
import { AdministrationCommandExecutor } from "./modules/administration/administration-command-executor.js";
import { ManufacturingCommandExecutor } from "./modules/manufacturing/manufacturing-command-executor.js";
import { QualityCommandExecutor } from "./modules/quality/quality-command-executor.js";
import { WarehouseCommandExecutor } from "./modules/warehouse/warehouse-command-executor.js";
import { StaffService } from "./modules/staff/staff.service.js";
import {
  parseMoneyCents,
  formatMoneyCents,
} from "./modules/sales-orders/sales-orders.rules.js";
import { createApp } from "./app.js";
import { businessTestHeaders } from "./test-support/business-http.fixture.js";
import pino from "pino";
import request from "supertest";

const archivePath = "/tmp/p08-recovery.dump",
  execFileAsync = promisify(execFile);
const databaseRoot = fileURLToPath(
  new URL("../../../packages/database/", import.meta.url),
);
const runnerUri = process.env["P01_TEST_DATABASE_URL"];
if (!runnerUri || runnerUri !== process.env["DATABASE_URL"])
  throw new Error("Owned API integration runner required");
type OwnedContainers = Readonly<{
  source: StartedPostgreSqlContainer;
  target: StartedPostgreSqlContainer;
}>;
type RecoveryFixtureIds = Readonly<{
  adminId: string;
  employeeId: string;
  suspendedId: string;
  orderIds: readonly string[];
  cancelCommandId: string;
  correctionCommandId: string;
}>;
type RestoreFingerprint = Readonly<{
  migrations: readonly {
    name: string;
    checksum: string;
    finished: boolean;
    rolledBack: boolean;
  }[];
  tables: readonly { name: string; count: string; sha256: string }[];
  schemaSha256: string;
  schemaComponents: readonly { kind: string; name: string; sha256: string }[];
  businessSha256: string;
}>;
type RecoveryRun = OwnedContainers & {
  sourceDb: DatabaseClient;
  targetDb: DatabaseClient | undefined;
  ids: RecoveryFixtureIds | undefined;
  fingerprint: RestoreFingerprint | undefined;
  runnerFingerprint: RestoreFingerprint | undefined;
};
let active: RecoveryRun | undefined;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const startOwnedContainer = (role: "source" | "target") =>
  new PostgreSqlContainer("postgres:18.4")
    .withDatabase("p08_" + role + "_" + randomUUID().replaceAll("-", ""))
    .withUsername("p08_recovery_owner")
    .withPassword("test-only-recovery-password")
    .withStartupTimeout(120000)
    .start();
const allocateRecoveryContainers = async (
  startSource: () => Promise<StartedPostgreSqlContainer>,
  startTarget: () => Promise<StartedPostgreSqlContainer>,
): Promise<OwnedContainers> => {
  const source = await startSource();
  try {
    const target = await startTarget();
    if (source.getId() === target.getId())
      throw new Error("Distinct owned containers required");
    return { source, target };
  } catch (error) {
    await source.stop();
    throw error;
  }
};
const prepared = () => {
  const run = active;
  if (!run || !run.ids || !run.fingerprint || !run.runnerFingerprint)
    throw new Error("Prepared owned recovery exercise required");
  return {
    ...run,
    ids: run.ids,
    fingerprint: run.fingerprint,
    runnerFingerprint: run.runnerFingerprint,
  };
};
const runOwnedPrisma = async (
  container: StartedPostgreSqlContainer,
  args: readonly string[],
): Promise<void> => {
  if (!active || (container !== active.source && container !== active.target))
    throw new Error("Owned migration target required");
  const pnpm = process.env["npm_execpath"];
  if (!pnpm) throw new Error("pnpm invocation required");
  try {
    await execFileAsync(process.execPath, [pnpm, "exec", "prisma", ...args], {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      timeout: 180000,
      windowsHide: true,
    });
  } catch {
    throw new Error(
      "Owned migration check failed; private diagnostics withheld",
    );
  }
};
// PostgreSQL reparses dumped constraints: pretty deparsing removes redundant
// AND parentheses, and varchar-literal array casts move onto each element.
// Normalize only that exact literal-only cast; retain every value and guard flag.
const canonicalGuardDefinition = (definition: string): string =>
  definition.replace(
    /ARRAY\[('(?:[^']|'')*'::character varying(?:, '(?:[^']|'')*'::character varying)*)\]::text\[\]/gu,
    (_match: string, literals: string) =>
      "ARRAY[" +
      literals.replaceAll("::character varying", "::character varying::text") +
      "]",
  );
const readRestoreFingerprint = async (
  database: DatabaseClient,
): Promise<RestoreFingerprint> => {
  const names = await database.$queryRaw<
    { name: string }[]
  >`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const tables: { name: string; count: string; sha256: string }[] = [];
  for (const { name } of names) {
    if (!/^[_a-z][_a-z0-9]*$/u.test(name))
      throw new Error("Unexpected owned table identifier");
    const [row] = await database.$queryRawUnsafe<
      { count: string; canonical: string }[]
    >(
      `SELECT count(*)::text AS count,coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]') AS canonical FROM "${name}" r`,
    );
    if (!row) throw new Error("Owned table fingerprint unavailable");
    tables.push({ name, count: row.count, sha256: digest(row.canonical) });
  }
  const migrations = await database.$queryRaw<
    RestoreFingerprint["migrations"]
  >`SELECT migration_name AS name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS "rolledBack" FROM _prisma_migrations ORDER BY migration_name`;
  const definitions = await database.$queryRaw<
    { kind: string; name: string; definition: string }[]
  >`
   SELECT 'constraint' AS kind,r.relname||'.'||c.conname AS name,pg_get_constraintdef(c.oid,true)||' | flags: '||jsonb_build_array(c.convalidated,c.condeferrable,c.condeferred,c.connoinherit,c.conenforced)::text AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'
   UNION ALL SELECT 'trigger',r.relname||'.'||t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
   UNION ALL SELECT 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   ORDER BY kind,name`;
  const [business] = await database.$queryRaw<
    { canonical: string }[]
  >`SELECT jsonb_build_object(
 'orders',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_orders r),
 'pieces',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM sales_order_pieces r),
 'commands',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_commands r),
 'cancelled',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id,piece_id) FROM administration_cancelled_pieces r),
 'corrections',(SELECT jsonb_agg(to_jsonb(r) ORDER BY command_id) FROM administration_order_corrections r),
 'catalog',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM catalog_sources r),
 'counter',(SELECT jsonb_agg(to_jsonb(r)) FROM business_order_counter r))::text AS canonical`;
  if (!business) throw new Error("Owned graph fingerprint unavailable");
  return {
    migrations,
    tables,
    schemaSha256: digest(
      JSON.stringify(
        definitions.map((row) => ({
          ...row,
          definition: canonicalGuardDefinition(row.definition),
        })),
      ),
    ),
    schemaComponents: definitions.map((row) => ({
      kind: row.kind,
      name: row.name,
      sha256: digest(canonicalGuardDefinition(row.definition)),
    })),
    businessSha256: digest(business.canonical),
  };
};
const createRecoveryFixture = async (
  database: DatabaseClient,
): Promise<RecoveryFixtureIds> => {
  const f = await createQualityFixture(database),
    quality = new QualityCommandExecutor(database),
    manufacturing = new ManufacturingCommandExecutor(database),
    warehouse = new WarehouseCommandExecutor(database),
    administration = new AdministrationCommandExecutor(
      database,
      () => new Date(),
    );
  const version = async (orderId: string) =>
    (
      await database.salesDraft.findUniqueOrThrow({
        where: { id: orderId },
        select: { version: true },
      })
    ).version;
  const startQuality = async (orderId: string, pieceIds: string[]) =>
    quality.execute({
      actorId: f.qualityA,
      body: {
        commandId: randomUUID(),
        operation: "RECEIVE_AND_START",
        orders: [
          { orderId, expectedVersion: await version(orderId), pieceIds },
        ],
      },
    });
  const accept = async (orderId: string, pieceIds: string[]) =>
    quality.execute({
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
            inspectorNote: "Retained recovery inspection",
            packing: { cartonCount: "2" },
          },
        ],
      }),
    });
  const receive = async (orderId: string, pieceIds: string[]) =>
    warehouse.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "RECEIVE",
        orders: [
          { orderId, expectedVersion: await version(orderId), pieceIds },
        ],
      }),
    });
  const dispatch = async (orderId: string, pieceIds: string[]) => {
    const result = await warehouse.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "DISPATCH",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds,
            deliveryNote: "Original recovery dispatch",
          },
        ],
      }),
    });
    const attemptId = result.outcome.orders[0]?.attemptId;
    if (!attemptId) throw new Error("Real recovery attempt required");
    return attemptId;
  };
  const deliver = async (
    orderId: string,
    pieceIds: string[],
    attemptId: string,
  ) =>
    warehouse.execute({
      actorId: f.approvalActorId,
      body: warehouseCommandBodySchema.parse({
        commandId: randomUUID(),
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId,
            expectedVersion: await version(orderId),
            pieceIds,
            attemptId,
            recipient: "Recovery fixture recipient",
            deliveredAt: new Date().toISOString(),
          },
        ],
      }),
    });
  const first = f.order.id,
    firstPieces = f.order.pieces.map((piece) => piece.id);
  await startQuality(first, firstPieces);
  await quality.execute({
    actorId: f.qualityA,
    body: qualityCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "INSPECT",
      orders: [
        {
          orderId: first,
          expectedVersion: await version(first),
          decisions: firstPieces.map((pieceId) => ({
            pieceId,
            decision: "REJECT",
            target: "PRODUCTION",
            reason: "Original recovery defect",
            instructions: "Retained production correction",
          })),
        },
      ],
    }),
  });
  for (const operation of ["RECEIVE_AND_START", "COMPLETE_TRANSFER"] as const)
    await manufacturing.execute({
      actorId: f.productionA,
      department: "PRODUCTION",
      body: {
        commandId: randomUUID(),
        operation,
        orders: [
          {
            orderId: first,
            expectedVersion: await version(first),
            pieceIds: firstPieces,
          },
        ],
      },
    });
  await startQuality(first, firstPieces);
  await accept(first, firstPieces);
  await receive(first, firstPieces);
  await deliver(first, firstPieces, await dispatch(first, firstPieces));
  const second = await appendQualityOrder(database, f),
    secondPieces = second.pieces.map((piece) => piece.id);
  await startQuality(second.id, secondPieces);
  await accept(second.id, secondPieces);
  await receive(second.id, secondPieces);
  const failedAttempt = await dispatch(second.id, secondPieces);
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "FAIL_DELIVERY",
      orders: [
        {
          orderId: second.id,
          expectedVersion: await version(second.id),
          pieceIds: secondPieces,
          attemptId: failedAttempt,
          returnedToWarehouse: true,
          reason: "Whole physical return",
          notes: "Original retained failed delivery",
        },
      ],
    }),
  });
  const selected = secondPieces[0];
  if (!selected) throw new Error("Physical recovery selection required");
  const cancelled = await administration.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: second.id,
      expectedVersion: await version(second.id),
      scope: "ITEM",
      pieceIds: [selected],
      reason: "Retained recovery cancellation",
    }),
  });
  await f.sales.setPaid(f.approvalActorId, second.id, {
    commandId: randomUUID(),
    expectedVersion: await version(second.id),
    paidAmount: formatMoneyCents(
      parseMoneyCents(cancelled.after.money.total) + 10000n,
    ),
  });
  const corrected = await administration.execute({
    actorId: f.approvalActorId,
    body: administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: second.id,
      expectedVersion: await version(second.id),
      patch: {
        customerAddress: "Recovery corrected order address",
        generalNotes: "Recovery corrected general note",
      },
      reason: "Retained recovery contact correction",
    }),
  });
  const survivors = secondPieces.filter((piece) => piece !== selected);
  await warehouse.execute({
    actorId: f.approvalActorId,
    body: warehouseCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "RETRY_DELIVERY",
      orders: [
        {
          orderId: second.id,
          expectedVersion: await version(second.id),
          pieceIds: survivors,
          attemptId: failedAttempt,
        },
      ],
    }),
  });
  await deliver(second.id, survivors, await dispatch(second.id, survivors));
  const staff = await database.user.findUniqueOrThrow({
    where: { id: f.cuttingB },
    select: { accessVersion: true },
  });
  await new StaffService(database).suspendStaff(f.approvalActorId, f.cuttingB, {
    commandId: randomUUID(),
    expectedAccessVersion: staff.accessVersion,
  });
  const statuses = await database.salesOrder.findMany({
    orderBy: { id: "asc" },
    select: { status: true },
  });
  if (
    statuses.length !== 2 ||
    statuses.some((row) => row.status !== "DELIVERED") ||
    corrected.after.money.surplus !== "100.00" ||
    (await database.warehouseDeliveryAttempt.count({
      where: { orderId: second.id },
    })) !== 2
  )
    throw new Error("The actual recovery history is incomplete");
  return {
    adminId: f.approvalActorId,
    employeeId: f.cuttingA,
    suspendedId: f.cuttingB,
    orderIds: [first, second.id],
    cancelCommandId: cancelled.receipt.commandId,
    correctionCommandId: corrected.receipt.commandId,
  };
};
const dumpOwnedDatabase = async (
  source: StartedPostgreSqlContainer,
): Promise<void> => {
  if (!active || source !== active.source)
    throw new Error("Owned recovery source required");
  const result = await source.exec([
    "pg_dump",
    "--format=custom",
    "--file=" + archivePath,
    "--username=" + source.getUsername(),
    "--dbname=" + source.getDatabase(),
  ]);
  if (result.exitCode !== 0) throw new Error("Owned archive creation failed");
  if ((await source.exec(["chmod", "600", archivePath])).exitCode !== 0)
    throw new Error("Owned archive permissions failed");
};
const assertEmptyTarget = async (
  source: StartedPostgreSqlContainer,
  target: StartedPostgreSqlContainer,
): Promise<void> => {
  if (source.getId() === target.getId())
    throw new Error("Identical recovery source and target refused");
  if (!active || source !== active.source || target !== active.target)
    throw new Error("Wrong owned recovery target refused");
  const database = createDatabaseClient(target.getConnectionUri());
  try {
    const [row] = await database.$queryRaw<
      { name: string; tables: bigint }[]
    >`SELECT current_database() AS name,(SELECT count(*) FROM pg_tables WHERE schemaname='public') AS tables`;
    if (!row || row.name !== target.getDatabase() || row.tables !== 0n)
      throw new Error(
        "Recovery target must be the distinct empty owned database",
      );
  } finally {
    await database.$disconnect();
  }
};
const restoreOwnedArchive = async (
  source: StartedPostgreSqlContainer,
  target: StartedPostgreSqlContainer,
): Promise<void> => {
  await assertEmptyTarget(source, target);
  const archive = await source.copyArchiveFromContainer(archivePath),
    transfer = new PassThrough(),
    abort = new AbortController();
  const consumer = target.copyArchiveToContainer(transfer, "/tmp"),
    producer = pipeline(archive, transfer, { signal: abort.signal });
  try {
    await Promise.all([consumer, producer]);
  } finally {
    abort.abort();
    transfer.destroy();
    await Promise.allSettled([consumer, producer]);
  }
  const restored = await target.exec([
    "pg_restore",
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-acl",
    "--username=" + target.getUsername(),
    "--dbname=" + target.getDatabase(),
    archivePath,
  ]);
  if (restored.exitCode !== 0) {
    const diagnostic = restored.stderr;
    const category = /schema "public" already exists/u.test(diagnostic)
      ? "PUBLIC_SCHEMA_EXISTS"
      : /could not open input file/u.test(diagnostic)
        ? "ARCHIVE_MISSING"
        : /unsupported version|did not find magic|input file is too short|could not read/u.test(
              diagnostic,
            )
          ? "ARCHIVE_INVALID"
          : /violates|constraint/u.test(diagnostic)
            ? "CONSTRAINT_REJECTED"
            : /does not exist/u.test(diagnostic)
              ? "MISSING_DEPENDENCY"
              : /permission denied/u.test(diagnostic)
                ? "PERMISSION_DENIED"
                : "UNCLASSIFIED";
    const dependency = diagnostic.match(
      /(?:function |relation "|type ")([a-z_][a-z0-9_.]*)/u,
    )?.[1];
    throw new Error(
      "Owned archive restore failed: " +
        category +
        (dependency ? " (" + dependency + ")" : ""),
    );
  }
};
const assertRecoveryFingerprint = (
  actual: RestoreFingerprint,
  expected: RestoreFingerprint,
): void => {
  const differences: string[] = [];
  if (!isDeepStrictEqual(actual.migrations, expected.migrations))
    differences.push("migration ledger");
  for (const table of expected.tables) {
    const restored = actual.tables.find((row) => row.name === table.name);
    if (!isDeepStrictEqual(restored, table))
      differences.push("table:" + table.name);
  }
  if (actual.tables.length !== expected.tables.length)
    differences.push("table inventory");
  if (actual.schemaSha256 !== expected.schemaSha256) {
    const changed = expected.schemaComponents
      .filter(
        (component) =>
          !actual.schemaComponents.some((other) =>
            isDeepStrictEqual(other, component),
          ),
      )
      .map((component) => component.kind + ":" + component.name);
    differences.push("schema guards (" + changed.join(", ") + ")");
  }
  if (actual.businessSha256 !== expected.businessSha256)
    differences.push("business graph");
  if (differences.length)
    throw new Error("Recovery fingerprint mismatch: " + differences.join(", "));
};
const assertUnchangedSource = async () => {
  const run = prepared();
  expect(
    isDeepStrictEqual(
      await readRestoreFingerprint(run.sourceDb),
      run.fingerprint,
    ),
  ).toBe(true);
};
const assertEmptyCurrentTarget = async () => {
  const run = prepared();
  await assertEmptyTarget(run.source, run.target);
};

describe("owned application-data logical recovery", () => {
  beforeEach(async () => {
    const containers = await allocateRecoveryContainers(
      () => startOwnedContainer("source"),
      () => startOwnedContainer("target"),
    );
    active = {
      ...containers,
      sourceDb: createDatabaseClient(containers.source.getConnectionUri()),
      targetDb: undefined,
      ids: undefined,
      fingerprint: undefined,
      runnerFingerprint: undefined,
    };
    const runner = createDatabaseClient(runnerUri);
    try {
      active.runnerFingerprint = await readRestoreFingerprint(runner);
    } finally {
      await runner.$disconnect();
    }
    await runOwnedPrisma(active.source, ["migrate", "deploy"]);
    const priorDatabase = process.env["DATABASE_URL"],
      priorMarker = process.env["P01_TEST_DATABASE_URL"];
    try {
      process.env["DATABASE_URL"] = active.source.getConnectionUri();
      process.env["P01_TEST_DATABASE_URL"] = active.source.getConnectionUri();
      active.ids = await createRecoveryFixture(active.sourceDb);
    } finally {
      if (priorDatabase === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = priorDatabase;
      if (priorMarker === undefined)
        delete process.env["P01_TEST_DATABASE_URL"];
      else process.env["P01_TEST_DATABASE_URL"] = priorMarker;
    }
    active.fingerprint = await readRestoreFingerprint(active.sourceDb);
    await dumpOwnedDatabase(active.source);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    const run = active;
    active = undefined;
    if (!run) return;
    const closed = await Promise.allSettled([
      run.sourceDb.$disconnect(),
      ...(run.targetDb ? [run.targetDb.$disconnect()] : []),
    ]);
    const stopped = await Promise.allSettled([
      run.target.stop(),
      run.source.stop(),
    ]);
    if ([...closed, ...stopped].some((result) => result.status === "rejected"))
      throw new Error("Owned recovery cleanup failed");
    const runner = createDatabaseClient(runnerUri);
    try {
      if (run.runnerFingerprint)
        expect(
          isDeepStrictEqual(
            await readRestoreFingerprint(runner),
            run.runnerFingerprint,
          ),
        ).toBe(true);
    } finally {
      await runner.$disconnect();
    }
  });
  it("refuses identical or reversed owned targets before transfer without changing the source", async () => {
    const run = prepared();
    await expect(restoreOwnedArchive(run.source, run.source)).rejects.toThrow(
      "Identical",
    );
    await expect(restoreOwnedArchive(run.target, run.source)).rejects.toThrow(
      "Wrong",
    );
    await assertEmptyCurrentTarget();
    await assertUnchangedSource();
  });
  it("rejects a truncated custom archive without accepting a partial schema or changing source data", async () => {
    const run = prepared();
    const truncated = await run.source.exec([
      "truncate",
      "-s",
      "32",
      archivePath,
    ]);
    expect(truncated.exitCode).toBe(0);
    await expect(restoreOwnedArchive(run.source, run.target)).rejects.toThrow(
      "Owned archive restore failed",
    );
    await assertEmptyCurrentTarget();
    await assertUnchangedSource();
  });
  it("settles a failing binary transfer without reporting restore success or changing source data", async () => {
    const run = prepared();
    vi.spyOn(run.source, "copyArchiveFromContainer").mockImplementationOnce(
      () =>
        Promise.resolve(
          Readable.from(
            (function* () {
              yield Buffer.from("owned incomplete tar");
              throw new Error("Controlled archive transfer failure");
            })(),
          ),
        ),
    );
    await expect(restoreOwnedArchive(run.source, run.target)).rejects.toThrow();
    await assertEmptyCurrentTarget();
    await assertUnchangedSource();
  });
  it("propagates an owned restore execution failure with no accepted target schema", async () => {
    const run = prepared();
    vi.spyOn(run.target, "exec").mockRejectedValueOnce(
      new Error("Controlled restore execution failure"),
    );
    await expect(restoreOwnedArchive(run.source, run.target)).rejects.toThrow(
      "Controlled restore execution failure",
    );
    await assertEmptyCurrentTarget();
    await assertUnchangedSource();
  });
  it("restores every retained graph and guard, proves current protected authority and persists across database restart", async () => {
    const run = prepared();
    await restoreOwnedArchive(run.source, run.target);
    const target = createDatabaseClient(run.target.getConnectionUri());
    if (!active) throw new Error("Owned exercise required");
    active.targetDb = target;
    assertRecoveryFingerprint(
      await readRestoreFingerprint(target),
      run.fingerprint,
    );
    for (const name of [
      "administration_commands",
      "administration_cancelled_pieces",
      "administration_order_corrections",
    ])
      expect(
        BigInt(
          run.fingerprint.tables.find((table) => table.name === name)?.count ??
            "0",
        ) > 0n,
      ).toBe(true);
    await runOwnedPrisma(run.target, ["migrate", "status"]);
    await runOwnedPrisma(run.target, ["migrate", "deploy"]);
    assertRecoveryFingerprint(
      await readRestoreFingerprint(target),
      run.fingerprint,
    );
    const app = createApp({
        database: target,
        logger: pino({ enabled: false }),
        emailDelivery: {
          provider: "console",
          send: () => Promise.resolve({ providerMessageId: "unused" }),
        },
      }),
      orderId = run.ids.orderIds[1];
    if (!orderId) throw new Error("Restored corrected order required");
    const allowed = await request(app)
      .get(`/api/v1/administration/orders/${orderId}`)
      .set(businessTestHeaders(run.ids.adminId));
    expect(allowed.status).toBe(200);
    const detail = administrationOrderDataSchema.parse(
      successEnvelopeSchema.parse(allowed.body).data,
    );
    expect(
      detail.kind === "submitted" &&
        detail.order.status === "DELIVERED" &&
        detail.order.money.surplus === "100.00" &&
        detail.order.customerSnapshot.address ===
          "Recovery corrected order address",
    ).toBe(true);
    for (const actorId of [run.ids.employeeId, run.ids.suspendedId]) {
      const denied = await request(app)
        .post("/api/v1/administration/commands")
        .set(businessTestHeaders(actorId))
        .send({
          commandId: randomUUID(),
          operation: "ADMIN_CORRECT",
          orderId,
          expectedVersion: 1,
          patch: { generalNotes: "Must not save" },
          reason: "Denied actor",
        });
      expect(denied.status).toBe(403);
      errorEnvelopeSchema.parse(denied.body);
    }
    assertRecoveryFingerprint(
      await readRestoreFingerprint(target),
      run.fingerprint,
    );
    await expect(restoreOwnedArchive(run.source, run.target)).rejects.toThrow(
      "empty owned database",
    );
    assertRecoveryFingerprint(
      await readRestoreFingerprint(target),
      run.fingerprint,
    );
    await target.$disconnect();
    active.targetDb = undefined;
    await run.target.restart({ timeout: 120000 });
    const restarted = createDatabaseClient(run.target.getConnectionUri());
    active.targetDb = restarted;
    const deadline = Date.now() + 120000;
    for (;;) {
      try {
        await restarted.$queryRaw`SELECT 1`;
        break;
      } catch {
        if (Date.now() >= deadline)
          throw new Error("Owned restarted database did not become ready");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    expect(
      isDeepStrictEqual(
        await readRestoreFingerprint(restarted),
        run.fingerprint,
      ),
    ).toBe(true);
    await assertUnchangedSource();
  });
});
it("cleans an actually started source container when target allocation fails", async () => {
  let source: StartedPostgreSqlContainer | undefined;
  await expect(
    allocateRecoveryContainers(
      async () => {
        source = await startOwnedContainer("source");
        return source;
      },
      () => Promise.reject(new Error("Controlled target startup failure")),
    ),
  ).rejects.toThrow("Controlled target startup failure");
  if (!source) throw new Error("Partial source allocation must have occurred");
  await expect(source.exec(["pg_isready"])).rejects.toThrow();
});
