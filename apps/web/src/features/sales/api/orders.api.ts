import {
  salesOrderListDataSchema,
  salesDashboardDataSchema,
  salesOrderDataSchema,
  salesOrderTrackingDataSchema,
  salesOrderActivityDataSchema,
  salesOrderRevisionDataSchema,
  salesOrderEditorDataSchema,
  salesOrderCommandDataSchema,
  submitOrderBodySchema,
  resubmitOrderBodySchema,
  setOrderPaidBodySchema,
  salesUuidSchema,
  type SalesOrderListQueryInput,
  type SalesOrderListData,
  type SalesDashboardData,
  type SalesOrderData,
  type SalesOrderTrackingData,
  type SalesOrderActivityQueryInput,
  type SalesOrderActivityData,
  type SalesOrderRevisionData,
  type SalesOrderEditorData,
  type SalesOrderCommandData,
  type SubmitOrderBody,
  type ResubmitOrderBody,
  type SetOrderPaidBody,
} from "@template/contracts";
import { apiClient, parseApiResponse } from "@/services/api/api-client";

export const ordersApi = {
  async list(
    query: SalesOrderListQueryInput,
    signal?: AbortSignal,
  ): Promise<SalesOrderListData> {
    const response = await apiClient.get("/sales-orders", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderListDataSchema).data;
  },
  async dashboard(signal?: AbortSignal): Promise<SalesDashboardData> {
    const response = await apiClient.get("/sales-orders/dashboard", {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesDashboardDataSchema).data;
  },
  async get(orderId: string, signal?: AbortSignal): Promise<SalesOrderData> {
    const response = await apiClient.get(
      `/sales-orders/${salesUuidSchema.parse(orderId)}`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderDataSchema).data;
  },
  async editor(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<SalesOrderEditorData> {
    const response = await apiClient.get(
      `/sales-order-editor/${salesUuidSchema.parse(orderId)}`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderEditorDataSchema).data;
  },
  async tracking(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<SalesOrderTrackingData> {
    const response = await apiClient.get(
      `/sales-orders/${salesUuidSchema.parse(orderId)}/tracking`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderTrackingDataSchema).data;
  },
  async activity(
    query: SalesOrderActivityQueryInput,
    signal?: AbortSignal,
  ): Promise<SalesOrderActivityData> {
    const response = await apiClient.get("/sales-orders/activity", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderActivityDataSchema).data;
  },
  async orderActivity(
    orderId: string,
    query: SalesOrderActivityQueryInput,
    signal?: AbortSignal,
  ): Promise<SalesOrderActivityData> {
    const response = await apiClient.get(
      `/sales-orders/${salesUuidSchema.parse(orderId)}/activity`,
      { params: query, ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderActivityDataSchema).data;
  },
  async revision(
    orderId: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<SalesOrderRevisionData> {
    const response = await apiClient.get(
      `/sales-orders/${salesUuidSchema.parse(orderId)}/activity/${salesUuidSchema.parse(eventId)}`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderRevisionDataSchema).data;
  },
  async submit(body: SubmitOrderBody): Promise<SalesOrderCommandData> {
    const response = await apiClient.post(
      "/sales-orders",
      submitOrderBodySchema.parse(body),
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderCommandDataSchema).data;
  },
  async resubmit(
    orderId: string,
    body: ResubmitOrderBody,
  ): Promise<SalesOrderCommandData> {
    const response = await apiClient.post(
      `/sales-orders/${salesUuidSchema.parse(orderId)}/resubmit`,
      resubmitOrderBodySchema.parse(body),
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderCommandDataSchema).data;
  },
  async setPaid(
    orderId: string,
    body: SetOrderPaidBody,
  ): Promise<SalesOrderCommandData> {
    const response = await apiClient.patch(
      `/sales-orders/${salesUuidSchema.parse(orderId)}/paid`,
      setOrderPaidBodySchema.parse(body),
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesOrderCommandDataSchema).data;
  },
};
