BEGIN;

-- AlterTable
ALTER TABLE "manufacturing_issues" ADD COLUMN     "resolution_administration_command_id" UUID;

-- AlterTable
ALTER TABLE "manufacturing_work_visits" ADD COLUMN     "end_administration_command_id" UUID;

-- AlterTable
ALTER TABLE "quality_work_visits" ADD COLUMN     "end_administration_command_id" UUID;

-- AlterTable
ALTER TABLE "quality_correction_cycles" ADD COLUMN     "resolution_administration_command_id" UUID;

-- CreateTable
CREATE TABLE "administration_commands" (
    "command_id" UUID NOT NULL,
    "operation" "administration_operation" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "order_id" UUID NOT NULL,
    "expected_version" INTEGER NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "reason" VARCHAR(4000) NOT NULL,
    "scope" "administration_cancellation_scope",
    "piece_ids" UUID[] NOT NULL,
    "before_facts" JSONB NOT NULL,
    "after_facts" JSONB NOT NULL,
    "outcome" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "administration_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateTable
CREATE TABLE "administration_cancelled_pieces" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "before_facts" JSONB NOT NULL,
    "after_facts" JSONB NOT NULL,

    CONSTRAINT "administration_cancelled_pieces_pkey" PRIMARY KEY ("command_id","piece_id")
);

-- CreateTable
CREATE TABLE "administration_order_corrections" (
    "command_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "after_version" INTEGER NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_phone" VARCHAR(13) NOT NULL,
    "customer_email" VARCHAR(320),
    "customer_address" VARCHAR(2000),
    "before_values" JSONB NOT NULL,
    "after_values" JSONB NOT NULL,
    "changed_fields" TEXT[] NOT NULL,

    CONSTRAINT "administration_order_corrections_pkey" PRIMARY KEY ("command_id")
);

