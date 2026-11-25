BEGIN;


-- Only the exact order, root version and retained piece may authorize an
-- administrative change to the current capture. Existing approval witnesses
-- and original commercial snapshots remain authoritative for their use cases.
CREATE FUNCTION administration_piece_specifications(target_piece UUID, committed_version BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT value->'specifications'
 FROM sales_order_pieces piece
 JOIN sales_drafts root ON root.id=piece.order_id
 JOIN administration_commands command ON command.order_id=root.id AND command.operation='ADMIN_CORRECT'
   AND (CASE WHEN committed_version THEN command.after_version ELSE command.before_version END)=root.version
 CROSS JOIN LATERAL jsonb_array_elements(command.after_facts#>'{correction,paper,pieces}') AS changed(value)
 WHERE piece.id=target_piece AND value->>'pieceId'=piece.id::text
$$;

CREATE FUNCTION administration_paper_matches(order_key UUID, paper JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE root sales_drafts%ROWTYPE; captured JSONB; expected JSONB;
BEGIN
 IF jsonb_typeof(paper->'pieces') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 SELECT * INTO root FROM sales_drafts WHERE id=order_key;
 IF root.id IS NULL OR paper-'pieces' IS DISTINCT FROM jsonb_build_object(
   'deliveryDate',root.delivery_date,'responsibleSignature',root.responsible_signature,
   'repairNote',root.repair_note,'adjustmentRequested',root.adjustment_requested,
   'adjustmentReason',root.adjustment_reason,'adjustmentActionTaken',root.adjustment_action_taken
 ) THEN RETURN false; END IF;
 IF jsonb_array_length(paper->'pieces') > 200 OR
   (SELECT count(DISTINCT value->>'pieceId') FROM jsonb_array_elements(paper->'pieces')) <> jsonb_array_length(paper->'pieces')
 THEN RETURN false; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements(paper->'pieces') LOOP
   SELECT jsonb_build_object(
     'pieceId',p.id,'model',p.model,'size',p.size,'leatherBase',p.leather_base,'sole',p.sole,
     'specifications',captured_contact_specifications(p.id),
     'catalogSelections',(
       SELECT jsonb_object_agg(fields.kind,s.entry_id)
       FROM unnest(ARRAY['model','size','leatherBase','sole']::catalog_field[]) AS fields(kind)
       LEFT JOIN sales_piece_catalog_selections s ON s.piece_id=p.id AND s.field=fields.kind
     )
   ) INTO captured
   FROM sales_draft_pieces p JOIN sales_order_pieces physical ON physical.id=p.id
   WHERE physical.order_id=order_key AND p.id::text=expected->>'pieceId';
   IF captured IS DISTINCT FROM expected THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;


CREATE OR REPLACE FUNCTION p08_valid_correction(document JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE field_name TEXT;
BEGIN
 IF document ? 'paper' THEN
   IF jsonb_typeof(document->'paper') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
   document:=document-'paper';
 END IF;
 IF p08_has_exact_keys(document,ARRAY['generalNotes','customerName','customerPhone','customerEmail','customerAddress']) IS NOT TRUE
   OR (jsonb_typeof(document->'customerName')='string' AND length(btrim(document->>'customerName')) BETWEEN 1 AND 150 AND document->>'customerName' ~ '[^[:space:]]'
     AND jsonb_typeof(document->'customerPhone')='string' AND document->>'customerPhone' ~ '^\+966(5[013-9][0-9]{7}|1[123467][0-9]{7})$') IS NOT TRUE
 THEN RETURN false; END IF;
 FOREACH field_name IN ARRAY ARRAY['generalNotes','customerEmail','customerAddress'] LOOP
   IF document->field_name='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(document->field_name)<>'string' OR length(document->>field_name)>(CASE field_name WHEN 'generalNotes' THEN 4000 WHEN 'customerAddress' THEN 2000 ELSE 320 END)
   THEN RETURN false; END IF;
 END LOOP;
 IF document->'customerEmail'<>'null'::jsonb AND document->>'customerEmail' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RETURN false; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION p08_facts_match_current(order_key UUID, facts JSONB) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; header sales_orders%ROWTYPE; contact administration_order_corrections%ROWTYPE;
 original_count INTEGER; cancelled_count INTEGER; received_count INTEGER; piece_count INTEGER;
BEGIN
 IF p08_valid_facts(facts) IS NOT TRUE THEN RETURN false; END IF;
 SELECT * INTO root FROM sales_drafts WHERE id=order_key;
 SELECT * INTO header FROM sales_orders WHERE id=order_key;
 IF root.id IS NULL OR header.id IS NULL OR root.status<>'SUBMITTED' OR root.version<>(facts->>'version')::integer
   OR header.status::text<>facts->>'status' OR header.total_amount<>(facts#>>'{money,total}')::numeric
   OR header.paid_amount<>(facts#>>'{money,paidAmount}')::numeric THEN RETURN false; END IF;
 SELECT count(*),count(*) FILTER(WHERE stage='CANCELLED'),count(*) FILTER(WHERE stage<>'CANCELLED' AND received_at IS NOT NULL)
 INTO original_count,cancelled_count,received_count FROM sales_order_pieces WHERE order_id=order_key;
 IF (facts#>>'{counts,original}')::integer<>original_count OR (facts#>>'{counts,cancelled}')::integer<>cancelled_count
   OR (facts#>>'{counts,received}')::integer<>received_count THEN RETURN false; END IF;
 SELECT count(*) INTO piece_count FROM jsonb_array_elements(facts->'pieces') j
 JOIN sales_order_pieces p ON p.id=(j->>'id')::uuid AND p.order_id=order_key
 WHERE p.stage::text=j->>'stage' AND p.work_state::text=j->>'workState'
   AND p.issue_id IS NOT DISTINCT FROM (j->>'issueId')::uuid
   AND p.current_work_visit_id IS NOT DISTINCT FROM (j->>'currentWorkVisitId')::uuid
   AND p.received_at IS NOT DISTINCT FROM (j->>'receivedAt')::timestamptz
   AND p.cancelled_at IS NOT DISTINCT FROM (j->>'cancelledAt')::timestamptz
   AND p.cancellation_reason IS NOT DISTINCT FROM j->>'cancellationReason';
 IF piece_count<>original_count THEN RETURN false; END IF;
 SELECT * INTO contact FROM administration_order_corrections WHERE order_id=order_key AND after_version<=root.version ORDER BY after_version DESC,command_id DESC LIMIT 1;
 IF facts#>'{correction,paper}' IS NOT NULL AND
   administration_paper_matches(order_key,facts#>'{correction,paper}') IS NOT TRUE THEN RETURN false; END IF;
 IF (facts->'correction')-'paper' IS DISTINCT FROM jsonb_build_object('generalNotes',root.general_notes,
   'customerName',COALESCE(contact.customer_name,header.customer_name),'customerPhone',COALESCE(contact.customer_phone,header.customer_phone),
   'customerEmail',CASE WHEN contact.command_id IS NULL THEN header.customer_email ELSE contact.customer_email END,
   'customerAddress',CASE WHEN contact.command_id IS NULL THEN header.customer_address ELSE contact.customer_address END)
 THEN RETURN false; END IF;
 IF header.status='RETURNED' AND ((facts#>>'{returnProof,decisionId}')::uuid IS DISTINCT FROM header.current_return_decision_id
   OR facts#>>'{returnProof,reason}' IS DISTINCT FROM header.current_return_reason
   OR (facts#>>'{returnProof,returnedAt}')::timestamptz IS DISTINCT FROM header.current_returned_at
   OR (facts#>>'{returnProof,version}')::integer IS DISTINCT FROM header.current_return_order_version)
 THEN RETURN false; END IF;
 RETURN true;
END $$;

ALTER TABLE administration_order_corrections DROP CONSTRAINT ck_administration_correction_values;

ALTER TABLE administration_order_corrections ADD CONSTRAINT ck_administration_correction_values CHECK (
 p08_valid_correction(before_values) AND p08_valid_correction(after_values) AND before_values<>after_values
 AND after_values->>'customerName'=customer_name AND after_values->>'customerPhone'=customer_phone
 AND (after_values->>'customerEmail') IS NOT DISTINCT FROM customer_email AND (after_values->>'customerAddress') IS NOT DISTINCT FROM customer_address
 AND cardinality(changed_fields) BETWEEN 1 AND 6
);


CREATE FUNCTION enforce_administration_paper_membership() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF (NEW.before_values->'paper' IS NULL) <> (NEW.after_values->'paper' IS NULL)
   OR ARRAY(SELECT value->>'pieceId' FROM jsonb_array_elements(NEW.before_values#>'{paper,pieces}')) IS DISTINCT FROM
      ARRAY(SELECT value->>'pieceId' FROM jsonb_array_elements(NEW.after_values#>'{paper,pieces}'))
 THEN
   RAISE EXCEPTION 'Administrative paper audit must retain the same pieces'
     USING ERRCODE='23514', CONSTRAINT='ck_administration_correction_values';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER administration_paper_membership BEFORE INSERT ON administration_order_corrections
FOR EACH ROW EXECUTE FUNCTION enforce_administration_paper_membership();


CREATE OR REPLACE FUNCTION prevent_submitted_decoration_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposed JSONB;
BEGIN
  IF ROW(NEW.decoration, NEW.paper_codes) IS DISTINCT FROM ROW(OLD.decoration, OLD.paper_codes)
    AND EXISTS (SELECT 1 FROM sales_drafts WHERE id = OLD.draft_id AND status = 'SUBMITTED') THEN
    proposed := COALESCE(administration_piece_specifications(OLD.id, false), held_contact_specifications(OLD.id));
    IF proposed IS NULL OR proposed->>'decoration' IS DISTINCT FROM NEW.decoration
      OR proposed->'paperCodes' IS DISTINCT FROM to_jsonb(NEW.paper_codes) THEN
      RAISE EXCEPTION 'Submitted piece specifications require a held proposal' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_frozen_decoration_selection_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen UUID; proposed JSONB;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.field = 'decoration' THEN
    SELECT decoration_entry_id INTO frozen FROM sales_order_pieces WHERE id = OLD.piece_id;
    IF frozen IS NOT NULL THEN
      IF TG_OP = 'DELETE' OR NEW.piece_id <> OLD.piece_id OR NEW.field <> OLD.field THEN
        RAISE EXCEPTION 'Submitted decoration selection must remain on its piece' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
      END IF;
      IF NEW.entry_id IS DISTINCT FROM OLD.entry_id THEN
        proposed := COALESCE(administration_piece_specifications(OLD.piece_id, false), held_contact_specifications(OLD.piece_id));
        IF proposed#>>'{catalogSelections,decoration}' IS DISTINCT FROM NEW.entry_id::text THEN
          RAISE EXCEPTION 'Submitted decoration selection requires a held proposal' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.field = 'decoration' THEN
    SELECT decoration_entry_id INTO frozen FROM sales_order_pieces WHERE id = NEW.piece_id;
    IF frozen IS NOT NULL AND NEW.entry_id IS DISTINCT FROM frozen THEN
      RAISE EXCEPTION 'Initial decoration selection must match the price snapshot' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_approved_contact_specifications_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_piece UUID; expected JSONB;
BEGIN
  IF TG_TABLE_NAME = 'sales_draft_pieces' THEN
    IF NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = NEW.draft_id) THEN RETURN NULL; END IF;
    target_piece := NEW.id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM sales_order_pieces WHERE id = NEW.piece_id) THEN RETURN NULL; END IF;
    target_piece := NEW.piece_id;
  END IF;
  -- The deferred administration graph verifies the entire resulting paper.
  IF administration_piece_specifications(target_piece, true)
    IS NOT DISTINCT FROM captured_contact_specifications(target_piece) THEN RETURN NULL; END IF;
  SELECT proposal.proposed_specifications - 'eField' INTO expected
  FROM sales_order_pieces piece
  JOIN sales_drafts root ON root.id = piece.order_id
  JOIN approval_commands command ON command.order_id = root.id AND command.after_version = root.version AND command.piece_id = piece.id
  JOIN piece_contact_proposals proposal ON proposal.id = command.proposal_id AND proposal.piece_id = piece.id
  WHERE piece.id = target_piece AND command.operation = 'REVIEW_CONTACT' AND command.decision = 'ACCEPT';
  IF expected IS NULL OR expected IS DISTINCT FROM captured_contact_specifications(target_piece) THEN
    RAISE EXCEPTION 'New piece specifications require the accepting command' USING ERRCODE = '23514', CONSTRAINT = 'ck_piece_contact_proposal_bindings';
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
