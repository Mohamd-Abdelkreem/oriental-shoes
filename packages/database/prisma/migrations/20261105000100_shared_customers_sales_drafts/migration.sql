-- CreateEnum
CREATE TYPE "sales_order_type" AS ENUM ('SHOP', 'EXTERNAL', 'REPAIR', 'GIFT', 'READY', 'ACCESSORY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "sales_draft_status" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "sales_command_operation" AS ENUM ('CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'CREATE_DRAFT', 'SAVE_DRAFT');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(13) NOT NULL,
    "email" VARCHAR(320),
    "address" VARCHAR(2000),
    "notes" VARCHAR(4000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_drafts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "customer_id" UUID,
    "type" "sales_order_type" NOT NULL,
    "status" "sales_draft_status" NOT NULL DEFAULT 'DRAFT',
    "delivery_date" DATE,
    "general_notes" VARCHAR(4000),
    "repair_note" VARCHAR(4000),
    "adjustment_requested" VARCHAR(4000),
    "adjustment_reason" VARCHAR(4000),
    "adjustment_action_taken" VARCHAR(4000),
    "responsible_signature" VARCHAR(150),
    "paid_amount" DECIMAL(11,2),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_draft_pieces" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "model" VARCHAR(200),
    "size" VARCHAR(200),
    "leather_base" VARCHAR(200),
    "decoration" VARCHAR(200),
    "decoration_color" VARCHAR(200),
    "face_right" VARCHAR(200),
    "face_left" VARCHAR(200),
    "mixing" VARCHAR(200),
    "face" VARCHAR(200),
    "sole" VARCHAR(200),
    "sole_addition" VARCHAR(200),
    "sole_color" VARCHAR(200),
    "additions" VARCHAR(200),
    "a_field" VARCHAR(200),
    "f_field" VARCHAR(200),
    "side_notes" VARCHAR(4000),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_draft_pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_commands" (
    "command_id" UUID NOT NULL,
    "operation" "sales_command_operation" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_department" "department",
    "request_target_id" UUID,
    "customer_id" UUID,
    "draft_id" UUID,
    "expected_version" INTEGER,
    "before_version" INTEGER,
    "after_version" INTEGER NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_commands_pkey" PRIMARY KEY ("command_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_created_id_idx" ON "customers"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_drafts_owner_updated_id_idx" ON "sales_drafts"("owner_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_drafts_customer_owner_updated_id_idx" ON "sales_drafts"("customer_id", "owner_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_drafts_updated_id_idx" ON "sales_drafts"("updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sales_draft_pieces_draft_removed_position_idx" ON "sales_draft_pieces"("draft_id", "removed_at", "position");

-- CreateIndex
CREATE INDEX "sales_commands_draft_occurred_id_idx" ON "sales_commands"("draft_id", "occurred_at" DESC, "command_id" DESC);

-- CreateIndex
CREATE INDEX "sales_commands_actor_occurred_id_idx" ON "sales_commands"("actor_id", "occurred_at" DESC, "command_id" DESC);

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_draft_pieces" ADD CONSTRAINT "sales_draft_pieces_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "sales_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_commands" ADD CONSTRAINT "sales_commands_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_commands" ADD CONSTRAINT "sales_commands_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_commands" ADD CONSTRAINT "sales_commands_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "sales_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- P02 invariants not representable in the Prisma datamodel.
-- PostgreSQL text values inherently reject NUL; no chr(0) expression is used.
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_phone_saudi CHECK (phone ~ '^\+966(5[013-9][0-9]{7}|1[123467][0-9]{7})$'),
  ADD CONSTRAINT ck_customers_name_nonblank CHECK (name <> '' AND name !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT ck_customers_email_normalized CHECK (email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  ADD CONSTRAINT ck_customers_version CHECK (version BETWEEN 1 AND 2147483647);
ALTER TABLE sales_drafts
  ADD CONSTRAINT ck_sales_drafts_version CHECK (version BETWEEN 1 AND 2147483647),
  ADD CONSTRAINT ck_sales_drafts_paid_amount CHECK (paid_amount IS NULL OR paid_amount >= 0);
ALTER TABLE sales_draft_pieces
  ADD CONSTRAINT ck_sales_draft_pieces_quantity CHECK (quantity = 1),
  ADD CONSTRAINT ck_sales_draft_pieces_position CHECK (position > 0);
CREATE UNIQUE INDEX sales_draft_pieces_active_position_key ON sales_draft_pieces(draft_id, position) WHERE removed_at IS NULL;
ALTER TABLE sales_commands
  ADD CONSTRAINT ck_sales_commands_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_sales_commands_binding CHECK (
    ((operation IN ('CREATE_CUSTOMER', 'UPDATE_CUSTOMER') AND customer_id IS NOT NULL AND draft_id IS NULL)
      OR (operation IN ('CREATE_DRAFT', 'SAVE_DRAFT') AND draft_id IS NOT NULL AND customer_id IS NULL))
    AND ((operation IN ('CREATE_CUSTOMER', 'CREATE_DRAFT') AND request_target_id IS NULL AND expected_version IS NULL AND before_version IS NULL AND after_version = 1)
      OR (operation IN ('UPDATE_CUSTOMER', 'SAVE_DRAFT') AND request_target_id IS NOT NULL AND request_target_id = COALESCE(customer_id, draft_id)
        AND expected_version IS NOT NULL AND before_version IS NOT NULL AND expected_version = before_version AND before_version >= 1 AND after_version = before_version::bigint + 1))
  );
CREATE UNIQUE INDEX sales_commands_customer_version_key ON sales_commands(customer_id, after_version) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX sales_commands_draft_version_key ON sales_commands(draft_id, after_version) WHERE draft_id IS NOT NULL;

CREATE FUNCTION enforce_sales_draft_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Draft identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_draft_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_draft_identity_immutable BEFORE UPDATE ON sales_drafts FOR EACH ROW EXECUTE FUNCTION enforce_sales_draft_identity();

CREATE FUNCTION enforce_sales_draft_piece_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.draft_id IS DISTINCT FROM OLD.draft_id OR OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Piece identity and removed rows are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_draft_piece_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_draft_piece_identity_immutable BEFORE UPDATE ON sales_draft_pieces FOR EACH ROW EXECUTE FUNCTION enforce_sales_draft_piece_identity();

CREATE FUNCTION enforce_sales_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Retained commands are immutable' USING ERRCODE = '23514', CONSTRAINT = 'ck_sales_command_immutable';
END;
$$;
CREATE TRIGGER sales_command_immutable BEFORE UPDATE OR DELETE ON sales_commands FOR EACH ROW EXECUTE FUNCTION enforce_sales_command_immutable();
