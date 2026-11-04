import { Router } from "express";

import type { DatabaseClient } from "@template/database";

import { openApiRoutes } from "./infrastructure/openapi/openapi.routes.js";
import type { EmailService } from "./infrastructure/email/email.service.js";
import {
  createAuthenticationMiddleware,
  createIdentityAuthenticationMiddleware,
} from "./middlewares/auth.middleware.js";
import {
  AuthController,
  authRoutes,
  AuthService,
  HealthController,
  healthRoutes,
  HealthService,
  StaffController,
  staffRoutes,
  StaffService,
  UsersController,
  usersRoutes,
  UsersService,
} from "./modules/index.js";

export const createApiRouter = (
  database: DatabaseClient,
  emailService: EmailService,
): Router => {
  const router = Router();

  const healthService = new HealthService(database);
  const healthController = new HealthController(healthService);
  const identityAuthenticationMiddleware =
    createIdentityAuthenticationMiddleware(database);
  const businessAuthenticationMiddleware =
    createAuthenticationMiddleware(database);
  const authController = new AuthController(
    new AuthService(database, emailService),
  );
  const usersController = new UsersController(new UsersService(database));
  const staffController = new StaffController(new StaffService(database));

  router.use(openApiRoutes());
  router.use(
    "/auth",
    authRoutes(
      authController,
      businessAuthenticationMiddleware,
      identityAuthenticationMiddleware,
    ),
  );
  router.use(
    "/users",
    usersRoutes(
      usersController,
      businessAuthenticationMiddleware,
      identityAuthenticationMiddleware,
    ),
  );
  router.use(
    "/staff",
    staffRoutes(staffController, businessAuthenticationMiddleware),
  );
  router.use("/health", healthRoutes(healthController));

  return router;
};
