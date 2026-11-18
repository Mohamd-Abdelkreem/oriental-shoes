import { z } from "zod";

import { departmentSchema, safeUserSchema } from "../account/account.schema.ts";
import { parseDraftSequence } from "../sales-drafts/draft-reference.ts";
import {
  isSafePaginationWindow,
  nonEmptyBoundedString,
  paginationMetaSchema,
  paginationQueryFields,
} from "../http/http.schema.ts";
import {
  salesInstantSchema,
  salesOrderTypeSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  draftSchema,
  draftSummarySchema,
  draftReplacementSchema,
} from "../sales-drafts/sales-drafts.schema.ts";
import { currentOrderCountsSchema } from "../sales-orders/order-facts.schema.ts";
import {
  salesBusinessNumberSchema,
  salesOrderStatusSchema,
  orderPieceStageSchema,
  orderWorkStateSchema,
} from "../sales-orders/sales-order-values.schema.ts";
import {
  salesOrderSchema,
  salesOrderSummarySchema,
  salesOrderTrackingDataSchema,
  salesOrderPieceSchema,
  nonAdministrationActivityItemSchemas,
} from "../sales-orders/sales-orders.schema.ts";
import {
  administrationCommandDataSchema,
  administrationCorrectionValuesSchema,
} from "./administration-command.schema.ts";
import { administrationActivityEventSchema } from "./administration-event.schema.ts";

const pagedOutputMatches = (page: {
  items: unknown[];
  pagination: z.infer<typeof paginationMetaSchema>;
  context: { query: { page: number; limit: number } };
}): boolean =>
  page.pagination.page === page.context.query.page &&
  page.pagination.limit === page.context.query.limit &&
  page.pagination.limit <= 100 &&
  page.items.length ===
    Math.min(
      page.pagination.limit,
      Math.max(
        0,
        page.pagination.total -
          (page.pagination.page - 1) * page.pagination.limit,
      ),
    );

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const dateSchema = draftReplacementSchema.shape.deliveryDate.unwrap();
const productionDepartmentSchema = departmentSchema.extract([
  "CUTTING",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
]);
const listStatusSchema = z.enum(["DRAFT", ...salesOrderStatusSchema.options]);
const periodSchema = z.enum(["TODAY", "MONTH", "YEAR", "ALL"]);
const searchSchema = z
  .string()
  .trim()
  .max(150)
  .refine((text) => !text.includes("\u0000"))
  .optional()
  .transform((text) => (text === "" ? undefined : text));
const filterFields = {
  search: searchSchema,
  status: listStatusSchema.optional(),
  type: salesOrderTypeSchema.optional(),
  department: productionDepartmentSchema.optional(),
  exception: z
    .enum(["OVERDUE", "PARTIALLY_CANCELLED", "READY", "DELIVERED"])
    .optional(),
  salespersonId: salesUuidSchema.optional(),
  period: periodSchema.default("ALL"),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
};
const validRange = (query: {
  from?: string | undefined;
  to?: string | undefined;
}): boolean =>
  query.from === undefined || query.to === undefined || query.from <= query.to;
export const administrationOrderFiltersSchema = z
  .object(filterFields)
  .strict()
  .refine(validRange, "Date range is reversed");
export const administrationOrdersQuerySchema = administrationOrderFiltersSchema
  .safeExtend(paginationQueryFields)
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationReportQuerySchema =
  administrationOrdersQuerySchema.safeExtend({
    period: periodSchema.default("MONTH"),
  });
export const administrationReportPrintQuerySchema =
  administrationOrderFiltersSchema;
export const administrationDashboardQuerySchema = z.object({}).strict();
export const administrationFilterOptionsQuerySchema = z
  .object({ salespersonName: searchSchema })
  .strict();
