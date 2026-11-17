import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { AdministrationService } from "./administration.service.js";
import * as readDto from "./dto/administration-read.dto.js";
import { administrationCommandBodyDtoSchema } from "./dto/administration-command.dto.js";

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
  const context = request.validated?.[slot];
  if (context === undefined)
    throw new InternalServerError(
      "Validated operation context is unavailable.",
    );
  const parsed = schema.safeParse(context);
  if (!parsed.success)
    throw new InternalServerError("Validated operation context is invalid.");
  return parsed.data;
};
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}
  private ok(
    request: Request,
    response: Response,
    projection: unknown,
  ): Response {
    response.setHeader("Cache-Control", "private, no-store");
    return ResponseHelper.ok(
      response,
      projection,
      "Administration operation completed.",
      request.path,
      request.requestId,
    );
  }
  dashboard = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationDashboardQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.dashboard(actor, query),
    );
  };
  filterOptions = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationFilterOptionsQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.filterOptions(actor, query),
    );
  };
  listOrders = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationOrdersQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.listOrders(actor, query),
    );
  };
  approvals = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationApprovalsQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.approvals(actor, query),
    );
  };
  corrections = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationCorrectionsQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.corrections(actor, query),
    );
  };
  deliveryExceptions = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationDeliveryExceptionsQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.deliveryExceptions(actor, query),
    );
  };
  activity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationActivityQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.activity(actor, query),
    );
  };
  report = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationReportQueryDtoSchema,
      );
    return this.ok(request, response, await this.service.report(actor, query));
  };
  printReport = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(
        request,
        "query",
        readDto.administrationReportPrintQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.printReport(actor, query),
    );
  };
  getOrder = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(
        request,
        "params",
        readDto.administrationOrderParamsDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.getOrder(actor, params.orderId),
    );
  };
  orderHistory = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(
        request,
        "params",
        readDto.administrationOrderParamsDtoSchema,
      ),
      query = parsedContext(
        request,
        "query",
        readDto.administrationOrderHistoryQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.orderHistory(actor, params.orderId, query),
    );
  };
  execute = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      body = parsedContext(request, "body", administrationCommandBodyDtoSchema);
    return this.ok(request, response, await this.service.execute(actor, body));
  };
  observe = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(
        request,
        "params",
        readDto.administrationCommandParamsDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.observe(actor, params.commandId),
    );
  };
}
