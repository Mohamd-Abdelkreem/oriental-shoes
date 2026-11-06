import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { SalesDraftsService } from "./sales-drafts.service.js";
import { createDraftBodyDtoSchema } from "./dto/create-draft.dto.js";
import { saveDraftBodyDtoSchema } from "./dto/save-draft.dto.js";
import { draftParamsDtoSchema } from "./dto/draft-params.dto.js";
import { draftListQueryDtoSchema } from "./dto/draft-list.dto.js";
import { draftChangesQueryDtoSchema } from "./dto/draft-changes.dto.js";

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
export class SalesDraftsController {
  constructor(
    private readonly service: Pick<
      SalesDraftsService,
      "list" | "get" | "changes" | "create" | "save"
    >,
  ) {}
  list = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(request, "query", draftListQueryDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.service.list(actor, query),
      "Drafts loaded.",
      request.path,
      request.requestId,
    );
  };
  get = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", draftParamsDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.service.get(actor, params.draftId),
      "Draft loaded.",
      request.path,
      request.requestId,
    );
  };
  activity = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const actor = requireActor(request);
    const query = parsedContext(request, "query", draftChangesQueryDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.service.changes(actor, query),
      "Draft activity loaded.",
      request.path,
      request.requestId,
    );
  };
  changes = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", draftParamsDtoSchema),
      query = parsedContext(request, "query", draftChangesQueryDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.service.changes(actor, query, params.draftId),
      "Draft changes loaded.",
      request.path,
      request.requestId,
    );
  };
  create = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const body = parsedContext(request, "body", createDraftBodyDtoSchema);
    return ResponseHelper.created(
      response,
      await this.service.create(actor, body),
      "Draft saved.",
      request.path,
      request.requestId,
    );
  };
  save = async (request: Request, response: Response): Promise<Response> => {
    const actor = requireActor(request);
    const params = parsedContext(request, "params", draftParamsDtoSchema),
      body = parsedContext(request, "body", saveDraftBodyDtoSchema);
    return ResponseHelper.ok(
      response,
      await this.service.save(actor, params.draftId, body),
      "Draft saved.",
      request.path,
      request.requestId,
    );
  };
}
