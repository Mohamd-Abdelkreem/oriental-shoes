import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { QualityController } from "./quality.controller.js";
import {
  qualityOrderParamsDtoSchema,
  qualityCommandParamsDtoSchema,
  qualityOrdersQueryDtoSchema,
  qualityPiecesQueryDtoSchema,
  qualityActivityQueryDtoSchema,
  qualityOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/quality-read.dto.js";
import { qualityCommandBodyDtoSchema } from "./dto/quality-command.dto.js";

export const qualityRoutes = (
  controller: QualityController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/dashboard",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({ query: salesEmptyQueryDtoSchema }),
    controller.dashboard,
  );
  router.get(
    "/orders",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({ query: qualityOrdersQueryDtoSchema }),
    controller.listOrders,
  );
  router.get(
    "/pieces",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({ query: qualityPiecesQueryDtoSchema }),
    controller.listPieces,
  );
  router.get(
    "/orders/:orderId",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({
      params: qualityOrderParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.getOrder,
  );
  router.get(
    "/activity",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({ query: qualityActivityQueryDtoSchema }),
    controller.activity,
  );
  router.get(
    "/orders/:orderId/history",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({
      params: qualityOrderParamsDtoSchema,
      query: qualityOrderHistoryQueryDtoSchema,
    }),
    controller.orderHistory,
  );
  router.post(
    "/commands",
    authentication,
    authorizeDepartments(Department.QUALITY),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      body: qualityCommandBodyDtoSchema,
    }),
    controller.execute,
  );
  return router;
};
export const qualityCommandRoutes = (
  controller: QualityController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    authentication,
    authorizeDepartments(Department.QUALITY),
    validationMiddleware({
      params: qualityCommandParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.observe,
  );
  return router;
};
