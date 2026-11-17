BEGIN;

-- CreateEnum
CREATE TYPE "administration_operation" AS ENUM ('ADMIN_CANCEL', 'ADMIN_CORRECT');

-- CreateEnum
CREATE TYPE "administration_cancellation_scope" AS ENUM ('ORDER', 'ITEM', 'QUANTITY');

-- AlterEnum
ALTER TYPE "quality_visit_end" ADD VALUE 'CANCELLED';


COMMIT;
