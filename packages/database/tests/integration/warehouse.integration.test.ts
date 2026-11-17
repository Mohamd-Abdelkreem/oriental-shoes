import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import {
  administrationCommandFactsSchema,
  administrationCommandDataSchema,
  type AdministrationCommandFacts,
} from "@template/contracts";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

let pool: Pool | undefined;
const ownedPool = (): Pool => {
  if (pool === undefined) throw new Error("Owned migrated pool is unavailable");
  return pool;
};
beforeAll(async () => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (
    process.env["NODE_ENV"] !== "test" ||
    !marker ||
    marker !== process.env["DATABASE_URL"]
  )
    throw new Error("Owned migrated database required");
  pool = new Pool({ connectionString: marker });
  const selected = await ownedPool().query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  expect(selected.rows[0]?.name).toBe(
    decodeURIComponent(new URL(marker).pathname.slice(1)),
  );
});
afterAll(async () => {
  await pool?.end();
});
it("installs eight retained warehouse tables and deferrable composite acceptance/receipt bindings", async () => {
  const tables = await ownedPool().query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'warehouse_%' ORDER BY table_name",
  );
  expect(tables.rows.map((row) => row.table_name)).toEqual([
    "warehouse_command_orders",
    "warehouse_commands",
    "warehouse_delivery_attempt_members",
    "warehouse_delivery_attempts",
    "warehouse_delivery_outcomes",
    "warehouse_delivery_retries",
    "warehouse_receipt_groups",
    "warehouse_receipt_pieces",
  ]);
  const constraints = await ownedPool().query<{
    conname: string;
    condeferrable: boolean;
    condeferred: boolean;
  }>(
    "SELECT conname,condeferrable,condeferred FROM pg_constraint WHERE conrelid='warehouse_receipt_pieces'::regclass AND contype='f' ORDER BY conname",
  );
  expect(constraints.rows).toHaveLength(3);
  expect(
    constraints.rows.every(
      (constraint) => constraint.condeferrable && constraint.condeferred,
    ),
  ).toBe(true);
});
it("rejects runtime legacy insertion before accepting any invented receipt provenance", async () => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    await expect(
      client.query(
        "INSERT INTO warehouse_receipt_pieces(piece_id,order_id,origin,received_at) VALUES($1,$2,'LEGACY_BASELINE',now())",
        [randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_warehouse_retained",
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
const insertParent = async (client: PoolClient, commandId: string) => {
  const actorId = randomUUID();
  await client.query(
    "INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at) VALUES($1,$2,'test-only','Warehouse admin','ADMIN','ACTIVE',now(),now(),now())",
    [actorId, actorId + "@example.test"],
  );
  await client.query(
    "INSERT INTO warehouse_commands(command_id,operation,actor_id,actor_full_name,actor_role,actor_department,payload_hash,occurred_at,outcome) VALUES($1,'RECEIVE',$2,'Warehouse admin','ADMIN',NULL,$3,now(),'{\"orders\":[]}')",
    [commandId, actorId, "a".repeat(64)],
  );
};
it("rejects committing an orphan parent rather than accepting a fixture success", async () => {
  const client = await ownedPool().connect();
  const commandId = randomUUID();
  try {
    await client.query("BEGIN");
    await insertParent(client, commandId);
    await expect(client.query("COMMIT")).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_warehouse_command_shape",
    });
    await client.query("ROLLBACK");
    const retained = await client.query(
      "SELECT command_id FROM warehouse_commands WHERE command_id=$1",
      [commandId],
    );
    expect(retained.rows).toEqual([]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it.each([
  "UPDATE warehouse_commands SET payload_hash=repeat('b',64) WHERE command_id=$1",
  "DELETE FROM warehouse_commands WHERE command_id=$1",
])("rejects retained parent mutation %s", async (statement) => {
  const client = await ownedPool().connect();
  const commandId = randomUUID();
  try {
    await client.query("BEGIN");
    await insertParent(client, commandId);
    await expect(client.query(statement, [commandId])).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_warehouse_retained",
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

type UpgradeKind =
  | "COMPLETE"
  | "PARTIAL"
  | "INCOMING"
  | "QUALITY"
  | "CANCELLED"
  | "OUTBOUND"
  | "INVALID_READY";
type UpgradeFixture = {
  orderId: string;
  actorId: string;
  pieceIds: string[];
  kind: UpgradeKind;
};
const baselineAt = "2026-11-10T08:00:00Z";
const receiptAt = "2026-11-10T10:00:00Z";
const p07Migration = "20261113000100_p07_warehouse_receipt_delivery";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsRoot = resolve(packageRoot, "prisma/migrations");
const readMigration = (name: string): string =>
  readFileSync(resolve(migrationsRoot, name, "migration.sql"), "utf8");
const execFileAsync = promisify(execFile);
const runChildPrisma = async (
  uri: string,
  args: readonly string[],
): Promise<void> => {
  const runner = process.env["npm_execpath"];
  if (!runner) throw new Error("Owned upgrade requires pnpm invocation");
  try {
    await execFileAsync(process.execPath, [runner, "exec", "prisma", ...args], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: uri },
      timeout: 180000,
    });
  } catch {
    throw new Error(
      "Owned upgrade Prisma command failed; connection details withheld",
    );
  }
};
const seedUpgradeOrder = async (
  client: PoolClient,
  kind: UpgradeKind,
): Promise<UpgradeFixture> => {
  const orderId = randomUUID(),
    actorId = randomUUID(),
    customerId = randomUUID(),
    sourceId = randomUUID(),
    entryId = randomUUID();
  const pieceIds = [randomUUID(), randomUUID()].sort();
  const sequence = BigInt(
    "0x" + orderId.replaceAll("-", "").slice(0, 12),
  ).toString();
  const status =
    kind === "CANCELLED"
      ? "CANCELLED"
      : kind === "OUTBOUND"
        ? "OUT_FOR_DELIVERY"
        : kind === "INVALID_READY"
          ? "READY_FOR_DELIVERY"
          : "APPROVED";
  const phone =
    "+96650000000" +
    (
      [
        "COMPLETE",
        "PARTIAL",
        "INCOMING",
        "QUALITY",
        "CANCELLED",
        "OUTBOUND",
        "INVALID_READY",
      ].indexOf(kind) + 1
    ).toString();
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at) VALUES($1,$2,'test-only','Upgrade admin','ADMIN','ACTIVE',$3,$3,$3)",
    [actorId, actorId + "@example.test", baselineAt],
  );
  await client.query(
    "INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES($1,'Upgrade customer',$3,$2,$2)",
    [customerId, baselineAt, phone],
  );
  await client.query(
    "INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest) VALUES($1,$2,'Synthetic','A1:AA942',1,$3,'owned upgrade',1874,'{}')",
    [sourceId, sourceId.replaceAll("-", "").repeat(2), baselineAt],
  );
  await client.query(
    "INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES($1,$2,'decoration','Z3','Decoration','decoration',1,1800,'AA3')",
    [entryId, sourceId],
  );
  await client.query(
    "INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at) VALUES($1,$2,$3,'SHOP','SUBMITTED',$4,$4)",
    [orderId, actorId, customerId, baselineAt],
  );
  await client.query(
    "INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at) SELECT id,$2,position::int,'SM','40','Base','Decoration','Face',$3,$3 FROM unnest($1::uuid[]) WITH ORDINALITY p(id,position)",
    [pieceIds, orderId, baselineAt],
  );
  await client.query(
    "INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) SELECT id,'decoration',$2 FROM unnest($1::uuid[]) p(id)",
    [pieceIds, entryId],
  );
  await client.query(
    "INSERT INTO sales_orders(id,status,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount,approved_at) VALUES($1,$2::sales_order_status,$3,$4,2026,$5,$6,'Upgrade admin','Upgrade customer',$9,$7,$8,100.50,$5)",
    [
      orderId,
      status,
      "SHOP-2026-" + sequence.padStart(4, "0"),
      sequence,
      baselineAt,
      actorId,
      sourceId,
      kind === "CANCELLED" ? 0 : 3600,
      phone,
    ],
  );
  for (const [index, pieceId] of pieceIds.entries()) {
    const received =
      kind === "COMPLETE" ||
      kind === "OUTBOUND" ||
      (kind === "PARTIAL" && index === 0);
    await client.query(
      "INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell,stage,work_state,received_at,cancelled_at,cancellation_reason) VALUES($1,$2,$3,$4,'Decoration',1800,'AA3',$5::sales_piece_stage,$6::sales_piece_work_state,$7,$8,$9)",
      [
        pieceId,
        orderId,
        entryId,
        sourceId,
        kind === "QUALITY"
          ? "QUALITY"
          : kind === "CANCELLED"
            ? "CANCELLED"
            : "WAREHOUSE",
        kind === "QUALITY"
          ? "IN_PROGRESS"
          : received
            ? "COMPLETED"
            : "INCOMING",
        received ? receiptAt : null,
        kind === "CANCELLED" ? receiptAt : null,
        kind === "CANCELLED" ? "Legacy cancellation" : null,
      ],
    );
  }
  await client.query("COMMIT");
  return { orderId, actorId, pieceIds, kind };
};
const withPreP07 = async (
  kinds: readonly UpgradeKind[],
  verify: (
    client: PoolClient,
    uri: string,
    fixtures: UpgradeFixture[],
  ) => Promise<void>,
): Promise<void> => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (!marker || marker !== process.env["DATABASE_URL"])
    throw new Error("Owned upgrade marker required");
  const name = "p07_upgrade_" + randomUUID().replaceAll("-", "");
  await ownedPool().query('CREATE DATABASE "' + name + '"');
  const uri = new URL(marker);
  uri.pathname = "/" + name;
  const childPool = new Pool({ connectionString: uri.toString() });
  try {
    const client = await childPool.connect();
    try {
      const fixtures: UpgradeFixture[] = [];
      for (const migration of readdirSync(migrationsRoot)
        .filter((name) => name.startsWith("20") && name < p07Migration)
        .sort()) {
        if (migration === "20261106000400_p04_approval_piece_issues")
          for (const kind of kinds)
            fixtures.push(await seedUpgradeOrder(client, kind));
        await client.query(readMigration(migration));
        await runChildPrisma(uri.toString(), [
          "migrate",
          "resolve",
          "--applied",
          migration,
        ]);
      }
      await verify(client, uri.toString(), fixtures);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } finally {
    await childPool.end();
    await ownedPool().query('DROP DATABASE "' + name + '"');
  }
};
const upgradeSnapshot = async (client: PoolClient): Promise<unknown> =>
  (
    await client.query<{ graph: unknown }>(
      "SELECT jsonb_build_object('roots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_drafts t),'headers',(SELECT jsonb_agg(to_jsonb(t)-'status' ORDER BY id) FROM sales_orders t),'pieces',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_order_pieces t),'quality',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY command_id),'[]') FROM quality_commands t),'packing',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM quality_packing_groups t)) AS graph",
    )
  ).rows[0]?.graph;
it("upgrades known complete/partial receipt and unwitnessed incoming honestly without altering prior facts or the old ledger", async () => {
  await withPreP07(
    ["COMPLETE", "PARTIAL", "INCOMING", "QUALITY", "CANCELLED"],
    async (client, uri, fixtures) => {
      const before = await upgradeSnapshot(client);
      const ledger = (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows;
      await runChildPrisma(uri, ["migrate", "deploy"]);
      expect(await upgradeSnapshot(client)).toEqual(before);
      expect(
        (
          await client.query(
            "SELECT * FROM _prisma_migrations WHERE migration_name<$1 ORDER BY migration_name",
            [p07Migration],
          )
        ).rows,
      ).toEqual(ledger);
      const complete = fixtures.find((fixture) => fixture.kind === "COMPLETE");
      if (!complete) throw new Error("Complete fixture required");
      expect(
        (
          await client.query("SELECT status FROM sales_orders WHERE id=$1", [
            complete.orderId,
          ])
        ).rows,
      ).toEqual([{ status: "READY_FOR_DELIVERY" }]);
      const receipts = await client.query(
        "SELECT origin,group_id,quality_event_id,received_at FROM warehouse_receipt_pieces ORDER BY piece_id",
      );
      expect(receipts.rows).toHaveLength(3);
      for (const receipt of receipts.rows)
        expect(receipt).toEqual({
          origin: "LEGACY_BASELINE",
          group_id: null,
          quality_event_id: null,
          received_at: new Date(receiptAt),
        });
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS total FROM warehouse_commands",
          )
        ).rows,
      ).toEqual([{ total: 0 }]);
      const applied = (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows;
      await runChildPrisma(uri, ["migrate", "deploy"]);
      expect(
        (
          await client.query(
            "SELECT * FROM _prisma_migrations ORDER BY migration_name",
          )
        ).rows,
      ).toEqual(applied);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS total FROM warehouse_receipt_pieces",
          )
        ).rows,
      ).toEqual([{ total: 3 }]);
    },
  );
});
it.each([
  ["OUTBOUND", "ck_warehouse_upgrade_provenance"],
  ["INVALID_READY", "ck_warehouse_upgrade_receipt"],
] as const)(
  "refuses %s upgrade transactionally without fabricating evidence",
  async (kind, constraint) => {
    await withPreP07([kind], async (client) => {
      const before = await upgradeSnapshot(client);
      await expect(
        client.query(readMigration(p07Migration)),
      ).rejects.toMatchObject({ code: "23514", constraint });
      await client.query("ROLLBACK");
      expect(await upgradeSnapshot(client)).toEqual(before);
      expect(
        (await client.query("SELECT to_regclass('warehouse_commands') AS name"))
          .rows,
      ).toEqual([{ name: null }]);
    });
  },
);

const inspectUpgradeFixture = async (
  client: PoolClient,
  fixture: UpgradeFixture,
) => {
  const commandId = randomUUID(),
    eventId = randomUUID(),
    packingId = randomUUID();
  const time = "2026-11-11T10:00:00Z";
  const acceptedPieceId = fixture.pieceIds[0],
    rejectedPieceId = fixture.pieceIds[1];
  if (!acceptedPieceId || !rejectedPieceId)
    throw new Error("Two physical pieces required");
  const outcomes: Array<{
    pieceId: string;
    visitId: string;
    decision: "ACCEPT" | "REJECT";
    stage: "WAREHOUSE" | "CUTTING";
    workState: "INCOMING";
    correctionId: string | null;
    issueId: null;
  }> = [];
  let acceptedEventId = "";
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO quality_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids,inspector_note) VALUES($1,$2,$3,1,2,$4,'  Original note  ')",
    [commandId, fixture.orderId, eventId, fixture.pieceIds],
  );
  for (const pieceId of fixture.pieceIds) {
    const accepted = pieceId === acceptedPieceId;
    const visit = (
      await client.query<{ id: string }>(
        "SELECT id FROM quality_work_visits WHERE piece_id=$1 AND ended_at IS NULL",
        [pieceId],
      )
    ).rows[0];
    if (!visit) throw new Error("Actual Quality visit required");
    const pieceEventId = randomUUID(),
      correctionId = accepted ? null : randomUUID(),
      stage = accepted ? "WAREHOUSE" : "CUTTING";
    if (accepted) acceptedEventId = pieceEventId;
    await client.query(
      "INSERT INTO quality_piece_events(id,command_id,order_id,piece_id,visit_id,decision,correction_id,before_stage,before_work_state,after_stage,after_work_state) VALUES($1,$2,$3,$4,$5,$6::quality_decision,$7,'QUALITY','IN_PROGRESS',$8::sales_piece_stage,'INCOMING')",
      [
        pieceEventId,
        commandId,
        fixture.orderId,
        pieceId,
        visit.id,
        accepted ? "ACCEPT" : "REJECT",
        correctionId,
        stage,
      ],
    );
    await client.query(
      "UPDATE quality_work_visits SET ended_at=$2,end_reason=$3::quality_visit_end,end_quality_event_id=$4 WHERE id=$1",
      [
        visit.id,
        time,
        accepted ? "INSPECT_ACCEPTED" : "INSPECT_REJECTED",
        pieceEventId,
      ],
    );
    let manufacturingVisitId: string | null = null;
    if (correctionId) {
      manufacturingVisitId = randomUUID();
      await client.query(
        "INSERT INTO quality_correction_cycles(id,order_id,piece_id,cycle,rejection_event_id,target,reason,instructions,state) VALUES($1,$2,$3,1,$4,'CUTTING','Bond mismatch','Rebond','OPEN')",
        [correctionId, fixture.orderId, pieceId, pieceEventId],
      );
      await client.query(
        "INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_reference_id,source_correction_cycle,source_order_version,instructions,entered_at) VALUES($1,$2,$3,'CUTTING',1,'QUALITY_CORRECTION','QUALITY',$4,1,2,'Rebond',$5)",
        [manufacturingVisitId, fixture.orderId, pieceId, correctionId, time],
      );
    }
    await client.query(
      "UPDATE sales_order_pieces SET stage=$2::sales_piece_stage,work_state='INCOMING',current_work_visit_id=$3 WHERE id=$1",
      [pieceId, stage, manufacturingVisitId],
    );
    outcomes.push({
      pieceId,
      visitId: visit.id,
      decision: accepted ? "ACCEPT" : "REJECT",
      stage,
      workState: "INCOMING",
      correctionId,
      issueId: null,
    });
  }
  await client.query(
    "INSERT INTO quality_packing_groups(id,command_id,order_id,carton_count,carton_numbers) VALUES($1,$2,$3,' 2 ','C-01')",
    [packingId, commandId, fixture.orderId],
  );
  await client.query(
    "INSERT INTO quality_packing_pieces(group_id,command_id,order_id,piece_id) VALUES($1,$2,$3,$4)",
    [packingId, commandId, fixture.orderId, acceptedPieceId],
  );
  await client.query(
    "INSERT INTO quality_commands(command_id,operation,actor_id,actor_full_name,actor_role,payload_hash,outcome,occurred_at) VALUES($1,'INSPECT',$2,'Upgrade admin','ADMIN',repeat('a',64),$3,$4)",
    [
      commandId,
      fixture.actorId,
      JSON.stringify({
        orders: [
          {
            eventId,
            orderId: fixture.orderId,
            beforeVersion: 1,
            afterVersion: 2,
            pieces: outcomes,
            packingGroupId: packingId,
          },
        ],
      }),
      time,
    ],
  );
  await client.query("UPDATE sales_drafts SET version=2 WHERE id=$1", [
    fixture.orderId,
  ]);
  await client.query("COMMIT");
  return { acceptedPieceId, rejectedPieceId, acceptedEventId, packingId };
};
const receiveUpgradePiece = async (
  client: PoolClient,
  fixture: UpgradeFixture,
  source: { acceptedPieceId: string; acceptedEventId: string },
) => {
  const commandId = randomUUID(),
    eventId = randomUUID(),
    groupId = randomUUID(),
    time = "2026-11-12T10:00:00Z";
  const group = {
    eventId,
    orderId: fixture.orderId,
    beforeVersion: 2,
    afterVersion: 3,
    status: "APPROVED",
    pieceIds: [source.acceptedPieceId],
    receiptGroupId: groupId,
    attemptId: null,
    retryId: null,
  };
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO warehouse_commands(command_id,operation,actor_id,actor_full_name,actor_role,payload_hash,occurred_at,outcome) VALUES($1,'RECEIVE',$2,'Upgrade admin','ADMIN',repeat('b',64),$3,$4)",
    [commandId, fixture.actorId, time, JSON.stringify({ orders: [group] })],
  );
  await client.query(
    "INSERT INTO warehouse_command_orders(command_id,order_id,event_id,before_version,after_version,before_status,after_status,piece_ids) VALUES($1,$2,$3,2,3,'APPROVED','APPROVED',$4)",
    [commandId, fixture.orderId, eventId, [source.acceptedPieceId]],
  );
  await client.query(
    "INSERT INTO warehouse_receipt_groups(id,command_id,order_id,carton_count,storage_location,notes) VALUES($1,$2,$3,' 1 ','Shelf B-12','Keep dry')",
    [groupId, commandId, fixture.orderId],
  );
  await client.query(
    "INSERT INTO warehouse_receipt_pieces(piece_id,order_id,origin,group_id,quality_event_id,received_at) VALUES($1,$2,'COMMAND',$3,$4,$5)",
    [
      source.acceptedPieceId,
      fixture.orderId,
      groupId,
      source.acceptedEventId,
      time,
    ],
  );
  await client.query(
    "UPDATE sales_order_pieces SET work_state='COMPLETED',received_at=$2 WHERE id=$1",
    [source.acceptedPieceId, time],
  );
  await client.query(
    "UPDATE sales_drafts SET version=3,updated_at=$2 WHERE id=$1",
    [fixture.orderId, time],
  );
  await client.query("COMMIT");
  return { commandId, groupId, time };
};
const rejectedUpgradeChange = async (
  client: PoolClient,
  change: () => Promise<unknown>,
  failure: { code: string; constraint?: string },
) => {
  const before = await upgradeSnapshot(client);
  await client.query("BEGIN");
  try {
    await expect(
      (async () => {
        await change();
        await client.query("COMMIT");
      })(),
    ).rejects.toMatchObject(failure);
  } finally {
    await client.query("ROLLBACK");
  }
  expect(await upgradeSnapshot(client)).toEqual(before);
};
it("preserves actual accepted packing/correction evidence across upgrade and rejects duplicate, forged, foreign and late receipt mutations", async () => {
  await withPreP07(["QUALITY"], async (client, uri, fixtures) => {
    const fixture = fixtures[0];
    if (!fixture) throw new Error("Quality fixture required");
    const source = await inspectUpgradeFixture(client, fixture);
    const before = await upgradeSnapshot(client);
    await runChildPrisma(uri, ["migrate", "deploy"]);
    expect(await upgradeSnapshot(client)).toEqual(before);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS total FROM warehouse_receipt_pieces",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
    const arrival = await receiveUpgradePiece(client, fixture, source);
    expect(
      (
        await client.query(
          "SELECT received_at,work_state FROM sales_order_pieces WHERE id=$1",
          [source.acceptedPieceId],
        )
      ).rows,
    ).toEqual([
      { received_at: new Date(arrival.time), work_state: "COMPLETED" },
    ]);
    const packing = (
      await client.query(
        "SELECT carton_count,carton_numbers FROM quality_packing_groups WHERE id=$1",
        [source.packingId],
      )
    ).rows;
    expect(packing).toEqual([{ carton_count: " 2 ", carton_numbers: "C-01" }]);
    expect(
      (
        await client.query(
          "SELECT state FROM quality_correction_cycles WHERE piece_id=$1",
          [source.rejectedPieceId],
        )
      ).rows,
    ).toEqual([{ state: "OPEN" }]);
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "INSERT INTO warehouse_receipt_pieces SELECT * FROM warehouse_receipt_pieces WHERE piece_id=$1",
          [source.acceptedPieceId],
        ),
      { code: "23505" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "INSERT INTO warehouse_receipt_pieces(piece_id,order_id,origin,group_id,quality_event_id,received_at) VALUES($1,$2,'COMMAND',$3,$4,$5)",
          [
            source.rejectedPieceId,
            fixture.orderId,
            arrival.groupId,
            source.acceptedEventId,
            arrival.time,
          ],
        ),
      { code: "23514", constraint: "ck_warehouse_receipt_binding" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "INSERT INTO warehouse_receipt_pieces(piece_id,order_id,origin,group_id,quality_event_id,received_at) VALUES($1,$2,'COMMAND',$3,$4,$5)",
          [
            source.rejectedPieceId,
            randomUUID(),
            arrival.groupId,
            source.acceptedEventId,
            arrival.time,
          ],
        ),
      { code: "23514", constraint: "ck_warehouse_command_shape" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "INSERT INTO warehouse_command_orders(command_id,order_id,event_id,before_version,after_version,before_status,after_status,piece_ids) VALUES($1,$2,$3,3,4,'APPROVED','APPROVED',$4)",
          [arrival.commandId, randomUUID(), randomUUID(), [randomUUID()]],
        ),
      { code: "23514", constraint: "ck_warehouse_command_shape" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "UPDATE warehouse_receipt_groups SET notes='Changed' WHERE id=$1",
          [arrival.groupId],
        ),
      { code: "23514", constraint: "ck_warehouse_retained" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "UPDATE sales_order_pieces SET received_at='2026-11-13T10:00:00Z' WHERE id=$1",
          [source.acceptedPieceId],
        ),
      { code: "23514", constraint: "ck_manufacturing_event_binding" },
    );
    await rejectedUpgradeChange(
      client,
      () =>
        client.query(
          "UPDATE sales_orders SET status='READY_FOR_DELIVERY' WHERE id=$1",
          [fixture.orderId],
        ),
      { code: "23514", constraint: "ck_warehouse_order_state" },
    );
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS total FROM warehouse_receipt_pieces",
        )
      ).rows,
    ).toEqual([{ total: 1 }]);
  });
});

