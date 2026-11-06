import {
  salesCommandDataSchema,
  type SalesCommandData,
} from "@template/contracts";
import { apiClient, parseApiResponse } from "@/services/api/api-client";

export const salesCommandsApi = {
  async get(
    commandId: string,
    signal?: AbortSignal,
  ): Promise<SalesCommandData> {
    const response = await apiClient.get(`/sales-commands/${commandId}`, {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesCommandDataSchema).data;
  },
};
