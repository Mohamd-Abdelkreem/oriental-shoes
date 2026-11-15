BEGIN;

-- CreateEnum
CREATE TYPE "warehouse_operation" AS ENUM ('RECEIVE', 'DISPATCH', 'CONFIRM_DELIVERY', 'FAIL_DELIVERY', 'RETRY_DELIVERY');

-- CreateEnum
CREATE TYPE "warehouse_receipt_origin" AS ENUM ('COMMAND', 'LEGACY_BASELINE');

-- CreateTable
CREATE TABLE "warehouse_commands" (
    "command_id" UUID NOT NULL,
    "operation" "warehouse_operation" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "payload_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "outcome" JSONB NOT NULL,

    CONSTRAINT "warehouse_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateTable
CREATE TABLE "warehouse_command_orders" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "before_status" "sales_order_status" NOT NULL,
    "after_status" "sales_order_status" NOT NULL,
    "piece_ids" UUID[] NOT NULL,

    CONSTRAINT "warehouse_command_orders_pkey" PRIMARY KEY ("command_id","order_id")
);

-- CreateTable
CREATE TABLE "warehouse_receipt_groups" (
    "id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "carton_count" VARCHAR(4000),
    "storage_location" VARCHAR(4000),
    "notes" VARCHAR(4000),

    CONSTRAINT "warehouse_receipt_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_receipt_pieces" (
    "piece_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "origin" "warehouse_receipt_origin" NOT NULL,
    "group_id" UUID,
    "quality_event_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouse_receipt_pieces_pkey" PRIMARY KEY ("piece_id")
);

-- CreateIndex
CREATE INDEX "warehouse_commands_actor_time_idx" ON "warehouse_commands"("actor_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_command_orders_event_key" ON "warehouse_command_orders"("event_id");

-- CreateIndex
CREATE INDEX "warehouse_command_orders_order_event_idx" ON "warehouse_command_orders"("order_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_command_orders_order_version_key" ON "warehouse_command_orders"("order_id", "after_version");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_receipt_groups_command_order_key" ON "warehouse_receipt_groups"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_receipt_groups_id_order_key" ON "warehouse_receipt_groups"("id", "order_id");

-- CreateIndex
CREATE INDEX "warehouse_receipt_pieces_group_order_idx" ON "warehouse_receipt_pieces"("group_id", "order_id");

-- CreateIndex
CREATE INDEX "warehouse_receipt_pieces_quality_order_piece_idx" ON "warehouse_receipt_pieces"("quality_event_id", "order_id", "piece_id");

-- CreateIndex
CREATE INDEX "warehouse_receipt_pieces_order_group_piece_idx" ON "warehouse_receipt_pieces"("order_id", "group_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_receipt_pieces_piece_order_key" ON "warehouse_receipt_pieces"("piece_id", "order_id");

-- AddForeignKey
ALTER TABLE "warehouse_commands" ADD CONSTRAINT "warehouse_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_command_orders" ADD CONSTRAINT "warehouse_command_orders_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "warehouse_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_command_orders" ADD CONSTRAINT "warehouse_command_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_receipt_groups" ADD CONSTRAINT "warehouse_receipt_groups_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "warehouse_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_receipt_pieces" ADD CONSTRAINT "warehouse_receipt_pieces_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_receipt_pieces" ADD CONSTRAINT "warehouse_receipt_pieces_group_id_order_id_fkey" FOREIGN KEY ("group_id", "order_id") REFERENCES "warehouse_receipt_groups"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_receipt_pieces" ADD CONSTRAINT "warehouse_receipt_pieces_quality_event_id_order_id_piece_i_fkey" FOREIGN KEY ("quality_event_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;


ALTER TABLE warehouse_commands ADD CONSTRAINT ck_warehouse_command_shape CHECK (
  payload_hash ~ '^[0-9a-f]{64}$' AND actor_full_name !~ '^[[:space:]]*$'
  AND (actor_role='ADMIN' OR (actor_role='USER' AND actor_department IS NOT DISTINCT FROM 'WAREHOUSE'::department))
  AND jsonb_typeof(outcome)='object'
);
ALTER TABLE warehouse_command_orders ADD CONSTRAINT ck_warehouse_order_shape CHECK (
  before_version BETWEEN 1 AND 2147483647 AND after_version BETWEEN 1 AND 2147483647
  AND after_version::bigint=before_version::bigint+1
  AND cardinality(piece_ids) BETWEEN 1 AND 200 AND array_position(piece_ids,NULL) IS NULL
);
ALTER TABLE warehouse_receipt_groups ADD CONSTRAINT ck_warehouse_receipt_text CHECK (
  (carton_count IS NULL OR carton_count !~ '^[[:space:]]*$')
  AND (storage_location IS NULL OR storage_location !~ '^[[:space:]]*$')
  AND (notes IS NULL OR notes !~ '^[[:space:]]*$')
);
ALTER TABLE warehouse_receipt_pieces ADD CONSTRAINT ck_warehouse_receipt_origin CHECK (
  (origin='COMMAND' AND group_id IS NOT NULL AND quality_event_id IS NOT NULL)
  OR (origin='LEGACY_BASELINE' AND group_id IS NULL AND quality_event_id IS NULL)
);

-- CreateEnum
CREATE TYPE "warehouse_delivery_outcome_kind" AS ENUM ('DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "warehouse_delivery_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "command_id" UUID NOT NULL,
    "delivery_note" VARCHAR(4000),
    "predecessor_retry_id" UUID,

    CONSTRAINT "warehouse_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_delivery_attempt_members" (
    "attempt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,

    CONSTRAINT "warehouse_delivery_attempt_members_pkey" PRIMARY KEY ("attempt_id","piece_id")
);

-- CreateTable
CREATE TABLE "warehouse_delivery_outcomes" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "kind" "warehouse_delivery_outcome_kind" NOT NULL,
    "recipient" VARCHAR(4000),
    "delivered_at" TIMESTAMPTZ(6),
    "reason" VARCHAR(4000),
    "notes" VARCHAR(4000),
    "returned_to_warehouse" BOOLEAN NOT NULL,

    CONSTRAINT "warehouse_delivery_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_delivery_retries" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "outcome_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "retry_date" DATE,
    "notes" VARCHAR(4000),

    CONSTRAINT "warehouse_delivery_retries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_attempts_predecessor_retry_key" ON "warehouse_delivery_attempts"("predecessor_retry_id");

-- CreateIndex
CREATE INDEX "warehouse_delivery_attempts_order_number_idx" ON "warehouse_delivery_attempts"("order_id", "number" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_attempts_order_number_key" ON "warehouse_delivery_attempts"("order_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_attempts_id_order_key" ON "warehouse_delivery_attempts"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_attempts_command_order_key" ON "warehouse_delivery_attempts"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_attempts_predecessor_order_key" ON "warehouse_delivery_attempts"("predecessor_retry_id", "order_id");

-- CreateIndex
CREATE INDEX "warehouse_delivery_attempt_members_order_piece_attempt_idx" ON "warehouse_delivery_attempt_members"("order_id", "piece_id", "attempt_id");

-- CreateIndex
CREATE INDEX "warehouse_delivery_attempt_members_piece_order_idx" ON "warehouse_delivery_attempt_members"("piece_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_outcomes_attempt_key" ON "warehouse_delivery_outcomes"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_outcomes_id_order_key" ON "warehouse_delivery_outcomes"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_outcomes_attempt_order_key" ON "warehouse_delivery_outcomes"("attempt_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_outcomes_command_order_key" ON "warehouse_delivery_outcomes"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_retries_attempt_key" ON "warehouse_delivery_retries"("attempt_id");

-- CreateIndex
CREATE INDEX "warehouse_delivery_retries_outcome_order_idx" ON "warehouse_delivery_retries"("outcome_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_retries_id_order_key" ON "warehouse_delivery_retries"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_retries_attempt_order_key" ON "warehouse_delivery_retries"("attempt_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_delivery_retries_command_order_key" ON "warehouse_delivery_retries"("command_id", "order_id");

-- AddForeignKey
ALTER TABLE "warehouse_delivery_attempts" ADD CONSTRAINT "warehouse_delivery_attempts_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "warehouse_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_attempts" ADD CONSTRAINT "warehouse_delivery_attempts_predecessor_retry_id_order_id_fkey" FOREIGN KEY ("predecessor_retry_id", "order_id") REFERENCES "warehouse_delivery_retries"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_attempt_members" ADD CONSTRAINT "warehouse_delivery_attempt_members_attempt_id_order_id_fkey" FOREIGN KEY ("attempt_id", "order_id") REFERENCES "warehouse_delivery_attempts"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_attempt_members" ADD CONSTRAINT "warehouse_delivery_attempt_members_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "warehouse_receipt_pieces"("piece_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_outcomes" ADD CONSTRAINT "warehouse_delivery_outcomes_attempt_id_order_id_fkey" FOREIGN KEY ("attempt_id", "order_id") REFERENCES "warehouse_delivery_attempts"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_outcomes" ADD CONSTRAINT "warehouse_delivery_outcomes_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "warehouse_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_retries" ADD CONSTRAINT "warehouse_delivery_retries_attempt_id_order_id_fkey" FOREIGN KEY ("attempt_id", "order_id") REFERENCES "warehouse_delivery_attempts"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_retries" ADD CONSTRAINT "warehouse_delivery_retries_outcome_id_order_id_fkey" FOREIGN KEY ("outcome_id", "order_id") REFERENCES "warehouse_delivery_outcomes"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "warehouse_delivery_retries" ADD CONSTRAINT "warehouse_delivery_retries_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "warehouse_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;


ALTER TABLE warehouse_delivery_attempts ADD CONSTRAINT ck_warehouse_attempt_local CHECK (
  number>0 AND ((number=1 AND predecessor_retry_id IS NULL) OR (number>1 AND predecessor_retry_id IS NOT NULL))
  AND (delivery_note IS NULL OR delivery_note !~ '^[[:space:]]*$')
);
ALTER TABLE warehouse_delivery_outcomes ADD CONSTRAINT ck_warehouse_outcome_shape CHECK (
  ((kind='DELIVERED' AND returned_to_warehouse=false AND reason IS NULL)
    OR (kind='FAILED' AND returned_to_warehouse=true AND reason IS NOT NULL AND recipient IS NULL AND delivered_at IS NULL))
  AND (recipient IS NULL OR recipient !~ '^[[:space:]]*$')
  AND (reason IS NULL OR reason !~ '^[[:space:]]*$')
  AND (notes IS NULL OR notes !~ '^[[:space:]]*$')
);
ALTER TABLE warehouse_delivery_retries ADD CONSTRAINT ck_warehouse_retry_local CHECK (
  (notes IS NULL OR notes !~ '^[[:space:]]*$')
  AND (retry_date IS NULL OR extract(year from retry_date) BETWEEN 1 AND 9999)
);

DO $$
DECLARE affected UUID; rejected BIGINT;
BEGIN
 SELECT count(*),min(id::text)::uuid INTO rejected,affected FROM sales_orders WHERE status IN ('OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED');
 IF rejected>0 THEN RAISE EXCEPTION 'Unproved existing delivery state: count %, example order %. Authorized provenance audit required',rejected,affected
   USING ERRCODE='23514',CONSTRAINT='ck_warehouse_upgrade_provenance'; END IF;
 SELECT count(*),min(p.id::text)::uuid INTO rejected,affected FROM sales_order_pieces p WHERE p.received_at IS NOT NULL AND (
   (p.stage<>'CANCELLED' AND (p.stage<>'WAREHOUSE' OR p.work_state<>'COMPLETED'))
   OR p.issue_id IS NOT NULL OR p.current_work_visit_id IS NOT NULL
   OR EXISTS(SELECT 1 FROM quality_work_visits v WHERE v.order_id=p.order_id AND v.piece_id=p.id AND v.ended_at IS NULL)
   OR EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=p.order_id AND q.piece_id=p.id AND q.state='OPEN'));
 IF rejected>0 THEN RAISE EXCEPTION 'Contradictory known receipt: count %, example piece %',rejected,affected
   USING ERRCODE='23514',CONSTRAINT='ck_warehouse_upgrade_receipt'; END IF;
 IF EXISTS(SELECT 1 FROM sales_orders h WHERE h.status='READY_FOR_DELIVERY' AND (
   NOT EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=h.id AND p.stage<>'CANCELLED')
   OR EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=h.id AND p.stage<>'CANCELLED' AND (
     p.received_at IS NULL OR p.stage<>'WAREHOUSE' OR p.work_state<>'COMPLETED' OR p.issue_id IS NOT NULL OR p.current_work_visit_id IS NOT NULL))
   OR EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=h.id AND q.state='OPEN')))
 THEN RAISE EXCEPTION 'Existing ready order lacks exact eligible receipt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_upgrade_receipt'; END IF;
END $$;

INSERT INTO warehouse_receipt_pieces(piece_id,order_id,origin,group_id,quality_event_id,received_at)
 SELECT id,order_id,'LEGACY_BASELINE',NULL,NULL,received_at FROM sales_order_pieces WHERE received_at IS NOT NULL;

-- Only derived custody is repaired; no root version, history or submitted term changes.
UPDATE sales_orders h SET status='READY_FOR_DELIVERY' WHERE h.status='APPROVED'
  AND EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=h.id AND p.stage<>'CANCELLED')
  AND NOT EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=h.id AND p.stage<>'CANCELLED' AND (
    p.received_at IS NULL OR p.stage<>'WAREHOUSE' OR p.work_state<>'COMPLETED' OR p.issue_id IS NOT NULL OR p.current_work_visit_id IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=h.id AND q.state='OPEN');

CREATE FUNCTION check_p07_warehouse_order_state(order_key UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE head sales_orders%ROWTYPE; active_count INTEGER; received_count INTEGER;
  latest warehouse_delivery_attempts%ROWTYPE; terminal warehouse_delivery_outcomes%ROWTYPE;
  retried warehouse_delivery_retries%ROWTYPE;
BEGIN
 SELECT * INTO head FROM sales_orders WHERE id=order_key;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*) FILTER(WHERE stage<>'CANCELLED'), count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL)
 INTO active_count,received_count FROM sales_order_pieces WHERE order_id=order_key;
 IF EXISTS(SELECT 1 FROM sales_order_pieces p LEFT JOIN warehouse_receipt_pieces r ON r.piece_id=p.id AND r.order_id=p.order_id
   WHERE p.order_id=order_key AND (p.received_at IS DISTINCT FROM r.received_at
     OR (r.piece_id IS NOT NULL AND p.stage<>'CANCELLED' AND (p.stage<>'WAREHOUSE' OR p.work_state<>'COMPLETED'))))
 THEN RAISE EXCEPTION 'Initial warehouse receipt and physical evidence disagree' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_receipt_binding'; END IF;
 IF head.status IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED') AND (
   active_count=0 OR active_count<>received_count OR EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=order_key AND p.stage<>'CANCELLED'
     AND (p.stage<>'WAREHOUSE' OR p.work_state<>'COMPLETED' OR p.issue_id IS NOT NULL OR p.current_work_visit_id IS NOT NULL))
   OR EXISTS(SELECT 1 FROM quality_correction_cycles q WHERE q.order_id=order_key AND q.state='OPEN'))
 THEN RAISE EXCEPTION 'Delivery custody requires complete eligible physical receipt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_order_state'; END IF;
 SELECT * INTO latest FROM warehouse_delivery_attempts WHERE order_id=order_key ORDER BY number DESC LIMIT 1;
 IF NOT FOUND THEN
   IF head.status IN ('OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED') THEN
     RAISE EXCEPTION 'Delivery custody requires a retained attempt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_order_state'; END IF;
   RETURN;
 END IF;
 IF active_count<>(SELECT count(*) FROM warehouse_delivery_attempt_members WHERE attempt_id=latest.id)
   OR EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m JOIN sales_order_pieces p ON p.id=m.piece_id AND p.order_id=m.order_id
     WHERE m.attempt_id=latest.id AND p.stage='CANCELLED')
 THEN RAISE EXCEPTION 'Current attempt must retain the complete active order' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
 SELECT * INTO terminal FROM warehouse_delivery_outcomes WHERE attempt_id=latest.id;
 SELECT * INTO retried FROM warehouse_delivery_retries WHERE attempt_id=latest.id;
 IF head.status::text IS DISTINCT FROM (CASE WHEN terminal.id IS NULL THEN 'OUT_FOR_DELIVERY'
   WHEN terminal.kind='DELIVERED' THEN 'DELIVERED' WHEN retried.id IS NULL THEN 'DELIVERY_FAILED' ELSE 'READY_FOR_DELIVERY' END)
 THEN RAISE EXCEPTION 'Current order and latest delivery attempt disagree' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_order_state'; END IF;
END $$;

CREATE FUNCTION check_p07_warehouse_command(command_key UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE command warehouse_commands%ROWTYPE; group_count INTEGER; piece_count INTEGER; distinct_count INTEGER;
  expected JSONB; group_row warehouse_command_orders%ROWTYPE;
BEGIN
 SELECT * INTO command FROM warehouse_commands WHERE command_id=command_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Warehouse parent is required' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 SELECT count(*),coalesce(sum(cardinality(piece_ids)),0) INTO group_count,piece_count FROM warehouse_command_orders WHERE command_id=command_key;
 SELECT count(DISTINCT piece_id) INTO distinct_count FROM warehouse_command_orders g CROSS JOIN LATERAL unnest(g.piece_ids) piece_id WHERE g.command_id=command_key;
 IF group_count NOT BETWEEN 1 AND 200 OR piece_count NOT BETWEEN 1 AND 200 OR piece_count<>distinct_count
   OR EXISTS(SELECT 1 FROM warehouse_command_orders g WHERE g.command_id=command_key AND
     g.piece_ids IS DISTINCT FROM (SELECT array_agg(DISTINCT piece_id ORDER BY piece_id) FROM unnest(g.piece_ids) piece_id))
 THEN RAISE EXCEPTION 'Warehouse selection must contain sorted distinct bounded identities' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 SELECT jsonb_build_object('orders',jsonb_agg(jsonb_build_object(
   'eventId',g.event_id,'orderId',g.order_id,'beforeVersion',g.before_version,'afterVersion',g.after_version,
   'status',g.after_status,'pieceIds',g.piece_ids,'receiptGroupId',r.id,
   'attemptId',CASE command.operation WHEN 'DISPATCH' THEN a.id WHEN 'CONFIRM_DELIVERY' THEN o.attempt_id WHEN 'FAIL_DELIVERY' THEN o.attempt_id WHEN 'RETRY_DELIVERY' THEN t.attempt_id ELSE NULL END,
   'retryId',t.id) ORDER BY g.order_id)) INTO expected
 FROM warehouse_command_orders g
 LEFT JOIN warehouse_receipt_groups r ON r.command_id=g.command_id AND r.order_id=g.order_id
 LEFT JOIN warehouse_delivery_attempts a ON a.command_id=g.command_id AND a.order_id=g.order_id
 LEFT JOIN warehouse_delivery_outcomes o ON o.command_id=g.command_id AND o.order_id=g.order_id
 LEFT JOIN warehouse_delivery_retries t ON t.command_id=g.command_id AND t.order_id=g.order_id
 WHERE g.command_id=command_key;
 IF command.outcome IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'Warehouse result must equal its complete relational operation' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 FOR group_row IN SELECT * FROM warehouse_command_orders WHERE command_id=command_key ORDER BY order_id LOOP
   IF NOT EXISTS(SELECT 1 FROM sales_drafts d JOIN sales_orders h ON h.id=d.id WHERE d.id=group_row.order_id
     AND d.status='SUBMITTED' AND d.version=group_row.after_version AND h.status=group_row.after_status)
   THEN RAISE EXCEPTION 'New warehouse command must bind its current root head' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_head'; END IF;
   IF command.operation='RECEIVE' THEN
     IF group_row.before_status<>'APPROVED' OR group_row.after_status NOT IN ('APPROVED','READY_FOR_DELIVERY')
       OR group_row.piece_ids IS DISTINCT FROM (SELECT array_agg(r.piece_id ORDER BY r.piece_id) FROM warehouse_receipt_pieces r
         JOIN warehouse_receipt_groups g ON g.id=r.group_id AND g.order_id=r.order_id WHERE g.command_id=command_key AND g.order_id=group_row.order_id)
     THEN RAISE EXCEPTION 'Receipt requires its declared complete arrival' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_receipt_binding'; END IF;
   ELSIF command.operation='DISPATCH' THEN
     IF group_row.before_status<>'READY_FOR_DELIVERY' OR group_row.after_status<>'OUT_FOR_DELIVERY'
       OR group_row.piece_ids IS DISTINCT FROM (SELECT array_agg(m.piece_id ORDER BY m.piece_id) FROM warehouse_delivery_attempt_members m
         JOIN warehouse_delivery_attempts a ON a.id=m.attempt_id AND a.order_id=m.order_id WHERE a.command_id=command_key AND a.order_id=group_row.order_id)
     THEN RAISE EXCEPTION 'Dispatch requires its complete reviewed attempt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   ELSE
     IF (command.operation='CONFIRM_DELIVERY' AND (group_row.before_status<>'OUT_FOR_DELIVERY' OR group_row.after_status<>'DELIVERED'))
       OR (command.operation='FAIL_DELIVERY' AND (group_row.before_status<>'OUT_FOR_DELIVERY' OR group_row.after_status<>'DELIVERY_FAILED'))
       OR (command.operation='RETRY_DELIVERY' AND (group_row.before_status<>'DELIVERY_FAILED' OR group_row.after_status<>'READY_FOR_DELIVERY'))
       OR group_row.piece_ids IS DISTINCT FROM (SELECT array_agg(m.piece_id ORDER BY m.piece_id) FROM warehouse_delivery_attempt_members m
         WHERE m.attempt_id=coalesce((SELECT o.attempt_id FROM warehouse_delivery_outcomes o WHERE o.command_id=command_key AND o.order_id=group_row.order_id),
           (SELECT t.attempt_id FROM warehouse_delivery_retries t WHERE t.command_id=command_key AND t.order_id=group_row.order_id)))
     THEN RAISE EXCEPTION 'Outcome or retry requires its complete original attempt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   END IF;
 END LOOP;
END $$;

CREATE FUNCTION enforce_p07_warehouse_child() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE command warehouse_commands%ROWTYPE; declared JSONB; parent_key UUID; root_key UUID;
  group_row warehouse_command_orders%ROWTYPE; arrival warehouse_receipt_groups%ROWTYPE;
  attempt warehouse_delivery_attempts%ROWTYPE; prior warehouse_delivery_attempts%ROWTYPE;
  terminal warehouse_delivery_outcomes%ROWTYPE; retry warehouse_delivery_retries%ROWTYPE;
  recorded_at TIMESTAMPTZ;
BEGIN
 IF TG_TABLE_NAME='warehouse_receipt_pieces' THEN
   IF NEW.origin<>'COMMAND' THEN RAISE EXCEPTION 'Runtime legacy receipts are forbidden' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_retained'; END IF;
   SELECT * INTO arrival FROM warehouse_receipt_groups WHERE id=NEW.group_id AND order_id=NEW.order_id;
   parent_key:=arrival.command_id; root_key:=NEW.order_id;
 ELSIF TG_TABLE_NAME='warehouse_delivery_attempt_members' THEN
   SELECT * INTO attempt FROM warehouse_delivery_attempts WHERE id=NEW.attempt_id AND order_id=NEW.order_id;
   parent_key:=attempt.command_id; root_key:=NEW.order_id;
 ELSE parent_key:=NEW.command_id; root_key:=NEW.order_id;
 END IF;
 SELECT * INTO command FROM warehouse_commands WHERE command_id=parent_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Declared warehouse parent is required' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 SELECT entry INTO declared FROM jsonb_array_elements(command.outcome->'orders') entry WHERE entry->>'orderId'=root_key::text;
 IF declared IS NULL THEN RAISE EXCEPTION 'Undeclared warehouse order is forbidden' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 IF TG_TABLE_NAME='warehouse_command_orders' THEN
   IF declared->>'eventId' IS DISTINCT FROM NEW.event_id::text OR (declared->>'beforeVersion')::int IS DISTINCT FROM NEW.before_version
     OR (declared->>'afterVersion')::int IS DISTINCT FROM NEW.after_version OR declared->>'status' IS DISTINCT FROM NEW.after_status::text
     OR declared->'pieceIds' IS DISTINCT FROM to_jsonb(NEW.piece_ids)
   THEN RAISE EXCEPTION 'Warehouse child must match its frozen result' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO group_row FROM warehouse_command_orders WHERE command_id=parent_key AND order_id=root_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Warehouse order parent is required' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape'; END IF;
 CASE TG_TABLE_NAME
 WHEN 'warehouse_receipt_groups' THEN
   IF command.operation<>'RECEIVE' OR declared->>'receiptGroupId' IS DISTINCT FROM NEW.id::text
   THEN RAISE EXCEPTION 'Arrival requires its declared receipt command' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_receipt_binding'; END IF;
 WHEN 'warehouse_receipt_pieces' THEN
   IF command.operation<>'RECEIVE' OR declared->>'receiptGroupId' IS DISTINCT FROM NEW.group_id::text
     OR NOT (NEW.piece_id=ANY(group_row.piece_ids)) OR NEW.received_at IS DISTINCT FROM command.occurred_at
     OR NOT EXISTS(SELECT 1 FROM quality_piece_events e JOIN quality_commands c ON c.command_id=e.command_id
       WHERE e.id=NEW.quality_event_id AND e.order_id=NEW.order_id AND e.piece_id=NEW.piece_id
         AND e.decision='ACCEPT' AND e.before_stage='QUALITY' AND e.after_stage='WAREHOUSE' AND c.operation='INSPECT' AND c.occurred_at<=NEW.received_at)
   THEN RAISE EXCEPTION 'Receipt requires exact real quality acceptance and time' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_receipt_binding'; END IF;
 WHEN 'warehouse_delivery_attempts' THEN
   IF command.operation<>'DISPATCH' OR declared->>'attemptId' IS DISTINCT FROM NEW.id::text
   THEN RAISE EXCEPTION 'Attempt requires its declared dispatch' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   SELECT * INTO prior FROM warehouse_delivery_attempts WHERE order_id=root_key ORDER BY number DESC LIMIT 1;
   IF prior.id IS NULL THEN
     IF NEW.number<>1 OR NEW.predecessor_retry_id IS NOT NULL THEN RAISE EXCEPTION 'First attempt requires sequence one' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   ELSE
     SELECT * INTO retry FROM warehouse_delivery_retries WHERE id=NEW.predecessor_retry_id AND order_id=root_key AND attempt_id=prior.id;
     IF retry.id IS NULL OR NEW.number::bigint<>prior.number::bigint+1 THEN RAISE EXCEPTION 'Successor requires the latest failed attempt retry' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
     SELECT c.occurred_at INTO recorded_at FROM warehouse_commands c WHERE c.command_id=retry.command_id;
     IF recorded_at>command.occurred_at THEN RAISE EXCEPTION 'Successor precedes retry' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   END IF;
 WHEN 'warehouse_delivery_attempt_members' THEN
   IF command.operation<>'DISPATCH' OR declared->>'attemptId' IS DISTINCT FROM NEW.attempt_id::text
     OR NOT(NEW.piece_id=ANY(group_row.piece_ids))
     OR NOT EXISTS(SELECT 1 FROM warehouse_receipt_pieces r WHERE r.piece_id=NEW.piece_id AND r.order_id=root_key AND r.received_at<=command.occurred_at)
   THEN RAISE EXCEPTION 'Attempt member must be a declared initially received piece' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
 WHEN 'warehouse_delivery_outcomes' THEN
   IF command.operation NOT IN ('CONFIRM_DELIVERY','FAIL_DELIVERY') OR declared->>'attemptId' IS DISTINCT FROM NEW.attempt_id::text
     OR NEW.kind::text IS DISTINCT FROM (CASE command.operation WHEN 'CONFIRM_DELIVERY' THEN 'DELIVERED' ELSE 'FAILED' END)
     OR NEW.attempt_id IS DISTINCT FROM (SELECT id FROM warehouse_delivery_attempts WHERE order_id=root_key ORDER BY number DESC LIMIT 1)
   THEN RAISE EXCEPTION 'Outcome requires the current declared attempt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   SELECT c.occurred_at INTO recorded_at FROM warehouse_delivery_attempts a JOIN warehouse_commands c ON c.command_id=a.command_id WHERE a.id=NEW.attempt_id AND a.order_id=root_key;
   IF recorded_at IS NULL OR recorded_at>command.occurred_at THEN RAISE EXCEPTION 'Outcome must follow dispatch' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
 WHEN 'warehouse_delivery_retries' THEN
   SELECT * INTO terminal FROM warehouse_delivery_outcomes WHERE id=NEW.outcome_id AND order_id=root_key AND attempt_id=NEW.attempt_id;
   IF command.operation<>'RETRY_DELIVERY' OR declared->>'retryId' IS DISTINCT FROM NEW.id::text
     OR declared->>'attemptId' IS DISTINCT FROM NEW.attempt_id::text OR terminal.kind IS DISTINCT FROM 'FAILED'::warehouse_delivery_outcome_kind
     OR NEW.attempt_id IS DISTINCT FROM (SELECT id FROM warehouse_delivery_attempts WHERE order_id=root_key ORDER BY number DESC LIMIT 1)
   THEN RAISE EXCEPTION 'Retry requires the current failed full-return outcome' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   SELECT c.occurred_at INTO recorded_at FROM warehouse_commands c WHERE c.command_id=terminal.command_id;
   IF recorded_at>command.occurred_at THEN RAISE EXCEPTION 'Retry precedes failure' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
 ELSE RAISE EXCEPTION 'Unknown warehouse child' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_command_shape';
 END CASE;
 RETURN NEW;
END $$;

CREATE FUNCTION enforce_p07_warehouse_retained() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Warehouse action history is immutable' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_retained';
END $$;

CREATE FUNCTION enforce_p07_warehouse_graph() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE order_key UUID;
BEGIN
 PERFORM check_p07_warehouse_command(NEW.command_id);
 FOR order_key IN SELECT order_id FROM warehouse_command_orders WHERE command_id=NEW.command_id ORDER BY order_id LOOP
   PERFORM check_p07_warehouse_order_state(order_key);
 END LOOP;
 RETURN NEW;
END $$;

CREATE FUNCTION enforce_p07_root_current_state() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM warehouse_command_orders g WHERE g.order_id=NEW.id AND g.after_version=NEW.version)
   OR EXISTS(SELECT 1 FROM approval_commands c WHERE c.order_id=NEW.id AND c.after_version=NEW.version AND c.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND c.decision='CANCEL' AND c.outcome->>'pieceStage'='CANCELLED')
 THEN PERFORM check_p07_warehouse_order_state(NEW.id); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_p05_root_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE witnesses BIGINT;
BEGIN
 IF NEW.status<>'SUBMITTED' OR NEW.version=OLD.version THEN RETURN NULL; END IF;
 SELECT count(*) INTO witnesses FROM (
   SELECT command_id FROM sales_commands WHERE draft_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT command_id FROM approval_commands WHERE order_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT command_id FROM manufacturing_command_orders WHERE order_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT g.command_id FROM quality_command_orders g JOIN quality_commands c ON c.command_id=g.command_id
     WHERE g.order_id=NEW.id AND g.after_version=NEW.version AND c.operation<>'REPORT_ISSUES'
   UNION ALL SELECT source_reference_id FROM manufacturing_work_visits
     WHERE order_id=NEW.id AND source_order_version=NEW.version AND origin_kind='QUALITY_CORRECTION'
       AND NOT is_p06_correction_visit(id)
     GROUP BY source_reference_id,source_order_version
   UNION ALL SELECT command_id FROM warehouse_command_orders WHERE order_id=NEW.id AND after_version=NEW.version
 ) heads;
 IF NEW.version::bigint<>OLD.version::bigint+1 OR witnesses<>1 THEN
   RAISE EXCEPTION 'Submitted root requires one exact next-version witness' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION enforce_p05_piece_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; c approval_commands%ROWTYPE; before_piece JSONB; after_piece JSONB;
DECLARE current_visit manufacturing_work_visits%ROWTYPE;
BEGIN
 IF ROW(OLD.stage,OLD.work_state,OLD.issue_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
   IS NOT DISTINCT FROM ROW(NEW.stage,NEW.work_state,NEW.issue_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason) THEN RETURN NULL; END IF;
 SELECT * INTO root FROM sales_drafts WHERE id=NEW.order_id;
 IF OLD.stage='WAREHOUSE' AND OLD.work_state='INCOMING' AND OLD.received_at IS NULL
   AND NEW.stage='WAREHOUSE' AND NEW.work_state='COMPLETED' AND NEW.received_at IS NOT NULL
   AND ROW(OLD.issue_id,OLD.current_work_visit_id,OLD.cancelled_at,OLD.cancellation_reason)
     IS NOT DISTINCT FROM ROW(NEW.issue_id,NEW.current_work_visit_id,NEW.cancelled_at,NEW.cancellation_reason)
   AND OLD.issue_id IS NULL AND OLD.current_work_visit_id IS NULL AND OLD.cancelled_at IS NULL AND OLD.cancellation_reason IS NULL
   AND EXISTS(SELECT 1 FROM warehouse_receipt_pieces r JOIN warehouse_receipt_groups arrival ON arrival.id=r.group_id AND arrival.order_id=r.order_id
     JOIN warehouse_command_orders g ON g.command_id=arrival.command_id AND g.order_id=arrival.order_id
     JOIN warehouse_commands parent ON parent.command_id=g.command_id
     JOIN quality_piece_events accepted ON accepted.id=r.quality_event_id AND accepted.order_id=r.order_id AND accepted.piece_id=r.piece_id
     JOIN quality_commands inspector ON inspector.command_id=accepted.command_id
     WHERE r.piece_id=NEW.id AND r.order_id=NEW.order_id AND r.origin='COMMAND'
       AND g.after_version=root.version AND parent.operation='RECEIVE' AND NEW.id=ANY(g.piece_ids)
       AND parent.occurred_at=NEW.received_at AND r.received_at=NEW.received_at
       AND accepted.decision='ACCEPT' AND accepted.before_stage='QUALITY' AND accepted.after_stage='WAREHOUSE'
       AND inspector.operation='INSPECT' AND inspector.occurred_at<=parent.occurred_at)
 THEN RETURN NULL; END IF;

 IF EXISTS (
   SELECT 1 FROM manufacturing_piece_events e JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   WHERE e.piece_id=NEW.id AND e.order_id=NEW.order_id AND g.after_version=root.version
     AND ROW(e.before_stage,e.before_work_state,e.after_stage,e.after_work_state)=ROW(OLD.stage,OLD.work_state,NEW.stage,NEW.work_state)
     AND ROW(OLD.issue_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
       IS NOT DISTINCT FROM ROW(NEW.issue_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason)
 ) THEN RETURN NULL; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_piece_events e JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
     JOIN quality_commands parent ON parent.command_id=g.command_id
   WHERE e.order_id=NEW.order_id AND e.piece_id=NEW.id AND g.after_version=root.version AND parent.operation<>'REPORT_ISSUES'
     AND ROW(e.before_stage,e.before_work_state,e.after_stage,e.after_work_state)=ROW(OLD.stage,OLD.work_state,NEW.stage,NEW.work_state)
     AND ROW(OLD.issue_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
       IS NOT DISTINCT FROM ROW(NEW.issue_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason)
     AND OLD.issue_id IS NULL AND OLD.received_at IS NULL AND OLD.cancelled_at IS NULL AND OLD.cancellation_reason IS NULL
 ) THEN RETURN NULL; END IF;
 SELECT child.* INTO c FROM approval_commands child JOIN quality_approval_reports report ON report.approval_command_id=child.command_id
   JOIN quality_command_orders parent_group ON parent_group.command_id=report.command_id AND parent_group.order_id=report.order_id
   WHERE child.order_id=NEW.order_id AND child.piece_id=NEW.id AND child.operation='REPORT_ISSUE' AND parent_group.after_version=root.version;
 IF c.command_id IS NOT NULL AND is_p06_report_child(c.command_id,root.version) THEN
   SELECT f INTO before_piece FROM jsonb_array_elements(c.before_facts->'pieces') f WHERE f->>'id'=NEW.id::text;
   SELECT f INTO after_piece FROM jsonb_array_elements(c.after_facts->'pieces') f WHERE f->>'id'=NEW.id::text;
   IF before_piece IS NOT NULL AND after_piece IS NOT NULL
     AND ROW(before_piece->>'stage',before_piece->>'workState',before_piece->>'issueId',(before_piece->>'receivedAt')::timestamptz,(before_piece->>'cancelledAt')::timestamptz,before_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(OLD.stage::text,OLD.work_state::text,OLD.issue_id::text,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
     AND ROW(after_piece->>'stage',after_piece->>'workState',after_piece->>'issueId',(after_piece->>'receivedAt')::timestamptz,(after_piece->>'cancelledAt')::timestamptz,after_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(NEW.stage::text,NEW.work_state::text,NEW.issue_id::text,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason)
   THEN RETURN NULL; END IF;
 END IF;
 SELECT * INTO c FROM approval_commands WHERE order_id=NEW.order_id AND after_version=root.version;
 IF c.command_id IS NOT NULL THEN
   SELECT f INTO before_piece FROM jsonb_array_elements(c.before_facts->'pieces') f WHERE f->>'id'=NEW.id::text;
   SELECT f INTO after_piece FROM jsonb_array_elements(c.after_facts->'pieces') f WHERE f->>'id'=NEW.id::text;
   IF before_piece IS NOT NULL AND after_piece IS NOT NULL
     AND ROW(before_piece->>'stage',before_piece->>'workState',before_piece->>'issueId',(before_piece->>'receivedAt')::timestamptz,(before_piece->>'cancelledAt')::timestamptz,before_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(OLD.stage::text,OLD.work_state::text,OLD.issue_id::text,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
     AND ROW(after_piece->>'stage',after_piece->>'workState',after_piece->>'issueId',(after_piece->>'receivedAt')::timestamptz,(after_piece->>'cancelledAt')::timestamptz,after_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(NEW.stage::text,NEW.work_state::text,NEW.issue_id::text,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason) THEN RETURN NULL; END IF;
 END IF;
 SELECT v.* INTO current_visit FROM sales_order_pieces p JOIN manufacturing_work_visits v ON v.id=p.current_work_visit_id WHERE p.id=NEW.id;
 IF OLD.stage='QUALITY' AND OLD.work_state='IN_PROGRESS' AND OLD.current_work_visit_id IS NULL
   AND ROW(OLD.issue_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason) IS NOT DISTINCT FROM ROW(NEW.issue_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason)
   AND OLD.issue_id IS NULL AND OLD.received_at IS NULL AND OLD.cancelled_at IS NULL AND OLD.cancellation_reason IS NULL
   AND NEW.stage IN ('CUTTING','PRODUCTION') AND NEW.work_state='INCOMING'
   AND current_visit.origin_kind='QUALITY_CORRECTION' AND current_visit.source_order_version=root.version
   AND current_visit.department::text=NEW.stage::text THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Piece transition requires its exact current-head witness' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_event_binding';
END $$;

CREATE OR REPLACE FUNCTION enforce_p04_command_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_drafts%ROWTYPE; h sales_orders%ROWTYPE; piece sales_order_pieces%ROWTYPE; issue manufacturing_issues%ROWTYPE; proposal piece_contact_proposals%ROWTYPE; fact JSONB;
DECLARE actual_total NUMERIC; actual_paid NUMERIC; expected_counts JSONB; labels JSONB; references_json JSONB;
BEGIN
 SELECT * INTO r FROM sales_drafts WHERE id=NEW.order_id;
 SELECT * INTO h FROM sales_orders WHERE id=NEW.order_id;
 IF (r.version IS DISTINCT FROM NEW.after_version AND NOT (
     NEW.operation='REPORT_ISSUE' AND is_p06_report_child(NEW.command_id,r.version))) OR h.id IS NULL
   OR NEW.outcome->>'orderId' IS DISTINCT FROM NEW.order_id::text
   OR NEW.outcome->>'orderVersion' IS DISTINCT FROM NEW.after_version::text
   OR NEW.outcome->>'orderStatus' IS DISTINCT FROM h.status::text
   OR NEW.outcome->>'pieceId' IS DISTINCT FROM NEW.piece_id::text
   OR NEW.outcome->>'issueId' IS DISTINCT FROM NEW.issue_id::text
   OR NEW.outcome->>'proposalId' IS DISTINCT FROM NEW.proposal_id::text
   OR NEW.after_facts->>'orderStatus' IS DISTINCT FROM h.status::text
   OR (NEW.after_facts->>'approvedAt')::timestamptz IS DISTINCT FROM h.approved_at THEN
   RAISE EXCEPTION 'Approval command head does not match final state' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 actual_total:=h.total_amount; actual_paid:=h.paid_amount;
 SELECT jsonb_build_object('original',count(*),'cancelled',count(*) FILTER(WHERE stage='CANCELLED'),
   'active',count(*) FILTER(WHERE stage<>'CANCELLED'),'received',count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL),
   'completionPercent',CASE WHEN count(*) FILTER(WHERE stage<>'CANCELLED')=0 THEN 0 WHEN count(*) FILTER(WHERE stage<>'CANCELLED')=count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL) THEN 100 ELSE least(99,round(100.0*count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL)/count(*) FILTER(WHERE stage<>'CANCELLED'))) END)
 INTO expected_counts FROM sales_order_pieces WHERE order_id=NEW.order_id;
 IF jsonb_typeof(NEW.before_facts)<>'object' OR jsonb_typeof(NEW.after_facts)<>'object' OR jsonb_typeof(NEW.outcome)<>'object'
   OR NEW.after_facts->'counts' IS DISTINCT FROM expected_counts
   OR (NEW.after_facts#>>'{money,total}')::numeric IS DISTINCT FROM actual_total
   OR (NEW.after_facts#>>'{money,paidAmount}')::numeric IS DISTINCT FROM actual_paid
   OR (NEW.before_facts#>>'{money,paidAmount}')::numeric IS DISTINCT FROM actual_paid
   OR (NEW.after_facts#>>'{money,remainingDue}')::numeric IS DISTINCT FROM greatest(actual_total-actual_paid,0)
   OR (NEW.after_facts#>>'{money,surplus}')::numeric IS DISTINCT FROM greatest(actual_paid-actual_total,0)
   OR jsonb_typeof(NEW.after_facts->'pieces') IS DISTINCT FROM 'array'
   OR jsonb_array_length(NEW.after_facts->'pieces') NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Approval command facts are invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 IF NEW.operation IN ('APPROVE_INITIAL','RETURN_INITIAL') THEN
   IF jsonb_array_length(NEW.after_facts->'pieces')<>(SELECT count(*) FROM sales_order_pieces WHERE order_id=NEW.order_id)
     OR (NEW.operation='APPROVE_INITIAL' AND (h.status<>'APPROVED' OR h.approved_at IS DISTINCT FROM NEW.occurred_at OR EXISTS(SELECT 1 FROM sales_order_pieces WHERE order_id=NEW.order_id AND (stage<>'CUTTING' OR work_state<>'INCOMING' OR issue_id IS NOT NULL))))
     OR (NEW.operation='RETURN_INITIAL' AND (h.status<>'RETURNED' OR h.current_return_decision_id IS DISTINCT FROM NEW.command_id OR EXISTS(SELECT 1 FROM sales_order_pieces WHERE order_id=NEW.order_id AND (stage<>'AWAITING_APPROVAL' OR work_state<>'INCOMING' OR issue_id IS NOT NULL))))
     OR NEW.before_facts->>'orderStatus' IS DISTINCT FROM 'AWAITING_APPROVAL' THEN
     RAISE EXCEPTION 'Initial decision does not match its release or proof' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
 ELSE
   SELECT * INTO piece FROM sales_order_pieces WHERE id=NEW.piece_id AND order_id=NEW.order_id;
   SELECT * INTO issue FROM manufacturing_issues WHERE id=NEW.issue_id AND order_id=NEW.order_id AND piece_id=NEW.piece_id;
   IF piece.id IS NULL OR issue.id IS NULL OR jsonb_array_length(NEW.after_facts->'pieces')<>1
     OR NEW.outcome->>'pieceStage' IS DISTINCT FROM piece.stage::text OR NEW.outcome->>'pieceWorkState' IS DISTINCT FROM piece.work_state::text
     OR NEW.outcome->>'issueState' IS DISTINCT FROM issue.state::text
     OR NEW.after_facts#>>'{issue,id}' IS DISTINCT FROM issue.id::text
     OR NEW.after_facts#>>'{issue,state}' IS DISTINCT FROM issue.state::text
     OR NEW.after_facts#>>'{issue,currentProposalId}' IS DISTINCT FROM issue.latest_proposal_id::text THEN
     RAISE EXCEPTION 'Piece decision facts do not match the held issue' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
   IF NEW.operation='REPORT_ISSUE' AND (issue.state<>'APPROVAL_REVIEW' OR issue.reported_command_id<>NEW.command_id)
     OR NEW.operation='SUBMIT_CONTACT' AND (issue.state<>'REAPPROVAL' OR issue.latest_proposal_id IS DISTINCT FROM NEW.proposal_id OR NEW.actor_id<>r.owner_id)
     OR NEW.operation='RESOLVE_ISSUE' AND ((NEW.decision='SEND_TO_SALES' AND issue.state<>'SALES_CONTACT') OR (NEW.decision<>'SEND_TO_SALES' AND issue.state<>'RESOLVED'))
     OR NEW.operation='REVIEW_CONTACT' AND ((NEW.decision='RETURN_TO_SALES' AND issue.state<>'SALES_CONTACT') OR (NEW.decision<>'RETURN_TO_SALES' AND issue.state<>'RESOLVED')) THEN
     RAISE EXCEPTION 'Operation does not match the issue transition' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
   IF NEW.decision='CANCEL' AND (piece.stage<>'CANCELLED' OR piece.cancelled_at IS DISTINCT FROM NEW.occurred_at OR piece.cancellation_reason IS DISTINCT FROM NEW.decision_notes)
     OR NEW.decision IN ('ACCEPT','RETURN_TO_DEPARTMENT') AND (piece.stage IS DISTINCT FROM issue.resume_target OR piece.work_state<>'INCOMING' OR piece.issue_id IS NOT NULL) THEN
     RAISE EXCEPTION 'Resolved piece state does not match the decision' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
   IF NEW.proposal_id IS NOT NULL THEN
     SELECT * INTO proposal FROM piece_contact_proposals WHERE id=NEW.proposal_id;
     IF NEW.after_facts#>>'{proposal,id}' IS DISTINCT FROM proposal.id::text OR NEW.after_facts#>>'{proposal,kind}' IS DISTINCT FROM proposal.kind::text THEN
       RAISE EXCEPTION 'Command proposal facts are inconsistent' USING ERRCODE='23514',CONSTRAINT='ck_piece_contact_proposal_bindings';
     END IF;
     IF NEW.operation='REVIEW_CONTACT' AND NEW.decision='ACCEPT' THEN
       SELECT jsonb_build_object('model',model,'size',size,'leatherBase',leather_base,'sole',sole) INTO labels FROM sales_draft_pieces WHERE id=NEW.piece_id;
       SELECT jsonb_object_agg(field,entry_id) INTO references_json FROM sales_piece_catalog_selections WHERE piece_id=NEW.piece_id AND field IN ('model','size','leatherBase','sole');
       IF proposal.kind<>'AMEND' OR labels IS DISTINCT FROM jsonb_build_object('model',proposal.proposed_model,'size',proposal.proposed_size,'leatherBase',proposal.proposed_leather_base,'sole',proposal.proposed_sole)
         OR references_json->>'model' IS DISTINCT FROM proposal.proposed_model_id::text
         OR references_json->>'size' IS DISTINCT FROM proposal.proposed_size_id::text
         OR references_json->>'leatherBase' IS DISTINCT FROM proposal.proposed_leather_base_id::text
         OR references_json->>'sole' IS DISTINCT FROM proposal.proposed_sole_id::text THEN
         RAISE EXCEPTION 'Only the retained approved proposal may be applied' USING ERRCODE='23514',CONSTRAINT='ck_piece_contact_proposal_bindings';
       END IF;
     END IF;
   END IF;
 END IF;
 IF (SELECT count(DISTINCT f->>'id') FROM jsonb_array_elements(NEW.after_facts->'pieces') f)<>jsonb_array_length(NEW.after_facts->'pieces') THEN
   RAISE EXCEPTION 'Affected piece identities are duplicated' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 FOR fact IN SELECT * FROM jsonb_array_elements(NEW.after_facts->'pieces') LOOP
   SELECT * INTO piece FROM sales_order_pieces WHERE id=(fact->>'id')::uuid AND order_id=NEW.order_id;
   IF piece.id IS NULL OR (NEW.piece_id IS NOT NULL AND piece.id<>NEW.piece_id)
     OR ROW(fact->>'stage',fact->>'workState',fact->>'issueId',(fact->>'receivedAt')::timestamptz,(fact->>'cancelledAt')::timestamptz,fact->>'cancellationReason')
     IS DISTINCT FROM ROW(piece.stage::text,piece.work_state::text,piece.issue_id::text,piece.received_at,piece.cancelled_at,piece.cancellation_reason) THEN
     RAISE EXCEPTION 'Affected piece facts do not match final state' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE FUNCTION enforce_p07_order_transition() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root_version INTEGER; required_operation warehouse_operation;
BEGIN
 IF OLD.status=NEW.status THEN RETURN NULL; END IF;
 IF OLD.status NOT IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED')
   AND NEW.status NOT IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED') THEN RETURN NULL; END IF;
 SELECT version INTO root_version FROM sales_drafts WHERE id=NEW.id;
 required_operation:=CASE
   WHEN OLD.status='APPROVED' AND NEW.status='READY_FOR_DELIVERY' THEN 'RECEIVE'
   WHEN OLD.status='READY_FOR_DELIVERY' AND NEW.status='OUT_FOR_DELIVERY' THEN 'DISPATCH'
   WHEN OLD.status='OUT_FOR_DELIVERY' AND NEW.status='DELIVERED' THEN 'CONFIRM_DELIVERY'
   WHEN OLD.status='OUT_FOR_DELIVERY' AND NEW.status='DELIVERY_FAILED' THEN 'FAIL_DELIVERY'
   WHEN OLD.status='DELIVERY_FAILED' AND NEW.status='READY_FOR_DELIVERY' THEN 'RETRY_DELIVERY'
   ELSE NULL END;
 IF required_operation IS NOT NULL AND EXISTS(SELECT 1 FROM warehouse_command_orders g JOIN warehouse_commands c ON c.command_id=g.command_id
   WHERE g.order_id=NEW.id AND g.after_version=root_version AND g.before_status=OLD.status AND g.after_status=NEW.status AND c.operation=required_operation)
 THEN PERFORM check_p07_warehouse_order_state(NEW.id); RETURN NULL; END IF;
 IF OLD.status='APPROVED' AND NEW.status='READY_FOR_DELIVERY' AND EXISTS(
   SELECT 1 FROM approval_commands c WHERE c.order_id=NEW.id AND c.after_version=root_version
     AND c.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND c.decision='CANCEL'
     AND c.before_facts->>'orderStatus'='APPROVED' AND c.outcome->>'pieceStage'='CANCELLED'
     AND c.outcome->>'orderStatus'='READY_FOR_DELIVERY')
 THEN PERFORM check_p07_warehouse_order_state(NEW.id); RETURN NULL; END IF;
 RAISE EXCEPTION 'Warehouse custody transition requires its exact current command' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_order_state';
END $$;

CREATE TRIGGER warehouse_commands_retained BEFORE UPDATE OR DELETE ON warehouse_commands FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();

CREATE TRIGGER warehouse_command_orders_retained BEFORE UPDATE OR DELETE ON warehouse_command_orders FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_command_orders_declared BEFORE INSERT ON warehouse_command_orders FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_receipt_groups_retained BEFORE UPDATE OR DELETE ON warehouse_receipt_groups FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_receipt_groups_declared BEFORE INSERT ON warehouse_receipt_groups FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_receipt_pieces_retained BEFORE UPDATE OR DELETE ON warehouse_receipt_pieces FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_receipt_pieces_declared BEFORE INSERT ON warehouse_receipt_pieces FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_delivery_attempts_retained BEFORE UPDATE OR DELETE ON warehouse_delivery_attempts FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_delivery_attempts_declared BEFORE INSERT ON warehouse_delivery_attempts FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_delivery_attempt_members_retained BEFORE UPDATE OR DELETE ON warehouse_delivery_attempt_members FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_delivery_attempt_members_declared BEFORE INSERT ON warehouse_delivery_attempt_members FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_delivery_outcomes_retained BEFORE UPDATE OR DELETE ON warehouse_delivery_outcomes FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_delivery_outcomes_declared BEFORE INSERT ON warehouse_delivery_outcomes FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE TRIGGER warehouse_delivery_retries_retained BEFORE UPDATE OR DELETE ON warehouse_delivery_retries FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_retained();
CREATE TRIGGER warehouse_delivery_retries_declared BEFORE INSERT ON warehouse_delivery_retries FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_child();

CREATE CONSTRAINT TRIGGER p07_warehouse_command_graph AFTER INSERT ON warehouse_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p07_warehouse_graph();
CREATE CONSTRAINT TRIGGER p07_root_current_state AFTER UPDATE ON sales_drafts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION enforce_p07_root_current_state();
CREATE CONSTRAINT TRIGGER p07_order_transition AFTER UPDATE ON sales_orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION enforce_p07_order_transition();

DO $$
DECLARE order_key UUID;
BEGIN
 FOR order_key IN SELECT id FROM sales_orders ORDER BY id LOOP
   PERFORM check_sales_order_graph(order_key);
   PERFORM check_approval_order_graph(order_key);
   PERFORM check_p05_manufacturing_order_graph(order_key);
   PERFORM check_p06_quality_order_graph(order_key);
   PERFORM check_p07_warehouse_order_state(order_key);
 END LOOP;
END $$;

COMMIT;
