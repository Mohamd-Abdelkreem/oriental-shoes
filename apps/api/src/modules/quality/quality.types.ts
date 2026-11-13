import type {
  QualityCommandBody,
  QualityInspectionDecision,
  SalesOrderStatus,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type { ApprovalOrderRecord } from "../approval/approval.types.js";
import type {
  QualityPhysicalPieceRecord,
  QualityVisitRecord,
  QualityCorrectionRecord,
  QualityCommandRecord,
  SafeCurrentIssueRecord,
  QualityArrivalSelectionRecord,
} from "./quality.mapper.js";

export type QualityCommandExecution = Readonly<{
  actorId: string;
  body: QualityCommandBody;
}>;
type InspectionOrder = Extract<
  QualityCommandBody,
  { operation: "INSPECT" }
>["orders"][number];
export type CanonicalQualityOrder = Readonly<{
  orderId: string;
  expectedVersion: number;
  pieceIds: readonly string[];
  decisions: readonly QualityInspectionDecision[] | null;
  inspectorNote: string | null;
  packing: InspectionOrder["packing"];
}>;
export type QualityLastActionRecord = Pick<
  QualityCommandRecord,
  | "commandId"
  | "operation"
  | "actorId"
  | "actorFullName"
  | "actorRole"
  | "actorDepartment"
  | "occurredAt"
> & { eventId: string };
export type QualityArrivalRecord = Omit<
  QualityArrivalSelectionRecord,
  "id" | "commandOrder"
> & {
  eventId: string;
  occurredAt: Date;
};
export type QualityPieceContextRecord = Readonly<{
  piece: QualityPhysicalPieceRecord;
  orderStatus: SalesOrderStatus;
  visit: QualityVisitRecord | null;
  lastAction: QualityLastActionRecord | null;
  correction: QualityCorrectionRecord | null;
  issue: SafeCurrentIssueRecord | null;
  productionArrival: QualityArrivalRecord | null;
}>;
export type LockedQualityOrder = Readonly<{
  id: string;
  version: number;
  root: ApprovalOrderRecord;
  pieces: readonly QualityPieceContextRecord[];
}>;
export type PendingQualityPieceEvent = Prisma.QualityPieceEventCreateManyInput;