const readFacts = async (
  client: PoolClient,
  orderId: string,
): Promise<AdministrationCommandFacts> => {
  const rows = await client.query<{ facts: unknown }>(
    `
    SELECT jsonb_build_object('version',d.version,'status',h.status,
      'counts',jsonb_build_object('original',stats.original,'cancelled',stats.cancelled,'active',stats.active,'received',stats.received,
        'completionPercent',CASE WHEN stats.active=0 THEN 0 WHEN stats.received=stats.active THEN 100 ELSE least(99,round(stats.received::numeric*100/stats.active)) END),
      'money',jsonb_build_object('total',to_char(h.total_amount,'FM999999999999990.00'),'paidAmount',to_char(h.paid_amount,'FM999999999999990.00'),'remainingDue',to_char(greatest(h.total_amount-h.paid_amount,0),'FM999999999999990.00'),'surplus',to_char(greatest(h.paid_amount-h.total_amount,0),'FM999999999999990.00')),
      'correction',jsonb_build_object('generalNotes',d.general_notes,'customerName',COALESCE(c.customer_name,h.customer_name),'customerPhone',COALESCE(c.customer_phone,h.customer_phone),
        'customerEmail',CASE WHEN c.command_id IS NULL THEN h.customer_email ELSE c.customer_email END,'customerAddress',CASE WHEN c.command_id IS NULL THEN h.customer_address ELSE c.customer_address END),
      'pieces',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'stage',p.stage,'workState',p.work_state,'issueId',p.issue_id,'currentWorkVisitId',p.current_work_visit_id,
        'receivedAt',to_char(p.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cancelledAt',to_char(p.cancelled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cancellationReason',p.cancellation_reason) ORDER BY p.id) FROM sales_order_pieces p WHERE p.order_id=h.id),
      'returnProof',CASE WHEN h.status='RETURNED' THEN jsonb_build_object('decisionId',h.current_return_decision_id,'reason',h.current_return_reason,'returnedAt',to_char(h.current_returned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'version',h.current_return_order_version) ELSE NULL END) AS facts
    FROM sales_drafts d JOIN sales_orders h ON h.id=d.id
    CROSS JOIN LATERAL (SELECT count(*)::int original,count(*) FILTER(WHERE stage='CANCELLED')::int cancelled,count(*) FILTER(WHERE stage<>'CANCELLED')::int active,count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL)::int received FROM sales_order_pieces WHERE order_id=h.id) stats
    LEFT JOIN LATERAL (SELECT * FROM administration_order_corrections WHERE order_id=d.id AND after_version<=d.version ORDER BY after_version DESC,command_id DESC LIMIT 1) c ON true WHERE d.id=$1`,
    [orderId],
  );
  return administrationCommandFactsSchema.parse(rows.rows[0]?.facts);
};

