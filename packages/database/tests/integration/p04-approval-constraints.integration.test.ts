import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { expect, it } from "vitest";

type Fixture = {
  ownerId: string;
  customerId: string;
  sourceId: string;
  entryId: string;
  orderId: string;
  pieceId: string;
};
const fixture = (): Fixture => ({
  ownerId: randomUUID(),
  customerId: randomUUID(),
  sourceId: randomUUID(),
  entryId: randomUUID(),
  orderId: randomUUID(),
  pieceId: randomUUID(),
});
const withSubmittedGraph = async (
  verify: (client: PoolClient, ids: Fixture) => Promise<void>,
) => {
  const connectionString = process.env["P01_TEST_DATABASE_URL"];
  if (!connectionString || connectionString !== process.env["DATABASE_URL"])
    throw new Error("Owned migrated test database is required");
  const pool = new Pool({ connectionString });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const ids = fixture();
    const sequence = BigInt(
      `0x${ids.orderId.replaceAll("-", "").slice(0, 12)}`,
    ).toString();
    await client.query(
      `INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at)
      VALUES ($1,$2,'isolated-test-hash','Sales A','ADMIN','ACTIVE',now(),now(),now())`,
      [ids.ownerId, `${ids.ownerId}@example.test`],
    );
    await client.query(
      `INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES ($1,'Customer',$2,now(),now())`,
      [
        ids.customerId,
        `+96650${String(parseInt(ids.customerId.slice(0, 7), 16) % 10000000).padStart(7, "0")}`,
      ],
    );
    await client.query(
      `INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest)
      VALUES ($1,$2,'synthetic isolated source','A1:AA942',1,now(),'owned test',1874,'{}')`,
      [ids.sourceId, ids.sourceId.replaceAll("-", "").repeat(2)],
    );
    await client.query(
      `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell)
      VALUES ($1,$2,'decoration','Z3','Decoration','decoration',1,1800.00,'AA3')`,
      [ids.entryId, ids.sourceId],
    );
    await client.query(
      `INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at)
      VALUES ($1,$2,$3,'SHOP','SUBMITTED',now(),now())`,
      [ids.orderId, ids.ownerId, ids.customerId],
    );
    await client.query(
      `INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at)
      VALUES ($1,$2,1,'SM','40','Base','Decoration','custom face',now(),now())`,
      [ids.pieceId, ids.orderId],
    );
    await client.query(
      `INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) VALUES ($1,'decoration',$2)`,
      [ids.pieceId, ids.entryId],
    );
    await client.query(
      `INSERT INTO sales_orders(id,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount)
      VALUES ($1,$2,$3,2026,now(),$4,'Sales A','Customer','+966500000001',$5,1800.00,0.00)`,
      [
        ids.orderId,
        `SHOP-2026-${sequence.padStart(4, "0")}`,
        sequence,
        ids.ownerId,
        ids.sourceId,
      ],
    );
    await client.query(
      `INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell)
      VALUES ($1,$2,$3,$4,'Decoration',1800.00,'AA3')`,
      [ids.pieceId, ids.orderId, ids.entryId, ids.sourceId],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await verify(client, ids);
  } finally {
    try {
      if (client) await client.query("ROLLBACK");
    } finally {
      client?.release();
      await pool.end();
    }
  }
};

