BEGIN;

CREATE TYPE "manufacturing_operation" AS ENUM ('RECEIVE_AND_START', 'CONTINUE', 'COMPLETE_TRANSFER');

CREATE TYPE "manufacturing_visit_origin_kind" AS ENUM ('INITIAL_APPROVAL', 'APPROVAL_RETURN', 'DEPARTMENT_TRANSFER', 'QUALITY_CORRECTION', 'LEGACY_BASELINE');

CREATE TYPE "manufacturing_visit_end_reason" AS ENUM ('TRANSFERRED', 'ISSUE_REPORTED', 'CANCELLED');

ALTER TABLE "sales_order_pieces" ADD COLUMN     "current_work_visit_id" UUID;

CREATE TABLE "manufacturing_commands" (
    "command_id" UUID NOT NULL,
    "operation" "manufacturing_operation" NOT NULL,
    "department" "department" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "payload_hash" CHAR(64) NOT NULL,
    "outcome" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manufacturing_commands_pkey" PRIMARY KEY ("command_id")
);

CREATE TABLE "manufacturing_command_orders" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "piece_ids" UUID[] NOT NULL,

    CONSTRAINT "manufacturing_command_orders_pkey" PRIMARY KEY ("command_id","order_id")
);

CREATE TABLE "manufacturing_work_visits" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "department" "department" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "origin_kind" "manufacturing_visit_origin_kind" NOT NULL,
    "source_department" "department",
    "source_approval_command_id" UUID,
    "source_transfer_event_id" UUID,
    "source_issue_id" UUID,
    "source_reference_id" UUID,
    "source_correction_cycle" INTEGER,
    "source_order_version" INTEGER,
    "instructions" VARCHAR(4000),
    "entered_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "received_command_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "started_command_id" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "manufacturing_visit_end_reason",
    "end_manufacturing_command_id" UUID,
    "end_approval_command_id" UUID,
    "destination" "department",
    "legacy_unknown_start" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "manufacturing_work_visits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "manufacturing_piece_events" (
    "id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "operation" "manufacturing_operation" NOT NULL,
    "before_stage" "sales_piece_stage" NOT NULL,
    "before_work_state" "sales_piece_work_state" NOT NULL,
    "after_stage" "sales_piece_stage" NOT NULL,
    "after_work_state" "sales_piece_work_state" NOT NULL,

    CONSTRAINT "manufacturing_piece_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manufacturing_commands_actor_dept_time_idx" ON "manufacturing_commands"("actor_id", "department", "occurred_at" DESC, "command_id" DESC);

CREATE UNIQUE INDEX "manufacturing_command_orders_event_key" ON "manufacturing_command_orders"("event_id");

CREATE INDEX "manufacturing_command_orders_order_event_idx" ON "manufacturing_command_orders"("order_id", "event_id");

CREATE UNIQUE INDEX "manufacturing_command_orders_order_version_key" ON "manufacturing_command_orders"("order_id", "after_version");

CREATE INDEX "manufacturing_work_visits_dept_piece_sequence_idx" ON "manufacturing_work_visits"("department", "piece_id", "sequence" DESC);

CREATE INDEX "manufacturing_work_visits_order_piece_sequence_idx" ON "manufacturing_work_visits"("order_id", "piece_id", "sequence" DESC);

CREATE UNIQUE INDEX "manufacturing_work_visits_id_order_piece_key" ON "manufacturing_work_visits"("id", "order_id", "piece_id");

CREATE UNIQUE INDEX "manufacturing_work_visits_piece_sequence_key" ON "manufacturing_work_visits"("piece_id", "sequence");

CREATE INDEX "manufacturing_piece_events_visit_command_idx" ON "manufacturing_piece_events"("visit_id", "command_id");

CREATE UNIQUE INDEX "manufacturing_piece_events_id_order_piece_key" ON "manufacturing_piece_events"("id", "order_id", "piece_id");

