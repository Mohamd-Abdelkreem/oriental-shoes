import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationRoot = join(packageRoot, "prisma/migrations");
const p06 = "20261111000200_p06_quality_workspaces";
const dispatchMigration = "20261112000100_p06_quality_validation_dispatch";
const p04 = "20261106000400_p04_approval_piece_issues";
const instant = "2026-11-11T08:00:00.000Z";
const actionTime = "2026-11-11T09:00:00.000Z";
const execFileAsync = promisify(execFile);
type Fixture = { orderId: string; actorId: string; pieceIds: string[] };
let fixture: Fixture;
let admin: Pool | undefined;
let child: Pool | undefined;
let childUri: string;
let created = false;
const childName = "p06_constraints_" + randomUUID().replaceAll("-", "");
let priorSnapshot: unknown;
let priorLedger: unknown;
let priorHashes: Record<string, string>;

const sql = (name: string) =>
  readFileSync(join(migrationRoot, name, "migration.sql"), "utf8");
const runPrisma = async (args: readonly string[]) => {
  const pnpm = process.env["npm_execpath"];
  if (!pnpm) throw new Error("Owned migration test requires pnpm");
  try {
    await execFileAsync(process.execPath, [pnpm, "exec", "prisma", ...args], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: childUri },
      timeout: 180000,
    });
  } catch {
    throw new Error(
      "Owned P06 migration command failed; connection details withheld",
    );
  }
};
const required = <T>(rows: readonly T[], index = 0): T => {
  const row = rows[index];
  if (row === undefined) throw new Error("Expected isolated fixture row");
  return row;
};
const seedLegacy = async (client: PoolClient): Promise<Fixture> => {
  const ids = {
    orderId: randomUUID(),
    actorId: randomUUID(),
    pieceIds: [randomUUID(), randomUUID()].sort(),
  };
  const customerId = randomUUID(),
    sourceId = randomUUID(),
    entryId = randomUUID();
  const sequence = BigInt(
    "0x" + ids.orderId.replaceAll("-", "").slice(0, 12),
  ).toString();
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at) VALUES($1,$2,'test-only','Quality admin','ADMIN','ACTIVE',$3,$3,$3)",
    [ids.actorId, ids.actorId + "@example.test", instant],
  );
  await client.query(
    "INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES($1,'Customer','+966500000001',$2,$2)",
    [customerId, instant],
  );
  await client.query(
    "INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest) VALUES($1,$2,'Synthetic','A1:AA942',1,$3,'owned constraints',1874,'{}')",
    [sourceId, sourceId.replaceAll("-", "").repeat(2), instant],
  );
  await client.query(
    "INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES($1,$2,'decoration','Z3','Decoration','decoration',1,1800,'AA3')",
    [entryId, sourceId],
  );
  await client.query(
    "INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at) VALUES($1,$2,$3,'SHOP','SUBMITTED',$4,$4)",
    [ids.orderId, ids.actorId, customerId, instant],
  );
  await client.query(
    "INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at) SELECT id,$2,position::int,'SM','40','Base','Decoration','Face',$3,$3 FROM unnest($1::uuid[]) WITH ORDINALITY p(id,position)",
    [ids.pieceIds, ids.orderId, instant],
  );
  await client.query(
    "INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) SELECT id,'decoration',$2 FROM unnest($1::uuid[]) p(id)",
    [ids.pieceIds, entryId],
  );
  await client.query(
    "INSERT INTO sales_orders(id,status,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount,approved_at) VALUES($1,'APPROVED',$2,$3,2026,$4,$5,'Quality admin','Customer','+966500000001',$6,3600,100.50,$4)",
    [
      ids.orderId,
      "SHOP-2026-" + sequence.padStart(4, "0"),
      sequence,
      instant,
      ids.actorId,
      sourceId,
    ],
  );
  await client.query(
    "INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell,stage,work_state) SELECT id,$2,$3,$4,'Decoration',1800,'AA3','QUALITY','IN_PROGRESS' FROM unnest($1::uuid[]) p(id)",
    [ids.pieceIds, ids.orderId, entryId, sourceId],
  );
  await client.query("COMMIT");
  return ids;
};

const preservedGraph = async (client: PoolClient): Promise<unknown> =>
  required(
    (
      await client.query<{ graph: unknown }>(
        "SELECT jsonb_build_object('roots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_drafts t),'headers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_orders t),'pieces',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_order_pieces t),'users',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM users t),'approval',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM approval_commands t),'manufacturing',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM manufacturing_commands t)) AS graph",
      )
    ).rows,
  ).graph;