it("installs all seven deferred circular bindings on the isolated migrated graph", async () => {
  await withSubmittedGraph(async (client) => {
    const constraints = await client.query<{
      conname: string;
      condeferrable: boolean;
      condeferred: boolean;
      confdeltype: string;
    }>(
      `SELECT conname,condeferrable,condeferred,confdeltype FROM pg_constraint WHERE conname=ANY($1::text[])`,
      [
        [
          "manufacturing_issues_reported_command_fkey",
          "manufacturing_issues_resolution_command_fkey",
          "piece_contact_proposals_submitted_command_fkey",
          "manufacturing_issues_latest_proposal_fkey",
          "sales_order_pieces_current_issue_fkey",
          "approval_commands_issue_fkey",
          "approval_commands_proposal_fkey",
        ],
      ],
    );
    expect(constraints.rows).toHaveLength(7);
    for (const constraint of constraints.rows)
      expect(constraint).toMatchObject({
        condeferrable: true,
        condeferred: true,
        confdeltype: "r",
      });
  });
});
it("rejects a new approval without a command at the deferred boundary and rolls back its release", async () => {
  await withSubmittedGraph(async (client, ids) => {
    await client.query("SAVEPOINT missing_witness");
    await client.query("UPDATE sales_drafts SET version=2 WHERE id=$1", [
      ids.orderId,
    ]);
    await client.query(
      "UPDATE sales_orders SET status='APPROVED',approved_at=now() WHERE id=$1",
      [ids.orderId],
    );
    await client.query(
      "UPDATE sales_order_pieces SET stage='CUTTING' WHERE order_id=$1",
      [ids.orderId],
    );
    await expect(
      client.query("SET CONSTRAINTS p04_initial_approval_binding IMMEDIATE"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_p04_initial_approval_binding",
    });
    await client.query("ROLLBACK TO SAVEPOINT missing_witness");
    const root = await client.query(
      "SELECT r.version,h.status,h.approved_at,p.stage FROM sales_drafts r JOIN sales_orders h ON h.id=r.id JOIN sales_order_pieces p ON p.order_id=r.id WHERE r.id=$1",
      [ids.orderId],
    );
    expect(root.rows).toEqual([
      {
        version: 1,
        status: "AWAITING_APPROVAL",
        approved_at: null,
        stage: "AWAITING_APPROVAL",
      },
    ]);
    const commands = await client.query(
      "SELECT count(*)::int AS count FROM approval_commands WHERE order_id=$1",
      [ids.orderId],
    );
    expect(commands.rows).toEqual([{ count: 0 }]);
  });
});

