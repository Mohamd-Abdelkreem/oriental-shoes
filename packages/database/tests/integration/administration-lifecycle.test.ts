import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  administrationCommandFactsSchema,
  administrationCommandDataSchema,
  type AdministrationCommandFacts,
} from "@template/contracts";

let pool: Pool | undefined;
const ownedPool = (): Pool => {
  if (pool === undefined) throw new Error("Owned migrated pool is unavailable");
  return pool;
};
const instant = "2026-11-15T09:00:00.000Z";
beforeAll(async () => {
  const marker = process.env["P01_TEST_DATABASE_URL"];
  if (
    process.env["NODE_ENV"] !== "test" ||
    !marker ||
    marker !== process.env["DATABASE_URL"]
  )
    throw new Error("Owned migrated PostgreSQL is required");
  pool = new Pool({ connectionString: marker });
  const selected = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  expect(selected.rows[0]?.name).toBe(
    decodeURIComponent(new URL(marker).pathname.slice(1)),
  );
});
afterAll(async () => {
  await pool?.end();
});

type Fixture = { orderId: string; actorId: string; pieceIds: string[] };
const seedOrder = async (client: PoolClient): Promise<Fixture> => {
  const orderId = randomUUID(),
    actorId = randomUUID(),
    pieceIds = [randomUUID(), randomUUID()].sort(),
    customerId = randomUUID(),
    sourceId = randomUUID(),
    entryId = randomUUID();
  const sequence = BigInt(
    "0x" + orderId.replaceAll("-", "").slice(0, 12),
  ).toString();
  await client.query(
    "INSERT INTO users(id,email,password_hash,full_name,role,status,email_verified_at,created_at,updated_at) VALUES($1,$2,'synthetic','Admin','ADMIN','ACTIVE',$3,$3,$3)",
    [actorId, actorId + "@example.test", instant],
  );
  await client.query(
    "INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES($1,'Customer','+966500000001',$2,$2)",
    [customerId, instant],
  );
  await client.query(
    "INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest) VALUES($1,$2,'Owned synthetic','A1:AA942',1,$3,'p08-constraints',1874,'{}')",
    [sourceId, sourceId.replaceAll("-", "").repeat(2), instant],
  );
  await client.query(
    "INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES($1,$2,'decoration','Z3','Decoration','decoration',1,650,'AA3')",
    [entryId, sourceId],
  );
  await client.query(
    "INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at) VALUES($1,$2,$3,'SHOP','SUBMITTED',$4,$4)",
    [orderId, actorId, customerId, instant],
  );
  await client.query(
    "INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at) SELECT id,$2,position::int,'SM','40','Base','Decoration','Face',$3,$3 FROM unnest($1::uuid[]) WITH ORDINALITY p(id,position)",
    [pieceIds, orderId, instant],
  );
  await client.query(
    "INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) SELECT id,'decoration',$2 FROM unnest($1::uuid[]) p(id)",
    [pieceIds, entryId],
  );
  await client.query(
    "INSERT INTO sales_orders(id,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount) VALUES($1,$2,$3,2026,$4,$5,'Admin','Customer','+966500000001',$6,1300,1000)",
    [
      orderId,
      "SHOP-2026-" + sequence.padStart(4, "0"),
      sequence,
      instant,
      actorId,
      sourceId,
    ],
  );
  await client.query(
    "INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell) SELECT id,$2,$3,$4,'Decoration',650,'AA3' FROM unnest($1::uuid[]) p(id)",
    [pieceIds, orderId, entryId, sourceId],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return { orderId, actorId, pieceIds };
};

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
const actor = (fixture: Fixture) => ({
  id: fixture.actorId,
  fullName: "Admin",
  role: "ADMIN",
  department: null,
});
const retainAdmin = async (
  client: PoolClient,
  fixture: Fixture,
  command: ReturnType<typeof administrationCommandDataSchema.parse>,
  scope: "ORDER" | "QUANTITY" | null,
) =>
  client.query(
    `
  INSERT INTO administration_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,reason,scope,piece_ids,before_facts,after_facts,outcome,occurred_at)
  VALUES($1,$2,$3,'Admin','ADMIN',$4,$5,$5,$6,repeat('a',64),CASE WHEN $2::administration_operation='ADMIN_CANCEL' THEN 'Administrative cancellation' ELSE 'Correct delivery address' END,$7,$8,$9,$10,$11,$12)`,
    [
      command.receipt.commandId,
      command.receipt.operation,
      fixture.actorId,
      fixture.orderId,
      command.before.version,
      command.after.version,
      scope,
      command.result.pieceIds,
      JSON.stringify(command.before),
      JSON.stringify(command.after),
      JSON.stringify(command),
      instant,
    ],
  );
const cancel = async (
  client: PoolClient,
  fixture: Fixture,
  pieceIds: string[],
  scope: "ORDER" | "QUANTITY" = "QUANTITY",
  terminalSource?: string | null,
) => {
  const before = await readFacts(client, fixture.orderId),
    ids = pieceIds.toSorted();
  const selected = new Set(ids),
    remaining = before.counts.active - ids.length;
  const total = BigInt(remaining) * 65000n,
    paid = 100000n;
  const amount = (cents: bigint) =>
    `${(cents / 100n).toString()}.${String(cents % 100n).padStart(2, "0")}`;
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: before.version + 1,
    status: remaining === 0 ? "CANCELLED" : before.status,
    counts: {
      ...before.counts,
      cancelled: before.counts.cancelled + ids.length,
      active: remaining,
    },
    money: {
      total: amount(total),
      paidAmount: amount(paid),
      remainingDue: amount(total > paid ? total - paid : 0n),
      surplus: amount(paid > total ? paid - total : 0n),
    },
    pieces: before.pieces.map((piece) =>
      selected.has(piece.id)
        ? {
            ...piece,
            stage: "CANCELLED",
            workState: "BLOCKED",
            issueId: null,
            currentWorkVisitId: null,
            cancelledAt: instant,
            cancellationReason: "Administrative cancellation",
          }
        : piece,
    ),
    returnProof:
      remaining === 0
        ? null
        : before.returnProof === null
          ? null
          : { ...before.returnProof, version: before.version + 1 },
  });
  const command = administrationCommandDataSchema.parse({
    receipt: {
      commandId: randomUUID(),
      operation: "ADMIN_CANCEL",
      orderId: fixture.orderId,
      beforeVersion: before.version,
      afterVersion: after.version,
      actor: actor(fixture),
      occurredAt: instant,
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
  const source =
    terminalSource === undefined ? command.receipt.commandId : terminalSource;
  await retainAdmin(client, fixture, command, scope);
  for (const pieceId of ids) {
    await client.query(
      "INSERT INTO administration_cancelled_pieces(command_id,order_id,piece_id,before_facts,after_facts) VALUES($1,$2,$3,$4,$5)",
      [
        command.receipt.commandId,
        fixture.orderId,
        pieceId,
        JSON.stringify(before.pieces.find((piece) => piece.id === pieceId)),
        JSON.stringify(after.pieces.find((piece) => piece.id === pieceId)),
      ],
    );
  }
  await client.query(
    "UPDATE manufacturing_work_visits SET ended_at=$3,end_reason='CANCELLED',end_administration_command_id=$4 WHERE order_id=$1 AND piece_id=ANY($2::uuid[]) AND ended_at IS NULL",
    [fixture.orderId, ids, instant, source],
  );
  await client.query(
    "UPDATE quality_work_visits SET ended_at=$3,end_reason='CANCELLED',end_administration_command_id=$4 WHERE order_id=$1 AND piece_id=ANY($2::uuid[]) AND ended_at IS NULL",
    [fixture.orderId, ids, instant, source],
  );
  await client.query(
    "UPDATE quality_correction_cycles SET state='CANCELLED',resolved_at=$3,resolution_administration_command_id=$4 WHERE order_id=$1 AND piece_id=ANY($2::uuid[]) AND state='OPEN'",
    [fixture.orderId, ids, instant, source],
  );
  await client.query(
    "UPDATE manufacturing_issues SET state='RESOLVED',resolved_at=$3,resolution_administration_command_id=$4 WHERE order_id=$1 AND piece_id=ANY($2::uuid[]) AND state<>'RESOLVED'",
    [fixture.orderId, ids, instant, source],
  );
  await client.query(
    "UPDATE sales_order_pieces SET stage='CANCELLED',work_state='BLOCKED',issue_id=NULL,current_work_visit_id=NULL,cancelled_at=$3,cancellation_reason='Administrative cancellation' WHERE order_id=$1 AND id=ANY($2::uuid[])",
    [fixture.orderId, ids, instant],
  );
  await client.query(
    "UPDATE sales_orders SET total_amount=$2,status=$3::sales_order_status,current_return_decision_id=CASE WHEN $3::sales_order_status='CANCELLED' THEN NULL ELSE current_return_decision_id END,current_return_order_version=CASE WHEN $3::sales_order_status='CANCELLED' THEN NULL WHEN $3::sales_order_status='RETURNED' THEN $4 ELSE current_return_order_version END,current_return_reason=CASE WHEN $3::sales_order_status='CANCELLED' THEN NULL ELSE current_return_reason END,current_returned_at=CASE WHEN $3::sales_order_status='CANCELLED' THEN NULL ELSE current_returned_at END WHERE id=$1",
    [fixture.orderId, after.money.total, after.status, after.version],
  );
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    after.version,
  ]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return command;
};

const correctReturned = async (client: PoolClient, fixture: Fixture) => {
  const before = await readFacts(client, fixture.orderId);
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: before.version + 1,
    correction: { ...before.correction, customerAddress: "Building B" },
    returnProof:
      before.returnProof === null
        ? null
        : { ...before.returnProof, version: before.version + 1 },
  });
  const command = administrationCommandDataSchema.parse({
    receipt: {
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: fixture.orderId,
      beforeVersion: before.version,
      afterVersion: after.version,
      actor: actor(fixture),
      occurredAt: instant,
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
      pieceIds: [],
    },
  });
  await retainAdmin(client, fixture, command, null);
  await client.query(
    "INSERT INTO administration_order_corrections(command_id,order_id,after_version,customer_name,customer_phone,customer_email,customer_address,before_values,after_values,changed_fields) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,ARRAY['customerAddress'])",
    [
      command.receipt.commandId,
      fixture.orderId,
      after.version,
      after.correction.customerName,
      after.correction.customerPhone,
      after.correction.customerEmail,
      after.correction.customerAddress,
      JSON.stringify(before.correction),
      JSON.stringify(after.correction),
    ],
  );
  await client.query(
    "UPDATE sales_orders SET current_return_order_version=$2 WHERE id=$1",
    [fixture.orderId, after.version],
  );
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    after.version,
  ]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return command;
};
const approvalFacts = (
  facts: AdministrationCommandFacts,
  approvedAt: string | null,
) => ({
  orderStatus: facts.status,
  approvedAt,
  currentReturn:
    facts.returnProof === null
      ? null
      : {
          decisionId: facts.returnProof.decisionId,
          reason: facts.returnProof.reason,
          notes: null,
          returnedAt: facts.returnProof.returnedAt,
        },
  money: facts.money,
  counts: facts.counts,
  pieces: facts.pieces.map(({ currentWorkVisitId: _visit, ...piece }) => piece),
  issue: null,
  proposal: null,
});
const initialDecision = async (
  client: PoolClient,
  fixture: Fixture,
  operation: "APPROVE_INITIAL" | "RETURN_INITIAL",
) => {
  const before = await readFacts(client, fixture.orderId),
    commandId = randomUUID(),
    version = before.version + 1;
  await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
    fixture.orderId,
    version,
  ]);
  if (operation === "RETURN_INITIAL")
    await client.query(
      "UPDATE sales_orders SET status='RETURNED',current_return_decision_id=$2,current_return_order_version=$3,current_return_reason='Original return',current_returned_at=$4 WHERE id=$1",
      [fixture.orderId, commandId, version, instant],
    );
  else {
    await client.query(
      "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
      [fixture.orderId, instant],
    );
    await client.query(
      "UPDATE sales_order_pieces SET stage='CUTTING' WHERE order_id=$1 AND stage<>'CANCELLED'",
      [fixture.orderId],
    );
  }
  const after = await readFacts(client, fixture.orderId);
  const outcome = {
    orderId: fixture.orderId,
    orderVersion: version,
    orderStatus: after.status,
    pieceId: null,
    pieceStage: null,
    pieceWorkState: null,
    issueId: null,
    issueState: null,
    proposalId: null,
  };
  await client.query(
    `INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at)
    VALUES($1,$2,$3,'Admin','ADMIN',$4,$5,$5,$6,repeat('b',64),$7,$8,$9,$10)`,
    [
      commandId,
      operation,
      fixture.actorId,
      fixture.orderId,
      before.version,
      version,
      JSON.stringify(approvalFacts(before, null)),
      JSON.stringify(
        approvalFacts(after, operation === "APPROVE_INITIAL" ? instant : null),
      ),
      JSON.stringify(outcome),
      instant,
    ],
  );
  if (operation === "APPROVE_INITIAL") {
    await client.query(
      "INSERT INTO manufacturing_work_visits(id,order_id,piece_id,department,sequence,origin_kind,source_department,source_approval_command_id,entered_at) SELECT gen_random_uuid(),order_id,id,'CUTTING',1,'INITIAL_APPROVAL','APPROVAL',$2,$3 FROM sales_order_pieces WHERE order_id=$1 AND stage<>'CANCELLED'",
      [fixture.orderId, commandId, instant],
    );
    await client.query(
      "UPDATE sales_order_pieces p SET current_work_visit_id=v.id FROM manufacturing_work_visits v WHERE p.id=v.piece_id AND p.order_id=$1",
      [fixture.orderId],
    );
  }
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return commandId;
};
const withOrder = async (
  verify: (client: PoolClient, fixture: Fixture) => Promise<void>,
) => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    await verify(client, await seedOrder(client));
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
};

