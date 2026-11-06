import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import { salesEmptyQuerySchema } from "@template/contracts";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import { customerDraftsQueryDtoSchema } from "./dto/customer-drafts.dto.js";
import type { CustomersController } from "./customers.controller.js";
import { createCustomerBodyDtoSchema } from "./dto/create-customer.dto.js";
import { updateCustomerBodyDtoSchema } from "./dto/update-customer.dto.js";
import { customerParamsDtoSchema } from "./dto/customer-params.dto.js";
import { customerPhoneParamsDtoSchema } from "./dto/customer-phone.dto.js";
import { customerListQueryDtoSchema } from "./dto/customer-list.dto.js";
import { customerMeasurementsQueryDtoSchema } from "./dto/customer-measurements.dto.js";

export const customersRoutes = (
  controller: CustomersController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: customerListQueryDtoSchema }),
    controller.list,
  );
  router.get(
    "/by-phone/:phone",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerPhoneParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.getByPhone,
  );
  router.get(
    "/:customerId",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.get,
  );
  router.get(
    "/:customerId/measurements",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerParamsDtoSchema,
      query: customerMeasurementsQueryDtoSchema,
    }),
    controller.measurements,
  );
  router.get(
    "/:customerId/drafts",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: customerParamsDtoSchema,
      query: customerDraftsQueryDtoSchema,
    }),
    controller.drafts,
  );
  router.post(
    "/",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      body: createCustomerBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.create,
  );
  router.patch(
    "/:customerId",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      params: customerParamsDtoSchema,
      body: updateCustomerBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.update,
  );
  return router;
};