beforeAll(async () => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (
    !marker ||
    marker !== process.env["DATABASE_URL"] ||
    process.env["NODE_ENV"] !== "test"
  )
    throw new Error("Active owned test database required");
  admin = new Pool({ connectionString: marker });
  const selected = required(
    (await admin.query<{ name: string }>("SELECT current_database() AS name"))
      .rows,
  );
  if (selected.name !== decodeURIComponent(new URL(marker).pathname.slice(1)))
    throw new Error("Owned database mismatch");
  await admin.query('CREATE DATABASE "' + childName + '"');
  created = true;
  const url = new URL(marker);
  url.pathname = "/" + childName;
  childUri = url.toString();
  child = new Pool({ connectionString: childUri });
  const client = await child.connect();
  try {
    const names = readdirSync(migrationRoot)
      .filter((name) => name.startsWith("20") && name < p06)
      .sort();
    priorHashes = Object.fromEntries(
      names.map((name) => [
        name,
        createHash("sha256").update(sql(name)).digest("hex"),
      ]),
    );
    for (const name of names) {
      if (name === p04) fixture = await seedLegacy(client);
      await client.query(sql(name));
      await runPrisma(["migrate", "resolve", "--applied", name]);
    }
    priorSnapshot = await preservedGraph(client);
    priorLedger = (
      await client.query(
        "SELECT * FROM _prisma_migrations ORDER BY migration_name",
      )
    ).rows;
    await runPrisma(["migrate", "deploy"]);
  } finally {
    client.release();
  }
});
afterAll(async () => {
  try {
    await child?.end();
  } finally {
    try {
      if (created) await admin?.query('DROP DATABASE "' + childName + '"');
    } finally {
      await admin?.end();
    }
  }
});
const withGraph = async (verify: (client: PoolClient) => Promise<void>) => {
  if (!child) throw new Error("Owned child database not initialized");
  const client = await child.connect();
  try {
    await client.query("BEGIN");
    await verify(client);
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
};
const snapshot = async (client: PoolClient) => {
  const tables = [
    "quality_commands",
    "quality_command_orders",
    "quality_work_visits",
    "quality_piece_events",
    "quality_correction_cycles",
    "quality_packing_groups",
    "quality_packing_pieces",
    "quality_approval_reports",
    "manufacturing_work_visits",
    "manufacturing_issues",
    "approval_commands",
    "sales_drafts",
    "sales_order_pieces",
    "sales_orders",
    "sales_draft_pieces",
    "sales_piece_catalog_selections",
    "manufacturing_commands",
    "manufacturing_command_orders",
    "manufacturing_piece_events",
  ] as const;
  const graphs: unknown[] = [];
  for (const table of tables) {
    // Identifiers come only from this fixed test-owned allowlist.
    graphs.push(
      (
        await client.query(
          "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS graph FROM " +
            table +
            " t",
        )
      ).rows,
    );
  }
  return graphs;
};
const rejectUnchanged = async (
  client: PoolClient,
  work: () => Promise<unknown>,
  constraint: string,
  code = "23514",
) => {
  const before = await snapshot(client);
  await client.query("SAVEPOINT invalid_quality_graph");
  await expect(
    (async () => {
      await work();
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    })(),
  ).rejects.toMatchObject({ code, constraint });
  await client.query("ROLLBACK TO SAVEPOINT invalid_quality_graph");
  expect(await snapshot(client)).toEqual(before);
};

type InspectionMode = "ACCEPT" | "REJECT" | "MIXED";
const inspect = async (
  client: PoolClient,
  mode: InspectionMode,
  options: {
    invalidPacking?: boolean;
    receiptExpression?: string;
    allRejectsToCutting?: boolean;
  } = {},
) => {
  const commandId = randomUUID(),
    eventId = randomUUID(),
    packingId = mode === "REJECT" ? null : randomUUID();
  const outcomes: unknown[] = [];
  const beforeVersion = required(
    (
      await client.query<{ version: number }>(
        "SELECT version FROM sales_drafts WHERE id=$1 FOR UPDATE",
        [fixture.orderId],
      )
    ).rows,
  ).version;
  const afterVersion = beforeVersion + 1;
  await client.query(
    "INSERT INTO quality_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids,inspector_note) VALUES($1,$2,$3,$4,$5,$6,' Original note ')",
    [
      commandId,
      fixture.orderId,
      eventId,
      beforeVersion,
      afterVersion,
      fixture.pieceIds,
    ],
  );
  for (const [index, pieceId] of fixture.pieceIds.entries()) {
    const decision =
      mode === "MIXED" ? (index === 0 ? "ACCEPT" : "REJECT") : mode;
    const pieceEventId = randomUUID(),
      correctionId = decision === "REJECT" ? randomUUID() : null;
    const visitId = required(
      (
        await client.query<{ id: string }>(
          "SELECT id FROM quality_work_visits WHERE piece_id=$1 AND ended_at IS NULL",
          [pieceId],
        )
      ).rows,
    ).id;
    const stage =
      decision === "ACCEPT"
        ? "WAREHOUSE"
        : options.allRejectsToCutting || index === 0
          ? "CUTTING"
          : "PRODUCTION";
    await client.query(
      "INSERT INTO quality_piece_events(id,command_id,order_id,piece_id,visit_id,decision,correction_id,before_stage,before_work_state,after_stage,after_work_state) VALUES($1,$2,$3,$4,$5,$6::quality_decision,$7,'QUALITY','IN_PROGRESS',$8::sales_piece_stage,'INCOMING')",
      [
        pieceEventId,
        commandId,
        fixture.orderId,
        pieceId,
        visitId,
        decision,
        correctionId,
        stage,
      ],
    );
    await client.query(
      "UPDATE quality_work_visits SET ended_at=$2,end_reason=$3::quality_visit_end,end_quality_event_id=$4 WHERE id=$1",
      [
        visitId,
        actionTime,
        decision === "ACCEPT" ? "INSPECT_ACCEPTED" : "INSPECT_REJECTED",
        pieceEventId,
      ],
    );
    let manufacturingVisitId: string | null = null;
    if (correctionId !== null) {
      manufacturingVisitId = randomUUID();
      await client.query(
        "INSERT INTO quality_correction_cycles(id,order_id,piece_id,cycle,rejection_event_id,target,reason,instructions,state) VALUES($1,$2,$3,1,$4,$5::department,'Bond mismatch',' Rebond ','OPEN')",
        [correctionId, fixture.orderId, pieceId, pieceEventId, stage],
      );
      await client.query(
        "INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_reference_id,source_correction_cycle,source_order_version,instructions,entered_at) VALUES($1,$2,$3,$4::department,1,'QUALITY_CORRECTION','QUALITY',$5,1,$6,' Rebond ',$7)",
        [
          manufacturingVisitId,
          fixture.orderId,
          pieceId,
          stage,
          correctionId,
          afterVersion,
          actionTime,
        ],
      );
    }
    await client.query(
      "UPDATE sales_order_pieces SET stage=$2::sales_piece_stage,work_state='INCOMING',current_work_visit_id=$3 WHERE id=$1",
      [pieceId, stage, manufacturingVisitId],
    );
    if (packingId !== null && (decision === "ACCEPT" || options.invalidPacking))
      await client.query(
        "INSERT INTO quality_packing_pieces(group_id,command_id,order_id,piece_id) VALUES($1,$2,$3,$4)",
        [packingId, commandId, fixture.orderId, pieceId],
      );
    outcomes.push({
      pieceId,
      visitId,
      decision,
      stage,
      workState: "INCOMING",
      correctionId,
      issueId: null,
    });
  }
  if (packingId !== null)
    await client.query(
      "INSERT INTO quality_packing_groups(id,command_id,order_id,carton_count,carton_numbers) VALUES($1,$2,$3,' 2 ','C-01')",
      [packingId, commandId, fixture.orderId],
    );
  await client.query(
    // The expression is selected only from the closed malformed-receipt test matrix below.
    "INSERT INTO quality_commands(command_id,operation,actor_id,actor_full_name,actor_role,payload_hash,outcome,occurred_at) VALUES($1,'INSPECT',$2,'Quality admin','ADMIN',repeat('a',64)," +
      (options.receiptExpression ?? "$3") +
      ",$4)",
    [
      commandId,
      fixture.actorId,
      JSON.stringify({
        orders: [
          {
            eventId,
            orderId: fixture.orderId,
            beforeVersion,
            afterVersion,
            pieces: outcomes,
            packingGroupId: packingId,
          },
        ],
      }),
      actionTime,
    ],
  );
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    afterVersion,
  ]);
  return { commandId, eventId, packingId, afterVersion };
};

