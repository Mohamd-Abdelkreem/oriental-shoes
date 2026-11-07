import {
  approvalEventDataSchema,
  type ApprovalEventData,
  approvalEventFactsSchema,
  type ApprovalEventFacts,
  pieceContactProposalSchema,
  manufacturingIssueSchema,
  type PieceContactProposalDto,
  type ManufacturingIssueDto,
  approvalCommandDataSchema,
  type ApprovalCommandData,
} from "@template/contracts";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { mapSalesOrder } from "../sales-orders/sales-orders.mapper.js";
import type { ApprovalOrderRecord } from "./approval.types.js";
import type { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";

export const APPROVAL_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  orderId: true,
  pieceId: true,
  issueId: true,
  proposalId: true,
  expectedVersion: true,
  beforeVersion: true,
  afterVersion: true,
  payloadHash: true,
  decision: true,
  decisionNotes: true,
  beforeFacts: true,
  afterFacts: true,
  outcome: true,
  occurredAt: true,
} satisfies Prisma.ApprovalCommandSelect;
export type ApprovalCommandRecord = Prisma.ApprovalCommandGetPayload<{
  select: typeof APPROVAL_COMMAND_SELECT;
}>;
export const mapApprovalCommandResult = (
  record: ApprovalCommandRecord,
  replayed: boolean,
): ApprovalCommandData => {
  const parsed = approvalCommandDataSchema.safeParse({
    kind: "approval-command",
    replayed,
    receipt: {
      commandId: record.commandId,
      operation: record.operation,
      orderId: record.orderId,
      actor: {
        id: record.actorId,
        fullName: record.actorFullName,
        role: record.actorRole,
        department: record.actorDepartment,
      },
      beforeVersion: record.beforeVersion,
      afterVersion: record.afterVersion,
      occurredAt: record.occurredAt.toISOString(),
    },
    outcome: record.outcome,
  });
  if (
    !parsed.success ||
    parsed.data.outcome.pieceId !== record.pieceId ||
    parsed.data.outcome.issueId !== record.issueId ||
    parsed.data.outcome.proposalId !== record.proposalId
  )
    throw new InternalServerError(
      "A retained approval command has an invalid result.",
    );
  return parsed.data;
};

export const APPROVAL_PROPOSAL_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  issueId: true,
  sequence: true,
  kind: true,
  submittedCommandId: true,
  submittedById: true,
  submittedByFullName: true,
  contactNotes: true,
  submittedAt: true,
  beforeModel: true,
  beforeModelId: true,
  beforeSize: true,
  beforeSizeId: true,
  beforeLeatherBase: true,
  beforeLeatherBaseId: true,
  beforeSole: true,
  beforeSoleId: true,
  proposedModel: true,
  proposedModelId: true,
  proposedSize: true,
  proposedSizeId: true,
  proposedLeatherBase: true,
  proposedLeatherBaseId: true,
  proposedSole: true,
  proposedSoleId: true,
  submittedCommand: { select: { actorRole: true, actorDepartment: true } },
} satisfies Prisma.PieceContactProposalSelect;
type SelectedContactProposal = Prisma.PieceContactProposalGetPayload<{
  select: typeof APPROVAL_PROPOSAL_SELECT;
}>;
// Deferred witness foreign keys can be temporarily absent inside a submitting transaction.
export type PieceContactProposalRecord = Omit<
  SelectedContactProposal,
  "submittedCommand"
> & { submittedCommand: SelectedContactProposal["submittedCommand"] | null };
export const CURRENT_ISSUE_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  cycle: true,
  state: true,
  sourceDepartment: true,
  sourceStage: true,
  sourceWorkState: true,
  reporterId: true,
  reporterFullName: true,
  reporterRole: true,
  reporterDepartment: true,
  reason: true,
  notes: true,
  reportedAt: true,
  updatedAt: true,
  reportedCommandId: true,
  resumeTarget: true,
  latestProposalId: true,
  resolvedAt: true,
  resolutionCommandId: true,
  latestProposal: { select: APPROVAL_PROPOSAL_SELECT },
} satisfies Prisma.ManufacturingIssueSelect;
export type CurrentIssueRecord = Prisma.ManufacturingIssueGetPayload<{
  select: typeof CURRENT_ISSUE_SELECT;
}>;