const readFacts = async (client: PoolClient, ids: Fixture) => {
  const stored = await client.query<{ facts: unknown }>(
    `SELECT jsonb_build_object(
 'orderStatus',h.status,'approvedAt',h.approved_at,'currentReturn',NULL,
 'money',jsonb_build_object('total',h.total_amount::text,'paidAmount',h.paid_amount::text,'remainingDue',greatest(h.total_amount-h.paid_amount,0)::text,'surplus',greatest(h.paid_amount-h.total_amount,0)::text),
 'counts',jsonb_build_object('original',1,'active',CASE WHEN p.stage='CANCELLED' THEN 0 ELSE 1 END,'cancelled',CASE WHEN p.stage='CANCELLED' THEN 1 ELSE 0 END,'received',0,'completionPercent',0),
 'pieces',jsonb_build_array(jsonb_build_object('id',p.id,'stage',p.stage,'workState',p.work_state,'issueId',p.issue_id,'receivedAt',p.received_at,'cancelledAt',p.cancelled_at,'cancellationReason',p.cancellation_reason)),
 'issue',(SELECT jsonb_build_object('id',i.id,'state',i.state,'sourceDepartment',i.source_department,'sourceStage',i.source_stage,'sourceWorkState',i.source_work_state,'resumeTarget',i.resume_target,'currentProposalId',i.latest_proposal_id) FROM manufacturing_issues i WHERE i.piece_id=p.id ORDER BY i.cycle DESC LIMIT 1),
 'proposal',NULL) AS facts FROM sales_orders h JOIN sales_order_pieces p ON p.order_id=h.id WHERE h.id=$1`,
    [ids.orderId],
  );
  return stored.rows[0]?.facts;
};
const establishReportedIssue = async (client: PoolClient, ids: Fixture) => {
  const approveId = randomUUID(),
    issueId = randomUUID(),
    reportId = randomUUID();
  const beforeApprove = await readFacts(client, ids);
  await client.query("UPDATE sales_drafts SET version=2 WHERE id=$1", [
    ids.orderId,
  ]);
  await client.query(
    "UPDATE sales_orders SET status='APPROVED',approved_at='2026-11-07T01:00:00Z' WHERE id=$1",
    [ids.orderId],
  );
  await client.query(
    "UPDATE sales_order_pieces SET stage='CUTTING' WHERE id=$1",
    [ids.pieceId],
  );
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'APPROVE_INITIAL',$2,'Data fixture','ADMIN',$3,1,1,2,repeat('a',64),$4,$5,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',2,'orderStatus','APPROVED','pieceId',NULL,'pieceStage',NULL,'pieceWorkState',NULL,'issueId',NULL,'issueState',NULL,'proposalId',NULL),'2026-11-07T01:00:00Z')`,
    [
      approveId,
      ids.ownerId,
      ids.orderId,
      JSON.stringify(beforeApprove),
      JSON.stringify(await readFacts(client, ids)),
    ],
  );
  await client.query(
    `INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_approval_command_id,entered_at)
    VALUES(gen_random_uuid(),$1,$2,'CUTTING',1,'INITIAL_APPROVAL','APPROVAL',$3,'2026-11-07T01:00:00Z')`,
    [ids.orderId, ids.pieceId, approveId],
  );
  await client.query(
    `UPDATE sales_order_pieces p SET current_work_visit_id=v.id FROM manufacturing_work_visits v WHERE p.id=v.piece_id AND p.id=$1`,
    [ids.pieceId],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  const beforeReport = await readFacts(client, ids);
  await client.query(
    `INSERT INTO manufacturing_issues(id,order_id,piece_id,cycle,state,source_department,source_stage,source_work_state,reporter_id,reporter_full_name,reporter_role,reason,reported_at,updated_at,reported_command_id)
 VALUES($1,$2,$3,1,'APPROVAL_REVIEW','CUTTING','CUTTING','INCOMING',$4,'Data fixture','ADMIN','Material issue','2026-11-07T02:00:00Z','2026-11-07T02:00:00Z',$5)`,
    [issueId, ids.orderId, ids.pieceId, ids.ownerId, reportId],
  );
  await client.query(
    "UPDATE sales_order_pieces SET work_state='BLOCKED',issue_id=$2 WHERE id=$1",
    [ids.pieceId, issueId],
  );
  await client.query("UPDATE sales_drafts SET version=3 WHERE id=$1", [
    ids.orderId,
  ]);
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'REPORT_ISSUE',$2,'Data fixture','ADMIN',$3,$4,$5,2,2,3,repeat('a',64),$6,$7,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',3,'orderStatus','APPROVED','pieceId',$4::uuid::text,'pieceStage','CUTTING','pieceWorkState','BLOCKED','issueId',$5::uuid::text,'issueState','APPROVAL_REVIEW','proposalId',NULL),'2026-11-07T02:00:00Z')`,
    [
      reportId,
      ids.ownerId,
      ids.orderId,
      ids.pieceId,
      issueId,
      JSON.stringify(beforeReport),
      JSON.stringify(await readFacts(client, ids)),
    ],
  );
  await client.query(
    `UPDATE manufacturing_work_visits SET ended_at='2026-11-07T02:00:00Z',end_reason='ISSUE_REPORTED',end_approval_command_id=$2 WHERE piece_id=$1 AND ended_at IS NULL`,
    [ids.pieceId, reportId],
  );
  await client.query(
    `UPDATE sales_order_pieces SET current_work_visit_id=NULL WHERE id=$1`,
    [ids.pieceId],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return issueId;
};
it("rejects a resolution with a missing command on COMMIT and preserves the committed report graph", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const issueId = await establishReportedIssue(client, ids);
    await client.query("COMMIT");
    await client.query("BEGIN");
    await client.query("UPDATE sales_drafts SET version=4 WHERE id=$1", [
      ids.orderId,
    ]);
    await client.query(
      "UPDATE manufacturing_issues SET state='RESOLVED',resume_target='CUTTING',resolved_at=now(),resolution_command_id=$2 WHERE id=$1",
      [issueId, randomUUID()],
    );
    await client.query(
      "UPDATE sales_order_pieces SET stage='CUTTING',work_state='INCOMING',issue_id=NULL WHERE id=$1",
      [ids.pieceId],
    );
    await expect(client.query("COMMIT")).rejects.toMatchObject({
      code: "23514",
    });
    const state = await client.query(
      "SELECT r.version,i.state,p.work_state,p.issue_id FROM sales_drafts r JOIN manufacturing_issues i ON i.order_id=r.id JOIN sales_order_pieces p ON p.id=i.piece_id WHERE r.id=$1",
      [ids.orderId],
    );
    expect(state.rows).toEqual([
      {
        version: 3,
        state: "APPROVAL_REVIEW",
        work_state: "BLOCKED",
        issue_id: issueId,
      },
    ]);
    const commands = await client.query(
      "SELECT count(*)::int AS count FROM approval_commands WHERE order_id=$1",
      [ids.orderId],
    );
    expect(commands.rows).toEqual([{ count: 2 }]);
  });
});

