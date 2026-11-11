import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import { toManufacturingDepartment } from "./manufacturing.rules.js";
import type { ManufacturingService } from "./manufacturing.service.js";
import {
  manufacturingDepartmentParamsDtoSchema,
  manufacturingOrderParamsDtoSchema,
  manufacturingCommandParamsDtoSchema,
  manufacturingOrdersQueryDtoSchema,
  manufacturingPiecesQueryDtoSchema,
  manufacturingActivityQueryDtoSchema,
  manufacturingOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/manufacturing-read.dto.js";
import { manufacturingCommandBodyDtoSchema } from "./dto/manufacturing-command.dto.js";

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
export class ManufacturingController {
  constructor(private readonly service: ManufacturingService) {}
  private ok(request: Request, response: Response, data: unknown): Response {
    response.setHeader("Cache-Control", "private, no-store");
    return ResponseHelper.ok(
      response,
      data,
      "Manufacturing operation completed.",
      request.path,
      request.requestId,
    );
  }
  dashboard = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingDepartmentParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.dashboard(actor, department),
    );
  };
  listOrders = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingDepartmentParamsDtoSchema,
    );
    const query = parsedContext(
      request,
      "query",
      manufacturingOrdersQueryDtoSchema,
    );
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.listOrders(actor, department, query),
    );
  };
  listPieces = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingDepartmentParamsDtoSchema,
    );
    const query = parsedContext(
      request,
      "query",
      manufacturingPiecesQueryDtoSchema,
    );
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.listPieces(actor, department, query),
    );
  };
  getOrder = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingOrderParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.getOrder(actor, department, params.orderId),
    );
  };
  activity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingDepartmentParamsDtoSchema,
    );
    const query = parsedContext(
      request,
      "query",
      manufacturingActivityQueryDtoSchema,
    );
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.activity(actor, department, query),
    );
  };
  orderHistory = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingOrderParamsDtoSchema,
    );
    const query = parsedContext(
      request,
      "query",
      manufacturingOrderHistoryQueryDtoSchema,
    );
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.orderHistory(actor, department, params.orderId, query),
    );
  };
  execute = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingDepartmentParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    const department = toManufacturingDepartment(params.department);
    return this.ok(
      request,
      response,
      await this.service.execute(
        actor,
        department,
        parsedContext(request, "body", manufacturingCommandBodyDtoSchema),
      ),
    );
  };
  observe = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      manufacturingCommandParamsDtoSchema,
    );
    parsedContext(request, "query", salesEmptyQueryDtoSchema);
    return this.ok(
      request,
      response,
      await this.service.observe(actor, params.commandId),
    );
  };
}
