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

type Fixture = { orderId: string; actorId: string; pieceId: string };
const seedOrder = async (client: PoolClient): Promise<Fixture> => {
  const orderId = randomUUID(),
    actorId = randomUUID(),
    pieceId = randomUUID(),
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
    "INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES($1,$2,'decoration','Z3','Decoration','decoration',1,1800,'AA3')",
    [entryId, sourceId],
  );
  await client.query(
    "INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at) VALUES($1,$2,$3,'SHOP','SUBMITTED',$4,$4)",
    [orderId, actorId, customerId, instant],
  );
  await client.query(
    "INSERT INTO sales_draft_pieces(id,draft_id,position,model,size,leather_base,decoration,face,created_at,updated_at) VALUES($1,$2,1,'SM','40','Base','Decoration','Face',$3,$3)",
    [pieceId, orderId, instant],
  );
  await client.query(
    "INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) VALUES($1,'decoration',$2)",
    [pieceId, entryId],
  );
  await client.query(
    "INSERT INTO sales_orders(id,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount) VALUES($1,$2,$3,2026,$4,$5,'Admin','Customer','+966500000001',$6,1800,100.50)",
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
    "INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell) VALUES($1,$2,$3,$4,'Decoration',1800,'AA3')",
    [pieceId, orderId, entryId, sourceId],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  return { orderId, actorId, pieceId };
};
const readFacts = async (
  client: PoolClient,
  orderId: string,
): Promise<AdministrationCommandFacts> => {
  const rows = await client.query<{ facts: unknown }>(
    `
    SELECT jsonb_build_object('version',d.version,'status',h.status,
      'counts',jsonb_build_object('original',1,'cancelled',0,'active',1,'received',0,'completionPercent',0),
      'money',jsonb_build_object('total','1800.00','paidAmount','100.50','remainingDue','1699.50','surplus','0.00'),
      'correction',jsonb_build_object('generalNotes',d.general_notes,'customerName',COALESCE(c.customer_name,h.customer_name),'customerPhone',COALESCE(c.customer_phone,h.customer_phone),
        'customerEmail',CASE WHEN c.command_id IS NULL THEN h.customer_email ELSE c.customer_email END,'customerAddress',CASE WHEN c.command_id IS NULL THEN h.customer_address ELSE c.customer_address END),
      'pieces',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'stage',p.stage,'workState',p.work_state,'issueId',p.issue_id,'currentWorkVisitId',p.current_work_visit_id,'receivedAt',p.received_at,'cancelledAt',p.cancelled_at,'cancellationReason',p.cancellation_reason) ORDER BY p.id) FROM sales_order_pieces p WHERE p.order_id=h.id),
      'returnProof',NULL) AS facts
    FROM sales_drafts d JOIN sales_orders h ON h.id=d.id
    LEFT JOIN LATERAL (SELECT * FROM administration_order_corrections WHERE order_id=d.id ORDER BY after_version DESC,command_id DESC LIMIT 1) c ON true WHERE d.id=$1`,
    [orderId],
  );
  return administrationCommandFactsSchema.parse(rows.rows[0]?.facts);
};
const correctionCommand = (
  fixture: Fixture,
  before: AdministrationCommandFacts,
  address: string,
) => {
  const commandId = randomUUID();
  const after = {
    ...before,
    version: before.version + 1,
    correction: { ...before.correction, customerAddress: address },
  };
  const outcome = administrationCommandDataSchema.parse({
    receipt: {
      commandId,
      operation: "ADMIN_CORRECT",
      orderId: fixture.orderId,
      beforeVersion: before.version,
      afterVersion: after.version,
      actor: {
        id: fixture.actorId,
        fullName: "Admin",
        role: "ADMIN",
        department: null,
      },
      occurredAt: instant,
    },
    replayed: false,
    result: {
      orderId: fixture.orderId,
      version: after.version,
      status: after.status,
      counts: after.counts,
      money: after.money,
      correction: after.correction,
      pieceIds: [],
    },
    before,
    after,
  });
  return { commandId, before, after, outcome };
};
const insertParent = async (
  client: PoolClient,
  fixture: Fixture,
  command: ReturnType<typeof correctionCommand>,
) =>
  client.query(
    `
  INSERT INTO administration_commands(command_id,operation,actor_id,actor_full_name,actor_role,order_id,expected_version,before_version,after_version,payload_hash,reason,scope,piece_ids,before_facts,after_facts,outcome,occurred_at)
  VALUES($1,$10::administration_operation,$2,'Admin','ADMIN',$3,$4,$4,$5,repeat('a',64),'Correct address',CASE WHEN $10='ADMIN_CANCEL' THEN 'QUANTITY'::administration_cancellation_scope ELSE NULL END,$11::uuid[],$6,$7,$8,$9)`,
    [
      command.commandId,
      fixture.actorId,
      fixture.orderId,
      command.before.version,
      command.after.version,
      JSON.stringify(command.before),
      JSON.stringify(command.after),
      JSON.stringify(command.outcome),
      instant,
      command.outcome.receipt.operation,
      command.outcome.result.pieceIds,
    ],
  );
