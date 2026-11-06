"use client";

import {
  queryOptions,
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  draftParamsSchema,
  draftDataSchema,
  draftListDataSchema,
  draftListQuerySchema,
  draftChangesDataSchema,
  draftChangesQuerySchema,
  type DraftData,
  type DraftListQuery,
  type DraftListQueryInput,
  type DraftChangesQueryInput,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  useOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import { draftsApi } from "../api/drafts.api";

const disabledScope: OperationalScope = {
  actorId: "",
  accessVersion: 0,
  epoch: -1,
};
export const draftKeys = {
  root: (scope: OperationalScope) =>
    [
      "customer-drafts",
      scope.actorId,
      scope.accessVersion,
      scope.epoch,
    ] as const,
  list: (scope: OperationalScope, query: DraftListQuery) =>
    [
      ...draftKeys.root(scope),
      "drafts",
      "list",
      query.search ?? "",
      query.type ?? null,
      query.customerId ?? null,
      query.page,
      query.limit,
    ] as const,
  detail: (scope: OperationalScope, id: string) =>
    [...draftKeys.root(scope), "drafts", "detail", id] as const,
  changes: (scope: OperationalScope, id: string, page: number, limit: number) =>
    [...draftKeys.root(scope), "drafts", "changes", id, page, limit] as const,
  activity: (scope: OperationalScope, page: number, limit: number) =>
    [...draftKeys.root(scope), "drafts", "activity", page, limit] as const,
};
const read = async <T>(
  client: QueryClient,
  scope: OperationalScope,
  fetch: () => Promise<T>,
): Promise<T> => {
  assertCurrentOperationalScope(client, scope);
  try {
    const data = await fetch();
    assertCurrentOperationalScope(client, scope);
    return data;
  } catch (error: unknown) {
    await reconcileBusinessDenial(client, error, scope);
    throw error;
  }
};
export const draftDetailOptions = (
  client: QueryClient,
  scope: OperationalScope,
  draftId: string,
) => {
  const target = draftParamsSchema.safeParse({ draftId }),
    id = target.success ? target.data.draftId : "";
  return queryOptions<DraftData, unknown>({
    queryKey: draftKeys.detail(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => draftsApi.get(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): DraftData | undefined => {
      if (!isCurrentOperationalScope(client, scope))
        return previous === undefined
          ? undefined
          : draftDataSchema.parse(previous);
      const next = draftDataSchema.safeParse(incoming),
        prior =
          previous === undefined
            ? undefined
            : draftDataSchema.safeParse(previous);
      if (
        !next.success ||
        next.data.draft.id !== id ||
        (prior !== undefined && (!prior.success || prior.data.draft.id !== id))
      )
        throw new ApiContractError();
      const chosen =
        prior?.success && prior.data.draft.version > next.data.draft.version
          ? prior.data
          : next.data;
      return replaceEqualDeep(previous, chosen);
    },
  });
};
export const useDraftList = (options: DraftListQueryInput) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const query = draftListQuerySchema.parse(options);
  return useQuery({
    queryKey: draftKeys.list(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await draftsApi.list(query, signal);
        assertCurrentOperationalScope(client, scope);
        const availablePage = Math.max(1, received.pagination.totalPages);
        if (query.page > availablePage) {
          await client.invalidateQueries({
            queryKey: draftKeys.list(scope, { ...query, page: availablePage }),
            exact: true,
            refetchType: "none",
          });
        }
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, draftListDataSchema.parse(incoming))
        : previous,
  });
};
export const useDraft = (draftId: string | null) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const target = draftParamsSchema.safeParse({ draftId });
  return useQuery({
    ...draftDetailOptions(
      client,
      scope,
      target.success ? target.data.draftId : "",
    ),
    enabled: current !== null && target.success,
  });
};
export const useDraftChanges = (
  draftId: string | null,
  options: DraftChangesQueryInput,
) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const target = draftParamsSchema.safeParse({ draftId }),
    id = target.success ? target.data.draftId : "";
  const query = draftChangesQuerySchema.parse(options);
  return useQuery({
    queryKey: draftKeys.changes(scope, id, query.page, query.limit),
    enabled: current !== null && target.success,
    queryFn: ({ signal }) =>
      read(client, scope, () => draftsApi.changes(id, query, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, draftChangesDataSchema.parse(incoming))
        : previous,
  });
};
export const useDraftActivity = (options: DraftChangesQueryInput) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const query = draftChangesQuerySchema.parse(options);
  return useQuery({
    queryKey: draftKeys.activity(scope, query.page, query.limit),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, () => draftsApi.activity(query, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, draftChangesDataSchema.parse(incoming))
        : previous,
  });
};
