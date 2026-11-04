import type {
  StaffAccessSnapshot,
  StaffDecision,
  StaffDecisionActor,
} from "@template/contracts";
import { UserRole, type Prisma } from "@template/database";

import { InternalServerError } from "../../core/errors/internal-server.error.js";

/**
 * The explicit retained-decision selection. It reads only the stored decision
 * identity, the recorded actor/target snapshots and the before/after access
 * snapshots. It never selects a credential, a token or an approver credential
 * and it never re-joins a current account row over historical history.
 */
export const STAFF_DECISION_SELECT = {
  id: true,
  commandId: true,
  operation: true,
  requestedDepartment: true,
  action: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  targetId: true,
  occurredAt: true,
  beforeVersion: true,
  beforeStatus: true,
  beforeDepartment: true,
  beforeApprovedAt: true,
  afterVersion: true,
  afterStatus: true,
  afterDepartment: true,
  afterApprovedAt: true,
  afterApprovedById: true,
} as const satisfies Prisma.StaffDecisionSelect;

export type StaffDecisionRecord = Prisma.StaffDecisionGetPayload<{
  select: typeof STAFF_DECISION_SELECT;
}>;

const mapAccessSnapshot = (
  status: StaffAccessSnapshot["status"],
  department: StaffAccessSnapshot["department"],
  staffApprovedAt: Date | null,
  accessVersion: number,
): StaffAccessSnapshot => ({
  status,
  department,
  staffApprovedAt: staffApprovedAt?.toISOString() ?? null,
  accessVersion,
});

/**
 * Projects the recorded actor. The retained decision keeps the actor identity
 * as it was at action time, and the shared wire schema fixes that actor to an
 * administrator without a department.
 */
const mapDecisionActor = (record: StaffDecisionRecord): StaffDecisionActor => {
  if (record.actorRole !== UserRole.ADMIN) {
    throw new InternalServerError(
      "A retained staff decision has an unexpected actor role.",
    );
  }

  return {
    id: record.actorId,
    fullName: record.actorFullName,
    role: record.actorRole,
    department: null,
  };
};

/**
 * Maps one retained decision to its safe wire projection. Raw provider values
 * are never spread into the result.
 */
export const mapStaffDecision = (
  record: StaffDecisionRecord,
): StaffDecision => ({
  id: record.id,
  commandId: record.commandId,
  action: record.action,
  actor: mapDecisionActor(record),
  targetUserId: record.targetId,
  occurredAt: record.occurredAt.toISOString(),
  before: mapAccessSnapshot(
    record.beforeStatus,
    record.beforeDepartment,
    record.beforeApprovedAt,
    record.beforeVersion,
  ),
  after: mapAccessSnapshot(
    record.afterStatus,
    record.afterDepartment,
    record.afterApprovedAt,
    record.afterVersion,
  ),
});
