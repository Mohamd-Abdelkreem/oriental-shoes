import {
  salesUuidSchema,
  officialOrderPaperDataSchema,
  type OfficialOrderPaperData,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

export const orderPaperApi = {
  async get(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<OfficialOrderPaperData> {
    const id = salesUuidSchema.parse(orderId),
      response = await apiClient.get(`/order-paper/${id}`, {
        ...(signal === undefined ? {} : { signal }),
      });
    const raw: unknown = response.data,
      parsed = parseApiResponse(raw, officialOrderPaperDataSchema).data;
    if (parsed.order.id !== id) throw new ApiContractError();
    return parsed;
  },
};
