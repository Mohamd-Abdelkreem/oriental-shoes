import {
  departmentSchema,
  type Department,
  type SafeUser,
} from "@template/contracts";

const ADMIN_ROOT_SEGMENT = "admin";

/**
 * Workspace route roots are the lowercase department names. Administration is
 * not a department, so it never appears in this map.
 */
const DEPARTMENT_ROOTS: Readonly<Record<Department, string>> = {
  SALES: "/sales",
  APPROVAL: "/approval",
  CUTTING: "/cutting",
  PRODUCTION: "/production",
  QUALITY: "/quality",
  WAREHOUSE: "/warehouse",
};

const DEPARTMENT_BY_SEGMENT: Readonly<Record<string, Department | undefined>> =
  Object.fromEntries(
    departmentSchema.options.map((department) => [
      DEPARTMENT_ROOTS[department].slice(1),
      department,
    ]),
  );

const firstPathSegment = (pathname: string): string => {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? "";
  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, "");
  return withoutLeadingSlash.split("/")[0] ?? "";
};

/**
 * A current business-eligible account: verified and active. Administrators are
 * exempt from the employee approval/assignment requirements; employees need
 * both an approval timestamp and exactly one department. A missing value is
 * treated as absent, so malformed authority is denied instead of repaired.
 */
export const hasBusinessAccess = (user: SafeUser): boolean => {
  if (user.status !== "ACTIVE") return false;
  if (!user.emailVerifiedAt) return false;
  if (user.role === "ADMIN") return true;
  return Boolean(user.department) && Boolean(user.staffApprovedAt);
};

/**
 * The employee department a pathname belongs to, or null when the path is not
 * a department root. `/admin` is administration, not a department.
 */
export const workspaceDepartment = (pathname: string): Department | null => {
  const segment = firstPathSegment(pathname);
  if (segment === "") return null;
  return DEPARTMENT_BY_SEGMENT[segment] ?? null;
};

/**
 * Whether the account may enter the given workspace path. Administration is
 * administrator-only, an employee enters only its own department root, and an
 * administrator may also return to an agreed employee workspace.
 */
export const canEnterWorkspace = (
  user: SafeUser,
  pathname: string,
): boolean => {
  if (!hasBusinessAccess(user)) return false;

  const segment = firstPathSegment(pathname);
  if (segment === ADMIN_ROOT_SEGMENT) return user.role === "ADMIN";

  const department = DEPARTMENT_BY_SEGMENT[segment];
  if (department === undefined) return false;
  if (user.role === "ADMIN") return true;

  return user.department === department;
};
