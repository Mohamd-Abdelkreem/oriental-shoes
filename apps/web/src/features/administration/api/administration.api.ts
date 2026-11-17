import type { z } from "zod";
import {
  salesUuidSchema,
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  type AdministrationCommandBody,
  administrationDashboardDataSchema,
  administrationFilterOptionsQuerySchema,
  administrationFilterOptionsDataSchema,
  administrationOrdersQuerySchema,
  administrationOrdersDataSchema,
  administrationOrderDataSchema,
  administrationOrderHistoryQuerySchema,
  administrationApprovalsQuerySchema,
  administrationApprovalsDataSchema,
  administrationCorrectionsQuerySchema,
  administrationCorrectionsDataSchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationDeliveryExceptionsDataSchema,
  administrationActivityQuerySchema,
  administrationActivityDataSchema,
  administrationOrderFiltersSchema,
  administrationReportQuerySchema,
  administrationReportDataSchema,
  administrationReportPrintQuerySchema,
  administrationReportPrintDataSchema,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

import { bindAdministrationCommandResult } from "../model/administration-command-binding.model";

const read = async <T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  params?: unknown,
): Promise<T> => {
  const response = await apiClient.get(path, {
    ...(signal === undefined ? {} : { signal }),
    ...(params === undefined ? {} : { params }),
  });
  const raw: unknown = response.data;
  return parseApiResponse(raw, schema).data;
};
// Both objects come from the same strict schema, fixing field order and defaults.
const assertQuery = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new ApiContractError();
};
const assertPage = (
  actual: { page: number; limit: number },
  expected: { page: number; limit: number },
): void => {
  if (actual.page !== expected.page || actual.limit !== expected.limit)
    throw new ApiContractError();
};
export const administrationApi = {
  dashboard(signal?: AbortSignal) {
    return read(
      "/administration/dashboard",
      administrationDashboardDataSchema,
      signal,
    );
  },
  async filterOptions(
    query: z.input<typeof administrationFilterOptionsQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationFilterOptionsQuerySchema.parse(query);
    const options = await read(
      "/administration/filter-options",
      administrationFilterOptionsDataSchema,
      signal,
      params,
    );
    assertQuery(options.context.query, params);
    if (
      params.salespersonName === undefined
        ? options.legacySalesperson !== null
        : options.legacySalesperson?.input !== params.salespersonName
    )
      throw new ApiContractError();
    return options;
  },
  async orders(
    query: z.input<typeof administrationOrdersQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationOrdersQuerySchema.parse(query);
    const page = await read(
      "/administration/orders",
      administrationOrdersDataSchema,
      signal,
      params,
    );
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async order(orderId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(orderId);
    const detail = await read(
      `/administration/orders/${id}`,
      administrationOrderDataSchema,
      signal,
    );
    if (
      detail.context.orderId !== id ||
      (detail.kind === "draft" ? detail.draft.id : detail.order.id) !== id
    )
      throw new ApiContractError();
    return detail;
  },
  async orderHistory(
    orderId: string,
    query: z.input<typeof administrationOrderHistoryQuerySchema>,
    signal?: AbortSignal,
  ) {
    const id = salesUuidSchema.parse(orderId),
      params = administrationOrderHistoryQuerySchema.parse(query);
    const page = await read(
      `/administration/orders/${id}/history`,
      administrationActivityDataSchema,
      signal,
      params,
    );
    if (!("orderId" in page.context) || page.context.orderId !== id)
      throw new ApiContractError();
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async approvals(
    query: z.input<typeof administrationApprovalsQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationApprovalsQuerySchema.parse(query);
    const page = await read(
      "/administration/approvals",
      administrationApprovalsDataSchema,
      signal,
      params,
    );
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async corrections(
    query: z.input<typeof administrationCorrectionsQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationCorrectionsQuerySchema.parse(query);
    const page = await read(
      "/administration/corrections",
      administrationCorrectionsDataSchema,
      signal,
      params,
    );
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async deliveryExceptions(
    query: z.input<typeof administrationDeliveryExceptionsQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationDeliveryExceptionsQuerySchema.parse(query);
    const page = await read(
      "/administration/delivery-exceptions",
      administrationDeliveryExceptionsDataSchema,
      signal,
      params,
    );
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async activity(
    query: z.input<typeof administrationActivityQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationActivityQuerySchema.parse(query);
    const page = await read(
      "/administration/activity",
      administrationActivityDataSchema,
      signal,
      params,
    );
    if ("orderId" in page.context) throw new ApiContractError();
    assertQuery(page.context.query, params);
    assertPage(page.pagination, params);
    return page;
  },
  async report(
    query: z.input<typeof administrationReportQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationReportQuerySchema.parse(query);
    const report = await read(
      "/administration/reports",
      administrationReportDataSchema,
      signal,
      params,
    );
    const { page: _page, limit: _limit, ...filters } = params;
    assertQuery(
      report.meta.filters,
      administrationOrderFiltersSchema.parse(filters),
    );
    assertPage(report.orders.pagination, params);
    return report;
  },
  async reportPrint(
    query: z.input<typeof administrationReportPrintQuerySchema>,
    signal?: AbortSignal,
  ) {
    const params = administrationReportPrintQuerySchema.parse(query);
    const report = await read(
      "/administration/reports/print",
      administrationReportPrintDataSchema,
      signal,
      params,
    );
    assertQuery(report.meta.filters, params);
    return report;
  },
  async command(body: AdministrationCommandBody) {
    const input = administrationCommandBodySchema.parse(body);
    const response = await apiClient.post("/administration/commands", input);
    const raw: unknown = response.data;
    return bindAdministrationCommandResult(
      parseApiResponse(raw, administrationCommandDataSchema).data,
      input,
    );
  },
  async observe(commandId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(commandId);
    const result = await read(
      `/administration-commands/${id}`,
      administrationCommandDataSchema,
      signal,
    );
    if (result.receipt.commandId !== id) throw new ApiContractError();
    return result;
  },
};
export type AdministrationApi = typeof administrationApi;