it("upgrades a populated pre-P06 graph without inventing old inspection actors or changing prior ledger/checksums", async () => {
  if (!child) throw new Error("Owned child missing");
  const client = await child.connect();
  try {
    expect(await preservedGraph(client)).toEqual(priorSnapshot);
    expect(
      (
        await client.query(
          "SELECT * FROM _prisma_migrations WHERE migration_name < $1 ORDER BY migration_name",
          [p06],
        )
      ).rows,
    ).toEqual(priorLedger);
    const laterMigrations = await client.query<{
      migration_name: string;
      finished: boolean;
      rolled_back_at: Date | null;
    }>(
      "SELECT migration_name,finished_at IS NOT NULL AS finished,rolled_back_at FROM _prisma_migrations WHERE migration_name >= $1 ORDER BY migration_name",
      [p06],
    );
    expect(laterMigrations.rows).toEqual([
      { migration_name: p06, finished: true, rolled_back_at: null },
      {
        migration_name: dispatchMigration,
        finished: true,
        rolled_back_at: null,
      },
      {
        migration_name: "20261113000100_p07_warehouse_receipt_delivery",
        finished: true,
        rolled_back_at: null,
      },
    ]);

    const visits = await client.query(
      "SELECT piece_id,origin_kind,entered_at,started_at,started_command_id,legacy_unknown_start FROM quality_work_visits ORDER BY piece_id",
    );
    expect(visits.rows).toEqual(
      fixture.pieceIds.map((pieceId) => ({
        piece_id: pieceId,
        origin_kind: "LEGACY_BASELINE",
        entered_at: null,
        started_at: null,
        started_command_id: null,
        legacy_unknown_start: true,
      })),
    );
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM quality_commands",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    for (const [name, digest] of Object.entries(priorHashes))
      expect(createHash("sha256").update(sql(name)).digest("hex")).toBe(digest);
    const ledger = (
      await client.query(
        "SELECT * FROM _prisma_migrations ORDER BY migration_name",
      )
    ).rows;
    await runPrisma(["migrate", "deploy"]);
    expect(
      (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows,
    ).toEqual(ledger);
    expect(await preservedGraph(client)).toEqual(priorSnapshot);
  } finally {
    client.release();
  }
});

it.each(["ACCEPT", "REJECT", "MIXED"] as const)(
  "binds a complete %s inspection to one root witness and never physical receipt",
  async (mode) => {
    await withGraph(async (client) => {
      const frozen = (
        await client.query(
          "SELECT to_jsonb(h) AS header FROM sales_orders h ORDER BY id",
        )
      ).rows;
      const result = await inspect(client, mode);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect(
        (
          await client.query(
            "SELECT to_jsonb(h) AS header FROM sales_orders h ORDER BY id",
          )
        ).rows,
      ).toEqual(frozen);
      const pieces = (
        await client.query(
          "SELECT stage,work_state,received_at FROM sales_order_pieces WHERE order_id=$1 ORDER BY id",
          [fixture.orderId],
        )
      ).rows;
      expect(pieces).toEqual(
        fixture.pieceIds.map((_, index) => ({
          stage:
            mode === "ACCEPT" || (mode === "MIXED" && index === 0)
              ? "WAREHOUSE"
              : index === 0
                ? "CUTTING"
                : "PRODUCTION",
          work_state: "INCOMING",
          received_at: null,
        })),
      );
      expect(
        (
          await client.query("SELECT version FROM sales_drafts WHERE id=$1", [
            fixture.orderId,
          ])
        ).rows,
      ).toEqual([{ version: result.afterVersion }]);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM quality_correction_cycles WHERE state='OPEN'",
          )
        ).rows,
      ).toEqual([{ count: mode === "ACCEPT" ? 0 : mode === "REJECT" ? 2 : 1 }]);
    });
  },
);

