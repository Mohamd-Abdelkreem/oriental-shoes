import type { Department, Prisma } from "@template/database";
import { UserRole, UserStatus } from "@template/database";

import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import {
  AccountRestrictedError,
  DepartmentAccessDeniedError,
} from "./auth.errors.js";

/**
 * The single current-account selection used by the identity guard, the business
 * guard and every protected transaction. It never selects a credential or a
 * token field.
 */
export const AUTHORITY_ACCOUNT_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  department: true,
  staffApprovedAt: true,
  staffApprovedById: true,
  accessVersion: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type AuthorityAccount = Prisma.UserGetPayload<{
  select: typeof AUTHORITY_ACCOUNT_SELECT;
}>;

/**
 * Acquires the account row locks in one fixed ascending order so concurrent
 * authority changes serialize consistently instead of deadlocking. The mode
 * selects one of two fixed parameterized query texts; no SQL identifier is
 * interpolated and no unsafe raw API is used.
 */
export const lockAccountRows = async (
  tx: Prisma.TransactionClient,
  userIds: readonly string[],
  mode: "read" | "write",
): Promise<void> => {
  const canonicalIds = [
    ...new Set(userIds.map((userId) => userId.trim().toLowerCase())),
  ]
    .filter((userId) => userId.length > 0)
    .sort();

  for (const userId of canonicalIds) {
    if (mode === "write") {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR SHARE`;
    }
  }
};

/**
 * Loads the current extant account inside the caller's transaction. The caller
 * establishes the appropriate lock.
 */
export const loadIdentityAccount = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AuthorityAccount> => {
  const account = await tx.user.findUnique({
    where: { id: userId },
    select: AUTHORITY_ACCOUNT_SELECT,
  });

  if (account === null) {
    throw new UnauthorizedException(
      "The account is unavailable. Sign in again.",
    );
  }

  return account;
};

/**
 * Asserts current business eligibility. A current verified active administrator
 * is allowed across every department; an employee additionally needs its
 * approval evidence and exactly one department.
 */
export const assertBusinessAuthority = (
  account: AuthorityAccount,
  department?: Department,
): void => {
  if (account.role === UserRole.ADMIN) {
    if (
      account.status !== UserStatus.ACTIVE ||
      account.emailVerifiedAt === null
    ) {
      throw new AccountRestrictedError();
    }
    return;
  }

  if (
    account.status !== UserStatus.ACTIVE ||
    account.emailVerifiedAt === null ||
    account.staffApprovedAt === null ||
    account.staffApprovedById === null ||
    account.department === null
  ) {
    throw new AccountRestrictedError();
  }

  if (department !== undefined && account.department !== department) {
    throw new DepartmentAccessDeniedError();
  }
};
