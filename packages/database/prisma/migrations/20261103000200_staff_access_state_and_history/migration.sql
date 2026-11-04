-- Employee assignment state, the retained staff decision history and the restricted
-- initial-administrator receipt.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "department" "department";
ALTER TABLE "users" ADD COLUMN "staff_approved_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "staff_approved_by_id" UUID;
ALTER TABLE "users" ADD COLUMN "access_version" INTEGER NOT NULL DEFAULT 0;

-- Preflight the named verification/status invariant before any account row is modified.
-- A contradictory legacy administrator (or any other contradictory identity) stops the
-- migration with a count for explicit operator review instead of being silently
-- promoted, reassigned or re-verified.
DO $$
DECLARE
  anomaly_count INTEGER;
BEGIN
  SELECT count(*)
    INTO anomaly_count
    FROM "users"
   WHERE ("status" = 'PENDING_VERIFICATION') <> ("email_verified_at" IS NULL);

  IF anomaly_count > 0 THEN
    RAISE EXCEPTION
      'ck_users_verification_state_consistent preflight failed: % account row(s) carry a verification/status combination that requires explicit operator review',
      anomaly_count
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;

-- Backfill ordinary employees. A verified, non-suspended legacy USER becomes
-- PENDING_APPROVAL with no department and no approval evidence. Unverified rows keep
-- PENDING_VERIFICATION and suspended rows keep SUSPENDED. No employee is approved,
-- promoted or assigned to a department by this migration, and no staff decision is
-- fabricated. Administrator rows keep their existing role, state and verification.
UPDATE "users"
   SET "status" = 'PENDING_APPROVAL'
 WHERE "role" = 'USER'
   AND "status" = 'ACTIVE'
   AND "email_verified_at" IS NOT NULL;

