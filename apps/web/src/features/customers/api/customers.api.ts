import {
  customerPhoneSchema,
  customerDraftsDataSchema,
  type CustomerDraftsData,
  type CustomerDraftsQueryInput,
  customerCommandDataSchema,
  customerDataSchema,
  customerListDataSchema,
  customerMeasurementsDataSchema,
  type CreateCustomerBody,
  type CustomerCommandData,
  type CustomerData,
  type CustomerListData,
  type CustomerListQueryInput,
  type CustomerMeasurementsData,
  type CustomerMeasurementsQueryInput,
  type UpdateCustomerBody,
} from "@template/contracts";
import { apiClient, parseApiResponse } from "@/services/api/api-client";

export const customersApi = {
  async list(
    query: CustomerListQueryInput,
    signal?: AbortSignal,
  ): Promise<CustomerListData> {
    const response = await apiClient.get("/customers", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerListDataSchema).data;
  },
  async byPhone(phone: string, signal?: AbortSignal): Promise<CustomerData> {
    const response = await apiClient.get(
      `/customers/by-phone/${encodeURIComponent(customerPhoneSchema.parse(phone))}`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerDataSchema).data;
  },
  async get(customerId: string, signal?: AbortSignal): Promise<CustomerData> {
    const response = await apiClient.get(`/customers/${customerId}`, {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerDataSchema).data;
  },
  async drafts(
    customerId: string,
    query: CustomerDraftsQueryInput,
    signal?: AbortSignal,
  ): Promise<CustomerDraftsData> {
    const response = await apiClient.get(`/customers/${customerId}/drafts`, {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerDraftsDataSchema).data;
  },
  async measurements(
    customerId: string,
    query: CustomerMeasurementsQueryInput,
    signal?: AbortSignal,
  ): Promise<CustomerMeasurementsData> {
    const response = await apiClient.get(
      `/customers/${customerId}/measurements`,
      { params: query, ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerMeasurementsDataSchema).data;
  },
  async create(body: CreateCustomerBody): Promise<CustomerCommandData> {
    const response = await apiClient.post("/customers", body);
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerCommandDataSchema).data;
  },
  async update(
    customerId: string,
    body: UpdateCustomerBody,
  ): Promise<CustomerCommandData> {
    const response = await apiClient.patch(`/customers/${customerId}`, body);
    const raw: unknown = response.data;
    return parseApiResponse(raw, customerCommandDataSchema).data;
  },
};
