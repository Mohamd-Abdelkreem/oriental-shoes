"use client";

import type { UserStatus } from "@template/contracts";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/features/auth/hooks/auth.hooks";
import {
  defaultWorkspacePath,
  sanitizeReturnPath,
} from "@/features/auth/utils/safe-return-path";
import { getApiError } from "@/services/api/api-client";

import {
  requiresExplicitReauthentication,
  useFreshSessionEntry,
} from "./protected-route";
import { SessionLoader } from "./session-loader";

type AccountStateStatus = Extract<
  UserStatus,
  "PENDING_APPROVAL" | "REJECTED" | "SUSPENDED"
>;

export type AccountStateRouteState =
  | { readonly kind: "pending" }
  | { readonly kind: "error" }
  | { readonly kind: "redirecting"; readonly target: string }
  | { readonly kind: "authorized" };

/**
 * The pure private-state decision. Only the matching account state renders the
 * private card; another restricted state goes to its own status path and a
 * business-eligible identity goes to its workspace.
 */
export const resolveAccountStateRouteState = (
  session: Readonly<{
    isPending: boolean;
    isFetched: boolean;
    isError: boolean;
  }>,
  account: ReturnType<typeof useSession>["data"] | null,
  status: AccountStateStatus,
  returnTo: string,
): AccountStateRouteState => {
  if (session.isPending || !session.isFetched) return { kind: "pending" };
  if (session.isError) return { kind: "error" };
  if (account === null || account === undefined) {
    const safe = sanitizeReturnPath(returnTo);
    return {
      kind: "redirecting",
      target:
        safe === null
          ? "/auth/login"
          : `/auth/login?returnTo=${encodeURIComponent(safe)}`,
    };
  }
  if (account.user.status !== status) {
    return {
      kind: "redirecting",
      target: defaultWorkspacePath(account.user),
    };
  }
  return { kind: "authorized" };
};

/**
 * The private status wrapper. It uses the shared session subscription and
 * never performs a public email or status lookup.
 */
export function AccountStateRoute({
  children,
  status,
}: Readonly<{
  children: ReactNode;
  status: AccountStateStatus;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession({ enabled: false });
  const { entry, retry } = useFreshSessionEntry();

  const state =
    entry.kind === "failed"
      ? ({ kind: "error" } as const)
      : entry.kind !== "resolved" || session.fetchStatus !== "idle"
        ? ({ kind: "pending" } as const)
        : resolveAccountStateRouteState(
            session,
            session.data,
            status,
            pathname,
          );

  const redirectTarget = state.kind === "redirecting" ? state.target : null;

  useEffect(() => {
    if (redirectTarget !== null) router.replace(redirectTarget as Route);
  }, [redirectTarget, router]);

  if (state.kind === "error") {
    const error = getApiError(
      entry.kind === "failed" ? entry.error : session.error,
    );
    return (
      <div className="route-state">
        <p className="form-notice form-notice--error" role="alert">
          {error.message}
        </p>
        {error.requestId.length === 0 ? null : (
          <small>رقم الطلب: {error.requestId}</small>
        )}
        {requiresExplicitReauthentication(error.code) ? (
          <a className="button" href="/auth/login">
            تسجيل الدخول مرة أخرى
          </a>
        ) : (
          <button className="button" type="button" onClick={retry}>
            إعادة المحاولة
          </button>
        )}
      </div>
    );
  }

  if (state.kind !== "authorized") {
    return <SessionLoader />;
  }

  return children;
}
