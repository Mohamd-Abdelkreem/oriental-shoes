BEGIN;

-- Allow a recorded administrator to submit a contact proposal for another owner's order.
-- Preserve the actual actor and all existing proposal, transition and catalog checks.
CREATE OR REPLACE FUNCTION check_piece_contact_proposal_bindings(proposal_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p piece_contact_proposals%ROWTYPE; c approval_commands%ROWTYPE; selection RECORD;
BEGIN
 SELECT * INTO p FROM piece_contact_proposals WHERE id=proposal_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO c FROM approval_commands WHERE command_id=p.submitted_command_id;
 IF c.command_id IS NULL OR c.operation<>'SUBMIT_CONTACT'
   OR ROW(c.order_id,c.piece_id,c.issue_id,c.proposal_id,c.actor_id,c.actor_full_name,c.occurred_at)
     IS DISTINCT FROM ROW(p.order_id,p.piece_id,p.issue_id,p.id,p.submitted_by_id,p.submitted_by_full_name,p.submitted_at)
   OR (c.actor_role <> 'ADMIN' AND p.submitted_by_id IS DISTINCT FROM (SELECT owner_id FROM sales_drafts WHERE id=p.order_id)) THEN
   RAISE EXCEPTION 'Contact proposal witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_piece_contact_proposal_bindings';
 END IF;
 FOR selection IN SELECT * FROM (VALUES
   ('model',p.before_model_id,p.before_model),('size',p.before_size_id,p.before_size),('leatherBase',p.before_leather_base_id,p.before_leather_base),('sole',p.before_sole_id,p.before_sole),
   ('model',p.proposed_model_id,p.proposed_model),('size',p.proposed_size_id,p.proposed_size),('leatherBase',p.proposed_leather_base_id,p.proposed_leather_base),('sole',p.proposed_sole_id,p.proposed_sole)
 ) AS bindings(kind,entry_id,label) LOOP
   IF selection.entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_entries e WHERE e.id=selection.entry_id AND e.kind::text=selection.kind AND e.display_value IS NOT DISTINCT FROM selection.label) THEN
     RAISE EXCEPTION 'Contact selection binding is invalid' USING ERRCODE='23514',CONSTRAINT='ck_piece_contact_proposal_bindings';
   END IF;
 END LOOP;
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
     OR NOT EXISTS(SELECT 1 FROM sales_order_pieces WHERE order_id=NEW.order_id AND stage<>'CANCELLED')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.after_facts->'pieces') a WHERE a->>'stage'='CANCELLED' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.before_facts->'pieces') b WHERE b=a))
     OR (NEW.operation='APPROVE_INITIAL' AND (h.status<>'APPROVED' OR h.approved_at IS DISTINCT FROM NEW.occurred_at OR EXISTS(SELECT 1 FROM sales_order_pieces WHERE order_id=NEW.order_id AND stage<>'CANCELLED' AND (stage<>'CUTTING' OR work_state<>'INCOMING' OR issue_id IS NOT NULL))))
     OR (NEW.operation='RETURN_INITIAL' AND (h.status<>'RETURNED' OR h.current_return_decision_id IS DISTINCT FROM NEW.command_id OR EXISTS(SELECT 1 FROM sales_order_pieces WHERE order_id=NEW.order_id AND stage<>'CANCELLED' AND (stage<>'AWAITING_APPROVAL' OR work_state<>'INCOMING' OR issue_id IS NOT NULL))))
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
     OR NEW.operation='SUBMIT_CONTACT' AND (
       issue.state<>'REAPPROVAL' OR issue.latest_proposal_id IS DISTINCT FROM NEW.proposal_id
       OR (NEW.actor_role <> 'ADMIN' AND NEW.actor_id <> r.owner_id))
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

COMMIT;
