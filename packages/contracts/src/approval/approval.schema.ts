import { z } from "zod";
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
  MAX_DRAFT_PIECES,
  piecePaperCodesSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import {
  factoryOrderSchema,
  retainedOrderCountsSchema,
  salesOrderActivityDataSchema,
  salesOrderActivityQuerySchema,
  salesOrderPieceSchema,
  salesOrderSchema,
  salesOrderSummarySchema,
} from "../sales-orders/sales-orders.schema.ts";
import {
  orderPieceStageSchema,
  orderWorkStateSchema,
  salesOrderStatusSchema,
} from "../sales-orders/sales-order-values.schema.ts";
import {
  approvalActorSchema,
  approvalIssueStateSchema,
  approvalTargetSchema,
  isApprovalOperationActor,
} from "./approval-command.schema.ts";
import { draftPieceSchema } from "../sales-drafts/sales-drafts.schema.ts";
import { approvalActivityEventSchema } from "./approval-event.schema.ts";

const requiredText = nonEmptyBoundedString(4000);
const optionalNotes = z
  .string()
  .max(4000)
  .refine((text) => !text.includes("\u0000"))
  .nullish()
  .transform((text) =>
    text === undefined || text === null || text.trim().length === 0
      ? null
      : text,
  );
const commandFields = {
  commandId: salesUuidSchema,
  expectedVersion: salesVersionSchema,
};
export const approveInitialBodySchema = z.object(commandFields).strict();
export const returnInitialBodySchema = z
  .object({ ...commandFields, reason: requiredText, notes: optionalNotes })
  .strict();
export const reportIssueBodySchema = z
  .object({ ...commandFields, reason: requiredText, notes: optionalNotes })
  .strict();
