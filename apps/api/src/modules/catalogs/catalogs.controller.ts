import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { CatalogsService } from "./catalogs.service.js";
import { catalogQuoteBodyDtoSchema } from "./dto/catalog-quote.dto.js";

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
export class CatalogsController {
  constructor(
    private readonly service: Pick<CatalogsService, "get" | "quote">,
  ) {}
  get = async (request: Request, response: Response): Promise<Response> =>
    ResponseHelper.ok(
      response,
      await this.service.get(requireActor(request)),
      "Catalog loaded.",
      request.path,
      request.requestId,
    );
  quote = async (request: Request, response: Response): Promise<Response> =>
    ResponseHelper.ok(
      response,
      await this.service.quote(
        requireActor(request),
        parsedContext(request, "body", catalogQuoteBodyDtoSchema),
      ),
      "Quote calculated.",
      request.path,
      request.requestId,
    );
}
