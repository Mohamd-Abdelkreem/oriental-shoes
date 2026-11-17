import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDatabaseClient, type DatabaseClient } from "@template/database";

type LegacyMode =
  | "PRE_P04_APPROVED"
  | "PRE_P04_RETURNED"
  | "PRE_P05_DOWNSTREAM_COUNTS"
  | "PRE_P05_QUALITY_SOURCE";
const databaseRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  "packages/database",
);
const execFileAsync = promisify(execFile);
const priorMigrations = [
  "20260818000000_init_authentication",
  "20261103000100_extend_staff_access_enums",
  "20261103000150_repair_legacy_verified_users",
  "20261103000200_staff_access_state_and_history",
  "20261104000100_enforce_staff_decision_transitions",
  "20261105000100_shared_customers_sales_drafts",
  "20261106000100_p03_extend_sales_catalog_enums",
  "20261106000200_p03_catalogs_submitted_orders",
  "20261106000300_p03_preserve_frozen_decoration_selection",
  "20261106000400_p04_approval_piece_issues",
] as const;

const runOwnedPrisma = async (
  uri: string,
  args: readonly string[],
): Promise<void> => {
  const pnpmScript = process.env["npm_execpath"];
  if (!pnpmScript) throw new Error("Prisma fixture requires the pnpm runner");
  try {
    await execFileAsync(
      process.execPath,
      [pnpmScript, "exec", "prisma", ...args],
      {
        cwd: databaseRoot,
        env: { ...process.env, DATABASE_URL: uri },
        timeout: 180_000,
        windowsHide: true,
      },
    );
  } catch {
    // Child process diagnostics may contain its connection URI.
    throw new Error(
      "Owned legacy fixture migration failed; no connection details disclosed",
    );
  }
};

