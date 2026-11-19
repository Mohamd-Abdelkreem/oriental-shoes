ALTER TABLE "users"
  ADD COLUMN "enrollment_department" "department",
  ADD COLUMN "enrolled_by_id" UUID,
  ADD CONSTRAINT "users_enrolled_by_id_fkey"
    FOREIGN KEY ("enrolled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_users_staff_enrollment_pair"
    CHECK (("enrolled_by_id" IS NULL) = ("enrollment_department" IS NULL));
