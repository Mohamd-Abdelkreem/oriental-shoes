export { AuthController, authRoutes, AuthService } from "./auth/index.js";
export {
  HealthController,
  healthRoutes,
  HealthService,
  type HealthResult,
} from "./health/index.js";
export { StaffController, staffRoutes, StaffService } from "./staff/index.js";
export { UsersController, usersRoutes, UsersService } from "./users/index.js";

export {
  CustomersController,
  customersRoutes,
  CustomersService,
} from "./customers/index.js";
export {
  SalesDraftsController,
  salesDraftsRoutes,
  SalesDraftsService,
} from "./sales-drafts/index.js";
export {
  SalesCommandExecutor,
  SalesCommandsController,
  salesCommandsRoutes,
  SalesCommandsService,
} from "./sales-commands/index.js";

export {
  CatalogsService,
  CatalogsController,
  catalogsRoutes,
} from "./catalogs/index.js";
export {
  SalesOrdersService,
  SalesOrdersController,
  salesOrdersRoutes,
  salesOrderEditorRoutes,
  customerOrderReadsRoutes,
} from "./sales-orders/index.js";

export {
  ApprovalService,
  ApprovalController,
  ApprovalCommandExecutor,
  approvalRoutes,
  salesContactRoutes,
  orderPaperRoutes,
  manufacturingOrderRoutes,
  approvalCommandRoutes,
} from "./approval/index.js";

export {
  ManufacturingService,
  ManufacturingController,
  ManufacturingCommandExecutor,
  manufacturingRoutes,
  manufacturingCommandRoutes,
} from "./manufacturing/index.js";

export {
  QualityCommandExecutor,
  QualityService,
  QualityController,
  qualityRoutes,
  qualityCommandRoutes,
} from "./quality/index.js";

export {
  WarehouseCommandExecutor,
  WarehouseService,
  WarehouseController,
  warehouseRoutes,
  warehouseCommandRoutes,
} from "./warehouse/index.js";
