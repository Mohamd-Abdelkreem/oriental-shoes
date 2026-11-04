DO $$
DECLARE
  anomaly_count BIGINT;
BEGIN
  LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;

  -- Prisma also deploys missing migrations on targets already past this point.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"users"'::regclass
       AND conname = 'ck_users_verification_state_consistent'
       AND contype = 'c'
       AND convalidated
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO anomaly_count
    FROM "users"
   WHERE ("status" = 'PENDING_VERIFICATION') <> ("email_verified_at" IS NULL)
     AND NOT ("role" = 'USER' AND "status" = 'PENDING_VERIFICATION'
              AND "email_verified_at" IS NOT NULL);

  IF anomaly_count > 0 THEN
    RAISE EXCEPTION
      'ck_users_verification_state_consistent preflight failed: % account row(s) require explicit operator review',
      anomaly_count
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  UPDATE "users"
     SET "status" = 'PENDING_APPROVAL'
   WHERE "role" = 'USER'
     AND "status" = 'PENDING_VERIFICATION'
     AND "email_verified_at" IS NOT NULL;
END $$;