it("rejects packing that includes a rejected member and rolls back the whole graph", async () => {
  await withGraph(async (client) => {
    await rejectUnchanged(
      client,
      () => inspect(client, "MIXED", { invalidPacking: true }),
      "ck_quality_packing_shape",
    );
  });
});

it("rejects rewrites of an unknown historical start", async () => {
  await withGraph(async (client) => {
    const originalVisit = required(
      (
        await client.query<{ id: string }>(
          "SELECT id FROM quality_work_visits ORDER BY piece_id LIMIT 1",
        )
      ).rows,
    ).id;
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "UPDATE quality_work_visits SET started_at=$2 WHERE id=$1",
          [originalVisit, actionTime],
        ),
      "ck_quality_retained",
    );
  });
});

it("retains accepted event/packing facts and rejects unwitnessed later root changes", async () => {
  await withGraph(async (client) => {
    const accepted = await inspect(client, "ACCEPT");
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "UPDATE quality_commands SET outcome='{}' WHERE command_id=$1",
          [accepted.commandId],
        ),
      "ck_quality_retained",
    );
    await rejectUnchanged(
      client,
      () =>
        client.query("DELETE FROM quality_packing_groups WHERE id=$1", [
          accepted.packingId,
        ]),
      "ck_quality_retained",
    );
    await rejectUnchanged(
      client,
      () =>
        client.query("UPDATE sales_drafts SET version=version+1 WHERE id=$1", [
          fixture.orderId,
        ]),
      "ck_manufacturing_command_graph",
    );
  });
});

const approvalFacts = async (
  client: PoolClient,
  pieceId: string,
): Promise<unknown> =>
  required(
    (
      await client.query<{ facts: unknown }>(
        "SELECT jsonb_build_object('orderStatus',h.status,'approvedAt',h.approved_at,'currentReturn',NULL,'money',jsonb_build_object('total',h.total_amount::text,'paidAmount',h.paid_amount::text,'remainingDue',(h.total_amount-h.paid_amount)::text,'surplus','0.00'),'counts',jsonb_build_object('original',2,'active',2,'cancelled',0,'received',0,'completionPercent',0),'pieces',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'stage',p.stage,'workState',p.work_state,'issueId',p.issue_id,'receivedAt',p.received_at,'cancelledAt',p.cancelled_at,'cancellationReason',p.cancellation_reason)) FROM sales_order_pieces p WHERE p.id=$2 AND p.order_id=h.id),'issue',(SELECT jsonb_build_object('id',i.id,'state',i.state,'sourceDepartment',i.source_department,'sourceStage',i.source_stage,'sourceWorkState',i.source_work_state,'resumeTarget',i.resume_target,'currentProposalId',i.latest_proposal_id) FROM manufacturing_issues i WHERE i.piece_id=$2 ORDER BY cycle DESC LIMIT 1),'proposal',NULL) AS facts FROM sales_orders h WHERE h.id=$1",
        [fixture.orderId, pieceId],
      )
    ).rows,
  ).facts;