const seedLegacy = async (
  database: DatabaseClient,
  mode: LegacyMode,
  rootVersion: number,
) => {
  const ownerId = randomUUID(),
    approvalActorId = randomUUID(),
    customerId = randomUUID(),
    sourceId = randomUUID(),
    entryId = randomUUID(),
    orderId = randomUUID();
  const count =
    mode === "PRE_P05_DOWNSTREAM_COUNTS"
      ? 3
      : mode === "PRE_P05_QUALITY_SOURCE"
        ? 2
        : 1;
  const pieceIds = Array.from({ length: count }, () => randomUUID());
  const occurredAt = new Date("2026-01-01T00:00:00Z");
  await database.$transaction(async (tx) => {
    for (const [id, name] of [
      [ownerId, "Legacy owner"],
      [approvalActorId, "Legacy approval actor"],
    ] as const) {
      await tx.user.create({
        data: {
          id,
          email: `${id}@example.test`,
          passwordHash: "synthetic-only",
          fullName: name,
          role: "ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: occurredAt,
        },
      });
    }
    await tx.customer.create({
      data: {
        id: customerId,
        name: "Legacy customer",
        phone: "+966500000001",
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
    await tx.catalogSource.create({
      data: {
        id: sourceId,
        sha256: sourceId.replaceAll("-", "").repeat(2),
        worksheet: "isolated historical fixture",
        sourceExtent: "A1:AA942",
        mappingVersion: 1,
        loadedAt: occurredAt,
        loadedByReference: "owned legacy fixture",
        entryCount: 1874,
        manifest: {},
      },
    });
    await tx.catalogEntry.create({
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
    await tx.salesDraft.create({
      data: {
        id: orderId,
        ownerId,
        customerId,
        type: "SHOP",
        status: "SUBMITTED",
        version: rootVersion,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
    for (const [index, pieceId] of pieceIds.entries()) {
      await tx.salesDraftPiece.create({
        data: {
          id: pieceId,
          draftId: orderId,
          position: index + 1,
          model: "SM",
          size: "40",
          leatherBase: "Base",
          decoration: "Decoration",
          face: "Face",
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      });
      await tx.salesPieceCatalogSelection.create({
        data: { pieceId, field: "decoration", entryId },
      });
    }
    // These are pre-P04 consumer shapes, never claimed as real employee actions.
    const returned = mode === "PRE_P04_RETURNED";
    await tx.$executeRaw`INSERT INTO sales_orders(id,status,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount,approved_at,current_return_decision_id,current_return_order_version,current_return_reason,current_returned_at)
      VALUES(${orderId}::uuid,${returned ? "RETURNED" : "APPROVED"}::sales_order_status,'SHOP-2026-0001',1,2026,${occurredAt},${ownerId}::uuid,'Legacy owner','Legacy customer','+966500000001',${sourceId}::uuid,${(mode === "PRE_P05_DOWNSTREAM_COUNTS" ? 2 : count) * 1800},100.50,
      ${returned ? null : occurredAt},${returned ? randomUUID() : null}::uuid,${returned ? 1 : null},${returned ? "Retained return reason" : null},${returned ? occurredAt : null})`;
    for (const [index, pieceId] of pieceIds.entries()) {
      const cancelled = mode === "PRE_P05_DOWNSTREAM_COUNTS" && index === 2;
      const warehouse = mode === "PRE_P05_DOWNSTREAM_COUNTS" && index === 0;
      const stage = returned
        ? "AWAITING_APPROVAL"
        : cancelled
          ? "CANCELLED"
          : warehouse
            ? "WAREHOUSE"
            : mode === "PRE_P05_QUALITY_SOURCE"
              ? "QUALITY"
              : "CUTTING";
      const state = cancelled
        ? "BLOCKED"
        : warehouse
          ? "COMPLETED"
          : mode === "PRE_P05_QUALITY_SOURCE" || mode === "PRE_P04_APPROVED"
            ? "IN_PROGRESS"
            : "INCOMING";
      await tx.$executeRaw`INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell,stage,work_state,received_at,cancelled_at,cancellation_reason)
        VALUES(${pieceId}::uuid,${orderId}::uuid,${entryId}::uuid,${sourceId}::uuid,'Decoration',1800.00,'AA3',${stage}::sales_piece_stage,${state}::sales_piece_work_state,${warehouse ? occurredAt : null},${cancelled ? occurredAt : null},${cancelled ? "Retained cancellation" : null})`;
    }
  });
  return {
    orderId,
    ownerId,
    approvalActorId,
    qualityActorId: mode === "PRE_P05_QUALITY_SOURCE" ? approvalActorId : null,
    pieceIds,
  };
};

export const createP05LegacyUpgradeFixture = async (
  mode: LegacyMode,
  rootVersion = 1,
): Promise<{
  database: DatabaseClient;
  orderId: string;
  ownerId: string;
  approvalActorId: string;
  qualityActorId: string | null;
  pieceIds: readonly string[];
  dispose(): Promise<void>;
}> => {
  if (
    !Number.isInteger(rootVersion) ||
    rootVersion < 1 ||
    rootVersion > 2147483647
  )
    throw new Error("Owned seed version must fit the positive int32 range");
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (
    process.env["NODE_ENV"] !== "test" ||
    !marker ||
    marker !== process.env["DATABASE_URL"]
  )
    throw new Error(
      "Legacy upgrade fixture requires the active owned test database",
    );
  const uri = new URL(marker),
    admin = createDatabaseClient(marker);
  const childName = "p05_legacy_" + randomUUID().replaceAll("-", "");
  let database: DatabaseClient | undefined;
  let created = false;
  const dispose = async () => {
    try {
      if (database) {
        await database.$disconnect();
        database = undefined;
      }
    } finally {
      try {
        if (created) {
          await admin.$executeRawUnsafe(`DROP DATABASE "${childName}"`);
          created = false;
        }
      } finally {
        await admin.$disconnect();
      }
    }
  };
  try {
    const [current] = await admin.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    if (current?.name !== decodeURIComponent(uri.pathname.slice(1)))
      throw new Error("Owned legacy fixture database mismatch");
    await admin.$executeRawUnsafe(`CREATE DATABASE "${childName}"`);
    created = true;
    uri.pathname = "/" + childName;
    const childUri = uri.toString();
    database = createDatabaseClient(childUri);
    let seeded: Awaited<ReturnType<typeof seedLegacy>> | undefined;
    for (const name of priorMigrations) {
      await runOwnedPrisma(childUri, [
        "db",
        "execute",
        "--file",
        resolve(databaseRoot, "prisma/migrations", name, "migration.sql"),
      ]);
      await runOwnedPrisma(childUri, ["migrate", "resolve", "--applied", name]);
      if (name === "20261106000300_p03_preserve_frozen_decoration_selection")
        seeded = await seedLegacy(database, mode, rootVersion);
    }
    if (mode === "PRE_P05_QUALITY_SOURCE") {
      // This fixture proves the historical P05 seam, before P06 owns quality visits.
      const boundary = "20261111000100_p05_manufacturing_workspaces";
      await runOwnedPrisma(childUri, [
        "db",
        "execute",
        "--file",
        resolve(databaseRoot, "prisma/migrations", boundary, "migration.sql"),
      ]);
      await runOwnedPrisma(childUri, [
        "migrate",
        "resolve",
        "--applied",
        boundary,
      ]);
      const [cutoff] = await database.$queryRaw<
        Array<{ latest: string | null; quality: string | null }>
      >`SELECT (SELECT max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS latest, to_regclass('quality_commands')::text AS quality`;
      if (cutoff?.latest !== boundary || cutoff.quality !== null)
        throw new Error(
          "Historical quality-source fixture must end exactly at P05",
        );
    } else {
      await runOwnedPrisma(childUri, ["migrate", "deploy"]);
    }
    if (!seeded) throw new Error("Legacy fixture seed was not produced");
    return { database, ...seeded, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};