export const administrationApprovalsQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    tab: z.enum(["PENDING", "RETURNED", "APPROVED", "ALL"]).default("PENDING"),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationCorrectionsQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    tab: z.enum(["ACTIVE", "RESOLVED", "ALL"]).default("ACTIVE"),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationDeliveryExceptionsQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    tab: z.enum(["FAILED", "OVERDUE", "DISPATCHED", "ALL"]).default("FAILED"),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationActivityQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: searchSchema,
    orderId: salesUuidSchema.optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationOrderHistoryQuerySchema = z
  .object(paginationQueryFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const administrationOrderParamsSchema = z
  .object({ orderId: salesUuidSchema })
  .strict();
export const administrationCommandParamsSchema = z
  .object({ commandId: salesUuidSchema })
  .strict();
const currentDepartmentsSchema = z
  .array(productionDepartmentSchema)
  .max(4)
  .refine(
    (departments) =>
      departments.every(
        (department, index) =>
          index === 0 ||
          productionDepartmentSchema.options.indexOf(department) >
            productionDepartmentSchema.options.indexOf(
              departments[index - 1] ?? department,
            ),
      ),
    "Departments must be unique in operational order",
  );
const adminActionsSchema = z
  .object({
    canCancel: z.boolean(),
    canCorrect: z.boolean(),
    canPrint: z.boolean(),
  })
  .strict();
export const administrationOrderSummarySchema =
  salesOrderSummarySchema.safeExtend({
    currentDepartments: currentDepartmentsSchema,
    isOverdue: z.boolean(),
    hasQualityCorrectionHistory: z.boolean(),
    hasOpenQualityCorrection: z.boolean(),
    adminActions: adminActionsSchema,
  });
const listItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft"), draft: draftSummarySchema }).strict(),
  z
    .object({
      kind: z.literal("submitted"),
      order: administrationOrderSummarySchema,
    })
    .strict(),
]);
export const administrationOrdersDataSchema = z
  .object({
    items: z.array(listItemSchema).max(100),
    pagination: paginationMetaSchema,
    totalOrders: countSchema,
    totalPieces: countSchema,
    statusCounts: z.record(listStatusSchema, countSchema),
    context: z.object({ query: administrationOrdersQuerySchema }).strict(),
  })
  .strict()
  .refine(
    pagedOutputMatches,
    "Page rows, metadata and canonical context must agree",
  );
const actorSchema = administrationCommandDataSchema.shape.receipt.shape.actor;
const correctionChangedFieldsSchema = z
  .array(
    z.enum([
      "customerAddress",
      "customerEmail",
      "customerName",
      "customerPhone",
      "generalNotes",
    ]),
  )
  .min(1)
  .max(5)
  .refine(
    (fields) =>
      fields.every(
        (field, index) => index === 0 || field > (fields[index - 1] ?? ""),
      ),
    "Changed fields must be sorted and distinct",
  );
const candidateSchema = z
  .object({
    pieceId: salesUuidSchema,
    position: z.number().int().min(1).max(200),
    model: salesOrderPieceSchema.shape.model,
    stage: orderPieceStageSchema,
    workState: orderWorkStateSchema,
    receivedAt: salesInstantSchema.nullable(),
    eligible: z.boolean(),
    denialReason: z
      .enum(["CANCELLED", "OUT_FOR_DELIVERY", "DELIVERED", "INVALID_STATE"])
      .nullable(),
  })
  .strict()
  .refine(
    (candidate) =>
      candidate.eligible === (candidate.denialReason === null) &&
      (candidate.stage !== "CANCELLED" ||
        candidate.denialReason === "CANCELLED"),
    "Candidate eligibility requires an honest denial reason",
  );
