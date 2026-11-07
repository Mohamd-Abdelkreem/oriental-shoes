import {
  approvalCommandDataSchema,
  approvalDashboardDataSchema,
  approvalEventDataSchema,
  approvalHistoryDataSchema,
  approvalHistoryQuerySchema,
  approvalIssuesDataSchema,
  approvalIssuesQuerySchema,
  approvalOrderDataSchema,
  approvalOrderHistoryDataSchema,
  approvalOrderHistoryQuerySchema,
  approvalOrdersDataSchema,
  approvalOrdersQuerySchema,
  approveInitialBodySchema,
  resolveIssueBodySchema,
  returnInitialBodySchema,
  reviewContactBodySchema,
  salesUuidSchema,
  type ApprovalCommandData,
  type ApprovalCommandOperation,
  type ApprovalDashboardData,
  type ApprovalEventData,
  type ApprovalHistoryData,
  type ApprovalHistoryQueryInput,
  type ApprovalIssuesData,
  type ApprovalIssuesQueryInput,
  type ApprovalOrderData,
  type ApprovalOrderHistoryData,
  type ApprovalOrderHistoryQueryInput,
  type ApprovalOrdersData,
  type ApprovalOrdersQueryInput,
  type ApproveInitialBody,
  type ResolveIssueBody,
  type ReturnInitialBody,
  type ReviewContactBody,
} from "@template/contracts";
import {
  apiClient,
  parseApiResponse,
  ApiContractError,
} from "@/services/api/api-client";

const commandResult = (
  raw: unknown,
  body: Pick<ApproveInitialBody, "commandId" | "expectedVersion">,
  target: {
    operation: ApprovalCommandOperation;
    orderId: string;
    pieceId?: string;
    issueId?: string;
    proposalId?: string;
  },
): ApprovalCommandData => {
  const parsed = parseApiResponse(raw, approvalCommandDataSchema).data;
  if (
    parsed.receipt.commandId !== body.commandId ||
    parsed.receipt.operation !== target.operation ||
    parsed.receipt.orderId !== target.orderId ||
    parsed.receipt.beforeVersion !== body.expectedVersion ||
    parsed.receipt.afterVersion !== body.expectedVersion + 1 ||
    (target.pieceId !== undefined &&
      parsed.outcome.pieceId !== target.pieceId) ||
    (target.issueId !== undefined &&
      parsed.outcome.issueId !== target.issueId) ||
    (target.proposalId !== undefined &&
      parsed.outcome.proposalId !== target.proposalId)
  )
    throw new ApiContractError();
  return parsed;
};
export const approvalApi = {
  async dashboard(signal?: AbortSignal): Promise<ApprovalDashboardData> {
    const response = await apiClient.get("/approvals/dashboard", {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalDashboardDataSchema).data;
    return parsed;
  },
  async orders(
    query: ApprovalOrdersQueryInput,
    signal?: AbortSignal,
  ): Promise<ApprovalOrdersData> {
    const filters = approvalOrdersQuerySchema.parse(query);
    const response = await apiClient.get("/approvals/orders", {
      params: filters,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalOrdersDataSchema).data;
    return parsed;
  },
  async issues(
    query: ApprovalIssuesQueryInput,
    signal?: AbortSignal,
  ): Promise<ApprovalIssuesData> {
    const filters = approvalIssuesQuerySchema.parse(query);
    const response = await apiClient.get("/approvals/issues", {
      params: filters,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalIssuesDataSchema).data;
    return parsed;
  },
  async history(
    query: ApprovalHistoryQueryInput,
    signal?: AbortSignal,
  ): Promise<ApprovalHistoryData> {
    const filters = approvalHistoryQuerySchema.parse(query);
    const response = await apiClient.get("/approvals/history", {
      params: filters,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalHistoryDataSchema).data;
    return parsed;
  },
  async order(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalOrderData> {
    const id = salesUuidSchema.parse(orderId);
    const response = await apiClient.get(`/approvals/orders/${id}`, {
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalOrderDataSchema).data;
    if (parsed.order.id !== id) throw new ApiContractError();
    return parsed;
  },
  async orderHistory(
    orderId: string,
    query: ApprovalOrderHistoryQueryInput,
    signal?: AbortSignal,
  ): Promise<ApprovalOrderHistoryData> {
    const id = salesUuidSchema.parse(orderId);
    const filters = approvalOrderHistoryQuerySchema.parse(query);
    const response = await apiClient.get(`/approvals/orders/${id}/history`, {
      params: filters,
      ...(signal === undefined ? {} : { signal }),
    });
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalOrderHistoryDataSchema).data;
    if (
      parsed.events.some((row) =>
        row.kind === "draft"
          ? row.change.draftId !== id
          : row.event.orderId !== id,
      )
    )
      throw new ApiContractError();
    return parsed;
  },
  async event(
    orderId: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalEventData> {
    const id = salesUuidSchema.parse(orderId);
    const event = salesUuidSchema.parse(eventId);
    const response = await apiClient.get(
      `/approvals/orders/${id}/events/${event}`,
      { ...(signal === undefined ? {} : { signal }) },
    );
    const raw: unknown = response.data;
    const parsed = parseApiResponse(raw, approvalEventDataSchema).data;
    if (parsed.event.orderId !== id || parsed.event.id !== event)
      throw new ApiContractError();
    return parsed;
  },
  async approve(
    orderId: string,
    body: ApproveInitialBody,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(orderId),
      input = approveInitialBodySchema.parse(body);
    const response = await apiClient.post(
      `/approvals/orders/${id}/approve`,
      input,
    );
    const raw: unknown = response.data;
    return commandResult(raw, input, {
      operation: "APPROVE_INITIAL",
      orderId: id,
    });
  },
  async return(
    orderId: string,
    body: ReturnInitialBody,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(orderId),
      input = returnInitialBodySchema.parse(body);
    const response = await apiClient.post(
      `/approvals/orders/${id}/return`,
      input,
    );
    const raw: unknown = response.data;
    return commandResult(raw, input, {
      operation: "RETURN_INITIAL",
      orderId: id,
    });
  },
  async resolve(
    orderId: string,
    pieceId: string,
    issueId: string,
    body: ResolveIssueBody,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(orderId),
      input = resolveIssueBodySchema.parse(body);
    const piece = salesUuidSchema.parse(pieceId),
      issue = salesUuidSchema.parse(issueId);
    const response = await apiClient.post(
      `/approvals/orders/${id}/pieces/${piece}/issues/${issue}/resolve`,
      input,
    );
    const raw: unknown = response.data;
    return commandResult(raw, input, {
      operation: "RESOLVE_ISSUE",
      orderId: id,
      pieceId: piece,
      issueId: issue,
    });
  },
  async review(
    orderId: string,
    pieceId: string,
    issueId: string,
    body: ReviewContactBody,
  ): Promise<ApprovalCommandData> {
    const id = salesUuidSchema.parse(orderId),
      input = reviewContactBodySchema.parse(body);
    const piece = salesUuidSchema.parse(pieceId),
      issue = salesUuidSchema.parse(issueId);
    const response = await apiClient.post(
      `/approvals/orders/${id}/pieces/${piece}/issues/${issue}/review`,
      input,
    );
    const raw: unknown = response.data;
    return commandResult(raw, input, {
      operation: "REVIEW_CONTACT",
      orderId: id,
      pieceId: piece,
      issueId: issue,
      proposalId: input.proposalId,
    });
  },
};
