import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { SalesOrdersService } from "./sales-orders.service.js";
import { customerParamsDtoSchema } from "../customers/dto/customer-params.dto.js";
import { submitOrderBodyDtoSchema } from "./dto/submit-order.dto.js";
import { resubmitOrderBodyDtoSchema } from "./dto/resubmit-order.dto.js";
import { setOrderPaidBodyDtoSchema } from "./dto/set-order-paid.dto.js";
import {
  salesOrderListQueryDtoSchema,
  salesOrderActivityQueryDtoSchema,
  customerOrdersQueryDtoSchema,
  customerOrderMeasurementsQueryDtoSchema,
  salesOrderParamsDtoSchema,
  salesOrderRevisionParamsDtoSchema,
} from "./dto/order-read.dto.js";

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
export class SalesOrdersController {
  constructor(
    private readonly service: Pick<
      SalesOrdersService,
      | "list"
      | "get"
      | "dashboard"
      | "tracking"
      | "activity"
      | "revision"
      | "editor"
      | "submit"
      | "resubmit"
      | "setPaid"
      | "customerOrders"
      | "customerMeasurements"
    >,
  ) {}
  list = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.list(
        actor,
        parsedContext(request, "query", salesOrderListQueryDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  dashboard = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.dashboard(actor),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  get = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.get(
        actor,
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  tracking = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.tracking(
        actor,
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  editor = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.editor(
        actor,
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  activity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.activity(
        actor,
        parsedContext(request, "query", salesOrderActivityQueryDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  orderActivity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.activity(
        actor,
        parsedContext(request, "query", salesOrderActivityQueryDtoSchema),
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  revision = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.revision(
        actor,
        parsedContext(request, "params", salesOrderRevisionParamsDtoSchema)
          .orderId,
        parsedContext(request, "params", salesOrderRevisionParamsDtoSchema)
          .eventId,
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  submit = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.created(
      response,
      await this.service.submit(
        actor,
        parsedContext(request, "body", submitOrderBodyDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  resubmit = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.resubmit(
        actor,
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
        parsedContext(request, "body", resubmitOrderBodyDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  setPaid = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.setPaid(
        actor,
        parsedContext(request, "params", salesOrderParamsDtoSchema).orderId,
        parsedContext(request, "body", setOrderPaidBodyDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  customerOrders = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.customerOrders(
        actor,
        parsedContext(request, "params", customerParamsDtoSchema).customerId,
        parsedContext(request, "query", customerOrdersQueryDtoSchema),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
  customerMeasurements = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    return ResponseHelper.ok(
      response,
      await this.service.customerMeasurements(
        actor,
        parsedContext(request, "params", customerParamsDtoSchema).customerId,
        parsedContext(
          request,
          "query",
          customerOrderMeasurementsQueryDtoSchema,
        ),
      ),
      "Order operation completed.",
      request.path,
      request.requestId,
    );
  };
}
