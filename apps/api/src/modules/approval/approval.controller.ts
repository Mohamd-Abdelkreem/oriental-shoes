import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { ApprovalService } from "./approval.service.js";
import {
  approvalOrdersQueryDtoSchema,
  approvalIssuesQueryDtoSchema,
  approvalHistoryQueryDtoSchema,
  approvalOrderHistoryQueryDtoSchema,
  salesContactQueryDtoSchema,
  salesOrderParamsDtoSchema,
  approvalPieceParamsDtoSchema,
  approvalIssueParamsDtoSchema,
  approvalEventParamsDtoSchema,
  salesCommandParamsDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/approval-read.dto.js";
import {
  approveInitialBodyDtoSchema,
  returnInitialBodyDtoSchema,
} from "./dto/initial-decision.dto.js";
import { reportIssueBodyDtoSchema } from "./dto/report-issue.dto.js";
import { resolveIssueBodyDtoSchema } from "./dto/resolve-issue.dto.js";
import { submitContactBodyDtoSchema } from "./dto/submit-contact.dto.js";
import { reviewContactBodyDtoSchema } from "./dto/review-contact.dto.js";

const requireActor = (request: Request): string => {
  const id = request.user?.id;
  if (id === undefined || id.length === 0)
    throw new InternalServerError(
      "Authenticated operation context is unavailable.",
    );
  return id;
};
const parsedContext = <T>(
  request: Request,
  slot: "body" | "query" | "params",
  schema: ZodType<T>,
): T => {
  const value = request.validated?.[slot];
  if (value === undefined)
    throw new InternalServerError(
      "Validated operation context is unavailable.",
    );
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new InternalServerError("Validated operation context is invalid.");
  return parsed.data;
};
export class ApprovalController {
  constructor(
    private readonly service: Pick<
      ApprovalService,
      | "dashboard"
      | "listPending"
      | "listIssues"
      | "history"
      | "getOrder"
      | "approveInitial"
      | "returnInitial"
      | "orderHistory"
      | "event"
      | "resolveIssue"
      | "reviewContact"
      | "salesContacts"
      | "getSalesContactOrder"
      | "submitContact"
      | "officialPaper"
      | "factoryPaper"
      | "reportIssue"
      | "observe"
    >,
  ) {}
  private ok(request: Request, response: Response, data: unknown): Response {
    response.setHeader("Cache-Control", "private, no-store");
    return ResponseHelper.ok(
      response,
      data,
      "Approval operation completed.",
      request.path,
      request.requestId,
    );
  }
  dashboard = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(request, response, await this.service.dashboard(actor));
  };
  listPending = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(request, "query", approvalOrdersQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.listPending(actor, query),
    );
  };
  listIssues = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(request, "query", approvalIssuesQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.listIssues(actor, query),
    );
  };
  history = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(
      request,
      "query",
      approvalHistoryQueryDtoSchema,
    );
    return this.ok(request, response, await this.service.history(actor, query));
  };
  getOrder = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.getOrder(actor, params.orderId),
    );
  };
  approveInitial = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", approveInitialBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.approveInitial(actor, params.orderId, body),
    );
  };
  returnInitial = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", returnInitialBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.returnInitial(actor, params.orderId, body),
    );
  };
  orderHistory = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    const query = parsedContext(
      request,
      "query",
      approvalOrderHistoryQueryDtoSchema,
    );
    return this.ok(
      request,
      response,
      await this.service.orderHistory(actor, params.orderId, query),
    );
  };
  event = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      approvalEventParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.event(actor, params.orderId, params.eventId),
    );
  };
  resolveIssue = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      approvalIssueParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", resolveIssueBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.resolveIssue(
        actor,
        params.orderId,
        params.pieceId,
        params.issueId,
        body,
      ),
    );
  };
  reviewContact = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      approvalIssueParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", reviewContactBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.reviewContact(
        actor,
        params.orderId,
        params.pieceId,
        params.issueId,
        body,
      ),
    );
  };
  salesContacts = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(request, "query", salesContactQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.salesContacts(actor, query),
    );
  };
  getSalesContactOrder = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.getSalesContactOrder(actor, params.orderId),
    );
  };
  submitContact = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      approvalIssueParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", submitContactBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.submitContact(
        actor,
        params.orderId,
        params.pieceId,
        params.issueId,
        body,
      ),
    );
  };
  officialPaper = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.officialPaper(actor, params.orderId),
    );
  };
  factoryPaper = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", salesOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.factoryPaper(actor, params.orderId),
    );
  };
  reportIssue = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      approvalPieceParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", reportIssueBodyDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.reportIssue(
        actor,
        params.orderId,
        params.pieceId,
        body,
      ),
    );
  };
  observe = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      salesCommandParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.observe(actor, params.commandId),
    );
  };
}
