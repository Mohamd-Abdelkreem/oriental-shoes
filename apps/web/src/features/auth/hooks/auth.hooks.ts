import { CanceledError } from "axios";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type {
  AuthUserData,
  ChangePasswordBody,
  EmailRequestBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
} from "@template/contracts";
import { useCallback, useEffect, useRef } from "react";

import { usersApi } from "@/features/users/api/users.api";
import {
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
  beginAuthSessionEpoch,
  clearAccessToken,
  getAccessToken,
  getApiError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
  type ApiError,
} from "@/services/api/api-client";

import { authApi } from "../api/auth.api";
import { replaceWithLogin } from "../utils/session-navigation";

export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;

const SESSION_STALE_TIME_MS = 60_000;
const SESSION_GC_TIME_MS = 300_000;

type ResetTokenValidationResponse = Awaited<
  ReturnType<typeof authApi.validateResetToken>
>;

const isExpectedAnonymousAuthError = (error: ApiError): boolean =>
  (error.statusCode === 400 && error.code === "BAD_REQUEST") ||
  (error.statusCode === 401 && error.code === "UNAUTHORIZED");

/**
 * Rejects work that no longer belongs to the captured credential-lifecycle
 * epoch. An obsolete result is a cancellation, never a publication.
 */
const assertCurrentEpoch = (expectedEpoch: number): void => {
  if (expectedEpoch !== getAuthSessionEpoch()) {
    throw new CanceledError("Obsolete authentication epoch.");
  }
};

const assertSessionSignal = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new CanceledError("The session request was cancelled.");
  }
};

/**
 * Reads the identity that currently owns the session cache. It is the actor
 * scope of a session-ending command.
 */
const readSessionActor = (queryClient: QueryClient): string | null =>
  queryClient.getQueryData<AuthUserData | null>(AUTH_SESSION_QUERY_KEY)?.user
    .id ?? null;

/**
 * The observer-preserving private cache clearing. The session Query object
 * survives, so an existing observer keeps its subscription and is notified when
 * the current identity is published later, while every other Query is removed.
 * The running mutation cache is never touched.
 */
const clearPrivateQueries = (queryClient: QueryClient): void => {
  queryClient.setQueryData<AuthUserData | null>(AUTH_SESSION_QUERY_KEY, null);
  const sessionQuery = queryClient
    .getQueryCache()
    .find({ queryKey: AUTH_SESSION_QUERY_KEY, exact: true });
  queryClient.removeQueries({
    predicate: (query) => query !== sessionQuery,
  });
};

/**
 * A newer same-subject account is never regressed by a delayed result.
 */
const preserveNewerSameSubjectVersion = (
  queryClient: QueryClient,
  account: AuthUserData | null,
): AuthUserData | null => {
  if (account === null) return null;
  const cached = queryClient.getQueryData<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
  );
  if (cached === undefined || cached === null) return account;
  if (cached.user.id !== account.user.id) return account;
  if (cached.user.accessVersion <= account.user.accessVersion) return account;
  return cached;
};

/**
 * The epoch/policy/subject/version-safe session publication. It returns the
 * canonical object that is current in the cache.
 */
const publishSessionAccount = (
  queryClient: QueryClient,
  account: AuthUserData,
  expectedEpoch: number,
): AuthUserData => {
  assertCurrentEpoch(expectedEpoch);
  const policy = getAuthSessionRestorePolicy();
  if (policy === "identity-changed") {
    throw new AuthIdentityChangedError();
  }
  if (policy !== "restore") {
    throw new AuthReauthenticationRequiredError();
  }
  const cached = queryClient.getQueryData<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
  );
  const published =
    cached !== undefined &&
    cached !== null &&
    cached.user.id === account.user.id &&
    cached.user.accessVersion > account.user.accessVersion
      ? cached
      : account;
  const canonical = queryClient.setQueryData<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
    published,
  );
  if (canonical === undefined || canonical === null) {
    throw new CanceledError("The session publication was superseded.");
  }
  return canonical;
};

