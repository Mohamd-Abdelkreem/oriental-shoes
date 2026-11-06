import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import { salesEmptyQuerySchema } from "@template/contracts";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { SalesOrdersController } from "./sales-orders.controller.js";
import { customerParamsDtoSchema } from "../customers/dto/customer-params.dto.js";
import { submitOrderBodyDtoSchema } from "./dto/submit-order.dto.js";
import { resubmitOrderBodyDtoSchema } from "./dto/resubmit-order.dto.js";
import { setOrderPaidBodyDtoSchema } from "./dto/set-order-paid.dto.js";
import {
  salesOrderListQueryDtoSchema,
  salesOrderActivityQueryDtoSchema,
  customerOrdersQueryDtoSchema,
  customerOrderMeasurementsQueryDtoSchema,
  salesOrderParamsDtoSchema,
  salesOrderRevisionParamsDtoSchema,
} from "./dto/order-read.dto.js";

export const salesOrdersRoutes = (
  controller: SalesOrdersController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: salesOrderListQueryDtoSchema }),
    controller.list,
  );
  router.get(
    "/dashboard",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: salesEmptyQuerySchema }),
    controller.dashboard,
  );
  router.get(
    "/activity",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: salesOrderActivityQueryDtoSchema }),
    controller.activity,
  );
  router.post(
    "/",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      body: submitOrderBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.submit,
  );
  router.get(
    "/:orderId",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.get,
  );
  router.get(
    "/:orderId/tracking",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.tracking,
  );
  router.get(
    "/:orderId/activity",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      query: salesOrderActivityQueryDtoSchema,
    }),
    controller.orderActivity,
  );
  router.get(
    "/:orderId/activity/:eventId",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: salesOrderRevisionParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.revision,
  );
  router.post(
    "/:orderId/resubmit",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      body: resubmitOrderBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.resubmit,
  );
  router.patch(
    "/:orderId/paid",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      body: setOrderPaidBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.setPaid,
  );
  return router;
};
export const salesOrderEditorRoutes = (
  controller: SalesOrdersController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/:orderId",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: salesOrderParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.editor,
  );
  return router;
};
export const customerOrderReadsRoutes = (
  controller: SalesOrdersController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/:customerId/orders",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerParamsDtoSchema,
      query: customerOrdersQueryDtoSchema,
    }),
    controller.customerOrders,
  );
  router.get(
    "/:customerId/order-measurements",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerParamsDtoSchema,
      query: customerOrderMeasurementsQueryDtoSchema,
    }),
    controller.customerMeasurements,
  );
  return router;
};
