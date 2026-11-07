import {
  salesUuidSchema,
  approvalCommandDataSchema,
  type ApprovalCommandData,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

export const approvalCommandsApi = {
  async get(
    commandId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(commandId),
      response = await apiClient.get(`/approval-commands/${id}`, {
        ...(signal === undefined ? {} : { signal }),
      });
    const raw: unknown = response.data,
      parsed = parseApiResponse(raw, approvalCommandDataSchema).data;
    if (parsed.receipt.commandId !== id) throw new ApiContractError();
    return parsed;
  },
};
