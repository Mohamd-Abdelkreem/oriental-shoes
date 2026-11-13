import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool, type PoolClient } from "pg";
import { expect, it } from "vitest";

type WorkFixture = { orderId: string; actorId: string; pieceIds: string[] };
const instant = "2026-11-11T08:00:00.000Z";

const approvalFacts = async (
  client: PoolClient,
  orderId: string,
  pieceId: string | null = null,
) => {
  const snapshot = await client.query<{ facts: unknown }>(
    `
    SELECT jsonb_build_object('orderStatus',h.status,'approvedAt',h.approved_at,'currentReturn',NULL,
      'money',jsonb_build_object('total',h.total_amount::text,'paidAmount',h.paid_amount::text,
        'remainingDue',(h.total_amount-h.paid_amount)::text,'surplus','0.00'),
      'counts',jsonb_build_object('original',2,'active',2,'cancelled',0,'received',0,'completionPercent',0),
      'pieces',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'stage',p.stage,'workState',p.work_state,
        'issueId',p.issue_id,'receivedAt',p.received_at,'cancelledAt',p.cancelled_at,'cancellationReason',p.cancellation_reason) ORDER BY p.id)
        FROM sales_order_pieces p WHERE p.order_id=h.id AND ($2::uuid IS NULL OR p.id=$2)),
      'issue',(SELECT jsonb_build_object('id',i.id,'state',i.state,'sourceDepartment',i.source_department,
        'sourceStage',i.source_stage,'sourceWorkState',i.source_work_state,'resumeTarget',i.resume_target,'currentProposalId',i.latest_proposal_id)
        FROM manufacturing_issues i WHERE i.piece_id=$2 ORDER BY i.cycle DESC LIMIT 1),'proposal',NULL) AS facts
    FROM sales_orders h WHERE h.id=$1`,
    [orderId, pieceId],
  );
  return snapshot.rows[0]?.facts;
};