CREATE UNIQUE INDEX "manufacturing_piece_events_command_piece_key" ON "manufacturing_piece_events"("command_id", "piece_id");

CREATE INDEX "sales_order_pieces_department_state_id_idx" ON "sales_order_pieces"("stage", "work_state", "id");

ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_current_work_visit_fkey" FOREIGN KEY ("current_work_visit_id", "order_id", "id") REFERENCES "manufacturing_work_visits"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_commands" ADD CONSTRAINT "manufacturing_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_command_orders" ADD CONSTRAINT "manufacturing_command_orders_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "manufacturing_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_command_orders" ADD CONSTRAINT "manufacturing_command_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_source_approval_command_id_fkey" FOREIGN KEY ("source_approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_source_transfer_fkey" FOREIGN KEY ("source_transfer_event_id", "order_id", "piece_id") REFERENCES "manufacturing_piece_events"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_source_issue_fkey" FOREIGN KEY ("source_issue_id", "order_id", "piece_id") REFERENCES "manufacturing_issues"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_received_command_id_fkey" FOREIGN KEY ("received_command_id") REFERENCES "manufacturing_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_started_command_id_fkey" FOREIGN KEY ("started_command_id") REFERENCES "manufacturing_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_end_manufacturing_command_id_fkey" FOREIGN KEY ("end_manufacturing_command_id") REFERENCES "manufacturing_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_end_approval_command_id_fkey" FOREIGN KEY ("end_approval_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_piece_events" ADD CONSTRAINT "manufacturing_piece_events_command_id_order_id_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "manufacturing_command_orders"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "manufacturing_piece_events" ADD CONSTRAINT "manufacturing_piece_events_visit_fkey" FOREIGN KEY ("visit_id", "order_id", "piece_id") REFERENCES "manufacturing_work_visits"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Only current department work is initialized. Earlier unknown work remains unknown.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM sales_order_pieces p JOIN sales_orders h ON h.id=p.order_id
   WHERE p.stage IN ('CUTTING','PRODUCTION') AND p.work_state IN ('INCOMING','IN_PROGRESS')
     AND (p.issue_id IS NOT NULL OR p.received_at IS NOT NULL OR p.cancelled_at IS NOT NULL
       OR p.cancellation_reason IS NOT NULL OR h.status<>'APPROVED')
 ) THEN
   RAISE EXCEPTION 'Legacy manufacturing graph requires reconciliation'
     USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_current_visit_graph';
 END IF;
END $$;

INSERT INTO manufacturing_work_visits
 (id,order_id,piece_id,department,sequence,origin_kind,source_department,
  source_approval_command_id,source_issue_id,instructions,entered_at,legacy_unknown_start)
SELECT gen_random_uuid(),p.order_id,p.id,p.stage::text::department,1,
 CASE WHEN witness.command_id IS NULL THEN 'LEGACY_BASELINE'
   WHEN witness.operation='APPROVE_INITIAL' THEN 'INITIAL_APPROVAL'
   ELSE 'APPROVAL_RETURN' END::manufacturing_visit_origin_kind,
 CASE WHEN witness.command_id IS NOT NULL THEN 'APPROVAL'::department END,
 witness.command_id,witness.issue_id,
 CASE WHEN witness.operation<>'APPROVE_INITIAL' THEN witness.decision_notes END,
 witness.occurred_at,p.work_state='IN_PROGRESS'
FROM sales_order_pieces p
LEFT JOIN LATERAL (
 SELECT c.command_id,c.operation,c.issue_id,c.decision_notes,c.occurred_at
 FROM approval_commands c
 WHERE c.order_id=p.order_id AND (
   c.operation='APPROVE_INITIAL' AND p.stage='CUTTING' AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(c.after_facts->'pieces') f
     WHERE f->>'id'=p.id::text AND f->>'stage'='CUTTING' AND f->>'workState'='INCOMING'
   ) OR c.piece_id=p.id AND c.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT')
     AND c.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT')
     AND c.outcome->>'pieceStage'=p.stage::text AND c.outcome->>'pieceWorkState'='INCOMING'
 )
 ORDER BY c.after_version DESC,c.command_id DESC LIMIT 1
) witness ON true
WHERE p.stage IN ('CUTTING','PRODUCTION') AND p.work_state IN ('INCOMING','IN_PROGRESS');

