import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { WarehouseController } from "./warehouse.controller.js";
import {
  warehouseDashboardQueryDtoSchema,
  warehouseOrderParamsDtoSchema,
  warehouseCommandParamsDtoSchema,
  warehouseOrdersQueryDtoSchema,
  warehousePiecesQueryDtoSchema,
  warehouseActivityQueryDtoSchema,
  warehouseOrderHistoryQueryDtoSchema,
  salesEmptyQueryDtoSchema,
} from "./dto/warehouse-read.dto.js";
import { warehouseCommandBodyDtoSchema } from "./dto/warehouse-command.dto.js";

export const warehouseRoutes = (
  controller: WarehouseController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/dashboard",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({ query: warehouseDashboardQueryDtoSchema }),
    controller.dashboard,
  );
  router.get(
    "/orders",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({ query: warehouseOrdersQueryDtoSchema }),
    controller.listOrders,
  );
  router.get(
    "/pieces",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({ query: warehousePiecesQueryDtoSchema }),
    controller.listPieces,
  );
  router.get(
    "/orders/:orderId",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({
      params: warehouseOrderParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.getOrder,
  );
  router.get(
    "/activity",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({ query: warehouseActivityQueryDtoSchema }),
    controller.activity,
  );
  router.get(
    "/orders/:orderId/history",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({
      params: warehouseOrderParamsDtoSchema,
      query: warehouseOrderHistoryQueryDtoSchema,
    }),
    controller.orderHistory,
  );
  router.post(
    "/commands",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    csrfMiddleware,
    validationMiddleware({
      query: salesEmptyQueryDtoSchema,
      body: warehouseCommandBodyDtoSchema,
    }),
    controller.execute,
  );
  return router;
};
export const warehouseCommandRoutes = (
  controller: WarehouseController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    authentication,
    authorizeDepartments(Department.WAREHOUSE),
    validationMiddleware({
      params: warehouseCommandParamsDtoSchema,
      query: salesEmptyQueryDtoSchema,
    }),
    controller.observe,
  );
  return router;
};
