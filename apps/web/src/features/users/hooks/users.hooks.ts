import { CanceledError } from "axios";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { AuthUserData, UpdateProfileBody } from "@template/contracts";

import {
  AUTH_SESSION_QUERY_KEY,
  reconcileBusinessDenial,
} from "@/features/auth/hooks/auth.hooks";
import {
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
} from "@/services/api/api-client";

import { usersApi } from "../api/users.api";

/**
 * The identity that currently owns the session cache. It is the actor scope of
 * an identity mutation.
 */
const readSessionActor = (queryClient: QueryClient) =>
  queryClient.getQueryData<AuthUserData | null>(AUTH_SESSION_QUERY_KEY)?.user
    .id ?? null;

/**
 * A late result of another account or another epoch never publishes and never
 * announces a confirmed effect in the current scope.
 */
const assertProfileScope = (
  epoch: number,
  actor: string | null,
  queryClient: QueryClient,
): void => {
  if (epoch !== getAuthSessionEpoch()) {
    throw new CanceledError("Obsolete authentication epoch.");
  }
  const policy = getAuthSessionRestorePolicy();
  if (policy === "identity-changed") {
    throw new AuthIdentityChangedError();
  }
  if (policy !== "restore") {
    throw new AuthReauthenticationRequiredError();
  }
  if (readSessionActor(queryClient) !== actor) {
    throw new CanceledError(
      "The confirmed profile result no longer matches the current account.",
    );
  }
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProfileBody): Promise<AuthUserData> => {
      const epoch = getAuthSessionEpoch();
      const actor = readSessionActor(queryClient);
      let account: AuthUserData;
      try {
        account = await usersApi.updateMe(body);
      } catch (error: unknown) {
        if (actor !== null) {
          await reconcileBusinessDenial(queryClient, error, {
            actorId: actor,
            epoch,
          });
        }
        throw error;
      }
      assertProfileScope(epoch, actor, queryClient);
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
        throw new CanceledError("The profile publication was superseded.");
      }
      return canonical;
    },
  });
};
