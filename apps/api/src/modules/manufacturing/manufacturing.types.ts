import type {
  ManufacturingCommandBody,
  ManufacturingDepartment,
  ManufacturingOrderHeader,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type {
  ManufacturingPhysicalPieceRecord,
  ManufacturingVisitRecord,
  ManufacturingCommandRecord,
} from "./manufacturing.mapper.js";

export type ManufacturingCommandExecution = Readonly<{
  actorId: string;
  department: ManufacturingDepartment;
  body: ManufacturingCommandBody;
}>;

export type ManufacturingLastActionRecord = Readonly<
  Pick<
    ManufacturingCommandRecord,
    | "commandId"
    | "operation"
    | "actorId"
    | "actorFullName"
    | "actorRole"
    | "actorDepartment"
    | "occurredAt"
  > & { eventId: string }
>;

export type ManufacturingPieceContextRecord = Readonly<{
  piece: ManufacturingPhysicalPieceRecord;
  orderStatus: ManufacturingOrderHeader["status"];
  visit: ManufacturingVisitRecord | null;
  lastAction: ManufacturingLastActionRecord | null;
  issue: Prisma.ManufacturingIssueGetPayload<{
    select: { id: true; state: true; sourceDepartment: true };
  }> | null;
}>;

export type LockedManufacturingOrder = Readonly<{
  id: string;
  version: number;
  status: "SUBMITTED";
  orderStatus: ManufacturingPieceContextRecord["orderStatus"];
  pieces: readonly ManufacturingPieceContextRecord[];
}>;

export type InitialApprovalOrigin = Readonly<{
  kind: "INITIAL_APPROVAL";
  approvalCommandId: string;
}>;
export type ApprovalReturnOrigin = Readonly<{
  kind: "APPROVAL_RETURN";
  approvalCommandId: string;
  issueId: string;
  instructions: string | null;
}>;
export type DepartmentTransferOrigin = Readonly<{
  kind: "DEPARTMENT_TRANSFER";
  transferEventId: string;
}>;