it("rejects a submitted proposal without its command at COMMIT without replacing the retained referral", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const issueId = await establishReportedIssue(client, ids),
      referralId = randomUUID();
    const before = await readFacts(client, ids);
    await client.query("UPDATE sales_drafts SET version=4 WHERE id=$1", [
      ids.orderId,
    ]);
    await client.query(
      "UPDATE manufacturing_issues SET state='SALES_CONTACT',resume_target='PRODUCTION',updated_at='2026-11-07T03:00:00Z' WHERE id=$1",
      [issueId],
    );
    await client.query(
      `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,decision,decision_notes,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'RESOLVE_ISSUE',$2,'Data fixture','ADMIN',$3,$4,$5,3,3,4,repeat('b',64),'SEND_TO_SALES','Confirm size',$6,$7,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',4,'orderStatus','APPROVED','pieceId',$4::uuid::text,'pieceStage','CUTTING','pieceWorkState','BLOCKED','issueId',$5::uuid::text,'issueState','SALES_CONTACT','proposalId',NULL),'2026-11-07T03:00:00Z')`,
      [
        referralId,
        ids.ownerId,
        ids.orderId,
        ids.pieceId,
        issueId,
        JSON.stringify(before),
        JSON.stringify(await readFacts(client, ids)),
      ],
    );
    await client.query("COMMIT");
    await client.query("BEGIN");
    const proposalId = randomUUID();
    await client.query(
      `INSERT INTO piece_contact_proposals(id,order_id,piece_id,issue_id,sequence,kind,submitted_command_id,submitted_by_id,submitted_by_full_name,contact_notes,submitted_at,before_model,before_size,before_leather_base,proposed_model,proposed_size,proposed_leather_base)
 VALUES($1,$2,$3,$4,1,'AMEND',$5,$6,'Data fixture','Customer confirmed',now(),'SM','40','Base','SM','40.5','Base')`,
      [
        proposalId,
        ids.orderId,
        ids.pieceId,
        issueId,
        randomUUID(),
        ids.ownerId,
      ],
    );
    await client.query(
      "UPDATE manufacturing_issues SET state='REAPPROVAL',latest_proposal_id=$2 WHERE id=$1",
      [issueId, proposalId],
    );
    await client.query("UPDATE sales_drafts SET version=5 WHERE id=$1", [
      ids.orderId,
    ]);
    await expect(client.query("COMMIT")).rejects.toMatchObject({
      code: "23503",
      constraint: "piece_contact_proposals_submitted_command_fkey",
    });
    const retained = await client.query(
      "SELECT r.version,i.state,i.resume_target,i.latest_proposal_id,p.size FROM sales_drafts r JOIN manufacturing_issues i ON i.order_id=r.id JOIN sales_draft_pieces p ON p.id=i.piece_id WHERE r.id=$1",
      [ids.orderId],
    );
    expect(retained.rows).toEqual([
      {
        version: 4,
        state: "SALES_CONTACT",
        resume_target: "PRODUCTION",
        latest_proposal_id: null,
        size: "40",
      },
    ]);
    const proposals = await client.query(
      "SELECT count(*)::int AS count FROM piece_contact_proposals WHERE issue_id=$1",
      [issueId],
    );
    expect(proposals.rows).toEqual([{ count: 0 }]);
  });
});

