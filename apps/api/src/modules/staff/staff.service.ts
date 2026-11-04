import type {
  SafeUser,
  StaffApprovalBody,
  StaffCommandBody,
  StaffCommandData,
  StaffDecisionsData,
  StaffDepartmentBody,
  StaffHistoryQuery,
  StaffListData,
  StaffListQuery,
} from "@template/contracts";
import {
  Prisma,
  StaffDecisionAction,
  StaffOperation,
  UserRole,
  UserStatus,
  type DatabaseClient,
  type Department,
} from "@template/database";

import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import {
  AUTHORITY_ACCOUNT_SELECT,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { AccountRestrictedError } from "../auth/auth.errors.js";
import { mapSafeUser, SAFE_USER_SELECT } from "../users/users.mapper.js";
import {
  isStaffCommandIdConflict,
  StaffAccessConflictError,
  StaffAdminTargetForbiddenError,
  StaffCommandConflictError,
  StaffNotFoundError,
  StaffTransitionConflictError,
} from "./staff.errors.js";
import {
  mapStaffDecision,
  STAFF_DECISION_SELECT,
  type StaffDecisionRecord,
} from "./staff.mapper.js";
import { findStaffDecisionPage, findStaffPage } from "./staff.queries.js";

const STAFF_READ_MAX_WAIT_MS = 5_000;
const STAFF_READ_TIMEOUT_MS = 10_000;
const STAFF_COMMAND_MAX_WAIT_MS = 5_000;
const STAFF_COMMAND_TIMEOUT_MS = 10_000;
const MAX_ACCESS_VERSION = 2_147_483_647;

type StaffCommandRequest = Readonly<{
  operation: StaffOperation;
  requestedDepartment: Department | null;
  commandId: string;
  expectedAccessVersion: number;
}>;

type StaffTransition = Readonly<{
  action: StaffDecisionAction;
  afterStatus: UserStatus;
  afterDepartment: Department | null;
  grantsApproval: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isTransactionConflict = (error: unknown): boolean =>
  isRecord(error) && error["code"] === "P2034";

const isApprovedStaff = (target: AuthorityAccount): boolean =>
  target.staffApprovedAt !== null &&
  target.staffApprovedById !== null &&
  target.department !== null;

const sameInstant = (left: Date | null, right: Date | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  return left.getTime() === right.getTime();
};

/**
 * Requires a current verified active administrator. The returned timestamp is
 * the actor verification evidence a retained decision records.
 */
const requireCurrentStaffAdministrator = (account: AuthorityAccount): Date => {
  if (account.role !== UserRole.ADMIN) {
    throw new ForbiddenException(
      "Only administrators can manage staff accounts.",
    );
  }
  if (
    account.status !== UserStatus.ACTIVE ||
    account.emailVerifiedAt === null
  ) {
    throw new AccountRestrictedError();
  }
  return account.emailVerifiedAt;
};

/**
 * Resolves the named transition of one ordinary staff command. It returns
 * `null` when the current state already satisfies the same intent, which is the
 * unchanged no-op outcome. Every unsupported source state conflicts.
 */
const resolveStaffTransition = (
  target: AuthorityAccount,
  request: StaffCommandRequest,
): StaffTransition | null => {
  const requestedDepartment = request.requestedDepartment;
  const approved = isApprovedStaff(target);
  const verified = target.emailVerifiedAt !== null;

  switch (request.operation) {
    case StaffOperation.APPROVE: {
      if (requestedDepartment === null) {
        throw new StaffTransitionConflictError();
      }
      if (approved) {
        if (target.department === requestedDepartment) {
          return null;
        }
        throw new StaffTransitionConflictError();
      }
      if (!verified) {
        throw new StaffTransitionConflictError();
      }
      switch (target.status) {
        case UserStatus.PENDING_APPROVAL:
          return {
            action: StaffDecisionAction.APPROVE,
            afterStatus: UserStatus.ACTIVE,
            afterDepartment: requestedDepartment,
            grantsApproval: true,
          };
        case UserStatus.REJECTED:
          return {
            action: StaffDecisionAction.RECONSIDER,
            afterStatus: UserStatus.ACTIVE,
            afterDepartment: requestedDepartment,
            grantsApproval: true,
          };
        case UserStatus.SUSPENDED:
          return {
            action: StaffDecisionAction.PREPARE_APPROVAL,
            afterStatus: UserStatus.SUSPENDED,
            afterDepartment: requestedDepartment,
            grantsApproval: true,
          };
        default:
          throw new StaffTransitionConflictError();
      }
    }
    case StaffOperation.REJECT: {
      if (target.status === UserStatus.REJECTED) {
        return null;
      }
      if (
        target.status !== UserStatus.PENDING_APPROVAL ||
        !verified ||
        approved
      ) {
        throw new StaffTransitionConflictError();
      }
      return {
        action: StaffDecisionAction.REJECT,
        afterStatus: UserStatus.REJECTED,
        afterDepartment: null,
        grantsApproval: false,
      };
    }
    case StaffOperation.CHANGE_DEPARTMENT: {
      if (requestedDepartment === null || !approved) {
        throw new StaffTransitionConflictError();
      }
      if (
        target.status !== UserStatus.ACTIVE &&
        target.status !== UserStatus.SUSPENDED
      ) {
        throw new StaffTransitionConflictError();
      }
      if (target.department === requestedDepartment) {
        return null;
      }
      return {
        action: StaffDecisionAction.CHANGE_DEPARTMENT,
        afterStatus: target.status,
        afterDepartment: requestedDepartment,
        grantsApproval: false,
      };
    }
    case StaffOperation.SUSPEND: {
      if (!approved) {
        throw new StaffTransitionConflictError();
      }
      if (target.status === UserStatus.SUSPENDED) {
        return null;
      }
      if (target.status !== UserStatus.ACTIVE) {
        throw new StaffTransitionConflictError();
      }
      return {
        action: StaffDecisionAction.SUSPEND,
        afterStatus: UserStatus.SUSPENDED,
        afterDepartment: target.department,
        grantsApproval: false,
      };
    }
    case StaffOperation.REACTIVATE: {
      if (!approved) {
        throw new StaffTransitionConflictError();
      }
      if (target.status === UserStatus.ACTIVE) {
        return null;
      }
      if (target.status !== UserStatus.SUSPENDED) {
        throw new StaffTransitionConflictError();
      }
      return {
        action: StaffDecisionAction.REACTIVATE,
        afterStatus: UserStatus.ACTIVE,
        afterDepartment: target.department,
        grantsApproval: false,
      };
    }
  }
};

/**
 * Writes only the fields the named operation is allowed to change and
 * increments the access revision exactly once.
 */
const buildStaffUpdateData = (
  transition: StaffTransition,
  occurredAt: Date,
  actorId: string,
): Prisma.UserUncheckedUpdateManyInput => {
  switch (transition.action) {
    case StaffDecisionAction.APPROVE:
    case StaffDecisionAction.RECONSIDER:
    case StaffDecisionAction.PREPARE_APPROVAL:
      return {
        status: transition.afterStatus,
        department: transition.afterDepartment,
        staffApprovedAt: occurredAt,
        staffApprovedById: actorId,
        accessVersion: { increment: 1 },
      };
    case StaffDecisionAction.REJECT:
      return {
        status: transition.afterStatus,
        accessVersion: { increment: 1 },
      };
    case StaffDecisionAction.CHANGE_DEPARTMENT:
      return {
        department: transition.afterDepartment,
        accessVersion: { increment: 1 },
      };
    case StaffDecisionAction.SUSPEND:
    case StaffDecisionAction.REACTIVATE:
      return {
        status: transition.afterStatus,
        accessVersion: { increment: 1 },
      };
  }
};

/**
 * Protects the conditional write with the role, revision, source state and the
 * current approval and department evidence of the target.
 */
const buildStaffUpdateWhere = (
  target: AuthorityAccount,
  request: StaffCommandRequest,
): Prisma.UserWhereInput => ({
  id: target.id,
  role: UserRole.USER,
  accessVersion: request.expectedAccessVersion,
  status: target.status,
  emailVerifiedAt: { not: null },
  department: target.department,
  staffApprovedAt: target.staffApprovedAt,
  staffApprovedById: target.staffApprovedById,
});

export class StaffService {
  constructor(private readonly database: DatabaseClient) {}

  async listStaff(
    actorId: string,
    query: StaffListQuery,
  ): Promise<StaffListData> {
    return await this.readAsCurrentAdministrator(actorId, async (tx) =>
      findStaffPage(tx, query),
    );
  }

  async getStaff(actorId: string, targetUserId: string): Promise<SafeUser> {
    return await this.readAsCurrentAdministrator(actorId, async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: SAFE_USER_SELECT,
      });
      if (target === null) {
        throw new StaffNotFoundError();
      }
      return mapSafeUser(target);
    });
  }

  async listStaffDecisions(
    actorId: string,
    targetUserId: string,
    query: StaffHistoryQuery,
  ): Promise<StaffDecisionsData> {
    return await this.readAsCurrentAdministrator(actorId, async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (target === null) {
        throw new StaffNotFoundError();
      }
      return await findStaffDecisionPage(tx, targetUserId, query);
    });
  }

  async approveStaff(
    actorId: string,
    targetUserId: string,
    input: StaffApprovalBody,
  ): Promise<StaffCommandData> {
    return await this.executeStaffCommand(actorId, targetUserId, {
      operation: StaffOperation.APPROVE,
      requestedDepartment: input.department,
      commandId: input.commandId,
      expectedAccessVersion: input.expectedAccessVersion,
    });
  }

  async rejectStaff(
    actorId: string,
    targetUserId: string,
    input: StaffCommandBody,
  ): Promise<StaffCommandData> {
    return await this.executeStaffCommand(actorId, targetUserId, {
      operation: StaffOperation.REJECT,
      requestedDepartment: null,
      commandId: input.commandId,
      expectedAccessVersion: input.expectedAccessVersion,
    });
  }

  async changeDepartment(
    actorId: string,
    targetUserId: string,
    input: StaffDepartmentBody,
  ): Promise<StaffCommandData> {
    return await this.executeStaffCommand(actorId, targetUserId, {
      operation: StaffOperation.CHANGE_DEPARTMENT,
      requestedDepartment: input.department,
      commandId: input.commandId,
      expectedAccessVersion: input.expectedAccessVersion,
    });
  }

  async suspendStaff(
    actorId: string,
    targetUserId: string,
    input: StaffCommandBody,
  ): Promise<StaffCommandData> {
    return await this.executeStaffCommand(actorId, targetUserId, {
      operation: StaffOperation.SUSPEND,
      requestedDepartment: null,
      commandId: input.commandId,
      expectedAccessVersion: input.expectedAccessVersion,
    });
  }

  async reactivateStaff(
    actorId: string,
    targetUserId: string,
    input: StaffCommandBody,
  ): Promise<StaffCommandData> {
    return await this.executeStaffCommand(actorId, targetUserId, {
      operation: StaffOperation.REACTIVATE,
      requestedDepartment: null,
      commandId: input.commandId,
      expectedAccessVersion: input.expectedAccessVersion,
    });
  }

  /**
   * Reads under one short repeatable-read snapshot. The current administrator
   * is established under a read lock before any row, count or history query,
   * and a denied caller never reaches those queries.
   */
  private async readAsCurrentAdministrator<T>(
    actorId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return await this.withBoundedRetry(async () =>
      this.database.$transaction(
        async (tx) => {
          await lockAccountRows(tx, [actorId], "read");
          const actor = await loadIdentityAccount(tx, actorId);
          requireCurrentStaffAdministrator(actor);
          return await work(tx);
        },
        {
          maxWait: STAFF_READ_MAX_WAIT_MS,
          timeout: STAFF_READ_TIMEOUT_MS,
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        },
      ),
    );
  }

  /**
   * Runs one named staff command through the single audited algorithm. The
   * recognized global command-identity race and the recognized transaction
   * abort each allow exactly one fresh attempt with the same input.
   */
  private async executeStaffCommand(
    actorId: string,
    targetUserId: string,
    request: StaffCommandRequest,
  ): Promise<StaffCommandData> {
    const attempt = async (): Promise<StaffCommandData> =>
      this.database.$transaction(
        async (tx) =>
          await this.applyStaffCommand(tx, actorId, targetUserId, request),
        {
          maxWait: STAFF_COMMAND_MAX_WAIT_MS,
          timeout: STAFF_COMMAND_TIMEOUT_MS,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

    try {
      return await attempt();
    } catch (error) {
      if (isStaffCommandIdConflict(error) || isTransactionConflict(error)) {
        return await attempt();
      }
      throw error;
    }
  }

  private async applyStaffCommand(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetUserId: string,
    request: StaffCommandRequest,
  ): Promise<StaffCommandData> {
    await lockAccountRows(tx, [actorId, targetUserId], "write");

    const actor = await loadIdentityAccount(tx, actorId);
    const actorEmailVerifiedAt = requireCurrentStaffAdministrator(actor);

    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: AUTHORITY_ACCOUNT_SELECT,
    });
    if (target === null) {
      throw new StaffNotFoundError();
    }
    if (target.role === UserRole.ADMIN) {
      throw new StaffAdminTargetForbiddenError();
    }

    const receipt = await tx.staffDecision.findUnique({
      where: { commandId: request.commandId },
      select: STAFF_DECISION_SELECT,
    });
    if (receipt !== null) {
      return this.replayStaffCommand(
        target,
        receipt,
        actorId,
        targetUserId,
        request,
      );
    }

    if (target.accessVersion !== request.expectedAccessVersion) {
      throw new StaffAccessConflictError();
    }

    const transition = resolveStaffTransition(target, request);
    if (transition === null) {
      return { staff: mapSafeUser(target), decision: null, replayed: false };
    }
    if (target.accessVersion >= MAX_ACCESS_VERSION) {
      throw new StaffTransitionConflictError();
    }

    const occurredAt = new Date();
    const updated = await tx.user.updateMany({
      where: buildStaffUpdateWhere(target, request),
      data: buildStaffUpdateData(transition, occurredAt, actorId),
    });
    if (updated.count !== 1) {
      throw new StaffAccessConflictError();
    }

    const decision = await tx.staffDecision.create({
      data: {
        commandId: request.commandId,
        targetId: target.id,
        actorId,
        targetFullName: target.fullName,
        targetEmail: target.email,
        actorFullName: actor.fullName,
        actorRole: actor.role,
        actorStatus: actor.status,
        actorEmailVerifiedAt,
        operation: request.operation,
        action: transition.action,
        requestedDepartment: request.requestedDepartment,
        beforeVersion: target.accessVersion,
        afterVersion: target.accessVersion + 1,
        beforeStatus: target.status,
        afterStatus: transition.afterStatus,
        beforeDepartment: target.department,
        afterDepartment: transition.afterDepartment,
        beforeApprovedAt: target.staffApprovedAt,
        afterApprovedAt: transition.grantsApproval
          ? occurredAt
          : target.staffApprovedAt,
        beforeApprovedById: target.staffApprovedById,
        afterApprovedById: transition.grantsApproval
          ? actorId
          : target.staffApprovedById,
        occurredAt,
      },
      select: STAFF_DECISION_SELECT,
    });

    const current = await tx.user.findUnique({
      where: { id: target.id },
      select: SAFE_USER_SELECT,
    });
    if (current === null) {
      throw new StaffNotFoundError();
    }

    return {
      staff: mapSafeUser(current),
      decision: mapStaffDecision(decision),
      replayed: false,
    };
  }

  /**
   * Classifies a recorded effective-command receipt. A changed binding is a
   * command conflict; a receipt whose result no longer describes the target is
   * an access conflict; an exact replay appends nothing.
   */
  private replayStaffCommand(
    target: AuthorityAccount,
    receipt: StaffDecisionRecord,
    actorId: string,
    targetUserId: string,
    request: StaffCommandRequest,
  ): StaffCommandData {
    const sameBinding =
      receipt.actorId === actorId &&
      receipt.targetId === targetUserId &&
      receipt.operation === request.operation &&
      receipt.requestedDepartment === request.requestedDepartment &&
      receipt.beforeVersion === request.expectedAccessVersion;
    if (!sameBinding) {
      throw new StaffCommandConflictError();
    }

    const matchesCommittedResult =
      target.accessVersion === receipt.afterVersion &&
      target.status === receipt.afterStatus &&
      target.department === receipt.afterDepartment &&
      target.staffApprovedById === receipt.afterApprovedById &&
      sameInstant(target.staffApprovedAt, receipt.afterApprovedAt);
    if (!matchesCommittedResult) {
      throw new StaffAccessConflictError();
    }

    return {
      staff: mapSafeUser(target),
      decision: mapStaffDecision(receipt),
      replayed: true,
    };
  }

  private async withBoundedRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isTransactionConflict(error)) {
        throw error;
      }
      return await operation();
    }
  }
}
