import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import { salesEmptyQuerySchema } from "@template/contracts";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { CatalogsController } from "./catalogs.controller.js";
import { catalogQuoteBodyDtoSchema } from "./dto/catalog-quote.dto.js";

export const catalogsRoutes = (
  controller: CatalogsController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: salesEmptyQuerySchema }),
    controller.get,
  );
  router.post(
    "/quotes",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      body: catalogQuoteBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.quote,
  );
  return router;
};
