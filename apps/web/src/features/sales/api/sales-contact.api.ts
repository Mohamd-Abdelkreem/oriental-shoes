import {
  salesUuidSchema,
  salesContactQuerySchema,
  salesContactDataSchema,
  approvalOrderDataSchema,
  submitContactBodySchema,
  approvalCommandDataSchema,
  type SalesContactQueryInput,
  type SalesContactData,
  type ApprovalOrderData,
  type SubmitContactBody,
  type ApprovalCommandData,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

export const salesContactApi = {
  async list(
    query: SalesContactQueryInput,
    signal?: AbortSignal,
  ): Promise<SalesContactData> {
    const response = await apiClient.get("/sales-contact", {
      params: salesContactQuerySchema.parse(query),
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    return parseApiResponse(raw, salesContactDataSchema).data;
  },
  async order(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalOrderData> {
    const id = salesUuidSchema.parse(orderId),
      response = await apiClient.get(`/sales-contact/orders/${id}`, {
        ...(signal === undefined ? {} : { signal }),
      });
    const raw: unknown = response.data,
      parsed = parseApiResponse(raw, approvalOrderDataSchema).data;
    if (parsed.order.id !== id) throw new ApiContractError();
    return parsed;
  },
  async submit(
    orderId: string,
    pieceId: string,
    issueId: string,
    body: SubmitContactBody,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(orderId),
      piece = salesUuidSchema.parse(pieceId),
      issue = salesUuidSchema.parse(issueId),
      input = submitContactBodySchema.parse(body);
    const response = await apiClient.post(
        `/sales-contact/orders/${id}/pieces/${piece}/issues/${issue}/proposals`,
        input,
      ),
      raw: unknown = response.data,
      parsed = parseApiResponse(raw, approvalCommandDataSchema).data;
    if (
      parsed.receipt.operation !== "SUBMIT_CONTACT" ||
      parsed.receipt.orderId !== id ||
      parsed.receipt.commandId !== input.commandId ||
      parsed.receipt.beforeVersion !== input.expectedVersion ||
      parsed.receipt.afterVersion !== input.expectedVersion + 1 ||
      parsed.outcome.pieceId !== piece ||
      parsed.outcome.issueId !== issue ||
      parsed.outcome.proposalId === null
    )
      throw new ApiContractError();
    return parsed;
  },
};