export const administrationOrderDataSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("draft"),
      draft: draftSchema,
      historyCount: countSchema,
      adminActions: z
        .object({
          canCancel: z.literal(false),
          canCorrect: z.literal(false),
          canPrint: z.literal(false),
        })
        .strict(),
      context: z.object({ orderId: salesUuidSchema }).strict(),
    })
    .strict()
    .refine(
      (detail) => detail.draft.id === detail.context.orderId,
      "Draft must match detail context",
    ),
  z
    .object({
      kind: z.literal("submitted"),
      order: salesOrderSchema,
      historyCount: countSchema,
      tracking: salesOrderTrackingDataSchema,
      adminActions: adminActionsSchema,
      cancellationCandidates: z.array(candidateSchema).min(1).max(200),
      correction: z
        .object({
          originalSubmitted: administrationCorrectionValuesSchema,
          effective: administrationCorrectionValuesSchema,
          lastCorrection: z
            .object({
              id: salesUuidSchema,
              reason: nonEmptyBoundedString(4000),
              actor: actorSchema,
              occurredAt: salesInstantSchema,
              changedFields: correctionChangedFieldsSchema,
            })
            .strict()
            .nullable(),
        })
        .strict(),
      context: z.object({ orderId: salesUuidSchema }).strict(),
    })
    .strict()
    .refine(
      (detail) =>
        detail.order.id === detail.context.orderId &&
        detail.tracking.orderId === detail.order.id &&
        detail.tracking.orderVersion === detail.order.version &&
        detail.cancellationCandidates.length === detail.order.pieces.length &&
        detail.tracking.pieces.length === detail.order.pieces.length &&
        new Set(detail.tracking.pieces.map((piece) => piece.pieceId)).size ===
          detail.order.pieces.length &&
        detail.tracking.pieces.every((tracking) =>
          detail.order.pieces.some((piece) => piece.id === tracking.pieceId),
        ) &&
        detail.cancellationCandidates.every(
          (candidate, index) =>
            candidate.pieceId === detail.order.pieces[index]?.id &&
            candidate.position === detail.order.pieces[index].position &&
            candidate.stage === detail.order.pieces[index].stage &&
            candidate.workState === detail.order.pieces[index].workState &&
            candidate.receivedAt === detail.order.pieces[index].receivedAt,
        ) &&
        JSON.stringify(detail.tracking.counts) ===
          JSON.stringify(detail.order.counts),
      "Submitted detail must bind tracking and every retained candidate to its order",
    ),
]);
export const administrationDashboardDataSchema = z
  .object({
    generatedAt: salesInstantSchema,
    businessDate: dateSchema,
    counts: z
      .object({
        totalOrders: countSchema,
        activeOrders: countSchema,
        pendingApproval: countSchema,
        activeCorrections: countSchema,
        openCorrectionOrders: countSchema,
        deliveryExceptions: countSchema,
        pendingUsers: countSchema,
        readyOrders: countSchema,
        overdueOrders: countSchema,
        failedDeliveries: countSchema,
        activePieces: countSchema,
        pendingApprovalPieces: countSchema,
        overduePieces: countSchema,
        readyPieces: countSchema,
      })
      .strict(),
    departments: z
      .array(
        z
          .object({
            department: productionDepartmentSchema,
            pieces: countSchema,
          })
          .strict(),
      )
      .max(4),
    recentOrders: z.array(listItemSchema).max(5),
  })
  .strict();
export const administrationFilterOptionsDataSchema = z
  .object({
    context: z
      .object({ query: administrationFilterOptionsQuerySchema })
      .strict(),
    salespeople: z
      .array(
        z
          .object({
            id: salesUuidSchema,
            fullName: nonEmptyBoundedString(150),
            phone: safeUserSchema.shape.phone,
          })
          .strict(),
      )
      .max(5000),
    legacySalesperson: z
      .object({
        input: nonEmptyBoundedString(150),
        match: z.enum(["UNIQUE", "MISSING", "AMBIGUOUS"]),
        salespersonId: salesUuidSchema.nullable(),
      })
      .strict()
      .refine(
        (resolution) =>
          (resolution.match === "UNIQUE") ===
          (resolution.salespersonId !== null),
        "Legacy resolution requires exactly one identity",
      )
      .nullable(),
  })
  .strict()
  .refine(
    (options) =>
      new Set(options.salespeople.map((owner) => owner.id)).size ===
        options.salespeople.length &&
      new TextEncoder().encode(JSON.stringify(options)).byteLength <= 8_388_608,
    "Owner options must be complete, distinct and bounded",
  );
export const administrationApprovalsDataSchema = z
  .object({
    items: z.array(administrationOrderSummarySchema).max(100),
    pagination: paginationMetaSchema,
    counts: z
      .object({
        pending: countSchema,
        returned: countSchema,
        approved: countSchema,
        all: countSchema,
      })
      .strict(),
    context: z.object({ query: administrationApprovalsQuerySchema }).strict(),
  })
  .strict()
  .refine(
    pagedOutputMatches,
    "Page rows, metadata and canonical context must agree",
  );
const cycleSchema = z
  .object({
    id: salesUuidSchema,
    orderId: salesUuidSchema,
    businessNumber: salesBusinessNumberSchema,
    customerName: nonEmptyBoundedString(150),
    pieceId: salesUuidSchema,
    position: z.number().int().min(1).max(200),
    model: salesOrderPieceSchema.shape.model,
    target: z.enum(["CUTTING", "PRODUCTION"]),
    cycle: salesVersionSchema,
    state: z.enum(["OPEN", "ACCEPTED", "REJECTED", "CANCELLED"]),
    reason: nonEmptyBoundedString(4000),
    instructions: nonEmptyBoundedString(4000),
    rejectedAt: salesInstantSchema,
    resolvedAt: salesInstantSchema.nullable(),
  })
  .strict()
  .refine(
    (cycle) => (cycle.state === "OPEN") === (cycle.resolvedAt === null),
    "Cycle resolution must match current state",
  );
