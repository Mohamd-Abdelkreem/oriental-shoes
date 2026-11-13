-- P06 quality authority, retained history and exact P04/P05 compatibility.
BEGIN;

-- CreateEnum
CREATE TYPE "quality_operation" AS ENUM ('RECEIVE_AND_START', 'CONTINUE', 'INSPECT', 'REPORT_ISSUES');

-- CreateEnum
CREATE TYPE "quality_visit_origin" AS ENUM ('PRODUCTION_ARRIVAL', 'LEGACY_BASELINE');

-- CreateEnum
CREATE TYPE "quality_visit_end" AS ENUM ('INSPECT_ACCEPTED', 'INSPECT_REJECTED', 'ISSUE_REPORTED');

-- CreateEnum
CREATE TYPE "quality_decision" AS ENUM ('ACCEPT', 'REJECT');

-- CreateEnum
CREATE TYPE "quality_cycle_state" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "quality_commands" (
    "command_id" UUID NOT NULL,
    "operation" "quality_operation" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "payload_hash" CHAR(64) NOT NULL,
    "outcome" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quality_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateTable
CREATE TABLE "quality_command_orders" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "piece_ids" UUID[] NOT NULL,
    "inspector_note" VARCHAR(4000),

    CONSTRAINT "quality_command_orders_pkey" PRIMARY KEY ("command_id","order_id")
);

-- CreateTable
CREATE TABLE "quality_work_visits" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "origin_kind" "quality_visit_origin" NOT NULL,
    "source_production_event_id" UUID,
    "source_correction_id" UUID,
    "entered_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "started_command_id" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "quality_visit_end",
    "end_quality_event_id" UUID,
    "end_approval_command_id" UUID,
    "legacy_unknown_start" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quality_work_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_piece_events" (
    "id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "visit_id" UUID,
    "decision" "quality_decision",
    "correction_id" UUID,
    "issue_id" UUID,
    "approval_command_id" UUID,
    "before_stage" "sales_piece_stage" NOT NULL,
    "before_work_state" "sales_piece_work_state" NOT NULL,
    "after_stage" "sales_piece_stage" NOT NULL,
    "after_work_state" "sales_piece_work_state" NOT NULL,

    CONSTRAINT "quality_piece_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_correction_cycles" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "rejection_event_id" UUID NOT NULL,
    "target" "department" NOT NULL,
    "reason" VARCHAR(4000) NOT NULL,
    "instructions" VARCHAR(4000) NOT NULL,
    "state" "quality_cycle_state" NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_quality_event_id" UUID,
    "resolution_approval_command_id" UUID,

    CONSTRAINT "quality_correction_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_packing_groups" (
    "id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "carton_count" VARCHAR(4000),
    "carton_numbers" VARCHAR(4000),

    CONSTRAINT "quality_packing_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_packing_pieces" (
    "group_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,

    CONSTRAINT "quality_packing_pieces_pkey" PRIMARY KEY ("group_id","piece_id")
);

-- CreateTable
CREATE TABLE "quality_approval_reports" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "approval_command_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "quality_approval_reports_pkey" PRIMARY KEY ("command_id","piece_id")
);

