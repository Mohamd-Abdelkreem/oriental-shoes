import {
  WarehouseCommandExecutor,
  WarehouseService,
  WarehouseController,
  warehouseRoutes,
  warehouseCommandRoutes,
  QualityCommandExecutor,
  QualityService,
  QualityController,
  qualityRoutes,
  qualityCommandRoutes,
  ManufacturingService,
  ManufacturingController,
  ManufacturingCommandExecutor,
  manufacturingRoutes,
  manufacturingCommandRoutes,
  ApprovalService,
  ApprovalController,
  ApprovalCommandExecutor,
  approvalRoutes,
  salesContactRoutes,
  orderPaperRoutes,
  manufacturingOrderRoutes,
  approvalCommandRoutes,
  CatalogsController,
  CatalogsService,
  catalogsRoutes,
  SalesOrdersController,
  SalesOrdersService,
  salesOrdersRoutes,
  salesOrderEditorRoutes,
  customerOrderReadsRoutes,
  CustomersController,
  customersRoutes,
  CustomersService,
  SalesDraftsController,
  salesDraftsRoutes,
  SalesDraftsService,
  SalesCommandExecutor,
  SalesCommandsController,
  salesCommandsRoutes,
  SalesCommandsService,
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
import { orderConfig } from "./core/config/order.config.js";
import { Router } from "express";

import type { DatabaseClient } from "@template/database";

import { openApiRoutes } from "./infrastructure/openapi/openapi.routes.js";
import type { EmailService } from "./infrastructure/email/email.service.js";
import {
  createAuthenticationMiddleware,
  createIdentityAuthenticationMiddleware,
} from "./middlewares/auth.middleware.js";

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

  const salesExecutor = new SalesCommandExecutor(database);
  router.use(
    "/customers",
    customersRoutes(
      new CustomersController(new CustomersService(database, salesExecutor)),
      businessAuthenticationMiddleware,
    ),
  );
  router.use(
    "/sales-drafts",
    salesDraftsRoutes(
      new SalesDraftsController(
        new SalesDraftsService(database, salesExecutor),
      ),
      businessAuthenticationMiddleware,
    ),
  );
  router.use(
    "/sales-commands",
    salesCommandsRoutes(
      new SalesCommandsController(new SalesCommandsService(database)),
      businessAuthenticationMiddleware,
    ),
  );

  router.use(
    "/catalogs",
    catalogsRoutes(
      new CatalogsController(new CatalogsService(database)),
      businessAuthenticationMiddleware,
    ),
  );
  const warehouseController = new WarehouseController(
    new WarehouseService(database, new WarehouseCommandExecutor(database)),
  );
  router.use(
    "/warehouse",
    warehouseRoutes(warehouseController, businessAuthenticationMiddleware),
  );
  router.use(
    "/warehouse-commands",
    warehouseCommandRoutes(
      warehouseController,
      businessAuthenticationMiddleware,
    ),
  );
  const qualityController = new QualityController(
    new QualityService(database, new QualityCommandExecutor(database)),
  );
  router.use(
    "/quality",
    qualityRoutes(qualityController, businessAuthenticationMiddleware),
  );
  router.use(
    "/quality-commands",
    qualityCommandRoutes(qualityController, businessAuthenticationMiddleware),
  );
  const manufacturingController = new ManufacturingController(
    new ManufacturingService(
      database,
      new ManufacturingCommandExecutor(database),
    ),
  );
  router.use(
    "/manufacturing",
    manufacturingRoutes(
      manufacturingController,
      businessAuthenticationMiddleware,
    ),
  );
  router.use(
    "/manufacturing-commands",
    manufacturingCommandRoutes(
      manufacturingController,
      businessAuthenticationMiddleware,
    ),
  );
  const approvalController = new ApprovalController(
    new ApprovalService(
      database,
      new ApprovalCommandExecutor(database),
      orderConfig.businessTimeZone,
    ),
  );
  router.use(
    "/approvals",
    approvalRoutes(approvalController, businessAuthenticationMiddleware),
  );
  router.use(
    "/sales-contact",
    salesContactRoutes(approvalController, businessAuthenticationMiddleware),
  );
  router.use(
    "/order-paper",
    orderPaperRoutes(approvalController, businessAuthenticationMiddleware),
  );
  router.use(
    "/manufacturing-orders",
    manufacturingOrderRoutes(
      approvalController,
      businessAuthenticationMiddleware,
    ),
  );
  router.use(
    "/approval-commands",
    approvalCommandRoutes(approvalController, businessAuthenticationMiddleware),
  );
  const ordersController = new SalesOrdersController(
    new SalesOrdersService(
      database,
      salesExecutor,
      orderConfig.businessTimeZone,
    ),
  );
  router.use(
    "/sales-orders",
    salesOrdersRoutes(ordersController, businessAuthenticationMiddleware),
  );
  router.use(
    "/sales-order-editor",
    salesOrderEditorRoutes(ordersController, businessAuthenticationMiddleware),
  );
  router.use(
    "/customers",
    customerOrderReadsRoutes(
      ordersController,
      businessAuthenticationMiddleware,
    ),
  );
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