const seedSubmittedGraph = async (client: PoolClient): Promise<WorkFixture> => {
  const ids = {
    orderId: randomUUID(),
    actorId: randomUUID(),
    pieceIds: [randomUUID(), randomUUID()].sort(),
  };
  const customerId = randomUUID(),
    sourceId = randomUUID(),
    entryId = randomUUID();
  const sequence = BigInt(
    `0x${ids.orderId.replaceAll("-", "").slice(0, 12)}`,
  ).toString();
  await client.query(
    `INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at)
    VALUES($1,$2,'test-only','Worker A','ADMIN','ACTIVE',$3,$3,$3)`,
    [ids.actorId, ids.actorId + "@example.test", instant],
  );
  await client.query(
    `INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES($1,'Customer',$2,$3,$3)`,
    [
      customerId,
      `+96650${String(parseInt(customerId.slice(0, 7), 16) % 10000000).padStart(7, "0")}`,
      instant,
    ],
  );
  await client.query(
    `INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest)
    VALUES($1,$2,'P05 isolated','A1:AA942',1,$3,'owned test',1874,'{}')`,
    [sourceId, sourceId.replaceAll("-", "").repeat(2), instant],
  );
  await client.query(
    `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell)
    VALUES($1,$2,'decoration','Z3','Decoration','decoration',1,1800,'AA3')`,
    [entryId, sourceId],
  );
  await client.query(
    `INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at)
    VALUES($1,$2,$3,'SHOP','SUBMITTED',$4,$4)`,
    [ids.orderId, ids.actorId, customerId, instant],
  );
  await client.query(
    `INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at)
    SELECT id,$2,position::int,'SM','40','Base','Decoration','Face',$3,$3 FROM unnest($1::uuid[]) WITH ORDINALITY AS p(id,position)`,
    [ids.pieceIds, ids.orderId, instant],
  );
  await client.query(
    `INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) SELECT id,'decoration',$2 FROM unnest($1::uuid[]) AS p(id)`,
    [ids.pieceIds, entryId],
  );
  await client.query(
    `INSERT INTO sales_orders(id,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount)
    VALUES($1,$2,$3,2026,$4,$5,'Worker A','Customer','+966500000001',$6,3600.00,100.50)`,
    [
      ids.orderId,
      `SHOP-2026-${sequence.padStart(4, "0")}`,
      sequence,
      instant,
      ids.actorId,
      sourceId,
    ],
  );
  await client.query(
    `INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell)
    SELECT id,$2,$3,$4,'Decoration',1800,'AA3' FROM unnest($1::uuid[]) AS p(id)`,
    [ids.pieceIds, ids.orderId, entryId, sourceId],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return ids;
};

const retainInitialApproval = async (client: PoolClient, ids: WorkFixture) => {
  const before = await approvalFacts(client, ids.orderId),
    approvalId = randomUUID();
  await client.query("UPDATE sales_drafts SET version=2 WHERE id=$1", [
    ids.orderId,
  ]);
  await client.query(
    "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
    [ids.orderId, instant],
  );
  await client.query(
    "UPDATE sales_order_pieces SET stage='CUTTING' WHERE order_id=$1",
    [ids.orderId],
  );
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at)
      VALUES($1,'APPROVE_INITIAL',$2,'Worker A','ADMIN',$3,1,1,2,repeat('a',64),$4,$5,
        jsonb_build_object('orderId',$3::uuid,'orderVersion',2,'orderStatus','APPROVED','pieceId',NULL,'pieceStage',NULL,'pieceWorkState',NULL,'issueId',NULL,'issueState',NULL,'proposalId',NULL),$6)`,
    [
      approvalId,
      ids.actorId,
      ids.orderId,
      JSON.stringify(before),
      JSON.stringify(await approvalFacts(client, ids.orderId)),
      instant,
    ],
  );
  return approvalId;
};

const withWorkGraph = async (
  verify: (client: PoolClient, fixture: WorkFixture) => Promise<void>,
) => {
  const connectionString = process.env["P01_TEST_DATABASE_URL"];
  if (!connectionString || connectionString !== process.env["DATABASE_URL"])
    throw new Error("Owned migrated database required");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = await seedSubmittedGraph(client);
    const approvalId = await retainInitialApproval(client, ids);
    await client.query(
      `INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_approval_command_id,entered_at)
      SELECT gen_random_uuid(),order_id,id,'CUTTING',1,'INITIAL_APPROVAL','APPROVAL',$2,$3 FROM sales_order_pieces WHERE order_id=$1`,
      [ids.orderId, approvalId, instant],
    );
    await client.query(
      `UPDATE sales_order_pieces p SET current_work_visit_id=v.id FROM manufacturing_work_visits v WHERE p.id=v.piece_id AND p.order_id=$1`,
      [ids.orderId],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await verify(client, ids);
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }
};

const applyWork = async (
  client: PoolClient,
  fixture: WorkFixture,
  operation: "RECEIVE_AND_START" | "CONTINUE" | "COMPLETE_TRANSFER",
) => {
  const [pieceId] = fixture.pieceIds;
  if (!pieceId) throw new Error("Expected fixture piece");
  const current = await client.query<{
    version: number;
    stage: "CUTTING" | "PRODUCTION";
    work_state: "INCOMING" | "IN_PROGRESS";
    visit_id: string;
  }>(
    `
    SELECT r.version,p.stage,p.work_state,p.current_work_visit_id AS visit_id FROM sales_drafts r JOIN sales_order_pieces p ON p.order_id=r.id WHERE p.id=$1`,
    [pieceId],
  );
  const state = current.rows[0];
  if (!state) throw new Error("Expected current fixture work");
  const commandId = randomUUID(),
    eventId = randomUUID(),
    orderEventId = randomUUID();
  const actorId = operation === "CONTINUE" ? randomUUID() : fixture.actorId;
  const actorName = operation === "CONTINUE" ? "Worker B" : "Worker A";
  if (operation === "CONTINUE")
    await client.query(
      `INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,updated_at)
    VALUES($1,$2,'test-only',$3,'ADMIN','ACTIVE',$4,$4)`,
      [actorId, actorId + "@example.test", actorName, instant],
    );
  const occurredAt = new Date(
    Date.parse(instant) + state.version * 60_000,
  ).toISOString();
  const nextStage =
    operation === "COMPLETE_TRANSFER"
      ? state.stage === "CUTTING"
        ? "PRODUCTION"
        : "QUALITY"
      : state.stage;
  const nextWorkState =
    operation === "COMPLETE_TRANSFER" ? "INCOMING" : "IN_PROGRESS";
  const nextVisitId =
    operation === "COMPLETE_TRANSFER" && state.stage === "CUTTING"
      ? randomUUID()
      : null;
  if (operation === "RECEIVE_AND_START") {
    await client.query(
      `UPDATE manufacturing_work_visits SET received_at=$2,received_command_id=$3,started_at=$2,started_command_id=$3 WHERE id=$1`,
      [state.visit_id, occurredAt, commandId],
    );
  } else if (operation === "COMPLETE_TRANSFER") {
    await client.query(
      `UPDATE manufacturing_work_visits SET ended_at=$2,end_reason='TRANSFERRED',end_manufacturing_command_id=$3,destination=$4::department WHERE id=$1`,
      [state.visit_id, occurredAt, commandId, nextStage],
    );
    if (nextVisitId)
      await client.query(
        `INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_transfer_event_id,entered_at)
      SELECT $1,$2,$3,'PRODUCTION',sequence+1,'DEPARTMENT_TRANSFER','CUTTING',$4,$5 FROM manufacturing_work_visits WHERE id=$6`,
        [
          nextVisitId,
          fixture.orderId,
          pieceId,
          eventId,
          occurredAt,
          state.visit_id,
        ],
      );
  }
  await client.query(
    `UPDATE sales_order_pieces SET stage=$2::sales_piece_stage,work_state=$3::sales_piece_work_state,current_work_visit_id=$4 WHERE id=$1`,
    [
      pieceId,
      nextStage,
      nextWorkState,
      operation === "COMPLETE_TRANSFER" ? nextVisitId : state.visit_id,
    ],
  );
  await client.query("UPDATE sales_drafts SET version=version+1 WHERE id=$1", [
    fixture.orderId,
  ]);
  const outcome = {
    orders: [
      {
        eventId: orderEventId,
        orderId: fixture.orderId,
        beforeVersion: state.version,
        afterVersion: state.version + 1,
        pieces: [
          {
            pieceId,
            visitId: state.visit_id,
            nextVisitId,
            stage: nextStage,
            workState: nextWorkState,
          },
        ],
      },
    ],
  };
  await client.query(
    `INSERT INTO manufacturing_commands(command_id,operation,department,actor_id,actor_full_name,actor_role,payload_hash,outcome,occurred_at)
    VALUES($1,$2::manufacturing_operation,$3::department,$4,$7,'ADMIN',repeat('b',64),$5,$6)`,
    [
      commandId,
      operation,
      state.stage,
      actorId,
      JSON.stringify(outcome),
      occurredAt,
      actorName,
    ],
  );
  await client.query(
    `INSERT INTO manufacturing_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids) VALUES($1,$2,$3,$4,$5,$6::uuid[])`,
    [
      commandId,
      fixture.orderId,
      orderEventId,
      state.version,
      state.version + 1,
      [pieceId],
    ],
  );
  await client.query(
    `INSERT INTO manufacturing_piece_events(id,command_id,order_id,piece_id,visit_id,operation,before_stage,before_work_state,after_stage,after_work_state)
    VALUES($1,$2,$3,$4,$5,$6::manufacturing_operation,$7::sales_piece_stage,$8::sales_piece_work_state,$9::sales_piece_stage,$10::sales_piece_work_state)`,
    [
      eventId,
      commandId,
      fixture.orderId,
      pieceId,
      state.visit_id,
      operation,
      state.stage,
      state.work_state,
      nextStage,
      nextWorkState,
    ],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return { commandId, eventId, visitId: state.visit_id, outcome };
};

const workSnapshot = async (client: PoolClient, fixture: WorkFixture) =>
  (
    await client.query<{ graph: unknown }>(
      `
  SELECT jsonb_build_object('root',(SELECT to_jsonb(r) FROM sales_drafts r WHERE id=$1),
    'header',(SELECT to_jsonb(h) FROM sales_orders h WHERE id=$1),
    'pieces',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM sales_order_pieces p WHERE order_id=$1),
    'visits',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM manufacturing_work_visits v WHERE order_id=$1),
    'orders',(SELECT jsonb_agg(to_jsonb(g) ORDER BY command_id) FROM manufacturing_command_orders g WHERE order_id=$1),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM manufacturing_piece_events e WHERE order_id=$1),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY command_id) FROM manufacturing_commands c WHERE EXISTS(SELECT 1 FROM manufacturing_command_orders g WHERE g.command_id=c.command_id AND g.order_id=$1)),
    'approval',(SELECT jsonb_agg(to_jsonb(c) ORDER BY command_id) FROM approval_commands c WHERE order_id=$1),
    'issues',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM manufacturing_issues i WHERE order_id=$1)) AS graph`,
      [fixture.orderId],
    )
  ).rows;

const returnQualityIssue = async (client: PoolClient, fixture: WorkFixture) => {
  const [pieceId] = fixture.pieceIds;
  if (!pieceId) throw new Error("Expected exact piece");
  const root = (
    await client.query<{ version: number }>(
      "SELECT version FROM sales_drafts WHERE id=$1",
      [fixture.orderId],
    )
  ).rows[0];
  if (!root) throw new Error("Expected locked root");
  const issueId = randomUUID(),
    reportId = randomUUID(),
    returnId = randomUUID();
  const reportedAt = new Date(
    Date.parse(instant) + (root.version + 1) * 60_000,
  ).toISOString();
  const returnedAt = new Date(
    Date.parse(instant) + (root.version + 2) * 60_000,
  ).toISOString();
  const beforeReport = await approvalFacts(client, fixture.orderId, pieceId);
  await client.query(
    `INSERT INTO manufacturing_issues(id,order_id,piece_id,cycle,state,source_department,source_stage,source_work_state,reporter_id,reporter_full_name,reporter_role,reason,reported_at,updated_at,reported_command_id)
    VALUES($1,$2,$3,1,'APPROVAL_REVIEW','QUALITY','QUALITY','INCOMING',$4,'Worker A','ADMIN','Correction needed',$5,$5,$6)`,
    [issueId, fixture.orderId, pieceId, fixture.actorId, reportedAt, reportId],
  );
  await client.query(
    "UPDATE sales_order_pieces SET work_state='BLOCKED',issue_id=$2 WHERE id=$1",
    [pieceId, issueId],
  );
  await client.query("UPDATE sales_drafts SET version=version+1 WHERE id=$1", [
    fixture.orderId,
  ]);
  const insertDecision = async (
    commandId: string,
    operation: "REPORT_ISSUE" | "RESOLVE_ISSUE",
    before: unknown,
    expectedVersion: number,
    occurredAt: string,
  ) => {
    await client.query(
      `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,decision,decision_notes,before_facts,after_facts,outcome,occurred_at)
      SELECT $1,$2::approval_command_operation,$3,'Worker A','ADMIN',$4,$5,$6,$7,$7,$7::int+1,repeat('d',64),$8,$9,$10,$11,
        jsonb_build_object('orderId',$4::uuid,'orderVersion',$7::int+1,'orderStatus','APPROVED','pieceId',$5::uuid,'pieceStage',p.stage,'pieceWorkState',p.work_state,'issueId',$6::uuid,'issueState',i.state,'proposalId',NULL),$12
      FROM sales_order_pieces p JOIN manufacturing_issues i ON i.piece_id=p.id WHERE p.id=$5 AND i.id=$6`,
      [
        commandId,
        operation,
        fixture.actorId,
        fixture.orderId,
        pieceId,
        issueId,
        expectedVersion,
        operation === "RESOLVE_ISSUE" ? "RETURN_TO_DEPARTMENT" : null,
        operation === "RESOLVE_ISSUE" ? "Approved correction" : null,
        JSON.stringify(before),
        JSON.stringify(await approvalFacts(client, fixture.orderId, pieceId)),
        occurredAt,
      ],
    );
  };
  await insertDecision(
    reportId,
    "REPORT_ISSUE",
    beforeReport,
    root.version,
    reportedAt,
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  const beforeReturn = await approvalFacts(client, fixture.orderId, pieceId);
  await client.query(
    "UPDATE manufacturing_issues SET state='RESOLVED',resume_target='CUTTING',resolution_command_id=$2,resolved_at=$3,updated_at=$3 WHERE id=$1",
    [issueId, returnId, returnedAt],
  );
  await client.query(
    "UPDATE sales_order_pieces SET stage='CUTTING',work_state='INCOMING',issue_id=NULL WHERE id=$1",
    [pieceId],
  );
  await client.query("UPDATE sales_drafts SET version=version+1 WHERE id=$1", [
    fixture.orderId,
  ]);
  const visitId = randomUUID();
  await client.query(
    `INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_approval_command_id,source_issue_id,instructions,entered_at)
    SELECT $1,$2,$3,'CUTTING',max(sequence)+1,'APPROVAL_RETURN','APPROVAL',$4,$5,'Approved correction',$6 FROM manufacturing_work_visits WHERE piece_id=$3`,
    [visitId, fixture.orderId, pieceId, returnId, issueId, returnedAt],
  );
  await client.query(
    "UPDATE sales_order_pieces SET current_work_visit_id=$2 WHERE id=$1",
    [pieceId, visitId],
  );
  await insertDecision(
    returnId,
    "RESOLVE_ISSUE",
    beforeReturn,
    root.version + 1,
    returnedAt,
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return visitId;
};

it("validates delayed witnesses and preserves all earlier outcomes through normal subsequent work", async () => {
  await withWorkGraph(async (client, fixture) => {
    const started = await applyWork(client, fixture, "RECEIVE_AND_START");
    await applyWork(client, fixture, "CONTINUE");
    await applyWork(client, fixture, "COMPLETE_TRANSFER");
    await applyWork(client, fixture, "RECEIVE_AND_START");
    await applyWork(client, fixture, "COMPLETE_TRANSFER");
    expect(
      (
        await client.query(
          "SELECT outcome FROM manufacturing_commands WHERE command_id=$1",
          [started.commandId],
        )
      ).rows,
    ).toEqual([{ outcome: started.outcome }]);
    const states = (
      await client.query(
        "SELECT stage,work_state,received_at,current_work_visit_id FROM sales_order_pieces WHERE order_id=$1 ORDER BY id",
        [fixture.orderId],
      )
    ).rows;
    expect(states).toEqual([
      {
        stage: "QUALITY",
        work_state: "INCOMING",
        received_at: null,
        current_work_visit_id: null,
      },
      expect.objectContaining({
        stage: "CUTTING",
        work_state: "INCOMING",
        received_at: null,
      }),
    ]);
    expect(
      (
        await client.query(
          "SELECT total_amount::text AS total,paid_amount::text AS paid FROM sales_orders WHERE id=$1",
          [fixture.orderId],
        )
      ).rows,
    ).toEqual([{ total: "3600.00", paid: "100.50" }]);
    const earlierCommands = await client.query<{
      command_id: string;
      outcome: unknown;
    }>(
      "SELECT command_id,outcome FROM manufacturing_commands WHERE command_id IN (SELECT command_id FROM manufacturing_command_orders WHERE order_id=$1) ORDER BY command_id",
      [fixture.orderId],
    );
    const returnedVisitId = await returnQualityIssue(client, fixture);
    await applyWork(client, fixture, "RECEIVE_AND_START");
    await applyWork(client, fixture, "COMPLETE_TRANSFER");
    expect(
      (
        await client.query(
          "SELECT origin_kind,end_reason FROM manufacturing_work_visits WHERE id=$1",
          [returnedVisitId],
        )
      ).rows,
    ).toEqual([{ origin_kind: "APPROVAL_RETURN", end_reason: "TRANSFERRED" }]);
    expect(
      (
        await client.query(
          "SELECT outcome FROM manufacturing_commands WHERE command_id=$1",
          [started.commandId],
        )
      ).rows,
    ).toEqual([{ outcome: started.outcome }]);
    expect(
      (
        await client.query(
          "SELECT command_id,outcome FROM manufacturing_commands WHERE command_id=ANY($1::uuid[]) ORDER BY command_id",
          [earlierCommands.rows.map((command) => command.command_id)],
        )
      ).rows,
    ).toEqual(earlierCommands.rows);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  });
});

it.each([
  ["missing selected piece event", "ck_manufacturing_event_binding"],
  ["nested private outcome", "ck_manufacturing_command_graph"],
  ["second ledger at the same head", "ck_manufacturing_command_graph"],
] as const)(
  "rejects %s and rolls back the entire new head",
  async (scenario, constraint) => {
    await withWorkGraph(async (client, fixture) => {
      const started = await applyWork(client, fixture, "RECEIVE_AND_START");
      const before = await workSnapshot(client, fixture);
      const originalOrder = started.outcome.orders[0];
      if (!originalOrder) throw new Error("Expected original order outcome");
      const commandId = randomUUID(),
        eventId = randomUUID();
      const order = {
        ...originalOrder,
        eventId,
        beforeVersion: 3,
        afterVersion: 4,
      };
      const outcome =
        scenario === "nested private outcome"
          ? {
              orders: [
                {
                  ...order,
                  pieces: order.pieces.map((piece) => ({
                    ...piece,
                    money: { total: "3600.00" },
                  })),
                },
              ],
            }
          : { orders: [order] };
      await client.query("SAVEPOINT invalid_command");
      await client.query("UPDATE sales_drafts SET version=4 WHERE id=$1", [
        fixture.orderId,
      ]);
      await client.query(
        `INSERT INTO manufacturing_commands SELECT (jsonb_populate_record(NULL::manufacturing_commands,to_jsonb(c)||$2::jsonb)).* FROM manufacturing_commands c WHERE command_id=$1`,
        [
          started.commandId,
          JSON.stringify({
            command_id: commandId,
            operation: "CONTINUE",
            outcome,
            occurred_at: "2026-11-11T08:04:00.000Z",
          }),
        ],
      );
      await client.query(
        `INSERT INTO manufacturing_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids) VALUES($1,$2,$3,3,4,$4::uuid[])`,
        [
          commandId,
          fixture.orderId,
          eventId,
          scenario === "missing selected piece event"
            ? fixture.pieceIds
            : [fixture.pieceIds[0]],
        ],
      );
      await client.query(
        `INSERT INTO manufacturing_piece_events SELECT (jsonb_populate_record(NULL::manufacturing_piece_events,to_jsonb(e)||$2::jsonb)).* FROM manufacturing_piece_events e WHERE command_id=$1`,
        [
          started.commandId,
          JSON.stringify({
            id: randomUUID(),
            command_id: commandId,
            operation: "CONTINUE",
            before_work_state: "IN_PROGRESS",
          }),
        ],
      );
      if (scenario === "second ledger at the same head")
        await client.query(
          `INSERT INTO sales_commands(command_id,operation,actor_id,actor_full_name,actor_role,request_target_id,draft_id,expected_version,before_version,after_version,payload_hash,before,after,occurred_at)
      VALUES($1,'SET_ORDER_PAID',$2,'Worker A','ADMIN',$3,$3,3,3,4,repeat('c',64),'{}','{}',$4)`,
          [randomUUID(), fixture.actorId, fixture.orderId, instant],
        );
      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({ code: "23514", constraint });
      await client.query("ROLLBACK TO SAVEPOINT invalid_command");
      expect(await workSnapshot(client, fixture)).toEqual(before);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM manufacturing_commands WHERE command_id=$1",
            [commandId],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    });
  },
);

it("keeps all circular work witnesses deferred and restricts deletion", async () => {
  await withWorkGraph(async (client) => {
    const constraints = await client.query<{
      conname: string;
      condeferrable: boolean;
      condeferred: boolean;
      confdeltype: string;
    }>(
      `SELECT conname,condeferrable,condeferred,confdeltype FROM pg_constraint WHERE conname=ANY($1::text[])`,
      [
        [
          "sales_order_pieces_current_work_visit_fkey",
          "manufacturing_work_visits_source_approval_command_id_fkey",
          "manufacturing_work_visits_source_transfer_fkey",
          "manufacturing_work_visits_received_command_id_fkey",
          "manufacturing_work_visits_started_command_id_fkey",
          "manufacturing_work_visits_end_manufacturing_command_id_fkey",
          "manufacturing_work_visits_end_approval_command_id_fkey",
          "manufacturing_piece_events_visit_fkey",
        ],
      ],
    );
    expect(constraints.rows).toHaveLength(8);
    for (const constraint of constraints.rows)
      expect(constraint).toMatchObject({
        condeferrable: true,
        condeferred: true,
        confdeltype: "r",
      });
  });
});

it.each([
  ["malformed payload hash", { payload_hash: "invalid" }],
  [
    "employee without matching department",
    { actor_role: "USER", actor_department: null },
  ],
  ["absent safe outcome orders", { outcome: {} }],
] as const)(
  "rejects %s before retaining any command",
  async (_label, patch) => {
    await withWorkGraph(async (client, fixture) => {
      const started = await applyWork(client, fixture, "RECEIVE_AND_START"),
        before = await workSnapshot(client, fixture);
      await client.query("SAVEPOINT invalid_shape");
      await expect(
        client.query(
          `INSERT INTO manufacturing_commands SELECT (jsonb_populate_record(NULL::manufacturing_commands,to_jsonb(c)||$2::jsonb)).* FROM manufacturing_commands c WHERE command_id=$1`,
          [
            started.commandId,
            JSON.stringify({ ...patch, command_id: randomUUID() }),
          ],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_manufacturing_command_shape",
      });
      await client.query("ROLLBACK TO SAVEPOINT invalid_shape");
      expect(await workSnapshot(client, fixture)).toEqual(before);
    });
  },
);

it("rejects a non-adjacent order version and a fabricated origin without masking nulls", async () => {
  await withWorkGraph(async (client, fixture) => {
    const before = await workSnapshot(client, fixture);
    await client.query("SAVEPOINT invalid_binding");
    await expect(
      client.query(
        `INSERT INTO manufacturing_command_orders(command_id,order_id,event_id,before_version,after_version,piece_ids) VALUES($1,$2,$3,3,5,$4::uuid[])`,
        [randomUUID(), fixture.orderId, randomUUID(), fixture.pieceIds],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_command_order_version",
    });
    await client.query("ROLLBACK TO SAVEPOINT invalid_binding");
    await expect(
      client.query(
        `INSERT INTO manufacturing_work_visits SELECT (jsonb_populate_record(NULL::manufacturing_work_visits,to_jsonb(v)||jsonb_build_object('id',gen_random_uuid(),'sequence',2,'source_approval_command_id',NULL))).* FROM manufacturing_work_visits v WHERE piece_id=$1`,
        [fixture.pieceIds[0]],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_visit_origin",
    });
    await client.query("ROLLBACK TO SAVEPOINT invalid_binding");
    expect(await workSnapshot(client, fixture)).toEqual(before);
  });
});

it.each([
  [
    "null claimed source",
    "UPDATE manufacturing_work_visits SET source_approval_command_id=NULL WHERE piece_id=$1",
    "ck_manufacturing_retained",
  ],
  [
    "receipt before entry",
    "UPDATE manufacturing_work_visits SET received_at='2026-11-11T07:00:00Z',started_at='2026-11-11T07:00:00Z',received_command_id=gen_random_uuid(),started_command_id=gen_random_uuid() WHERE piece_id=$1",
    "ck_manufacturing_visit_times",
  ],
] as const)(
  "rejects %s with original fields unchanged",
  async (_label, sql, constraint) => {
    await withWorkGraph(async (client, fixture) => {
      const before = await workSnapshot(client, fixture);
      await client.query("SAVEPOINT invalid_visit");
      await expect(
        client.query(sql, [fixture.pieceIds[0]]),
      ).rejects.toMatchObject({ code: "23514", constraint });
      await client.query("ROLLBACK TO SAVEPOINT invalid_visit");
      expect(await workSnapshot(client, fixture)).toEqual(before);
    });
  },
);

it("rejects a second completion under another command identity and prevents reopening its ended visit", async () => {
  await withWorkGraph(async (client, fixture) => {
    await applyWork(client, fixture, "RECEIVE_AND_START");
    const completed = await applyWork(client, fixture, "COMPLETE_TRANSFER");
    const before = await workSnapshot(client, fixture);
    await client.query("SAVEPOINT repeated_completion");
    await expect(
      client.query(
        `INSERT INTO manufacturing_piece_events SELECT (jsonb_populate_record(NULL::manufacturing_piece_events,to_jsonb(e)||jsonb_build_object('id',gen_random_uuid(),'command_id',gen_random_uuid()))).* FROM manufacturing_piece_events e WHERE id=$1`,
        [completed.eventId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "manufacturing_piece_events_one_completion_key",
    });
    await client.query("ROLLBACK TO SAVEPOINT repeated_completion");
    await expect(
      client.query(
        "UPDATE manufacturing_work_visits SET ended_at=NULL,end_reason=NULL,end_manufacturing_command_id=NULL,destination=NULL WHERE id=$1",
        [completed.visitId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_retained",
    });
    await client.query("ROLLBACK TO SAVEPOINT repeated_completion");
    expect(await workSnapshot(client, fixture)).toEqual(before);
  });
});

it.each([
  [
    "orphan current pointer",
    "UPDATE sales_order_pieces SET current_work_visit_id=NULL WHERE id=$1",
    "ck_manufacturing_current_visit_graph",
  ],
  [
    "arbitrary core update",
    "UPDATE sales_order_pieces SET work_state='IN_PROGRESS' WHERE id=$1",
    "ck_manufacturing_current_visit_graph",
  ],
  [
    "unwitnessed root head",
    "UPDATE sales_drafts SET version=version+1 WHERE id=(SELECT order_id FROM sales_order_pieces WHERE id=$1)",
    "ck_manufacturing_command_graph",
  ],
] as const)(
  "rejects %s without changing the exact committed graph",
  async (_label, sql, constraint) => {
    await withWorkGraph(async (client, fixture) => {
      const before = await workSnapshot(client, fixture);
      await client.query("SAVEPOINT invalid_graph");
      const pieceId = fixture.pieceIds[0];
      await client.query(sql, [pieceId]);
      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({ code: "23514", constraint });
      await client.query("ROLLBACK TO SAVEPOINT invalid_graph");
      expect(await workSnapshot(client, fixture)).toEqual(before);
    });
  },
);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationRoot = join(packageRoot, "prisma/migrations");
const p05Migration = "20261111000100_p05_manufacturing_workspaces";
const migrationSql = (name: string) =>
  readFileSync(join(migrationRoot, name, "migration.sql"), "utf8");
const execFileAsync = promisify(execFile);
const runPrisma = async (uri: string, args: readonly string[]) => {
  const pnpmScript = process.env["npm_execpath"];
  if (!pnpmScript) throw new Error("Owned migration test requires pnpm");
  try {
    await execFileAsync(
      process.execPath,
      [pnpmScript, "exec", "prisma", ...args],
      {
        cwd: packageRoot,
        env: { ...process.env, DATABASE_URL: uri },
        timeout: 180_000,
        windowsHide: true,
      },
    );
  } catch {
    throw new Error(
      "Owned upgrade CLI failed; connection diagnostics withheld",
    );
  }
};

const withUpgradeDatabase = async (
  verify: (
    client: PoolClient,
    uri: string,
    fixture: WorkFixture,
  ) => Promise<void>,
) => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (!marker || marker !== process.env["DATABASE_URL"])
    throw new Error("Owned database required");
  const admin = new Pool({ connectionString: marker });
  const childName = "p05_upgrade_" + randomUUID().replaceAll("-", "");
  let child: Pool | undefined, client: PoolClient | undefined;
  let created = false;
  try {
    const [selected] = (
      await admin.query<{ name: string }>("SELECT current_database() AS name")
    ).rows;
    if (selected?.name !== new URL(marker).pathname.slice(1))
      throw new Error("Owned database mismatch");
    await admin.query(`CREATE DATABASE "${childName}"`);
    created = true;
    const url = new URL(marker);
    url.pathname = "/" + childName;
    const uri = url.toString();
    child = new Pool({ connectionString: uri });
    client = await child.connect();
    const priorNames = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < p05Migration)
      .map((entry) => entry.name)
      .sort();
    let fixture: WorkFixture | undefined;
    for (const name of priorNames) {
      await client.query(migrationSql(name));
      await runPrisma(uri, ["migrate", "resolve", "--applied", name]);
      if (name === "20261106000300_p03_preserve_frozen_decoration_selection") {
        await client.query("BEGIN");
        fixture = await seedSubmittedGraph(client);
        await client.query(
          "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
          [fixture.orderId, instant],
        );
        await client.query(
          "UPDATE sales_order_pieces SET stage='CUTTING',work_state=CASE WHEN id=$2 THEN 'IN_PROGRESS'::sales_piece_work_state ELSE 'INCOMING'::sales_piece_work_state END WHERE order_id=$1",
          [fixture.orderId, fixture.pieceIds[0]],
        );
        const held = await seedSubmittedGraph(client);
        await client.query(
          "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
          [held.orderId, instant],
        );
        await client.query(
          "UPDATE sales_order_pieces SET stage=CASE WHEN id=$2 THEN 'QUALITY'::sales_piece_stage ELSE 'CUTTING'::sales_piece_stage END,work_state=CASE WHEN id=$2 THEN 'INCOMING'::sales_piece_work_state ELSE 'BLOCKED'::sales_piece_work_state END WHERE order_id=$1",
          [held.orderId, held.pieceIds[0]],
        );
        const downstream = await seedSubmittedGraph(client);
        await client.query(
          "UPDATE sales_orders SET status='APPROVED',approved_at=$2,total_amount=1800.00 WHERE id=$1",
          [downstream.orderId, instant],
        );
        await client.query(
          "UPDATE sales_order_pieces SET stage=CASE WHEN id=$2 THEN 'WAREHOUSE'::sales_piece_stage ELSE 'CANCELLED'::sales_piece_stage END,work_state=CASE WHEN id=$2 THEN 'COMPLETED'::sales_piece_work_state ELSE 'BLOCKED'::sales_piece_work_state END,received_at=CASE WHEN id=$2 THEN $3::timestamptz END,cancelled_at=CASE WHEN id<>$2 THEN $3::timestamptz END,cancellation_reason=CASE WHEN id<>$2 THEN 'Retained cancellation' END WHERE order_id=$1",
          [downstream.orderId, downstream.pieceIds[0], instant],
        );
        const quality = await seedSubmittedGraph(client);
        await client.query(
          "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
          [quality.orderId, instant],
        );
        await client.query(
          "UPDATE sales_order_pieces SET stage='QUALITY',work_state='IN_PROGRESS' WHERE order_id=$1",
          [quality.orderId],
        );
        await client.query("COMMIT");
      }
    }
    if (!fixture) throw new Error("Expected populated historical fixture");
    await verify(client, uri, fixture);
  } finally {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    await child?.end();
    try {
      if (created) await admin.query(`DROP DATABASE "${childName}"`);
    } finally {
      await admin.end();
    }
  }
};

const deployHistoricalP05 = async (
  client: PoolClient,
  uri: string,
): Promise<void> => {
  const applied = await client.query<{
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>(
    "SELECT finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1",
    [p05Migration],
  );
  if (applied.rows.length > 0) {
    if (
      applied.rows.length !== 1 ||
      applied.rows[0]?.finished_at === null ||
      applied.rows[0]?.rolled_back_at !== null
    )
      throw new Error(
        "Historical P05 boundary has a failed or incomplete migration entry",
      );
    return;
  }
  await client.query(migrationSql(p05Migration));
  await runPrisma(uri, ["migrate", "resolve", "--applied", p05Migration]);
};

it("preserves populated legacy incoming/unknown-start work and retained source approval through repeated deployment", async () => {
  await withUpgradeDatabase(async (client, uri, fixture) => {
    await client.query("BEGIN");
    const known = await seedSubmittedGraph(client);
    const approvalId = await retainInitialApproval(client, known);
    await client.query("COMMIT");
    await client.query(
      "UPDATE sales_order_pieces SET work_state='IN_PROGRESS' WHERE id=$1",
      [known.pieceIds[0]],
    );
    const original = await client.query(
      `SELECT (to_jsonb(p)-'current_work_visit_id') AS piece FROM sales_order_pieces p ORDER BY id`,
    );
    const originalRoots = await client.query(
      "SELECT * FROM sales_drafts ORDER BY id",
    );
    const priorLedger = await client.query(
      "SELECT * FROM _prisma_migrations ORDER BY migration_name",
    );
    await deployHistoricalP05(client, uri);
    expect(
      (
        await client.query(
          "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1",
        )
      ).rows,
    ).toEqual([{ migration_name: p05Migration }]);
    expect(
      (await client.query("SELECT to_regclass('quality_commands') AS quality"))
        .rows,
    ).toEqual([{ quality: null }]);

    expect(
      (
        await client.query(
          `SELECT (to_jsonb(p)-'current_work_visit_id') AS piece FROM sales_order_pieces p ORDER BY id`,
        )
      ).rows,
    ).toEqual(original.rows);
    expect(
      (await client.query("SELECT * FROM sales_drafts ORDER BY id")).rows,
    ).toEqual(originalRoots.rows);
    expect(
      (
        await client.query(
          "SELECT * FROM _prisma_migrations WHERE migration_name<>$1 ORDER BY migration_name",
          [p05Migration],
        )
      ).rows,
    ).toEqual(priorLedger.rows);
    const visits = await client.query(
      `SELECT piece_id,origin_kind,entered_at,received_at,started_at,started_command_id,legacy_unknown_start,source_approval_command_id FROM manufacturing_work_visits WHERE order_id=$1 ORDER BY piece_id`,
      [fixture.orderId],
    );
    expect(visits.rows).toEqual(
      fixture.pieceIds.map((pieceId, index) => ({
        piece_id: pieceId,
        origin_kind: "LEGACY_BASELINE",
        entered_at: null,
        received_at: null,
        started_at: null,
        started_command_id: null,
        legacy_unknown_start: index === 0,
        source_approval_command_id: null,
      })),
    );
    expect(
      (
        await client.query(
          "SELECT origin_kind,source_approval_command_id,entered_at,started_at,legacy_unknown_start FROM manufacturing_work_visits WHERE order_id=$1 ORDER BY piece_id",
          [known.orderId],
        )
      ).rows,
    ).toEqual(
      known.pieceIds.map((_pieceId, index) => ({
        origin_kind: "INITIAL_APPROVAL",
        source_approval_command_id: approvalId,
        entered_at: new Date(instant),
        started_at: null,
        legacy_unknown_start: index === 0,
      })),
    );
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM manufacturing_commands",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM manufacturing_work_visits",
        )
      ).rows,
    ).toEqual([{ count: 4 }]);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM sales_order_pieces WHERE (stage IN ('QUALITY','WAREHOUSE','CANCELLED') OR work_state='BLOCKED') AND current_work_visit_id IS NOT NULL",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    const applied = await client.query(
      "SELECT * FROM _prisma_migrations ORDER BY migration_name",
    );
    await deployHistoricalP05(client, uri);
    expect(
      (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows,
    ).toEqual(applied.rows);

    // Trusted future-source consumption only: this is not a P06 inspection decision.
    const qualityPieces = await client.query<{ id: string; order_id: string }>(
      "SELECT id,order_id FROM sales_order_pieces WHERE stage='QUALITY' AND work_state='IN_PROGRESS' ORDER BY id",
    );
    const qualityOrderId = qualityPieces.rows[0]?.order_id;
    if (!qualityOrderId || qualityPieces.rows.length !== 2)
      throw new Error("Expected exactly two legacy quality source pieces");
    const referenceId = randomUUID();
    await client.query("BEGIN");
    for (const [index, piece] of qualityPieces.rows.entries()) {
      const visitId = randomUUID();
      await client.query(
        `INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_reference_id,source_correction_cycle,source_order_version,instructions,entered_at)
        VALUES($1,$2,$3,'CUTTING',1,'QUALITY_CORRECTION','QUALITY',$4,$5,2,'Retained source guidance',$6)`,
        [visitId, qualityOrderId, piece.id, referenceId, index + 1, instant],
      );
      await client.query(
        "UPDATE sales_order_pieces SET stage='CUTTING',work_state='INCOMING',current_work_visit_id=$2 WHERE id=$1",
        [piece.id, visitId],
      );
    }
    await client.query("UPDATE sales_drafts SET version=2 WHERE id=$1", [
      qualityOrderId,
    ]);
    await client.query("COMMIT");
    expect(
      (
        await client.query(
          "SELECT source_reference_id,source_order_version,source_correction_cycle,started_at FROM manufacturing_work_visits WHERE order_id=$1 ORDER BY source_correction_cycle",
          [qualityOrderId],
        )
      ).rows,
    ).toEqual(
      [1, 2].map((cycle) => ({
        source_reference_id: referenceId,
        source_order_version: 2,
        source_correction_cycle: cycle,
        started_at: null,
      })),
    );
  });
});

it("refuses a contradictory legacy current graph atomically without changing old rows or leaving a partial schema", async () => {
  await withUpgradeDatabase(async (client, _uri, fixture) => {
    await client.query(
      "UPDATE sales_orders SET status='CANCELLED' WHERE id=$1",
      [fixture.orderId],
    );
    const before = await client.query(
      "SELECT * FROM sales_order_pieces ORDER BY id",
    );
    await expect(
      client.query(migrationSql(p05Migration)),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_current_visit_graph",
    });
    await client.query("ROLLBACK");
    expect(
      (await client.query("SELECT * FROM sales_order_pieces ORDER BY id")).rows,
    ).toEqual(before.rows);
    expect(
      (
        await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('manufacturing_commands','manufacturing_work_visits')",
        )
      ).rows,
    ).toEqual([]);
  });
});

it.each([
  [
    "history erase",
    "DELETE FROM manufacturing_commands WHERE command_id=$1",
    "23514",
    "ck_manufacturing_retained",
  ],
  [
    "original start replacement",
    "UPDATE manufacturing_work_visits SET started_at=started_at+interval '1 second' WHERE id=(SELECT visit_id FROM manufacturing_piece_events WHERE command_id=$1)",
    "23514",
    "ck_manufacturing_retained",
  ],
  [
    "duplicate open visit",
    "INSERT INTO manufacturing_work_visits SELECT (jsonb_populate_record(NULL::manufacturing_work_visits,to_jsonb(v)||jsonb_build_object('id',gen_random_uuid(),'sequence',sequence+1))).* FROM manufacturing_work_visits v WHERE id=(SELECT visit_id FROM manufacturing_piece_events WHERE command_id=$1)",
    "23505",
    "manufacturing_work_visits_one_open_piece_key",
  ],
] as const)(
  "rejects %s and retains original receipt/start",
  async (_label, sql, code, constraint) => {
    await withWorkGraph(async (client, fixture) => {
      const started = await applyWork(client, fixture, "RECEIVE_AND_START"),
        before = await workSnapshot(client, fixture);
      await client.query("SAVEPOINT retained_graph");
      await expect(
        client.query(sql, [started.commandId]),
      ).rejects.toMatchObject({ code, constraint });
      await client.query("ROLLBACK TO SAVEPOINT retained_graph");
      expect(await workSnapshot(client, fixture)).toEqual(before);
    });
  },
);
