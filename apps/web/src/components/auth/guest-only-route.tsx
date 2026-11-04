"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { AuthUserData } from "@template/contracts";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AUTH_SESSION_QUERY_KEY,
  useSession,
} from "@/features/auth/hooks/auth.hooks";
import { hasBusinessAccess } from "@/features/auth/model/account-access";
import { resolvePostLoginPath } from "@/features/auth/utils/safe-return-path";
import { getBrowserLocation } from "@/services/api/browser-location";
import {
  getApiError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
  type AuthSessionRestorePolicy,
} from "@/services/api/api-client";

import { requiresExplicitReauthentication } from "./protected-route";
import { SessionLoader } from "./session-loader";

type SessionSnapshot = Readonly<{
  isPending: boolean;
  isFetched: boolean;
  isError: boolean;
}>;

export type GuestOnlyRouteState =
  | { readonly kind: "pending" }
  | { readonly kind: "error" }
  | { readonly kind: "redirecting"; readonly target: string }
  | { readonly kind: "authorized" };

/**
 * The local presentation lifetime of one auth-path entry. It holds no account
 * data and grants no private authority.
 */
export type GuestOnlyPresentation = Readonly<{
  policy: AuthSessionRestorePolicy;
  retainChildren: boolean;
  pathname?: string;
  returnTo?: string | null;
  credentialCompletedSinceEntry?: boolean;
}>;

/**
 * The pure guest-route decision. A closed credential policy or either local
 * reauthentication code keeps the public credential forms usable. In restore
 * mode a business-eligible identity is sent to its safe destination, and a
 * restricted identity is only sent away when it completed credentials on the
 * login path during this entry.
 */
export const resolveGuestOnlyRouteState = (
  session: SessionSnapshot,
  account: AuthUserData | null,
  errorCode: string | null = null,
  presentation?: GuestOnlyPresentation,
): GuestOnlyRouteState => {
  const policy = presentation?.policy ?? "restore";
  const retainChildren = presentation?.retainChildren ?? false;
  const pathname = presentation?.pathname ?? "";
  const returnTo = presentation?.returnTo ?? null;
  const credentialCompletedSinceEntry =
    presentation?.credentialCompletedSinceEntry ?? false;

  if (policy !== "restore") return { kind: "authorized" };
  if (requiresExplicitReauthentication(errorCode))
    return { kind: "authorized" };

  const isSettled = session.isFetched && !session.isPending && !session.isError;
  if (isSettled && account !== null) {
    const businessEligible = hasBusinessAccess(account.user);
    const completedOnLogin =
      pathname === "/auth/login" && credentialCompletedSinceEntry;
    if (!businessEligible && !completedOnLogin) {
      return { kind: "authorized" };
    }
    return {
      kind: "redirecting",
      target: resolvePostLoginPath(
        pathname === "/auth/login" ? returnTo : null,
        account.user,
      ),
    };
  }

  if (retainChildren) return { kind: "authorized" };
  if (session.isPending || !session.isFetched) return { kind: "pending" };
  if (session.isError) return { kind: "error" };
  return { kind: "authorized" };
};

const GuestOnlyRouteBody = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const session = useSession();

  const returnTo = searchParams.get("returnTo");

  const [entry, setEntry] = useState(() => ({
    pathname,
    entryEpoch: getAuthSessionEpoch(),
  }));
  if (entry.pathname !== pathname) {
    setEntry({ pathname, entryEpoch: getAuthSessionEpoch() });
  }

  const [committedEntry, setCommittedEntry] = useState<typeof entry | null>(
    null,
  );
  const liveEntry = useRef(entry);
  const applied = useRef<{
    entry: typeof entry;
    epoch: number;
    target: string;
  } | null>(null);
  useLayoutEffect(() => {
    liveEntry.current = entry;
  }, [entry]);

  const policy = getAuthSessionRestorePolicy();
  /**
   * The credential-lifecycle epoch is module state, so a plain render-time
   * read can lag the live value by one render phase. It is therefore held in
   * state and adjusted during render, so the committed render always carries
   * the current epoch.
   */
  const [observedEpoch, setObservedEpoch] = useState(() =>
    getAuthSessionEpoch(),
  );
  const liveEpoch = getAuthSessionEpoch();
  if (liveEpoch !== observedEpoch) {
    setObservedEpoch(liveEpoch);
  }
  const currentEpoch = observedEpoch;
  const credentialCompletedSinceEntry =
    policy === "restore" && currentEpoch !== entry.entryEpoch;

  const errorCode = session.isError ? getApiError(session.error).code : null;

  const sessionSnapshot = {
    isPending: session.isPending,
    isFetched: session.isFetched,
    isError: session.isError,
  };

  const baseState = resolveGuestOnlyRouteState(
    sessionSnapshot,
    session.data ?? null,
    errorCode,
    {
      policy,
      retainChildren: false,
      pathname,
      returnTo,
      credentialCompletedSinceEntry,
    },
  );

  if (baseState.kind === "authorized" && committedEntry !== entry) {
    setCommittedEntry(entry);
  }

  const state = resolveGuestOnlyRouteState(
    sessionSnapshot,
    session.data ?? null,
    errorCode,
    {
      policy,
      retainChildren: committedEntry === entry,
      pathname,
      returnTo,
      credentialCompletedSinceEntry,
    },
  );

  const redirectTarget = state.kind === "redirecting" ? state.target : null;

  const capturedAccount = session.data;

  useEffect(() => {
    if (redirectTarget === null || capturedAccount == null) return;
    if (
      applied.current?.entry === entry &&
      applied.current.epoch === currentEpoch &&
      applied.current.target === redirectTarget
    )
      return;

    const live = getBrowserLocation();
    if (live?.pathname !== pathname) return;
    if (new URLSearchParams(live.search).get("returnTo") !== returnTo) return;
    if (liveEntry.current !== entry || entry.pathname !== pathname) return;
    if (getAuthSessionEpoch() !== currentEpoch) return;
    if (getAuthSessionRestorePolicy() !== "restore") return;

    const current = queryClient.getQueryState<AuthUserData | null>(
      AUTH_SESSION_QUERY_KEY,
    );
    if (current?.status !== "success" || current.data !== capturedAccount)
      return;
    const recomputed = resolvePostLoginPath(
      pathname === "/auth/login" ? returnTo : null,
      current.data.user,
    );
    if (recomputed !== redirectTarget) return;

    applied.current = { entry, epoch: currentEpoch, target: redirectTarget };
    router.replace(redirectTarget as Route);
  }, [
    capturedAccount,
    currentEpoch,
    entry,
    pathname,
    queryClient,
    redirectTarget,
    returnTo,
    router,
  ]);

  if (state.kind === "error") {
    const error = getApiError(session.error);
    return (
      <div className="route-state">
        <p className="form-notice form-notice--error" role="alert">
          {error.message}
        </p>
        {error.requestId.length === 0 ? null : (
          <small>رقم الطلب: {error.requestId}</small>
        )}
        <button
          className="button"
          type="button"
          onClick={() => {
            void session.refetch();
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return state.kind === "authorized" ? children : <SessionLoader />;
};

/**
 * The sole post-login navigation owner. The exported component stays a stable
 * Suspense wrapper so the reached auth children never remount.
 */
export function GuestOnlyRoute({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<SessionLoader />}>
      <GuestOnlyRouteBody>{children}</GuestOnlyRouteBody>
    </Suspense>
  );
}
