import {
  manufacturingDashboardDataSchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingOrderDataSchema,
  manufacturingActivityDataSchema,
  manufacturingOrderHistoryDataSchema,
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  manufacturingActivityQuerySchema,
  manufacturingOrderHistoryQuerySchema,
  manufacturingCommandBodySchema,
  manufacturingCommandDataSchema,
  manufacturingDepartmentSchema,
  reportIssueBodySchema,
  approvalCommandDataSchema,
  salesUuidSchema,
  type ManufacturingDepartment,
  type ManufacturingOrdersQueryInput,
  type ManufacturingPiecesQueryInput,
  type ManufacturingActivityQueryInput,
  type ManufacturingOrderHistoryQueryInput,
  type ManufacturingCommandBody,
  type ManufacturingCommandData,
  type ReportIssueBody,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";
import { approvalCommandsApi } from "@/features/approval/api/approval-commands.api";

const path = (department: ManufacturingDepartment) =>
  `/manufacturing/${manufacturingDepartmentSchema.parse(department).toLowerCase()}`;
const options = (signal?: AbortSignal) =>
  signal === undefined ? {} : { signal };
const bindDepartment = <T extends { department: ManufacturingDepartment }>(
  data: T,
  department: ManufacturingDepartment,
): T => {
  if (data.department !== department) throw new ApiContractError();
  return data;
};
export const bindManufacturingWorkResult = (
  data: ManufacturingCommandData,
  department: ManufacturingDepartment,
  body: ManufacturingCommandBody,
): ManufacturingCommandData => {
  if (
    data.receipt.commandId !== body.commandId ||
    data.receipt.operation !== body.operation ||
    data.receipt.department !== department ||
    data.outcome.orders.length !== body.orders.length
  )
    throw new ApiContractError();
  for (const group of body.orders) {
    const actual = data.outcome.orders.find(
      (order) => order.orderId === group.orderId,
    );
    if (
      !actual ||
      actual.beforeVersion !== group.expectedVersion ||
      actual.afterVersion !== group.expectedVersion + 1 ||
      actual.pieces.length !== group.pieceIds.length ||
      actual.pieces.some((piece) => !group.pieceIds.includes(piece.pieceId))
    )
      throw new ApiContractError();
  }
  return data;
};
export const manufacturingApi = {
  async dashboard(department: ManufacturingDepartment, signal?: AbortSignal) {
    const response = await apiClient.get(
      `${path(department)}/dashboard`,
      options(signal),
    );
    return bindDepartment(
      parseApiResponse(response.data, manufacturingDashboardDataSchema).data,
      department,
    );
  },
  async orders(
    department: ManufacturingDepartment,
    query: ManufacturingOrdersQueryInput,
    signal?: AbortSignal,
  ) {
    const params = manufacturingOrdersQuerySchema.parse(query);
    const response = await apiClient.get(`${path(department)}/orders`, {
      ...options(signal),
      params,
    });
    const data = bindDepartment(
      parseApiResponse(response.data, manufacturingOrdersDataSchema).data,
      department,
    );
    if (
      data.view !== params.view ||
      data.pagination.page !== params.page ||
      data.pagination.limit !== params.limit
    )
      throw new ApiContractError();
    return data;
  },
  async pieces(
    department: ManufacturingDepartment,
    query: ManufacturingPiecesQueryInput,
    signal?: AbortSignal,
  ) {
    const params = manufacturingPiecesQuerySchema.parse(query);
    const response = await apiClient.get(`${path(department)}/pieces`, {
      ...options(signal),
      params,
    });
    const data = bindDepartment(
      parseApiResponse(response.data, manufacturingPiecesDataSchema).data,
      department,
    );
    if (
      data.view !== params.view ||
      data.pagination.page !== params.page ||
      data.pagination.limit !== params.limit ||
      (params.orderId !== undefined &&
        data.items.some((row) => row.order.id !== params.orderId))
    )
      throw new ApiContractError();
    return data;
  },
  async order(
    department: ManufacturingDepartment,
    orderId: string,
    signal?: AbortSignal,
  ) {
    const id = salesUuidSchema.parse(orderId);
    const response = await apiClient.get(
      `${path(department)}/orders/${id}`,
      options(signal),
    );
    const data = bindDepartment(
      parseApiResponse(response.data, manufacturingOrderDataSchema).data,
      department,
    );
    if (data.paper.order.id !== id) throw new ApiContractError();
    return data;
  },
  async activity(
    department: ManufacturingDepartment,
    query: ManufacturingActivityQueryInput,
    signal?: AbortSignal,
  ) {
    const params = manufacturingActivityQuerySchema.parse(query);
    const response = await apiClient.get(`${path(department)}/activity`, {
      ...options(signal),
      params,
    });
    const data = bindDepartment(
      parseApiResponse(response.data, manufacturingActivityDataSchema).data,
      department,
    );
    if (
      data.pagination.page !== params.page ||
      data.pagination.limit !== params.limit
    )
      throw new ApiContractError();
    return data;
  },
  async orderHistory(
    department: ManufacturingDepartment,
    orderId: string,
    query: ManufacturingOrderHistoryQueryInput,
    signal?: AbortSignal,
  ) {
    const id = salesUuidSchema.parse(orderId),
      params = manufacturingOrderHistoryQuerySchema.parse(query);
    const response = await apiClient.get(
      `${path(department)}/orders/${id}/history`,
      { ...options(signal), params },
    );
    const data = bindDepartment(
      parseApiResponse(response.data, manufacturingOrderHistoryDataSchema).data,
      department,
    );
    if (
      data.orderId !== id ||
      data.events.some((row) => row.event.orderId !== id) ||
      data.pagination.page !== params.page ||
      data.pagination.limit !== params.limit
    )
      throw new ApiContractError();
    return data;
  },
  async command(
    department: ManufacturingDepartment,
    body: ManufacturingCommandBody,
  ) {
    const input = manufacturingCommandBodySchema.parse(body);
    const response = await apiClient.post(
      `${path(department)}/commands`,
      input,
    );
    return bindManufacturingWorkResult(
      parseApiResponse(response.data, manufacturingCommandDataSchema).data,
      department,
      input,
    );
  },
  async reportIssue(orderId: string, pieceId: string, body: ReportIssueBody) {
    const id = salesUuidSchema.parse(orderId),
      piece = salesUuidSchema.parse(pieceId),
      input = reportIssueBodySchema.parse(body);
    const response = await apiClient.post(
      `/manufacturing-orders/${id}/pieces/${piece}/issues`,
      input,
    );
    const data = parseApiResponse(
      response.data,
      approvalCommandDataSchema,
    ).data;
    if (
      data.receipt.commandId !== input.commandId ||
      data.receipt.operation !== "REPORT_ISSUE" ||
      data.receipt.orderId !== id ||
      data.receipt.beforeVersion !== input.expectedVersion ||
      data.receipt.afterVersion !== input.expectedVersion + 1 ||
      data.outcome.pieceId !== piece ||
      data.outcome.orderId !== id ||
      data.outcome.issueId === null
    )
      throw new ApiContractError();
    return data;
  },
  async observeWork(commandId: string, signal?: AbortSignal) {
    const id = salesUuidSchema.parse(commandId);
    const response = await apiClient.get(
      `/manufacturing-commands/${id}`,
      options(signal),
    );
    const data = parseApiResponse(
      response.data,
      manufacturingCommandDataSchema,
    ).data;
    if (data.receipt.commandId !== id) throw new ApiContractError();
    return data;
  },
  observeReport: (commandId: string, signal?: AbortSignal) =>
    approvalCommandsApi.get(commandId, signal),
};
