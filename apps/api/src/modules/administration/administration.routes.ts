import { Router, type RequestHandler } from "express";
import { UserRole } from "@template/database";
import {
  authorizeRoles,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { AdministrationController } from "./administration.controller.js";
import * as readDto from "./dto/administration-read.dto.js";
import { administrationCommandBodyDtoSchema } from "./dto/administration-command.dto.js";

export const administrationRoutes = (
  controller: AdministrationController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/dashboard",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationDashboardQueryDtoSchema,
    }),
    controller.dashboard,
  );
  router.get(
    "/filter-options",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationFilterOptionsQueryDtoSchema,
    }),
    controller.filterOptions,
  );
  router.get(
    "/orders",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({ query: readDto.administrationOrdersQueryDtoSchema }),
    controller.listOrders,
  );
  router.get(
    "/approvals",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationApprovalsQueryDtoSchema,
    }),
    controller.approvals,
  );
  router.get(
    "/corrections",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationCorrectionsQueryDtoSchema,
    }),
    controller.corrections,
  );
  router.get(
    "/delivery-exceptions",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationDeliveryExceptionsQueryDtoSchema,
    }),
    controller.deliveryExceptions,
  );
  router.get(
    "/activity",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationActivityQueryDtoSchema,
    }),
    controller.activity,
  );
  router.get(
    "/reports",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({ query: readDto.administrationReportQueryDtoSchema }),
    controller.report,
  );
  router.get(
    "/reports/print",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      query: readDto.administrationReportPrintQueryDtoSchema,
    }),
    controller.printReport,
  );
  router.get(
    "/orders/:orderId",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      params: readDto.administrationOrderParamsDtoSchema,
      query: readDto.salesEmptyQueryDtoSchema,
    }),
    controller.getOrder,
  );
  router.get(
    "/orders/:orderId/history",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      params: readDto.administrationOrderParamsDtoSchema,
      query: readDto.administrationOrderHistoryQueryDtoSchema,
    }),
    controller.orderHistory,
  );
  router.post(
    "/commands",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    csrfMiddleware,
    validationMiddleware({
      query: readDto.salesEmptyQueryDtoSchema,
      body: administrationCommandBodyDtoSchema,
    }),
    controller.execute,
  );
  return router;
};
export const administrationCommandRoutes = (
  controller: AdministrationController,
  authentication: RequestHandler,
): Router => {
  const router = Router();
  router.get(
    "/:commandId",
    authentication,
    authorizeRoles(UserRole.ADMIN),
    validationMiddleware({
      params: readDto.administrationCommandParamsDtoSchema,
      query: readDto.salesEmptyQueryDtoSchema,
    }),
    controller.observe,
  );
  return router;
};