const reportIssues = async (client: PoolClient, corruptOrdinal = false) => {
  const parentId = randomUUID(),
    eventId = randomUUID();
  const outcomes: unknown[] = [];
  const beforeVersion = required(
    (
      await client.query<{ version: number }>(
        "SELECT version FROM sales_drafts WHERE id=$1 FOR UPDATE",
        [fixture.orderId],
      )
    ).rows,
  ).version;
  await client.query(
    "INSERT INTO quality_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids) VALUES($1,$2,$3,$4,$5,$6)",
    [
      parentId,
      fixture.orderId,
      eventId,
      beforeVersion,
      beforeVersion + fixture.pieceIds.length,
      fixture.pieceIds,
    ],
  );
  for (const [index, pieceId] of fixture.pieceIds.entries()) {
    const childId = randomUUID(),
      issueId = randomUUID(),
      pieceEventId = randomUUID();
    const visitId = required(
      (
        await client.query<{ id: string }>(
          "SELECT id FROM quality_work_visits WHERE piece_id=$1 AND ended_at IS NULL",
          [pieceId],
        )
      ).rows,
    ).id;
    const before = await approvalFacts(client, pieceId);
    await client.query(
      "INSERT INTO manufacturing_issues(id,order_id,piece_id,cycle,state,source_department,source_stage,source_work_state,reporter_id,reporter_full_name,reporter_role,reason,notes,reported_at,updated_at,reported_command_id) VALUES($1,$2,$3,1,'APPROVAL_REVIEW','QUALITY','QUALITY','IN_PROGRESS',$4,'Quality admin','ADMIN',' Needs approval ',' Original notes ',$5,$5,$6)",
      [issueId, fixture.orderId, pieceId, fixture.actorId, actionTime, childId],
    );
    await client.query(
      "UPDATE sales_order_pieces SET work_state='BLOCKED',issue_id=$2 WHERE id=$1",
      [pieceId, issueId],
    );
    await client.query(
      "UPDATE quality_work_visits SET ended_at=$2,end_reason='ISSUE_REPORTED',end_approval_command_id=$3 WHERE id=$1",
      [visitId, actionTime, childId],
    );
    const afterVersion = beforeVersion + index + 1;
    await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
      fixture.orderId,
      afterVersion,
    ]);
    const after = await approvalFacts(client, pieceId);
    const outcome = {
      orderId: fixture.orderId,
      orderVersion: afterVersion,
      orderStatus: "APPROVED",
      pieceId,
      pieceStage: "QUALITY",
      pieceWorkState: "BLOCKED",
      issueId,
      issueState: "APPROVAL_REVIEW",
      proposalId: null,
    };
    await client.query(
      "INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at) VALUES($1,'REPORT_ISSUE',$2,'Quality admin','ADMIN',$3,$4,$5,$6,$6,$7,repeat('b',64),$8,$9,$10,$11)",
      [
        childId,
        fixture.actorId,
        fixture.orderId,
        pieceId,
        issueId,
        afterVersion - 1,
        afterVersion,
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(outcome),
        actionTime,
      ],
    );
    await client.query(
      "INSERT INTO quality_piece_events(id,command_id,order_id,piece_id,visit_id,issue_id,approval_command_id,before_stage,before_work_state,after_stage,after_work_state) VALUES($1,$2,$3,$4,$5,$6,$7,'QUALITY','IN_PROGRESS','QUALITY','BLOCKED')",
      [
        pieceEventId,
        parentId,
        fixture.orderId,
        pieceId,
        visitId,
        issueId,
        childId,
      ],
    );
    await client.query(
      "INSERT INTO quality_approval_reports(command_id,order_id,piece_id,approval_command_id,ordinal) VALUES($1,$2,$3,$4,$5)",
      [
        parentId,
        fixture.orderId,
        pieceId,
        childId,
        corruptOrdinal ? fixture.pieceIds.length - index : index + 1,
      ],
    );
    outcomes.push({
      pieceId,
      visitId,
      decision: null,
      stage: "QUALITY",
      workState: "BLOCKED",
      correctionId: null,
      issueId,
    });
  }
  await client.query(
    "INSERT INTO quality_commands(command_id,operation,actor_id,actor_full_name,actor_role,payload_hash,outcome,occurred_at) VALUES($1,'REPORT_ISSUES',$2,'Quality admin','ADMIN',repeat('a',64),$3,$4)",
    [
      parentId,
      fixture.actorId,
      JSON.stringify({
        orders: [
          {
            eventId,
            orderId: fixture.orderId,
            beforeVersion,
            afterVersion: beforeVersion + fixture.pieceIds.length,
            pieces: outcomes,
            packingGroupId: null,
          },
        ],
      }),
      actionTime,
    ],
  );
  return parentId;
};

it("accepts an exact +N report chain while retaining each real P04 child and its original +1 witness", async () => {
  await withGraph(async (client) => {
    await reportIssues(client);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    expect(
      (
        await client.query(
          "SELECT before_version,after_version FROM approval_commands ORDER BY after_version",
        )
      ).rows,
    ).toEqual([
      { before_version: 1, after_version: 2 },
      { before_version: 2, after_version: 3 },
    ]);
    expect(
      (
        await client.query(
          "SELECT before_version,after_version FROM quality_command_orders",
        )
      ).rows,
    ).toEqual([{ before_version: 1, after_version: 3 }]);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM manufacturing_issues WHERE state='APPROVAL_REVIEW'",
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM sales_order_pieces WHERE work_state='BLOCKED' AND received_at IS NULL",
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });
});