-- CreateTable
CREATE TABLE "staff_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "command_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "target_full_name" VARCHAR(150) NOT NULL,
    "target_email" VARCHAR(320) NOT NULL,
    "actor_full_name" VARCHAR(150) NOT NULL,
    "actor_role" "user_role" NOT NULL,
    "actor_status" "user_status" NOT NULL,
    "actor_email_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "operation" "staff_operation" NOT NULL,
    "action" "staff_decision_action" NOT NULL,
    "requested_department" "department",
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,
    "before_status" "user_status" NOT NULL,
    "after_status" "user_status" NOT NULL,
    "before_department" "department",
    "after_department" "department",
    "before_approved_at" TIMESTAMPTZ(6),
    "after_approved_at" TIMESTAMPTZ(6),
    "before_approved_by_id" UUID,
    "after_approved_by_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initial_administrator_provisioning" (
    "id" VARCHAR(13) NOT NULL,
    "target_id" UUID NOT NULL,
    "operator_reference" VARCHAR(128) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "before_version" INTEGER NOT NULL,
    "after_version" INTEGER NOT NULL,

    CONSTRAINT "initial_administrator_provisioning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_decisions_command_id_key" ON "staff_decisions"("command_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_decisions_target_version_key" ON "staff_decisions"("target_id", "after_version");

-- CreateIndex
CREATE INDEX "staff_decisions_target_occurred_id_idx" ON "staff_decisions"("target_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "initial_administrator_provisioning_target_id_key" ON "initial_administrator_provisioning"("target_id");

-- CreateIndex
CREATE INDEX "users_created_id_idx" ON "users"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "users_role_status_created_id_idx" ON "users"("role", "status", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_approved_by_id_fkey" FOREIGN KEY ("staff_approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_decisions" ADD CONSTRAINT "staff_decisions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_decisions" ADD CONSTRAINT "staff_decisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initial_administrator_provisioning" ADD CONSTRAINT "initial_administrator_provisioning_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_staff_approval_pair"
  CHECK (("staff_approved_at" IS NULL) = ("staff_approved_by_id" IS NULL));

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_access_version_nonnegative"
  CHECK ("access_version" >= 0);

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_verification_state_consistent"
  CHECK (("status" = 'PENDING_VERIFICATION') = ("email_verified_at" IS NULL));

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_staff_access_consistent"
  CHECK (
    CASE
      WHEN "role" = 'ADMIN' THEN
        "department" IS NULL
        AND "staff_approved_at" IS NULL
        AND "staff_approved_by_id" IS NULL
        AND "status" NOT IN ('PENDING_APPROVAL', 'REJECTED')
      WHEN "status" IN ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'REJECTED') THEN
        "department" IS NULL
        AND "staff_approved_at" IS NULL
        AND "staff_approved_by_id" IS NULL
      WHEN "status" = 'ACTIVE' THEN
        "department" IS NOT NULL
        AND "staff_approved_at" IS NOT NULL
        AND "staff_approved_by_id" IS NOT NULL
        AND "email_verified_at" IS NOT NULL
      WHEN "status" = 'SUSPENDED' THEN
        "email_verified_at" IS NOT NULL
        AND (
          (
            "department" IS NULL
            AND "staff_approved_at" IS NULL
            AND "staff_approved_by_id" IS NULL
          )
          OR (
            "department" IS NOT NULL
            AND "staff_approved_at" IS NOT NULL
            AND "staff_approved_by_id" IS NOT NULL
          )
        )
      ELSE FALSE
    END
  );

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_actor_authority"
  CHECK (
    "actor_role" = 'ADMIN'
    AND "actor_status" = 'ACTIVE'
    AND "actor_email_verified_at" IS NOT NULL
  );

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_versions"
  CHECK ("before_version" >= 0 AND "after_version" = "before_version" + 1);

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_request_shape"
  CHECK (
    ("operation" IN ('APPROVE', 'CHANGE_DEPARTMENT')) = ("requested_department" IS NOT NULL)
  );

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_approval_pairs"
  CHECK (
    ("before_approved_at" IS NULL) = ("before_approved_by_id" IS NULL)
    AND ("after_approved_at" IS NULL) = ("after_approved_by_id" IS NULL)
  );

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_transition"
  CHECK (
    CASE "action"
      WHEN 'APPROVE' THEN
        "before_status" = 'PENDING_APPROVAL'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'RECONSIDER' THEN
        "before_status" = 'REJECTED'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'PREPARE_APPROVAL' THEN
        "before_status" = 'SUSPENDED'
        AND "after_status" = 'SUSPENDED'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'REJECT' THEN
        "before_status" = 'PENDING_APPROVAL'
        AND "after_status" = 'REJECTED'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "after_department" IS NULL
        AND "after_approved_at" IS NULL
      WHEN 'CHANGE_DEPARTMENT' THEN
        "before_status" IN ('ACTIVE', 'SUSPENDED')
        AND "after_status" = "before_status"
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_department" IS NOT NULL
        AND "after_department" <> "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      WHEN 'SUSPEND' THEN
        "before_status" = 'ACTIVE'
        AND "after_status" = 'SUSPENDED'
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      WHEN 'REACTIVATE' THEN
        "before_status" = 'SUSPENDED'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      ELSE FALSE
    END
  );

ALTER TABLE "initial_administrator_provisioning"
  ADD CONSTRAINT "ck_initial_admin_singleton"
  CHECK ("id" = 'INITIAL_ADMIN');

ALTER TABLE "initial_administrator_provisioning"
  ADD CONSTRAINT "ck_initial_admin_operator_reference"
  CHECK (
    "operator_reference" = btrim("operator_reference")
    AND length("operator_reference") > 0
    AND length("operator_reference") <= 128
  );

ALTER TABLE "initial_administrator_provisioning"
  ADD CONSTRAINT "ck_initial_admin_versions"
  CHECK ("before_version" >= 0 AND "after_version" = "before_version" + 1);

-- Retained history is append-only. The same rejecting trigger function protects the
-- restricted initial-administrator receipt.
CREATE OR REPLACE FUNCTION reject_staff_decision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'retained % rows are append-only and cannot be changed or removed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_decisions_immutable
  BEFORE UPDATE OR DELETE ON "staff_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_staff_decision_mutation();

CREATE TRIGGER initial_administrator_provisioning_immutable
  BEFORE UPDATE OR DELETE ON "initial_administrator_provisioning"
  FOR EACH ROW EXECUTE FUNCTION reject_staff_decision_mutation();
