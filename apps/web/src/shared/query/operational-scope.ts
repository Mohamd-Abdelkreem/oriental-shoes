"use client";

import { useEffect } from "react";
import axios, { CanceledError } from "axios";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { authUserDataSchema } from "@template/contracts";
import {
  AUTH_SESSION_QUERY_KEY,
  useSession,
} from "@/features/auth/hooks/auth.hooks";
import { hasBusinessAccess } from "@/features/auth/model/account-access";
import {
  assertAuthSessionSubject,
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
} from "@/services/api/api-client";

export type OperationalScope = Readonly<{
  actorId: string;
  accessVersion: number;
  epoch: number;
}>;
export const readOperationalScope = (
  client: QueryClient,
): OperationalScope | null => {
  const session = client.getQueryState(AUTH_SESSION_QUERY_KEY);
  if (session?.status !== "success" || session.error !== null) return null;
  const parsed = authUserDataSchema.safeParse(session.data);
  if (!parsed.success) return null;
  const { user } = parsed.data;
  if (
    !hasBusinessAccess(user) ||
    (user.role !== "ADMIN" && user.department !== "SALES")
  )
    return null;
  const epoch = getAuthSessionEpoch();
  if (getAuthSessionRestorePolicy() !== "restore") return null;
  try {
    assertAuthSessionSubject(user.id, epoch);
  } catch (error: unknown) {
    if (
      axios.isCancel(error) ||
      error instanceof AuthIdentityChangedError ||
      error instanceof AuthReauthenticationRequiredError
    )
      return null;
    throw error;
  }
  return { actorId: user.id, accessVersion: user.accessVersion, epoch };
};
export const isCurrentOperationalScope = (
  client: QueryClient,
  scope: OperationalScope,
): boolean => {
  const current = readOperationalScope(client);
  return (
    current !== null &&
    current.actorId === scope.actorId &&
    current.accessVersion === scope.accessVersion &&
    current.epoch === scope.epoch
  );
};
export const assertCurrentOperationalScope = (
  client: QueryClient,
  scope: OperationalScope,
): void => {
  if (!isCurrentOperationalScope(client, scope))
    throw new CanceledError("Obsolete customer/draft session scope.");
};
export const useOperationalScope = (): OperationalScope | null => {
  const client = useQueryClient();
  useSession();
  const scope = readOperationalScope(client);
  const actorId = scope?.actorId,
    accessVersion = scope?.accessVersion,
    epoch = scope?.epoch;
  useEffect(() => {
    if (
      actorId === undefined ||
      accessVersion === undefined ||
      epoch === undefined
    )
      return;
    const captured = { actorId, accessVersion, epoch };
    return () => {
      if (isCurrentOperationalScope(client, captured)) return;
      const key = ["customer-drafts", actorId, accessVersion, epoch];
      void client.cancelQueries({ queryKey: key }).then(() => {
        if (!isCurrentOperationalScope(client, captured))
          client.removeQueries({ queryKey: key });
      });
    };
  }, [client, actorId, accessVersion, epoch]);
  return scope;
};
