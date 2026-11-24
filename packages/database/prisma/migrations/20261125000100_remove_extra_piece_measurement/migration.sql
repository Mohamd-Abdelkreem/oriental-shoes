BEGIN;

-- Fail rather than discard a measurement if a database ever recorded one.
LOCK TABLE sales_draft_pieces IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales_draft_pieces WHERE e_field IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot remove e_field while piece measurements are stored';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_submitted_decoration_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposed JSONB;
BEGIN
  IF ROW(NEW.decoration, NEW.paper_codes) IS DISTINCT FROM ROW(OLD.decoration, OLD.paper_codes)
    AND EXISTS (SELECT 1 FROM sales_drafts WHERE id = OLD.draft_id AND status = 'SUBMITTED') THEN
    proposed := held_contact_specifications(OLD.id);
    IF proposed IS NULL OR proposed->>'decoration' IS DISTINCT FROM NEW.decoration
      OR proposed->'paperCodes' IS DISTINCT FROM to_jsonb(NEW.paper_codes) THEN
      RAISE EXCEPTION 'Submitted piece specifications require a held proposal' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION captured_contact_specifications(target_piece UUID) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'decoration', p.decoration, 'decorationColor', p.decoration_color, 'soleAddition', p.sole_addition,
    'soleColor', p.sole_color, 'aField', p.a_field, 'fField', p.f_field,
    'faceRight', p.face_right, 'faceLeft', p.face_left, 'mixing', p.mixing, 'face', p.face,
    'additions', p.additions, 'sideNotes', p.side_notes, 'paperCodes', p.paper_codes,
    'catalogSelections', (
      SELECT jsonb_object_agg(fields.kind, s.entry_id)
      FROM unnest(ARRAY['decoration','decorationColor','soleAddition','soleColor','aField','fField']::catalog_field[]) AS fields(kind)
      LEFT JOIN sales_piece_catalog_selections s ON s.piece_id = p.id AND s.field = fields.kind
    )
  ) FROM sales_draft_pieces p WHERE p.id = target_piece
$$;

-- Retained proposals remain immutable. Compare their current fields on acceptance.
CREATE OR REPLACE FUNCTION enforce_contact_specifications_command() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p piece_contact_proposals%ROWTYPE; selection RECORD;
BEGIN
  SELECT * INTO p FROM piece_contact_proposals WHERE id = NEW.proposal_id;
  IF p.before_specifications IS NULL THEN RETURN NULL; END IF;
  IF (NEW.operation = 'SUBMIT_CONTACT' AND p.before_specifications IS DISTINCT FROM captured_contact_specifications(p.piece_id))
    OR (NEW.operation = 'REVIEW_CONTACT' AND NEW.decision = 'ACCEPT'
        AND (p.proposed_specifications - 'eField') IS DISTINCT FROM captured_contact_specifications(p.piece_id)) THEN
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
DROP TRIGGER piece_contact_specifications_write ON sales_draft_pieces;
CREATE CONSTRAINT TRIGGER piece_contact_specifications_write AFTER UPDATE ON sales_draft_pieces
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (ROW(OLD.decoration, OLD.paper_codes) IS DISTINCT FROM ROW(NEW.decoration, NEW.paper_codes))
  EXECUTE FUNCTION enforce_approved_contact_specifications_write();

ALTER TABLE sales_draft_pieces DROP COLUMN e_field;

COMMIT;