it("retains cancelled preapproval members and releases only the positive active set", async () =>
  withOrder(async (client, fixture) => {
    const selected = fixture.pieceIds[0];
    if (!selected) throw new Error("Missing synthetic selected piece");
    const cancelled = await cancel(client, fixture, [selected]);
    expect(cancelled.after.money).toEqual({
      total: "650.00",
      paidAmount: "1000.00",
      remainingDue: "0.00",
      surplus: "350.00",
    });
    await initialDecision(client, fixture, "APPROVE_INITIAL");
    const rows = await client.query<{
      id: string;
      stage: string;
      current_work_visit_id: string | null;
    }>(
      "SELECT id,stage,current_work_visit_id FROM sales_order_pieces WHERE order_id=$1 ORDER BY id",
      [fixture.orderId],
    );
    expect(rows.rows.find((piece) => piece.id === selected)).toMatchObject({
      stage: "CANCELLED",
      current_work_visit_id: null,
    });
    const active = rows.rows.find((piece) => piece.id !== selected);
    expect(active?.stage).toBe("CUTTING");
    expect(active?.current_work_visit_id).toBeTypeOf("string");
  }));
it("carries the original return through contiguous admin cancellation and full cancellation without inventing a decision", async () =>
  withOrder(async (client, fixture) => {
    const decisionId = await initialDecision(client, fixture, "RETURN_INITIAL");
    const correction = await correctReturned(client, fixture);
    expect(correction.after.returnProof?.decisionId).toBe(decisionId);
    expect(correction.after.correction.customerAddress).toBe("Building B");
    await client.query("SAVEPOINT return_gap");
    await client.query(
      "UPDATE sales_drafts SET version=version+1 WHERE id=$1",
      [fixture.orderId],
    );
    await client.query(
      "UPDATE sales_orders SET current_return_order_version=current_return_order_version+1 WHERE id=$1",
      [fixture.orderId],
    );
    await expect(
      client.query("SELECT check_approval_order_graph($1)", [fixture.orderId]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_approval_order_graph",
    });
    await client.query("ROLLBACK TO SAVEPOINT return_gap");
    await client.query("RELEASE SAVEPOINT return_gap");
    await client.query("SAVEPOINT return_reason");
    await client.query(
      "UPDATE sales_orders SET current_return_reason='forged replacement reason' WHERE id=$1",
      [fixture.orderId],
    );
    await expect(
      client.query("SELECT check_approval_order_graph($1)", [fixture.orderId]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_approval_order_graph",
    });
    await client.query("ROLLBACK TO SAVEPOINT return_reason");
    await client.query("RELEASE SAVEPOINT return_reason");
    const selected = fixture.pieceIds[0];
    if (!selected) throw new Error("Missing synthetic selected piece");
    const partial = await cancel(client, fixture, [selected]);
    expect(partial.after.returnProof).toEqual({
      decisionId,
      reason: "Original return",
      returnedAt: instant,
      version: 4,
    });
    const rest = partial.after.pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => piece.id);
    const full = await cancel(client, fixture, rest, "ORDER");
    expect(full.after.status).toBe("CANCELLED");
    expect(full.after.returnProof).toBeNull();
    expect(full.after.money.surplus).toBe("1000.00");
    const original = await client.query<{
      after_version: number;
      occurred_at: Date;
    }>(
      "SELECT after_version,occurred_at FROM approval_commands WHERE command_id=$1",
      [decisionId],
    );
    expect(original.rows[0]).toEqual({
      after_version: 2,
      occurred_at: new Date(instant),
    });
  }));
