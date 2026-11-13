BEGIN;

-- Keep every current-state predicate and the complete retained-parent validator.
CREATE OR REPLACE FUNCTION check_p06_quality_order_state(order_key UUID) RETURNS void LANGUAGE plpgsql AS $$
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
END $$;

CREATE OR REPLACE FUNCTION check_p06_quality_order_graph(order_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE command_key UUID;
BEGIN
 PERFORM check_p06_quality_order_state(order_key);
 FOR command_key IN SELECT command_id FROM quality_command_orders WHERE order_id=order_key LOOP
   PERFORM check_p06_quality_command(command_key);
 END LOOP;
END $$;

-- Refuse an invalid base before enabling the narrower external-state dispatch.
DO $$
DECLARE order_key UUID; command_key UUID;
BEGIN
 FOR order_key IN SELECT id FROM sales_orders LOOP
   PERFORM check_p06_quality_order_graph(order_key);
 END LOOP;
 FOR command_key IN SELECT command_id FROM quality_commands LOOP
   PERFORM check_p06_quality_command(command_key);
 END LOOP;
END $$;

-- External mutations preserve the command read set; affected Quality rows retain full checks.
CREATE OR REPLACE FUNCTION enforce_p06_quality_graph() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF TG_TABLE_NAME IN ('sales_drafts','sales_order_pieces','manufacturing_issues','approval_commands','manufacturing_piece_events','manufacturing_work_visits') THEN
     PERFORM check_p06_quality_order_state(order_key);
   ELSE
     PERFORM check_p06_quality_order_graph(order_key);
   END IF;
 END IF;
 RETURN NULL;
END $$;

COMMIT;
