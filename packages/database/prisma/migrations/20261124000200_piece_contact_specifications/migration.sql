BEGIN;

ALTER TABLE sales_draft_pieces
  ADD COLUMN e_field VARCHAR(200),
  ADD COLUMN paper_codes TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT ck_piece_paper_codes CHECK (
    cardinality(paper_codes) <= 17 AND array_position(paper_codes, NULL) IS NULL
    AND paper_codes <@ ARRAY['X','H','S','K','T','N.D','N1/2','R.R','N','R.M','R.M1/2','R.C','R.N','R.D','R.D1/2','R.O','R.P']
  );

ALTER TABLE piece_contact_proposals
  ADD COLUMN before_specifications JSONB,
  ADD COLUMN proposed_specifications JSONB,
  ADD CONSTRAINT ck_contact_specifications_presence CHECK (
    (before_specifications IS NULL AND proposed_specifications IS NULL)
    OR (before_specifications IS NOT NULL AND jsonb_typeof(before_specifications) = 'object' AND
        ((kind = 'CANCEL_REQUEST' AND proposed_specifications IS NULL)
         OR (kind = 'AMEND' AND proposed_specifications IS NOT NULL AND jsonb_typeof(proposed_specifications) = 'object')))
  );

-- The original decoration, reference and price in sales_order_pieces are the
-- commercial snapshot. The draft-piece capture holds the approved specification.
CREATE OR REPLACE FUNCTION enforce_sales_order_piece_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base sales_draft_pieces%ROWTYPE; entry catalog_entries%ROWTYPE; source UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submitted pieces are retained' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.order_id, NEW.decoration_entry_id, NEW.price_source_id, NEW.decoration_label, NEW.unit_price, NEW.price_source_cell)
    IS DISTINCT FROM ROW(OLD.id, OLD.order_id, OLD.decoration_entry_id, OLD.price_source_id, OLD.decoration_label, OLD.unit_price, OLD.price_source_cell) THEN
    RAISE EXCEPTION 'Frozen piece terms are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
  END IF;
  SELECT * INTO base FROM sales_draft_pieces WHERE id = NEW.id;
  IF NOT FOUND OR base.draft_id <> NEW.order_id OR base.removed_at IS NOT NULL OR base.quantity <> 1 THEN
    RAISE EXCEPTION 'Submitted piece membership is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_membership';
  END IF;
  SELECT * INTO entry FROM catalog_entries WHERE id = NEW.decoration_entry_id;
  SELECT catalog_source_id INTO source FROM sales_orders WHERE id = NEW.order_id;
  IF entry.id IS NULL OR entry.kind <> 'decoration' OR entry.source_id <> NEW.price_source_id OR source IS DISTINCT FROM NEW.price_source_id
    OR entry.display_value IS DISTINCT FROM NEW.decoration_label OR (TG_OP = 'INSERT' AND base.decoration IS DISTINCT FROM NEW.decoration_label)
    OR entry.unit_price IS DISTINCT FROM NEW.unit_price OR entry.price_source_cell IS DISTINCT FROM NEW.price_source_cell THEN
    RAISE EXCEPTION 'Frozen piece terms do not match the reviewed entry' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_membership';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION held_contact_specifications(target_piece UUID) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT proposal.proposed_specifications
  FROM sales_order_pieces piece
  JOIN manufacturing_issues issue ON issue.id = piece.issue_id AND issue.piece_id = piece.id
  JOIN piece_contact_proposals proposal ON proposal.id = issue.latest_proposal_id AND proposal.issue_id = issue.id
  WHERE piece.id = target_piece AND issue.state = 'REAPPROVAL' AND proposal.kind = 'AMEND'
$$;

CREATE OR REPLACE FUNCTION prevent_submitted_decoration_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposed JSONB;
BEGIN
  IF ROW(NEW.decoration, NEW.e_field, NEW.paper_codes) IS DISTINCT FROM ROW(OLD.decoration, OLD.e_field, OLD.paper_codes)
    AND EXISTS (SELECT 1 FROM sales_drafts WHERE id = OLD.draft_id AND status = 'SUBMITTED') THEN
    proposed := held_contact_specifications(OLD.id);
    IF proposed IS NULL OR proposed->>'decoration' IS DISTINCT FROM NEW.decoration
      OR proposed->>'eField' IS DISTINCT FROM NEW.e_field
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
        proposed := held_contact_specifications(OLD.piece_id);
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

