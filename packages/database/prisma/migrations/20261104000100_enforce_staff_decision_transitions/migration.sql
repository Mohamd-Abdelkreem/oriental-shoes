BEGIN;

ALTER TABLE "staff_decisions" DROP CONSTRAINT "ck_staff_decisions_transition";

ALTER TABLE "staff_decisions"
  ADD CONSTRAINT "ck_staff_decisions_transition"
  CHECK (
    (CASE "action"
      WHEN 'APPROVE' THEN
        "operation" = 'APPROVE'
        AND "before_status" = 'PENDING_APPROVAL'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'RECONSIDER' THEN
        "operation" = 'APPROVE'
        AND "before_status" = 'REJECTED'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'PREPARE_APPROVAL' THEN
        "operation" = 'APPROVE'
        AND "before_status" = 'SUSPENDED'
        AND "after_status" = 'SUSPENDED'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "requested_department" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_approved_at" IS NOT NULL
      WHEN 'REJECT' THEN
        "operation" = 'REJECT'
        AND "before_status" = 'PENDING_APPROVAL'
        AND "after_status" = 'REJECTED'
        AND "before_department" IS NULL
        AND "before_approved_at" IS NULL
        AND "after_department" IS NULL
        AND "after_approved_at" IS NULL
      WHEN 'CHANGE_DEPARTMENT' THEN
        "operation" = 'CHANGE_DEPARTMENT'
        AND "before_status" IN ('ACTIVE', 'SUSPENDED')
        AND "after_status" = "before_status"
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "requested_department"
        AND "after_department" IS NOT NULL
        AND "after_department" <> "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      WHEN 'SUSPEND' THEN
        "operation" = 'SUSPEND'
        AND "before_status" = 'ACTIVE'
        AND "after_status" = 'SUSPENDED'
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      WHEN 'REACTIVATE' THEN
        "operation" = 'REACTIVATE'
        AND "before_status" = 'SUSPENDED'
        AND "after_status" = 'ACTIVE'
        AND "before_department" IS NOT NULL
        AND "before_approved_at" IS NOT NULL
        AND "after_department" = "before_department"
        AND "after_approved_at" = "before_approved_at"
        AND "after_approved_by_id" = "before_approved_by_id"
      ELSE FALSE
    END) IS TRUE
  );

COMMIT;
