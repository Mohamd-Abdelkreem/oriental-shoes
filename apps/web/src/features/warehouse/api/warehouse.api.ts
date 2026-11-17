import {
  warehouseDashboardQuerySchema,
  warehouseDashboardDataSchema,
  warehouseOrdersQuerySchema,
  warehouseOrdersDataSchema,
  warehousePiecesQuerySchema,
  warehousePiecesDataSchema,
  warehouseOrderDataSchema,
  warehouseActivityQuerySchema,
  warehouseActivityDataSchema,
  warehouseOrderHistoryQuerySchema,
  warehouseOrderHistoryDataSchema,
  warehouseCommandBodySchema,
  warehouseCommandDataSchema,
  salesUuidSchema,
  type WarehouseDashboardQueryInput,
  type WarehouseOrdersQueryInput,
  type WarehousePiecesQueryInput,
  type WarehouseActivityQueryInput,
  type WarehouseOrderHistoryQueryInput,
  type WarehouseCommandBody,
  type WarehouseHistoryItem,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";
import { bindWarehouseCommandResult } from "../model/warehouse-command-binding.model";

const options = (signal?: AbortSignal) =>
  signal === undefined ? {} : { signal };
const bindPage = <T extends { pagination: { page: number; limit: number } }>(
  page: T,
  query: { page: number; limit: number },
): T => {
  if (
    page.pagination.page !== query.page ||
    page.pagination.limit !== query.limit
  )
    throw new ApiContractError();
  return page;
};
const hasPiece = (item: WarehouseHistoryItem, pieceId: string): boolean => {
  switch (item.kind) {
    case "administration":
    case "warehouse":
      return item.event.pieceIds.includes(pieceId);
    case "manufacturing":
    case "quality":
      return item.event.pieces.some((piece) => piece.pieceId === pieceId);
    case "issue":
      return item.event.pieceId === pieceId;
  }
};
export const warehouseApi = {
  async dashboard(query: WarehouseDashboardQueryInput, signal?: AbortSignal) {
    const params = warehouseDashboardQuerySchema.parse(query),
      response = await apiClient.get("/warehouse/dashboard", {
        ...options(signal),
        params,
      });
    return parseApiResponse(response.data, warehouseDashboardDataSchema).data;
  },
  async orders(query: WarehouseOrdersQueryInput, signal?: AbortSignal) {
    const params = warehouseOrdersQuerySchema.parse(query),
      response = await apiClient.get("/warehouse/orders", {
        ...options(signal),
        params,
      });
    const page = bindPage(
      parseApiResponse(response.data, warehouseOrdersDataSchema).data,
      params,
    );
    if (page.view !== params.view) throw new ApiContractError();
    return page;
  },
  async pieces(query: WarehousePiecesQueryInput, signal?: AbortSignal) {
    const params = warehousePiecesQuerySchema.parse(query),
      response = await apiClient.get("/warehouse/pieces", {
        ...options(signal),
        params,
      });
    const page = bindPage(
      parseApiResponse(response.data, warehousePiecesDataSchema).data,
      params,
    );
    if (page.view !== params.view || page.orderId !== (params.orderId ?? null))
      throw new ApiContractError();
    return page;
  },
  async order(orderId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(orderId),
      response = await apiClient.get(
        `/warehouse/orders/${id}`,
        options(signal),
      );
    const detail = parseApiResponse(
      response.data,
      warehouseOrderDataSchema,
    ).data;
    if (detail.summary.id !== id) throw new ApiContractError();
    return detail;
  },
  async activity(query: WarehouseActivityQueryInput, signal?: AbortSignal) {
    const params = warehouseActivityQuerySchema.parse(query),
      response = await apiClient.get("/warehouse/activity", {
        ...options(signal),
        params,
      });
    return bindPage(
      parseApiResponse(response.data, warehouseActivityDataSchema).data,
      params,
    );
  },
  async orderHistory(
    orderId: string,
    query: WarehouseOrderHistoryQueryInput,
    signal?: AbortSignal,
  ) {
    const id = salesUuidSchema.parse(orderId),
      params = warehouseOrderHistoryQuerySchema.parse(query),
      response = await apiClient.get(`/warehouse/orders/${id}/history`, {
        ...options(signal),
        params,
      });
    const page = bindPage(
      parseApiResponse(response.data, warehouseOrderHistoryDataSchema).data,
      params,
    );
    if (
      page.orderId !== id ||
      page.events.some(
        (item) =>
          item.event.orderId !== id ||
          (params.pieceId !== undefined && !hasPiece(item, params.pieceId)),
      )
    )
      throw new ApiContractError();
    return page;
  },
  async command(body: WarehouseCommandBody) {
    const intent = warehouseCommandBodySchema.parse(body),
      response = await apiClient.post("/warehouse/commands", intent);
    return bindWarehouseCommandResult(
      parseApiResponse(response.data, warehouseCommandDataSchema).data,
      intent,
    );
  },
  async observe(commandId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(commandId),
      response = await apiClient.get(
        `/warehouse-commands/${id}`,
        options(signal),
      );
    const receipt = parseApiResponse(
      response.data,
      warehouseCommandDataSchema,
    ).data;
    if (receipt.receipt.commandId !== id) throw new ApiContractError();
    return receipt;
  },
};
export type WarehouseApi = typeof warehouseApi;