export const administrationCorrectionsDataSchema = z
  .object({
    items: z.array(cycleSchema).max(100),
    pagination: paginationMetaSchema,
    counts: z
      .object({
        active: countSchema,
        resolved: countSchema,
        all: countSchema,
        activePieces: countSchema,
      })
      .strict(),
    context: z.object({ query: administrationCorrectionsQuerySchema }).strict(),
  })
  .strict()
  .refine(
    pagedOutputMatches,
    "Page rows, metadata and canonical context must agree",
  );
export const administrationDeliveryExceptionsDataSchema = z
  .object({
    items: z.array(administrationOrderSummarySchema).max(100),
    pagination: paginationMetaSchema,
    counts: z
      .object({
        failed: countSchema,
        overdue: countSchema,
        dispatched: countSchema,
        all: countSchema,
      })
      .strict(),
    context: z
      .object({ query: administrationDeliveryExceptionsQuerySchema })
      .strict(),
  })
  .strict()
  .refine(
    pagedOutputMatches,
    "Page rows, metadata and canonical context must agree",
  );
export const administrationActivityItemSchema = z.discriminatedUnion("kind", [
  ...nonAdministrationActivityItemSchemas,
  z
    .object({
      kind: z.literal("administration"),
      event: administrationActivityEventSchema,
    })
    .strict(),
]);
export const administrationActivityDataSchema = z
  .object({
    events: z.array(administrationActivityItemSchema).max(100),
    pagination: paginationMetaSchema,
    context: z.union([
      z.object({ query: administrationActivityQuerySchema }).strict(),
      z
        .object({
          orderId: salesUuidSchema,
          query: administrationOrderHistoryQuerySchema,
        })
        .strict(),
    ]),
  })
  .strict()
  .refine((page) => {
    const orderId =
      "orderId" in page.context
        ? page.context.orderId
        : page.context.query.orderId;
    return (
      page.events.length <= page.pagination.limit &&
      page.pagination.limit <= 100 &&
      new Set(
        page.events.map(
          (entry) =>
            entry.kind +
            "/" +
            (entry.kind === "draft" ? entry.change.commandId : entry.event.id),
        ),
      ).size === page.events.length &&
      (orderId === undefined ||
        page.events.every(
          (entry) =>
            (entry.kind === "draft"
              ? entry.change.draftId
              : entry.event.orderId) === orderId,
        ))
    );
  }, "Activity must contain distinct bound history events");

const reportRowSchema = z
  .object({
    kind: z.enum(["draft", "submitted"]),
    orderId: salesUuidSchema,
    businessNumber: salesBusinessNumberSchema.nullable(),
    displayReference: nonEmptyBoundedString(64),
    type: salesOrderTypeSchema,
    status: listStatusSchema,
    createdAt: salesInstantSchema,
    deliveryDate: dateSchema.nullable(),
    customer: z
      .object({
        name: nonEmptyBoundedString(150).nullable(),
        phone: z.string().max(64).nullable(),
        address: z.string().max(2000).nullable(),
      })
      .strict(),
    salesperson: z
      .object({ id: salesUuidSchema, fullName: nonEmptyBoundedString(150) })
      .strict(),
    counts: currentOrderCountsSchema,
    currentDepartments: currentDepartmentsSchema,
    isOverdue: z.boolean(),
    hasQualityCorrectionHistory: z.boolean(),
    isCurrentlyReturned: z.boolean(),
  })
  .strict()
  .refine(
    (row) =>
      row.kind === "draft"
        ? row.status === "DRAFT" &&
          row.businessNumber === null &&
          (row.displayReference === row.orderId ||
            parseDraftSequence(row.displayReference) !== null) &&
          row.counts.original === 0 &&
          row.currentDepartments.length === 0
        : row.status !== "DRAFT" &&
          row.businessNumber !== null &&
          row.displayReference === row.businessNumber &&
          row.businessNumber.startsWith(row.type + "-"),
    "Report kind, reference and physical facts must agree",
  );
