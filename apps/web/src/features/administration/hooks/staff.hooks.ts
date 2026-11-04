import axios, { CanceledError } from "axios";
import {
  replaceEqualDeep,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  authUserDataSchema,
  staffHistoryQuerySchema,
  staffListQuerySchema,
  staffUserDataSchema,
  staffUserParamsSchema,
  type AuthUserData,
  type SafeUser,
  type StaffCommandData,
  type StaffHistoryQuery,
  type StaffListQuery,
  type StaffUserData,
} from "@template/contracts";

import {
  AUTH_SESSION_QUERY_KEY,
  reconcileBusinessDenial,
  useSession,
} from "@/features/auth/hooks/auth.hooks";
import {
  ApiContractError,
  AuthIdentityChangedError,
  AuthReauthenticationRequiredError,
  assertAuthSessionSubject,
  getApiError,
  getAuthSessionEpoch,
  getAuthSessionRestorePolicy,
  type ApiError,
} from "@/services/api/api-client";

import { staffApi } from "../api/staff.api";
import type { StaffCommandVariables } from "../model/staff-management.model";

export type { StaffCommandVariables };

/**
 * The controlled browser state of the staff directory. It is not a replacement
 * wire schema: the shared query schema still owns the accepted values.
 */
export type StaffListOptions = Readonly<{
  scope: "all" | "pending";
  search: string;
  page: number;
  limit: 25;
}>;

/**
 * The controlled browser state of the retained decision history.
 */
export type StaffHistoryOptions = Readonly<{
  page: number;
  limit: 25;
}>;

/**
 * The identity snapshot a staff mutation captures before dispatch. The
 * callbacks consume it instead of reading an old render closure as the current
 * identity.
 */
export type StaffMutationContext = Readonly<{
  actorId: string;
  epoch: number;
}>;

/**
 * The one staff key owner. Every shape is actor scoped, serializable and free
 * of credentials.
 */
export const staffKeys = {
  all: (actorId: string) => ["staff", actorId] as const,
  list: (
    actorId: string,
    query: Readonly<{
      scope: "all" | "pending";
      search: string;
      page: number;
      limit: number;
    }>,
  ) =>
    [
      "staff",
      actorId,
      "list",
      query.scope,
      query.search,
      query.page,
      query.limit,
    ] as const,
  detail: (actorId: string, userId: string) =>
    ["staff", actorId, "detail", userId] as const,
  decisions: (
    actorId: string,
    userId: string,
    query: Readonly<{ page: number; limit: number }>,
  ) =>
    ["staff", actorId, "decisions", userId, query.page, query.limit] as const,
};

/**
 * A confirmed staff decision that could not be synchronized with the current
 * cache. The receipt is the unchanged server result and the optional
 * synchronization error is the already normalized API error. No raw cause,
 * request or provider payload is retained, and a null synchronization error
 * means the captured scope was unavailable, not that a read failed.
 */
export class StaffSynchronizationError extends Error {
  readonly result: StaffCommandData;
  readonly syncError: ApiError | null;

  constructor(result: StaffCommandData, syncError: ApiError | null) {
    super("Staff decision saved; refresh incomplete.");
    this.name = "StaffSynchronizationError";
    this.result = result;
    this.syncError = syncError;
  }
}

const isEligibleStaffActor = (user: SafeUser): boolean =>
  user.role === "ADMIN" &&
  user.status === "ACTIVE" &&
  user.emailVerifiedAt !== null;

const readStaffActorId = (
  account: AuthUserData | null | undefined,
): string | null => {
  if (account === null || account === undefined) return null;
  if (!isEligibleStaffActor(account.user)) return null;
  return account.user.id;
};

/**
 * The current published session identity. The cache is the authority: an
 * errored, pending or unreadable session is never an eligible actor.
 */