-- CreateIndex
CREATE INDEX "quality_commands_actor_time_idx" ON "quality_commands"("actor_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quality_command_orders_event_key" ON "quality_command_orders"("event_id");

-- CreateIndex
CREATE INDEX "quality_command_orders_order_event_idx" ON "quality_command_orders"("order_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_command_orders_order_version_key" ON "quality_command_orders"("order_id", "after_version");

-- CreateIndex
CREATE INDEX "quality_work_visits_order_piece_sequence_idx" ON "quality_work_visits"("order_id", "piece_id", "sequence" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quality_work_visits_id_order_piece_key" ON "quality_work_visits"("id", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_work_visits_piece_sequence_key" ON "quality_work_visits"("piece_id", "sequence");

-- CreateIndex
CREATE INDEX "quality_piece_events_order_piece_command_idx" ON "quality_piece_events"("order_id", "piece_id", "command_id");

-- CreateIndex
CREATE INDEX "quality_piece_events_visit_id_idx" ON "quality_piece_events"("visit_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_piece_events_id_order_piece_key" ON "quality_piece_events"("id", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_piece_events_command_order_piece_key" ON "quality_piece_events"("command_id", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_piece_events_command_piece_key" ON "quality_piece_events"("command_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_correction_cycles_rejection_event_key" ON "quality_correction_cycles"("rejection_event_id");

-- CreateIndex
CREATE INDEX "quality_correction_cycles_order_piece_cycle_idx" ON "quality_correction_cycles"("order_id", "piece_id", "cycle" DESC);

-- CreateIndex
CREATE INDEX "quality_correction_cycles_state_order_piece_idx" ON "quality_correction_cycles"("state", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_correction_cycles_id_order_piece_key" ON "quality_correction_cycles"("id", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_correction_cycles_piece_cycle_key" ON "quality_correction_cycles"("piece_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "quality_packing_groups_command_order_key" ON "quality_packing_groups"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_packing_groups_id_command_order_key" ON "quality_packing_groups"("id", "command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_packing_pieces_command_piece_key" ON "quality_packing_pieces"("command_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_approval_reports_approval_command_key" ON "quality_approval_reports"("approval_command_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_approval_reports_order_ordinal_key" ON "quality_approval_reports"("command_id", "order_id", "ordinal");


-- AddForeignKey
ALTER TABLE "quality_commands" ADD CONSTRAINT "quality_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_command_orders" ADD CONSTRAINT "quality_command_orders_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "quality_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_command_orders" ADD CONSTRAINT "quality_command_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_production_source_fkey" FOREIGN KEY ("source_production_event_id", "order_id", "piece_id") REFERENCES "manufacturing_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_correction_source_fkey" FOREIGN KEY ("source_correction_id", "order_id", "piece_id") REFERENCES "quality_correction_cycles"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_started_command_id_fkey" FOREIGN KEY ("started_command_id") REFERENCES "quality_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_end_event_fkey" FOREIGN KEY ("end_quality_event_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_end_approval_command_id_fkey" FOREIGN KEY ("end_approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "quality_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_visit_fkey" FOREIGN KEY ("visit_id", "order_id", "piece_id") REFERENCES "quality_work_visits"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_correction_fkey" FOREIGN KEY ("correction_id", "order_id", "piece_id") REFERENCES "quality_correction_cycles"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_issue_fkey" FOREIGN KEY ("issue_id", "order_id", "piece_id") REFERENCES "manufacturing_issues"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_piece_events" ADD CONSTRAINT "quality_piece_events_approval_command_id_fkey" FOREIGN KEY ("approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_correction_cycles" ADD CONSTRAINT "quality_correction_cycles_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_correction_cycles" ADD CONSTRAINT "quality_correction_cycles_rejection_fkey" FOREIGN KEY ("rejection_event_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_correction_cycles" ADD CONSTRAINT "quality_correction_cycles_resolution_event_fkey" FOREIGN KEY ("resolution_quality_event_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_correction_cycles" ADD CONSTRAINT "quality_correction_cycles_resolution_approval_command_id_fkey" FOREIGN KEY ("resolution_approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_packing_groups" ADD CONSTRAINT "quality_packing_groups_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "quality_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_packing_pieces" ADD CONSTRAINT "quality_packing_pieces_group_fkey" FOREIGN KEY ("group_id", "command_id", "order_id") REFERENCES "quality_packing_groups"("id", "command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_packing_pieces" ADD CONSTRAINT "quality_packing_pieces_event_fkey" FOREIGN KEY ("command_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("command_id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_approval_reports" ADD CONSTRAINT "quality_approval_reports_event_fkey" FOREIGN KEY ("command_id", "order_id", "piece_id") REFERENCES "quality_piece_events"("command_id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_approval_reports" ADD CONSTRAINT "quality_approval_reports_approval_command_id_fkey" FOREIGN KEY ("approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX quality_work_visits_one_open_piece_key ON quality_work_visits(piece_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX quality_piece_events_one_inspection_key ON quality_piece_events(visit_id) WHERE decision IS NOT NULL;
CREATE UNIQUE INDEX quality_correction_cycles_one_open_piece_key ON quality_correction_cycles(piece_id) WHERE state='OPEN';

ALTER TABLE quality_commands ADD CONSTRAINT ck_quality_command_shape CHECK (
  (actor_role='ADMIN' OR actor_department='QUALITY') IS TRUE
  AND actor_full_name !~ '^[[:space:]]*$'
  AND payload_hash ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof(outcome)='object'
  AND octet_length(outcome::text)<=262144
);
ALTER TABLE quality_command_orders ADD CONSTRAINT ck_quality_command_order_shape CHECK (
  before_version>=1 AND after_version>before_version AND cardinality(piece_ids) BETWEEN 1 AND 200
  AND array_position(piece_ids,NULL) IS NULL
  AND (inspector_note IS NULL OR inspector_note !~ '^[[:space:]]*$')
);
ALTER TABLE quality_work_visits ADD CONSTRAINT ck_quality_visit_shape CHECK (
  sequence>=1
  AND ((origin_kind='PRODUCTION_ARRIVAL' AND source_production_event_id IS NOT NULL AND entered_at IS NOT NULL)
    OR (origin_kind='LEGACY_BASELINE' AND source_production_event_id IS NULL AND entered_at IS NULL))
  AND ((legacy_unknown_start AND received_at IS NULL AND started_at IS NULL AND started_command_id IS NULL)
    OR (NOT legacy_unknown_start AND received_at IS NOT NULL AND started_at IS NOT NULL AND received_at=started_at AND started_command_id IS NOT NULL))
  AND ((ended_at IS NULL AND end_reason IS NULL AND end_quality_event_id IS NULL AND end_approval_command_id IS NULL)
    OR (ended_at IS NOT NULL AND end_reason IS NOT NULL AND (
      (end_reason IN ('INSPECT_ACCEPTED','INSPECT_REJECTED') AND end_quality_event_id IS NOT NULL AND end_approval_command_id IS NULL)
      OR (end_reason='ISSUE_REPORTED' AND end_quality_event_id IS NULL AND end_approval_command_id IS NOT NULL))))
);
ALTER TABLE quality_work_visits ADD CONSTRAINT ck_quality_visit_times CHECK (
  (entered_at IS NULL OR started_at IS NULL OR entered_at<=started_at)
  AND (entered_at IS NULL OR ended_at IS NULL OR entered_at<=ended_at)
  AND (started_at IS NULL OR ended_at IS NULL OR started_at<=ended_at)
);
ALTER TABLE quality_correction_cycles ADD CONSTRAINT ck_quality_correction_shape CHECK (
  cycle>=1 AND target IN ('CUTTING','PRODUCTION')
  AND reason !~ '^[[:space:]]*$' AND instructions !~ '^[[:space:]]*$'
  AND ((state='OPEN' AND resolved_at IS NULL AND resolution_quality_event_id IS NULL AND resolution_approval_command_id IS NULL)
    OR (state IN ('ACCEPTED','REJECTED') AND resolved_at IS NOT NULL AND resolution_quality_event_id IS NOT NULL AND resolution_approval_command_id IS NULL)
    OR (state='CANCELLED' AND resolved_at IS NOT NULL AND resolution_quality_event_id IS NULL AND resolution_approval_command_id IS NOT NULL))
);
ALTER TABLE quality_packing_groups ADD CONSTRAINT ck_quality_packing_shape CHECK (
  (carton_count IS NOT NULL OR carton_numbers IS NOT NULL)
  AND (carton_count IS NULL OR carton_count !~ '^[[:space:]]*$')
  AND (carton_numbers IS NULL OR carton_numbers !~ '^[[:space:]]*$')
);
ALTER TABLE quality_approval_reports ADD CONSTRAINT ck_quality_report_ordinal CHECK (ordinal BETWEEN 1 AND 200);

-- Retain P04 issue/proposal/return semantics while validating issue witnesses in sets.
CREATE OR REPLACE FUNCTION check_approval_order_graph(affected_order UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r sales_drafts%ROWTYPE; h sales_orders%ROWTYPE; c approval_commands%ROWTYPE; p piece_contact_proposals%ROWTYPE;
BEGIN
 SELECT * INTO r FROM sales_drafts WHERE id=affected_order;
 SELECT * INTO h FROM sales_orders WHERE id=affected_order;
 IF h.id IS NULL THEN RETURN; END IF;
 IF EXISTS (
   SELECT 1 FROM manufacturing_issues held JOIN sales_order_pieces piece ON piece.id=held.piece_id
   WHERE held.order_id=affected_order AND ((held.state<>'RESOLVED' AND (piece.order_id<>held.order_id OR piece.stage<>held.source_stage OR piece.work_state<>'BLOCKED' OR piece.issue_id IS DISTINCT FROM held.id OR piece.cancelled_at IS NOT NULL))
   OR (held.state='RESOLVED' AND piece.issue_id=held.id))
 ) OR EXISTS (
   SELECT 1 FROM sales_order_pieces piece LEFT JOIN manufacturing_issues held ON held.id=piece.issue_id
   WHERE piece.order_id=affected_order AND piece.issue_id IS NOT NULL AND (held.id IS NULL OR held.state='RESOLVED' OR held.order_id<>piece.order_id OR held.piece_id<>piece.id)
 ) THEN
   RAISE EXCEPTION 'Current issue graph is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 IF EXISTS(
   SELECT 1 FROM manufacturing_issues i LEFT JOIN approval_commands report_command ON report_command.command_id=i.reported_command_id
   WHERE i.order_id=affected_order AND (report_command.command_id IS NULL OR report_command.operation<>'REPORT_ISSUE' OR ROW(report_command.order_id,report_command.piece_id,report_command.issue_id,report_command.actor_id,report_command.actor_full_name,report_command.actor_role,report_command.actor_department,report_command.occurred_at)
   IS DISTINCT FROM ROW(i.order_id,i.piece_id,i.id,i.reporter_id,i.reporter_full_name,i.reporter_role,i.reporter_department,i.reported_at)
   OR (report_command.actor_role<>'ADMIN' AND report_command.actor_department IS DISTINCT FROM i.source_department))
 ) THEN RAISE EXCEPTION 'Issue report witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph'; END IF;
 IF EXISTS(SELECT 1 FROM manufacturing_issues i WHERE i.order_id=affected_order AND (i.state='RESOLVED' AND NOT EXISTS (SELECT 1 FROM approval_commands d WHERE d.command_id=i.resolution_command_id AND d.order_id=i.order_id AND d.piece_id=i.piece_id AND d.issue_id=i.id AND d.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND d.occurred_at=i.resolved_at AND d.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT','CANCEL')))) THEN
   RAISE EXCEPTION 'Issue resolution witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 IF EXISTS(SELECT 1 FROM manufacturing_issues i WHERE i.order_id=affected_order AND (i.latest_proposal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM piece_contact_proposals last WHERE last.id=i.latest_proposal_id AND last.issue_id=i.id AND NOT EXISTS (SELECT 1 FROM piece_contact_proposals newer WHERE newer.issue_id=i.id AND newer.sequence>last.sequence)))) THEN
   RAISE EXCEPTION 'Latest proposal pointer is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 FOR p IN SELECT * FROM piece_contact_proposals WHERE order_id=affected_order LOOP
   PERFORM check_piece_contact_proposal_bindings(p.id);
 END LOOP;
 IF EXISTS (SELECT 1 FROM approval_commands a WHERE a.order_id=affected_order AND a.operation='APPROVE_INITIAL' AND a.occurred_at IS DISTINCT FROM h.approved_at) THEN
   RAISE EXCEPTION 'Initial approval instant is immutable' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
 END IF;
 IF h.current_return_decision_id IS NOT NULL THEN
   SELECT * INTO c FROM approval_commands WHERE command_id=h.current_return_decision_id;
   IF c.command_id IS NOT NULL AND (c.operation<>'RETURN_INITIAL' OR c.order_id<>affected_order OR c.after_version<>r.version
     OR c.occurred_at IS DISTINCT FROM h.current_returned_at OR c.after_facts#>>'{currentReturn,reason}' IS DISTINCT FROM h.current_return_reason) THEN
     RAISE EXCEPTION 'Current return witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
 END IF;
END $$;


-- Validate unchanged P05 witnesses in sets; preserve every predicate and retained trigger.
-- Compare complete receipt metadata and ordered member facts without reconstructing historical arrays.
CREATE OR REPLACE FUNCTION check_p05_manufacturing_command(command_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c manufacturing_commands%ROWTYPE; g manufacturing_command_orders%ROWTYPE;
DECLARE expected_ids UUID[]; retained_orders JSONB; actual_order JSONB; order_index INTEGER:=0; receipt_invalid BOOLEAN:=false;
BEGIN
 SELECT * INTO c FROM manufacturing_commands WHERE command_id=command_key;
 IF c.command_id IS NULL THEN RETURN; END IF;
 IF (SELECT count(*) FROM manufacturing_piece_events WHERE command_id=command_key) NOT BETWEEN 1 AND 200
   OR (SELECT count(*) FROM manufacturing_command_orders WHERE command_id=command_key) NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Command selection budget is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 retained_orders:='[]';
 IF jsonb_typeof(c.outcome) IS DISTINCT FROM 'object' THEN receipt_invalid:=true;
 ELSIF jsonb_typeof(c.outcome->'orders') IS DISTINCT FROM 'array' THEN receipt_invalid:=true;
 ELSE
   retained_orders:=c.outcome->'orders';
   IF (c.outcome-'orders') IS DISTINCT FROM '{}'::jsonb
     OR jsonb_array_length(retained_orders)<>(SELECT count(*) FROM manufacturing_command_orders WHERE command_id=command_key)
   THEN receipt_invalid:=true; END IF;
 END IF;
 FOR g IN SELECT * FROM manufacturing_command_orders WHERE command_id=command_key ORDER BY order_id LOOP
   SELECT array_agg(e.piece_id ORDER BY e.piece_id) INTO expected_ids
   FROM manufacturing_piece_events e
   LEFT JOIN manufacturing_work_visits next_visit ON next_visit.source_transfer_event_id=e.id
   WHERE e.command_id=command_key AND e.order_id=g.order_id;
   IF expected_ids IS NULL OR g.piece_ids IS DISTINCT FROM expected_ids
     OR EXISTS (
       SELECT 1 FROM manufacturing_piece_events e JOIN manufacturing_work_visits v ON v.id=e.visit_id
       WHERE e.command_id=command_key AND e.order_id=g.order_id AND (
         e.operation<>c.operation OR v.department<>c.department
         OR (v.ended_at IS NOT NULL AND c.occurred_at>v.ended_at)
         OR (v.entered_at IS NOT NULL AND c.occurred_at<v.entered_at)
         OR e.before_stage::text<>c.department::text
         OR e.before_work_state<>CASE c.operation WHEN 'RECEIVE_AND_START' THEN 'INCOMING'::sales_piece_work_state ELSE 'IN_PROGRESS'::sales_piece_work_state END
         OR e.after_work_state<>CASE c.operation WHEN 'COMPLETE_TRANSFER' THEN 'INCOMING'::sales_piece_work_state ELSE 'IN_PROGRESS'::sales_piece_work_state END
         OR e.after_stage::text<>CASE WHEN c.operation<>'COMPLETE_TRANSFER' THEN c.department::text WHEN c.department='CUTTING' THEN 'PRODUCTION' ELSE 'QUALITY' END
         OR (c.operation='RECEIVE_AND_START' AND (v.received_at IS NULL OR v.received_command_id IS NULL
           OR v.started_command_id IS DISTINCT FROM c.command_id OR v.started_at IS DISTINCT FROM c.occurred_at))
         OR (c.operation='COMPLETE_TRANSFER' AND (v.end_manufacturing_command_id IS DISTINCT FROM c.command_id OR v.ended_at IS DISTINCT FROM c.occurred_at))
         OR (c.operation IN ('CONTINUE','COMPLETE_TRANSFER') AND NOT v.legacy_unknown_start AND (v.started_at IS NULL OR v.started_at>c.occurred_at))
       )
     ) THEN
     RAISE EXCEPTION 'Command events do not match exact intent' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_event_binding';
   END IF;
   IF c.operation='COMPLETE_TRANSFER' AND c.department='CUTTING' AND EXISTS (
     SELECT 1 FROM manufacturing_piece_events e WHERE e.command_id=command_key AND e.order_id=g.order_id
       AND NOT EXISTS (SELECT 1 FROM manufacturing_work_visits v WHERE v.source_transfer_event_id=e.id)
   ) THEN
     RAISE EXCEPTION 'Cutting transfer requires its next visit' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
   END IF;
   actual_order:=retained_orders->order_index; order_index:=order_index+1;
   IF jsonb_typeof(actual_order) IS DISTINCT FROM 'object' THEN receipt_invalid:=true;
   ELSIF jsonb_typeof(actual_order->'pieces') IS DISTINCT FROM 'array' THEN receipt_invalid:=true;
   ELSIF (actual_order-'pieces') IS DISTINCT FROM jsonb_build_object('eventId',g.event_id,'orderId',g.order_id,'beforeVersion',g.before_version,'afterVersion',g.after_version)
     OR jsonb_array_length(actual_order->'pieces')<>cardinality(expected_ids)
   THEN receipt_invalid:=true;
   ELSE
     IF EXISTS (
       SELECT 1 FROM (
         SELECT e.*,next_visit.id AS next_visit_id,row_number() OVER(ORDER BY e.piece_id) AS member_position
         FROM manufacturing_piece_events e LEFT JOIN manufacturing_work_visits next_visit ON next_visit.source_transfer_event_id=e.id
         WHERE e.command_id=command_key AND e.order_id=g.order_id
       ) expected_event
       JOIN jsonb_array_elements(actual_order->'pieces') WITH ORDINALITY stored_piece(fact,member_position)
         ON stored_piece.member_position=expected_event.member_position
       WHERE CASE WHEN jsonb_typeof(stored_piece.fact) IS DISTINCT FROM 'object' THEN true ELSE
         NOT(stored_piece.fact ?& ARRAY['pieceId','visitId','nextVisitId','stage','workState'])
         OR (stored_piece.fact-ARRAY['pieceId','visitId','nextVisitId','stage','workState']) IS DISTINCT FROM '{}'::jsonb
         OR ROW(stored_piece.fact->>'pieceId',stored_piece.fact->>'visitId',stored_piece.fact->>'nextVisitId',stored_piece.fact->>'stage',stored_piece.fact->>'workState') IS DISTINCT FROM ROW(expected_event.piece_id::text,expected_event.visit_id::text,expected_event.next_visit_id::text,expected_event.after_stage::text,expected_event.after_work_state::text) END
     ) THEN receipt_invalid:=true; END IF;
   END IF;
 END LOOP;
 IF receipt_invalid THEN
   RAISE EXCEPTION 'Retained command outcome does not match its exact events' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
END $$;


CREATE OR REPLACE FUNCTION check_p05_manufacturing_order_graph(affected_order UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE command_key UUID;
BEGIN
 IF EXISTS (
   SELECT 1 FROM sales_order_pieces p LEFT JOIN manufacturing_work_visits visit ON visit.id=p.current_work_visit_id
   WHERE p.order_id=affected_order AND (
     CASE WHEN p.stage IN ('CUTTING','PRODUCTION') AND p.work_state IN ('INCOMING','IN_PROGRESS')
         AND p.issue_id IS NULL AND p.received_at IS NULL AND p.cancelled_at IS NULL THEN
       visit.id IS NULL OR visit.order_id<>p.order_id OR visit.piece_id<>p.id OR visit.department::text<>p.stage::text OR visit.ended_at IS NOT NULL
       OR (p.work_state='INCOMING' AND (visit.started_at IS NOT NULL OR visit.legacy_unknown_start))
       OR (p.work_state='IN_PROGRESS' AND visit.started_at IS NULL AND NOT visit.legacy_unknown_start)
     ELSE p.current_work_visit_id IS NOT NULL END
   )
 ) OR EXISTS (
   SELECT 1 FROM manufacturing_work_visits visit LEFT JOIN sales_order_pieces p ON p.id=visit.piece_id
   WHERE visit.order_id=affected_order AND visit.ended_at IS NULL AND p.current_work_visit_id IS DISTINCT FROM visit.id
 ) OR EXISTS (
   SELECT 1 FROM manufacturing_work_visits WHERE order_id=affected_order GROUP BY piece_id HAVING max(sequence)<>count(*)
 ) OR EXISTS (
   SELECT 1 FROM manufacturing_work_visits WHERE order_id=affected_order AND source_approval_command_id IS NOT NULL
   GROUP BY piece_id,source_approval_command_id HAVING count(*)>1
 ) OR EXISTS (
   SELECT 1 FROM manufacturing_work_visits WHERE order_id=affected_order AND source_transfer_event_id IS NOT NULL
   GROUP BY source_transfer_event_id HAVING count(*)>1
 ) OR EXISTS (
   SELECT 1 FROM manufacturing_work_visits WHERE order_id=affected_order AND origin_kind='QUALITY_CORRECTION'
   GROUP BY piece_id,source_reference_id HAVING count(*)>1
 ) THEN
   RAISE EXCEPTION 'Current manufacturing visit graph is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_current_visit_graph';
 END IF;
 IF EXISTS (
   WITH sources AS MATERIALIZED (
     SELECT c.command_id,c.after_facts FROM approval_commands c WHERE c.command_id IN (
       SELECT DISTINCT v.source_approval_command_id FROM manufacturing_work_visits v
       WHERE v.order_id=affected_order AND v.origin_kind='INITIAL_APPROVAL')
   ), released AS MATERIALIZED (
     SELECT c.command_id,f->>'id' AS piece_id FROM sources c CROSS JOIN LATERAL jsonb_array_elements(c.after_facts->'pieces') f
     WHERE f->>'stage'='CUTTING' AND f->>'workState'='INCOMING'
   )
   SELECT 1 FROM manufacturing_work_visits v LEFT JOIN approval_commands c ON c.command_id=v.source_approval_command_id
   LEFT JOIN released proof ON proof.command_id=c.command_id AND proof.piece_id=v.piece_id::text
   WHERE v.order_id=affected_order AND v.source_approval_command_id IS NOT NULL AND (
     c.command_id IS NULL OR c.order_id<>v.order_id OR c.occurred_at IS DISTINCT FROM v.entered_at
       OR (v.origin_kind='INITIAL_APPROVAL' AND (c.operation<>'APPROVE_INITIAL' OR v.department<>'CUTTING' OR proof.command_id IS NULL))
       OR (v.origin_kind='APPROVAL_RETURN' AND (c.operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') OR c.decision NOT IN ('RETURN_TO_DEPARTMENT','ACCEPT')
         OR c.piece_id IS DISTINCT FROM v.piece_id OR c.issue_id IS DISTINCT FROM v.source_issue_id
         OR c.outcome->>'pieceStage' IS DISTINCT FROM v.department::text OR c.outcome->>'pieceWorkState' IS DISTINCT FROM 'INCOMING'
         OR c.decision_notes IS DISTINCT FROM v.instructions)))
 ) THEN RAISE EXCEPTION 'Visit approval source is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin'; END IF;
 IF EXISTS (
   SELECT 1 FROM manufacturing_work_visits v LEFT JOIN manufacturing_piece_events event ON event.id=v.source_transfer_event_id
   LEFT JOIN manufacturing_commands m ON m.command_id=event.command_id
   WHERE v.order_id=affected_order AND v.source_transfer_event_id IS NOT NULL AND (
     event.id IS NULL OR event.operation<>'COMPLETE_TRANSFER' OR event.before_stage<>'CUTTING'
       OR event.after_stage<>'PRODUCTION' OR v.entered_at IS DISTINCT FROM m.occurred_at)
 ) THEN RAISE EXCEPTION 'Visit transfer source is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin'; END IF;
 IF EXISTS (
   SELECT 1 FROM manufacturing_work_visits v LEFT JOIN manufacturing_commands m ON m.command_id=v.received_command_id
   WHERE v.order_id=affected_order AND v.received_command_id IS NOT NULL AND (
     m.command_id IS NULL OR m.operation<>'RECEIVE_AND_START' OR m.department<>v.department
       OR m.occurred_at IS DISTINCT FROM v.received_at OR NOT EXISTS (
         SELECT 1 FROM manufacturing_piece_events e WHERE e.command_id=m.command_id AND e.visit_id=v.id AND e.piece_id=v.piece_id AND e.order_id=v.order_id))
 ) THEN RAISE EXCEPTION 'Visit original start witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times'; END IF;
 IF EXISTS (
   SELECT 1 FROM manufacturing_work_visits v LEFT JOIN manufacturing_commands m ON m.command_id=v.end_manufacturing_command_id
   WHERE v.order_id=affected_order AND v.end_manufacturing_command_id IS NOT NULL AND (
     m.command_id IS NULL OR m.operation<>'COMPLETE_TRANSFER' OR m.department<>v.department
       OR m.occurred_at IS DISTINCT FROM v.ended_at OR NOT EXISTS (
         SELECT 1 FROM manufacturing_piece_events e WHERE e.command_id=m.command_id AND e.visit_id=v.id AND e.piece_id=v.piece_id AND e.order_id=v.order_id))
 ) THEN RAISE EXCEPTION 'Visit transfer witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times'; END IF;
 IF EXISTS (
   SELECT 1 FROM manufacturing_work_visits v LEFT JOIN approval_commands c ON c.command_id=v.end_approval_command_id
   WHERE v.order_id=affected_order AND v.end_approval_command_id IS NOT NULL AND (
     c.command_id IS NULL OR c.order_id<>v.order_id OR c.piece_id IS DISTINCT FROM v.piece_id OR c.occurred_at IS DISTINCT FROM v.ended_at
       OR (v.end_reason='ISSUE_REPORTED' AND (c.operation<>'REPORT_ISSUE' OR c.before_facts#>>'{pieces,0,stage}' IS DISTINCT FROM v.department::text))
       OR (v.end_reason='CANCELLED' AND (c.operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') OR c.decision IS DISTINCT FROM 'CANCEL')))
 ) THEN RAISE EXCEPTION 'Visit issue/cancellation witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times'; END IF;
 FOR command_key IN SELECT command_id FROM manufacturing_command_orders WHERE order_id=affected_order LOOP
   PERFORM check_p05_manufacturing_command(command_key);
 END LOOP;
END $$;


CREATE FUNCTION check_p06_quality_command(command_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c quality_commands%ROWTYPE; g quality_command_orders%ROWTYPE; packing quality_packing_groups%ROWTYPE;
DECLARE expected_ids UUID[]; packed_ids UUID[]; accepted_ids UUID[]; retained_orders JSONB; actual_order JSONB; order_index INTEGER:=0; receipt_invalid BOOLEAN:=false;
DECLARE delta INTEGER;
BEGIN
 SELECT * INTO c FROM quality_commands WHERE command_id=command_key;
 IF c.command_id IS NULL THEN RETURN; END IF;
 IF (SELECT count(*) FROM quality_piece_events WHERE command_id=command_key) NOT BETWEEN 1 AND 200
   OR (SELECT count(*) FROM quality_command_orders WHERE command_id=command_key) NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Quality selection budget is invalid' USING ERRCODE='23514',CONSTRAINT='ck_quality_command_graph';
 END IF;
 retained_orders:='[]';
 IF jsonb_typeof(c.outcome) IS DISTINCT FROM 'object' THEN receipt_invalid:=true;
 ELSIF jsonb_typeof(c.outcome->'orders') IS DISTINCT FROM 'array' THEN receipt_invalid:=true;
 ELSE
   retained_orders:=c.outcome->'orders';
   IF (c.outcome-'orders') IS DISTINCT FROM '{}'::jsonb
     OR jsonb_array_length(retained_orders)<>(SELECT count(*) FROM quality_command_orders WHERE command_id=command_key)
   THEN receipt_invalid:=true; END IF;
 END IF;
 FOR g IN SELECT * FROM quality_command_orders WHERE command_id=command_key ORDER BY order_id LOOP
   SELECT array_agg(piece_id ORDER BY piece_id) INTO expected_ids FROM quality_piece_events
     WHERE command_id=command_key AND order_id=g.order_id;
   delta:=CASE WHEN c.operation='REPORT_ISSUES' THEN cardinality(expected_ids) ELSE 1 END;
   IF expected_ids IS NULL OR g.piece_ids IS DISTINCT FROM expected_ids
     OR g.after_version::bigint<>g.before_version::bigint+delta
     OR (c.operation<>'INSPECT' AND g.inspector_note IS NOT NULL) THEN
     RAISE EXCEPTION 'Quality order membership or version is invalid' USING ERRCODE='23514',CONSTRAINT='ck_quality_command_graph';
   END IF;
   SELECT * INTO packing FROM quality_packing_groups WHERE command_id=command_key AND order_id=g.order_id;
   SELECT array_agg(piece_id ORDER BY piece_id) INTO accepted_ids FROM quality_piece_events
     WHERE command_id=command_key AND order_id=g.order_id AND decision='ACCEPT';
   IF packing.id IS NOT NULL THEN
     SELECT array_agg(piece_id ORDER BY piece_id) INTO packed_ids FROM quality_packing_pieces WHERE group_id=packing.id;
     IF c.operation<>'INSPECT' OR accepted_ids IS NULL OR packed_ids IS DISTINCT FROM accepted_ids THEN
       RAISE EXCEPTION 'Packing must retain the complete accepted membership' USING ERRCODE='23514',CONSTRAINT='ck_quality_packing_shape';
     END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM quality_piece_events e
 LEFT JOIN quality_work_visits v ON v.id=e.visit_id AND v.order_id=e.order_id AND v.piece_id=e.piece_id
 WHERE e.command_id=command_key AND e.order_id=g.order_id AND (e.before_stage<>'QUALITY' OR
       (c.operation='RECEIVE_AND_START' AND (
         e.before_work_state<>'INCOMING' OR e.after_stage<>'QUALITY' OR e.after_work_state<>'IN_PROGRESS'
         OR v.id IS NULL OR v.started_command_id IS DISTINCT FROM command_key OR v.started_at IS DISTINCT FROM c.occurred_at
         OR e.correction_id IS DISTINCT FROM v.source_correction_id))
       OR (c.operation='CONTINUE' AND (
         e.before_work_state<>'IN_PROGRESS' OR e.after_stage<>'QUALITY' OR e.after_work_state<>'IN_PROGRESS' OR v.id IS NULL
         OR e.correction_id IS DISTINCT FROM v.source_correction_id))
       OR (c.operation='INSPECT' AND (
         e.before_work_state<>'IN_PROGRESS' OR v.id IS NULL OR e.decision IS NULL OR e.after_work_state<>'INCOMING'
         OR v.end_quality_event_id IS DISTINCT FROM e.id OR v.ended_at IS DISTINCT FROM c.occurred_at
         OR (e.decision='ACCEPT' AND (e.after_stage<>'WAREHOUSE' OR v.end_reason<>'INSPECT_ACCEPTED' OR e.correction_id IS DISTINCT FROM v.source_correction_id))
         OR (e.decision='REJECT' AND (e.after_stage NOT IN ('CUTTING','PRODUCTION') OR v.end_reason<>'INSPECT_REJECTED'
           OR e.correction_id IS NULL OR NOT EXISTS(
             SELECT 1 FROM quality_correction_cycles cycle WHERE cycle.id=e.correction_id AND cycle.rejection_event_id=e.id
               AND cycle.order_id=e.order_id AND cycle.piece_id=e.piece_id AND cycle.target::text=e.after_stage::text)))))
       OR (c.operation='CONTINUE' AND c.actor_id=(
         SELECT prior.actor_id FROM quality_piece_events previous
           JOIN quality_command_orders previous_group ON previous_group.command_id=previous.command_id AND previous_group.order_id=previous.order_id
           JOIN quality_commands prior ON prior.command_id=previous_group.command_id
         WHERE previous.visit_id=e.visit_id AND previous.order_id=e.order_id AND previous.piece_id=e.piece_id
           AND previous_group.after_version<g.after_version
         ORDER BY previous_group.after_version DESC, previous.id DESC LIMIT 1))
       OR (c.operation<>'INSPECT' AND e.decision IS NOT NULL)
       OR (c.operation<>'REPORT_ISSUES' AND (e.issue_id IS NOT NULL OR e.approval_command_id IS NOT NULL))
       OR (v.id IS NOT NULL AND ((v.entered_at IS NOT NULL AND c.occurred_at<v.entered_at)
         OR (v.started_at IS NOT NULL AND c.occurred_at<v.started_at)
         OR (v.ended_at IS NOT NULL AND c.occurred_at>v.ended_at))))) THEN
     RAISE EXCEPTION 'Quality event does not bind its actual operation and visit' USING ERRCODE='23514',CONSTRAINT='ck_quality_event_binding';
   END IF;
   IF c.operation='REPORT_ISSUES' THEN
     IF EXISTS(SELECT 1 FROM (SELECT events.*,row_number() OVER(ORDER BY piece_id) AS ordinal_number
 FROM quality_piece_events events WHERE events.command_id=command_key AND events.order_id=g.order_id) e
 LEFT JOIN quality_work_visits v ON v.id=e.visit_id AND v.order_id=e.order_id AND v.piece_id=e.piece_id
 LEFT JOIN quality_approval_reports report ON report.command_id=command_key AND report.piece_id=e.piece_id
 LEFT JOIN approval_commands child ON child.command_id=e.approval_command_id
 LEFT JOIN manufacturing_issues issue ON issue.id=e.issue_id WHERE (report.command_id IS NULL OR report.order_id<>g.order_id OR report.ordinal<>e.ordinal_number
         OR report.approval_command_id IS DISTINCT FROM child.command_id OR child.command_id IS NULL
         OR child.operation<>'REPORT_ISSUE' OR child.order_id<>g.order_id OR child.piece_id IS DISTINCT FROM e.piece_id
         OR child.issue_id IS DISTINCT FROM e.issue_id OR issue.id IS NULL
         OR issue.reported_command_id IS DISTINCT FROM child.command_id OR issue.source_department<>'QUALITY'
         OR issue.source_stage<>'QUALITY' OR issue.source_work_state<>e.before_work_state
         OR e.before_work_state NOT IN ('INCOMING','IN_PROGRESS') OR e.after_stage<>'QUALITY' OR e.after_work_state<>'BLOCKED'
         OR child.expected_version::bigint<>g.before_version::bigint+e.ordinal_number-1
         OR child.before_version<>child.expected_version OR child.after_version::bigint<>g.before_version::bigint+e.ordinal_number
         OR ROW(child.actor_id,child.actor_full_name,child.actor_role,child.actor_department,child.occurred_at)
           IS DISTINCT FROM ROW(c.actor_id,c.actor_full_name,c.actor_role,c.actor_department,c.occurred_at)
         OR ROW(issue.reporter_id,issue.reporter_full_name,issue.reporter_role,issue.reporter_department,issue.reported_at)
           IS DISTINCT FROM ROW(c.actor_id,c.actor_full_name,c.actor_role,c.actor_department,c.occurred_at)
         OR (e.before_work_state='IN_PROGRESS' AND (v.id IS NULL OR v.end_approval_command_id IS DISTINCT FROM child.command_id
           OR v.end_reason IS DISTINCT FROM 'ISSUE_REPORTED' OR v.ended_at IS DISTINCT FROM c.occurred_at))
         OR (e.before_work_state='INCOMING' AND e.visit_id IS NOT NULL)
         OR (v.id IS NOT NULL AND e.correction_id IS DISTINCT FROM v.source_correction_id))) THEN
       RAISE EXCEPTION 'Quality report requires exact contiguous real approval children' USING ERRCODE='23514',CONSTRAINT='ck_quality_report_chain';
     END IF;
     IF EXISTS(SELECT 1 FROM quality_piece_events e WHERE e.command_id=command_key AND e.order_id=g.order_id AND (e.before_work_state='INCOMING' AND e.correction_id IS DISTINCT FROM (
         SELECT cycle.id FROM quality_correction_cycles cycle
           JOIN quality_piece_events rejection ON rejection.id=cycle.rejection_event_id
           JOIN quality_command_orders opening ON opening.command_id=rejection.command_id AND opening.order_id=rejection.order_id
           LEFT JOIN quality_piece_events resolution ON resolution.id=cycle.resolution_quality_event_id
           LEFT JOIN quality_command_orders terminal ON terminal.command_id=resolution.command_id AND terminal.order_id=resolution.order_id
           LEFT JOIN approval_commands cancellation ON cancellation.command_id=cycle.resolution_approval_command_id
         WHERE cycle.order_id=e.order_id AND cycle.piece_id=e.piece_id AND opening.after_version<=g.before_version
           AND coalesce(terminal.after_version,cancellation.after_version,2147483647)>=g.after_version
         ORDER BY cycle.cycle DESC LIMIT 1
       ))) THEN
       RAISE EXCEPTION 'Incoming issue must retain its actual current correction' USING ERRCODE='23514',CONSTRAINT='ck_quality_report_chain';
     END IF;
   ELSIF EXISTS(SELECT 1 FROM quality_approval_reports WHERE command_id=command_key AND order_id=g.order_id) THEN
     RAISE EXCEPTION 'Only report operations own approval children' USING ERRCODE='23514',CONSTRAINT='ck_quality_report_chain';
   END IF;
   actual_order:=retained_orders->order_index; order_index:=order_index+1;
   IF jsonb_typeof(actual_order) IS DISTINCT FROM 'object' THEN receipt_invalid:=true;
   ELSIF jsonb_typeof(actual_order->'pieces') IS DISTINCT FROM 'array' THEN receipt_invalid:=true;
   ELSIF (actual_order-'pieces') IS DISTINCT FROM jsonb_build_object('eventId',g.event_id,'orderId',g.order_id,'beforeVersion',g.before_version,'afterVersion',g.after_version ,'packingGroupId',packing.id)
     OR jsonb_array_length(actual_order->'pieces')<>cardinality(expected_ids)
   THEN receipt_invalid:=true;
   ELSE
     IF EXISTS (
       SELECT 1 FROM (
         SELECT e.*,row_number() OVER(ORDER BY e.piece_id) AS member_position
         FROM quality_piece_events e
         WHERE e.command_id=command_key AND e.order_id=g.order_id
       ) expected_event
       JOIN jsonb_array_elements(actual_order->'pieces') WITH ORDINALITY stored_piece(fact,member_position)
         ON stored_piece.member_position=expected_event.member_position
       WHERE CASE WHEN jsonb_typeof(stored_piece.fact) IS DISTINCT FROM 'object' THEN true ELSE
         NOT(stored_piece.fact ?& ARRAY['pieceId','visitId','decision','stage','workState','correctionId','issueId'])
         OR (stored_piece.fact-ARRAY['pieceId','visitId','decision','stage','workState','correctionId','issueId']) IS DISTINCT FROM '{}'::jsonb
         OR ROW(stored_piece.fact->>'pieceId',stored_piece.fact->>'visitId',stored_piece.fact->>'decision',stored_piece.fact->>'stage',stored_piece.fact->>'workState',stored_piece.fact->>'correctionId',stored_piece.fact->>'issueId') IS DISTINCT FROM ROW(expected_event.piece_id::text,expected_event.visit_id::text,expected_event.decision::text,expected_event.after_stage::text,expected_event.after_work_state::text,expected_event.correction_id::text,expected_event.issue_id::text) END
     ) THEN receipt_invalid:=true; END IF;
   END IF;
 END LOOP;
 IF c.operation='REPORT_ISSUES' AND (
   SELECT count(DISTINCT ROW(issue.reason,issue.notes)) FROM quality_piece_events e
   JOIN manufacturing_issues issue ON issue.id=e.issue_id WHERE e.command_id=command_key)<>1 THEN
   RAISE EXCEPTION 'Quality report text must match the confirmed common intent' USING ERRCODE='23514',CONSTRAINT='ck_quality_report_chain';
 END IF;
 IF receipt_invalid THEN
   RAISE EXCEPTION 'Quality receipt must equal its complete immutable event graph' USING ERRCODE='23514',CONSTRAINT='ck_quality_command_graph';
 END IF;
END $$;

CREATE FUNCTION check_p06_quality_order_graph(order_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE command_key UUID;
BEGIN
 IF EXISTS (
   SELECT 1 FROM sales_order_pieces p LEFT JOIN quality_work_visits visit
     ON visit.order_id=p.order_id AND visit.piece_id=p.id AND visit.ended_at IS NULL
   WHERE p.order_id=order_key AND (
     (p.stage='QUALITY' AND p.work_state='IN_PROGRESS' AND p.issue_id IS NULL AND p.received_at IS NULL AND p.cancelled_at IS NULL
       AND p.cancellation_reason IS NULL) IS DISTINCT FROM (visit.id IS NOT NULL)
     OR (p.stage='QUALITY' AND p.current_work_visit_id IS NOT NULL)
     OR (visit.id IS NOT NULL AND visit.source_correction_id IS DISTINCT FROM (
       SELECT active_cycle.id FROM quality_correction_cycles active_cycle WHERE active_cycle.order_id=p.order_id AND active_cycle.piece_id=p.id AND active_cycle.state='OPEN')) )
 ) OR EXISTS (
   SELECT 1 FROM quality_work_visits WHERE order_id=order_key GROUP BY piece_id HAVING max(sequence)<>count(*)
 ) OR EXISTS (
   SELECT 1 FROM quality_correction_cycles stored_cycles WHERE stored_cycles.order_id=order_key GROUP BY stored_cycles.piece_id HAVING max(stored_cycles.cycle)<>count(*)
 ) OR EXISTS (
   SELECT 1 FROM quality_correction_cycles open_cycle JOIN sales_order_pieces p ON p.id=open_cycle.piece_id AND p.order_id=open_cycle.order_id
     WHERE open_cycle.order_id=order_key AND open_cycle.state='OPEN'
       AND (p.stage NOT IN ('CUTTING','PRODUCTION','QUALITY') OR p.received_at IS NOT NULL OR p.cancelled_at IS NOT NULL)
 ) THEN
   RAISE EXCEPTION 'Current quality visits or correction graph is invalid' USING ERRCODE='23514',CONSTRAINT='ck_quality_order_graph';
 END IF;
 IF EXISTS (
   SELECT 1 FROM quality_work_visits v
   LEFT JOIN manufacturing_piece_events source ON source.id=v.source_production_event_id AND source.order_id=v.order_id AND source.piece_id=v.piece_id
   LEFT JOIN manufacturing_commands source_command ON source_command.command_id=source.command_id
   WHERE v.order_id=order_key AND v.source_production_event_id IS NOT NULL AND (
     source.id IS NULL OR source.operation<>'COMPLETE_TRANSFER' OR source.before_stage<>'PRODUCTION' OR source.after_stage<>'QUALITY'
     OR source_command.department<>'PRODUCTION' OR source_command.occurred_at IS DISTINCT FROM v.entered_at)
 ) THEN RAISE EXCEPTION 'Quality arrival requires its real production transfer' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_work_visits v LEFT JOIN quality_commands c ON c.command_id=v.started_command_id
   WHERE v.order_id=order_key AND v.started_command_id IS NOT NULL AND (
     c.command_id IS NULL OR c.operation<>'RECEIVE_AND_START' OR c.occurred_at IS DISTINCT FROM v.started_at
     OR NOT EXISTS(SELECT 1 FROM quality_piece_events started_event WHERE started_event.command_id=c.command_id AND started_event.order_id=v.order_id AND started_event.piece_id=v.piece_id AND started_event.visit_id=v.id))
 ) THEN RAISE EXCEPTION 'Quality start requires its exact command' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_work_visits v WHERE v.order_id=order_key AND v.source_correction_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM quality_correction_cycles source_cycle JOIN quality_piece_events rejection ON rejection.id=source_cycle.rejection_event_id
       JOIN quality_command_orders source_group ON source_group.command_id=rejection.command_id AND source_group.order_id=rejection.order_id
       JOIN quality_commands opening_command ON opening_command.command_id=source_group.command_id
       WHERE source_cycle.id=v.source_correction_id AND source_cycle.order_id=v.order_id AND source_cycle.piece_id=v.piece_id
         AND opening_command.occurred_at<=v.started_at AND (source_cycle.resolved_at IS NULL OR v.started_at<=source_cycle.resolved_at))
 ) THEN RAISE EXCEPTION 'Reinspection must retain its actual source cycle' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_work_visits v
   LEFT JOIN quality_piece_events e ON e.id=v.end_quality_event_id AND e.order_id=v.order_id AND e.piece_id=v.piece_id
   LEFT JOIN quality_commands c ON c.command_id=e.command_id
   WHERE v.order_id=order_key AND v.end_quality_event_id IS NOT NULL AND (
     e.id IS NULL OR e.visit_id IS DISTINCT FROM v.id OR c.operation<>'INSPECT' OR c.occurred_at IS DISTINCT FROM v.ended_at
       OR v.end_reason::text IS DISTINCT FROM (CASE e.decision WHEN 'ACCEPT' THEN 'INSPECT_ACCEPTED' WHEN 'REJECT' THEN 'INSPECT_REJECTED' ELSE NULL END))
 ) THEN RAISE EXCEPTION 'Quality visit end requires its real inspection' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_work_visits v LEFT JOIN approval_commands approval ON approval.command_id=v.end_approval_command_id
   WHERE v.order_id=order_key AND v.end_approval_command_id IS NOT NULL AND (
     approval.command_id IS NULL OR approval.operation<>'REPORT_ISSUE' OR approval.order_id<>v.order_id OR approval.piece_id IS DISTINCT FROM v.piece_id
       OR approval.occurred_at IS DISTINCT FROM v.ended_at OR approval.before_facts#>>'{pieces,0,stage}' IS DISTINCT FROM 'QUALITY'
       OR approval.before_facts#>>'{pieces,0,workState}' IS DISTINCT FROM 'IN_PROGRESS')
 ) THEN RAISE EXCEPTION 'Quality interruption requires its real approval issue' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_correction_cycles cycle
   LEFT JOIN quality_piece_events e ON e.id=cycle.rejection_event_id AND e.order_id=cycle.order_id AND e.piece_id=cycle.piece_id
   LEFT JOIN quality_commands c ON c.command_id=e.command_id
   LEFT JOIN quality_work_visits v ON v.id=e.visit_id
   WHERE cycle.order_id=order_key AND (
     e.id IS NULL OR e.decision IS DISTINCT FROM 'REJECT' OR e.correction_id IS DISTINCT FROM cycle.id
       OR c.operation<>'INSPECT' OR e.after_stage::text<>cycle.target::text
       OR NOT EXISTS (
         SELECT 1 FROM manufacturing_work_visits correction JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
         WHERE correction.order_id=cycle.order_id AND correction.piece_id=cycle.piece_id AND correction.origin_kind='QUALITY_CORRECTION'
           AND correction.source_reference_id=cycle.id AND correction.source_correction_cycle=cycle.cycle
           AND correction.department=cycle.target AND correction.instructions=cycle.instructions
           AND correction.entered_at=c.occurred_at AND correction.source_order_version=g.after_version)
       OR (cycle.cycle=1 AND v.source_correction_id IS NOT NULL)
       OR (cycle.cycle>1 AND NOT EXISTS (
         SELECT 1 FROM quality_correction_cycles previous WHERE previous.piece_id=cycle.piece_id AND previous.order_id=cycle.order_id
           AND previous.id=v.source_correction_id AND previous.cycle=cycle.cycle-1 AND previous.state='REJECTED'
           AND previous.resolution_quality_event_id=e.id AND previous.resolved_at=c.occurred_at)))
 ) THEN RAISE EXCEPTION 'Quality rejection must bind its actual cycle and normal manufacturing route' USING ERRCODE='23514',CONSTRAINT='ck_quality_correction_graph'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_correction_cycles cycle
   LEFT JOIN quality_piece_events e ON e.id=cycle.resolution_quality_event_id AND e.order_id=cycle.order_id AND e.piece_id=cycle.piece_id
   LEFT JOIN quality_commands c ON c.command_id=e.command_id LEFT JOIN quality_work_visits v ON v.id=e.visit_id
   WHERE cycle.order_id=order_key AND cycle.resolution_quality_event_id IS NOT NULL AND (
     e.id IS NULL OR c.operation<>'INSPECT' OR v.source_correction_id IS DISTINCT FROM cycle.id
       OR e.decision::text IS DISTINCT FROM (CASE cycle.state WHEN 'ACCEPTED' THEN 'ACCEPT' WHEN 'REJECTED' THEN 'REJECT' ELSE NULL END)
       OR c.occurred_at IS DISTINCT FROM cycle.resolved_at)
 ) THEN RAISE EXCEPTION 'Quality cycle resolution requires its exact reinspection' USING ERRCODE='23514',CONSTRAINT='ck_quality_correction_graph'; END IF;
 IF EXISTS (
   SELECT 1 FROM quality_correction_cycles cycle LEFT JOIN approval_commands approval ON approval.command_id=cycle.resolution_approval_command_id
   WHERE cycle.order_id=order_key AND cycle.resolution_approval_command_id IS NOT NULL AND (
     approval.command_id IS NULL OR approval.order_id<>cycle.order_id OR approval.piece_id IS DISTINCT FROM cycle.piece_id
       OR approval.operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') OR approval.decision IS DISTINCT FROM 'CANCEL'
       OR approval.occurred_at IS DISTINCT FROM cycle.resolved_at OR cycle.state<>'CANCELLED')
 ) THEN RAISE EXCEPTION 'Quality cancellation requires actual P04 cancellation' USING ERRCODE='23514',CONSTRAINT='ck_quality_correction_graph'; END IF;
 FOR command_key IN SELECT command_id FROM quality_command_orders WHERE order_id=order_key LOOP
   PERFORM check_p06_quality_command(command_key);
 END LOOP;
END $$;

CREATE FUNCTION enforce_p06_quality_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME NOT IN ('quality_work_visits','quality_correction_cycles') THEN
   RAISE EXCEPTION 'Quality history is retained' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
 END IF;
 IF TG_TABLE_NAME='quality_work_visits' THEN
   IF (to_jsonb(OLD)-ARRAY['ended_at','end_reason','end_quality_event_id','end_approval_command_id'])
       IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['ended_at','end_reason','end_quality_event_id','end_approval_command_id'])
     OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
     RAISE EXCEPTION 'Quality original work and terminal endpoint are immutable' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
   END IF;
 ELSE
   IF (to_jsonb(OLD)-ARRAY['state','resolved_at','resolution_quality_event_id','resolution_approval_command_id'])
       IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','resolved_at','resolution_quality_event_id','resolution_approval_command_id'])
     OR OLD.state<>'OPEN' OR NEW.state='OPEN' THEN
     RAISE EXCEPTION 'Quality rejection facts and terminal outcome are immutable' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
   END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION enforce_p06_quality_graph() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_json JSONB; order_key UUID; command_key UUID;
BEGIN
 record_json:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='quality_commands' THEN
   command_key:=(record_json->>'command_id')::uuid;
   PERFORM check_p06_quality_command(command_key);
   FOR order_key IN SELECT order_id FROM quality_command_orders WHERE command_id=command_key LOOP
     PERFORM check_p06_quality_order_graph(order_key);
   END LOOP;
 ELSE
   order_key:=CASE WHEN TG_TABLE_NAME='sales_drafts' THEN (record_json->>'id')::uuid ELSE (record_json->>'order_id')::uuid END;
   PERFORM check_p06_quality_order_graph(order_key);
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION enforce_p06_quality_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM check_p06_quality_command(NEW.command_id);
 IF NOT EXISTS(SELECT 1 FROM sales_drafts r JOIN sales_orders h ON h.id=r.id
   WHERE r.id=NEW.order_id AND r.status='SUBMITTED' AND h.status='APPROVED' AND r.version=NEW.after_version)
   OR EXISTS(
     SELECT 1 FROM quality_piece_events e JOIN sales_order_pieces p ON p.id=e.piece_id AND p.order_id=e.order_id
     WHERE e.command_id=NEW.command_id AND e.order_id=NEW.order_id AND (
       ROW(p.stage,p.work_state,p.issue_id) IS DISTINCT FROM ROW(e.after_stage,e.after_work_state,e.issue_id)
       OR p.received_at IS NOT NULL OR p.cancelled_at IS NOT NULL OR p.cancellation_reason IS NOT NULL))
 THEN RAISE EXCEPTION 'Quality accepted head must bind final state' USING ERRCODE='23514',CONSTRAINT='ck_quality_command_head'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION enforce_p06_new_quality_visit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.legacy_unknown_start OR NEW.started_command_id IS NULL
   OR NOT EXISTS(SELECT 1 FROM quality_commands c JOIN quality_command_orders g ON g.command_id=c.command_id
       JOIN quality_piece_events e ON e.command_id=g.command_id AND e.order_id=g.order_id
       JOIN sales_drafts root ON root.id=g.order_id
     WHERE e.visit_id=NEW.id AND e.piece_id=NEW.piece_id AND e.order_id=NEW.order_id
       AND c.operation='RECEIVE_AND_START' AND root.version=g.after_version)
 OR NEW.source_production_event_id IS DISTINCT FROM (
     SELECT arrival.id FROM manufacturing_piece_events arrival
       JOIN manufacturing_command_orders arrival_group ON arrival_group.command_id=arrival.command_id AND arrival_group.order_id=arrival.order_id
       JOIN quality_command_orders start_group ON start_group.command_id=NEW.started_command_id AND start_group.order_id=NEW.order_id
     WHERE arrival.order_id=NEW.order_id AND arrival.piece_id=NEW.piece_id AND arrival.operation='COMPLETE_TRANSFER'
       AND arrival.before_stage='PRODUCTION' AND arrival.after_stage='QUALITY' AND arrival_group.after_version<=start_group.before_version
     ORDER BY arrival_group.after_version DESC,arrival.id DESC LIMIT 1
   )
 THEN RAISE EXCEPTION 'Runtime quality visit requires its actual current start' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 RETURN NULL;
END $$;


-- Only a real parent-linked report may use an intermediate approval head.
CREATE FUNCTION is_p06_report_child(child_key UUID, final_version INTEGER) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE parent_key UUID;
BEGIN
 SELECT c.command_id INTO parent_key FROM quality_approval_reports report
   JOIN quality_piece_events event ON event.command_id=report.command_id AND event.order_id=report.order_id AND event.piece_id=report.piece_id
   JOIN quality_command_orders g ON g.command_id=report.command_id AND g.order_id=report.order_id
   JOIN quality_commands c ON c.command_id=g.command_id
   JOIN approval_commands child ON child.command_id=report.approval_command_id
 WHERE child.command_id=child_key AND c.operation='REPORT_ISSUES' AND child.operation='REPORT_ISSUE'
   AND event.approval_command_id=child.command_id AND child.order_id=g.order_id AND child.piece_id=report.piece_id
   AND child.before_version::bigint=g.before_version::bigint+report.ordinal-1
   AND child.after_version::bigint=g.before_version::bigint+report.ordinal AND g.after_version=final_version;
 IF parent_key IS NULL THEN RETURN false; END IF;
 PERFORM check_p06_quality_command(parent_key);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION enforce_p05_manufacturing_graph() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_order UUID; command_order UUID; child_key UUID; final_version INTEGER;
BEGIN
 -- A canonical quality-only hold cannot change manufacturing state; every manufacturing mutation keeps full dispatch.
 IF TG_TABLE_NAME='sales_order_pieces' THEN
   IF TG_OP='UPDATE' THEN
     IF OLD.stage='QUALITY' AND OLD.work_state IN ('INCOMING','IN_PROGRESS')
       AND OLD.issue_id IS NULL AND OLD.received_at IS NULL AND OLD.cancelled_at IS NULL
       AND OLD.cancellation_reason IS NULL AND OLD.current_work_visit_id IS NULL
       AND NEW.stage='QUALITY' AND NEW.work_state='BLOCKED' AND NEW.issue_id IS NOT NULL
       AND NEW.received_at IS NULL AND NEW.cancelled_at IS NULL AND NEW.cancellation_reason IS NULL
       AND NEW.current_work_visit_id IS NULL
       AND (to_jsonb(OLD)-ARRAY['work_state','issue_id']) IS NOT DISTINCT FROM (to_jsonb(NEW)-ARRAY['work_state','issue_id']) THEN
       SELECT child.command_id INTO child_key FROM approval_commands child
         JOIN quality_approval_reports link ON link.approval_command_id=child.command_id
         JOIN manufacturing_issues issue ON issue.id=child.issue_id AND issue.order_id=child.order_id AND issue.piece_id=child.piece_id
       WHERE child.operation='REPORT_ISSUE' AND child.order_id=NEW.order_id AND child.piece_id=NEW.id
         AND child.issue_id=NEW.issue_id AND issue.reported_command_id=child.command_id
         AND issue.source_department='QUALITY' AND issue.source_stage='QUALITY'
         AND child.before_facts->'pieces' IS NOT DISTINCT FROM jsonb_build_array(jsonb_build_object(
           'id',OLD.id,'stage',OLD.stage,'workState',OLD.work_state,'issueId',OLD.issue_id,
           'receivedAt',OLD.received_at,'cancelledAt',OLD.cancelled_at,'cancellationReason',OLD.cancellation_reason))
         AND child.after_facts->'pieces' IS NOT DISTINCT FROM jsonb_build_array(jsonb_build_object(
           'id',NEW.id,'stage',NEW.stage,'workState',NEW.work_state,'issueId',NEW.issue_id,
           'receivedAt',NEW.received_at,'cancelledAt',NEW.cancelled_at,'cancellationReason',NEW.cancellation_reason));
       IF child_key IS NOT NULL THEN
         SELECT version INTO final_version FROM sales_drafts WHERE id=NEW.order_id;
         IF is_p06_report_child(child_key,final_version) THEN RETURN NULL; END IF;
       END IF;
     END IF;
   END IF;
 ELSIF TG_TABLE_NAME='approval_commands' THEN
   IF TG_OP='INSERT' THEN
     IF NEW.operation='REPORT_ISSUE' AND EXISTS (
       SELECT 1 FROM manufacturing_issues issue WHERE issue.id=NEW.issue_id AND issue.order_id=NEW.order_id
         AND issue.piece_id=NEW.piece_id AND issue.reported_command_id=NEW.command_id
         AND issue.source_department='QUALITY' AND issue.source_stage='QUALITY'
     ) THEN
       SELECT version INTO final_version FROM sales_drafts WHERE id=NEW.order_id;
       IF is_p06_report_child(NEW.command_id,final_version) THEN RETURN NULL; END IF;
     END IF;
   END IF;
 END IF;
 IF TG_TABLE_NAME='manufacturing_commands' THEN
   PERFORM check_p05_manufacturing_command(NEW.command_id);
   FOR command_order IN SELECT order_id FROM manufacturing_command_orders WHERE command_id=NEW.command_id LOOP
     PERFORM check_p05_manufacturing_order_graph(command_order);
   END LOOP;
 ELSE
   affected_order:=NEW.order_id;
   PERFORM check_p05_manufacturing_order_graph(affected_order);
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION is_p06_correction_visit(visit_key UUID) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
   SELECT 1 FROM manufacturing_work_visits visit
   JOIN quality_correction_cycles cycle ON cycle.id=visit.source_reference_id AND cycle.order_id=visit.order_id AND cycle.piece_id=visit.piece_id
   JOIN quality_piece_events e ON e.id=cycle.rejection_event_id AND e.order_id=cycle.order_id AND e.piece_id=cycle.piece_id
   JOIN quality_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   JOIN quality_commands c ON c.command_id=g.command_id
   WHERE visit.id=visit_key AND visit.origin_kind='QUALITY_CORRECTION' AND c.operation='INSPECT'
     AND e.decision='REJECT' AND e.correction_id=cycle.id AND e.after_stage::text=cycle.target::text
     AND visit.department=cycle.target AND visit.source_correction_cycle=cycle.cycle
     AND visit.instructions=cycle.instructions AND visit.entered_at=c.occurred_at AND visit.source_order_version=g.after_version
 )
$$;

DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM sales_order_pieces p LEFT JOIN sales_drafts root ON root.id=p.order_id
     LEFT JOIN sales_orders h ON h.id=p.order_id LEFT JOIN manufacturing_issues issue ON issue.id=p.issue_id
   WHERE p.stage='QUALITY' AND (
     root.status IS DISTINCT FROM 'SUBMITTED' OR h.status IS DISTINCT FROM 'APPROVED'
     OR p.received_at IS NOT NULL OR p.cancelled_at IS NOT NULL OR p.cancellation_reason IS NOT NULL OR p.current_work_visit_id IS NOT NULL
     OR p.work_state='COMPLETED'
     OR (p.work_state IN ('INCOMING','IN_PROGRESS') AND p.issue_id IS NOT NULL)
     OR (p.work_state='BLOCKED' AND (issue.id IS NULL OR issue.state='RESOLVED' OR issue.order_id<>p.order_id
       OR issue.piece_id<>p.id OR issue.source_department<>'QUALITY'))
   )
 ) THEN RAISE EXCEPTION 'Legacy quality graph requires explicit reconciliation'
   USING ERRCODE='23514',CONSTRAINT='ck_quality_order_graph'; END IF;
END $$;

INSERT INTO quality_work_visits
 (id,order_id,piece_id,sequence,origin_kind,source_production_event_id,entered_at,legacy_unknown_start)
SELECT gen_random_uuid(),p.order_id,p.id,1,
 CASE WHEN arrival.id IS NULL THEN 'LEGACY_BASELINE' ELSE 'PRODUCTION_ARRIVAL' END::quality_visit_origin,
 arrival.id,arrival.occurred_at,true
FROM sales_order_pieces p
LEFT JOIN LATERAL (
 SELECT e.id,c.occurred_at FROM manufacturing_piece_events e
   JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id
   JOIN manufacturing_commands c ON c.command_id=g.command_id
 WHERE e.order_id=p.order_id AND e.piece_id=p.id AND e.operation='COMPLETE_TRANSFER'
   AND e.before_stage='PRODUCTION' AND e.after_stage='QUALITY' AND c.department='PRODUCTION'
 ORDER BY g.after_version DESC,e.id DESC LIMIT 1
) arrival ON true
WHERE p.stage='QUALITY' AND p.work_state='IN_PROGRESS' AND p.issue_id IS NULL
  AND p.received_at IS NULL AND p.cancelled_at IS NULL;

-- Drain migration-only inserts before installing runtime witness guards.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

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
   'completionPercent',CASE WHEN count(*) FILTER(WHERE stage<>'CANCELLED')=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL)/count(*) FILTER(WHERE stage<>'CANCELLED')) END)
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

CREATE TRIGGER quality_commands_retained BEFORE UPDATE OR DELETE ON quality_commands FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_command_orders_retained BEFORE UPDATE OR DELETE ON quality_command_orders FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_piece_events_retained BEFORE UPDATE OR DELETE ON quality_piece_events FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_work_visits_retained BEFORE UPDATE OR DELETE ON quality_work_visits FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_correction_cycles_retained BEFORE UPDATE OR DELETE ON quality_correction_cycles FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_packing_groups_retained BEFORE UPDATE OR DELETE ON quality_packing_groups FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_packing_pieces_retained BEFORE UPDATE OR DELETE ON quality_packing_pieces FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();
CREATE TRIGGER quality_approval_reports_retained BEFORE UPDATE OR DELETE ON quality_approval_reports FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_retained();

CREATE CONSTRAINT TRIGGER p06_quality_command_graph AFTER INSERT ON quality_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_order_event_graph AFTER INSERT ON quality_command_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_piece_event_graph AFTER INSERT ON quality_piece_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_visit_graph AFTER INSERT OR UPDATE ON quality_work_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_correction_graph AFTER INSERT OR UPDATE ON quality_correction_cycles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_packing_graph AFTER INSERT ON quality_packing_groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_packing_member_graph AFTER INSERT ON quality_packing_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_report_graph AFTER INSERT ON quality_approval_reports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_physical_graph AFTER INSERT OR UPDATE ON sales_order_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_root_graph AFTER UPDATE ON sales_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_issue_graph AFTER INSERT OR UPDATE ON manufacturing_issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_approval_graph AFTER INSERT ON approval_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_manufacturing_graph AFTER INSERT ON manufacturing_piece_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_workshop_graph AFTER INSERT OR UPDATE ON manufacturing_work_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_graph();
CREATE CONSTRAINT TRIGGER p06_quality_command_head AFTER INSERT ON quality_command_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_quality_head();
CREATE CONSTRAINT TRIGGER p06_quality_runtime_visit AFTER INSERT ON quality_work_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p06_new_quality_visit();

DO $$
DECLARE order_key UUID;
BEGIN
 FOR order_key IN SELECT id FROM sales_orders LOOP
   PERFORM check_p06_quality_order_graph(order_key);
 END LOOP;
END $$;

COMMIT;
