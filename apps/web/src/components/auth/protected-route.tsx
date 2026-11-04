"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@template/contracts";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AUTH_SESSION_QUERY_KEY,
  sessionQueryOptions,
  useSession,
} from "@/features/auth/hooks/auth.hooks";
import {
  canEnterWorkspace,
  hasBusinessAccess,
  workspaceDepartment,
} from "@/features/auth/model/account-access";
import {
  defaultWorkspacePath,
  sanitizeReturnPath,
} from "@/features/auth/utils/safe-return-path";
import { getApiError, getAuthSessionEpoch } from "@/services/api/api-client";

import { SessionLoader } from "./session-loader";

type SessionSnapshot = Readonly<{
  isPending: boolean;
  isFetched: boolean;
  isError: boolean;
}>;

export type ProtectedRouteState =
  | { readonly kind: "pending" }
  | { readonly kind: "error" }
  | { readonly kind: "redirecting"; readonly target: string }
  | { readonly kind: "authorized" };

/**
 * The local classifications that require an explicit credential instead of a
 * passive retry.
 */
export const REAUTHENTICATION_ERROR_CODES = [
  "AUTH_IDENTITY_CHANGED",
  "AUTH_REAUTHENTICATION_REQUIRED",
] as const;

export const requiresExplicitReauthentication = (
  errorCode: string | null,
): boolean =>
  errorCode !== null &&
  (REAUTHENTICATION_ERROR_CODES as readonly string[]).includes(errorCode);

const pathWithoutQuery = (pathname: string): string =>
  pathname.split(/[?#]/, 1)[0] ?? "";

const isAdministrationPath = (pathname: string): boolean => {
  const path = pathWithoutQuery(pathname);
  return path === "/admin" || path.startsWith("/admin/");
};

/**
 * The workspace root a protected path belongs to. Administration and the
 * employee departments are workspace roots; the print boundary keeps its own
 * existing ADMIN guard and is not an employee department.
 */
const protectedWorkspaceRoot = (pathname: string): string | null => {
  if (isAdministrationPath(pathname)) return "/admin";
  const department = workspaceDepartment(pathname);
  return department === null ? null : `/${department.toLowerCase()}`;
};

/**
 * The pure protected-route decision. A restricted account is sent to its own
 * status surface, a malformed or wrongly-placed account is denied, and only a
 * business-eligible account inside its permitted root is authorized.
 */
export const resolveProtectedRouteState = (
  session: SessionSnapshot,
  account: ReturnType<typeof useSession>["data"] | null,
  returnTo: string,
  allowedRoles: readonly UserRole[] | undefined,
): ProtectedRouteState => {
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
  if (account.user.status !== "ACTIVE") {
    return { kind: "redirecting", target: defaultWorkspacePath(account.user) };
  }
  if (!hasBusinessAccess(account.user)) {
    return { kind: "redirecting", target: "/unauthorized" };
  }
  if (allowedRoles !== undefined && !allowedRoles.includes(account.user.role)) {
    return { kind: "redirecting", target: "/unauthorized" };
  }
  const root = protectedWorkspaceRoot(returnTo);
  if (root !== null && !canEnterWorkspace(account.user, root)) {
    return { kind: "redirecting", target: "/unauthorized" };
  }
  return { kind: "authorized" };
};

export type FreshSessionEntry =
  | { readonly kind: "pending" }
  | { readonly kind: "resolved" }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * The fresh-entry read owner shared by the protected guards. Each pathname or
 * epoch entry owns one cancel-then-fetch cycle, and an obsolete entry can never
 * cancel a newer one.
 */
export const useFreshSessionEntry = (): Readonly<{
  entry: FreshSessionEntry;
  retry: () => void;
}> => {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const generationRef = useRef(0);
  const [retryCount, setRetryCount] = useState(0);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    readonly key: string;
    readonly error: unknown;
  } | null>(null);

  const [capturedEpoch, setCapturedEpoch] = useState(() =>
    getAuthSessionEpoch(),
  );
  const currentEpoch = getAuthSessionEpoch();
  if (currentEpoch !== capturedEpoch) {
    setCapturedEpoch(currentEpoch);
  }

  const entryKey = `${pathname}|${String(capturedEpoch)}|${String(retryCount)}`;

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const epoch = capturedEpoch;
    let active = true;

    const isCurrent = (): boolean =>
      active &&
      generationRef.current === generation &&
      getAuthSessionEpoch() === epoch;

    const run = async (): Promise<void> => {
      try {
        await queryClient.cancelQueries({
          queryKey: AUTH_SESSION_QUERY_KEY,
          exact: true,
        });
      } catch {
        // A cancelled cleanup must not fail the entry; the tuple check below
        // decides whether this entry may still publish.
      }
      if (!isCurrent()) return;
      try {
        await queryClient.fetchQuery({
          ...sessionQueryOptions(queryClient),
          staleTime: 0,
        });
      } catch (error: unknown) {
        if (!isCurrent()) return;
        setFailure({ key: entryKey, error });
        return;
      }
      if (!isCurrent()) return;
      setResolvedKey(entryKey);
    };

    void run();

    return () => {
      active = false;
    };
  }, [capturedEpoch, entryKey, queryClient]);

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const entry: FreshSessionEntry =
    failure !== null && failure.key === entryKey
      ? { kind: "failed", error: failure.error }
      : resolvedKey === entryKey
        ? { kind: "resolved" }
        : { kind: "pending" };

  return { entry, retry };
};