const readSessionAccount = (queryClient: QueryClient): AuthUserData | null => {
  const state = queryClient.getQueryState<AuthUserData | null>(
    AUTH_SESSION_QUERY_KEY,
  );
  if (state === undefined) return null;
  if (state.status !== "success") return null;
  if (state.error !== null) return null;
  const parsed = authUserDataSchema.safeParse(state.data);
  return parsed.success ? parsed.data : null;
};

/**
 * The transport boundary of one captured scope. An obsolete epoch, a subject
 * mismatch and a closed restore policy are expected outcomes and report
 * false; any other failure is unexpected and propagates.
 */
const hasCurrentTransportScope = (
  context: StaffMutationContext,
  subjectId: string,
): boolean => {
  if (getAuthSessionRestorePolicy() !== "restore") return false;
  try {
    assertAuthSessionSubject(subjectId, context.epoch);
    return true;
  } catch (error: unknown) {
    if (axios.isCancel(error)) return false;
    if (error instanceof AuthIdentityChangedError) return false;
    if (error instanceof AuthReauthenticationRequiredError) return false;
    throw error;
  }
};

/**
 * The captured scope is current when the epoch still matches, the session
 * query holds a successful, non-errored, verified ACTIVE ADMIN identity, that
 * identity is the captured actor, and the transport still holds that subject
 * under an open restore policy.
 */
const isCurrentStaffScope = (
  queryClient: QueryClient,
  context: StaffMutationContext,
): boolean => {
  if (getAuthSessionEpoch() !== context.epoch) return false;
  const account = readSessionAccount(queryClient);
  if (account === null) return false;
  if (!isEligibleStaffActor(account.user)) return false;
  if (account.user.id !== context.actorId) return false;
  return hasCurrentTransportScope(context, account.user.id);
};

const isStaffUserData = (value: unknown): value is StaffUserData =>
  staffUserDataSchema.safeParse(value).success;

/**
 * The single same-target detail merge. The incoming and any defined previous
 * detail are validated with the shared schema and must describe the expected
 * canonical target. The previous snapshot wins only when its own
 * accessVersion is greater; an equal version accepts the incoming profile
 * change. The returned value keeps the unchanged subtrees of the previous
 * snapshot.
 */
const mergeStaffDetail = (
  targetUserId: string,
  previous: unknown,
  incoming: unknown,
): StaffUserData => {
  const canonicalTarget = targetUserId.toLowerCase();
  const parsedIncoming = staffUserDataSchema.safeParse(incoming);
  if (!parsedIncoming.success) {
    throw new ApiContractError();
  }
  if (parsedIncoming.data.staff.id.toLowerCase() !== canonicalTarget) {
    throw new ApiContractError();
  }
  let previousDetail: StaffUserData | undefined;
  if (previous !== undefined) {
    if (!isStaffUserData(previous)) {
      throw new ApiContractError();
    }
    if (previous.staff.id.toLowerCase() !== canonicalTarget) {
      throw new ApiContractError();
    }
    previousDetail = previous;
  }
  const chosen =
    previousDetail !== undefined &&
    previousDetail.staff.accessVersion > parsedIncoming.data.staff.accessVersion
      ? previousDetail
      : parsedIncoming.data;
  return replaceEqualDeep(previousDetail, chosen);
};

/**
 * The obsolete completion of a guarded read. It uses the existing Axios
 * cancellation so an outdated scope never publishes.
 */
const assertCurrentStaffScope = (
  queryClient: QueryClient,
  context: StaffMutationContext,
): void => {
  if (!isCurrentStaffScope(queryClient, context)) {
    throw new CanceledError(
      "The staff request no longer belongs to the current session scope.",
    );
  }
};

const normalizeStaffListQuery = (
  options: StaffListOptions,
): Readonly<{
  key: Readonly<{
    scope: "all" | "pending";
    search: string;
    page: number;
    limit: number;
  }>;
  wire: StaffListQuery;
}> => {
  const page =
    Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
  const parsed = staffListQuerySchema.safeParse({
    scope: options.scope,
    search: options.search,
    page,
    limit: options.limit,
  });
  if (!parsed.success) {
    return {
      key: { scope: options.scope, search: "", page: 1, limit: options.limit },
      wire: { scope: options.scope, page: 1, limit: options.limit },
    };
  }
  return {
    key: {
      scope: parsed.data.scope,
      search: parsed.data.search ?? "",
      page,
      limit: options.limit,
    },
    wire: parsed.data,
  };
};