it("rejects a misordered child chain and leaves roots, holds, visits and both receipts unchanged", async () => {
  await withGraph(async (client) => {
    await rejectUnchanged(
      client,
      () => reportIssues(client, true),
      "ck_quality_report_chain",
    );
  });
});

it("rejects contradictory populated quality states atomically without a partial quality schema", async () => {
  if (!admin) throw new Error("Owned administrator missing");
  const name = "p06_rejected_" + randomUUID().replaceAll("-", "");
  const url = new URL(childUri);
  url.pathname = "/" + name;
  await admin.query('CREATE DATABASE "' + name + '"');
  const rejected = new Pool({ connectionString: url.toString() });
  let client: PoolClient | undefined;
  try {
    client = await rejected.connect();
    const names = readdirSync(migrationRoot)
      .filter((migration) => migration.startsWith("20") && migration < p06)
      .sort();
    for (const migration of names) {
      if (migration === p04) {
        await seedLegacy(client);
        await client.query(
          "UPDATE sales_order_pieces SET work_state='COMPLETED' WHERE stage='QUALITY'",
        );
      }
      await client.query(sql(migration));
    }
    const before = await preservedGraph(client);
    await expect(client.query(sql(p06))).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_quality_order_graph",
    });
    await client.query("ROLLBACK");
    expect(await preservedGraph(client)).toEqual(before);
    expect(
      (await client.query("SELECT to_regclass('quality_commands') AS quality"))
        .rows,
    ).toEqual([{ quality: null }]);
  } finally {
    try {
      if (client) {
        await client.query("ROLLBACK");
        client.release();
      }
    } finally {
      try {
        await rejected.end();
      } finally {
        await admin.query('DROP DATABASE "' + name + '"');
      }
    }
  }
});

it.each([
  ["WAREHOUSE", "Reason", "Instructions"],
  ["CUTTING", " \t ", "Instructions"],
  ["PRODUCTION", "Reason", "\n "],
])(
  "rejects unsupported correction shape %s/%s/%s without creating a cycle",
  async (target, reason, instructions) => {
    await withGraph(async (client) => {
      await rejectUnchanged(
        client,
        () =>
          client.query(
            "INSERT INTO quality_correction_cycles(id,order_id,piece_id,cycle,rejection_event_id,target,reason,instructions,state) VALUES($1,$2,$3,1,$4,$5::department,$6,$7,'OPEN')",
            [
              randomUUID(),
              fixture.orderId,
              required(fixture.pieceIds),
              randomUUID(),
              target,
              reason,
              instructions,
            ],
          ),
        "ck_quality_correction_shape",
      );
    });
  },
);

it("enforces the one-open-visit partial key and explicit nonnull real-start fields", async () => {
  await withGraph(async (client) => {
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "INSERT INTO quality_work_visits(id,order_id,piece_id,sequence,origin_kind,legacy_unknown_start) VALUES($1,$2,$3,2,'LEGACY_BASELINE',true)",
          [randomUUID(), fixture.orderId, required(fixture.pieceIds)],
        ),
      "quality_work_visits_one_open_piece_key",
      "23505",
    );
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "INSERT INTO quality_work_visits(id,order_id,piece_id,sequence,origin_kind,received_at,started_command_id,legacy_unknown_start) VALUES($1,$2,$3,2,'LEGACY_BASELINE',$4,$5,false)",
          [
            randomUUID(),
            fixture.orderId,
            required(fixture.pieceIds),
            actionTime,
            randomUUID(),
          ],
        ),
      "ck_quality_visit_shape",
    );
  });
});

it("retains exact composite event membership rather than accepting a foreign physical identity", async () => {
  await withGraph(async (client) => {
    const accepted = await inspect(client, "ACCEPT");
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "INSERT INTO quality_piece_events(id,command_id,order_id,piece_id,visit_id,decision,before_stage,before_work_state,after_stage,after_work_state) VALUES($1,$2,$3,$4,$5,'ACCEPT','QUALITY','IN_PROGRESS','WAREHOUSE','INCOMING')",
          [
            randomUUID(),
            accepted.commandId,
            fixture.orderId,
            randomUUID(),
            randomUUID(),
          ],
        ),
      "quality_piece_events_piece_id_order_id_fkey",
      "23503",
    );
  });
});