UPDATE sales_order_pieces p SET current_work_visit_id=v.id
 FROM manufacturing_work_visits v WHERE p.id=v.piece_id AND p.order_id=v.order_id;

-- Drain deferred backfill FK/old-graph events before altering populated witness tables.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

CREATE UNIQUE INDEX manufacturing_work_visits_one_open_piece_key
 ON manufacturing_work_visits(piece_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX manufacturing_piece_events_one_completion_key
 ON manufacturing_piece_events(visit_id) WHERE operation='COMPLETE_TRANSFER';

ALTER TABLE manufacturing_commands ADD CONSTRAINT ck_manufacturing_command_shape CHECK ((
 department IN ('CUTTING','PRODUCTION') AND btrim(actor_full_name)<>''
 AND (actor_role='ADMIN' OR actor_department=department)
 AND payload_hash ~ '^[0-9a-f]{64}$'
 AND jsonb_typeof(outcome)='object' AND jsonb_typeof(outcome->'orders')='array'
 AND jsonb_array_length(outcome->'orders') BETWEEN 1 AND 200
 AND octet_length(outcome::text)<=262144
) IS TRUE);
ALTER TABLE manufacturing_command_orders ADD CONSTRAINT ck_manufacturing_command_order_version CHECK ((
 before_version BETWEEN 1 AND 2147483646 AND after_version=before_version::bigint+1
 AND cardinality(piece_ids) BETWEEN 1 AND 200 AND array_position(piece_ids,NULL) IS NULL
) IS TRUE);
ALTER TABLE manufacturing_work_visits ADD CONSTRAINT ck_manufacturing_visit_origin CHECK ((
 department IN ('CUTTING','PRODUCTION') AND sequence>=1
 AND (instructions IS NULL OR btrim(instructions)<>'')
 AND CASE origin_kind
 WHEN 'INITIAL_APPROVAL' THEN source_department='APPROVAL' AND source_approval_command_id IS NOT NULL
   AND source_issue_id IS NULL AND source_transfer_event_id IS NULL AND source_reference_id IS NULL
   AND source_correction_cycle IS NULL AND source_order_version IS NULL AND instructions IS NULL AND entered_at IS NOT NULL
 WHEN 'APPROVAL_RETURN' THEN source_department='APPROVAL' AND source_approval_command_id IS NOT NULL
   AND source_issue_id IS NOT NULL AND source_transfer_event_id IS NULL AND source_reference_id IS NULL
   AND source_correction_cycle IS NULL AND source_order_version IS NULL AND entered_at IS NOT NULL
 WHEN 'DEPARTMENT_TRANSFER' THEN department='PRODUCTION' AND source_department='CUTTING'
   AND source_transfer_event_id IS NOT NULL AND source_approval_command_id IS NULL AND source_issue_id IS NULL
   AND source_reference_id IS NULL AND source_correction_cycle IS NULL AND source_order_version IS NULL
   AND instructions IS NULL AND entered_at IS NOT NULL
 WHEN 'QUALITY_CORRECTION' THEN source_department='QUALITY' AND source_reference_id IS NOT NULL
   AND source_correction_cycle>0 AND source_order_version>1 AND source_approval_command_id IS NULL
   AND source_transfer_event_id IS NULL AND source_issue_id IS NULL AND instructions IS NOT NULL AND entered_at IS NOT NULL
 WHEN 'LEGACY_BASELINE' THEN source_department IS NULL AND source_approval_command_id IS NULL
   AND source_transfer_event_id IS NULL AND source_issue_id IS NULL AND source_reference_id IS NULL
   AND source_correction_cycle IS NULL AND source_order_version IS NULL AND instructions IS NULL AND entered_at IS NULL
 ELSE false END
) IS TRUE);
ALTER TABLE manufacturing_work_visits ADD CONSTRAINT ck_manufacturing_visit_times CHECK ((
 (received_at IS NULL)=(received_command_id IS NULL)
 AND (started_at IS NULL)=(started_command_id IS NULL)
 AND (NOT legacy_unknown_start OR (received_at IS NULL AND started_at IS NULL))
 AND (entered_at IS NULL OR started_at IS NULL OR entered_at<=started_at)
 AND (ended_at IS NULL OR entered_at IS NULL OR ended_at>=entered_at)
 AND (ended_at IS NULL OR started_at IS NULL OR ended_at>=started_at)
 AND CASE
 WHEN ended_at IS NULL THEN end_reason IS NULL AND end_manufacturing_command_id IS NULL
   AND end_approval_command_id IS NULL AND destination IS NULL
 WHEN end_reason='TRANSFERRED' THEN end_manufacturing_command_id IS NOT NULL
   AND end_approval_command_id IS NULL AND destination=CASE department WHEN 'CUTTING' THEN 'PRODUCTION'::department ELSE 'QUALITY'::department END
 WHEN end_reason IN ('ISSUE_REPORTED','CANCELLED') THEN end_approval_command_id IS NOT NULL
   AND end_manufacturing_command_id IS NULL AND destination IS NULL
 ELSE false END
) IS TRUE);

CREATE FUNCTION enforce_p05_manufacturing_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME<>'manufacturing_work_visits' THEN
   RAISE EXCEPTION 'Manufacturing history is retained' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_retained';
 END IF;
 IF ROW(OLD.id,OLD.order_id,OLD.piece_id,OLD.department,OLD.sequence,OLD.origin_kind,
   OLD.source_department,OLD.source_approval_command_id,OLD.source_transfer_event_id,OLD.source_issue_id,
   OLD.source_reference_id,OLD.source_correction_cycle,OLD.source_order_version,OLD.instructions,OLD.entered_at,OLD.legacy_unknown_start)
 IS DISTINCT FROM ROW(NEW.id,NEW.order_id,NEW.piece_id,NEW.department,NEW.sequence,NEW.origin_kind,
   NEW.source_department,NEW.source_approval_command_id,NEW.source_transfer_event_id,NEW.source_issue_id,
   NEW.source_reference_id,NEW.source_correction_cycle,NEW.source_order_version,NEW.instructions,NEW.entered_at,NEW.legacy_unknown_start)
 OR (OLD.received_at IS NOT NULL AND ROW(OLD.received_at,OLD.received_command_id) IS DISTINCT FROM ROW(NEW.received_at,NEW.received_command_id))
 OR (OLD.started_at IS NOT NULL AND ROW(OLD.started_at,OLD.started_command_id) IS DISTINCT FROM ROW(NEW.started_at,NEW.started_command_id))
 OR (OLD.ended_at IS NOT NULL AND OLD IS DISTINCT FROM NEW) THEN
   RAISE EXCEPTION 'Manufacturing origin and original work are immutable' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_retained';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manufacturing_commands_retained BEFORE UPDATE OR DELETE ON manufacturing_commands
 FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_retained();
CREATE TRIGGER manufacturing_command_orders_retained BEFORE UPDATE OR DELETE ON manufacturing_command_orders
 FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_retained();
CREATE TRIGGER manufacturing_piece_events_retained BEFORE UPDATE OR DELETE ON manufacturing_piece_events
 FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_retained();
CREATE TRIGGER manufacturing_work_visits_retained BEFORE UPDATE OR DELETE ON manufacturing_work_visits
 FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_retained();

CREATE FUNCTION check_p05_manufacturing_command(command_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c manufacturing_commands%ROWTYPE; g manufacturing_command_orders%ROWTYPE;
DECLARE expected_orders JSONB; expected_pieces JSONB; expected_ids UUID[];
BEGIN
 SELECT * INTO c FROM manufacturing_commands WHERE command_id=command_key;
 IF c.command_id IS NULL THEN RETURN; END IF;
 IF (SELECT count(*) FROM manufacturing_piece_events WHERE command_id=command_key) NOT BETWEEN 1 AND 200
   OR (SELECT count(*) FROM manufacturing_command_orders WHERE command_id=command_key) NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Command selection budget is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 FOR g IN SELECT * FROM manufacturing_command_orders WHERE command_id=command_key ORDER BY order_id LOOP
   SELECT array_agg(e.piece_id ORDER BY e.piece_id),
     jsonb_agg(jsonb_build_object('pieceId',e.piece_id,'visitId',e.visit_id,'nextVisitId',next_visit.id,
       'stage',e.after_stage,'workState',e.after_work_state) ORDER BY e.piece_id)
   INTO expected_ids,expected_pieces
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
   expected_orders:=coalesce(expected_orders,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
     'eventId',g.event_id,'orderId',g.order_id,'beforeVersion',g.before_version,'afterVersion',g.after_version,'pieces',expected_pieces));
 END LOOP;
 IF c.outcome IS DISTINCT FROM jsonb_build_object('orders',expected_orders) THEN
   RAISE EXCEPTION 'Retained command outcome does not match its exact events' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
END $$;

CREATE FUNCTION check_p05_manufacturing_order_graph(affected_order UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v manufacturing_work_visits%ROWTYPE; c approval_commands%ROWTYPE; m manufacturing_commands%ROWTYPE;
DECLARE event manufacturing_piece_events%ROWTYPE; command_key UUID;
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
 FOR v IN SELECT * FROM manufacturing_work_visits WHERE order_id=affected_order LOOP
   IF v.source_approval_command_id IS NOT NULL THEN
     SELECT * INTO c FROM approval_commands WHERE command_id=v.source_approval_command_id;
     IF c.command_id IS NULL OR c.order_id<>v.order_id OR c.occurred_at IS DISTINCT FROM v.entered_at
       OR (v.origin_kind='INITIAL_APPROVAL' AND (c.operation<>'APPROVE_INITIAL' OR v.department<>'CUTTING'
         OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.after_facts->'pieces') f WHERE f->>'id'=v.piece_id::text AND f->>'stage'='CUTTING' AND f->>'workState'='INCOMING')))
       OR (v.origin_kind='APPROVAL_RETURN' AND (c.operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') OR c.decision NOT IN ('RETURN_TO_DEPARTMENT','ACCEPT')
         OR c.piece_id IS DISTINCT FROM v.piece_id OR c.issue_id IS DISTINCT FROM v.source_issue_id
         OR c.outcome->>'pieceStage' IS DISTINCT FROM v.department::text OR c.outcome->>'pieceWorkState' IS DISTINCT FROM 'INCOMING'
         OR c.decision_notes IS DISTINCT FROM v.instructions)) THEN
       RAISE EXCEPTION 'Visit approval source is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin';
     END IF;
   END IF;
   IF v.source_transfer_event_id IS NOT NULL THEN
     SELECT * INTO event FROM manufacturing_piece_events WHERE id=v.source_transfer_event_id;
     SELECT * INTO m FROM manufacturing_commands WHERE command_id=event.command_id;
     IF event.id IS NULL OR event.operation<>'COMPLETE_TRANSFER' OR event.before_stage<>'CUTTING'
       OR event.after_stage<>'PRODUCTION' OR v.entered_at IS DISTINCT FROM m.occurred_at THEN
       RAISE EXCEPTION 'Visit transfer source is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin';
     END IF;
   END IF;
   IF v.received_command_id IS NOT NULL THEN
     SELECT * INTO m FROM manufacturing_commands WHERE command_id=v.received_command_id;
     IF m.command_id IS NULL OR m.operation<>'RECEIVE_AND_START' OR m.department<>v.department
       OR m.occurred_at IS DISTINCT FROM v.received_at OR NOT EXISTS (
         SELECT 1 FROM manufacturing_piece_events e WHERE e.command_id=m.command_id AND e.visit_id=v.id AND e.piece_id=v.piece_id AND e.order_id=v.order_id
       ) THEN
       RAISE EXCEPTION 'Visit original start witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times';
     END IF;
   END IF;
   IF v.end_manufacturing_command_id IS NOT NULL THEN
     SELECT * INTO m FROM manufacturing_commands WHERE command_id=v.end_manufacturing_command_id;
     IF m.command_id IS NULL OR m.operation<>'COMPLETE_TRANSFER' OR m.department<>v.department
       OR m.occurred_at IS DISTINCT FROM v.ended_at OR NOT EXISTS (
         SELECT 1 FROM manufacturing_piece_events e WHERE e.command_id=m.command_id AND e.visit_id=v.id AND e.piece_id=v.piece_id AND e.order_id=v.order_id
       ) THEN
       RAISE EXCEPTION 'Visit transfer witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times';
     END IF;
   END IF;
   IF v.end_approval_command_id IS NOT NULL THEN
     SELECT * INTO c FROM approval_commands WHERE command_id=v.end_approval_command_id;
     IF c.command_id IS NULL OR c.order_id<>v.order_id OR c.piece_id IS DISTINCT FROM v.piece_id OR c.occurred_at IS DISTINCT FROM v.ended_at
       OR (v.end_reason='ISSUE_REPORTED' AND (c.operation<>'REPORT_ISSUE' OR c.before_facts#>>'{pieces,0,stage}' IS DISTINCT FROM v.department::text))
       OR (v.end_reason='CANCELLED' AND (c.operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') OR c.decision IS DISTINCT FROM 'CANCEL')) THEN
       RAISE EXCEPTION 'Visit issue/cancellation witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times';
     END IF;
   END IF;
 END LOOP;
 FOR command_key IN SELECT command_id FROM manufacturing_command_orders WHERE order_id=affected_order LOOP
   PERFORM check_p05_manufacturing_command(command_key);
 END LOOP;
END $$;

CREATE FUNCTION enforce_p05_manufacturing_graph() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_order UUID; command_order UUID;
BEGIN
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
CREATE CONSTRAINT TRIGGER p05_piece_final_graph AFTER INSERT OR UPDATE ON sales_order_pieces
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();
CREATE CONSTRAINT TRIGGER p05_visit_final_graph AFTER INSERT OR UPDATE ON manufacturing_work_visits
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();
CREATE CONSTRAINT TRIGGER p05_event_final_graph AFTER INSERT ON manufacturing_piece_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();
CREATE CONSTRAINT TRIGGER p05_command_order_final_graph AFTER INSERT ON manufacturing_command_orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();
CREATE CONSTRAINT TRIGGER p05_command_final_graph AFTER INSERT ON manufacturing_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();
CREATE CONSTRAINT TRIGGER p05_approval_final_graph AFTER INSERT ON approval_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_manufacturing_graph();

-- Only newly accepted heads are compared to current mutable state; old receipts survive later work.
CREATE FUNCTION enforce_p05_command_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; c manufacturing_commands%ROWTYPE;
BEGIN
 SELECT * INTO root FROM sales_drafts WHERE id=NEW.order_id;
 SELECT * INTO c FROM manufacturing_commands WHERE command_id=NEW.command_id;
 IF root.status<>'SUBMITTED' OR root.version IS DISTINCT FROM NEW.after_version
   OR NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=NEW.order_id AND status='APPROVED')
   OR EXISTS (
     SELECT 1 FROM manufacturing_piece_events e JOIN sales_order_pieces p ON p.id=e.piece_id AND p.order_id=e.order_id
     WHERE e.command_id=NEW.command_id AND e.order_id=NEW.order_id AND (
       p.stage<>e.after_stage OR p.work_state<>e.after_work_state OR p.issue_id IS NOT NULL
       OR p.received_at IS NOT NULL OR p.cancelled_at IS NOT NULL OR p.cancellation_reason IS NOT NULL
       OR (c.operation<>'COMPLETE_TRANSFER' AND p.current_work_visit_id IS DISTINCT FROM e.visit_id)
       OR (c.operation='COMPLETE_TRANSFER' AND c.department='PRODUCTION' AND p.current_work_visit_id IS NOT NULL)
       OR (c.operation='COMPLETE_TRANSFER' AND c.department='CUTTING' AND NOT EXISTS (
         SELECT 1 FROM manufacturing_work_visits v WHERE v.id=p.current_work_visit_id AND v.source_transfer_event_id=e.id
       ))
     )
   ) THEN
   RAISE EXCEPTION 'New command head does not match final work' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 PERFORM check_p05_manufacturing_command(NEW.command_id);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p05_new_command_head AFTER INSERT ON manufacturing_command_orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_command_head();

CREATE FUNCTION enforce_p05_root_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE witnesses BIGINT;
BEGIN
 IF NEW.status<>'SUBMITTED' OR NEW.version=OLD.version THEN RETURN NULL; END IF;
 SELECT count(*) INTO witnesses FROM (
   SELECT command_id FROM sales_commands WHERE draft_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT command_id FROM approval_commands WHERE order_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT command_id FROM manufacturing_command_orders WHERE order_id=NEW.id AND after_version=NEW.version
   UNION ALL SELECT source_reference_id FROM manufacturing_work_visits
     WHERE order_id=NEW.id AND source_order_version=NEW.version AND origin_kind='QUALITY_CORRECTION'
     GROUP BY source_reference_id,source_order_version
 ) heads;
 IF NEW.version::bigint<>OLD.version::bigint+1 OR witnesses<>1 THEN
   RAISE EXCEPTION 'Submitted root requires one exact next-version witness' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p05_root_head AFTER UPDATE ON sales_drafts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_root_head();

CREATE FUNCTION enforce_p05_piece_transition() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE CONSTRAINT TRIGGER p05_piece_transition AFTER UPDATE ON sales_order_pieces
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_piece_transition();

CREATE FUNCTION enforce_p05_new_visit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_version INTEGER; source_version INTEGER;
BEGIN
 SELECT version INTO root_version FROM sales_drafts WHERE id=NEW.order_id;
 IF NEW.origin_kind='LEGACY_BASELINE' OR NEW.legacy_unknown_start THEN
   RAISE EXCEPTION 'Legacy visits are migration-only' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin';
 END IF;
 IF NEW.source_approval_command_id IS NOT NULL THEN
   SELECT after_version INTO source_version FROM approval_commands WHERE command_id=NEW.source_approval_command_id;
 ELSIF NEW.source_transfer_event_id IS NOT NULL THEN
   SELECT g.after_version INTO source_version FROM manufacturing_piece_events e
     JOIN manufacturing_command_orders g ON g.command_id=e.command_id AND g.order_id=e.order_id WHERE e.id=NEW.source_transfer_event_id;
 ELSE source_version:=NEW.source_order_version; END IF;
 IF source_version IS DISTINCT FROM root_version THEN
   RAISE EXCEPTION 'New visit requires its actual source head' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_origin';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p05_new_visit AFTER INSERT ON manufacturing_work_visits
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p05_new_visit();

DO $$
DECLARE order_key UUID;
BEGIN
 FOR order_key IN SELECT id FROM sales_orders LOOP
   PERFORM check_p05_manufacturing_order_graph(order_key);
 END LOOP;
END $$;

COMMIT;