/**
 * The single session read. The epoch is captured before any token or HTTP
 * work and the restore policy decides whether a read may happen at all.
 */
export const loadSession = async (
  signal?: AbortSignal,
): Promise<AuthUserData | null> => {
  const capturedEpoch = getAuthSessionEpoch();
  const policy = getAuthSessionRestorePolicy();

  if (policy === "signed-out") {
    assertCurrentEpoch(capturedEpoch);
    assertSessionSignal(signal);
    return null;
  }
  if (policy === "credential-required") {
    throw new AuthReauthenticationRequiredError();
  }
  if (policy === "identity-changed") {
    throw new AuthIdentityChangedError();
  }

  if (getAccessToken().kind === "missing") {
    try {
      await authApi.refresh(capturedEpoch, signal);
    } catch (error: unknown) {
      const apiError = getApiError(error);

      if (isExpectedAnonymousAuthError(apiError)) {
        clearAccessToken();
        return null;
      }
      throw error;
    }
    assertCurrentEpoch(capturedEpoch);
    assertSessionSignal(signal);
  }

  try {
    const account = await usersApi.getMe(signal);
    assertCurrentEpoch(capturedEpoch);
    return account;
  } catch (error: unknown) {
    const apiError = getApiError(error);

    if (isExpectedAnonymousAuthError(apiError)) {
      clearAccessToken();
      return null;
    }
    throw error;
  }
};

/**
 * The one options owner of the session key. The query function captures the
 * epoch before I/O, passes the signal and suppresses an obsolete result.
 */
export const sessionQueryOptions = (queryClient: QueryClient) =>
  queryOptions({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: async ({ signal }): Promise<AuthUserData | null> => {
      const account = await loadSession(signal);
      return preserveNewerSameSubjectVersion(queryClient, account);
    },
    staleTime: SESSION_STALE_TIME_MS,
    gcTime: SESSION_GC_TIME_MS,
    retry: false,
  });

export const reconcileBusinessDenial = async (
  queryClient: QueryClient,
  error: unknown,
  scope: Readonly<{ actorId: string; epoch: number }>,
): Promise<void> => {
  const { code } = getApiError(error);
  if (code !== "ACCOUNT_RESTRICTED" && code !== "DEPARTMENT_ACCESS_DENIED")
    return;
  const isCurrent = () =>
    scope.actorId.length > 0 &&
    scope.epoch === getAuthSessionEpoch() &&
    getAuthSessionRestorePolicy() === "restore" &&
    readSessionActor(queryClient) === scope.actorId;

  if (!isCurrent()) return;
  try {
    await queryClient.cancelQueries({
      queryKey: AUTH_SESSION_QUERY_KEY,
      exact: true,
    });
    if (!isCurrent()) return;
    // Session publication remains owned by the epoch-aware query function.
    await queryClient.fetchQuery({
      ...sessionQueryOptions(queryClient),
      staleTime: 0,
    });
  } catch {
    // The session query retains its read error. The operation keeps its denial.
  }
};

/**
 * The session subscription. A disabled observer never starts a background read
 * and never forces a rerender, but it still observes the same cache entry.
 */
export const useSession = (options?: Readonly<{ enabled?: boolean }>) => {
  const queryClient = useQueryClient();
  return useQuery({
    ...sessionQueryOptions(queryClient),
    enabled: options?.enabled ?? true,
  });
};

export function useLogin(): UseMutationResult<
  AuthUserData,
  unknown,
  LoginBody
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginBody): Promise<AuthUserData> => {
      const epoch = beginAuthSessionEpoch("credential-login");
      await queryClient.cancelQueries();
      assertCurrentEpoch(epoch);
      clearPrivateQueries(queryClient);
      assertCurrentEpoch(epoch);
      await authApi.login(body, epoch);
      assertCurrentEpoch(epoch);
      const account = await usersApi.getMe();
      assertCurrentEpoch(epoch);
      return publishSessionAccount(queryClient, account, epoch);
    },
  });
}

