import type {
  StaffDecisionsData,
  StaffHistoryQuery,
  StaffListData,
  StaffListQuery,
} from "@template/contracts";
import { UserRole, UserStatus, type Prisma } from "@template/database";

import {
  buildPaginationMeta,
  parsePaginationQuery,
} from "../../core/pagination/index.js";
import { mapSafeUser, SAFE_USER_SELECT } from "../users/users.mapper.js";
import { mapStaffDecision, STAFF_DECISION_SELECT } from "./staff.mapper.js";

/**
 * The narrow query dependency. A bounded read never uses a root database
 * client inside the caller's transaction.
 */
export type StaffQueryClient = Pick<
  Prisma.TransactionClient,
  "user" | "staffDecision"
>;

const PENDING_STAFF_WHERE = {
  role: UserRole.USER,
  status: UserStatus.PENDING_APPROVAL,
  emailVerifiedAt: { not: null },
} as const satisfies Prisma.UserWhereInput;

/**
 * Escapes the literal backslash, percent and underscore characters so the
 * directory search matches them as literal text instead of SQL wildcards.
 */
export const escapeStaffSearch = (search: string): string =>
  search.replace(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * Builds the single row/count filter of the directory. The scope selects the
 * verified pending employees or every existing account, and the search is a
 * case-insensitive literal substring over the name, the email and the phone.
 */
export const buildStaffWhere = (
  query: StaffListQuery,
): Prisma.UserWhereInput => {
  const scope: Prisma.UserWhereInput =
    query.scope === "pending" ? { ...PENDING_STAFF_WHERE } : {};

  const search = query.search;
  if (search === undefined) {
    return scope;
  }

  const escaped = escapeStaffSearch(search);

  return {
    ...scope,
    OR: [
      { fullName: { contains: escaped, mode: "insensitive" } },
      { email: { contains: escaped, mode: "insensitive" } },
      { phone: { contains: escaped, mode: "insensitive" } },
    ],
  };
};

/**
 * Reads one bounded directory page and the independent pending count from the
 * same transaction snapshot.
 */
export const findStaffPage = async (
  tx: StaffQueryClient,
  query: StaffListQuery,
): Promise<StaffListData> => {
  const pagination = parsePaginationQuery({
    page: query.page,
    limit: query.limit,
  });
  const where = buildStaffWhere(query);

  const total = await tx.user.count({ where });
  const rows = await tx.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.skip,
    take: pagination.take,
    select: SAFE_USER_SELECT,
  });
  const pendingCount = await tx.user.count({
    where: { ...PENDING_STAFF_WHERE },
  });

  return {
    staff: rows.map(mapSafeUser),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total,
    }),
    pendingCount,
  };
};

/**
 * Reads one bounded page of the retained decisions of a single target. An
 * account without decisions is an empty success, not a missing target.
 */
export const findStaffDecisionPage = async (
  tx: StaffQueryClient,
  targetUserId: string,
  query: StaffHistoryQuery,
): Promise<StaffDecisionsData> => {
  const pagination = parsePaginationQuery({
    page: query.page,
    limit: query.limit,
  });
  const where = { targetId: targetUserId };

  const total = await tx.staffDecision.count({ where });
  const rows = await tx.staffDecision.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: pagination.skip,
    take: pagination.take,
    select: STAFF_DECISION_SELECT,
  });

  return {
    decisions: rows.map(mapStaffDecision),
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total,
    }),
  };
};