CREATE FUNCTION captured_contact_specifications(target_piece UUID) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'decoration', p.decoration, 'decorationColor', p.decoration_color, 'soleAddition', p.sole_addition,
    'soleColor', p.sole_color, 'aField', p.a_field, 'eField', p.e_field, 'fField', p.f_field,
    'faceRight', p.face_right, 'faceLeft', p.face_left, 'mixing', p.mixing, 'face', p.face,
    'additions', p.additions, 'sideNotes', p.side_notes, 'paperCodes', p.paper_codes,
    'catalogSelections', (
      SELECT jsonb_object_agg(fields.kind, s.entry_id)
      FROM unnest(ARRAY['decoration','decorationColor','soleAddition','soleColor','aField','fField']::catalog_field[]) AS fields(kind)
      LEFT JOIN sales_piece_catalog_selections s ON s.piece_id = p.id AND s.field = fields.kind
    )
  ) FROM sales_draft_pieces p WHERE p.id = target_piece
$$;

CREATE FUNCTION enforce_contact_specifications_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p piece_contact_proposals%ROWTYPE; selection RECORD;
BEGIN
  SELECT * INTO p FROM piece_contact_proposals WHERE id = NEW.proposal_id;
  IF p.before_specifications IS NULL THEN RETURN NULL; END IF;
  IF (NEW.operation = 'SUBMIT_CONTACT' AND p.before_specifications IS DISTINCT FROM captured_contact_specifications(p.piece_id))
    OR (NEW.operation = 'REVIEW_CONTACT' AND NEW.decision = 'ACCEPT'
        AND p.proposed_specifications IS DISTINCT FROM captured_contact_specifications(p.piece_id)) THEN
    RAISE EXCEPTION 'Contact specifications contradict the captured piece' USING ERRCODE = '23514', CONSTRAINT = 'ck_piece_contact_proposal_bindings';
  END IF;
  IF NEW.operation = 'SUBMIT_CONTACT' AND p.proposed_specifications IS NOT NULL THEN
    FOR selection IN SELECT key, value FROM jsonb_each_text(p.proposed_specifications->'catalogSelections') LOOP
      IF selection.value IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM catalog_entries e
        WHERE e.id::text = selection.value AND e.kind::text = selection.key
          AND e.display_value = p.proposed_specifications->>selection.key
      ) THEN
        RAISE EXCEPTION 'Proposed catalog entry contradicts the captured label' USING ERRCODE = '23514', CONSTRAINT = 'ck_piece_contact_proposal_bindings';
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER piece_contact_specifications_command AFTER INSERT ON approval_commands
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.proposal_id IS NOT NULL)
  EXECUTE FUNCTION enforce_contact_specifications_command();

CREATE FUNCTION enforce_approved_contact_specifications_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_piece UUID; expected JSONB;
BEGIN
  IF TG_TABLE_NAME = 'sales_draft_pieces' THEN
    IF NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = NEW.draft_id) THEN RETURN NULL; END IF;
    target_piece := NEW.id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM sales_order_pieces WHERE id = NEW.piece_id) THEN RETURN NULL; END IF;
    target_piece := NEW.piece_id;
  END IF;
  SELECT proposal.proposed_specifications INTO expected
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
CREATE CONSTRAINT TRIGGER piece_contact_specifications_write AFTER UPDATE ON sales_draft_pieces
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (ROW(OLD.decoration, OLD.e_field, OLD.paper_codes) IS DISTINCT FROM ROW(NEW.decoration, NEW.e_field, NEW.paper_codes))
  EXECUTE FUNCTION enforce_approved_contact_specifications_write();
CREATE CONSTRAINT TRIGGER piece_contact_decoration_selection_write AFTER UPDATE ON sales_piece_catalog_selections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.field = 'decoration' AND NEW.field = 'decoration' AND OLD.entry_id IS DISTINCT FROM NEW.entry_id)
  EXECUTE FUNCTION enforce_approved_contact_specifications_write();

COMMIT;