const normalizeStaffHistoryQuery = (
  options: StaffHistoryOptions,
): Readonly<{
  key: Readonly<{ page: number; limit: number }>;
  wire: StaffHistoryQuery;
}> => {
  const page =
    Number.isInteger(options.page) && options.page > 0 ? options.page : 1;
  const parsed = staffHistoryQuerySchema.safeParse({
    page,
    limit: options.limit,
  });
  if (!parsed.success) {
    return {
      key: { page: 1, limit: options.limit },
      wire: { page: 1, limit: options.limit },
    };
  }
  return { key: { page, limit: options.limit }, wire: parsed.data };
};

/**
 * The canonical selected target. A missing or non-canonical user id disables
 * the detail and history reads instead of resolving another employee.
 */
const normalizeTargetUserId = (userId: string | null): string | null => {
  if (userId === null) return null;
  const parsed = staffUserParamsSchema.safeParse({ userId });
  return parsed.success ? parsed.data.userId : null;
};

const readWithinStaffScope = async <T>(
  queryClient: QueryClient,
  context: StaffMutationContext,
  read: () => Promise<T>,
): Promise<T> => {
  assertCurrentStaffScope(queryClient, context);
  let data: T;
  try {
    data = await read();
  } catch (error: unknown) {
    await reconcileBusinessDenial(queryClient, error, context);
    throw error;
  }
  assertCurrentStaffScope(queryClient, context);
  return data;
};

export const useStaffList = (options: StaffListOptions) => {
  const queryClient = useQueryClient();
  const session = useSession();
  const actorId = readStaffActorId(session.data);
  const context: StaffMutationContext = {
    actorId: actorId ?? "",
    epoch: getAuthSessionEpoch(),
  };
  const normalized = normalizeStaffListQuery(options);
  const enabled = actorId !== null && session.status === "success";

  return useQuery({
    queryKey: staffKeys.list(context.actorId, normalized.key),
    queryFn: ({ signal }) =>
      readWithinStaffScope(queryClient, context, () =>
        staffApi.list(normalized.wire, signal),
      ),
    enabled,
  });
};

/**
 * The sole detail-options construction of the staff feature. It owns the
 * actor/target key, the guarded query function and the commit-time
 * structural sharing that closes the publication gap between the resolved
 * result and the cache commit.
 */
export const useStaff = (userId: string | null) => {
  const queryClient = useQueryClient();
  const session = useSession();
  const actorId = readStaffActorId(session.data);
  const targetUserId = normalizeTargetUserId(userId);
  const context: StaffMutationContext = {
    actorId: actorId ?? "",
    epoch: getAuthSessionEpoch(),
  };
  const enabled =
    actorId !== null && targetUserId !== null && session.status === "success";

  return useQuery({
    queryKey: staffKeys.detail(context.actorId, targetUserId ?? ""),
    queryFn: ({ signal }) =>
      readWithinStaffScope(queryClient, context, () =>
        staffApi.get(targetUserId ?? "", signal),
      ),
    enabled,
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentStaffScope(queryClient, context)) {
        return previous;
      }
      return mergeStaffDetail(targetUserId ?? "", previous, incoming);
    },
  });
};

export const useStaffDecisions = (
  userId: string | null,
  options: StaffHistoryOptions,
) => {
  const queryClient = useQueryClient();
  const session = useSession();
  const actorId = readStaffActorId(session.data);
  const targetUserId = normalizeTargetUserId(userId);
  const context: StaffMutationContext = {
    actorId: actorId ?? "",
    epoch: getAuthSessionEpoch(),
  };
  const normalized = normalizeStaffHistoryQuery(options);
  const enabled =
    actorId !== null && targetUserId !== null && session.status === "success";

  return useQuery({
    queryKey: staffKeys.decisions(
      context.actorId,
      targetUserId ?? "",
      normalized.key,
    ),
    queryFn: ({ signal }) =>
      readWithinStaffScope(queryClient, context, () =>
        staffApi.decisions(targetUserId ?? "", normalized.wire, signal),
      ),
    enabled,
  });
};

