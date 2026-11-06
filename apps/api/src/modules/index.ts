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
