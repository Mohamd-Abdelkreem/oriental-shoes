import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import { salesEmptyQuerySchema } from "@template/contracts";
import {
  authorizeDepartments,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { SalesCommandsController } from "./sales-commands.controller.js";
import { salesCommandParamsDtoSchema } from "./dto/sales-command-params.dto.js";

export const salesCommandsRoutes = (
  controller: SalesCommandsController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    businessAuthenticationMiddleware,
    authorizeDepartments(Department.SALES),
    validationMiddleware({
      params: salesCommandParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.get,
  );
  return router;
};