const receiptMutations = (nullableKey: "issueId" | "nextVisitId") => [
  {
    name: "parent extra key",
    expression: "$3::jsonb || '{\"unexpected\":true}'::jsonb",
  },
  {
    name: "group extra key",
    expression:
      "jsonb_set($3::jsonb,'{orders,0}',($3::jsonb#>'{orders,0}') || '{\"unexpected\":true}'::jsonb)",
  },
  {
    name: "piece extra key",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,pieces,0}',($3::jsonb#>'{orders,0,pieces,0}') || '{\"unexpected\":true}'::jsonb)",
  },
  {
    name: "missing nullable key",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,pieces,0}',($3::jsonb#>'{orders,0,pieces,0}')-'" +
      nullableKey +
      "')",
  },
  {
    name: "string null",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,pieces,0," +
      nullableKey +
      "}','\"null\"'::jsonb)",
  },
  {
    name: "string version",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,beforeVersion}',to_jsonb($3::jsonb#>>'{orders,0,beforeVersion}'))",
  },
  {
    name: "scalar piece",
    expression: "jsonb_set($3::jsonb,'{orders,0,pieces,0}','false'::jsonb)",
  },
  {
    name: "reordered members",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,pieces}',jsonb_build_array($3::jsonb#>'{orders,0,pieces,1}',$3::jsonb#>'{orders,0,pieces,0}'))",
  },
  {
    name: "missing member",
    expression:
      "jsonb_set($3::jsonb,'{orders,0,pieces}',($3::jsonb#>'{orders,0,pieces}')-0)",
  },
  {
    name: "scalar group",
    expression: "jsonb_set($3::jsonb,'{orders,0}','null'::jsonb)",
  },
];
it.each(receiptMutations("issueId"))(
  "rejects a quality receipt with $name and rolls back every selected witness",
  async (mutation) => {
    await withGraph(async (client) => {
      await rejectUnchanged(
        client,
        () =>
          inspect(client, "ACCEPT", { receiptExpression: mutation.expression }),
        "ck_quality_command_graph",
      );
    });
  },
);
const manufactureAfterQualityRejection = async (
  client: PoolClient,
  receiptExpression = "$3",
) => {
  const head = required(
    (
      await client.query<{ version: number }>(
        "SELECT version FROM sales_drafts WHERE id=$1 FOR UPDATE",
        [fixture.orderId],
      )
    ).rows,
  ).version;
  const commandId = randomUUID(),
    eventId = randomUUID(),
    occurredAt = new Date(Date.parse(actionTime) + 1000).toISOString();
  const outcomes = [];
  for (const pieceId of fixture.pieceIds) {
    const visit = required(
      (
        await client.query<{ id: string }>(
          "SELECT id FROM manufacturing_work_visits WHERE piece_id=$1 AND department='CUTTING' AND ended_at IS NULL",
          [pieceId],
        )
      ).rows,
    );
    await client.query(
      "UPDATE manufacturing_work_visits SET received_at=$2,started_at=$2,received_command_id=$3,started_command_id=$3 WHERE id=$1",
      [visit.id, occurredAt, commandId],
    );
    await client.query(
      "UPDATE sales_order_pieces SET work_state='IN_PROGRESS' WHERE id=$1",
      [pieceId],
    );
    await client.query(
      "INSERT INTO manufacturing_piece_events(id,command_id,order_id,piece_id,visit_id,operation,before_stage,before_work_state,after_stage,after_work_state) VALUES($1,$2,$3,$4,$5,'RECEIVE_AND_START','CUTTING','INCOMING','CUTTING','IN_PROGRESS')",
      [randomUUID(), commandId, fixture.orderId, pieceId, visit.id],
    );
    outcomes.push({
      pieceId,
      visitId: visit.id,
      nextVisitId: null,
      stage: "CUTTING",
      workState: "IN_PROGRESS",
    });
  }
  await client.query(
    "INSERT INTO manufacturing_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids) VALUES($1,$2,$3,$4,$5,$6)",
    [commandId, fixture.orderId, eventId, head, head + 1, fixture.pieceIds],
  );
  // Only a test-owned fixed expression enters this raw guard fixture.
  await client.query(
    "INSERT INTO manufacturing_commands(command_id,operation,department,actor_id,actor_full_name,actor_role,payload_hash,outcome,occurred_at) VALUES($1,'RECEIVE_AND_START','CUTTING',$2,'Quality admin','ADMIN',repeat('b',64)," +
      receiptExpression +
      ",$4)",
    [
      commandId,
      fixture.actorId,
      JSON.stringify({
        orders: [
          {
            eventId,
            orderId: fixture.orderId,
            beforeVersion: head,
            afterVersion: head + 1,
            pieces: outcomes,
          },
        ],
      }),
      occurredAt,
    ],
  );
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    head + 1,
  ]);
  return commandId;
};
const prepareCuttingCorrection = async (client: PoolClient) => {
  await inspect(client, "REJECT", { allRejectsToCutting: true });
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
};
it("validates a canonical P05 receive/start receipt produced from actual quality correction witnesses", async () => {
  await withGraph(async (client) => {
    await prepareCuttingCorrection(client);
    const commandId = await manufactureAfterQualityRejection(client);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM manufacturing_piece_events WHERE command_id=$1",
          [commandId],
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });
});
it.each(receiptMutations("nextVisitId"))(
  "rejects a P05 receipt with $name under current P06 guards without changing prior history",
  async (mutation) => {
    await withGraph(async (client) => {
      await prepareCuttingCorrection(client);
      await rejectUnchanged(
        client,
        () => manufactureAfterQualityRejection(client, mutation.expression),
        "ck_manufacturing_command_graph",
      );
    });
  },
);

