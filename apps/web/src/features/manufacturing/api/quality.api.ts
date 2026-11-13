import { bindQualityCommandResult } from "../model/quality-command-binding.model";
import {
  qualityDashboardDataSchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityOrderDataSchema,
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  qualityActivityQuerySchema,
  qualityOrderHistoryQuerySchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  salesUuidSchema,
  type QualityCommandBody,
  type QualityOrdersQueryInput,
  type QualityPiecesQueryInput,
  type QualityActivityQueryInput,
  type QualityOrderHistoryQueryInput,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

export { bindQualityCommandResult } from "../model/quality-command-binding.model";

const options = (signal?: AbortSignal) =>
  signal === undefined ? {} : { signal };
const bindPage = <T extends { pagination: { page: number; limit: number } }>(
  data: T,
  query: { page: number; limit: number },
): T => {
  if (
    data.pagination.page !== query.page ||
    data.pagination.limit !== query.limit
  )
    throw new ApiContractError();
  return data;
};
export const qualityApi = {
  async dashboard(signal?: AbortSignal) {
    const response = await apiClient.get("/quality/dashboard", options(signal));
    return parseApiResponse(response.data, qualityDashboardDataSchema).data;
  },
  async orders(query: QualityOrdersQueryInput, signal?: AbortSignal) {
    const params = qualityOrdersQuerySchema.parse(query),
      response = await apiClient.get("/quality/orders", {
        ...options(signal),
        params,
      });
    const data = bindPage(
      parseApiResponse(response.data, qualityOrdersDataSchema).data,
      params,
    );
    if (data.view !== params.view) throw new ApiContractError();
    return data;
  },
  async pieces(query: QualityPiecesQueryInput, signal?: AbortSignal) {
    const params = qualityPiecesQuerySchema.parse(query),
      response = await apiClient.get("/quality/pieces", {
        ...options(signal),
        params,
      });
    const data = bindPage(
      parseApiResponse(response.data, qualityPiecesDataSchema).data,
      params,
    );
    if (
      data.view !== params.view ||
      (params.orderId !== undefined &&
        data.items.some((row) => row.order.id !== params.orderId))
    )
      throw new ApiContractError();
    return data;
  },
  async order(orderId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(orderId),
      response = await apiClient.get(`/quality/orders/${id}`, options(signal));
    const data = parseApiResponse(response.data, qualityOrderDataSchema).data;
    if (data.paper.order.id !== id) throw new ApiContractError();
    return data;
  },
  async activity(query: QualityActivityQueryInput, signal?: AbortSignal) {
    const params = qualityActivityQuerySchema.parse(query),
      response = await apiClient.get("/quality/activity", {
        ...options(signal),
        params,
      });
    return bindPage(
      parseApiResponse(response.data, qualityActivityDataSchema).data,
      params,
    );
  },
  async orderHistory(
    orderId: string,
    query: QualityOrderHistoryQueryInput,
    signal?: AbortSignal,
  ) {
    const id = salesUuidSchema.parse(orderId),
      params = qualityOrderHistoryQuerySchema.parse(query);
    const response = await apiClient.get(`/quality/orders/${id}/history`, {
      ...options(signal),
      params,
    });
    const data = bindPage(
      parseApiResponse(response.data, qualityOrderHistoryDataSchema).data,
      params,
    );
    if (
      data.orderId !== id ||
      data.events.some(
        ({ event }) =>
          event.orderId !== id ||
          (params.pieceId !== undefined &&
            !("pieces" in event
              ? event.pieces.some((piece) => piece.pieceId === params.pieceId)
              : event.pieceId === params.pieceId)),
      )
    )
      throw new ApiContractError();
    return data;
  },
  async command(body: QualityCommandBody) {
    const input = qualityCommandBodySchema.parse(body),
      response = await apiClient.post("/quality/commands", input);
    return bindQualityCommandResult(
      parseApiResponse(response.data, qualityCommandDataSchema).data,
      input,
    );
  },
  async observe(commandId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(commandId),
      response = await apiClient.get(
        `/quality-commands/${id}`,
        options(signal),
      );
    const data = parseApiResponse(response.data, qualityCommandDataSchema).data;
    if (data.receipt.commandId !== id) throw new ApiContractError();
    return data;
  },
};