const RouteStateFeedback = ({
  error,
  onRetry,
}: Readonly<{
  error: unknown;
  onRetry: () => void;
}>) => {
  const apiError = getApiError(error);
  if (requiresExplicitReauthentication(apiError.code)) {
    return (
      <div className="route-state">
        <p className="form-notice form-notice--error" role="alert">
          {apiError.message}
        </p>
        <a className="button" href="/auth/login">
          تسجيل الدخول مرة أخرى
        </a>
      </div>
    );
  }
  return (
    <div className="route-state">
      <p className="form-notice form-notice--error" role="alert">
        {apiError.message}
      </p>
      {apiError.requestId.length === 0 ? null : (
        <small>رقم الطلب: {apiError.requestId}</small>
      )}
      <button className="button" type="button" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
};

export function ProtectedRoute({
  allowedRoles,
  children,
}: Readonly<{
  allowedRoles?: readonly UserRole[];
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession({ enabled: false });
  const { entry, retry } = useFreshSessionEntry();
  const scope = JSON.stringify([
    pathname,
    getAuthSessionEpoch(),
    session.data?.user.id,
  ]);
  const [retainedScope, setRetainedScope] = useState<string | null>(null);

  const state =
    entry.kind === "failed"
      ? ({ kind: "error" } as const)
      : entry.kind !== "resolved" || session.fetchStatus !== "idle"
        ? ({ kind: "pending" } as const)
        : resolveProtectedRouteState(
            session,
            session.data ?? null,
            pathname,
            allowedRoles,
          );

  const authorized = state.kind === "authorized";
  const redirectTarget = state.kind === "redirecting" ? state.target : null;
  if (authorized && retainedScope !== scope) {
    setRetainedScope(scope);
  } else if (
    retainedScope !== null &&
    (retainedScope !== scope || redirectTarget !== null)
  ) {
    setRetainedScope(null);
  }

  useEffect(() => {
    if (redirectTarget !== null) router.replace(redirectTarget as Route);
  }, [redirectTarget, router]);

  return (
    <>
      {state.kind === "error" ? (
        <RouteStateFeedback
          error={entry.kind === "failed" ? entry.error : session.error}
          onRetry={retry}
        />
      ) : authorized ? null : (
        <SessionLoader />
      )}
      {authorized || (retainedScope === scope && redirectTarget === null) ? (
        <div
          hidden={!authorized}
          inert={!authorized}
          style={authorized ? { display: "contents" } : undefined}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