const completeCorrection = async (
  client: PoolClient,
  fixture: Fixture,
  command: ReturnType<typeof correctionCommand>,
) => {
  const { before, after } = command;
  await insertParent(client, fixture, command);
  await client.query(
    `INSERT INTO administration_order_corrections(command_id,order_id,after_version,customer_name,customer_phone,customer_email,customer_address,before_values,after_values,changed_fields)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[])`,
    [
      command.commandId,
      fixture.orderId,
      after.version,
      after.correction.customerName,
      after.correction.customerPhone,
      after.correction.customerEmail,
      after.correction.customerAddress,
      JSON.stringify(before.correction),
      JSON.stringify(after.correction),
      (
        [
          "customerAddress",
          "customerEmail",
          "customerName",
          "customerPhone",
          "generalNotes",
        ] as const
      ).filter((field) => before.correction[field] !== after.correction[field]),
    ],
  );
  await client.query(
    "UPDATE sales_drafts SET version=$2,updated_at=$3,general_notes=$4 WHERE id=$1",
    [fixture.orderId, after.version, instant, after.correction.generalNotes],
  );
};
const expectConstraint = async (
  client: PoolClient,
  constraint: string,
  action: () => Promise<unknown>,
) => {
  await client.query("SAVEPOINT p08_negative");
  try {
    await expect(action()).rejects.toMatchObject({ code: "23514", constraint });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT p08_negative");
    await client.query("RELEASE SAVEPOINT p08_negative");
  }
};

