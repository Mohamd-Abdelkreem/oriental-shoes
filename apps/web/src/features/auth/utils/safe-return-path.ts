import type { SafeUser } from "@template/contracts";

import { canEnterWorkspace } from "../model/account-access";

const ALLOWED_ROOTS = [
  "/admin",
  "/sales",
  "/approval",
  "/cutting",
  "/production",
  "/quality",
  "/warehouse",
] as const;
const CREDENTIAL_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "secret",
  "password",
]);

export const sanitizeReturnPath = (
  value: string | null | undefined,
): string | null => {
  if (value === undefined || value === null || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (
    value.includes("://") ||
    value.includes(String.fromCharCode(92)) ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://template.invalid");
    if (parsed.origin !== "https://template.invalid") return null;
    if (
      !ALLOWED_ROOTS.some(
        (root) =>
          parsed.pathname === root || parsed.pathname.startsWith(`${root}/`),
      )
    ) {
      return null;
    }
    for (const key of parsed.searchParams.keys()) {
      if (CREDENTIAL_QUERY_KEYS.has(key.toLowerCase())) return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
};

/**
 * The landing surface for the current account. A business-eligible account
 * lands in its own workspace; every restricted or malformed account lands on a
 * private status surface and is never guessed into an employee workspace.
 */
export const defaultWorkspacePath = (user: SafeUser): string => {
  switch (user.status) {
    case "PENDING_VERIFICATION":
      return "/auth/verify-email";
    case "PENDING_APPROVAL":
      return "/auth/pending-approval";
    case "REJECTED":
      return "/auth/rejected";
    case "SUSPENDED":
      return "/auth/suspended";
    case "ACTIVE":
      break;
  }
  if (!user.emailVerifiedAt) return "/auth/verify-email";
  if (user.role === "ADMIN") return "/admin/dashboard";

  const department = user.department;
  if (department) {
    return `/${department.toLowerCase()}/dashboard`;
  }
  return "/auth/pending-approval";
};

export const resolvePostLoginPath = (
  value: string | null | undefined,
  user: SafeUser,
): string => {
  const sanitized = sanitizeReturnPath(value);
  if (sanitized !== null && canEnterWorkspace(user, sanitized)) {
    return sanitized;
  }
  return defaultWorkspacePath(user);
};