export const useRegister = () =>
  useMutation({ mutationFn: (body: RegisterBody) => authApi.register(body) });

export const useVerifyEmail = () =>
  useMutation({ mutationFn: (token: string) => authApi.verifyEmail(token) });

export const useResendVerification = () =>
  useMutation({
    mutationFn: (body: EmailRequestBody) => authApi.resendVerification(body),
  });

/**
 * A confirmed session ending. Only a confirmed success that still belongs to
 * the originating epoch/actor may cancel the old private reads and open the
 * confirmed-ending epoch.
 */
const assertEndingScope = (
  epoch: number,
  actor: string | null,
  queryClient: QueryClient,
): void => {
  assertCurrentEpoch(epoch);
  if (readSessionActor(queryClient) !== actor) {
    throw new CanceledError(
      "The confirmed session ending no longer matches the current account.",
    );
  }
};

const useSessionEndingMutation = <TVariables = void>(
  request: (variables: TVariables) => Promise<unknown>,
  business = false,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: TVariables): Promise<void> => {
      const epoch = getAuthSessionEpoch();
      const actor = readSessionActor(queryClient);
      try {
        await request(variables);
      } catch (error: unknown) {
        if (business && actor !== null) {
          await reconcileBusinessDenial(queryClient, error, {
            actorId: actor,
            epoch,
          });
        }
        throw error;
      }
      assertEndingScope(epoch, actor, queryClient);
      await queryClient.cancelQueries();
      assertEndingScope(epoch, actor, queryClient);
      beginAuthSessionEpoch("confirmed-ending");
      clearAccessToken();
      clearPrivateQueries(queryClient);
      replaceWithLogin();
    },
  });
};

export const useLogout = () => useSessionEndingMutation(() => authApi.logout());

export const useLogoutAll = () =>
  useSessionEndingMutation(() => authApi.logoutAll());

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (body: EmailRequestBody) => authApi.forgotPassword(body),
  });

export const useResetPassword = () =>
  useSessionEndingMutation<{ token: string; body: ResetPasswordBody }>(
    ({ token, body }) => authApi.resetPassword(token, body),
  );

export const useChangePassword = () =>
  useSessionEndingMutation<ChangePasswordBody>(
    (body) => authApi.changePassword(body),
    true,
  );

/**
 * The purpose-bound reset credential check. It is a zero-variable mutation, so
 * the credential never enters a query key, the mutation variables, the result
 * data or any retained cache entry.
 */
export const useValidateResetToken = (
  token: string,
): Readonly<{
  status: "idle" | "pending" | "success" | "error";
  isIdle: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: ResetTokenValidationResponse | undefined;
  error: unknown;
  retry: () => void;
}> => {
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const mutation = useMutation({
    mutationFn: async (): Promise<ResetTokenValidationResponse> => {
      const controller = controllerRef.current;
      const generation = generationRef.current;
      if (controller === null) {
        throw new CanceledError("The reset link check was cancelled.");
      }
      const response = await authApi.validateResetToken(
        token,
        controller.signal,
      );
      if (generationRef.current !== generation) {
        throw new CanceledError("The reset link check was superseded.");
      }
      return response;
    },
    gcTime: 0,
    retry: false,
  });
  const { mutate, reset } = mutation;

  const start = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    if (token.length === 0) {
      controllerRef.current = null;
      reset();
      return;
    }
    controllerRef.current = new AbortController();
    mutate(undefined);
  }, [mutate, reset, token]);

  useEffect(() => {
    start();
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [start]);

  return {
    status: mutation.status,
    isIdle: mutation.isIdle,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    data: mutation.data,
    error: mutation.error,
    retry: start,
  };
};