const invalidIssueWrites = [
  [
    "immutable source",
    "UPDATE manufacturing_issues SET source_stage='QUALITY' WHERE id=$1",
    "23514",
    "ck_manufacturing_issue_source_immutable",
  ],
  [
    "immutable reporter",
    "UPDATE manufacturing_issues SET reporter_full_name='Invented' WHERE id=$1",
    "23514",
    "ck_manufacturing_issue_source_immutable",
  ],
  [
    "retained issue",
    "DELETE FROM manufacturing_issues WHERE id=$1",
    "23514",
    "ck_manufacturing_issue_source_immutable",
  ],
  [
    "illegal review jump",
    "UPDATE manufacturing_issues SET state='REAPPROVAL' WHERE id=$1",
    "23514",
    "ck_manufacturing_issue_transition",
  ],
  [
    "immutable report event",
    "UPDATE approval_commands SET payload_hash=repeat('b',64) WHERE issue_id=$1",
    "23514",
    "ck_approval_command_immutable",
  ],
  [
    "retained command",
    "DELETE FROM approval_commands WHERE issue_id=$1",
    "23514",
    "ck_approval_command_immutable",
  ],
  [
    "invalid source insertion",
    `INSERT INTO manufacturing_issues SELECT gen_random_uuid(),order_id,piece_id,cycle+1,state,'QUALITY',source_stage,source_work_state,reporter_id,reporter_full_name,reporter_role,reporter_department,reason,notes,reported_at,updated_at,gen_random_uuid(),resume_target,latest_proposal_id,resolved_at,resolution_command_id FROM manufacturing_issues WHERE id=$1`,
    "23514",
    "ck_manufacturing_issues_source",
  ],
  [
    "second open issue",
    `INSERT INTO manufacturing_issues SELECT gen_random_uuid(),order_id,piece_id,cycle+1,state,source_department,source_stage,source_work_state,reporter_id,reporter_full_name,reporter_role,reporter_department,reason,notes,reported_at,updated_at,gen_random_uuid(),resume_target,latest_proposal_id,resolved_at,resolution_command_id FROM manufacturing_issues WHERE id=$1`,
    "23505",
    "manufacturing_issues_one_open_piece_key",
  ],
] as const;
it.each(invalidIssueWrites)(
  "rejects %s without changing the protected graph",
  async (_label, sql, code, constraint) => {
    await withSubmittedGraph(async (client, ids) => {
      const issueId = await establishReportedIssue(client, ids);
      const before = await readFacts(client, ids);
      await client.query("SAVEPOINT denied_write");
      await expect(client.query(sql, [issueId])).rejects.toMatchObject({
        code,
        constraint,
      });
      await client.query("ROLLBACK TO SAVEPOINT denied_write");
      expect(await readFacts(client, ids)).toEqual(before);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    });
  },
);
it("requires a current piece to retain its matching open issue pointer", async () => {
  await withSubmittedGraph(async (client, ids) => {
    await establishReportedIssue(client, ids);
    const before = await readFacts(client, ids);
    await client.query("SAVEPOINT orphan_pointer");
    await client.query(
      "UPDATE sales_order_pieces SET issue_id=NULL WHERE id=$1",
      [ids.pieceId],
    );
    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_approval_order_graph",
    });
    await client.query("ROLLBACK TO SAVEPOINT orphan_pointer");
    expect(await readFacts(client, ids)).toEqual(before);
  });
});

