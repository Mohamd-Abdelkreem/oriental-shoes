import type { SafeUser } from "@template/contracts";
import {
  Prisma,
  UserRole,
  UserStatus,
  type DatabaseClient,
} from "@template/database";

import { HTTP_STATUS } from "../../core/constants/http-status.constants.js";
import { AppError } from "../../core/errors/app.error.js";
import { mapSafeUser } from "../users/users.mapper.js";
import {
  AUTHORITY_ACCOUNT_SELECT,
  lockAccountRows,
  type AuthorityAccount,
} from "./account-authority.js";

/**
 * The restricted initial-administrator procedure.
 *
 * This is a one-time bootstrap operation, not an administrator lifecycle tool. It
 * promotes exactly one verified, unassigned, pending employee to the first
 * administrator and writes exactly one singleton receipt. It never changes a
 * password, an email address, a verification, a profile, an employee assignment
 * or anybody else's account, and it never fabricates a staff decision.
 */

/** The only primary key the singleton provisioning receipt accepts. */
const INITIAL_ADMINISTRATOR_RECEIPT_ID = "INITIAL_ADMIN";

/** The largest access revision that can still be incremented. */
const MAXIMUM_ACCESS_VERSION = 2_147_483_647;

/** The short transaction bounds the data design fixes for this procedure. */
const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 10_000;

export type InitialAdministratorInput = Readonly<{
  userId: string;
  expectedEmail: string;
  expectedAccessVersion: number;
  operatorReference: string;
}>;

export type InitialAdministratorReason =
  "ELIGIBLE" | "INITIAL_ADMIN_EXISTS" | "INVALID_CANDIDATE" | "STALE_CANDIDATE";

export type InitialAdministratorPreview = Readonly<{
  user: SafeUser | null;
  eligible: boolean;
  reason: InitialAdministratorReason;
}>;

export type InitialAdministratorResult = Readonly<{
  user: SafeUser;
  operatorReference: string;
  occurredAt: string;
}>;

/**
 * The known, safe denial of the procedure. It carries one bounded reason and one
 * fixed message; it never carries a credential, a raw database detail or a stack.
 */
export class InitialAdministratorError extends AppError {
  public readonly reason: Exclude<
    InitialAdministratorPreview["reason"],
    "ELIGIBLE"
  >;

  constructor(
    reason: Exclude<InitialAdministratorPreview["reason"], "ELIGIBLE">,
  ) {
    super(
      "The selected identity is not eligible for initial administrator provisioning.",
      HTTP_STATUS.CONFLICT,
      "INITIAL_ADMINISTRATOR_NOT_ELIGIBLE",
    );
    this.name = "InitialAdministratorError";
    this.reason = reason;
  }
}

/**
 * The mutable state the procedure reads before it decides. Preview and apply read
 * the same state; apply repeats every condition inside its own transaction.
 */
export type InitialAdministratorGate = Readonly<{
  candidate: AuthorityAccount | null;
  administratorCount: number;
  receiptPresent: boolean;
}>;

export type InitialAdministratorEvaluation =
  | Readonly<{
      eligible: true;
      reason: "ELIGIBLE";
      selected: AuthorityAccount;
    }>
  | Readonly<{
      eligible: false;
      reason: Exclude<InitialAdministratorReason, "ELIGIBLE">;
      selected: AuthorityAccount | null;
    }>;

const normalizeInitialAdministratorInput = (
  input: InitialAdministratorInput,
): InitialAdministratorInput => ({
  userId: input.userId.trim().toLowerCase(),
  expectedEmail: input.expectedEmail.trim().toLowerCase(),
  expectedAccessVersion: input.expectedAccessVersion,
  operatorReference: input.operatorReference.trim(),
});

/**
 * A candidate is eligible only as a verified, unassigned, pending employee. Any
 * other state, including a suspended or already active account, is refused.
 */
const isEligibleInitialAdministratorCandidate = (
  candidate: AuthorityAccount,
): boolean =>
  candidate.role === UserRole.USER &&
  candidate.status === UserStatus.PENDING_APPROVAL &&
  candidate.emailVerifiedAt !== null &&
  candidate.department === null &&
  candidate.staffApprovedAt === null &&
  candidate.staffApprovedById === null;

/**
 * The selected account is exposed only when the stored normalized email is the
 * one the operator explicitly supplied. An absent or wrong identity never
 * resolves to some other account.
 */
const selectedCandidate = (
  candidate: AuthorityAccount | null,
  input: InitialAdministratorInput,
): AuthorityAccount | null =>
  candidate !== null && candidate.email === input.expectedEmail
    ? candidate
    : null;

/**
 * The single decision the preview and the apply path share. The bootstrap may
 * never run while an administrator row or the singleton receipt exists, and the
 * selected identity must still be the exact verified pending employee the
 * operator described.
 */