export const resolveIssueBodySchema = z.discriminatedUnion("decision", [
  z
    .object({
      ...commandFields,
      decision: z.literal("RETURN_TO_DEPARTMENT"),
      target: approvalTargetSchema,
      notes: requiredText,
    })
    .strict(),
  z
    .object({
      ...commandFields,
      decision: z.literal("SEND_TO_SALES"),
      target: approvalTargetSchema,
      notes: requiredText,
    })
    .strict(),
  z
    .object({
      ...commandFields,
      decision: z.literal("CANCEL"),
      reason: requiredText,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export const contactCoreFields = [
  "model",
  "size",
  "leatherBase",
  "sole",
] as const;
export const contactExtraCatalogFields = [
  "decoration",
  "decorationColor",
  "soleAddition",
  "soleColor",
  "aField",
  "fField",
] as const;
export const contactCatalogFields = [
  ...contactCoreFields,
  ...contactExtraCatalogFields,
] as const;
const contactTextSchema = draftPieceSchema.pick({
  faceRight: true,
  faceLeft: true,
  mixing: true,
  face: true,
  additions: true,
  sideNotes: true,
});
export const contactTextFields = contactTextSchema.keyof().options;
const optionalSelection = salesUuidSchema.nullable();
const extraSelectionsSchema = z.strictObject({
  decoration: optionalSelection,
  decorationColor: optionalSelection,
  soleAddition: optionalSelection,
  soleColor: optionalSelection,
  aField: optionalSelection,
  fField: optionalSelection,
});
export const contactSpecificationsSchema = contactTextSchema.extend({
  decoration: nonEmptyBoundedString(200),
  decorationColor: draftPieceSchema.shape.decorationColor,
  soleAddition: draftPieceSchema.shape.soleAddition,
  soleColor: draftPieceSchema.shape.soleColor,
  aField: draftPieceSchema.shape.aField,
  fField: draftPieceSchema.shape.fField,
  paperCodes: piecePaperCodesSchema,
  catalogSelections: extraSelectionsSchema,
});
export const contactChangesSchema = extraSelectionsSchema
  .extend({
    ...contactTextSchema.shape,
    model: salesUuidSchema,
    size: salesUuidSchema,
    leatherBase: salesUuidSchema,
    decoration: salesUuidSchema,
    sole: optionalSelection,
    paperCodes: piecePaperCodesSchema,
  })
  .partial();
export type ContactSpecifications = z.infer<typeof contactSpecificationsSchema>;
export const submitContactBodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...commandFields,
      kind: z.literal("AMEND"),
      contactNotes: requiredText,
      changes: contactChangesSchema,
    })
    .strict(),
  z
    .object({
      ...commandFields,
      kind: z.literal("CANCEL_REQUEST"),
      contactNotes: requiredText,
    })
    .strict(),
]);
export const reviewContactBodySchema = z.discriminatedUnion("decision", [
  z
    .object({
      ...commandFields,
      proposalId: salesUuidSchema,
      decision: z.literal("ACCEPT"),
      notes: requiredText,
    })
    .strict(),
  z
    .object({
      ...commandFields,
      proposalId: salesUuidSchema,
      decision: z.literal("RETURN_TO_SALES"),
      reason: requiredText,
    })
    .strict(),
  z
    .object({
      ...commandFields,
      proposalId: salesUuidSchema,
      decision: z.literal("CANCEL"),
      reason: requiredText,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export const approvalPieceParamsSchema = z
  .object({ orderId: salesUuidSchema, pieceId: salesUuidSchema })
  .strict();
export const approvalIssueParamsSchema = approvalPieceParamsSchema.extend({
  issueId: salesUuidSchema,
});
export const approvalEventParamsSchema = z
  .object({ orderId: salesUuidSchema, eventId: salesUuidSchema })
  .strict();

const capturedLabel = nonEmptyBoundedString(200);
export const contactValuesSchema = z
  .object({
    model: capturedLabel,
    size: capturedLabel,
    leatherBase: capturedLabel,
    sole: capturedLabel.nullable(),
    specifications: contactSpecificationsSchema.optional(),
    catalogSelections: z
      .object({
        model: salesUuidSchema.nullable(),
        size: salesUuidSchema.nullable(),
        leatherBase: salesUuidSchema.nullable(),
        sole: salesUuidSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (values) => values.sole !== null || values.catalogSelections.sole === null,
    "A cleared floor cannot retain a catalog reference",
  );
export const approvalDecisionStampSchema = z
  .object({
    decisionId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    actor: approvalActorSchema,
    approvedAt: salesInstantSchema,
  })
  .strict()
  .refine(
    (stamp) => isApprovalOperationActor("APPROVE_INITIAL", stamp.actor),
    "Approval stamp requires a decision actor",
  );
export const pieceContactProposalSchema = z
  .object({
    id: salesUuidSchema,
    kind: z.enum(["AMEND", "CANCEL_REQUEST"]),
    contactNotes: requiredText,
    before: contactValuesSchema,
    proposed: contactValuesSchema.nullable(),
    submittedBy: approvalActorSchema,
    submittedAt: salesInstantSchema,
  })
  .strict()
  .refine(
    (proposal) =>
      (proposal.kind === "AMEND") === (proposal.proposed !== null) &&
      isApprovalOperationActor("SUBMIT_CONTACT", proposal.submittedBy),
    "Proposal values and submitting actor must match its kind",
  );
export const approvalInstructionSchema = z
  .object({
    commandId: salesUuidSchema,
    actor: approvalActorSchema,
    occurredAt: salesInstantSchema,
    text: requiredText,
  })
  .strict()
  .refine(
    (instruction) =>
      isApprovalOperationActor("RESOLVE_ISSUE", instruction.actor),
    "Instructions require an approval actor",
  );
const issueActions = z
  .object({
    canResolve: z.boolean(),
    canSubmitContact: z.boolean(),
    canReviewContact: z.boolean(),
  })
  .strict();
const factoryDepartment = z.enum(["CUTTING", "PRODUCTION", "QUALITY"]);
const sourceWorkState = z.enum(["INCOMING", "IN_PROGRESS"]);
const issueSummaryFields = {
  id: salesUuidSchema,
  pieceId: salesUuidSchema,
  state: approvalIssueStateSchema,
  reportedAt: salesInstantSchema,
  reason: requiredText,
  notes: requiredText.nullable(),
  resumeTarget: approvalTargetSchema.nullable(),
  instructions: approvalInstructionSchema.nullable(),
  allowedActions: issueActions,
};
const actionStateMatches = (issue: {
  state: z.infer<typeof approvalIssueStateSchema>;
  allowedActions: z.infer<typeof issueActions>;
}) =>
  (!issue.allowedActions.canResolve || issue.state === "APPROVAL_REVIEW") &&
  (!issue.allowedActions.canSubmitContact || issue.state === "SALES_CONTACT") &&
  (!issue.allowedActions.canReviewContact || issue.state === "REAPPROVAL");
const issueReviewFieldsMatch = (
  state: z.infer<typeof approvalIssueStateSchema>,
  target: z.infer<typeof approvalTargetSchema> | null,
  hasProposal: boolean,
): boolean => {
  switch (state) {
    case "APPROVAL_REVIEW":
      return target === null && !hasProposal;
    case "SALES_CONTACT":
      return target !== null;
    case "REAPPROVAL":
      return target !== null && hasProposal;
    case "RESOLVED":
      return true;
  }
};
export const manufacturingIssueSummarySchema = z
  .object({
    ...issueSummaryFields,
    sourceDepartment: factoryDepartment,
    currentProposalId: salesUuidSchema.nullable(),
  })
  .strict()
  .refine(actionStateMatches, "Issue actions must match current state")
  .refine(
    (issue) =>
      issueReviewFieldsMatch(
        issue.state,
        issue.resumeTarget,
        issue.currentProposalId !== null,
      ),
    "Issue target and proposal must match its state",
  );
export const manufacturingIssueSchema = z
  .object({
    ...issueSummaryFields,
    orderId: salesUuidSchema,
    source: z
      .object({
        department: factoryDepartment,
        stage: factoryDepartment,
        workState: sourceWorkState,
      })
      .strict(),
    reporter: approvalActorSchema,
    currentProposal: pieceContactProposalSchema.nullable(),
  })
  .strict()
  .refine(actionStateMatches, "Issue actions must match current state")
  .refine(
    (issue) =>
      issue.source.department === issue.source.stage &&
      (issue.reporter.role === "ADMIN" ||
        issue.reporter.department === issue.source.department),
    "Issue source and reporter must agree",
  )
  .refine(
    (issue) =>
      issueReviewFieldsMatch(
        issue.state,
        issue.resumeTarget,
        issue.currentProposal !== null,
      ),
    "Issue target and proposal must match its state",
  );
const currentReturnSchema = z
  .object({
    decisionId: salesUuidSchema,
    reason: requiredText,
    notes: requiredText.nullable(),
    returnedAt: salesInstantSchema,
  })
  .strict();
export const approvalWorkflowSchema = z
  .object({
    initialApproval: approvalDecisionStampSchema.nullable(),
    currentReturn: currentReturnSchema.nullable(),
    allowedActions: z
      .object({ canApproveInitial: z.boolean(), canReturnInitial: z.boolean() })
      .strict(),
    printEligibility: z
      .object({
        allowed: z.boolean(),
        reason: z
          .enum(["NOT_APPROVED", "RETURNED", "PENDING_REAPPROVAL"])
          .nullable(),
      })
      .strict()
      .refine(
        (eligibility) => eligibility.allowed === (eligibility.reason === null),
        "Print denial must explain ineligibility",
      ),
    issues: z.array(manufacturingIssueSchema).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    (workflow) =>
      new Set(workflow.issues.map((issue) => issue.pieceId)).size ===
        workflow.issues.length &&
      workflow.issues.every((issue) => issue.state !== "RESOLVED"),
    "Current issues must have unique pieces and remain unresolved",
  );
export const approvalOrderDataSchema = z
  .object({ order: salesOrderSchema, workflow: approvalWorkflowSchema })
  .strict()
  .superRefine(({ order, workflow }, context) => {
    const reject = (message: string) => {
      context.addIssue({ code: "custom", path: ["workflow"], message });
    };
    if (
      workflow.issues.some(
        (issue) =>
          issue.orderId !== order.id ||
          !order.pieces.some((piece) => piece.id === issue.pieceId),
      )
    )
      reject("Issue must belong to the selected order and piece");
    if (
      (order.status === "RETURNED") !== (workflow.currentReturn !== null) ||
      (workflow.currentReturn !== null &&
        (workflow.currentReturn.decisionId !==
          order.approval.returnDecisionId ||
          workflow.currentReturn.reason !== order.approval.returnReason ||
          workflow.currentReturn.returnedAt !== order.approval.returnedAt))
    )
      reject("Return context must match current proof");
    if (
      workflow.initialApproval !== null &&
      (workflow.initialApproval.approvedAt !== order.approval.approvedAt ||
        workflow.initialApproval.orderVersion > order.version)
    )
      reject("Initial approval must match its order");
    const pending = workflow.issues.some(
      (issue) =>
        (issue.state === "SALES_CONTACT" || issue.state === "REAPPROVAL") &&
        issue.currentProposal !== null,
    );
    const reason =
      order.status === "RETURNED"
        ? "RETURNED"
        : workflow.initialApproval === null ||
            order.status === "AWAITING_APPROVAL"
          ? "NOT_APPROVED"
          : pending
            ? "PENDING_REAPPROVAL"
            : null;
    if (workflow.printEligibility.reason !== reason)
      reject(
        "Print eligibility must match current approval and all held reviews",
      );
    const canDecide =
      order.status === "AWAITING_APPROVAL" && workflow.initialApproval === null;
    if (
      (workflow.allowedActions.canApproveInitial ||
        workflow.allowedActions.canReturnInitial) &&
      !canDecide
    )
      reject("Initial actions require an unapproved pending revision");
  });

const searchSchema = z
  .string()
  .trim()
  .max(150)
  .refine((search) => !search.includes("\u0000"))
  .optional()
  .transform((search) => (search === "" ? undefined : search));
const listFields = {
  ...paginationQueryFields,
  search: searchSchema,
  type: salesOrderTypeSchema.optional(),
};
export const approvalOrdersQuerySchema = z
  .object(listFields)
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const approvalIssuesQuerySchema = z
  .object({
    ...listFields,
    state: z
      .enum(["APPROVAL_REVIEW", "SALES_CONTACT", "REAPPROVAL"])
      .optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const salesContactQuerySchema = z
  .object({
    ...listFields,
    state: z.enum(["SALES_CONTACT", "REAPPROVAL"]).optional(),
  })
  .strict()
  .refine(isSafePaginationWindow, "Unsafe pagination window");
export const approvalHistoryQuerySchema = salesOrderActivityQuerySchema;
export const approvalOrderHistoryQuerySchema = salesOrderActivityQuerySchema;
export const approvalOrdersDataSchema = z
  .object({
    items: z.array(salesOrderSummarySchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
const issueQueueItemSchema = z
  .object({
    order: salesOrderSummarySchema,
    piece: salesOrderPieceSchema.pick({
      id: true,
      position: true,
      model: true,
      size: true,
      leatherBase: true,
      sole: true,
      stage: true,
      workState: true,
    }),
    issue: manufacturingIssueSummarySchema,
  })
  .strict()
  .refine(
    (row) =>
      row.piece.id === row.issue.pieceId && row.issue.state !== "RESOLVED",
    "Queue issue must bind its piece and be unresolved",
  );
export const approvalIssuesDataSchema = z
  .object({
    items: z.array(issueQueueItemSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const salesContactDataSchema = approvalIssuesDataSchema.refine(
  (page) =>
    page.items.every(
      (row) =>
        row.issue.state === "SALES_CONTACT" || row.issue.state === "REAPPROVAL",
    ),
  "Contact queue contains contact work only",
);
const totalCount = z.number().int().nonnegative();
export const approvalDashboardDataSchema = z
  .object({
    counts: z
      .object({
        initialOrders: totalCount,
        approvalIssues: totalCount,
        salesContactPieces: totalCount,
        reapprovalPieces: totalCount,
        unresolvedIssues: totalCount,
        approvedToday: totalCount,
        returnedOrders: totalCount,
      })
      .strict(),
    recentOrders: z.array(salesOrderSummarySchema).max(5),
  })
  .strict()
  .refine(
    ({ counts }) =>
      counts.unresolvedIssues ===
      counts.approvalIssues +
        counts.salesContactPieces +
        counts.reapprovalPieces,
    "Unresolved count must equal the issue-state counts",
  );
export const approvalHistoryDataSchema = z
  .object({
    events: z.array(approvalActivityEventSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict()
  .refine(
    (page) =>
      page.events.every(
        (event) =>
          event.operation !== "REPORT_ISSUE" &&
          event.operation !== "SUBMIT_CONTACT",
      ),
    "Own decisions exclude reporting and sales contact",
  );
export const approvalOrderHistoryDataSchema = salesOrderActivityDataSchema;

const pieceFactSchema = z
  .object({
    id: salesUuidSchema,
    stage: orderPieceStageSchema,
    workState: orderWorkStateSchema,
    issueId: salesUuidSchema.nullable(),
    receivedAt: salesInstantSchema.nullable(),
    cancelledAt: salesInstantSchema.nullable(),
    cancellationReason: requiredText.nullable(),
  })
  .strict();
export const approvalEventFactsSchema = z
  .object({
    orderStatus: salesOrderStatusSchema,
    approvedAt: salesInstantSchema.nullable(),
    currentReturn: currentReturnSchema.nullable(),
    money: salesOrderSchema.shape.money,
    counts: retainedOrderCountsSchema,
    pieces: z.array(pieceFactSchema).min(1).max(MAX_DRAFT_PIECES),
    issue: z
      .object({
        id: salesUuidSchema,
        state: approvalIssueStateSchema,
        sourceDepartment: factoryDepartment,
        sourceStage: factoryDepartment,
        sourceWorkState,
        resumeTarget: approvalTargetSchema.nullable(),
        currentProposalId: salesUuidSchema.nullable(),
      })
      .strict()
      .refine(
        (issue) => issue.sourceDepartment === issue.sourceStage,
        "Source stage and department must match",
      )
      .nullable(),
    proposal: pieceContactProposalSchema.nullable(),
  })
  .strict()
  .refine(
    (facts) =>
      new Set(facts.pieces.map((piece) => piece.id)).size ===
        facts.pieces.length &&
      (facts.proposal === null ||
        facts.issue?.currentProposalId === facts.proposal.id),
    "Fact identities must be unique and proposal must bind its issue",
  );
export const approvalEventDataSchema = z
  .object({
    event: approvalActivityEventSchema,
    before: approvalEventFactsSchema,
    after: approvalEventFactsSchema,
  })
  .strict()
  .refine(({ event, before, after }) => {
    const matches = (facts: z.infer<typeof approvalEventFactsSchema>) =>
      event.pieceId === null ||
      (facts.pieces.length === 1 && facts.pieces[0]?.id === event.pieceId);
    return (
      matches(before) &&
      matches(after) &&
      (after.issue?.id ?? null) === event.issueId &&
      (after.proposal?.id ?? null) === event.proposalId
    );
  }, "Retained facts must match the event targets");
const pieceApprovalStampSchema = approvalDecisionStampSchema.safeExtend({
  pieceId: salesUuidSchema,
  proposalId: salesUuidSchema,
});
export const officialOrderPaperDataSchema = z
  .object({
    order: salesOrderSchema,
    approval: z
      .object({
        initial: approvalDecisionStampSchema,
        pieces: z.array(pieceApprovalStampSchema).max(MAX_DRAFT_PIECES),
      })
      .strict(),
    printVersion: salesVersionSchema,
  })
  .strict()
  .refine(
    ({ order, approval, printVersion }) =>
      printVersion === order.version &&
      approval.initial.approvedAt === order.approval.approvedAt &&
      approval.initial.orderVersion <= printVersion &&
      order.status !== "AWAITING_APPROVAL" &&
      order.status !== "RETURNED" &&
      new Set(approval.pieces.map((stamp) => stamp.pieceId)).size ===
        approval.pieces.length &&
      approval.pieces.every(
        (stamp) =>
          stamp.orderVersion <= printVersion &&
          order.pieces.some(
            (piece) =>
              piece.id === stamp.pieceId && piece.stage !== "CANCELLED",
          ),
      ),
    "Official paper must bind current order and actual approval stamps",
  );
const factoryIssueInstructionSchema = z
  .object({
    pieceId: salesUuidSchema,
    issueId: salesUuidSchema,
    state: approvalIssueStateSchema,
    reason: requiredText,
    reportNotes: requiredText.nullable(),
    approvedInstructions: requiredText.nullable(),
    target: approvalTargetSchema.nullable(),
  })
  .strict();
export const factoryOrderPaperDataSchema = z
  .object({
    order: factoryOrderSchema,
    issues: z.array(factoryIssueInstructionSchema).max(MAX_DRAFT_PIECES),
  })
  .strict()
  .refine(
    ({ order, issues }) =>
      new Set(issues.map((issue) => issue.pieceId)).size === issues.length &&
      issues.every((issue) =>
        order.pieces.some((piece) => piece.id === issue.pieceId),
      ),
    "Factory issue contexts must be unique and bind current order pieces",
  );

export type ApproveInitialBody = z.infer<typeof approveInitialBodySchema>;
export type ReturnInitialBody = z.infer<typeof returnInitialBodySchema>;
export type ReportIssueBody = z.infer<typeof reportIssueBodySchema>;
export type ResolveIssueBody = z.infer<typeof resolveIssueBodySchema>;
export type SubmitContactBody = z.infer<typeof submitContactBodySchema>;
export type ReviewContactBody = z.infer<typeof reviewContactBodySchema>;
export type ContactChanges = z.infer<typeof contactChangesSchema>;
export type ApprovalPieceParams = z.infer<typeof approvalPieceParamsSchema>;
export type ApprovalIssueParams = z.infer<typeof approvalIssueParamsSchema>;
export type ApprovalEventParams = z.infer<typeof approvalEventParamsSchema>;
export type ContactValues = z.infer<typeof contactValuesSchema>;
export type ApprovalDecisionStamp = z.infer<typeof approvalDecisionStampSchema>;
export type PieceContactProposalDto = z.infer<
  typeof pieceContactProposalSchema
>;
export type ManufacturingIssueSummary = z.infer<
  typeof manufacturingIssueSummarySchema
>;
export type ManufacturingIssueDto = z.infer<typeof manufacturingIssueSchema>;
export type ApprovalWorkflow = z.infer<typeof approvalWorkflowSchema>;
export type ApprovalOrderData = z.infer<typeof approvalOrderDataSchema>;
export type ApprovalOrdersQuery = z.infer<typeof approvalOrdersQuerySchema>;
export type ApprovalIssuesQuery = z.infer<typeof approvalIssuesQuerySchema>;
export type SalesContactQuery = z.infer<typeof salesContactQuerySchema>;
export type ApprovalHistoryQuery = z.infer<typeof approvalHistoryQuerySchema>;
export type ApprovalOrderHistoryQuery = z.infer<
  typeof approvalOrderHistoryQuerySchema
>;
export type ApprovalOrdersData = z.infer<typeof approvalOrdersDataSchema>;
export type ApprovalIssuesData = z.infer<typeof approvalIssuesDataSchema>;
export type SalesContactData = z.infer<typeof salesContactDataSchema>;
export type ApprovalDashboardData = z.infer<typeof approvalDashboardDataSchema>;
export type ApprovalHistoryData = z.infer<typeof approvalHistoryDataSchema>;
export type ApprovalOrderHistoryData = z.infer<
  typeof approvalOrderHistoryDataSchema
>;
export type ApprovalEventFacts = z.infer<typeof approvalEventFactsSchema>;
export type ApprovalEventData = z.infer<typeof approvalEventDataSchema>;
export type OfficialOrderPaperData = z.infer<
  typeof officialOrderPaperDataSchema
>;
export type FactoryOrderPaperData = z.infer<typeof factoryOrderPaperDataSchema>;
export type ApprovalOrdersQueryInput = z.input<
  typeof approvalOrdersQuerySchema
>;
export type ApprovalIssuesQueryInput = z.input<
  typeof approvalIssuesQuerySchema
>;
export type SalesContactQueryInput = z.input<typeof salesContactQuerySchema>;
export type ApprovalHistoryQueryInput = z.input<
  typeof approvalHistoryQuerySchema
>;
export type ApprovalOrderHistoryQueryInput = z.input<
  typeof approvalOrderHistoryQuerySchema
>;
