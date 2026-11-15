import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDatabaseClient, type DatabaseClient } from "@template/database";

type Profile = "SPARSE" | "RETAINED_COUNTS" | "CANCELLED_RECEIPT";
type LegacyFixtureContext = Readonly<{
  database: DatabaseClient;
  actorId: string;
  orderIds: string[];
  selected: { orderId: string; pieceId: string }[];
}>;
const databaseRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  "packages/database",
);
const execFileAsync = promisify(execFile);
const runOwnedPrisma = async (uri: string, args: readonly string[]) => {
  const runner = process.env["npm_execpath"];
  if (!runner) throw new Error("Owned fixture requires the pnpm runner");
  try {
    await execFileAsync(process.execPath, [runner, "exec", "prisma", ...args], {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: uri },
      timeout: 180000,
    });
  } catch {
    throw new Error(
      "Owned P07 fixture migration failed; connection details withheld",
    );
  }
};

export const createP07LegacyUpgradeFixture = async (
  profile: Profile,
  beforeUpgrade?: (context: LegacyFixtureContext) => Promise<void>,
): Promise<LegacyFixtureContext & { dispose(): Promise<void> }> => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (
    process.env["NODE_ENV"] !== "test" ||
    !marker ||
    marker !== process.env["DATABASE_URL"]
  )
    throw new Error("Active owned test database required");
  const admin = createDatabaseClient(marker),
    uri = new URL(marker),
    childName = "p07_fixture_" + randomUUID().replaceAll("-", ""),
    directory = await mkdtemp(join(tmpdir(), "p07-fixture-"));
  let database: DatabaseClient | undefined,
    created = false;
  const dispose = async () => {
    try {
      if (database) {
        await database.$disconnect();
        database = undefined;
      }
    } finally {
      try {
        if (created) {
          await admin.$executeRawUnsafe('DROP DATABASE "' + childName + '"');
          created = false;
        }
      } finally {
        await admin.$disconnect();
        await rm(directory, { recursive: true, force: true });
      }
    }
  };
  try {
    const [current] = await admin.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    if (current?.name !== decodeURIComponent(uri.pathname.slice(1)))
      throw new Error("Owned fixture database mismatch");
    await admin.$executeRawUnsafe('CREATE DATABASE "' + childName + '"');
    created = true;
    uri.pathname = "/" + childName;
    const childUri = uri.toString();
    database = createDatabaseClient(childUri);
    const actorId = randomUUID(),
      customerId = randomUUID(),
      sourceId = randomUUID(),
      entryId = randomUUID();
    const selected: { orderId: string; pieceId: string }[] = [],
      orderIds: string[] = [];
    const cutoff = "20261106000400_p04_approval_piece_issues";
    for (const name of (
      await readdir(resolve(databaseRoot, "prisma/migrations"))
    )
      .filter((name) => name.startsWith("20") && name <= cutoff)
      .sort()) {
      await runOwnedPrisma(childUri, [
        "db",
        "execute",
        "--file",
        resolve(databaseRoot, "prisma/migrations", name, "migration.sql"),
      ]);
      await runOwnedPrisma(childUri, ["migrate", "resolve", "--applied", name]);
      if (name === "20261106000300_p03_preserve_frozen_decoration_selection") {
        await database.user.create({
          data: {
            id: actorId,
            email: actorId + "@example.test",
            fullName: "P07 legacy fixture admin",
            passwordHash: "synthetic-only",
            role: "ADMIN",
            status: "ACTIVE",
            emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
          },
        });
        await database.customer.create({
          data: {
            id: customerId,
            name: "Legacy customer",
            phone: "+966500000001",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        });
        await database.catalogSource.create({
          data: {
            id: sourceId,
            sha256: sourceId.replaceAll("-", "").repeat(2),
            worksheet: "Owned pre-P04 snapshot",
            sourceExtent: "A1:AA942",
            mappingVersion: 1,
            loadedAt: new Date("2026-01-01T00:00:00Z"),
            loadedByReference: "owned fixture",
            entryCount: 1874,
            manifest: {},
          },
        });
        await database.catalogEntry.create({
          data: {
            id: entryId,
            sourceId,
            kind: "decoration",
            sourceCell: "Z3",
            displayValue: "Decoration",
            lookupValue: "decoration",
            position: 1,
            unitPrice: "1800.00",
            priceSourceCell: "AA3",
          },
        });
        // Explicit historical snapshots, before P04, never fabricated Quality commands or employee actions.
        // Values interpolated into this owned SQL file are generated UUIDs and fixed profile constants only.
        const stage =
          profile === "CANCELLED_RECEIPT"
            ? "'CANCELLED'"
            : profile === "SPARSE"
              ? "CASE WHEN specification.position=1 THEN 'QUALITY' ELSE 'CUTTING' END"
              : "CASE WHEN specification.position<200 THEN 'WAREHOUSE' ELSE 'CUTTING' END";
        const state =
          profile === "CANCELLED_RECEIPT"
            ? "'BLOCKED'"
            : profile === "SPARSE"
              ? "'INCOMING'"
              : "CASE WHEN specification.position<200 THEN 'COMPLETED' ELSE 'INCOMING' END";
        const received =
          profile === "CANCELLED_RECEIPT"
            ? "'2026-01-01T00:00:00Z'::timestamptz"
            : profile === "SPARSE"
              ? "NULL"
              : "CASE WHEN specification.position<200 THEN '2026-01-01T00:00:00Z'::timestamptz ELSE NULL END";
        const sql = `BEGIN;
          INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at)
          SELECT gen_random_uuid(),'${actorId}','${customerId}','SHOP','SUBMITTED','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z' FROM generate_series(1,${profile === "SPARSE" ? "200" : "1"});
          INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at)
          SELECT gen_random_uuid(),d.id,n,'SM','40','Base','Decoration','Face','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z' FROM sales_drafts d CROSS JOIN generate_series(1,200) n;
          INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) SELECT id,'decoration','${entryId}' FROM sales_draft_pieces;
          INSERT INTO sales_orders(id,status,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount,approved_at)
          SELECT id,'${profile === "CANCELLED_RECEIPT" ? "CANCELLED" : "APPROVED"}','SHOP-2026-'||lpad((row_number() OVER(ORDER BY id))::text,4,'0'),row_number() OVER(ORDER BY id),2026,'2026-01-01T00:00:00Z','${actorId}','P07 legacy fixture admin','Legacy customer','+966500000001','${sourceId}',${profile === "CANCELLED_RECEIPT" ? "0.00" : "360000.00"},100.50,'2026-01-01T00:00:00Z' FROM sales_drafts;
          INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell,stage,work_state,received_at,cancelled_at,cancellation_reason)
          SELECT specification.id,specification.draft_id,'${entryId}','${sourceId}','Decoration',1800.00,'AA3',(${stage})::sales_piece_stage,(${state})::sales_piece_work_state,${received},${profile === "CANCELLED_RECEIPT" ? "'2026-01-02T00:00:00Z'::timestamptz" : "NULL"},${profile === "CANCELLED_RECEIPT" ? "'Retained legacy cancellation'" : "NULL"} FROM sales_draft_pieces specification;
          COMMIT;`;
        const file = join(directory, "historical-snapshot.sql");
        await writeFile(file, sql);
        await runOwnedPrisma(childUri, ["db", "execute", "--file", file]);
        selected.push(
          ...(await database.salesDraftPiece
            .findMany({
              where: { position: 1 },
              select: { draftId: true, id: true },
              orderBy: { draftId: "asc" },
            })
            .then((rows) =>
              rows.map((row) => ({ orderId: row.draftId, pieceId: row.id })),
            )),
        );
        orderIds.push(...selected.map((row) => row.orderId));
      }
    }
    const context = { database, actorId, orderIds, selected };
    if (beforeUpgrade) await beforeUpgrade(context);
    await runOwnedPrisma(childUri, ["migrate", "deploy"]);
    return { ...context, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};
