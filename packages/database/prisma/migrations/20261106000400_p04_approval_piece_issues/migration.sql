BEGIN;

-- Refuse legacy pointers without an accepted retained reporting history.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM sales_order_pieces WHERE issue_id IS NOT NULL) THEN
 RAISE EXCEPTION 'Existing issue pointers require reviewed reconciliation' USING ERRCODE='23514', CONSTRAINT='ck_p04_legacy_issue_reconciliation';
 END IF;
END $$;

-- CreateEnum
CREATE TYPE "approval_command_operation" AS ENUM ('APPROVE_INITIAL', 'RETURN_INITIAL', 'REPORT_ISSUE', 'RESOLVE_ISSUE', 'SUBMIT_CONTACT', 'REVIEW_CONTACT');

-- CreateEnum
CREATE TYPE "manufacturing_issue_state" AS ENUM ('APPROVAL_REVIEW', 'SALES_CONTACT', 'REAPPROVAL', 'RESOLVED');

-- CreateEnum
CREATE TYPE "piece_contact_kind" AS ENUM ('AMEND', 'CANCEL_REQUEST');

-- CreateTable
CREATE TABLE "approval_commands" (
    "command_id" UUID NOT NULL,
    "operation" "approval_command_operation" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "order_id" UUID NOT NULL,
    "piece_id" UUID,
    "issue_id" UUID,
    "proposal_id" UUID,
    "expected_version" INTEGER NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "decision" VARCHAR(32),
    "decision_notes" VARCHAR(4000),
    "before_facts" JSONB NOT NULL,
    "after_facts" JSONB NOT NULL,
    "outcome" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateTable
CREATE TABLE "manufacturing_issues" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "state" "manufacturing_issue_state" NOT NULL,
    "source_department" "department" NOT NULL,
    "source_stage" "sales_piece_stage" NOT NULL,
    "source_work_state" "sales_piece_work_state" NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reporter_full_name" VARCHAR(150) NOT NULL,
    "reporter_role" "user_role" NOT NULL,
    "reporter_department" "department",
    "reason" VARCHAR(4000) NOT NULL,
    "notes" VARCHAR(4000),
    "reported_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "reported_command_id" UUID NOT NULL,
    "resume_target" "sales_piece_stage",
    "latest_proposal_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_command_id" UUID,

    CONSTRAINT "manufacturing_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_contact_proposals" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "piece_contact_kind" NOT NULL,
    "submitted_command_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "submitted_by_full_name" VARCHAR(150) NOT NULL,
    "contact_notes" VARCHAR(4000) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "before_model" VARCHAR(200) NOT NULL,
    "before_model_id" UUID,
    "before_size" VARCHAR(200) NOT NULL,
    "before_size_id" UUID,
    "before_leather_base" VARCHAR(200) NOT NULL,
    "before_leather_base_id" UUID,
    "before_sole" VARCHAR(200),
    "before_sole_id" UUID,
    "proposed_model" VARCHAR(200),
    "proposed_model_id" UUID,
    "proposed_size" VARCHAR(200),
    "proposed_size_id" UUID,
    "proposed_leather_base" VARCHAR(200),
    "proposed_leather_base_id" UUID,
    "proposed_sole" VARCHAR(200),
    "proposed_sole_id" UUID,

    CONSTRAINT "piece_contact_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_commands_actor_occurred_id_idx" ON "approval_commands"("actor_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE INDEX "approval_commands_order_occurred_id_idx" ON "approval_commands"("order_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE INDEX "approval_commands_operation_occurred_idx" ON "approval_commands"("operation", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE INDEX "approval_commands_issue_version_idx" ON "approval_commands"("issue_id", "after_version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "approval_commands_order_version_key" ON "approval_commands"("order_id", "after_version");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_issues_reported_command_key" ON "manufacturing_issues"("reported_command_id");

-- CreateIndex
CREATE INDEX "manufacturing_issues_state_reported_id_idx" ON "manufacturing_issues"("state", "reported_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "manufacturing_issues_order_piece_cycle_idx" ON "manufacturing_issues"("order_id", "piece_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_issues_piece_cycle_key" ON "manufacturing_issues"("piece_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_issues_id_order_piece_key" ON "manufacturing_issues"("id", "order_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "piece_contact_proposals_submitted_command_key" ON "piece_contact_proposals"("submitted_command_id");

-- CreateIndex
CREATE INDEX "piece_contact_proposals_issue_sequence_idx" ON "piece_contact_proposals"("issue_id", "sequence" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "piece_contact_proposals_issue_sequence_key" ON "piece_contact_proposals"("issue_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "piece_contact_proposals_id_issue_key" ON "piece_contact_proposals"("id", "issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_pieces_id_order_key" ON "sales_order_pieces"("id", "order_id");

-- AddForeignKey
ALTER TABLE "sales_order_pieces" ADD CONSTRAINT "sales_order_pieces_current_issue_fkey" FOREIGN KEY ("issue_id", "order_id", "id") REFERENCES "manufacturing_issues"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "approval_commands" ADD CONSTRAINT "approval_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_commands" ADD CONSTRAINT "approval_commands_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_commands" ADD CONSTRAINT "approval_commands_issue_fkey" FOREIGN KEY ("issue_id", "order_id", "piece_id") REFERENCES "manufacturing_issues"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "approval_commands" ADD CONSTRAINT "approval_commands_proposal_fkey" FOREIGN KEY ("proposal_id", "issue_id") REFERENCES "piece_contact_proposals"("id", "issue_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_piece_id_order_id_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_reported_command_fkey" FOREIGN KEY ("reported_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_resolution_command_fkey" FOREIGN KEY ("resolution_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_latest_proposal_fkey" FOREIGN KEY ("latest_proposal_id", "id") REFERENCES "piece_contact_proposals"("id", "issue_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_issue_id_order_id_piece_id_fkey" FOREIGN KEY ("issue_id", "order_id", "piece_id") REFERENCES "manufacturing_issues"("id", "order_id", "piece_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_submitted_command_fkey" FOREIGN KEY ("submitted_command_id") REFERENCES "approval_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_before_model_id_fkey" FOREIGN KEY ("before_model_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_before_size_id_fkey" FOREIGN KEY ("before_size_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_before_leather_base_id_fkey" FOREIGN KEY ("before_leather_base_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_before_sole_id_fkey" FOREIGN KEY ("before_sole_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_proposed_model_id_fkey" FOREIGN KEY ("proposed_model_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_proposed_size_id_fkey" FOREIGN KEY ("proposed_size_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_proposed_leather_base_id_fkey" FOREIGN KEY ("proposed_leather_base_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_contact_proposals" ADD CONSTRAINT "piece_contact_proposals_proposed_sole_id_fkey" FOREIGN KEY ("proposed_sole_id") REFERENCES "catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX approval_commands_initial_approval_key ON approval_commands(order_id) WHERE operation='APPROVE_INITIAL';
CREATE UNIQUE INDEX manufacturing_issues_one_open_piece_key ON manufacturing_issues(piece_id) WHERE state<>'RESOLVED';

ALTER TABLE approval_commands
 ADD CONSTRAINT ck_approval_commands_versions CHECK(expected_version=before_version AND before_version BETWEEN 1 AND 2147483646 AND after_version=before_version::bigint+1),
 ADD CONSTRAINT ck_approval_commands_hash CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT ck_approval_commands_binding CHECK (
   (operation IN ('APPROVE_INITIAL','RETURN_INITIAL') AND piece_id IS NULL AND issue_id IS NULL AND proposal_id IS NULL)
   OR (operation IN ('REPORT_ISSUE','RESOLVE_ISSUE') AND piece_id IS NOT NULL AND issue_id IS NOT NULL AND proposal_id IS NULL)
   OR (operation IN ('SUBMIT_CONTACT','REVIEW_CONTACT') AND piece_id IS NOT NULL AND issue_id IS NOT NULL AND proposal_id IS NOT NULL)),
 ADD CONSTRAINT ck_approval_commands_actor CHECK (
   btrim(actor_full_name)<>'' AND (actor_role='ADMIN' OR (actor_department IS NOT NULL AND
     ((operation IN ('APPROVE_INITIAL','RETURN_INITIAL','RESOLVE_ISSUE','REVIEW_CONTACT') AND actor_department='APPROVAL')
      OR (operation='SUBMIT_CONTACT' AND actor_department='SALES')
      OR (operation='REPORT_ISSUE' AND actor_department IN ('CUTTING','PRODUCTION','QUALITY')))))),
 ADD CONSTRAINT ck_approval_commands_decision CHECK (
   (operation='RESOLVE_ISSUE' AND decision IS NOT NULL AND decision IN ('RETURN_TO_DEPARTMENT','SEND_TO_SALES','CANCEL') AND decision_notes IS NOT NULL AND btrim(decision_notes)<>'')
   OR (operation='REVIEW_CONTACT' AND decision IS NOT NULL AND decision IN ('ACCEPT','RETURN_TO_SALES','CANCEL') AND decision_notes IS NOT NULL AND btrim(decision_notes)<>'')
   OR (operation NOT IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND decision IS NULL AND decision_notes IS NULL));

ALTER TABLE manufacturing_issues
 ADD CONSTRAINT ck_manufacturing_issues_source CHECK (
   cycle>0 AND source_department IN ('CUTTING','PRODUCTION','QUALITY') AND source_department::text=source_stage::text
   AND source_work_state IN ('INCOMING','IN_PROGRESS') AND btrim(reason)<>'' AND btrim(reporter_full_name)<>''
   AND (notes IS NULL OR btrim(notes)<>'')
   AND (reporter_role='ADMIN' OR (reporter_department IS NOT NULL AND reporter_department=source_department))),
 ADD CONSTRAINT ck_manufacturing_issues_state CHECK (
   (resume_target IS NULL OR resume_target IN ('CUTTING','PRODUCTION'))
   AND ((state='RESOLVED' AND resolved_at IS NOT NULL AND resolution_command_id IS NOT NULL)
     OR (state<>'RESOLVED' AND resolved_at IS NULL AND resolution_command_id IS NULL))
   AND (state<>'APPROVAL_REVIEW' OR (resume_target IS NULL AND latest_proposal_id IS NULL))
   AND (state NOT IN ('SALES_CONTACT','REAPPROVAL') OR resume_target IS NOT NULL)
   AND (state<>'REAPPROVAL' OR latest_proposal_id IS NOT NULL));

ALTER TABLE piece_contact_proposals ADD CONSTRAINT ck_piece_contact_proposals_values CHECK (
 sequence>0 AND btrim(submitted_by_full_name)<>'' AND btrim(contact_notes)<>''
 AND btrim(before_model)<>'' AND btrim(before_size)<>'' AND btrim(before_leather_base)<>''
 AND (before_sole IS NOT NULL OR before_sole_id IS NULL)
 AND ((kind='AMEND' AND proposed_model IS NOT NULL AND btrim(proposed_model)<>''
   AND proposed_size IS NOT NULL AND btrim(proposed_size)<>''
   AND proposed_leather_base IS NOT NULL AND btrim(proposed_leather_base)<>''
   AND (proposed_sole IS NOT NULL OR proposed_sole_id IS NULL))
 OR (kind='CANCEL_REQUEST' AND proposed_model IS NULL AND proposed_size IS NULL AND proposed_leather_base IS NULL AND proposed_sole IS NULL
   AND proposed_model_id IS NULL AND proposed_size_id IS NULL AND proposed_leather_base_id IS NULL AND proposed_sole_id IS NULL)));

CREATE FUNCTION enforce_approval_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Approval commands are immutable' USING ERRCODE='23514',CONSTRAINT='ck_approval_command_immutable';
END $$;
CREATE TRIGGER approval_command_immutable BEFORE UPDATE OR DELETE ON approval_commands FOR EACH ROW EXECUTE FUNCTION enforce_approval_command_immutable();
CREATE FUNCTION enforce_piece_contact_proposal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Contact proposals are immutable' USING ERRCODE='23514',CONSTRAINT='ck_piece_contact_proposal_immutable';
END $$;
CREATE TRIGGER piece_contact_proposal_immutable BEFORE UPDATE OR DELETE ON piece_contact_proposals FOR EACH ROW EXECUTE FUNCTION enforce_piece_contact_proposal_immutable();

CREATE FUNCTION enforce_manufacturing_issue_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Manufacturing issues are retained' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_source_immutable';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'APPROVAL_REVIEW' OR NEW.resume_target IS NOT NULL OR NEW.latest_proposal_id IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.resolution_command_id IS NOT NULL THEN
     RAISE EXCEPTION 'An issue must begin in approval review' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_transition';
   END IF;
   RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.order_id,NEW.piece_id,NEW.cycle,NEW.source_department,NEW.source_stage,NEW.source_work_state,NEW.reporter_id,NEW.reporter_full_name,NEW.reporter_role,NEW.reporter_department,NEW.reason,NEW.notes,NEW.reported_at,NEW.reported_command_id)
 IS DISTINCT FROM ROW(OLD.id,OLD.order_id,OLD.piece_id,OLD.cycle,OLD.source_department,OLD.source_stage,OLD.source_work_state,OLD.reporter_id,OLD.reporter_full_name,OLD.reporter_role,OLD.reporter_department,OLD.reason,OLD.notes,OLD.reported_at,OLD.reported_command_id) THEN
   RAISE EXCEPTION 'Issue source is immutable' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_source_immutable';
 END IF;
 IF NOT ((OLD.state='APPROVAL_REVIEW' AND NEW.state IN ('SALES_CONTACT','RESOLVED'))
   OR (OLD.state='SALES_CONTACT' AND NEW.state='REAPPROVAL')
   OR (OLD.state='REAPPROVAL' AND NEW.state IN ('SALES_CONTACT','RESOLVED')))
   OR (OLD.resume_target IS NOT NULL AND NEW.resume_target IS DISTINCT FROM OLD.resume_target)
   OR (OLD.state='REAPPROVAL' AND NEW.latest_proposal_id IS DISTINCT FROM OLD.latest_proposal_id)
   OR (OLD.state='SALES_CONTACT' AND (NEW.latest_proposal_id IS NULL OR NEW.latest_proposal_id IS NOT DISTINCT FROM OLD.latest_proposal_id)) THEN
   RAISE EXCEPTION 'Illegal issue transition' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_transition';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manufacturing_issue_retained BEFORE DELETE ON manufacturing_issues FOR EACH ROW EXECUTE FUNCTION enforce_manufacturing_issue_transition();
CREATE TRIGGER manufacturing_issue_transition BEFORE INSERT OR UPDATE ON manufacturing_issues FOR EACH ROW EXECUTE FUNCTION enforce_manufacturing_issue_transition();

CREATE FUNCTION check_piece_contact_proposal_bindings(proposal_id UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p piece_contact_proposals%ROWTYPE; c approval_commands%ROWTYPE; selection RECORD;
BEGIN
 SELECT * INTO p FROM piece_contact_proposals WHERE id=proposal_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO c FROM approval_commands WHERE command_id=p.submitted_command_id;
 IF c.command_id IS NULL OR c.operation<>'SUBMIT_CONTACT'
   OR ROW(c.order_id,c.piece_id,c.issue_id,c.proposal_id,c.actor_id,c.actor_full_name,c.occurred_at)
     IS DISTINCT FROM ROW(p.order_id,p.piece_id,p.issue_id,p.id,p.submitted_by_id,p.submitted_by_full_name,p.submitted_at)
   OR p.submitted_by_id IS DISTINCT FROM (SELECT owner_id FROM sales_drafts WHERE id=p.order_id) THEN
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

CREATE FUNCTION check_approval_order_graph(affected_order UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r sales_drafts%ROWTYPE; h sales_orders%ROWTYPE; i manufacturing_issues%ROWTYPE; c approval_commands%ROWTYPE; p piece_contact_proposals%ROWTYPE;
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
 FOR i IN SELECT * FROM manufacturing_issues WHERE order_id=affected_order LOOP
   SELECT * INTO c FROM approval_commands WHERE command_id=i.reported_command_id;
   IF c.command_id IS NULL OR c.operation<>'REPORT_ISSUE' OR ROW(c.order_id,c.piece_id,c.issue_id,c.actor_id,c.actor_full_name,c.actor_role,c.actor_department,c.occurred_at)
   IS DISTINCT FROM ROW(i.order_id,i.piece_id,i.id,i.reporter_id,i.reporter_full_name,i.reporter_role,i.reporter_department,i.reported_at)
   OR (c.actor_role<>'ADMIN' AND c.actor_department IS DISTINCT FROM i.source_department) THEN
     RAISE EXCEPTION 'Issue report witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
   IF i.state='RESOLVED' AND NOT EXISTS (SELECT 1 FROM approval_commands d WHERE d.command_id=i.resolution_command_id AND d.order_id=i.order_id AND d.piece_id=i.piece_id AND d.issue_id=i.id AND d.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND d.occurred_at=i.resolved_at AND d.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT','CANCEL')) THEN
     RAISE EXCEPTION 'Issue resolution witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
   IF i.latest_proposal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM piece_contact_proposals last WHERE last.id=i.latest_proposal_id AND last.issue_id=i.id AND NOT EXISTS (SELECT 1 FROM piece_contact_proposals newer WHERE newer.issue_id=i.id AND newer.sequence>last.sequence)) THEN
     RAISE EXCEPTION 'Latest proposal pointer is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
 END LOOP;
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

CREATE FUNCTION enforce_approval_order_graph() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME IN ('sales_drafts','sales_orders') THEN
   PERFORM check_approval_order_graph(NEW.id);
 ELSE
   PERFORM check_approval_order_graph(NEW.order_id);
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p04_root_final_graph AFTER UPDATE ON sales_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();
CREATE CONSTRAINT TRIGGER p04_order_final_graph AFTER UPDATE ON sales_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();
CREATE CONSTRAINT TRIGGER p04_piece_final_graph AFTER UPDATE ON sales_order_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();
CREATE CONSTRAINT TRIGGER p04_issue_final_graph AFTER INSERT OR UPDATE ON manufacturing_issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();
CREATE CONSTRAINT TRIGGER p04_proposal_final_graph AFTER INSERT ON piece_contact_proposals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();
CREATE CONSTRAINT TRIGGER p04_command_final_graph AFTER INSERT ON approval_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_approval_order_graph();

CREATE FUNCTION enforce_p04_initial_transition_witness() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_drafts%ROWTYPE;
BEGIN
 SELECT * INTO r FROM sales_drafts WHERE id=NEW.id;
 IF TG_NAME='p04_initial_approval_binding' AND NEW.approved_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.approved_at IS DISTINCT FROM NEW.approved_at) THEN
   -- Preserve the existing graph failure before requiring the new decision witness.
   PERFORM check_sales_order_graph(NEW.id);
   IF NOT EXISTS (
     SELECT 1 FROM approval_commands c WHERE c.order_id=NEW.id AND c.operation='APPROVE_INITIAL' AND c.after_version=r.version AND c.occurred_at=NEW.approved_at
   ) THEN
     RAISE EXCEPTION 'New approval requires its actual command witness' USING ERRCODE='23514',CONSTRAINT='ck_p04_initial_approval_binding';
   END IF;
 END IF;
 IF TG_NAME='p04_return_decision_binding' AND NEW.current_return_decision_id IS NOT NULL AND (TG_OP='INSERT' OR ROW(OLD.current_return_decision_id,OLD.current_return_order_version,OLD.current_return_reason,OLD.current_returned_at)
     IS DISTINCT FROM ROW(NEW.current_return_decision_id,NEW.current_return_order_version,NEW.current_return_reason,NEW.current_returned_at)) THEN
   PERFORM check_sales_order_graph(NEW.id);
   IF NOT EXISTS (
     SELECT 1 FROM approval_commands c WHERE c.command_id=NEW.current_return_decision_id AND c.order_id=NEW.id AND c.operation='RETURN_INITIAL'
       AND c.after_version=NEW.current_return_order_version AND c.after_version=r.version AND c.occurred_at=NEW.current_returned_at AND c.after_facts#>>'{currentReturn,reason}'=NEW.current_return_reason
   ) THEN
     RAISE EXCEPTION 'New return requires its actual command witness' USING ERRCODE='23514',CONSTRAINT='ck_p04_return_decision_binding';
   END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p04_initial_approval_binding AFTER INSERT OR UPDATE ON sales_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p04_initial_transition_witness();
CREATE CONSTRAINT TRIGGER p04_return_decision_binding AFTER INSERT OR UPDATE ON sales_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p04_initial_transition_witness();

CREATE FUNCTION enforce_p04_issue_transition_witness() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE witness approval_commands%ROWTYPE; r sales_drafts%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM sales_drafts WHERE id=NEW.order_id;
 SELECT * INTO witness FROM approval_commands WHERE order_id=NEW.order_id AND after_version=r.version;
 IF witness.command_id IS NULL OR ROW(witness.piece_id,witness.issue_id) IS DISTINCT FROM ROW(NEW.piece_id,NEW.id)
   OR (OLD.state='APPROVAL_REVIEW' AND (witness.operation<>'RESOLVE_ISSUE'
     OR (NEW.state='SALES_CONTACT' AND witness.decision<>'SEND_TO_SALES')
     OR (NEW.state='RESOLVED' AND witness.decision NOT IN ('RETURN_TO_DEPARTMENT','CANCEL'))))
   OR (OLD.state='SALES_CONTACT' AND (witness.operation<>'SUBMIT_CONTACT' OR witness.proposal_id IS DISTINCT FROM NEW.latest_proposal_id
     OR NOT EXISTS (SELECT 1 FROM piece_contact_proposals next WHERE next.id=NEW.latest_proposal_id AND next.issue_id=NEW.id
       AND next.sequence>COALESCE((SELECT sequence FROM piece_contact_proposals WHERE id=OLD.latest_proposal_id),0))))
   OR (OLD.state='REAPPROVAL' AND (witness.operation<>'REVIEW_CONTACT' OR witness.proposal_id IS DISTINCT FROM OLD.latest_proposal_id
     OR (NEW.state='SALES_CONTACT' AND witness.decision<>'RETURN_TO_SALES')
     OR (NEW.state='RESOLVED' AND witness.decision NOT IN ('ACCEPT','CANCEL')))) THEN
   RAISE EXCEPTION 'Issue transition lacks its matching command' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_transition';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER p04_issue_transition_binding AFTER UPDATE ON manufacturing_issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p04_issue_transition_witness();

CREATE FUNCTION enforce_p04_command_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r sales_drafts%ROWTYPE; h sales_orders%ROWTYPE; piece sales_order_pieces%ROWTYPE; issue manufacturing_issues%ROWTYPE; proposal piece_contact_proposals%ROWTYPE; fact JSONB;
DECLARE actual_total NUMERIC; actual_paid NUMERIC; expected_counts JSONB; labels JSONB; references_json JSONB;
BEGIN
 SELECT * INTO r FROM sales_drafts WHERE id=NEW.order_id;
 SELECT * INTO h FROM sales_orders WHERE id=NEW.order_id;
 IF r.version IS DISTINCT FROM NEW.after_version OR h.id IS NULL
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
CREATE CONSTRAINT TRIGGER p04_command_head_binding AFTER INSERT ON approval_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p04_command_head();

COMMIT;
