"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SessionLoader } from "@/components/auth/session-loader";
import { useLogout, useSession } from "@/features/auth/hooks/auth.hooks";
import { replaceWithLogin } from "@/features/auth/utils/session-navigation";
import { AppShell } from "@/features/prototype/components/app-shell";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import { getApiError } from "@/services/api/api-client";

const workspacePaths: [string, Role][] = [
  ["/admin", "admin"],
  ["/sales", "sales"],
  ["/approval", "approval"],
  ["/cutting", "cutting"],
  ["/production", "production"],
  ["/special-operations", "special"],
  ["/quality", "quality"],
  ["/warehouse", "warehouse"],
];

function roleForPath(pathname: string): Role {
  const role = workspacePaths.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"),
  )?.[1];
  if (role === undefined) throw new Error("Unknown workspace route");
  return role;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const logout = useLogout();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const user = session.data?.user ?? null;

  if (user === null) return <SessionLoader />;

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
      role={roleForPath(pathname)}
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