it("rejects whole-scope substitution and cancelled-piece reactivation without weakening guards", async () =>
  withOrder(async (client, fixture) => {
    const selected = fixture.pieceIds[0];
    if (!selected) throw new Error("Missing synthetic selected piece");
    await client.query("SAVEPOINT bad_scope");
    await expect(
      cancel(client, fixture, [selected], "ORDER"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_administration_piece_binding",
    });
    await client.query("ROLLBACK TO SAVEPOINT bad_scope");
    await client.query("RELEASE SAVEPOINT bad_scope");
    await cancel(client, fixture, [selected]);
    await client.query("SAVEPOINT revival");
    await expect(
      (async () => {
        await client.query(
          "UPDATE sales_order_pieces SET stage='AWAITING_APPROVAL',work_state='INCOMING',cancelled_at=NULL,cancellation_reason=NULL WHERE id=$1",
          [selected],
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      })(),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_event_binding",
    });
    await client.query("ROLLBACK TO SAVEPOINT revival");
    await client.query("RELEASE SAVEPOINT revival");
  }));

it("rejects initial approval of a fully cancelled retained order at the actual command-head guard", async () =>
  withOrder(async (client, fixture) => {
    const cancelled = await cancel(client, fixture, fixture.pieceIds, "ORDER");
    const version = cancelled.after.version + 1,
      commandId = randomUUID();
    await client.query("UPDATE sales_drafts SET version=$2 WHERE id=$1", [
      fixture.orderId,
      version,
    ]);
    await client.query(
      "UPDATE sales_orders SET status='APPROVED',approved_at=$2 WHERE id=$1",
      [fixture.orderId, instant],
    );
    const before = approvalFacts(
      { ...cancelled.after, status: "AWAITING_APPROVAL" },
      null,
    );
    const after = approvalFacts(
      { ...cancelled.after, status: "APPROVED" },
      instant,
    );
    const outcome = {
      orderId: fixture.orderId,
      orderVersion: version,
      orderStatus: "APPROVED",
      pieceId: null,
      pieceStage: null,
      pieceWorkState: null,
      issueId: null,
      issueState: null,
      proposalId: null,
    };
    await client.query(
      "INSERT INTO approval_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,before_facts,after_facts,outcome,occurred_at) VALUES($1,'APPROVE_INITIAL',$2,'Admin','ADMIN',$3,$4,$4,$5,repeat('b',64),$6,$7,$8,$9)",
      [
        commandId,
        fixture.actorId,
        fixture.orderId,
        cancelled.after.version,
        version,
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(outcome),
        instant,
      ],
    );
    await expect(
      client.query("SET CONSTRAINTS p04_command_head_binding IMMEDIATE"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_approval_order_graph",
    });
  }));