const metaFields = {
  generatedAt: salesInstantSchema,
  businessDate: dateSchema,
  businessTimeZone: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return zone.trim() !== "";
      } catch (error) {
        if (error instanceof RangeError) return false;
        throw error;
      }
    }, "A configured IANA calendar is required"),
  generatedBy: z
    .object({ id: salesUuidSchema, fullName: nonEmptyBoundedString(150) })
    .strict(),
  filters: administrationOrderFiltersSchema,
  effectiveFrom: dateSchema.nullable(),
  effectiveTo: dateSchema.nullable(),
  cohort: z
    .object({
      kind: z.enum(["MIXED", "SUBMITTED", "DRAFT"]),
      orderCount: countSchema,
    })
    .strict(),
  complete: z.boolean(),
};
const metaSchema = z
  .object(metaFields)
  .strict()
  .refine(
    (meta) =>
      validRange({
        from: meta.effectiveFrom ?? undefined,
        to: meta.effectiveTo ?? undefined,
      }),
    "Effective report range is reversed",
  );
const kpisSchema = z
  .object({
    orders: countSchema,
    originalPieces: countSchema,
    cancelledPieces: countSchema,
    activePieces: countSchema,
    receivedPieces: countSchema,
    completionPercent: z.number().int().min(0).max(100),
    readyOrders: countSchema,
    deliveredOrders: countSchema,
    overdueOrders: countSchema,
  })
  .strict()
  .refine(
    (kpis) =>
      kpis.originalPieces === kpis.cancelledPieces + kpis.activePieces &&
      kpis.receivedPieces <= kpis.activePieces &&
      kpis.completionPercent ===
        (kpis.activePieces === 0
          ? 0
          : kpis.receivedPieces === kpis.activePieces
            ? 100
            : Math.min(
                99,
                Math.round((kpis.receivedPieces / kpis.activePieces) * 100),
              )),
    "Aggregate piece arithmetic must agree",
  );
const reportDepartmentSchema = z.enum([
  ...productionDepartmentSchema.options,
  "AWAITING_APPROVAL",
  "WITH_COURIER",
  "DELIVERED",
]);
const commonReportFields = {
  meta: metaSchema,
  kpis: kpisSchema,
  departments: z
    .array(
      z
        .object({ department: reportDepartmentSchema, pieces: countSchema })
        .strict(),
    )
    .max(7),
  exceptions: z
    .object({
      categoryCases: countSchema,
      distinctOrders: countSchema,
      overdueOrders: countSchema,
      failedOrders: countSchema,
      correctionHistoryOrders: countSchema,
      returnedOrders: countSchema,
    })
    .strict(),
  workforce: z
    .object({
      scope: z
        .object({
          kind: z.literal("CURRENT_DIRECTORY"),
          department: departmentSchema.nullable(),
        })
        .strict(),
      activeStaff: countSchema,
      totalStaff: countSchema,
      items: z
        .array(
          z
            .object({
              id: safeUserSchema.shape.id,
              fullName: safeUserSchema.shape.fullName,
              phone: safeUserSchema.shape.phone,
              role: safeUserSchema.shape.role,
              department: safeUserSchema.shape.department,
              status: safeUserSchema.shape.status,
            })
            .strict(),
        )
        .max(5000),
    })
    .strict()
    .refine(
      (roster) =>
        roster.items.length === roster.totalStaff &&
        roster.activeStaff <= roster.totalStaff &&
        new Set(roster.items.map((staff) => staff.id)).size ===
          roster.items.length &&
        (roster.scope.department === null ||
          roster.items.every(
            (staff) => staff.department === roster.scope.department,
          )),
      "Current workforce must match its directory scope",
    ),
  endorsements: z
    .object({
      mode: z.literal("MANUAL"),
      signatories: z.array(z.never()).max(0),
    })
    .strict(),
};
const boundedReport = (report: unknown): boolean =>
  new TextEncoder().encode(JSON.stringify(report)).byteLength <= 8_388_608;
export const administrationReportDataSchema = z
  .object({
    ...commonReportFields,
    orders: z
      .object({
        items: z.array(reportRowSchema).max(100),
        pagination: paginationMetaSchema,
      })
      .strict(),
  })
  .strict()
  .refine(boundedReport, "Report exceeds the serialized output limit")
  .refine(
    (report) =>
      report.orders.pagination.total === report.meta.cohort.orderCount &&
      report.kpis.orders === report.meta.cohort.orderCount,
    "Report order totals must use the same cohort",
  );
