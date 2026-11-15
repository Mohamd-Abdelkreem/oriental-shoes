import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { WarehouseService } from "./warehouse.service.js";
import {
  warehouseDashboardQueryDtoSchema,
  warehouseOrderParamsDtoSchema,
  warehouseCommandParamsDtoSchema,
  warehouseOrdersQueryDtoSchema,
  warehousePiecesQueryDtoSchema,
  warehouseActivityQueryDtoSchema,
  warehouseOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/warehouse-read.dto.js";
import { warehouseCommandBodyDtoSchema } from "./dto/warehouse-command.dto.js";

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
export class WarehouseController {
  constructor(private readonly service: WarehouseService) {}
  private ok(
    request: Request,
    response: Response,
    projection: unknown,
  ): Response {
    response.setHeader("Cache-Control", "private, no-store");
    return ResponseHelper.ok(
      response,
      projection,
      "Warehouse operation completed.",
      request.path,
      request.requestId,
    );
  }
  dashboard = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(
      request,
      "query",
      warehouseDashboardQueryDtoSchema,
    );
    return this.ok(
      request,
      response,
      await this.service.dashboard(actor, query),
    );
  };
  listOrders = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(request, "query", warehouseOrdersQueryDtoSchema);
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
      query = parsedContext(request, "query", warehousePiecesQueryDtoSchema);
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
      params = parsedContext(request, "params", warehouseOrderParamsDtoSchema);
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
      query = parsedContext(request, "query", warehouseActivityQueryDtoSchema);
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
      params = parsedContext(request, "params", warehouseOrderParamsDtoSchema),
      query = parsedContext(
        request,
        "query",
        warehouseOrderHistoryQueryDtoSchema,
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
    const body = parsedContext(request, "body", warehouseCommandBodyDtoSchema);
    return this.ok(request, response, await this.service.execute(actor, body));
  };
  observe = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(
        request,
        "params",
        warehouseCommandParamsDtoSchema,
      );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.observe(actor, params.commandId),
    );
  };
}