it("closes a real active manufacturing visit under exactly one administration source", async () =>
  withOrder(async (client, fixture) => {
    await initialDecision(client, fixture, "APPROVE_INITIAL");
    const selected = fixture.pieceIds[0];
    if (!selected) throw new Error("Missing selected physical identity");
    const before = await client.query(
      "SELECT * FROM manufacturing_work_visits WHERE piece_id=$1",
      [selected],
    );
    const command = await cancel(client, fixture, [selected]);
    const rows = await client.query(
      "SELECT * FROM manufacturing_work_visits WHERE piece_id=$1",
      [selected],
    );
    expect(rows.rows[0]).toEqual({
      ...before.rows[0],
      ended_at: new Date(instant),
      end_reason: "CANCELLED",
      end_administration_command_id: command.receipt.commandId,
    });
    await client.query("SAVEPOINT retained_visit");
    await expect(
      client.query(
        "UPDATE manufacturing_work_visits SET end_administration_command_id=NULL WHERE piece_id=$1",
        [selected],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_retained",
    });
    await client.query("ROLLBACK TO SAVEPOINT retained_visit");
    await client.query("RELEASE SAVEPOINT retained_visit");
  }));

it("rejects absent and forged administrative manufacturing terminal sources atomically", async () =>
  withOrder(async (client, fixture) => {
    await initialDecision(client, fixture, "APPROVE_INITIAL");
    const selected = fixture.pieceIds[0];
    if (!selected) throw new Error("Missing selected identity");
    for (const [source, code, constraint] of [
      [null, "23514", "ck_manufacturing_visit_times"],
      [
        randomUUID(),
        "23503",
        "manufacturing_work_visits_end_administration_command_id_fkey",
      ],
    ] as const) {
      const before = await readFacts(client, fixture.orderId);
      await client.query("SAVEPOINT source_failure");
      await expect(
        cancel(client, fixture, [selected], "QUANTITY", source),
      ).rejects.toMatchObject({ code, constraint });
      await client.query("ROLLBACK TO SAVEPOINT source_failure");
      await client.query("RELEASE SAVEPOINT source_failure");
      expect(await readFacts(client, fixture.orderId)).toEqual(before);
    }
  }));

it("rejects a real administrative source belonging to another selected piece", async () =>
  withOrder(async (client, fixture) => {
    await initialDecision(client, fixture, "APPROVE_INITIAL");
    const first = fixture.pieceIds[0],
      second = fixture.pieceIds[1];
    if (!first || !second) throw new Error("Missing two-piece fixture");
    const previous = await cancel(client, fixture, [first]);
    const before = await readFacts(client, fixture.orderId);
    await client.query("SAVEPOINT wrong_member_source");
    await expect(
      cancel(client, fixture, [second], "QUANTITY", previous.receipt.commandId),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_manufacturing_visit_times",
    });
    await client.query("ROLLBACK TO SAVEPOINT wrong_member_source");
    await client.query("RELEASE SAVEPOINT wrong_member_source");
    expect(await readFacts(client, fixture.orderId)).toEqual(before);
  }));
