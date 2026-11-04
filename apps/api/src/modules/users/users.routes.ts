import { Router, type RequestHandler } from "express";

import {
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import { updateProfileBodyDtoSchema } from "./dto/update-profile.dto.js";
import type { UsersController } from "./users.controller.js";

export const usersRoutes = (
  controller: UsersController,
  businessAuthenticationMiddleware: RequestHandler,
  identityAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();

  router.get("/me", identityAuthenticationMiddleware, controller.getMe);
  router.patch(
    "/me",
    businessAuthenticationMiddleware,
    csrfMiddleware,
    validationMiddleware({ body: updateProfileBodyDtoSchema }),
    controller.updateMe,
  );
  return router;
};