const warehouseAction = async (
  client: PoolClient,
  fixture: UpgradeFixture,
  operation:
    "DISPATCH" | "FAIL_DELIVERY" | "RETRY_DELIVERY" | "CONFIRM_DELIVERY",
  pieceIds: readonly string[],
) => {
  const before = (
    await client.query<{ version: number; status: string }>(
      "SELECT d.version,h.status FROM sales_drafts d JOIN sales_orders h ON h.id=d.id WHERE d.id=$1",
      [fixture.orderId],
    )
  ).rows[0];
  if (!before) throw new Error("Expected current warehouse order");
  const commandId = randomUUID(),
    eventId = randomUUID();
  const latest = (
    await client.query<{
      id: string;
      number: number;
      retry_id: string | null;
      outcome_id: string | null;
    }>(
      "SELECT a.id,a.number,r.id AS retry_id,o.id AS outcome_id FROM warehouse_delivery_attempts a LEFT JOIN warehouse_delivery_outcomes o ON o.attempt_id=a.id LEFT JOIN warehouse_delivery_retries r ON r.attempt_id=a.id WHERE a.order_id=$1 ORDER BY a.number DESC LIMIT 1",
      [fixture.orderId],
    )
  ).rows[0];
  const attemptId = operation === "DISPATCH" ? randomUUID() : latest?.id;
  if (!attemptId) throw new Error("Expected retained delivery attempt");
  const retryId = operation === "RETRY_DELIVERY" ? randomUUID() : null;
  const status =
    operation === "DISPATCH"
      ? "OUT_FOR_DELIVERY"
      : operation === "FAIL_DELIVERY"
        ? "DELIVERY_FAILED"
        : operation === "CONFIRM_DELIVERY"
          ? "DELIVERED"
          : "READY_FOR_DELIVERY";
  const outcome = {
    orders: [
      {
        eventId,
        orderId: fixture.orderId,
        beforeVersion: before.version,
        afterVersion: before.version + 1,
        status,
        pieceIds,
        receiptGroupId: null,
        attemptId,
        retryId,
      },
    ],
  };
  const at = "2026-11-16T12:00:00.000Z";
  await client.query(
    "INSERT INTO warehouse_commands(command_id,operation,actor_id,actor_full_name,actor_role,payload_hash,occurred_at,outcome) VALUES($1,$2,$5,'Upgrade admin','ADMIN',repeat('a',64),$3,$4)",
    [commandId, operation, at, JSON.stringify(outcome), fixture.actorId],
  );
  await client.query(
    "INSERT INTO warehouse_command_orders(command_id,order_id,event_id,before_version,after_version,before_status,after_status,piece_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      commandId,
      fixture.orderId,
      eventId,
      before.version,
      before.version + 1,
      before.status,
      status,
      pieceIds,
    ],
  );
  if (operation === "DISPATCH") {
    await client.query(
      "INSERT INTO warehouse_delivery_attempts(id,order_id,command_id,number,predecessor_retry_id) VALUES($1,$2,$3,$4,$5)",
      [
        attemptId,
        fixture.orderId,
        commandId,
        (latest?.number ?? 0) + 1,
        latest?.retry_id ?? null,
      ],
    );
    for (const pieceId of pieceIds)
      await client.query(
        "INSERT INTO warehouse_delivery_attempt_members(attempt_id,order_id,piece_id) VALUES($1,$2,$3)",
        [attemptId, fixture.orderId, pieceId],
      );
  } else if (operation === "RETRY_DELIVERY") {
    await client.query(
      "INSERT INTO warehouse_delivery_retries(id,order_id,command_id,attempt_id,outcome_id) VALUES($1,$2,$3,$4,$5)",
      [retryId, fixture.orderId, commandId, attemptId, latest?.outcome_id],
    );
  } else {
    await client.query(
      "INSERT INTO warehouse_delivery_outcomes(id,order_id,command_id,attempt_id,kind,returned_to_warehouse,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        fixture.orderId,
        commandId,
        attemptId,
        operation === "FAIL_DELIVERY" ? "FAILED" : "DELIVERED",
        operation === "FAIL_DELIVERY",
        operation === "FAIL_DELIVERY" ? "Customer unavailable" : null,
      ],
    );
  }
  await client.query("UPDATE sales_orders SET status=$2 WHERE id=$1", [
    fixture.orderId,
    status,
  ]);
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    before.version + 1,
  ]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return { commandId, attemptId, retryId };
};
const cancelReturnedWarehouse = async (
  client: PoolClient,
  fixture: UpgradeFixture,
  pieceIds: string[],
) => {
  const before = await readFacts(client, fixture.orderId),
    ids = pieceIds.toSorted(),
    selected = new Set(ids);
  const active = before.counts.active - ids.length;
  const prices = (
    await client.query<{ total: string }>(
      "SELECT (COALESCE(sum(unit_price),0)*100)::bigint::text AS total FROM sales_order_pieces WHERE order_id=$1 AND stage<>'CANCELLED' AND NOT id=ANY($2::uuid[])",
      [fixture.orderId, ids],
    )
  ).rows[0];
  if (!prices) throw new Error("Expected sum");
  const cents = BigInt(prices.total),
    paid = BigInt(before.money.paidAmount.replace(".", ""));
  const money = (n: bigint) =>
    `${(n / 100n).toString()}.${String(n % 100n).padStart(2, "0")}`;
  const at = "2026-11-16T12:00:00.000Z",
    reason = "Administrative cancellation",
    commandId = randomUUID();
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: before.version + 1,
    status: active === 0 ? "CANCELLED" : before.status,
    counts: {
      ...before.counts,
      active,
      cancelled: before.counts.cancelled + ids.length,
      received: active,
      completionPercent: active === 0 ? 0 : 100,
    },
    money: {
      total: money(cents),
      paidAmount: money(paid),
      remainingDue: money(cents > paid ? cents - paid : 0n),
      surplus: money(paid > cents ? paid - cents : 0n),
    },
    pieces: before.pieces.map((p) =>
      selected.has(p.id)
        ? {
            ...p,
            stage: "CANCELLED",
            workState: "BLOCKED",
            cancelledAt: at,
            cancellationReason: reason,
          }
        : p,
    ),
  });
  const command = administrationCommandDataSchema.parse({
    receipt: {
      commandId,
      operation: "ADMIN_CANCEL",
      orderId: fixture.orderId,
      beforeVersion: before.version,
      afterVersion: after.version,
      actor: {
        id: fixture.actorId,
        fullName: "Upgrade admin",
        role: "ADMIN",
        department: null,
      },
      occurredAt: at,
    },
    replayed: false,
    before,
    after,
    result: {
      orderId: fixture.orderId,
      version: after.version,
      status: after.status,
      counts: after.counts,
      money: after.money,
      correction: after.correction,
      pieceIds: ids,
    },
  });
  await client.query(
    "INSERT INTO administration_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,reason,scope,piece_ids,before_facts,after_facts,outcome,occurred_at) VALUES($1,'ADMIN_CANCEL',$2,'Upgrade admin','ADMIN',$3,$4,$4,$5,repeat('b',64),$6,'QUANTITY',$7,$8,$9,$10,$11)",
    [
      commandId,
      fixture.actorId,
      fixture.orderId,
      before.version,
      after.version,
      reason,
      ids,
      JSON.stringify(before),
      JSON.stringify(after),
      JSON.stringify(command),
      at,
    ],
  );
  for (const id of ids)
    await client.query(
      "INSERT INTO administration_cancelled_pieces(command_id,order_id,piece_id,before_facts,after_facts) VALUES($1,$2,$3,$4,$5)",
      [
        commandId,
        fixture.orderId,
        id,
        JSON.stringify(before.pieces.find((p) => p.id === id)),
        JSON.stringify(after.pieces.find((p) => p.id === id)),
      ],
    );
  await client.query(
    "UPDATE sales_order_pieces SET stage='CANCELLED',work_state='BLOCKED',cancelled_at=$3,cancellation_reason=$4 WHERE order_id=$1 AND id=ANY($2::uuid[])",
    [fixture.orderId, ids, at, reason],
  );
  await client.query(
    "UPDATE sales_orders SET status=$2,total_amount=$3 WHERE id=$1",
    [fixture.orderId, after.status, after.money.total],
  );
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    after.version,
  ]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return command;
};

