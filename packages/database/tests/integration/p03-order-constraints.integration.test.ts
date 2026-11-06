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
      `INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES ($1,'Customer','+966500000001',now(),now())`,
      [ids.customerId],
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

const snapshot = async (client: PoolClient, ids: Fixture) => {
  const stored = await client.query<{ graph: unknown }>(
    `SELECT jsonb_build_object(
    'root',(SELECT to_jsonb(r) FROM sales_drafts r WHERE id=$1),
    'order',(SELECT to_jsonb(o) FROM sales_orders o WHERE id=$1),
    'pieces',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM sales_draft_pieces p WHERE draft_id=$1),
    'terms',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM sales_order_pieces e WHERE order_id=$1),
    'selections',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.field) FROM sales_piece_catalog_selections s WHERE piece_id=$2),
    'source',(SELECT to_jsonb(c) FROM catalog_sources c WHERE id=$3),
    'entry',(SELECT to_jsonb(e) FROM catalog_entries e WHERE id=$4),
    'counter',(SELECT to_jsonb(c) FROM business_order_counter c WHERE id='global'),
    'receipts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY command_id) FROM sales_commands c WHERE draft_id=$1)
    ) AS graph`,
    [ids.orderId, ids.pieceId, ids.sourceId, ids.entryId],
  );
  return stored.rows[0]?.graph;
};

