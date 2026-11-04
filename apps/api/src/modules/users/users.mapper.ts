import type { SafeUser } from "@template/contracts";
import type {
  Department,
  Prisma,
  UserRole,
  UserStatus,
} from "@template/database";

export const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  department: true,
  staffApprovedAt: true,
  accessVersion: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type SafeUserRecord = Prisma.UserGetPayload<{
  select: typeof SAFE_USER_SELECT;
}>;

/**
 * The public projection reads only these fields. The internal approver identity
 * and every credential or token field stay out of the browser-visible result.
 */
export type SafeUserSource = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  department: Department | null;
  staffApprovedAt: Date | null;
  accessVersion: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const mapSafeUser = (user: SafeUserSource): SafeUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  department: user.department,
  staffApprovedAt: user.staffApprovedAt?.toISOString() ?? null,
  accessVersion: user.accessVersion,
  emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