it.each(["open visit", "pointer change", "wrong endpoint"] as const)(
  "preserves the independent manufacturing proof against $0 inside a canonical quality report",
  async (fault) => {
    await withGraph(async (client) => {
      await rejectUnchanged(
        client,
        async () => {
          const parentId = await reportIssues(client),
            pieceId = required(fixture.pieceIds),
            visitId = randomUUID();
          const childId = required(
            (
              await client.query<{ approval_command_id: string }>(
                "SELECT approval_command_id FROM quality_approval_reports WHERE command_id=$1 AND piece_id=$2",
                [parentId, pieceId],
              )
            ).rows,
          ).approval_command_id;
          await client.query(
            "INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,legacy_unknown_start,ended_at,end_reason,end_approval_command_id) VALUES($1,$2,$3,'CUTTING',1,'LEGACY_BASELINE',true,$4,$5::manufacturing_visit_end_reason,$6)",
            [
              visitId,
              fixture.orderId,
              pieceId,
              fault === "wrong endpoint" ? actionTime : null,
              fault === "wrong endpoint" ? "ISSUE_REPORTED" : null,
              fault === "wrong endpoint" ? childId : null,
            ],
          );
          if (fault === "pointer change")
            await client.query(
              "UPDATE sales_order_pieces SET current_work_visit_id=$2 WHERE id=$1",
              [pieceId, visitId],
            );
          // Force the P05 protection first; other enabled guards cannot mask a skipped domain check.
          await client.query(
            fault === "pointer change"
              ? "SET CONSTRAINTS p05_piece_final_graph IMMEDIATE"
              : "SET CONSTRAINTS p05_visit_final_graph IMMEDIATE",
          );
        },
        fault === "wrong endpoint"
          ? "ck_manufacturing_visit_times"
          : "ck_manufacturing_current_visit_graph",
      );
    });
  },
);

it("retains independent current-state rejection when only the Quality physical guard is forced", async () => {
  await withGraph(async (client) => {
    await rejectUnchanged(
      client,
      async () => {
        await client.query(
          "UPDATE sales_order_pieces SET work_state='INCOMING' WHERE id=$1",
          [fixture.pieceIds[0]],
        );
        await client.query(
          "SET CONSTRAINTS p06_quality_physical_graph IMMEDIATE",
        );
      },
      "ck_quality_order_graph",
    );
  });
});

it("keeps invalid parent checks pending after external state guards flush and rolls back the whole report", async () => {
  await withGraph(async (client) => {
    const before = await snapshot(client);
    await client.query("SAVEPOINT pending_parent_proof");
    try {
      await reportIssues(client, true);
      await client.query(
        "SET CONSTRAINTS p06_quality_root_graph,p06_quality_physical_graph IMMEDIATE",
      );
      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_quality_report_chain",
      });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT pending_parent_proof");
      expect(await snapshot(client)).toEqual(before);
    }
  });
});

it("retains immutable report source facts after a valid parent has been fully checked", async () => {
  await withGraph(async (client) => {
    await reportIssues(client);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await rejectUnchanged(
      client,
      () =>
        client.query(
          "UPDATE manufacturing_issues SET reason='Changed source' WHERE order_id=$1",
          [fixture.orderId],
        ),
      "ck_manufacturing_issue_source_immutable",
    );
  });
});

it("refuses an invalid pending report in forward preflight and restores data and definitions on rollback", async () => {
  await withGraph(async (client) => {
    const original = sql(p06);
    const oldDefinition = (name: string, next: string) => {
      const start = original.indexOf(`CREATE FUNCTION ${name}(`);
      const end = original.indexOf(`CREATE FUNCTION ${next}(`, start);
      if (start < 0 || end < 0) throw new Error("Original full guard required");
      return original
        .slice(start, end)
        .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
    };
    // Restore the stricter old definitions so failed replacement rollback is observable.
    await client.query(
      oldDefinition(
        "check_p06_quality_order_graph",
        "enforce_p06_quality_retained",
      ),
    );
    await client.query(
      oldDefinition("enforce_p06_quality_graph", "enforce_p06_quality_head"),
    );
    const definitions = () =>
      client.query<{ proname: string; definition: string }>(
        "SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('check_p06_quality_order_state','check_p06_quality_order_graph','enforce_p06_quality_graph') ORDER BY proname",
      );
    const beforeDefinitions = (await definitions()).rows,
      before = await snapshot(client);
    await client.query("SAVEPOINT forward_preflight_proof");
    try {
      await reportIssues(client, true);
      const body = sql(dispatchMigration)
        .replace(/^BEGIN;\s*/u, "")
        .replace(/COMMIT;\s*$/u, "");
      await expect(client.query(body)).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_quality_report_chain",
      });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT forward_preflight_proof");
      expect(await snapshot(client)).toEqual(before);
      expect((await definitions()).rows).toEqual(beforeDefinitions);
    }
  });
});