const establishContactProposal = async (
  client: PoolClient,
  ids: Fixture,
  beforeModelId: string | null = null,
) => {
  const issueId = await establishReportedIssue(client, ids),
    referralId = randomUUID();
  const before = await readFacts(client, ids);
  await client.query("UPDATE sales_drafts SET version=4 WHERE id=$1", [
    ids.orderId,
  ]);
  await client.query(
    "UPDATE manufacturing_issues SET state='SALES_CONTACT',resume_target='PRODUCTION',updated_at='2026-11-07T03:00:00Z' WHERE id=$1",
    [issueId],
  );
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,decision,decision_notes,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'RESOLVE_ISSUE',$2,'Data fixture','ADMIN',$3,$4,$5,3,3,4,repeat('b',64),'SEND_TO_SALES','Confirm size',$6,$7,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',4,'orderStatus','APPROVED','pieceId',$4::uuid::text,'pieceStage','CUTTING','pieceWorkState','BLOCKED','issueId',$5::uuid::text,'issueState','SALES_CONTACT','proposalId',NULL),'2026-11-07T03:00:00Z')`,
    [
      referralId,
      ids.ownerId,
      ids.orderId,
      ids.pieceId,
      issueId,
      JSON.stringify(before),
      JSON.stringify(await readFacts(client, ids)),
    ],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  const beforeSubmit = await readFacts(client, ids),
    proposalId = randomUUID(),
    commandId = randomUUID();
  await client.query(
    `INSERT INTO piece_contact_proposals(id,order_id,piece_id,issue_id,sequence,kind,submitted_command_id,submitted_by_id,submitted_by_full_name,contact_notes,submitted_at,before_model,before_model_id,before_size,before_leather_base,proposed_model,proposed_size,proposed_leather_base)
 VALUES($1,$2,$3,$4,1,'AMEND',$5,$6,'Data fixture','Customer confirmed','2026-11-07T04:00:00Z','SM',$7,'40','Base','SM','40.5','Base')`,
    [
      proposalId,
      ids.orderId,
      ids.pieceId,
      issueId,
      commandId,
      ids.ownerId,
      beforeModelId,
    ],
  );
  await client.query(
    "UPDATE manufacturing_issues SET state='REAPPROVAL',latest_proposal_id=$2 WHERE id=$1",
    [issueId, proposalId],
  );
  await client.query("UPDATE sales_drafts SET version=5 WHERE id=$1", [
    ids.orderId,
  ]);
  const afterSubmit = await client.query<{ facts: unknown }>(
    `SELECT $1::jsonb || jsonb_build_object('proposal',jsonb_build_object('id',p.id,'kind',p.kind,'contactNotes',p.contact_notes,'submittedAt',p.submitted_at,
 'submittedBy',jsonb_build_object('id',p.submitted_by_id,'fullName',p.submitted_by_full_name,'role','ADMIN','department',NULL),
 'before',jsonb_build_object('model',p.before_model,'size',p.before_size,'leatherBase',p.before_leather_base,'sole',NULL,'catalogSelections',jsonb_build_object('model',p.before_model_id,'size',NULL,'leatherBase',NULL,'sole',NULL)),
 'proposed',jsonb_build_object('model',p.proposed_model,'size',p.proposed_size,'leatherBase',p.proposed_leather_base,'sole',NULL,'catalogSelections',jsonb_build_object('model',NULL,'size',NULL,'leatherBase',NULL,'sole',NULL)))) AS facts FROM piece_contact_proposals p WHERE p.id=$2`,
    [JSON.stringify(await readFacts(client, ids)), proposalId],
  );
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,proposal_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'SUBMIT_CONTACT',$2,'Data fixture','ADMIN',$3,$4,$5,$6,4,4,5,repeat('c',64),$7,$8,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',5,'orderStatus','APPROVED','pieceId',$4::uuid::text,'pieceStage','CUTTING','pieceWorkState','BLOCKED','issueId',$5::uuid::text,'issueState','REAPPROVAL','proposalId',$6::uuid::text),'2026-11-07T04:00:00Z')`,
    [
      commandId,
      ids.ownerId,
      ids.orderId,
      ids.pieceId,
      issueId,
      proposalId,
      JSON.stringify(beforeSubmit),
      JSON.stringify(afterSubmit.rows[0]?.facts),
    ],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return { issueId, proposalId };
};
it.each([
  [
    "submitted proposal mutation",
    "UPDATE piece_contact_proposals SET proposed_size='41' WHERE id=$1",
    "ck_piece_contact_proposal_immutable",
  ],
  [
    "submitted proposal deletion",
    "DELETE FROM piece_contact_proposals WHERE id=$1",
    "ck_piece_contact_proposal_immutable",
  ],
] as const)(
  "rejects %s and preserves held specifications",
  async (_label, sql, constraint) => {
    await withSubmittedGraph(async (client, ids) => {
      const { proposalId } = await establishContactProposal(client, ids);
      const before = await readFacts(client, ids);
      await client.query("SAVEPOINT immutable_proposal");
      await expect(client.query(sql, [proposalId])).rejects.toMatchObject({
        code: "23514",
        constraint,
      });
      await client.query("ROLLBACK TO SAVEPOINT immutable_proposal");
      expect(await readFacts(client, ids)).toEqual(before);
      expect(
        (
          await client.query(
            "SELECT size FROM sales_draft_pieces WHERE id=$1",
            [ids.pieceId],
          )
        ).rows,
      ).toEqual([{ size: "40" }]);
    });
  },
);
it("rejects a retained catalog reference whose field/label does not match the submitted proposal", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const before = await readFacts(client, ids);
    await client.query("SAVEPOINT invalid_catalog");
    await expect(
      establishContactProposal(client, ids, ids.entryId),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_piece_contact_proposal_bindings",
    });
    await client.query("ROLLBACK TO SAVEPOINT invalid_catalog");
    expect(await readFacts(client, ids)).toEqual(before);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM approval_commands WHERE order_id=$1",
          [ids.orderId],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
});
it("retains the approver target across reapproval and refuses a silent target replacement", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const { issueId } = await establishContactProposal(client, ids);
    const before = await readFacts(client, ids);
    await client.query("SAVEPOINT changed_target");
    await expect(
      client.query(
        "UPDATE manufacturing_issues SET state='SALES_CONTACT',resume_target='CUTTING' WHERE id=$1",
        [issueId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_issue_transition",
    });
    await client.query("ROLLBACK TO SAVEPOINT changed_target");
    expect(await readFacts(client, ids)).toEqual(before);
  });
});

