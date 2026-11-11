"use client";
import type { ManufacturingDepartment } from "@template/contracts";

import { useEffect } from "react";
import axios, { CanceledError } from "axios";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { authUserDataSchema, type SafeUser } from "@template/contracts";
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
const readBusinessSessionScope = (
  client: QueryClient,
): { scope: OperationalScope; user: SafeUser } | null => {
  const session = client.getQueryState(AUTH_SESSION_QUERY_KEY);
  if (session?.status !== "success" || session.error !== null) return null;
  const parsed = authUserDataSchema.safeParse(session.data);
  if (!parsed.success) return null;
  const { user } = parsed.data;
  if (!hasBusinessAccess(user)) return null;
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
  return {
    scope: { actorId: user.id, accessVersion: user.accessVersion, epoch },
    user,
  };
};
export const readOperationalScope = (
  client: QueryClient,
): OperationalScope | null => {
  const current = readBusinessSessionScope(client);
  return current !== null &&
    (current.user.role === "ADMIN" || current.user.department === "SALES")
    ? current.scope
    : null;
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

export type P04Capability = "APPROVAL" | "SALES_CONTACT" | "OFFICIAL_PAPER";
export type P04OperationalScope = OperationalScope &
  Readonly<{ capability: P04Capability }>;
export const readP04OperationalScope = (
  client: QueryClient,
  capability: P04Capability,
): P04OperationalScope | null => {
  const current = readBusinessSessionScope(client);
  if (current === null) return null;
  const { user, scope } = current;
  const allowed =
    user.role === "ADMIN" ||
    (capability === "APPROVAL"
      ? user.department === "APPROVAL"
      : capability === "SALES_CONTACT"
        ? user.department === "SALES"
        : user.department === "SALES" || user.department === "APPROVAL");
  return allowed ? { ...scope, capability } : null;
};
export const p04ScopeKey = (
  scope: P04OperationalScope,
): readonly ["p04", P04Capability, string, number, number] => [
  "p04",
  scope.capability,
  scope.actorId,
  scope.accessVersion,
  scope.epoch,
];
export const isCurrentP04OperationalScope = (
  client: QueryClient,
  scope: P04OperationalScope,
): boolean => {
  const current = readP04OperationalScope(client, scope.capability);
  return (
    current !== null &&
    current.actorId === scope.actorId &&
    current.accessVersion === scope.accessVersion &&
    current.epoch === scope.epoch
  );
};
export const assertCurrentP04OperationalScope = (
  client: QueryClient,
  scope: P04OperationalScope,
): void => {
  if (!isCurrentP04OperationalScope(client, scope))
    throw new CanceledError("Obsolete approval/contact/paper session scope.");
};
const isCommandSessionKey = (
  key: readonly unknown[],
  prefix: readonly unknown[],
) =>
  key.length === prefix.length + 2 &&
  key[prefix.length] === "command-session" &&
  typeof key[prefix.length + 1] === "string";
const cleanObsoleteP04Scope = async (
  client: QueryClient,
  scope: P04OperationalScope,
) => {
  const prefix = p04ScopeKey(scope);
  await client.cancelQueries({ queryKey: prefix });
  if (isCurrentP04OperationalScope(client, scope)) return;
  const cache = client.getQueryCache();
  const sessions = cache
    .findAll({ queryKey: prefix })
    .filter((query) => isCommandSessionKey(query.queryKey, prefix));
  for (const query of sessions) {
    if (isCurrentP04OperationalScope(client, scope)) return;
    const key = query.queryKey;
    // Reset notifies mounted disabled observers; plain removal leaves their private result visible.
    query.reset();
    if (
      !isCurrentP04OperationalScope(client, scope) &&
      cache.find({ queryKey: key, exact: true }) === query &&
      query.state.data === undefined
    )
      client.removeQueries({ queryKey: key, exact: true });
  }
  if (!isCurrentP04OperationalScope(client, scope))
    client.removeQueries({
      queryKey: prefix,
      predicate: (query) => !isCommandSessionKey(query.queryKey, prefix),
    });
};
export const useP04OperationalScope = (
  capability: P04Capability,
): P04OperationalScope | null => {
  const client = useQueryClient();
  useSession();
  const scope = readP04OperationalScope(client, capability);
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
    const captured = { capability, actorId, accessVersion, epoch };
    return () => {
      if (!isCurrentP04OperationalScope(client, captured))
        void cleanObsoleteP04Scope(client, captured);
    };
  }, [client, capability, actorId, accessVersion, epoch]);
  return scope;
};

export type ManufacturingOperationalScope = OperationalScope &
  Readonly<{
    department: ManufacturingDepartment;
  }>;
export const readManufacturingOperationalScope = (
  client: QueryClient,
  department: ManufacturingOperationalScope["department"],
): ManufacturingOperationalScope | null => {
  const current = readBusinessSessionScope(client);
  return current &&
    (current.user.role === "ADMIN" || current.user.department === department)
    ? { ...current.scope, department }
    : null;
};
export const manufacturingScopeKey = (
  scope: ManufacturingOperationalScope,
): readonly ["p05", string, number, number] => [
  "p05",
  scope.actorId,
  scope.accessVersion,
  scope.epoch,
];
export const isCurrentManufacturingOperationalScope = (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
): boolean => {
  const current = readManufacturingOperationalScope(client, scope.department);
  return (
    current !== null &&
    current.actorId === scope.actorId &&
    current.accessVersion === scope.accessVersion &&
    current.epoch === scope.epoch
  );
};
export const assertCurrentManufacturingOperationalScope = (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
): void => {
  if (!isCurrentManufacturingOperationalScope(client, scope))
    throw new CanceledError("Obsolete manufacturing session scope.");
};
const cleanObsoleteManufacturingScope = async (
  client: QueryClient,
  scope: ManufacturingOperationalScope,
) => {
  // ADMIN navigation between departments is not an identity boundary.
  const stillCurrent = () =>
    (["CUTTING", "PRODUCTION"] as const).some((department) => {
      return isCurrentManufacturingOperationalScope(client, {
        ...scope,
        department,
      });
    });
  if (stillCurrent()) return;
  const prefix = manufacturingScopeKey(scope);
  await client.cancelQueries({ queryKey: prefix });
  const cache = client.getQueryCache();
  for (const query of cache.findAll({ queryKey: prefix })) {
    if (stillCurrent()) return;
    query.reset();
    if (
      !stillCurrent() &&
      cache.find({ queryKey: query.queryKey, exact: true }) === query &&
      query.state.data === undefined
    )
      client.removeQueries({ queryKey: query.queryKey, exact: true });
  }
};
export const useManufacturingOperationalScope = (
  department: ManufacturingOperationalScope["department"],
): ManufacturingOperationalScope | null => {
  const client = useQueryClient();
  useSession();
  const scope = readManufacturingOperationalScope(client, department);
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
    const captured = { actorId, accessVersion, epoch, department };
    return () => {
      void cleanObsoleteManufacturingScope(client, captured);
    };
  }, [client, actorId, accessVersion, epoch, department]);
  return scope;
};
