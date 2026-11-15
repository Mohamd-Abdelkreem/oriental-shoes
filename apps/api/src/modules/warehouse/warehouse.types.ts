import type {
  FactoryOrderPaperData,
  QualityPackingGroup,
  WarehouseCommandBody,
  WarehouseCommandOperation,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type { ManufacturingPhysicalPieceRecord } from "../manufacturing/manufacturing.mapper.js";
import type {
  WAREHOUSE_ORDER_SELECT,
  WAREHOUSE_LOCKED_ROOT_SELECT,
  WAREHOUSE_ACCEPTED_SOURCE_SELECT,
  WAREHOUSE_RECEIPT_PIECE_SELECT,
  WAREHOUSE_RECEIPT_GROUP_SELECT,
  WAREHOUSE_ATTEMPT_SELECT,
  WAREHOUSE_COMMAND_SELECT,
} from "./warehouse.mapper.js";

export type WarehouseCommandRecord = Prisma.WarehouseCommandGetPayload<{
  select: typeof WAREHOUSE_COMMAND_SELECT;
}>;
export type WarehouseCommandExecution = Readonly<{
  actorId: string;
  body: WarehouseCommandBody;
}>;

export type CanonicalWarehouseOrder = {
  [O in WarehouseCommandOperation]: Extract<
    WarehouseCommandBody,
    { operation: O }
  >["orders"][number] & { operation: O };
}[WarehouseCommandOperation];
export type WarehousePhysicalPieceRecord = ManufacturingPhysicalPieceRecord;
export type WarehouseOrderRecord = Prisma.SalesDraftGetPayload<{
  select: typeof WAREHOUSE_ORDER_SELECT;
}>;
export type WarehouseLockedRootRecord = Prisma.SalesDraftGetPayload<{
  select: typeof WAREHOUSE_LOCKED_ROOT_SELECT;
}>;
export type WarehouseAcceptedSourceRecord = Prisma.QualityPieceEventGetPayload<{
  select: typeof WAREHOUSE_ACCEPTED_SOURCE_SELECT;
}>;
export type WarehouseReceiptPieceRecord =
  Prisma.WarehouseReceiptPieceGetPayload<{
    select: typeof WAREHOUSE_RECEIPT_PIECE_SELECT;
  }>;
export type WarehouseReceiptGroupRecord =
  Prisma.WarehouseReceiptGroupGetPayload<{
    select: typeof WAREHOUSE_RECEIPT_GROUP_SELECT;
  }>;
export type WarehouseAttemptRecord = Prisma.WarehouseDeliveryAttemptGetPayload<{
  select: typeof WAREHOUSE_ATTEMPT_SELECT;
}>;
export type WarehouseOrderContextRecord = Readonly<{
  root: WarehouseOrderRecord;
  physical: readonly WarehousePhysicalPieceRecord[];
  acceptedByPiece: ReadonlyMap<string, WarehouseAcceptedSourceRecord>;
  receiptByPiece: ReadonlyMap<string, WarehouseReceiptPieceRecord>;
  receiptGroups: readonly WarehouseReceiptGroupRecord[];
  qualityPackingGroups: readonly QualityPackingGroup[];
  latestAttempt: WarehouseAttemptRecord | null;
  issueInstructions: FactoryOrderPaperData["issues"];
  openCorrectionPieceIds: ReadonlySet<string>;
  lastActionAt: Date | null;
}>;
export type LockedWarehouseOrder = Readonly<{
  root: WarehouseLockedRootRecord;
  physical: readonly WarehousePhysicalPieceRecord[];
  acceptedByPiece: ReadonlyMap<string, WarehouseAcceptedSourceRecord>;
  receiptByPiece: ReadonlyMap<string, WarehouseReceiptPieceRecord>;
  latestAttempt: WarehouseAttemptRecord | null;
  counts: {
    original: number;
    cancelled: number;
    active: number;
    received: number;
  };
  hasActiveBlocker: boolean;
  reviewed: CanonicalWarehouseOrder;
}>;