it("retains full cancellation and exact paid history, and prevents reopening the resolved issue", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const issueId = await establishReportedIssue(client, ids),
      commandId = randomUUID();
    const before = await readFacts(client, ids);
    await client.query("UPDATE sales_drafts SET version=4 WHERE id=$1", [
      ids.orderId,
    ]);
    await client.query(
      "UPDATE manufacturing_issues SET state='RESOLVED',resolution_command_id=$2,resolved_at='2026-11-07T03:00:00Z' WHERE id=$1",
      [issueId, commandId],
    );
    await client.query(
      "UPDATE sales_order_pieces SET stage='CANCELLED',issue_id=NULL,cancelled_at='2026-11-07T03:00:00Z',cancellation_reason='Retain cancellation' WHERE id=$1",
      [ids.pieceId],
    );
    await client.query(
      "UPDATE sales_orders SET status='CANCELLED',total_amount=0.00 WHERE id=$1",
      [ids.orderId],
    );
    await client.query(
      `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,piece_id,issue_id,expected_version,before_version,after_version,payload_hash,decision,decision_notes,before_facts,after_facts,outcome,occurred_at)
 VALUES($1,'RESOLVE_ISSUE',$2,'Data fixture','ADMIN',$3,$4,$5,3,3,4,repeat('d',64),'CANCEL','Retain cancellation',$6,$7,jsonb_build_object('orderId',$3::uuid::text,'orderVersion',4,'orderStatus','CANCELLED','pieceId',$4::uuid::text,'pieceStage','CANCELLED','pieceWorkState','BLOCKED','issueId',$5::uuid::text,'issueState','RESOLVED','proposalId',NULL),'2026-11-07T03:00:00Z')`,
      [
        commandId,
        ids.ownerId,
        ids.orderId,
        ids.pieceId,
        issueId,
        JSON.stringify(before),
        JSON.stringify(await readFacts(client, ids)),
      ],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    expect(
      (
        await client.query(
          "SELECT status,total_amount::text AS total,paid_amount::text AS paid FROM sales_orders WHERE id=$1",
          [ids.orderId],
        )
      ).rows,
    ).toEqual([{ status: "CANCELLED", total: "0.00", paid: "0.00" }]);
    const after = await readFacts(client, ids);
    expect(after).toMatchObject({
      counts: {
        original: 1,
        active: 0,
        cancelled: 1,
        received: 0,
        completionPercent: 0,
      },
    });
    await client.query("SAVEPOINT illegal_reopen");
    await expect(
      client.query(
        "UPDATE manufacturing_issues SET state='APPROVAL_REVIEW',resolved_at=NULL,resolution_command_id=NULL WHERE id=$1",
        [issueId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_issue_transition",
    });
    await client.query("ROLLBACK TO SAVEPOINT illegal_reopen");
    expect(await readFacts(client, ids)).toEqual(after);
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM approval_commands WHERE order_id=$1",
          [ids.orderId],
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
  });
});