export const evaluateInitialAdministratorEligibility = (
  gate: InitialAdministratorGate,
  input: InitialAdministratorInput,
): InitialAdministratorEvaluation => {
  if (gate.administratorCount > 0 || gate.receiptPresent) {
    return {
      eligible: false,
      reason: "INITIAL_ADMIN_EXISTS",
      selected: selectedCandidate(gate.candidate, input),
    };
  }

  if (
    gate.candidate === null ||
    !isEligibleInitialAdministratorCandidate(gate.candidate)
  ) {
    return {
      eligible: false,
      reason: "INVALID_CANDIDATE",
      selected: selectedCandidate(gate.candidate, input),
    };
  }

  if (
    gate.candidate.email !== input.expectedEmail ||
    gate.candidate.accessVersion !== input.expectedAccessVersion ||
    gate.candidate.accessVersion >= MAXIMUM_ACCESS_VERSION
  ) {
    return {
      eligible: false,
      reason: "STALE_CANDIDATE",
      selected: selectedCandidate(gate.candidate, input),
    };
  }

  return { eligible: true, reason: "ELIGIBLE", selected: gate.candidate };
};

export class InitialAdministratorService {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * Reads the current bootstrap state without reserving or mutating anything.
   * The returned user is the selected account only, or null.
   */
  async preview(
    input: InitialAdministratorInput,
  ): Promise<InitialAdministratorPreview> {
    const normalized = normalizeInitialAdministratorInput(input);

    return this.database.$transaction(
      async (tx) => {
        const gate = await this.readGate(tx, normalized.userId);
        const evaluation = evaluateInitialAdministratorEligibility(
          gate,
          normalized,
        );

        return {
          user:
            evaluation.selected === null
              ? null
              : mapSafeUser(evaluation.selected),
          eligible: evaluation.eligible,
          reason: evaluation.reason,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  /**
   * Promotes exactly the selected employee and records the singleton receipt in
   * the same transaction. Every refusal throws the known safe error and leaves
   * the database unchanged.
   */
  async apply(
    input: InitialAdministratorInput,
  ): Promise<InitialAdministratorResult> {
    const normalized = normalizeInitialAdministratorInput(input);

    return this.database.$transaction(
      async (tx) => {
        // The advisory lock serializes every bootstrap attempt on the fixed
        // initial-provisioning key. The statement returns void, so it is
        // executed without deserializing a result row.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(50201)`;
        await lockAccountRows(tx, [normalized.userId], "write");

        const gate = await this.readGate(tx, normalized.userId);
        const evaluation = evaluateInitialAdministratorEligibility(
          gate,
          normalized,
        );

        if (!evaluation.eligible) {
          throw new InitialAdministratorError(evaluation.reason);
        }

        const candidate = evaluation.selected;
        const occurredAt = new Date();

        // The conditional update is the only write to the account. It never
        // touches the password, the email, the verification or the profile, and
        // it leaves the employee fields null.
        const promoted = await tx.user.updateMany({
          where: {
            id: candidate.id,
            role: UserRole.USER,
            status: UserStatus.PENDING_APPROVAL,
            email: normalized.expectedEmail,
            accessVersion: normalized.expectedAccessVersion,
            emailVerifiedAt: { not: null },
            department: null,
            staffApprovedAt: null,
            staffApprovedById: null,
          },
          data: {
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            accessVersion: { increment: 1 },
          },
        });

        if (promoted.count !== 1) {
          throw new InitialAdministratorError("STALE_CANDIDATE");
        }

        // The receipt commits with the promotion. A receipt failure rolls the
        // promotion back with it.
        await tx.initialAdministratorProvisioning.create({
          data: {
            id: INITIAL_ADMINISTRATOR_RECEIPT_ID,
            targetId: candidate.id,
            operatorReference: normalized.operatorReference,
            occurredAt,
            beforeVersion: candidate.accessVersion,
            afterVersion: candidate.accessVersion + 1,
          },
        });

        const confirmed = await tx.user.findUnique({
          where: { id: candidate.id },
          select: AUTHORITY_ACCOUNT_SELECT,
        });

        if (confirmed === null) {
          throw new InitialAdministratorError("INVALID_CANDIDATE");
        }

        return {
          user: mapSafeUser(confirmed),
          operatorReference: normalized.operatorReference,
          occurredAt: occurredAt.toISOString(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  /**
   * Reads the selected account, the count of every administrator row and the
   * singleton receipt inside the caller's transaction.
   */
  private async readGate(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<InitialAdministratorGate> {
    const candidate = await tx.user.findUnique({
      where: { id: userId },
      select: AUTHORITY_ACCOUNT_SELECT,
    });
    const administratorCount = await tx.user.count({
      where: { role: UserRole.ADMIN },
    });
    const receipt = await tx.initialAdministratorProvisioning.findUnique({
      where: { id: INITIAL_ADMINISTRATOR_RECEIPT_ID },
    });

    return {
      candidate,
      administratorCount,
      receiptPresent: receipt !== null,
    };
  }
}