it("accepts a true correction graph and retains the original receipt unchanged after a later version", async () => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    const fixture = await seedOrder(client),
      before = await readFacts(client, fixture.orderId);
    const first = correctionCommand(fixture, before, "Building B");
    await completeCorrection(client, fixture, first);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    expect(await readFacts(client, fixture.orderId)).toEqual(first.after);
    await expectConstraint(client, "ck_administration_retained", () =>
      client.query(
        "UPDATE administration_commands SET reason='rewrite' WHERE command_id=$1",
        [first.commandId],
      ),
    );
    await expectConstraint(client, "ck_administration_retained", () =>
      client.query(
        "DELETE FROM administration_order_corrections WHERE command_id=$1",
        [first.commandId],
      ),
    );
    const next = correctionCommand(fixture, first.after, "Building C");
    await completeCorrection(client, fixture, next);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const retained = await client.query<{ outcome: unknown }>(
      "SELECT outcome FROM administration_commands WHERE command_id=$1",
      [first.commandId],
    );
    expect(retained.rows[0]?.outcome).toEqual(first.outcome);
    expect(await readFacts(client, fixture.orderId)).toEqual(next.after);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("rejects forged before facts and an orphan parent with exact SQL constraints", async () => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    const fixture = await seedOrder(client),
      before = await readFacts(client, fixture.orderId);
    const command = correctionCommand(fixture, before, "Building B");
    await expectConstraint(client, "ck_administration_piece_binding", () =>
      insertParent(client, fixture, {
        ...command,
        outcome: {
          ...command.outcome,
          receipt: { ...command.outcome.receipt, operation: "ADMIN_CANCEL" },
          result: {
            ...command.outcome.result,
            pieceIds: [fixture.pieceId, fixture.pieceId],
          },
        },
      }),
    );
    await expectConstraint(client, "ck_administration_command_graph", () =>
      insertParent(client, fixture, {
        ...command,
        before: {
          ...before,
          correction: { ...before.correction, customerName: "Forged" },
        },
      }),
    );
    await expectConstraint(client, "ck_administration_command_shape", () =>
      insertParent(client, { ...fixture, actorId: randomUUID() }, command),
    );
    await expectConstraint(
      client,
      "ck_administration_command_graph",
      async () => {
        await insertParent(client, fixture, command);
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      },
    );
    await expectConstraint(
      client,
      "ck_administration_order_note_witness",
      async () => {
        await client.query(
          "UPDATE sales_drafts SET general_notes='unwitnessed' WHERE id=$1",
          [fixture.orderId],
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      },
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("binds allowed note changes and rejects false effects, receipt shapes and changed-field claims", async () => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    const fixture = await seedOrder(client),
      before = await readFacts(client, fixture.orderId);
    const proposed = correctionCommand(fixture, before, "Building B");
    const after = {
      ...proposed.after,
      correction: {
        ...proposed.after.correction,
        generalNotes: "Correct order-level note",
      },
    };
    const command = {
      ...proposed,
      after,
      outcome: {
        ...proposed.outcome,
        after,
        result: { ...proposed.outcome.result, correction: after.correction },
      },
    };
    await expectConstraint(client, "ck_administration_command_shape", () =>
      insertParent(client, fixture, {
        ...command,
        after: { ...after, money: { ...after.money, remainingDue: "0.00" } },
      }),
    );
    await expectConstraint(
      client,
      "ck_administration_command_shape",
      async () => {
        await completeCorrection(client, fixture, {
          ...command,
          outcome: { ...command.outcome, replayed: true },
        });
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      },
    );
    await expectConstraint(
      client,
      "ck_administration_command_graph",
      async () => {
        await completeCorrection(client, fixture, command);
        await client.query(
          "UPDATE sales_orders SET paid_amount=200 WHERE id=$1",
          [fixture.orderId],
        );
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      },
    );
    await expectConstraint(
      client,
      "ck_administration_command_shape",
      async () => {
        await completeCorrection(client, fixture, {
          ...command,
          outcome: {
            ...command.outcome,
            receipt: {
              ...command.outcome.receipt,
              occurredAt: "invalid-instant",
            },
          },
        });
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      },
    );

    await completeCorrection(client, fixture, command);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    expect(await readFacts(client, fixture.orderId)).toEqual(after);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("validates original P08 CHECK facts with an empty caller search path without weakening rejection", async () => {
  const client = await ownedPool().connect();
  try {
    await client.query("BEGIN");
    const fixture = await seedOrder(client),
      facts = await readFacts(client, fixture.orderId);
    await client.query("SET LOCAL search_path=pg_catalog");
    const valid = await client.query<{ facts: boolean; correction: boolean }>(
      "SELECT public.p08_valid_facts($1::jsonb) AS facts,public.p08_valid_correction($2::jsonb) AS correction",
      [JSON.stringify(facts), JSON.stringify(facts.correction)],
    );
    expect(valid.rows).toEqual([{ facts: true, correction: true }]);
    const invalid = await client.query<{ facts: boolean; correction: boolean }>(
      "SELECT public.p08_valid_facts($1::jsonb) AS facts,public.p08_valid_correction($2::jsonb) AS correction",
      [
        JSON.stringify({ ...facts, counts: { ...facts.counts, active: 0 } }),
        JSON.stringify({
          ...facts.correction,
          unacceptedField: "not permitted",
        }),
      ],
    );
    expect(invalid.rows).toEqual([{ facts: false, correction: false }]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
