import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
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