-- CreateIndex
CREATE INDEX "administration_commands_order_time_id_idx" ON "administration_commands"("order_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE INDEX "administration_commands_actor_time_id_idx" ON "administration_commands"("actor_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "administration_commands_command_order_key" ON "administration_commands"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "administration_commands_order_version_key" ON "administration_commands"("order_id", "after_version");

-- CreateIndex
CREATE UNIQUE INDEX "administration_cancelled_pieces_piece_key" ON "administration_cancelled_pieces"("piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "administration_cancelled_pieces_piece_order_key" ON "administration_cancelled_pieces"("piece_id", "order_id");

-- CreateIndex
CREATE INDEX "administration_order_corrections_order_version_idx" ON "administration_order_corrections"("order_id", "after_version" DESC, "command_id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "administration_order_corrections_command_order_key" ON "administration_order_corrections"("command_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "administration_order_corrections_order_version_key" ON "administration_order_corrections"("order_id", "after_version");

-- CreateIndex
CREATE INDEX "sales_drafts_created_id_idx" ON "sales_drafts"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_drafts_owner_created_id_idx" ON "sales_drafts"("owner_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "manufacturing_issues" ADD CONSTRAINT "manufacturing_issues_resolution_administration_command_id_fkey" FOREIGN KEY ("resolution_administration_command_id") REFERENCES "administration_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "manufacturing_work_visits" ADD CONSTRAINT "manufacturing_work_visits_end_administration_command_id_fkey" FOREIGN KEY ("end_administration_command_id") REFERENCES "administration_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_work_visits" ADD CONSTRAINT "quality_work_visits_end_administration_command_id_fkey" FOREIGN KEY ("end_administration_command_id") REFERENCES "administration_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "quality_correction_cycles" ADD CONSTRAINT "quality_correction_cycles_resolution_administration_comman_fkey" FOREIGN KEY ("resolution_administration_command_id") REFERENCES "administration_commands"("command_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_commands" ADD CONSTRAINT "administration_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_commands" ADD CONSTRAINT "administration_commands_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_cancelled_pieces" ADD CONSTRAINT "administration_cancelled_pieces_command_order_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "administration_commands"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_cancelled_pieces" ADD CONSTRAINT "administration_cancelled_pieces_piece_order_fkey" FOREIGN KEY ("piece_id", "order_id") REFERENCES "sales_order_pieces"("id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_order_corrections" ADD CONSTRAINT "administration_order_corrections_command_order_fkey" FOREIGN KEY ("command_id", "order_id") REFERENCES "administration_commands"("command_id", "order_id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "administration_order_corrections" ADD CONSTRAINT "administration_order_corrections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;


CREATE FUNCTION p08_has_exact_keys(document JSONB, expected TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(document)='object' THEN
   (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(document) key)
     IS NOT DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(expected) key)
 ELSE false END
$$;

CREATE FUNCTION p08_valid_correction(document JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field_name TEXT;
BEGIN
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

CREATE FUNCTION p08_valid_facts(facts JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE piece JSONB; counts JSONB; money JSONB; proof JSONB; field_name TEXT;
 original_count INTEGER; cancelled_count INTEGER:=0; received_count INTEGER:=0; active_count INTEGER; expected_progress INTEGER;
 total NUMERIC; paid NUMERIC;
BEGIN
 IF p08_has_exact_keys(facts,ARRAY['version','status','counts','money','correction','pieces','returnProof']) IS NOT TRUE
   OR jsonb_typeof(facts->'version') IS DISTINCT FROM 'number' OR (facts->>'version')::numeric NOT BETWEEN 1 AND 2147483647
   OR (facts->>'version')::numeric<>trunc((facts->>'version')::numeric)
   OR (facts->>'status' IN ('AWAITING_APPROVAL','RETURNED','APPROVED','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED','CANCELLED')) IS NOT TRUE
   OR p08_valid_correction(facts->'correction') IS NOT TRUE OR jsonb_typeof(facts->'pieces') IS DISTINCT FROM 'array'
 THEN RETURN false; END IF;
 original_count:=jsonb_array_length(facts->'pieces');
 IF original_count NOT BETWEEN 1 AND 200 OR original_count<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(facts->'pieces')) THEN RETURN false; END IF;
 FOR piece IN SELECT value FROM jsonb_array_elements(facts->'pieces') LOOP
   IF p08_has_exact_keys(piece,ARRAY['id','stage','workState','issueId','currentWorkVisitId','receivedAt','cancelledAt','cancellationReason']) IS NOT TRUE
     OR jsonb_typeof(piece->'id') IS DISTINCT FROM 'string' OR (piece->>'id')::uuid IS NULL
     OR (piece->>'stage' IN ('AWAITING_APPROVAL','CUTTING','PRODUCTION','QUALITY','WAREHOUSE','CANCELLED')) IS NOT TRUE
     OR (piece->>'workState' IN ('INCOMING','IN_PROGRESS','COMPLETED','BLOCKED')) IS NOT TRUE THEN RETURN false; END IF;
   FOREACH field_name IN ARRAY ARRAY['issueId','currentWorkVisitId'] LOOP
     IF piece->field_name<>'null'::jsonb AND (jsonb_typeof(piece->field_name)<>'string' OR (piece->>field_name)::uuid IS NULL) THEN RETURN false; END IF;
   END LOOP;
   FOREACH field_name IN ARRAY ARRAY['receivedAt','cancelledAt'] LOOP
     IF piece->field_name<>'null'::jsonb AND (jsonb_typeof(piece->field_name)<>'string' OR (piece->>field_name)::timestamptz IS NULL OR NOT isfinite((piece->>field_name)::timestamptz) OR piece->>field_name !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$') THEN RETURN false; END IF;
   END LOOP;
   IF piece->>'stage'='CANCELLED' THEN
     cancelled_count:=cancelled_count+1;
     IF (piece->>'workState'='BLOCKED' AND piece->'issueId'='null'::jsonb AND piece->'currentWorkVisitId'='null'::jsonb
       AND jsonb_typeof(piece->'cancelledAt')='string' AND jsonb_typeof(piece->'cancellationReason')='string'
       AND length(btrim(piece->>'cancellationReason')) BETWEEN 1 AND 4000) IS NOT TRUE THEN RETURN false; END IF;
   ELSE
     IF piece->'cancelledAt' IS DISTINCT FROM 'null'::jsonb OR piece->'cancellationReason' IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
     IF piece->'receivedAt'<>'null'::jsonb THEN received_count:=received_count+1; END IF;
   END IF;
 END LOOP;
 counts:=facts->'counts'; active_count:=original_count-cancelled_count;
 expected_progress:=CASE WHEN active_count=0 THEN 0 WHEN received_count=active_count THEN 100 ELSE LEAST(99,round(received_count::numeric*100/active_count)) END;
 IF p08_has_exact_keys(counts,ARRAY['original','cancelled','active','received','completionPercent']) IS NOT TRUE
   OR counts IS DISTINCT FROM jsonb_build_object('original',original_count,'cancelled',cancelled_count,'active',active_count,'received',received_count,'completionPercent',expected_progress)
 THEN RETURN false; END IF;
 money:=facts->'money';
 IF p08_has_exact_keys(money,ARRAY['total','paidAmount','remainingDue','surplus']) IS NOT TRUE THEN RETURN false; END IF;
 FOREACH field_name IN ARRAY ARRAY['total','paidAmount','remainingDue','surplus'] LOOP
   IF (jsonb_typeof(money->field_name)='string' AND money->>field_name ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{2}$') IS NOT TRUE THEN RETURN false; END IF;
 END LOOP;
 total:=(money->>'total')::numeric; paid:=(money->>'paidAmount')::numeric;
 IF total>199999999998.00 OR paid>999999999.99 OR (money->>'surplus')::numeric>999999999.99
   OR (money->>'remainingDue')::numeric<>GREATEST(total-paid,0) OR (money->>'surplus')::numeric<>GREATEST(paid-total,0)
   OR (active_count=0 AND (facts->>'status'<>'CANCELLED' OR total<>0)) OR (active_count>0 AND facts->>'status'='CANCELLED') THEN RETURN false; END IF;
 proof:=facts->'returnProof';
 IF facts->>'status'='RETURNED' THEN
   IF p08_has_exact_keys(proof,ARRAY['decisionId','reason','returnedAt','version']) IS NOT TRUE
     OR jsonb_typeof(proof->'decisionId') IS DISTINCT FROM 'string' OR (proof->>'decisionId')::uuid IS NULL
     OR jsonb_typeof(proof->'reason') IS DISTINCT FROM 'string' OR length(btrim(proof->>'reason')) NOT BETWEEN 1 AND 4000
     OR jsonb_typeof(proof->'returnedAt') IS DISTINCT FROM 'string' OR (proof->>'returnedAt')::timestamptz IS NULL OR NOT isfinite((proof->>'returnedAt')::timestamptz) OR proof->>'returnedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR proof->'version' IS DISTINCT FROM facts->'version' THEN RETURN false; END IF;
 ELSIF proof IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RETURN false;
END $$;

ALTER TABLE administration_commands ADD CONSTRAINT ck_administration_command_shape CHECK (
 actor_role='ADMIN' AND before_version BETWEEN 1 AND 2147483646 AND before_version=expected_version
 AND after_version::bigint=before_version::bigint+1 AND length(btrim(actor_full_name)) BETWEEN 1 AND 150
 AND length(btrim(reason)) BETWEEN 1 AND 4000 AND isfinite(occurred_at) AND payload_hash ~ '^[0-9a-f]{64}$'
 AND p08_valid_facts(before_facts) AND p08_valid_facts(after_facts)
 AND before_facts->'version'=to_jsonb(before_version) AND after_facts->'version'=to_jsonb(after_version)
 AND jsonb_typeof(outcome)='object' AND (
   (operation='ADMIN_CORRECT' AND scope IS NULL AND cardinality(piece_ids)=0)
   OR (operation='ADMIN_CANCEL' AND scope IS NOT NULL AND cardinality(piece_ids) BETWEEN 1 AND 200 AND (scope<>'ITEM' OR cardinality(piece_ids)=1))
 )
);
ALTER TABLE administration_order_corrections ADD CONSTRAINT ck_administration_correction_values CHECK (
 p08_valid_correction(before_values) AND p08_valid_correction(after_values) AND before_values<>after_values
 AND after_values->>'customerName'=customer_name AND after_values->>'customerPhone'=customer_phone
 AND (after_values->>'customerEmail') IS NOT DISTINCT FROM customer_email AND (after_values->>'customerAddress') IS NOT DISTINCT FROM customer_address
 AND cardinality(changed_fields) BETWEEN 1 AND 5
);

CREATE FUNCTION enforce_p08_administration_retained() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Administrative history is immutable' USING ERRCODE='23514',CONSTRAINT='ck_administration_retained';
END $$;
CREATE TRIGGER p08_commands_retained BEFORE UPDATE OR DELETE ON administration_commands FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_retained();
CREATE TRIGGER p08_cancelled_pieces_retained BEFORE UPDATE OR DELETE ON administration_cancelled_pieces FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_retained();
CREATE TRIGGER p08_corrections_retained BEFORE UPDATE OR DELETE ON administration_order_corrections FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_retained();


CREATE FUNCTION p08_facts_match_current(order_key UUID, facts JSONB) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
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
 IF facts->'correction' IS DISTINCT FROM jsonb_build_object('generalNotes',root.general_notes,
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

CREATE FUNCTION enforce_p08_administration_before() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root_version INTEGER;
BEGIN
 -- B06 inserts the parent before effects; validate its before facts while that state still exists.
 PERFORM 1 FROM users u WHERE u.id=NEW.actor_id AND u.role='ADMIN' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
   AND ROW(u.full_name,u.role,u.department) IS NOT DISTINCT FROM ROW(NEW.actor_full_name,NEW.actor_role,NEW.actor_department) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrative actor snapshot must match current authority' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_shape'; END IF;
 SELECT version INTO root_version FROM sales_drafts WHERE id=NEW.order_id FOR UPDATE;
 IF root_version IS DISTINCT FROM NEW.before_version OR p08_facts_match_current(NEW.order_id,NEW.before_facts) IS NOT TRUE THEN
   RAISE EXCEPTION 'Administrative before facts must match the locked current order' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph';
 END IF;
 IF NEW.piece_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM unnest(NEW.piece_ids) id ORDER BY id)
   OR EXISTS(SELECT 1 FROM unnest(NEW.piece_ids) AS selected(piece_id) LEFT JOIN sales_order_pieces p ON p.id=selected.piece_id AND p.order_id=NEW.order_id WHERE p.id IS NULL OR p.stage='CANCELLED')
 THEN RAISE EXCEPTION 'Administrative selection must identify exact distinct active pieces' USING ERRCODE='23514',CONSTRAINT='ck_administration_piece_binding'; END IF;
 IF NEW.operation='ADMIN_CANCEL' AND (
   NEW.before_facts->>'status' IN ('OUT_FOR_DELIVERY','DELIVERED')
   OR (NEW.scope='ORDER' AND NEW.piece_ids IS DISTINCT FROM ARRAY(SELECT id FROM sales_order_pieces WHERE order_id=NEW.order_id AND stage<>'CANCELLED' ORDER BY id))
   OR EXISTS(SELECT 1 FROM warehouse_delivery_attempts a WHERE a.order_id=NEW.order_id
     AND NOT EXISTS(SELECT 1 FROM warehouse_delivery_attempts newer WHERE newer.order_id=a.order_id AND newer.number>a.number)
     AND NOT EXISTS(SELECT 1 FROM warehouse_delivery_outcomes outcome WHERE outcome.attempt_id=a.id))
 ) THEN RAISE EXCEPTION 'Administrative cancellation cannot replace scope or cancel current custody' USING ERRCODE='23514',CONSTRAINT='ck_administration_piece_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p08_command_before BEFORE INSERT ON administration_commands FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_before();

CREATE FUNCTION check_p08_administration_command(command_key UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE command administration_commands%ROWTYPE; correction administration_order_corrections%ROWTYPE; child administration_cancelled_pieces%ROWTYPE;
 expected JSONB; expected_fields TEXT[]; before_piece JSONB; after_piece JSONB; receipt JSONB;
BEGIN
 SELECT * INTO command FROM administration_commands WHERE command_id=command_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrative child requires its retained command' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph'; END IF;
 IF p08_facts_match_current(command.order_id,command.after_facts) IS NOT TRUE
   OR command.before_facts#>'{money,paidAmount}' IS DISTINCT FROM command.after_facts#>'{money,paidAmount}'
   OR command.before_facts#>'{counts,original}' IS DISTINCT FROM command.after_facts#>'{counts,original}'
   OR (SELECT array_agg(value->>'id' ORDER BY ord) FROM jsonb_array_elements(command.before_facts->'pieces') WITH ORDINALITY j(value,ord)) IS DISTINCT FROM (SELECT array_agg(value->>'id' ORDER BY ord) FROM jsonb_array_elements(command.after_facts->'pieces') WITH ORDINALITY j(value,ord))
 THEN RAISE EXCEPTION 'Administrative after facts must match the complete committed graph' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph'; END IF;
 receipt:=command.outcome->'receipt';
 expected:=jsonb_build_object('orderId',command.order_id,'version',command.after_version,'status',command.after_facts->'status',
   'counts',command.after_facts->'counts','money',command.after_facts->'money','correction',command.after_facts->'correction','pieceIds',to_jsonb(command.piece_ids));
 IF p08_has_exact_keys(command.outcome,ARRAY['receipt','replayed','result','before','after']) IS NOT TRUE
   OR p08_has_exact_keys(receipt,ARRAY['commandId','operation','orderId','beforeVersion','afterVersion','actor','occurredAt']) IS NOT TRUE
   OR receipt->>'commandId' IS DISTINCT FROM command.command_id::text OR receipt->>'operation' IS DISTINCT FROM command.operation::text
   OR receipt->>'orderId' IS DISTINCT FROM command.order_id::text OR receipt->'beforeVersion' IS DISTINCT FROM to_jsonb(command.before_version)
   OR receipt->'afterVersion' IS DISTINCT FROM to_jsonb(command.after_version)
   OR receipt->'actor' IS DISTINCT FROM jsonb_build_object('id',command.actor_id,'fullName',command.actor_full_name,'role',command.actor_role,'department',command.actor_department)
   OR (jsonb_typeof(receipt->'occurredAt')='string' AND receipt->>'occurredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$') IS NOT TRUE OR (receipt->>'occurredAt')::timestamptz IS DISTINCT FROM command.occurred_at
   OR command.outcome->'replayed' IS DISTINCT FROM 'false'::jsonb OR command.outcome->'result' IS DISTINCT FROM expected
   OR command.outcome->'before' IS DISTINCT FROM command.before_facts OR command.outcome->'after' IS DISTINCT FROM command.after_facts
 THEN RAISE EXCEPTION 'Administrative retained result must bind its exact receipt and effects' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_shape'; END IF;
 SELECT * INTO correction FROM administration_order_corrections WHERE command_id=command_key;
 IF command.operation='ADMIN_CORRECT' THEN
   SELECT array_agg(key ORDER BY key) INTO expected_fields FROM jsonb_each(command.before_facts->'correction')
     WHERE value IS DISTINCT FROM command.after_facts->'correction'->key;
   IF correction.command_id IS NULL OR correction.order_id<>command.order_id OR correction.after_version<>command.after_version
     OR correction.before_values IS DISTINCT FROM command.before_facts->'correction' OR correction.after_values IS DISTINCT FROM command.after_facts->'correction'
     OR correction.changed_fields IS DISTINCT FROM expected_fields
     OR command.before_facts->'pieces' IS DISTINCT FROM command.after_facts->'pieces'
     OR command.before_facts->'status' IS DISTINCT FROM command.after_facts->'status'
     OR command.before_facts->'money' IS DISTINCT FROM command.after_facts->'money'
     OR EXISTS(SELECT 1 FROM administration_cancelled_pieces WHERE command_id=command_key)
   THEN RAISE EXCEPTION 'Correction must contain exactly the permitted changed values' USING ERRCODE='23514',CONSTRAINT='ck_administration_correction_values'; END IF;
 ELSE
   IF correction.command_id IS NOT NULL OR command.before_facts->'correction' IS DISTINCT FROM command.after_facts->'correction'
     OR command.piece_ids IS DISTINCT FROM ARRAY(SELECT piece_id FROM administration_cancelled_pieces WHERE command_id=command_key ORDER BY piece_id)
   THEN RAISE EXCEPTION 'Cancellation must retain exactly its selected child graph' USING ERRCODE='23514',CONSTRAINT='ck_administration_piece_binding'; END IF;
   FOR child IN SELECT * FROM administration_cancelled_pieces WHERE command_id=command_key LOOP
     SELECT value INTO before_piece FROM jsonb_array_elements(command.before_facts->'pieces') WHERE value->>'id'=child.piece_id::text;
     SELECT value INTO after_piece FROM jsonb_array_elements(command.after_facts->'pieces') WHERE value->>'id'=child.piece_id::text;
     IF child.order_id<>command.order_id OR child.before_facts IS DISTINCT FROM before_piece OR child.after_facts IS DISTINCT FROM after_piece
       OR (before_piece->>'stage'<>'CANCELLED' AND after_piece->>'stage'='CANCELLED' AND after_piece->>'workState'='BLOCKED'
         AND after_piece->'issueId'='null'::jsonb AND after_piece->'currentWorkVisitId'='null'::jsonb
         AND (after_piece->>'cancelledAt')::timestamptz=command.occurred_at AND after_piece->>'cancellationReason'=command.reason
         AND after_piece->'receivedAt'=before_piece->'receivedAt') IS NOT TRUE
     THEN RAISE EXCEPTION 'Cancellation child must witness its exact physical transition' USING ERRCODE='23514',CONSTRAINT='ck_administration_piece_binding'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(command.before_facts->'pieces') b
     FULL JOIN jsonb_array_elements(command.after_facts->'pieces') a ON a->>'id'=b->>'id'
     WHERE b IS NULL OR a IS NULL OR (NOT (b->>'id')::uuid=ANY(command.piece_ids) AND b IS DISTINCT FROM a))
   THEN RAISE EXCEPTION 'Unselected companions must remain unchanged' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph'; END IF;
 END IF;
 IF command.after_facts->>'status'='RETURNED' AND NOT p08_return_chain_matches(command.order_id) THEN RAISE EXCEPTION 'Current return must retain its contiguous administrative chain' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph'; END IF;
 IF command.after_facts->>'status'='RETURNED' AND ((command.before_facts->'returnProof')-'version') IS DISTINCT FROM ((command.after_facts->'returnProof')-'version') THEN
   RAISE EXCEPTION 'Administrative action cannot invent a return decision' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_graph'; END IF;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Administrative retained JSON has invalid typed fields' USING ERRCODE='23514',CONSTRAINT='ck_administration_command_shape';
END $$;

CREATE FUNCTION enforce_p08_administration_graph() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM check_p08_administration_command(NEW.command_id);
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER p08_command_graph AFTER INSERT ON administration_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_graph();
CREATE CONSTRAINT TRIGGER p08_cancelled_piece_graph AFTER INSERT ON administration_cancelled_pieces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_graph();
CREATE CONSTRAINT TRIGGER p08_correction_graph AFTER INSERT ON administration_order_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p08_administration_graph();

CREATE FUNCTION enforce_p08_order_note_witness() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root_version INTEGER;
BEGIN
 IF OLD.general_notes IS NOT DISTINCT FROM NEW.general_notes OR OLD.status<>'SUBMITTED' OR NEW.status<>'SUBMITTED' THEN RETURN NULL; END IF;
 SELECT version INTO root_version FROM sales_drafts WHERE id=NEW.id;
 IF root_version::bigint=OLD.version::bigint+1 AND (
   EXISTS(SELECT 1 FROM administration_commands c WHERE c.order_id=NEW.id AND c.operation='ADMIN_CORRECT' AND c.before_version=OLD.version AND c.after_version=root_version
     AND c.before_facts#>>'{correction,generalNotes}' IS NOT DISTINCT FROM OLD.general_notes AND c.after_facts#>>'{correction,generalNotes}' IS NOT DISTINCT FROM NEW.general_notes)
   OR EXISTS(SELECT 1 FROM sales_commands c WHERE c.draft_id=NEW.id AND c.operation='RESUBMIT_ORDER' AND c.before_version=OLD.version AND c.after_version=root_version
     AND c.before->>'generalNotes' IS NOT DISTINCT FROM OLD.general_notes AND c.after->>'generalNotes' IS NOT DISTINCT FROM NEW.general_notes)
 ) THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Submitted order note requires its exact next-version witness' USING ERRCODE='23514',CONSTRAINT='ck_administration_order_note_witness';
END $$;
CREATE CONSTRAINT TRIGGER p08_order_note_witness AFTER UPDATE ON sales_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_p08_order_note_witness();

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
   UNION ALL SELECT command_id FROM administration_commands WHERE order_id=NEW.id AND after_version=NEW.version
 ) heads;
 IF NEW.version::bigint<>OLD.version::bigint+1 OR witnesses<>1 THEN
   RAISE EXCEPTION 'Submitted root requires one exact next-version witness' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_command_graph';
 END IF;
 RETURN NULL;
END $$;


CREATE FUNCTION p08_return_chain_matches(order_key UUID) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; header sales_orders%ROWTYPE; decision approval_commands%ROWTYPE; chain_count BIGINT;
BEGIN
 SELECT * INTO root FROM sales_drafts WHERE id=order_key;
 SELECT * INTO header FROM sales_orders WHERE id=order_key;
 SELECT * INTO decision FROM approval_commands WHERE command_id=header.current_return_decision_id;
 IF decision.command_id IS NULL OR decision.operation<>'RETURN_INITIAL' OR decision.order_id<>order_key
   OR header.status<>'RETURNED' OR header.current_return_order_version IS DISTINCT FROM root.version
   OR decision.after_version>root.version OR decision.occurred_at IS DISTINCT FROM header.current_returned_at
   OR decision.after_facts#>>'{currentReturn,reason}' IS DISTINCT FROM header.current_return_reason
 THEN RETURN false; END IF;
 SELECT count(*) INTO chain_count FROM administration_commands a WHERE a.order_id=order_key
   AND a.after_version>decision.after_version AND a.after_version<=root.version
   AND a.before_facts->>'status'='RETURNED' AND a.after_facts->>'status'='RETURNED'
   AND a.before_facts#>>'{returnProof,decisionId}'=decision.command_id::text AND a.after_facts#>>'{returnProof,decisionId}'=decision.command_id::text
   AND a.before_facts#>>'{returnProof,reason}'=header.current_return_reason AND a.after_facts#>>'{returnProof,reason}'=header.current_return_reason
   AND (a.before_facts#>>'{returnProof,returnedAt}')::timestamptz=header.current_returned_at
   AND (a.after_facts#>>'{returnProof,returnedAt}')::timestamptz=header.current_returned_at;
 IF chain_count<>root.version::bigint-decision.after_version THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM (
   SELECT after_version FROM sales_commands WHERE draft_id=order_key
   UNION ALL SELECT after_version FROM approval_commands WHERE order_id=order_key
   UNION ALL SELECT after_version FROM manufacturing_command_orders WHERE order_id=order_key
   UNION ALL SELECT after_version FROM quality_command_orders WHERE order_id=order_key
   UNION ALL SELECT after_version FROM warehouse_command_orders WHERE order_id=order_key
 ) other WHERE other.after_version>decision.after_version AND other.after_version<=root.version) THEN RETURN false; END IF;
 RETURN true;
END $$;

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
 IF EXISTS(SELECT 1 FROM manufacturing_issues i WHERE i.order_id=affected_order AND (i.state='RESOLVED' AND i.resolution_administration_command_id IS NULL AND NOT EXISTS (SELECT 1 FROM approval_commands d WHERE d.command_id=i.resolution_command_id AND d.order_id=i.order_id AND d.piece_id=i.piece_id AND d.issue_id=i.id AND d.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND d.occurred_at=i.resolved_at AND d.decision IN ('RETURN_TO_DEPARTMENT','ACCEPT','CANCEL')))) THEN
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
   IF c.command_id IS NOT NULL AND (c.operation<>'RETURN_INITIAL' OR c.order_id<>affected_order OR NOT p08_return_chain_matches(affected_order)
     OR c.occurred_at IS DISTINCT FROM h.current_returned_at OR c.after_facts#>>'{currentReturn,reason}' IS DISTINCT FROM h.current_return_reason) THEN
     RAISE EXCEPTION 'Current return witness is invalid' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph';
   END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM manufacturing_issues i WHERE i.order_id=affected_order AND i.resolution_administration_command_id IS NOT NULL
   AND (NOT p08_cancellation_source_matches(i.resolution_administration_command_id,i.order_id,i.piece_id,i.resolved_at)
     OR NOT EXISTS(SELECT 1 FROM administration_cancelled_pieces child WHERE child.command_id=i.resolution_administration_command_id
       AND child.piece_id=i.piece_id AND child.before_facts->>'issueId'=i.id::text)))
 THEN RAISE EXCEPTION 'Issue cancellation requires its selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_approval_order_graph'; END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_p04_initial_transition_witness() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF NOT p08_return_chain_matches(NEW.id) THEN
     RAISE EXCEPTION 'New return requires its actual command witness' USING ERRCODE='23514',CONSTRAINT='ck_p04_return_decision_binding';
   END IF;
 END IF;
 RETURN NULL;
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

CREATE OR REPLACE FUNCTION enforce_p05_piece_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root sales_drafts%ROWTYPE; c approval_commands%ROWTYPE; before_piece JSONB; after_piece JSONB;
DECLARE current_visit manufacturing_work_visits%ROWTYPE; a administration_commands%ROWTYPE; cancel_child administration_cancelled_pieces%ROWTYPE;
BEGIN
 IF ROW(OLD.stage,OLD.work_state,OLD.issue_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
   IS NOT DISTINCT FROM ROW(NEW.stage,NEW.work_state,NEW.issue_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason) THEN RETURN NULL; END IF;
 SELECT * INTO root FROM sales_drafts WHERE id=NEW.order_id;
 IF OLD.stage='CANCELLED' THEN
   RAISE EXCEPTION 'Cancelled physical rows cannot be reactivated' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_event_binding';
 END IF;
 SELECT parent.* INTO a FROM administration_commands parent WHERE parent.order_id=NEW.order_id AND parent.after_version=root.version AND parent.operation='ADMIN_CANCEL';
 IF a.command_id IS NOT NULL AND OLD.stage IN ('AWAITING_APPROVAL','CUTTING','PRODUCTION','QUALITY','WAREHOUSE') AND NEW.stage='CANCELLED' THEN
   SELECT * INTO cancel_child FROM administration_cancelled_pieces WHERE command_id=a.command_id AND piece_id=NEW.id AND order_id=NEW.order_id;
   before_piece:=cancel_child.before_facts; after_piece:=cancel_child.after_facts;
   IF cancel_child.command_id IS NOT NULL AND NEW.id=ANY(a.piece_ids)
     AND ROW(before_piece->>'stage',before_piece->>'workState',(before_piece->>'issueId')::uuid,(before_piece->>'currentWorkVisitId')::uuid,(before_piece->>'receivedAt')::timestamptz,(before_piece->>'cancelledAt')::timestamptz,before_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(OLD.stage::text,OLD.work_state::text,OLD.issue_id,OLD.current_work_visit_id,OLD.received_at,OLD.cancelled_at,OLD.cancellation_reason)
     AND ROW(after_piece->>'stage',after_piece->>'workState',(after_piece->>'issueId')::uuid,(after_piece->>'currentWorkVisitId')::uuid,(after_piece->>'receivedAt')::timestamptz,(after_piece->>'cancelledAt')::timestamptz,after_piece->>'cancellationReason')
       IS NOT DISTINCT FROM ROW(NEW.stage::text,NEW.work_state::text,NEW.issue_id,NEW.current_work_visit_id,NEW.received_at,NEW.cancelled_at,NEW.cancellation_reason)
   THEN RETURN NULL; END IF;
 END IF;

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


-- One retained administrative child is the terminal witness for each selected physical piece.
CREATE FUNCTION p08_cancellation_source_matches(command_key UUID, order_key UUID, piece_key UUID, terminal_time TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM administration_commands c JOIN administration_cancelled_pieces child
 ON child.command_id=c.command_id AND child.order_id=c.order_id
 WHERE c.command_id=command_key AND c.operation='ADMIN_CANCEL' AND c.order_id=order_key
 AND child.piece_id=piece_key AND piece_key=ANY(c.piece_ids) AND c.occurred_at=terminal_time
 AND child.after_facts->>'stage'='CANCELLED'
 AND (child.after_facts->>'cancelledAt')::timestamptz=terminal_time)
$$;

ALTER TABLE manufacturing_work_visits DROP CONSTRAINT ck_manufacturing_visit_times;
ALTER TABLE manufacturing_work_visits ADD CONSTRAINT ck_manufacturing_visit_times CHECK ((
 (received_at IS NULL)=(received_command_id IS NULL)
 AND (started_at IS NULL)=(started_command_id IS NULL)
 AND (NOT legacy_unknown_start OR (received_at IS NULL AND started_at IS NULL))
 AND (entered_at IS NULL OR started_at IS NULL OR entered_at<=started_at)
 AND (ended_at IS NULL OR entered_at IS NULL OR ended_at>=entered_at)
 AND (ended_at IS NULL OR started_at IS NULL OR ended_at>=started_at)
 AND CASE
 WHEN ended_at IS NULL THEN end_reason IS NULL AND num_nonnulls(end_manufacturing_command_id,end_approval_command_id,end_administration_command_id)=0 AND destination IS NULL
 WHEN end_reason='TRANSFERRED' THEN end_manufacturing_command_id IS NOT NULL AND end_approval_command_id IS NULL AND end_administration_command_id IS NULL
   AND destination=CASE department WHEN 'CUTTING' THEN 'PRODUCTION'::department ELSE 'QUALITY'::department END
 WHEN end_reason='ISSUE_REPORTED' THEN end_approval_command_id IS NOT NULL AND end_manufacturing_command_id IS NULL AND end_administration_command_id IS NULL AND destination IS NULL
 WHEN end_reason='CANCELLED' THEN num_nonnulls(end_approval_command_id,end_administration_command_id)=1 AND end_manufacturing_command_id IS NULL AND destination IS NULL
 ELSE false END
) IS TRUE);
ALTER TABLE quality_work_visits DROP CONSTRAINT ck_quality_visit_shape;
ALTER TABLE quality_work_visits ADD CONSTRAINT ck_quality_visit_shape CHECK ((
 sequence>=1
 AND ((origin_kind='PRODUCTION_ARRIVAL' AND source_production_event_id IS NOT NULL AND entered_at IS NOT NULL)
 OR (origin_kind='LEGACY_BASELINE' AND source_production_event_id IS NULL AND entered_at IS NULL))
 AND ((legacy_unknown_start AND received_at IS NULL AND started_at IS NULL AND started_command_id IS NULL)
 OR (NOT legacy_unknown_start AND received_at IS NOT NULL AND started_at IS NOT NULL AND received_at=started_at AND started_command_id IS NOT NULL))
 AND ((ended_at IS NULL AND end_reason IS NULL AND num_nonnulls(end_quality_event_id,end_approval_command_id,end_administration_command_id)=0)
 OR (ended_at IS NOT NULL AND CASE
 WHEN end_reason IN ('INSPECT_ACCEPTED','INSPECT_REJECTED') THEN end_quality_event_id IS NOT NULL AND end_approval_command_id IS NULL AND end_administration_command_id IS NULL
 WHEN end_reason='ISSUE_REPORTED' THEN end_quality_event_id IS NULL AND end_approval_command_id IS NOT NULL AND end_administration_command_id IS NULL
 WHEN end_reason='CANCELLED' THEN end_quality_event_id IS NULL AND end_approval_command_id IS NULL AND end_administration_command_id IS NOT NULL
 ELSE false END))
) IS TRUE);
ALTER TABLE quality_correction_cycles DROP CONSTRAINT ck_quality_correction_shape;
ALTER TABLE quality_correction_cycles ADD CONSTRAINT ck_quality_correction_shape CHECK ((
 cycle>=1 AND target IN ('CUTTING','PRODUCTION') AND reason !~ '^[[:space:]]*$' AND instructions !~ '^[[:space:]]*$'
 AND CASE
 WHEN state='OPEN' THEN resolved_at IS NULL AND num_nonnulls(resolution_quality_event_id,resolution_approval_command_id,resolution_administration_command_id)=0
 WHEN state IN ('ACCEPTED','REJECTED') THEN resolved_at IS NOT NULL AND resolution_quality_event_id IS NOT NULL AND resolution_approval_command_id IS NULL AND resolution_administration_command_id IS NULL
 WHEN state='CANCELLED' THEN resolved_at IS NOT NULL AND resolution_quality_event_id IS NULL AND num_nonnulls(resolution_approval_command_id,resolution_administration_command_id)=1
 ELSE false END
) IS TRUE);
ALTER TABLE manufacturing_issues DROP CONSTRAINT ck_manufacturing_issues_state;
ALTER TABLE manufacturing_issues ADD CONSTRAINT ck_manufacturing_issues_state CHECK ((
 (resume_target IS NULL OR resume_target IN ('CUTTING','PRODUCTION'))
 AND ((state='RESOLVED' AND resolved_at IS NOT NULL AND num_nonnulls(resolution_command_id,resolution_administration_command_id)=1)
 OR (state<>'RESOLVED' AND resolved_at IS NULL AND num_nonnulls(resolution_command_id,resolution_administration_command_id)=0))
 AND (state<>'APPROVAL_REVIEW' OR (resume_target IS NULL AND latest_proposal_id IS NULL))
 AND (state NOT IN ('SALES_CONTACT','REAPPROVAL') OR resume_target IS NOT NULL)
 AND (state<>'REAPPROVAL' OR latest_proposal_id IS NOT NULL)
) IS TRUE);

CREATE OR REPLACE FUNCTION enforce_manufacturing_issue_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Manufacturing issues are retained' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_source_immutable';
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.state<>'APPROVAL_REVIEW' OR NEW.resume_target IS NOT NULL OR NEW.latest_proposal_id IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.resolution_command_id IS NOT NULL OR NEW.resolution_administration_command_id IS NOT NULL THEN
     RAISE EXCEPTION 'An issue must begin in approval review' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_transition';
   END IF;
   RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.order_id,NEW.piece_id,NEW.cycle,NEW.source_department,NEW.source_stage,NEW.source_work_state,NEW.reporter_id,NEW.reporter_full_name,NEW.reporter_role,NEW.reporter_department,NEW.reason,NEW.notes,NEW.reported_at,NEW.reported_command_id)
 IS DISTINCT FROM ROW(OLD.id,OLD.order_id,OLD.piece_id,OLD.cycle,OLD.source_department,OLD.source_stage,OLD.source_work_state,OLD.reporter_id,OLD.reporter_full_name,OLD.reporter_role,OLD.reporter_department,OLD.reason,OLD.notes,OLD.reported_at,OLD.reported_command_id) THEN
   RAISE EXCEPTION 'Issue source is immutable' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_issue_source_immutable';
 END IF;
 IF OLD.state IN ('APPROVAL_REVIEW','SALES_CONTACT','REAPPROVAL') AND NEW.state='RESOLVED' AND NEW.resolution_administration_command_id IS NOT NULL
   AND p08_cancellation_source_matches(NEW.resolution_administration_command_id,NEW.order_id,NEW.piece_id,NEW.resolved_at)
   AND NEW.resolution_command_id IS NULL
   AND ROW(OLD.resume_target,OLD.latest_proposal_id) IS NOT DISTINCT FROM ROW(NEW.resume_target,NEW.latest_proposal_id)
   AND EXISTS(SELECT 1 FROM administration_cancelled_pieces child WHERE child.command_id=NEW.resolution_administration_command_id
     AND child.piece_id=NEW.piece_id AND child.before_facts->>'issueId'=NEW.id::text)
 THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION enforce_p04_issue_transition_witness() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE witness approval_commands%ROWTYPE; r sales_drafts%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM sales_drafts WHERE id=NEW.order_id;
 IF NEW.resolution_administration_command_id IS NOT NULL AND NEW.state='RESOLVED'
   AND p08_cancellation_source_matches(NEW.resolution_administration_command_id,NEW.order_id,NEW.piece_id,NEW.resolved_at)
   AND EXISTS(SELECT 1 FROM administration_commands c WHERE c.command_id=NEW.resolution_administration_command_id AND c.after_version=r.version)
   AND ROW(OLD.resume_target,OLD.latest_proposal_id) IS NOT DISTINCT FROM ROW(NEW.resume_target,NEW.latest_proposal_id)
 THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION enforce_p06_quality_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME NOT IN ('quality_work_visits','quality_correction_cycles') THEN
   RAISE EXCEPTION 'Quality history is retained' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
 END IF;
 IF TG_TABLE_NAME='quality_work_visits' THEN
   IF (to_jsonb(OLD)-ARRAY['ended_at','end_reason','end_quality_event_id','end_approval_command_id','end_administration_command_id'])
       IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['ended_at','end_reason','end_quality_event_id','end_approval_command_id','end_administration_command_id'])
     OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
     RAISE EXCEPTION 'Quality original work and terminal endpoint are immutable' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
   END IF;
 ELSE
   IF (to_jsonb(OLD)-ARRAY['state','resolved_at','resolution_quality_event_id','resolution_approval_command_id','resolution_administration_command_id'])
       IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','resolved_at','resolution_quality_event_id','resolution_approval_command_id','resolution_administration_command_id'])
     OR OLD.state<>'OPEN' OR NEW.state='OPEN' THEN
     RAISE EXCEPTION 'Quality rejection facts and terminal outcome are immutable' USING ERRCODE='23514',CONSTRAINT='ck_quality_retained';
   END IF;
 END IF;
 RETURN NEW;
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
 IF EXISTS(SELECT 1 FROM manufacturing_work_visits v WHERE v.order_id=affected_order AND v.end_administration_command_id IS NOT NULL
   AND (NOT p08_cancellation_source_matches(v.end_administration_command_id,v.order_id,v.piece_id,v.ended_at)
     OR NOT EXISTS(SELECT 1 FROM administration_cancelled_pieces child WHERE child.command_id=v.end_administration_command_id
       AND child.piece_id=v.piece_id AND child.before_facts->>'currentWorkVisitId'=v.id::text)))
 THEN RAISE EXCEPTION 'Manufacturing cancellation requires its selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_manufacturing_visit_times'; END IF;
 FOR command_key IN SELECT command_id FROM manufacturing_command_orders WHERE order_id=affected_order LOOP
   PERFORM check_p05_manufacturing_command(command_key);
 END LOOP;
END $$;

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
 IF EXISTS(SELECT 1 FROM quality_work_visits WHERE order_id=order_key AND end_administration_command_id IS NOT NULL
   GROUP BY piece_id,end_administration_command_id HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'One current quality visit may close under each selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS(SELECT 1 FROM quality_correction_cycles WHERE order_id=order_key AND resolution_administration_command_id IS NOT NULL
   GROUP BY piece_id,resolution_administration_command_id HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'One current quality cycle may close under each selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_quality_correction_graph'; END IF;
 IF EXISTS(SELECT 1 FROM quality_work_visits v WHERE v.order_id=order_key AND v.end_administration_command_id IS NOT NULL
   AND (NOT p08_cancellation_source_matches(v.end_administration_command_id,v.order_id,v.piece_id,v.ended_at)
     OR NOT EXISTS(SELECT 1 FROM administration_cancelled_pieces child WHERE child.command_id=v.end_administration_command_id
       AND child.piece_id=v.piece_id AND child.before_facts->>'stage'='QUALITY' AND child.before_facts->>'workState'='IN_PROGRESS')))
 THEN RAISE EXCEPTION 'Quality cancellation requires its selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_quality_visit_source'; END IF;
 IF EXISTS(SELECT 1 FROM quality_correction_cycles cycle WHERE cycle.order_id=order_key AND cycle.resolution_administration_command_id IS NOT NULL
   AND NOT p08_cancellation_source_matches(cycle.resolution_administration_command_id,cycle.order_id,cycle.piece_id,cycle.resolved_at))
 THEN RAISE EXCEPTION 'Quality cycle cancellation requires its selected administrative source' USING ERRCODE='23514',CONSTRAINT='ck_quality_correction_graph'; END IF;
END $$;


-- Only later exact administrative cancellation can remove a physically returned failed member.
CREATE FUNCTION p08_failed_member_cancelled(attempt_key UUID,piece_key UUID,through_version INTEGER)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM warehouse_delivery_attempts attempt
 JOIN warehouse_delivery_outcomes failed ON failed.attempt_id=attempt.id AND failed.order_id=attempt.order_id
 JOIN warehouse_commands failed_command ON failed_command.command_id=failed.command_id
 JOIN warehouse_command_orders failed_group ON failed_group.command_id=failed.command_id AND failed_group.order_id=attempt.order_id
 JOIN administration_cancelled_pieces child ON child.order_id=attempt.order_id AND child.piece_id=piece_key
 JOIN administration_commands cancellation ON cancellation.command_id=child.command_id AND cancellation.order_id=child.order_id
 WHERE attempt.id=attempt_key AND failed.kind='FAILED' AND failed.returned_to_warehouse
 AND cancellation.operation='ADMIN_CANCEL' AND cancellation.before_version>=failed_group.after_version
 AND cancellation.after_version<=through_version AND cancellation.occurred_at>=failed_command.occurred_at
 AND child.before_facts->>'stage'='WAREHOUSE' AND child.before_facts->'receivedAt'<>'null'::jsonb
 AND p08_cancellation_source_matches(cancellation.command_id,attempt.order_id,piece_key,cancellation.occurred_at))
$$;

CREATE OR REPLACE FUNCTION check_p07_warehouse_order_state(order_key UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE head sales_orders%ROWTYPE; active_count INTEGER; received_count INTEGER;
  latest warehouse_delivery_attempts%ROWTYPE; terminal warehouse_delivery_outcomes%ROWTYPE;
  retried warehouse_delivery_retries%ROWTYPE; root_version INTEGER;
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
 SELECT version INTO root_version FROM sales_drafts WHERE id=order_key;
 IF EXISTS(SELECT 1 FROM sales_order_pieces p WHERE p.order_id=order_key AND p.stage<>'CANCELLED'
     AND NOT EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m WHERE m.attempt_id=latest.id AND m.piece_id=p.id AND m.order_id=p.order_id))
   OR EXISTS(SELECT 1 FROM warehouse_delivery_attempt_members m JOIN sales_order_pieces p ON p.id=m.piece_id AND p.order_id=m.order_id
     WHERE m.attempt_id=latest.id AND p.stage='CANCELLED' AND NOT p08_failed_member_cancelled(latest.id,p.id,root_version))
 THEN RAISE EXCEPTION 'Current attempt requires complete active membership and exact later cancelled members' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
 SELECT * INTO terminal FROM warehouse_delivery_outcomes WHERE attempt_id=latest.id;
 SELECT * INTO retried FROM warehouse_delivery_retries WHERE attempt_id=latest.id;
 IF head.status::text IS DISTINCT FROM (CASE WHEN active_count=0 AND terminal.kind='FAILED' AND terminal.returned_to_warehouse THEN 'CANCELLED' WHEN terminal.id IS NULL THEN 'OUT_FOR_DELIVERY'
   WHEN terminal.kind='DELIVERED' THEN 'DELIVERED' WHEN retried.id IS NULL THEN 'DELIVERY_FAILED' ELSE 'READY_FOR_DELIVERY' END)
 THEN RAISE EXCEPTION 'Current order and latest delivery attempt disagree' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_order_state'; END IF;
END $$;

CREATE OR REPLACE FUNCTION check_p07_warehouse_command(command_key UUID) RETURNS VOID LANGUAGE plpgsql AS $$
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
           (SELECT t.attempt_id FROM warehouse_delivery_retries t WHERE t.command_id=command_key AND t.order_id=group_row.order_id))
           AND (command.operation<>'RETRY_DELIVERY' OR NOT p08_failed_member_cancelled(m.attempt_id,m.piece_id,group_row.before_version)))
     THEN RAISE EXCEPTION 'Outcome or retry requires its complete original attempt' USING ERRCODE='23514',CONSTRAINT='ck_warehouse_attempt_graph'; END IF;
   END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION enforce_p07_order_transition() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root_version INTEGER; required_operation warehouse_operation;
BEGIN
 IF OLD.status=NEW.status THEN RETURN NULL; END IF;
 IF OLD.status NOT IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED')
   AND NEW.status NOT IN ('READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED') THEN RETURN NULL; END IF;
 SELECT version INTO root_version FROM sales_drafts WHERE id=NEW.id;
 IF OLD.status NOT IN ('OUT_FOR_DELIVERY','DELIVERED') AND EXISTS(
   SELECT 1 FROM administration_commands c WHERE c.order_id=NEW.id AND c.after_version=root_version AND c.operation='ADMIN_CANCEL'
     AND c.before_facts->>'status'=OLD.status::text AND c.after_facts->>'status'=NEW.status::text
     AND NEW.status::text=(CASE WHEN (c.after_facts#>>'{counts,active}')::int=0 THEN 'CANCELLED'
       WHEN OLD.status='APPROVED' AND (c.after_facts#>>'{counts,active}')::int=(c.after_facts#>>'{counts,received}')::int THEN 'READY_FOR_DELIVERY'
       ELSE OLD.status::text END))
 THEN PERFORM check_p07_warehouse_order_state(NEW.id); RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION enforce_p07_root_current_state() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM administration_commands c WHERE c.order_id=NEW.id AND c.after_version=NEW.version)
   OR EXISTS(SELECT 1 FROM warehouse_command_orders g WHERE g.order_id=NEW.id AND g.after_version=NEW.version)
   OR EXISTS(SELECT 1 FROM approval_commands c WHERE c.order_id=NEW.id AND c.after_version=NEW.version AND c.operation IN ('RESOLVE_ISSUE','REVIEW_CONTACT') AND c.decision='CANCEL' AND c.outcome->>'pieceStage'='CANCELLED')
 THEN PERFORM check_p07_warehouse_order_state(NEW.id); END IF;
 RETURN NEW;
END $$;

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
