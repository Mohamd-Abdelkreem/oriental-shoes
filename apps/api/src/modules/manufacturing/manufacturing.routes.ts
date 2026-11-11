import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { ManufacturingController } from "./manufacturing.controller.js";
import {
  manufacturingDepartmentParamsDtoSchema,
  manufacturingOrderParamsDtoSchema,
  manufacturingCommandParamsDtoSchema,
  manufacturingOrdersQueryDtoSchema,
  manufacturingPiecesQueryDtoSchema,
  manufacturingActivityQueryDtoSchema,
  manufacturingOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/manufacturing-read.dto.js";
import { manufacturingCommandBodyDtoSchema } from "./dto/manufacturing-command.dto.js";

export const manufacturingRoutes = (
  controller: ManufacturingController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:department/dashboard",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingDepartmentParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.dashboard,
  );
  router.get(
    "/:department/orders",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingDepartmentParamsDtoSchema,
      query: manufacturingOrdersQueryDtoSchema,
    }),
    controller.listOrders,
  );
  router.get(
    "/:department/pieces",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingDepartmentParamsDtoSchema,
      query: manufacturingPiecesQueryDtoSchema,
    }),
    controller.listPieces,
  );
  router.get(
    "/:department/orders/:orderId",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingOrderParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.getOrder,
  );
  router.get(
    "/:department/activity",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingDepartmentParamsDtoSchema,
      query: manufacturingActivityQueryDtoSchema,
    }),
    controller.activity,
  );
  router.get(
    "/:department/orders/:orderId/history",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingOrderParamsDtoSchema,
      query: manufacturingOrderHistoryQueryDtoSchema,
    }),
    controller.orderHistory,
  );
  router.post(
    "/:department/commands",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    csrfMiddleware,
    validationMiddleware({
      params: manufacturingDepartmentParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
      body: manufacturingCommandBodyDtoSchema,
    }),
    controller.execute,
  );
  return router;
};
export const manufacturingCommandRoutes = (
  controller: ManufacturingController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    authentication,
    authorizeDepartments(Department.CUTTING, Department.PRODUCTION),
    validationMiddleware({
      params: manufacturingCommandParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.observe,
  );
  return router;
};