type RejectionCase = readonly [
  string,
  string,
  keyof Fixture | null,
  string,
  string,
];
const rejectedWrites: RejectionCase[] = [
  [
    "duplicate source cell identity",
    `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES (gen_random_uuid(),$1,'decoration','Z3','Decoration','decoration',1,1800,'AA3')`,
    "sourceId",
    "23505",
    "catalog_entries_source_kind_cell_key",
  ],
  [
    "duplicate current field identity",
    `INSERT INTO sales_piece_catalog_selections SELECT piece_id,field,entry_id FROM sales_piece_catalog_selections WHERE piece_id=$1`,
    "pieceId",
    "23505",
    "sales_piece_catalog_selections_pkey",
  ],
  [
    "activation without its action time",
    `UPDATE catalog_activation SET source_id=$1 WHERE id='active'`,
    "sourceId",
    "23514",
    "ck_catalog_activation_singleton",
  ],
  [
    "new submitted physical piece",
    `INSERT INTO sales_draft_pieces(id,draft_id,position,created_at,updated_at) VALUES (gen_random_uuid(),$1,2,now(),now())`,
    "orderId",
    "23514",
    "ck_sales_order_piece_membership",
  ],
  [
    "second global counter key",
    `INSERT INTO business_order_counter(id,last_issued) VALUES ('other',0)`,
    null,
    "23514",
    "ck_business_order_counter_singleton",
  ],
  [
    "invalid source hash",
    `INSERT INTO catalog_sources(id,sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest) VALUES (gen_random_uuid(),'bad','test','A1',1,now(),'test',1874,'{}')`,
    null,
    "23514",
    "ck_catalog_sources_hash",
  ],
  [
    "duplicate reviewed source",
    `INSERT INTO catalog_sources SELECT gen_random_uuid(),sha256,worksheet,source_extent,mapping_version,loaded_at,loaded_by_reference,entry_count,manifest FROM catalog_sources WHERE id=$1`,
    "sourceId",
    "23505",
    "catalog_sources_sha256_key",
  ],
  [
    "blank catalog display",
    `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position) VALUES (gen_random_uuid(),$1,'model','H3',' ','m',1)`,
    "sourceId",
    "23514",
    "ck_catalog_entries_value",
  ],
  [
    "missing decoration rate",
    `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position) VALUES (gen_random_uuid(),$1,'decoration','Z4','Other','other',2)`,
    "sourceId",
    "23514",
    "ck_catalog_entries_rate",
  ],
  [
    "missing color family",
    `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position) VALUES (gen_random_uuid(),$1,'decorationColor','L3','Color','color',1)`,
    "sourceId",
    "23514",
    "ck_catalog_entries_family",
  ],
  [
    "retained source mutation",
    `UPDATE catalog_sources SET manifest='{"changed":true}' WHERE id=$1`,
    "sourceId",
    "23514",
    "ck_catalog_retained_immutable",
  ],
  [
    "retained entry deletion",
    `DELETE FROM catalog_entries WHERE id=$1`,
    "entryId",
    "23514",
    "ck_catalog_retained_immutable",
  ],
  [
    "wrong typed selection",
    `INSERT INTO sales_piece_catalog_selections SELECT $1,'size',decoration_entry_id FROM sales_order_pieces WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_piece_catalog_selection_kind",
  ],
  [
    "invalid activation key",
    `INSERT INTO catalog_activation(id) VALUES ('other')`,
    null,
    "23514",
    "ck_catalog_activation_singleton",
  ],
  [
    "invalid number year",
    `UPDATE sales_orders SET number_year=0 WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_terms_immutable",
  ],
  [
    "out-of-range number at insertion",
    `INSERT INTO sales_orders(id,business_number,number_sequence,number_year,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount)
    SELECT id,'SHOP-0000-'||lpad(number_sequence::text,GREATEST(4,length(number_sequence::text)),'0'),number_sequence,0,submitted_at,submitted_by_id,owner_full_name_at_submission,customer_name,customer_phone,catalog_source_id,total_amount,paid_amount FROM sales_orders WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_number",
  ],
  [
    "returned proof without a revision",
    `UPDATE sales_orders SET status='RETURNED',current_return_decision_id=gen_random_uuid(),current_return_reason='Reason',current_returned_at=now() WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_return_proof",
  ],
  [
    "return proof from another root revision",
    `UPDATE sales_orders SET status='RETURNED',current_return_decision_id=gen_random_uuid(),current_return_order_version=2,current_return_reason='Reason',current_returned_at=now() WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_graph",
  ],
  [
    "negative paid",
    `UPDATE sales_orders SET paid_amount=-1 WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_money",
  ],
  [
    "excess paid precision",
    `UPDATE sales_orders SET paid_amount=1.001 WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_money",
  ],
  [
    "paid trailing excess scale",
    `UPDATE sales_orders SET paid_amount=1.000 WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_money",
  ],
  [
    "incomplete current return proof",
    `UPDATE sales_orders SET status='RETURNED' WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_return_proof",
  ],
  [
    "fabricated approved state without timestamp",
    `UPDATE sales_orders SET status='APPROVED' WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_orders_approval_state",
  ],
  [
    "frozen contact replacement",
    `UPDATE sales_orders SET customer_name='Changed' WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_terms_immutable",
  ],
  [
    "submitted root type replacement",
    `UPDATE sales_drafts SET type='EXTERNAL' WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_terms_immutable",
  ],
  [
    "foreign physical piece membership",
    `INSERT INTO sales_order_pieces(id,order_id,decoration_entry_id,price_source_id,decoration_label,unit_price,price_source_cell) SELECT gen_random_uuid(),id,(SELECT id FROM catalog_entries WHERE source_id=catalog_source_id LIMIT 1),catalog_source_id,'Decoration',1800,'AA3' FROM sales_orders WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_piece_membership",
  ],
  [
    "frozen price replacement",
    `UPDATE sales_order_pieces SET unit_price=1801 WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_terms_immutable",
  ],
  [
    "piece excess scale before rounding",
    `UPDATE sales_order_pieces SET unit_price=1800.000 WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_money",
  ],
  [
    "equal-value position write on submitted piece",
    `UPDATE sales_draft_pieces SET position=position WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_terms_immutable",
  ],
  [
    "decoration reference deletion",
    `DELETE FROM sales_piece_catalog_selections WHERE piece_id=$1 AND field='decoration'`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_terms_immutable",
  ],
  [
    "receipt without physical warehouse stage",
    `UPDATE sales_order_pieces SET received_at=now() WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_receipt",
  ],
  [
    "cancellation without retained reason",
    `UPDATE sales_order_pieces SET stage='CANCELLED' WHERE id=$1`,
    "pieceId",
    "23514",
    "ck_sales_order_piece_cancellation",
  ],
  [
    "incorrect aggregate total",
    `UPDATE sales_orders SET total_amount=1799 WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_graph",
  ],
  [
    "incomplete promoted graph",
    `INSERT INTO sales_drafts(id,owner_id,customer_id,type,status,created_at,updated_at) SELECT gen_random_uuid(),owner_id,customer_id,type,'SUBMITTED',now(),now() FROM sales_drafts WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_order_graph",
  ],
  [
    "negative global counter",
    `UPDATE business_order_counter SET last_issued=-1 WHERE id='global'`,
    null,
    "23514",
    "ck_business_order_counter_singleton",
  ],
  [
    "invalid new command update binding",
    `INSERT INTO sales_commands(command_id,operation,actor_id,actor_full_name,actor_role,draft_id,after_version,payload_hash,after,occurred_at) SELECT gen_random_uuid(),'SUBMIT_DRAFT',owner_id,'Sales A','ADMIN',id,1,repeat('a',64),'{}',now() FROM sales_drafts WHERE id=$1`,
    "orderId",
    "23514",
    "ck_sales_commands_binding",
  ],
];

it.each(rejectedWrites)(
  "rejects %s and preserves the complete accepted graph",
  async (_scenario, sql, target, code, constraint) => {
    await withSubmittedGraph(async (client, ids) => {
      const before = await snapshot(client, ids);
      await client.query("SAVEPOINT rejected_write");
      await expect(
        (async () => {
          await client.query(sql, target === null ? [] : [ids[target]]);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        })(),
      ).rejects.toMatchObject({ code, constraint });
      await client.query("ROLLBACK TO SAVEPOINT rejected_write");
      await client.query("RELEASE SAVEPOINT rejected_write");
      expect(await snapshot(client, ids)).toEqual(before);
    });
  },
);

it.each(["-1", "1000000000", "1.001", "1.000", "NaN", "Infinity", "-Infinity"])(
  "rejects raw catalog amount %s without numeric coercion",
  async (amount) => {
    await withSubmittedGraph(async (client, ids) => {
      const before = await snapshot(client, ids);
      await client.query("SAVEPOINT rejected_rate");
      await expect(
        client.query(
          `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell)
      VALUES (gen_random_uuid(),$1,'decoration','Z4','Other','other',2,$2,'AA4')`,
          [ids.sourceId, amount],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_catalog_entries_rate",
      });
      await client.query("ROLLBACK TO SAVEPOINT rejected_rate");
      await client.query("RELEASE SAVEPOINT rejected_rate");
      expect(await snapshot(client, ids)).toEqual(before);
    });
  },
);

it("accepts capture-only correction and exact paid boundaries with the real immutability triggers active", async () => {
  await withSubmittedGraph(async (client, ids) => {
    await client.query(
      `UPDATE sales_draft_pieces SET size='40.5' WHERE id=$1`,
      [ids.pieceId],
    );
    await client.query(
      `UPDATE sales_orders SET paid_amount=999999999.99 WHERE id=$1`,
      [ids.orderId],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const stored = await client.query<{ size: string; paid: string }>(
      `SELECT p.size,o.paid_amount::text AS paid FROM sales_draft_pieces p JOIN sales_orders o ON o.id=p.draft_id WHERE p.id=$1`,
      [ids.pieceId],
    );
    expect(stored.rows).toEqual([{ size: "40.5", paid: "999999999.99" }]);
  });
});

it.each(["move", "retype", "replace"] as const)(
  "rejects a frozen decoration %s through a valid free destination and preserves both graphs",
  async (scenario) => {
    await withSubmittedGraph(async (client, ids) => {
      const draftId = randomUUID(),
        draftPieceId = randomUUID(),
        modelId = randomUUID(),
        otherDecorationId = randomUUID();
      await client.query(
        `INSERT INTO sales_drafts(id,owner_id,type,created_at,updated_at) VALUES ($1,$2,'SHOP',now(),now())`,
        [draftId, ids.ownerId],
      );
      await client.query(
        `INSERT INTO sales_draft_pieces(id,draft_id,position,decoration,created_at,updated_at) VALUES ($1,$2,1,'Decoration',now(),now())`,
        [draftPieceId, draftId],
      );
      await client.query(
        `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position) VALUES ($1,$2,'model','H3','SM','sm',1)`,
        [modelId, ids.sourceId],
      );
      await client.query(
        `INSERT INTO catalog_entries(id,source_id,kind,source_cell,display_value,lookup_value,position,unit_price,price_source_cell) VALUES ($1,$2,'decoration','Z4','Decoration','other',2,1500,'AA4')`,
        [otherDecorationId, ids.sourceId],
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const destination = async () =>
        (
          await client.query<{ graph: unknown }>(
            `SELECT jsonb_build_object('root',(SELECT to_jsonb(r) FROM sales_drafts r WHERE id=$1),'piece',(SELECT to_jsonb(p) FROM sales_draft_pieces p WHERE id=$2),'selections',(SELECT jsonb_agg(to_jsonb(s)) FROM sales_piece_catalog_selections s WHERE piece_id=$2)) AS graph`,
            [draftId, draftPieceId],
          )
        ).rows;
      const before = await snapshot(client, ids),
        beforeDestination = await destination();
      await client.query("SAVEPOINT frozen_binding");
      const updates = {
        move: [
          `UPDATE sales_piece_catalog_selections SET piece_id=$2 WHERE piece_id=$1 AND field='decoration'`,
          draftPieceId,
        ],
        retype: [
          `UPDATE sales_piece_catalog_selections SET field='model',entry_id=$2 WHERE piece_id=$1 AND field='decoration'`,
          modelId,
        ],
        replace: [
          `UPDATE sales_piece_catalog_selections SET entry_id=$2 WHERE piece_id=$1 AND field='decoration'`,
          otherDecorationId,
        ],
      } as const;
      const [sql, destinationId] = updates[scenario];
      await expect(
        client.query(sql, [ids.pieceId, destinationId]),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_sales_order_piece_terms_immutable",
      });
      await client.query("ROLLBACK TO SAVEPOINT frozen_binding");
      expect(await snapshot(client, ids)).toEqual(before);
      expect(await destination()).toEqual(beforeDestination);
      // The same free destinations remain valid for unsubmitted and nonprice selections.
      await client.query(
        `INSERT INTO sales_piece_catalog_selections(piece_id,field,entry_id) VALUES ($1,'decoration',$2),($3,'model',$4)`,
        [draftPieceId, ids.entryId, ids.pieceId, modelId],
      );
      await client.query(
        `UPDATE sales_piece_catalog_selections SET entry_id=$2 WHERE piece_id=$1 AND field='decoration'`,
        [draftPieceId, otherDecorationId],
      );
      await client.query(
        `UPDATE sales_piece_catalog_selections SET entry_id=entry_id WHERE piece_id=$1`,
        [ids.pieceId],
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect(
        (
          await client.query(
            `SELECT entry_id FROM sales_piece_catalog_selections WHERE piece_id=$1 AND field='decoration'`,
            [ids.pieceId],
          )
        ).rows,
      ).toEqual([{ entry_id: ids.entryId }]);
      expect(
        (
          await client.query(
            `SELECT entry_id FROM sales_piece_catalog_selections WHERE piece_id=$1 AND field='decoration'`,
            [draftPieceId],
          )
        ).rows,
      ).toEqual([{ entry_id: otherDecorationId }]);
    });
  },
);
