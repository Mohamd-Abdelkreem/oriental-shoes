import type { Request, Response } from "express";

import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { ResponseHelper } from "../../core/responses/api-response.js";
import type { UpdateProfileBodyDto } from "./dto/update-profile.dto.js";
import type { UsersService } from "./users.service.js";

/**
 * A missing authenticated actor is a server wiring defect, never an empty
 * actor and never an anonymous request.
 */
const requireActorId = (request: Request): string => {
  const actorId = request.user?.id;
  if (actorId === undefined || actorId.length === 0) {
    throw new InternalServerError("The authenticated actor is unavailable.");
  }
  return actorId;
};

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  getMe = async (request: Request, response: Response): Promise<Response> => {
    const user = await this.usersService.getCurrentUser(
      requireActorId(request),
    );
    return ResponseHelper.ok(
      response,
      { user },
      "Current user loaded.",
      request.path,
      request.requestId,
    );
  };

  updateMe = async (
    request: Request,
    response: Response,
  ): Promise<Response> => {
    const body = request.validated?.body as UpdateProfileBodyDto;
    const user = await this.usersService.updateCurrentUser(
      requireActorId(request),
      body,
    );
    return ResponseHelper.ok(
      response,
      { user },
      "Profile updated.",
      request.path,
      request.requestId,
    );
  };
}
