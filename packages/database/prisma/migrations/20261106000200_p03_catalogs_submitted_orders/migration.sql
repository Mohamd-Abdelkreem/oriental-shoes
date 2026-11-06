-- CreateTable
CREATE TABLE "catalog_sources" (
    "id" UUID NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "worksheet" VARCHAR(100) NOT NULL,
    "source_extent" VARCHAR(32) NOT NULL,
    "mapping_version" INTEGER NOT NULL,
    "loaded_at" TIMESTAMPTZ(6) NOT NULL,
    "loaded_by_reference" VARCHAR(128) NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,

    CONSTRAINT "catalog_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_entries" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "kind" "catalog_field" NOT NULL,
    "source_cell" VARCHAR(16) NOT NULL,
    "display_value" VARCHAR(200) NOT NULL,
    "lookup_value" VARCHAR(200) NOT NULL,
    "family_cell" VARCHAR(16),
    "family_label" VARCHAR(200),
    "position" INTEGER NOT NULL,
    "unit_price" NUMERIC,
    "price_source_cell" VARCHAR(16),

    CONSTRAINT "catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_activation" (
    "id" VARCHAR(6) NOT NULL,
    "source_id" UUID,
    "activated_at" TIMESTAMPTZ(6),

    CONSTRAINT "catalog_activation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_piece_catalog_selections" (
    "piece_id" UUID NOT NULL,
    "field" "catalog_field" NOT NULL,
    "entry_id" UUID NOT NULL,

    CONSTRAINT "sales_piece_catalog_selections_pkey" PRIMARY KEY ("piece_id","field")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_sources_sha256_key" ON "catalog_sources"("sha256");

-- CreateIndex
CREATE INDEX "catalog_entries_source_kind_family_position_idx" ON "catalog_entries"("source_id", "kind", "family_cell", "position", "id");

-- CreateIndex
CREATE INDEX "catalog_entries_source_kind_lookup_idx" ON "catalog_entries"("source_id", "kind", "lookup_value");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entries_source_kind_cell_key" ON "catalog_entries"("source_id", "kind", "source_cell");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_entries_id_source_key" ON "catalog_entries"("id", "source_id");

-- CreateIndex
CREATE INDEX "sales_piece_catalog_selections_entry_idx" ON "sales_piece_catalog_selections"("entry_id");

-- AddForeignKey
ALTER TABLE "catalog_entries" ADD CONSTRAINT "catalog_entries_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "catalog_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_activation" ADD CONSTRAINT "catalog_activation_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "catalog_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_piece_catalog_selections" ADD CONSTRAINT "sales_piece_catalog_selections_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "sales_draft_pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_piece_catalog_selections" ADD CONSTRAINT "sales_piece_catalog_selections_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE catalog_sources ADD CONSTRAINT ck_catalog_sources_hash CHECK (
  sha256 ~ '^[0-9a-f]{64}$' AND mapping_version > 0 AND entry_count = 1874
  AND btrim(worksheet) <> '' AND btrim(source_extent) <> '' AND btrim(loaded_by_reference) <> ''
);
ALTER TABLE catalog_entries
  ADD CONSTRAINT ck_catalog_entries_value CHECK (btrim(display_value) <> '' AND btrim(lookup_value) <> '' AND position > 0),
  ADD CONSTRAINT ck_catalog_entries_rate CHECK (
    (kind = 'decoration' AND unit_price IS NOT NULL AND unit_price >= 0 AND unit_price <= 999999999.99
      AND scale(unit_price) <= 2 AND price_source_cell IS NOT NULL AND price_source_cell ~ '^AA[1-9][0-9]*$')
    OR (kind <> 'decoration' AND unit_price IS NULL AND price_source_cell IS NULL)
  ),
  ADD CONSTRAINT ck_catalog_entries_family CHECK (
    (kind = 'decorationColor' AND family_cell IS NOT NULL AND family_cell ~ '^[L-Y]2$' AND family_label IS NOT NULL AND btrim(family_label) <> '')
    OR (kind <> 'decorationColor' AND family_cell IS NULL AND family_label IS NULL)
  );
ALTER TABLE catalog_activation ADD CONSTRAINT ck_catalog_activation_singleton CHECK (
  id = 'active' AND ((source_id IS NULL AND activated_at IS NULL) OR (source_id IS NOT NULL AND activated_at IS NOT NULL))
);
INSERT INTO catalog_activation(id, source_id, activated_at) VALUES ('active', NULL, NULL);

CREATE FUNCTION enforce_catalog_retained_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Reviewed catalog records are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_catalog_retained_immutable';
END;
$$;
CREATE TRIGGER catalog_source_immutable BEFORE UPDATE OR DELETE ON catalog_sources FOR EACH ROW EXECUTE FUNCTION enforce_catalog_retained_immutable();
CREATE TRIGGER catalog_entry_immutable BEFORE UPDATE OR DELETE ON catalog_entries FOR EACH ROW EXECUTE FUNCTION enforce_catalog_retained_immutable();

CREATE FUNCTION check_sales_piece_catalog_selections(affected_piece UUID) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_piece_catalog_selections s
    JOIN sales_draft_pieces p ON p.id = s.piece_id
    JOIN catalog_entries e ON e.id = s.entry_id
    WHERE s.piece_id = affected_piece AND (s.field <> e.kind OR e.display_value IS DISTINCT FROM
      CASE s.field
        WHEN 'model' THEN p.model WHEN 'size' THEN p.size WHEN 'leatherBase' THEN p.leather_base
        WHEN 'decoration' THEN p.decoration WHEN 'decorationColor' THEN p.decoration_color
        WHEN 'sole' THEN p.sole WHEN 'soleAddition' THEN p.sole_addition WHEN 'soleColor' THEN p.sole_color
        WHEN 'aField' THEN p.a_field WHEN 'fField' THEN p.f_field
      END)
  ) THEN
    RAISE EXCEPTION 'Catalog selection does not match the captured field' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_piece_catalog_selection_kind';
  END IF;
END;
$$;
CREATE FUNCTION enforce_sales_piece_catalog_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_draft_pieces' THEN
    PERFORM check_sales_piece_catalog_selections(NEW.id);
  ELSE
    IF TG_OP <> 'DELETE' THEN PERFORM check_sales_piece_catalog_selections(NEW.piece_id); END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM check_sales_piece_catalog_selections(OLD.piece_id); END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sales_selection_final_kind AFTER INSERT OR UPDATE OR DELETE ON sales_piece_catalog_selections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_piece_catalog_selection();
CREATE CONSTRAINT TRIGGER sales_capture_final_selection AFTER UPDATE ON sales_draft_pieces
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_piece_catalog_selection();

CREATE FUNCTION prevent_removed_piece_selection_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN affected := OLD.piece_id; ELSE affected := NEW.piece_id; END IF;
  IF EXISTS (SELECT 1 FROM sales_draft_pieces WHERE id = affected AND removed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Removed piece references are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_piece_catalog_selection_kind';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER sales_removed_selection_immutable BEFORE INSERT OR UPDATE OR DELETE ON sales_piece_catalog_selections
  FOR EACH ROW EXECUTE FUNCTION prevent_removed_piece_selection_change();

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "status" "sales_order_status" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "business_number" VARCHAR(64) NOT NULL,
    "number_sequence" BIGINT NOT NULL,
    "number_year" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "owner_full_name_at_submission" VARCHAR(150) NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_phone" VARCHAR(13) NOT NULL,
    "customer_email" VARCHAR(320),
    "customer_address" VARCHAR(2000),
    "catalog_source_id" UUID NOT NULL,
    "total_amount" NUMERIC NOT NULL,
    "paid_amount" NUMERIC NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "current_return_decision_id" UUID,
    "current_return_order_version" INTEGER,
    "current_return_reason" VARCHAR(4000),
    "current_returned_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_pieces" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "decoration_entry_id" UUID NOT NULL,
    "price_source_id" UUID NOT NULL,
    "decoration_label" VARCHAR(200) NOT NULL,
    "unit_price" NUMERIC NOT NULL,
    "price_source_cell" VARCHAR(16) NOT NULL,
    "stage" "sales_piece_stage" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "work_state" "sales_piece_work_state" NOT NULL DEFAULT 'INCOMING',
    "issue_id" UUID,
    "received_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(4000),

    CONSTRAINT "sales_order_pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_order_counter" (
    "id" VARCHAR(6) NOT NULL,
    "last_issued" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "business_order_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_business_number_key" ON "sales_orders"("business_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_sequence_key" ON "sales_orders"("number_sequence");

-- CreateIndex
CREATE INDEX "sales_orders_status_submitted_id_idx" ON "sales_orders"("status", "submitted_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_order_pieces_order_stage_received_idx" ON "sales_order_pieces"("order_id", "stage", "received_at", "id");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_id_fkey" FOREIGN KEY ("id") REFERENCES "sales_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_catalog_source_id_fkey" FOREIGN KEY ("catalog_source_id") REFERENCES "catalog_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_id_fkey" FOREIGN KEY ("id") REFERENCES "sales_draft_pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_decoration_source_fkey" FOREIGN KEY ("decoration_entry_id", "price_source_id") REFERENCES "catalog_entries"("id", "source_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_price_source_id_fkey" FOREIGN KEY ("price_source_id") REFERENCES "catalog_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE sales_orders
  ADD CONSTRAINT ck_sales_orders_number CHECK (number_sequence > 0 AND number_year BETWEEN 1 AND 9999 AND business_number ~ '^(SHOP|EXTERNAL|REPAIR|GIFT|READY|ACCESSORY|ADJUSTMENT)-[0-9]{4}-[0-9]{4,19}$'),
  ADD CONSTRAINT ck_sales_orders_money CHECK (
    total_amount >= 0 AND total_amount <= 199999999998.00 AND scale(total_amount) <= 2
    AND paid_amount >= 0 AND paid_amount <= 999999999.99 AND scale(paid_amount) <= 2
  ),
  ADD CONSTRAINT ck_sales_orders_return_proof CHECK (
    (status = 'RETURNED' AND current_return_decision_id IS NOT NULL AND current_return_order_version IS NOT NULL AND current_return_order_version BETWEEN 1 AND 2147483647
      AND current_return_reason IS NOT NULL AND btrim(current_return_reason) <> '' AND current_returned_at IS NOT NULL)
    OR (status <> 'RETURNED' AND current_return_decision_id IS NULL AND current_return_order_version IS NULL
      AND current_return_reason IS NULL AND current_returned_at IS NULL)
  ),
  ADD CONSTRAINT ck_sales_orders_approval_state CHECK (
    status NOT IN ('APPROVED', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED') OR approved_at IS NOT NULL
  );
ALTER TABLE sales_order_pieces
  ADD CONSTRAINT ck_sales_order_piece_money CHECK (unit_price >= 0 AND unit_price <= 999999999.99 AND scale(unit_price) <= 2),
  ADD CONSTRAINT ck_sales_order_piece_receipt CHECK (received_at IS NULL OR stage IN ('WAREHOUSE', 'CANCELLED')),
  ADD CONSTRAINT ck_sales_order_piece_cancellation CHECK (
    (stage = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
    OR (stage <> 'CANCELLED' AND cancelled_at IS NULL AND cancellation_reason IS NULL)
  );
ALTER TABLE business_order_counter ADD CONSTRAINT ck_business_order_counter_singleton CHECK (id = 'global' AND last_issued >= 0);
INSERT INTO business_order_counter(id, last_issued) VALUES ('global', 0);

ALTER TABLE sales_commands DROP CONSTRAINT ck_sales_commands_binding;
ALTER TABLE sales_commands ADD CONSTRAINT ck_sales_commands_binding CHECK (
  ((operation IN ('CREATE_CUSTOMER', 'UPDATE_CUSTOMER') AND customer_id IS NOT NULL AND draft_id IS NULL)
    OR (operation IN ('CREATE_DRAFT', 'SAVE_DRAFT', 'SUBMIT_NEW_ORDER', 'SUBMIT_DRAFT', 'RESUBMIT_ORDER', 'SET_ORDER_PAID') AND draft_id IS NOT NULL AND customer_id IS NULL))
  AND ((operation IN ('CREATE_CUSTOMER', 'CREATE_DRAFT', 'SUBMIT_NEW_ORDER') AND request_target_id IS NULL AND expected_version IS NULL AND before_version IS NULL AND after_version = 1)
    OR (operation IN ('UPDATE_CUSTOMER', 'SAVE_DRAFT', 'SUBMIT_DRAFT', 'RESUBMIT_ORDER', 'SET_ORDER_PAID') AND request_target_id IS NOT NULL AND request_target_id = COALESCE(customer_id, draft_id)
      AND expected_version IS NOT NULL AND before_version IS NOT NULL AND expected_version = before_version AND before_version >= 1 AND after_version = before_version::bigint + 1))
);

CREATE FUNCTION enforce_sales_order_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submitted terms are retained' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_terms_immutable';
  END IF;
  SELECT * INTO root FROM sales_drafts WHERE id = NEW.id;
  IF NOT FOUND OR root.owner_id <> NEW.submitted_by_id OR root.customer_id IS NULL
    OR NEW.business_number <> root.type::text || '-' || lpad(NEW.number_year::text, 4, '0') || '-' || lpad(NEW.number_sequence::text, GREATEST(4, length(NEW.number_sequence::text)), '0')
    OR btrim(NEW.owner_full_name_at_submission) = '' OR btrim(NEW.customer_name) = ''
    OR NEW.customer_phone !~ '^\+966(5[013-9][0-9]{7}|1[123467][0-9]{7})$' THEN
    RAISE EXCEPTION 'Submitted terms do not match the root' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_terms_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.business_number, NEW.number_sequence, NEW.number_year, NEW.submitted_at, NEW.submitted_by_id,
    NEW.owner_full_name_at_submission, NEW.customer_name, NEW.customer_phone, NEW.customer_email, NEW.customer_address, NEW.catalog_source_id)
    IS DISTINCT FROM ROW(OLD.id, OLD.business_number, OLD.number_sequence, OLD.number_year, OLD.submitted_at, OLD.submitted_by_id,
    OLD.owner_full_name_at_submission, OLD.customer_name, OLD.customer_phone, OLD.customer_email, OLD.customer_address, OLD.catalog_source_id) THEN
    RAISE EXCEPTION 'Original submitted terms are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_terms_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_terms_immutable BEFORE INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_terms();

CREATE FUNCTION enforce_submitted_root_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'SUBMITTED' AND ROW(NEW.status, NEW.type, NEW.customer_id, NEW.owner_id, NEW.paid_amount)
    IS DISTINCT FROM ROW(OLD.status, OLD.type, OLD.customer_id, OLD.owner_id, OLD.paid_amount) THEN
    RAISE EXCEPTION 'Submitted root terms are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_terms_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_submitted_root_terms BEFORE UPDATE ON sales_drafts FOR EACH ROW EXECUTE FUNCTION enforce_submitted_root_terms();

CREATE FUNCTION enforce_sales_order_piece_terms() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR entry.display_value IS DISTINCT FROM NEW.decoration_label OR base.decoration IS DISTINCT FROM NEW.decoration_label
    OR entry.unit_price IS DISTINCT FROM NEW.unit_price OR entry.price_source_cell IS DISTINCT FROM NEW.price_source_cell THEN
    RAISE EXCEPTION 'Frozen piece terms do not match the reviewed entry' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_membership';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_piece_terms BEFORE INSERT OR UPDATE OR DELETE ON sales_order_pieces FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_piece_terms();

CREATE FUNCTION prevent_submitted_piece_structure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales_drafts WHERE id = OLD.draft_id AND status = 'SUBMITTED') THEN
    RAISE EXCEPTION 'Submitted piece structure is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_submitted_piece_structure BEFORE UPDATE OF position, quantity, removed_at ON sales_draft_pieces
  FOR EACH ROW EXECUTE FUNCTION prevent_submitted_piece_structure();

CREATE FUNCTION prevent_submitted_decoration_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decoration IS DISTINCT FROM OLD.decoration AND EXISTS (SELECT 1 FROM sales_drafts WHERE id = OLD.draft_id AND status = 'SUBMITTED') THEN
    RAISE EXCEPTION 'Submitted decoration is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_submitted_decoration BEFORE UPDATE ON sales_draft_pieces FOR EACH ROW EXECUTE FUNCTION prevent_submitted_decoration_change();

CREATE FUNCTION check_sales_order_graph(affected_root UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; header sales_orders%ROWTYPE; base_count BIGINT; extension_count BIGINT; active_total NUMERIC;
BEGIN
  SELECT * INTO root FROM sales_drafts WHERE id = affected_root;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO header FROM sales_orders WHERE id = affected_root;
  IF root.status = 'DRAFT' THEN
    IF header.id IS NOT NULL THEN
      RAISE EXCEPTION 'Draft cannot have submitted extensions' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_graph';
    END IF;
    RETURN;
  END IF;
  SELECT count(*) INTO base_count FROM sales_draft_pieces WHERE draft_id = affected_root AND removed_at IS NULL;
  SELECT count(*), COALESCE(sum(unit_price) FILTER (WHERE stage <> 'CANCELLED'), 0) INTO extension_count, active_total
    FROM sales_order_pieces WHERE order_id = affected_root;
  IF header.id IS NULL OR root.customer_id IS NULL OR base_count NOT BETWEEN 1 AND 200 OR extension_count <> base_count
    OR header.total_amount IS DISTINCT FROM active_total
    OR (header.status = 'RETURNED' AND header.current_return_order_version IS DISTINCT FROM root.version)
    OR EXISTS (SELECT 1 FROM sales_draft_pieces p LEFT JOIN sales_order_pieces e ON e.id = p.id AND e.order_id = affected_root
      WHERE p.draft_id = affected_root AND p.removed_at IS NULL AND e.id IS NULL)
    OR EXISTS (SELECT 1 FROM sales_order_pieces e JOIN sales_draft_pieces p ON p.id = e.id
      WHERE e.order_id = affected_root AND (p.draft_id <> affected_root OR p.removed_at IS NOT NULL OR p.quantity <> 1)) THEN
    RAISE EXCEPTION 'Submitted graph is incomplete or inconsistent' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_graph';
  END IF;
END;
$$;
CREATE FUNCTION enforce_sales_order_graph() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected UUID;
BEGIN
  IF TG_TABLE_NAME IN ('sales_drafts', 'sales_orders') THEN
    IF TG_OP = 'DELETE' THEN affected := OLD.id; ELSE affected := NEW.id; END IF;
  ELSIF TG_TABLE_NAME = 'sales_draft_pieces' THEN
    IF TG_OP = 'DELETE' THEN affected := OLD.draft_id; ELSE affected := NEW.draft_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN affected := OLD.order_id; ELSE affected := NEW.order_id; END IF;
  END IF;
  PERFORM check_sales_order_graph(affected);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sales_root_final_graph AFTER INSERT OR UPDATE OR DELETE ON sales_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_graph();
CREATE CONSTRAINT TRIGGER sales_order_final_graph AFTER INSERT OR UPDATE OR DELETE ON sales_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_graph();
CREATE CONSTRAINT TRIGGER sales_base_piece_final_graph AFTER INSERT OR UPDATE OR DELETE ON sales_draft_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_graph();
CREATE CONSTRAINT TRIGGER sales_order_piece_final_graph AFTER INSERT OR UPDATE OR DELETE ON sales_order_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_sales_order_graph();

CREATE FUNCTION prevent_submitted_piece_addition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales_orders WHERE id = NEW.draft_id) THEN
    RAISE EXCEPTION 'Submitted membership is fixed' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_membership';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_submitted_piece_addition BEFORE INSERT ON sales_draft_pieces FOR EACH ROW EXECUTE FUNCTION prevent_submitted_piece_addition();

CREATE FUNCTION prevent_frozen_decoration_selection_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selection sales_piece_catalog_selections%ROWTYPE; frozen UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN selection := OLD; ELSE selection := NEW; END IF;
  SELECT decoration_entry_id INTO frozen FROM sales_order_pieces WHERE id = selection.piece_id;
  IF frozen IS NOT NULL AND selection.field = 'decoration' AND (TG_OP = 'DELETE' OR selection.entry_id IS DISTINCT FROM frozen
    OR (TG_OP = 'UPDATE' AND ROW(NEW.piece_id, NEW.field) IS DISTINCT FROM ROW(OLD.piece_id, OLD.field))) THEN
    RAISE EXCEPTION 'Submitted decoration selection is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_order_piece_terms_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER sales_frozen_decoration_selection BEFORE INSERT OR UPDATE OR DELETE ON sales_piece_catalog_selections FOR EACH ROW EXECUTE FUNCTION prevent_frozen_decoration_selection_change();