export const mapContactProposal = (
  proposal: PieceContactProposalRecord,
): PieceContactProposalDto => {
  if (proposal.submittedCommand == null)
    throw new InternalServerError(
      "A retained contact proposal has no command witness.",
    );
  const parsed = pieceContactProposalSchema.safeParse({
    id: proposal.id,
    kind: proposal.kind,
    contactNotes: proposal.contactNotes,
    before: {
      model: proposal.beforeModel,
      size: proposal.beforeSize,
      leatherBase: proposal.beforeLeatherBase,
      sole: proposal.beforeSole,
      catalogSelections: {
        model: proposal.beforeModelId,
        size: proposal.beforeSizeId,
        leatherBase: proposal.beforeLeatherBaseId,
        sole: proposal.beforeSoleId,
      },
    },
    proposed:
      proposal.kind === "CANCEL_REQUEST"
        ? null
        : {
            model: proposal.proposedModel,
            size: proposal.proposedSize,
            leatherBase: proposal.proposedLeatherBase,
            sole: proposal.proposedSole,
            catalogSelections: {
              model: proposal.proposedModelId,
              size: proposal.proposedSizeId,
              leatherBase: proposal.proposedLeatherBaseId,
              sole: proposal.proposedSoleId,
            },
          },
    submittedBy: {
      id: proposal.submittedById,
      fullName: proposal.submittedByFullName,
      role: proposal.submittedCommand.actorRole,
      department: proposal.submittedCommand.actorDepartment,
    },
    submittedAt: proposal.submittedAt.toISOString(),
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A retained contact proposal has invalid fields.",
    );
  return parsed.data;
};
export const mapCurrentIssue = (
  issue: CurrentIssueRecord,
  instructions: ManufacturingIssueDto["instructions"],
  allowedActions: ManufacturingIssueDto["allowedActions"],
): ManufacturingIssueDto => {
  const parsed = manufacturingIssueSchema.safeParse({
    id: issue.id,
    orderId: issue.orderId,
    pieceId: issue.pieceId,
    state: issue.state,
    source: {
      department: issue.sourceDepartment,
      stage: issue.sourceStage,
      workState: issue.sourceWorkState,
    },
    reporter: {
      id: issue.reporterId,
      fullName: issue.reporterFullName,
      role: issue.reporterRole,
      department: issue.reporterDepartment,
    },
    reportedAt: issue.reportedAt.toISOString(),
    reason: issue.reason,
    notes: issue.notes,
    resumeTarget: issue.resumeTarget,
    currentProposal:
      issue.latestProposal === null
        ? null
        : mapContactProposal(issue.latestProposal),
    instructions,
    allowedActions,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A current manufacturing issue has invalid fields.",
    );
  return parsed.data;
};

export const mapApprovalFacts = (
  root: ApprovalOrderRecord,
  actor: AuthorityAccount,
  context: {
    returnNotes: string | null;
    pieceId: string | null;
    issue: CurrentIssueRecord | null;
  },
): ApprovalEventFacts => {
  const order = mapSalesOrder(root, actor),
    header = root.order;
  if (header === null)
    throw new InternalServerError("A submitted order has no header.");
  const currentReturn =
    header.currentReturnDecisionId === null
      ? null
      : {
          decisionId: header.currentReturnDecisionId,
          reason: header.currentReturnReason,
          notes: context.returnNotes,
          returnedAt: header.currentReturnedAt?.toISOString(),
        };
  const pieces = root.pieces
    .filter((piece) => context.pieceId === null || piece.id === context.pieceId)
    .map((piece) => {
      const physical = piece.orderPiece;
      if (physical === null)
        throw new InternalServerError(
          "A submitted piece has no physical record.",
        );
      return {
        id: piece.id,
        stage: physical.stage,
        workState: physical.workState,
        issueId: physical.issueId,
        receivedAt: physical.receivedAt?.toISOString() ?? null,
        cancelledAt: physical.cancelledAt?.toISOString() ?? null,
        cancellationReason: physical.cancellationReason,
      };
    });
  const parsed = approvalEventFactsSchema.safeParse({
    orderStatus: order.status,
    approvedAt: order.approval.approvedAt,
    currentReturn,
    money: order.money,
    counts: order.counts,
    pieces,
    issue:
      context.issue === null
        ? null
        : {
            id: context.issue.id,
            state: context.issue.state,
            sourceDepartment: context.issue.sourceDepartment,
            sourceStage: context.issue.sourceStage,
            sourceWorkState: context.issue.sourceWorkState,
            resumeTarget: context.issue.resumeTarget,
            currentProposalId: context.issue.latestProposalId,
          },
    proposal:
      context.issue?.latestProposal == null
        ? null
        : mapContactProposal(context.issue.latestProposal),
  });
  if (!parsed.success)
    throw new InternalServerError("Approval command facts are inconsistent.");
  return parsed.data;
};

export const mapApprovalEventData = (record: {
  event: unknown;
  beforeFacts: unknown;
  afterFacts: unknown;
}): ApprovalEventData => {
  const parsed = approvalEventDataSchema.safeParse({
    event: record.event,
    before: record.beforeFacts,
    after: record.afterFacts,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "The retained approval event is inconsistent.",
    );
  return parsed.data;
};
