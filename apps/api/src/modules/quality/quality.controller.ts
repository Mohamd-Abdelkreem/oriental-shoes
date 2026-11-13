import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { QualityService } from "./quality.service.js";
import {
  qualityOrderParamsDtoSchema,
  qualityCommandParamsDtoSchema,
  qualityOrdersQueryDtoSchema,
  qualityPiecesQueryDtoSchema,
  qualityActivityQueryDtoSchema,
  qualityOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/quality-read.dto.js";
import { qualityCommandBodyDtoSchema } from "./dto/quality-command.dto.js";

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
export class QualityController {
  constructor(private readonly service: QualityService) {}
  private ok(
    request: Request,
    response: Response,
    projection: unknown,
  ): Response {
    response.setHeader("Cache-Control", "private, no-store");
    return ResponseHelper.ok(
      response,
      projection,
      "Quality operation completed.",
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
  listOrders = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(request, "query", qualityOrdersQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.listOrders(actor, query),
    );
  };
  listPieces = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(request, "query", qualityPiecesQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.listPieces(actor, query),
    );
  };
  getOrder = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", qualityOrderParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.getOrder(actor, params.orderId),
    );
  };
  activity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(request, "query", qualityActivityQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.activity(actor, query),
    );
  };
  orderHistory = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", qualityOrderParamsDtoSchema),
      query = parsedContext(
        request,
        "query",
        qualityOrderHistoryQueryDtoSchema,
      );
    return this.ok(
      request,
      response,
      await this.service.orderHistory(actor, params.orderId, query),
    );
  };
  execute = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const body = parsedContext(request, "body", qualityCommandBodyDtoSchema);
    return this.ok(request, response, await this.service.execute(actor, body));
  };
  observe = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", qualityCommandParamsDtoSchema);
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.observe(actor, params.commandId),
    );
  };
}
