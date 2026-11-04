import {
  staffCommandDataSchema,
  staffDecisionsDataSchema,
  staffListDataSchema,
  staffUserDataSchema,
  type StaffApprovalBody,
  type StaffCommandBody,
  type StaffCommandData,
  type StaffDecisionsData,
  type StaffDepartmentBody,
  type StaffHistoryQueryInput,
  type StaffListData,
  type StaffListQueryInput,
  type StaffUserData,
} from "@template/contracts";

import { apiClient, parseApiResponse } from "@/services/api/api-client";

/**
 * The staff directory, detail and retained-decision reads plus the named
 * staff commands.
 *
 * Every read parses the complete success envelope and its shared data schema
 * before the value reaches a caller, and every read forwards the query
 * function's abort signal. The writes stay explicit: aborting a dispatched
 * write is never proof that the server rolled it back, so no write accepts a
 * cancellation signal.
 */
export const staffApi = {
  async list(
    query: StaffListQueryInput,
    signal?: AbortSignal,
  ): Promise<StaffListData> {
    const response = await apiClient.get("/staff", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    return parseApiResponse(response.data, staffListDataSchema).data;
  },
  async get(userId: string, signal?: AbortSignal): Promise<StaffUserData> {
    const response = await apiClient.get(`/staff/${userId}`, {
      ...(signal === undefined ? {} : { signal }),
    });
    return parseApiResponse(response.data, staffUserDataSchema).data;
  },
  async decisions(
    userId: string,
    query: StaffHistoryQueryInput,
    signal?: AbortSignal,
  ): Promise<StaffDecisionsData> {
    const response = await apiClient.get(`/staff/${userId}/decisions`, {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    return parseApiResponse(response.data, staffDecisionsDataSchema).data;
  },
  async approve(
    userId: string,
    body: StaffApprovalBody,
  ): Promise<StaffCommandData> {
    const response = await apiClient.post(`/staff/${userId}/approve`, body);
    return parseApiResponse(response.data, staffCommandDataSchema).data;
  },
  async reject(
    userId: string,
    body: StaffCommandBody,
  ): Promise<StaffCommandData> {
    const response = await apiClient.post(`/staff/${userId}/reject`, body);
    return parseApiResponse(response.data, staffCommandDataSchema).data;
  },
  async suspend(
    userId: string,
    body: StaffCommandBody,
  ): Promise<StaffCommandData> {
    const response = await apiClient.post(`/staff/${userId}/suspend`, body);
    return parseApiResponse(response.data, staffCommandDataSchema).data;
  },
  async reactivate(
    userId: string,
    body: StaffCommandBody,
  ): Promise<StaffCommandData> {
    const response = await apiClient.post(`/staff/${userId}/reactivate`, body);
    return parseApiResponse(response.data, staffCommandDataSchema).data;
  },
  async changeDepartment(
    userId: string,
    body: StaffDepartmentBody,
  ): Promise<StaffCommandData> {
    const response = await apiClient.patch(`/staff/${userId}/department`, body);
    return parseApiResponse(response.data, staffCommandDataSchema).data;
  },
};
