-- Enum additions commit before the following migration consumes them.
-- CreateEnum
CREATE TYPE "catalog_field" AS ENUM ('model', 'size', 'leatherBase', 'decoration', 'decorationColor', 'sole', 'soleAddition', 'soleColor', 'aField', 'fField');

-- CreateEnum
CREATE TYPE "sales_order_status" AS ENUM ('AWAITING_APPROVAL', 'RETURNED', 'APPROVED', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sales_piece_stage" AS ENUM ('AWAITING_APPROVAL', 'CUTTING', 'PRODUCTION', 'QUALITY', 'WAREHOUSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sales_piece_work_state" AS ENUM ('INCOMING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- AlterEnum
ALTER TYPE "sales_draft_status" ADD VALUE 'SUBMITTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "sales_command_operation" ADD VALUE 'SUBMIT_NEW_ORDER';
ALTER TYPE "sales_command_operation" ADD VALUE 'SUBMIT_DRAFT';
ALTER TYPE "sales_command_operation" ADD VALUE 'RESUBMIT_ORDER';
ALTER TYPE "sales_command_operation" ADD VALUE 'SET_ORDER_PAID';

