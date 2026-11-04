-- ExtendEnum
-- The committed enum labels are intentionally separate from the state migration so that
-- the second migration can reference the new values in its own transaction.
ALTER TYPE "user_status" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "user_status" ADD VALUE 'REJECTED';

-- CreateEnum
CREATE TYPE "department" AS ENUM (
  'SALES',
  'APPROVAL',
  'CUTTING',
  'PRODUCTION',
  'QUALITY',
  'WAREHOUSE'
);

-- CreateEnum
CREATE TYPE "staff_operation" AS ENUM (
  'APPROVE',
  'REJECT',
  'CHANGE_DEPARTMENT',
  'SUSPEND',
  'REACTIVATE'
);

-- CreateEnum
CREATE TYPE "staff_decision_action" AS ENUM (
  'APPROVE',
  'RECONSIDER',
  'PREPARE_APPROVAL',
  'REJECT',
  'CHANGE_DEPARTMENT',
  'SUSPEND',
  'REACTIVATE'
);
