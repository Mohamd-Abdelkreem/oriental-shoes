import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { SalesCommandsService } from "./sales-commands.service.js";
import { salesCommandParamsDtoSchema } from "./dto/sales-command-params.dto.js";

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
export class SalesCommandsController {
  constructor(private readonly service: Pick<SalesCommandsService, "get">) {}
  get = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(
      request,
      "params",
      salesCommandParamsDtoSchema,
    );
    return ResponseHelper.ok(
      response,
      await this.service.get(actor, params.commandId),
      "Saved command result loaded.",
      request.path,
      request.requestId,
    );
  };
}
