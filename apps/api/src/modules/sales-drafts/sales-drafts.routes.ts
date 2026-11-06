import { Router, type RequestHandler } from "express";
import { Department } from "@template/database";
import { salesEmptyQuerySchema } from "@template/contracts";
import {
  authorizeDepartments,
  csrfMiddleware,
  validationMiddleware,
} from "../../middlewares/index.js";
import type { SalesDraftsController } from "./sales-drafts.controller.js";
import { createDraftBodyDtoSchema } from "./dto/create-draft.dto.js";
import { saveDraftBodyDtoSchema } from "./dto/save-draft.dto.js";
import { draftParamsDtoSchema } from "./dto/draft-params.dto.js";
import { draftListQueryDtoSchema } from "./dto/draft-list.dto.js";
import { draftChangesQueryDtoSchema } from "./dto/draft-changes.dto.js";

export const salesDraftsRoutes = (
  controller: SalesDraftsController,
  businessAuthenticationMiddleware: RequestHandler,
): Router => {
  const router = Router(),
    sales = authorizeDepartments(Department.SALES);
  router.get(
    "/",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: draftListQueryDtoSchema }),
    controller.list,
  );
  router.get(
    "/changes",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({ query: draftChangesQueryDtoSchema }),
    controller.activity,
  );
  router.get(
    "/:draftId",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: draftParamsDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.get,
  );
  router.get(
    "/:draftId/changes",
    businessAuthenticationMiddleware,
    sales,
    validationMiddleware({
      params: draftParamsDtoSchema,
      query: draftChangesQueryDtoSchema,
    }),
    controller.changes,
  );
  router.post(
    "/",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      body: createDraftBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.create,
  );
  router.put(
    "/:draftId",
    businessAuthenticationMiddleware,
    sales,
    csrfMiddleware,
    validationMiddleware({
      params: draftParamsDtoSchema,
      body: saveDraftBodyDtoSchema,
      query: salesEmptyQuerySchema,
    }),
    controller.save,
  );
  return router;
};