const dispatchStaffCommand = async (
  variables: StaffCommandVariables,
): Promise<StaffCommandData> => {
  switch (variables.operation) {
    case "APPROVE":
      return await staffApi.approve(variables.userId, variables.body);
    case "REJECT":
      return await staffApi.reject(variables.userId, variables.body);
    case "CHANGE_DEPARTMENT":
      return await staffApi.changeDepartment(variables.userId, variables.body);
    case "SUSPEND":
      return await staffApi.suspend(variables.userId, variables.body);
    case "REACTIVATE":
      return await staffApi.reactivate(variables.userId, variables.body);
    default:
      throw new ApiContractError();
  }
};

/**
 * A parsed reply identifies the submitted target before it becomes that
 * command's confirmed receipt. A malformed or wrong-target result stays a safe
 * contract failure and never a saved claim.
 */
const assertStaffCommandTarget = (
  result: StaffCommandData,
  userId: string,
): void => {
  if (result.staff.id.toLowerCase() !== userId.toLowerCase()) {
    throw new ApiContractError();
  }
};

export const useStaffCommand = (): UseMutationResult<
  StaffCommandData,
  unknown,
  StaffCommandVariables,
  StaffMutationContext
> => {
  const queryClient = useQueryClient();
  const session = useSession();

  return useMutation<
    StaffCommandData,
    unknown,
    StaffCommandVariables,
    StaffMutationContext
  >({
    mutationFn: async (variables: StaffCommandVariables) => {
      const result = await dispatchStaffCommand(variables);
      assertStaffCommandTarget(result, variables.userId);
      return result;
    },
    onMutate: () => {
      // The captured identity is the published session at dispatch time. The
      // observed session is only a fallback for a session that is still being
      // published; the scope check remains the authority.
      const account = readSessionAccount(queryClient) ?? session.data ?? null;
      return {
        actorId: account?.user.id ?? "",
        epoch: getAuthSessionEpoch(),
      };
    },
    onSuccess: async (
      result: StaffCommandData,
      variables: StaffCommandVariables,
      context: StaffMutationContext | undefined,
    ) => {
      const scope: StaffMutationContext = context ?? {
        actorId: "",
        epoch: getAuthSessionEpoch(),
      };
      try {
        if (!isCurrentStaffScope(queryClient, scope)) {
          throw new StaffSynchronizationError(result, null);
        }
        const published = queryClient.setQueryData<StaffUserData>(
          staffKeys.detail(scope.actorId, variables.userId),
          (previous) => {
            if (!isCurrentStaffScope(queryClient, scope)) {
              return undefined;
            }
            return mergeStaffDetail(variables.userId, previous, {
              staff: result.staff,
            });
          },
        );
        if (published === undefined) {
          throw new StaffSynchronizationError(result, null);
        }
        if (!isCurrentStaffScope(queryClient, scope)) {
          throw new StaffSynchronizationError(result, null);
        }
        await queryClient.invalidateQueries(
          { queryKey: staffKeys.all(scope.actorId) },
          { throwOnError: true },
        );
        if (!isCurrentStaffScope(queryClient, scope)) {
          throw new StaffSynchronizationError(result, null);
        }
      } catch (error: unknown) {
        if (error instanceof StaffSynchronizationError) {
          throw error;
        }
        throw new StaffSynchronizationError(result, getApiError(error));
      }
    },
    onError: async (error: unknown, _variables, scope) => {
      if (error instanceof StaffSynchronizationError) {
        // The confirmed receipt stays and the command is never repeated.
        return;
      }
      if (scope !== undefined)
        await reconcileBusinessDenial(queryClient, error, scope);
    },
  });
};
