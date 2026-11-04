"use client";

import type { Department, SafeUser } from "@template/contracts";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SessionLoader } from "@/components/auth/session-loader";
import { useLogout, useSession } from "@/features/auth/hooks/auth.hooks";
import {
  canEnterWorkspace,
  hasBusinessAccess,
  workspaceDepartment,
} from "@/features/auth/model/account-access";
import { replaceWithLogin } from "@/features/auth/utils/session-navigation";
import { AppShell } from "@/features/prototype/components/app-shell";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import { getApiError } from "@/services/api/api-client";

/**
 * The workspace section of every employee department. Administration is not a
 * department, so it never appears in this map.
 */
const departmentRoles: Readonly<Record<Department, Role>> = {
  SALES: "sales",
  APPROVAL: "approval",
  CUTTING: "cutting",
  PRODUCTION: "production",
  QUALITY: "quality",
  WAREHOUSE: "warehouse",
};

/**
 * The section the account itself owns. An employee is always presented with its
 * own approved department, so a pathname can never change that identity.
 */
const ownDepartmentRole = (user: SafeUser): Role => {
  const department = user.department;
  return department === null ? "admin" : departmentRoles[department];
};

/**
 * The section the shell presents for the current account. Administration
 * follows the route it selected inside the already-authorized workspace, and an
 * employee follows its own department. A route the account may not enter never
 * changes the presented identity.
 */
const resolveShellRole = (user: SafeUser, pathname: string): Role => {
  if (!canEnterWorkspace(user, pathname)) return ownDepartmentRole(user);
  if (user.role !== "ADMIN") return ownDepartmentRole(user);
  const department = workspaceDepartment(pathname);
  return department === null ? "admin" : departmentRoles[department];
};

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const logout = useLogout();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const user = session.data?.user ?? null;

  if (user === null || !hasBusinessAccess(user)) return <SessionLoader />;

  const signOut = (): void => {
    setLogoutError(null);

    logout.mutate(undefined, {
      onSuccess: replaceWithLogin,
      onError: (error: unknown) => {
        const apiError = getApiError(error);
        setLogoutError(
          `${apiError.message} Server sign-out could not be confirmed. Your session may still be active.`,
        );
      },
    });
  };

  return (
    <AppShell
      role={resolveShellRole(user, pathname)}
      accountName={user.fullName}
      canAccessAllSections={user.role === "ADMIN"}
      onSignOut={signOut}
      signingOut={logout.isPending}
      signOutError={logoutError}
    >
      {children}
    </AppShell>
  );
}