export const administrationReportPrintDataSchema = z
  .object({
    ...commonReportFields,
    meta: metaSchema.safeExtend({ complete: z.literal(true) }),
    orders: z
      .object({ items: z.array(reportRowSchema).max(5000), total: countSchema })
      .strict(),
    exceptionRows: z
      .array(
        z
          .object({
            orderId: salesUuidSchema,
            businessNumber: salesBusinessNumberSchema.nullable(),
            customerName: nonEmptyBoundedString(150).nullable(),
            category: z.enum([
              "OVERDUE",
              "DELIVERY_FAILED",
              "QUALITY_CORRECTION_HISTORY",
              "RETURNED_FOR_CORRECTION",
            ]),
            currentDepartments: currentDepartmentsSchema,
            deliveryDate: dateSchema.nullable(),
          })
          .strict(),
      )
      .max(20000),
  })
  .strict()
  .refine(boundedReport, "Report exceeds the serialized output limit")
  .refine((report) => {
    const orderIds = new Set(report.orders.items.map((row) => row.orderId));
    return (
      report.orders.total === report.orders.items.length &&
      report.orders.total === report.meta.cohort.orderCount &&
      report.kpis.orders === report.orders.total &&
      orderIds.size === report.orders.items.length &&
      report.exceptionRows.length === report.exceptions.categoryCases &&
      new Set(
        report.exceptionRows.map((row) => row.orderId + "/" + row.category),
      ).size === report.exceptionRows.length &&
      report.exceptionRows.every((row) => orderIds.has(row.orderId))
    );
  }, "Complete report must retain every distinct order and matching exception case");

export type AdministrationOrderFilters = z.infer<
  typeof administrationOrderFiltersSchema
>;
export type AdministrationOrdersQuery = z.infer<
  typeof administrationOrdersQuerySchema
>;
export type AdministrationOrdersQueryInput = z.input<
  typeof administrationOrdersQuerySchema
>;
export type AdministrationReportQuery = z.infer<
  typeof administrationReportQuerySchema
>;
export type AdministrationReportQueryInput = z.input<
  typeof administrationReportQuerySchema
>;
export type AdministrationReportPrintQuery = z.infer<
  typeof administrationReportPrintQuerySchema
>;
export type AdministrationDashboardQuery = z.infer<
  typeof administrationDashboardQuerySchema
>;
export type AdministrationFilterOptionsQuery = z.infer<
  typeof administrationFilterOptionsQuerySchema
>;
export type AdministrationApprovalsQuery = z.infer<
  typeof administrationApprovalsQuerySchema
>;
export type AdministrationCorrectionsQuery = z.infer<
  typeof administrationCorrectionsQuerySchema
>;
export type AdministrationDeliveryExceptionsQuery = z.infer<
  typeof administrationDeliveryExceptionsQuerySchema
>;
export type AdministrationActivityQuery = z.infer<
  typeof administrationActivityQuerySchema
>;
export type AdministrationOrderHistoryQuery = z.infer<
  typeof administrationOrderHistoryQuerySchema
>;
export type AdministrationOrderParams = z.infer<
  typeof administrationOrderParamsSchema
>;
export type AdministrationCommandParams = z.infer<
  typeof administrationCommandParamsSchema
>;
export type AdministrationOrderSummary = z.infer<
  typeof administrationOrderSummarySchema
>;
export type AdministrationOrdersData = z.infer<
  typeof administrationOrdersDataSchema
>;
export type AdministrationOrderData = z.infer<
  typeof administrationOrderDataSchema
>;
export type AdministrationDashboardData = z.infer<
  typeof administrationDashboardDataSchema
>;
export type AdministrationFilterOptionsData = z.infer<
  typeof administrationFilterOptionsDataSchema
>;
export type AdministrationApprovalsData = z.infer<
  typeof administrationApprovalsDataSchema
>;
export type AdministrationCorrectionsData = z.infer<
  typeof administrationCorrectionsDataSchema
>;
export type AdministrationDeliveryExceptionsData = z.infer<
  typeof administrationDeliveryExceptionsDataSchema
>;
export type AdministrationActivityItem = z.infer<
  typeof administrationActivityItemSchema
>;
export type AdministrationActivityData = z.infer<
  typeof administrationActivityDataSchema
>;
export type AdministrationReportData = z.infer<
  typeof administrationReportDataSchema
>;
export type AdministrationReportPrintData = z.infer<
  typeof administrationReportPrintDataSchema
>;