it("upgrades a populated P07 failed attempt unchanged, cancels one returned piece, retries and dispatches only the remaining active set", async () => {
  await withPreP07(["COMPLETE", "QUALITY"], async (client, uri, fixtures) => {
    await client.query(readMigration(p07Migration));
    await runChildPrisma(uri, [
      "migrate",
      "resolve",
      "--applied",
      p07Migration,
    ]);
    const fixture = fixtures.find((f) => f.kind === "COMPLETE");
    if (!fixture) throw new Error("Expected complete receipt fixture");
    await client.query("BEGIN");
    const dispatched = await warehouseAction(
      client,
      fixture,
      "DISPATCH",
      fixture.pieceIds,
    );
    await warehouseAction(client, fixture, "FAIL_DELIVERY", fixture.pieceIds);
    await client.query("COMMIT");
    const tables = (
      await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name",
      )
    ).rows.map((r) => r.table_name);
    const snapshot = async () => {
      const facts: unknown[] = [];
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table))
          throw new Error("Unexpected table identifier");
        facts.push(
          (
            await client.query<{ graph: unknown }>(
              "SELECT COALESCE(jsonb_agg(to_jsonb(t)-ARRAY['end_administration_command_id','resolution_administration_command_id'] ORDER BY to_jsonb(t)::text),'[]') AS graph FROM " +
                table +
                " t",
            )
          ).rows,
        );
      }
      return facts;
    };
    const before = await snapshot(),
      ledger = (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows;
    const oldNames = readdirSync(migrationsRoot)
      .filter((n) => n.startsWith("20") && n < "20261115000100_p08_admin_enums")
      .sort();
    const hashes = () =>
      Object.fromEntries(
        oldNames.map((n) => [
          n,
          createHash("sha256").update(readMigration(n)).digest("hex"),
        ]),
      );
    const beforeHashes = hashes();
    await runChildPrisma(uri, ["migrate", "deploy"]);
    expect(await snapshot()).toEqual(before);
    expect(hashes()).toEqual(beforeHashes);
    expect(
      (
        await client.query(
          "SELECT * FROM _prisma_migrations WHERE migration_name<'20261115000100_p08_admin_enums' ORDER BY migration_name",
        )
      ).rows,
    ).toEqual(ledger);
    expect(
      (
        await client.query(
          "SELECT end_administration_command_id FROM quality_work_visits",
        )
      ).rows,
    ).toEqual([
      { end_administration_command_id: null },
      { end_administration_command_id: null },
    ]);
    await client.query("BEGIN");
    const first = fixture.pieceIds[0],
      second = fixture.pieceIds[1];
    if (!first || !second) throw new Error("Expected two pieces");
    await client.query("SAVEPOINT forged_omission");
    await expect(
      warehouseAction(client, fixture, "RETRY_DELIVERY", [second]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_warehouse_attempt_graph",
    });
    await client.query("ROLLBACK TO SAVEPOINT forged_omission");
    await client.query("RELEASE SAVEPOINT forged_omission");
    const receipts = (
      await client.query(
        "SELECT * FROM warehouse_receipt_pieces ORDER BY piece_id",
      )
    ).rows;
    await client.query("SAVEPOINT full_return_cancellation");
    const full = await cancelReturnedWarehouse(
      client,
      fixture,
      fixture.pieceIds,
    );
    expect(full.after.status).toBe("CANCELLED");
    expect(full.after.counts.active).toBe(0);
    expect(full.after.counts.received).toBe(0);
    expect(
      (
        await client.query(
          "SELECT * FROM warehouse_receipt_pieces ORDER BY piece_id",
        )
      ).rows,
    ).toEqual(receipts);
    await client.query("ROLLBACK TO SAVEPOINT full_return_cancellation");
    await client.query("RELEASE SAVEPOINT full_return_cancellation");
    await client.query("SAVEPOINT retried_ready_cancellation");
    await warehouseAction(client, fixture, "RETRY_DELIVERY", fixture.pieceIds);
    const ready = await cancelReturnedWarehouse(client, fixture, [first]);
    expect(ready.after.status).toBe("READY_FOR_DELIVERY");
    await warehouseAction(client, fixture, "DISPATCH", [second]);
    await client.query("ROLLBACK TO SAVEPOINT retried_ready_cancellation");
    await client.query("RELEASE SAVEPOINT retried_ready_cancellation");
    const cancelled = await cancelReturnedWarehouse(client, fixture, [first]);
    expect(cancelled.after.status).toBe("DELIVERY_FAILED");
    expect(cancelled.after.counts).toEqual({
      original: 2,
      cancelled: 1,
      active: 1,
      received: 1,
      completionPercent: 100,
    });
    await warehouseAction(client, fixture, "RETRY_DELIVERY", [second]);
    const next = await warehouseAction(client, fixture, "DISPATCH", [second]);
    expect(
      (
        await client.query(
          "SELECT piece_id FROM warehouse_delivery_attempt_members WHERE attempt_id=$1 ORDER BY piece_id",
          [dispatched.attemptId],
        )
      ).rows,
    ).toEqual(fixture.pieceIds.map((piece_id) => ({ piece_id })));
    expect(
      (
        await client.query(
          "SELECT piece_id FROM warehouse_delivery_attempt_members WHERE attempt_id=$1 ORDER BY piece_id",
          [next.attemptId],
        )
      ).rows,
    ).toEqual([{ piece_id: second }]);
    expect(
      (
        await client.query(
          "SELECT * FROM warehouse_receipt_pieces ORDER BY piece_id",
        )
      ).rows,
    ).toEqual(receipts);
    await client.query("SAVEPOINT dispatched_cancel");
    await expect(
      cancelReturnedWarehouse(client, fixture, [second]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_administration_piece_binding",
    });
    await client.query("ROLLBACK TO SAVEPOINT dispatched_cancel");
    await client.query("RELEASE SAVEPOINT dispatched_cancel");
    await warehouseAction(client, fixture, "CONFIRM_DELIVERY", [second]);
    await client.query("SAVEPOINT delivered_cancel");
    await expect(
      cancelReturnedWarehouse(client, fixture, [second]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_administration_piece_binding",
    });
    await client.query("ROLLBACK TO SAVEPOINT delivered_cancel");
    await client.query("RELEASE SAVEPOINT delivered_cancel");
  });
});
