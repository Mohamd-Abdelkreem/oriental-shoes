"use client";

import {
  queryOptions,
  replaceEqualDeep,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  customerListQuerySchema,
  customerDraftsDataSchema,
  customerDraftsQuerySchema,
  type CustomerDraftsQueryInput,
  customerListDataSchema,
  customerDataSchema,
  customerPhoneSchema,
  customerParamsSchema,
  customerMeasurementsQuerySchema,
  customerMeasurementsDataSchema,
  type CustomerData,
  type CustomerListQuery,
  type CustomerListQueryInput,
  type CustomerMeasurementsQueryInput,
} from "@template/contracts";
import { reconcileBusinessDenial } from "@/features/auth/hooks/auth.hooks";
import { ApiContractError } from "@/services/api/api-client";
import {
  assertCurrentOperationalScope,
  isCurrentOperationalScope,
  useOperationalScope,
  type OperationalScope,
} from "@/shared/query/operational-scope";
import { customersApi } from "../api/customers.api";

const disabledScope: OperationalScope = {
  actorId: "",
  accessVersion: 0,
  epoch: -1,
};
export const customerKeys = {
  root: (scope: OperationalScope) =>
    [
      "customer-drafts",
      scope.actorId,
      scope.accessVersion,
      scope.epoch,
    ] as const,
  list: (scope: OperationalScope, query: CustomerListQuery) =>
    [
      ...customerKeys.root(scope),
      "customers",
      "list",
      query.search ?? "",
      query.page,
      query.limit,
    ] as const,
  phone: (scope: OperationalScope, phone: string) =>
    [...customerKeys.root(scope), "customers", "phone", phone] as const,
  detail: (scope: OperationalScope, id: string) =>
    [...customerKeys.root(scope), "customers", "detail", id] as const,
  drafts: (scope: OperationalScope, id: string, page: number, limit: number) =>
    [
      ...customerKeys.root(scope),
      "customers",
      "drafts",
      id,
      page,
      limit,
    ] as const,
  measurements: (
    scope: OperationalScope,
    id: string,
    page: number,
    limit: number,
  ) =>
    [
      ...customerKeys.root(scope),
      "customers",
      "measurements",
      id,
      page,
      limit,
    ] as const,
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
export const customerDetailOptions = (
  client: QueryClient,
  scope: OperationalScope,
  customerId: string,
) => {
  const target = customerParamsSchema.safeParse({ customerId });
  const id = target.success ? target.data.customerId : "";
  return queryOptions<CustomerData, unknown>({
    queryKey: customerKeys.detail(scope, id),
    queryFn: ({ signal }) => {
      if (!target.success) throw new ApiContractError();
      return read(client, scope, () => customersApi.get(id, signal));
    },
    structuralSharing: (
      previous: unknown,
      incoming: unknown,
    ): CustomerData | undefined => {
      if (!isCurrentOperationalScope(client, scope))
        return previous === undefined
          ? undefined
          : customerDataSchema.parse(previous);
      const next = customerDataSchema.safeParse(incoming),
        prior =
          previous === undefined
            ? undefined
            : customerDataSchema.safeParse(previous);
      if (
        !next.success ||
        next.data.customer.id !== id ||
        (prior !== undefined &&
          (!prior.success || prior.data.customer.id !== id))
      )
        throw new ApiContractError();
      const chosen =
        prior?.success &&
        prior.data.customer.version > next.data.customer.version
          ? prior.data
          : next.data;
      return replaceEqualDeep(previous, chosen);
    },
  });
};
export const useCustomerList = (options: CustomerListQueryInput) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const query = customerListQuerySchema.parse(options);
  return useQuery({
    queryKey: customerKeys.list(scope, query),
    enabled: current !== null,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const received = await customersApi.list(query, signal);
        assertCurrentOperationalScope(client, scope);
        const availablePage = Math.max(1, received.pagination.totalPages);
        if (query.page > availablePage) {
          await client.invalidateQueries({
            queryKey: customerKeys.list(scope, {
              ...query,
              page: availablePage,
            }),
            exact: true,
            refetchType: "none",
          });
        }
        return received;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      return replaceEqualDeep(previous, customerListDataSchema.parse(incoming));
    },
  });
};
export const useCustomerByPhone = (phone: string | null) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const parsed = customerPhoneSchema.safeParse(phone),
    target = parsed.success ? parsed.data : "";
  return useQuery({
    queryKey: customerKeys.phone(scope, target),
    enabled: current !== null && parsed.success,
    queryFn: ({ signal }) =>
      read(client, scope, () => customersApi.byPhone(target, signal)),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      const data = customerDataSchema.safeParse(incoming);
      if (!data.success || data.data.customer.phone !== target)
        throw new ApiContractError();
      return replaceEqualDeep(previous, data.data);
    },
  });
};
export const useCustomer = (customerId: string | null) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const parsed = customerParamsSchema.safeParse({ customerId });
  const options = customerDetailOptions(
    client,
    scope,
    parsed.success ? parsed.data.customerId : "",
  );
  return useQuery({ ...options, enabled: current !== null && parsed.success });
};
export const useCustomerMeasurements = (
  customerId: string | null,
  options: CustomerMeasurementsQueryInput,
) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const parsed = customerParamsSchema.safeParse({ customerId }),
    id = parsed.success ? parsed.data.customerId : "";
  const query = customerMeasurementsQuerySchema.parse(options);
  return useQuery({
    queryKey: customerKeys.measurements(scope, id, query.page, query.limit),
    enabled: current !== null && parsed.success,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const measurements = await customersApi.measurements(id, query, signal);
        assertCurrentOperationalScope(client, scope);
        const destination = Math.max(1, measurements.pagination.totalPages);
        if (query.page > destination)
          await client.invalidateQueries({
            queryKey: customerKeys.measurements(
              scope,
              id,
              destination,
              query.limit,
            ),
            exact: true,
            refetchType: "none",
          });
        return measurements;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) => {
      if (!isCurrentOperationalScope(client, scope)) return previous;
      return replaceEqualDeep(
        previous,
        customerMeasurementsDataSchema.parse(incoming),
      );
    },
  });
};

export const useCustomerDrafts = (
  customerId: string | null,
  options: CustomerDraftsQueryInput,
) => {
  const client = useQueryClient(),
    current = useOperationalScope(),
    scope = current ?? disabledScope;
  const target = customerParamsSchema.safeParse({ customerId }),
    id = target.success ? target.data.customerId : "",
    query = customerDraftsQuerySchema.parse(options);
  return useQuery({
    queryKey: customerKeys.drafts(scope, id, query.page, query.limit),
    enabled: current !== null && target.success,
    queryFn: ({ signal }) =>
      read(client, scope, async () => {
        const data = await customersApi.drafts(id, query, signal);
        assertCurrentOperationalScope(client, scope);
        const destination = Math.max(1, data.pagination.totalPages);
        if (query.page > destination)
          await client.invalidateQueries({
            queryKey: customerKeys.drafts(scope, id, destination, query.limit),
            exact: true,
            refetchType: "none",
          });
        return data;
      }),
    structuralSharing: (previous: unknown, incoming: unknown) =>
      isCurrentOperationalScope(client, scope)
        ? replaceEqualDeep(previous, customerDraftsDataSchema.parse(incoming))
        : previous,
  });
};