it.each([
  [
    "version disagreement",
    { expected_version: 99 },
    "ck_approval_commands_versions",
  ],
  ["malformed hash", { payload_hash: "invalid" }, "ck_approval_commands_hash"],
  [
    "wrong retained operation actor",
    { actor_role: "USER", actor_department: "SALES" },
    "ck_approval_commands_actor",
  ],
  [
    "missing proposal binding",
    {
      operation: "REVIEW_CONTACT",
      decision: "ACCEPT",
      decision_notes: "Approve",
    },
    "ck_approval_commands_binding",
  ],
] as const)(
  "rejects %s in alternate command insertion without adding history",
  async (_label, patch, constraint) => {
    await withSubmittedGraph(async (client, ids) => {
      const issueId = await establishReportedIssue(client, ids);
      const before = await readFacts(client, ids);
      await client.query("SAVEPOINT malformed_command");
      await expect(
        client.query(
          `INSERT INTO approval_commands SELECT (jsonb_populate_record(NULL::approval_commands,to_jsonb(c)||$2::jsonb)).* FROM approval_commands c WHERE c.issue_id=$1`,
          [issueId, JSON.stringify({ ...patch, command_id: randomUUID() })],
        ),
      ).rejects.toMatchObject({ code: "23514", constraint });
      await client.query("ROLLBACK TO SAVEPOINT malformed_command");
      expect(await readFacts(client, ids)).toEqual(before);
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM approval_commands WHERE order_id=$1",
            [ids.orderId],
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    });
  },
);
it("rejects a valid issue ID attached to a physical piece in a different order", async () => {
  await withSubmittedGraph(async (client, ids) => {
    const issueId = await establishReportedIssue(client, ids);
    let foreignPieceId: string | undefined;
    await withSubmittedGraph(async (other, foreign) => {
      foreignPieceId = foreign.pieceId;
      await other.query("COMMIT");
    });
    if (foreignPieceId === undefined)
      throw new Error("Expected the separate owned fixture");
    const before = (
      await client.query("SELECT * FROM sales_order_pieces WHERE id=$1", [
        foreignPieceId,
      ])
    ).rows;
    await client.query("SAVEPOINT foreign_piece");
    await client.query(
      "UPDATE sales_order_pieces SET issue_id=$2 WHERE id=$1",
      [foreignPieceId, issueId],
    );
    await expect(
      client.query(
        "SET CONSTRAINTS sales_order_pieces_current_issue_fkey IMMEDIATE",
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "sales_order_pieces_current_issue_fkey",
    });
    await client.query("ROLLBACK TO SAVEPOINT foreign_piece");
    expect(
      (
        await client.query("SELECT * FROM sales_order_pieces WHERE id=$1", [
          foreignPieceId,
        ])
      ).rows,
    ).toEqual(before);
  });
});
