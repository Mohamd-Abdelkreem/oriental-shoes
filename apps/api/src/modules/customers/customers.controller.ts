import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import { createCustomerBodyDtoSchema } from "./dto/create-customer.dto.js";
import { updateCustomerBodyDtoSchema } from "./dto/update-customer.dto.js";
import { customerParamsDtoSchema } from "./dto/customer-params.dto.js";
import { customerPhoneParamsDtoSchema } from "./dto/customer-phone.dto.js";
import { customerListQueryDtoSchema } from "./dto/customer-list.dto.js";
import { customerMeasurementsQueryDtoSchema } from "./dto/customer-measurements.dto.js";
import { customerDraftsQueryDtoSchema } from "./dto/customer-drafts.dto.js";
import type { CustomersService } from "./customers.service.js";

const requireActor = (request: Request): string => {
  const id = request.user?.id;
  if (id === undefined || id.length === 0)
    throw new InternalServerError(
      "Authenticated customer context is unavailable.",
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
    throw new InternalServerError("Validated customer context is unavailable.");
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new InternalServerError("Validated customer context is invalid.");
  return parsed.data;
};

export class CustomersController {
  constructor(
    private readonly customers: Pick<
      CustomersService,
      | "list"
      | "get"
      | "getByPhone"
      | "measurements"
      | "drafts"
      | "create"
      | "update"
    >,
  ) {}
  list = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      query = parsedContext(request, "query", customerListQueryDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.customers.list(actor, query),
      "Customer directory loaded.",
      request.path,
      request.requestId,
    );
  };
  get = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", customerParamsDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.customers.get(actor, params.customerId),
      "Customer loaded.",
      request.path,
      request.requestId,
    );
  };
  getByPhone = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", customerPhoneParamsDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.customers.getByPhone(actor, params.phone),
      "Customer loaded.",
      request.path,
      request.requestId,
    );
  };
  measurements = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", customerParamsDtoSchema),
      query = parsedContext(
        request,
        "query",
        customerMeasurementsQueryDtoSchema,
      );
    return ResponseHelper.ok(
      response,
      await this.customers.measurements(actor, params.customerId, query),
      "Provisional measurements loaded.",
      request.path,
      request.requestId,
    );
  };
  drafts = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", customerParamsDtoSchema),
      query = parsedContext(request, "query", customerDraftsQueryDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.customers.drafts(actor, params.customerId, query),
      "Customer draft cards loaded.",
      request.path,
      request.requestId,
    );
  };
  create = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      body = parsedContext(request, "body", createCustomerBodyDtoSchema);
    return ResponseHelper.created(
      response,
      await this.customers.create(actor, body),
      "Customer saved.",
      request.path,
      request.requestId,
    );
  };
  update = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request),
      params = parsedContext(request, "params", customerParamsDtoSchema),
      body = parsedContext(request, "body", updateCustomerBodyDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.customers.update(actor, params.customerId, body),
      "Customer saved.",
      request.path,
      request.requestId,
    );
  };
}
