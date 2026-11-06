import {
  draftChangesDataSchema,
  draftCommandDataSchema,
  draftDataSchema,
  draftListDataSchema,
  type CreateDraftBody,
  type DraftChangesData,
  type DraftChangesQueryInput,
  type DraftCommandData,
  type DraftData,
  type DraftListData,
  type DraftListQueryInput,
  type SaveDraftBody,
} from "@template/contracts";
import { apiClient, parseApiResponse } from "@/services/api/api-client";

export const draftsApi = {
  async list(
    query: DraftListQueryInput,
    signal?: AbortSignal,
  ): Promise<DraftListData> {
    const response = await apiClient.get("/sales-drafts", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftListDataSchema).data;
  },
  async get(draftId: string, signal?: AbortSignal): Promise<DraftData> {
    const response = await apiClient.get(`/sales-drafts/${draftId}`, {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftDataSchema).data;
  },
  async changes(
    draftId: string,
    query: DraftChangesQueryInput,
    signal?: AbortSignal,
  ): Promise<DraftChangesData> {
    const response = await apiClient.get(`/sales-drafts/${draftId}/changes`, {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftChangesDataSchema).data;
  },
  async activity(
    query: DraftChangesQueryInput,
    signal?: AbortSignal,
  ): Promise<DraftChangesData> {
    const response = await apiClient.get("/sales-drafts/changes", {
      params: query,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftChangesDataSchema).data;
  },
  async create(body: CreateDraftBody): Promise<DraftCommandData> {
    const response = await apiClient.post("/sales-drafts", body);
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftCommandDataSchema).data;
  },
  async save(draftId: string, body: SaveDraftBody): Promise<DraftCommandData> {
    const response = await apiClient.put(`/sales-drafts/${draftId}`, body);
    const raw: unknown = response.data;
    return parseApiResponse(raw, draftCommandDataSchema).data;
  },
};
