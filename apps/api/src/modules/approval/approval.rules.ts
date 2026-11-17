import { MAX_DRAFT_PIECES } from "@template/contracts";
import type {
  ApprovalWorkflow,
  ApprovalIssueState,
  ApprovalDecisionStamp,
  ManufacturingIssueDto,
} from "@template/contracts";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { OrderStateConflictError } from "../sales-orders/sales-orders.errors.js";
import type { ApprovalOrderRecord } from "./approval.types.js";

type IssueState = Pick<ManufacturingIssueDto, "state" | "pieceId"> & {
  id: string;
  latestProposalId: string | null;
};
export const getApprovalIssueActions = (
  actor: Pick<AuthorityAccount, "id" | "role" | "department">,
  ownerId: string,
  issue: IssueState,
  currentIssueId: string | null,
) => {
  const current = currentIssueId === issue.id;
  const approver = actor.role === "ADMIN" || actor.department === "APPROVAL";
  const owner =
    actor.id === ownerId &&
    (actor.role === "ADMIN" || actor.department === "SALES");
  return {
    canResolve: current && approver && issue.state === "APPROVAL_REVIEW",
    canSubmitContact: current && owner && issue.state === "SALES_CONTACT",
    canReviewContact:
      current &&
      approver &&
      issue.state === "REAPPROVAL" &&
      issue.latestProposalId !== null,
  };
};
export const getApprovalPrintEligibility = (
  root: {
    order: Pick<
      NonNullable<ApprovalOrderRecord["order"]>,
      "status" | "approvedAt"
    > | null;
  },
  initial: ApprovalDecisionStamp | null,
  issues: readonly {
    state: ApprovalIssueState;
    latestProposalId: string | null;
  }[],
): ApprovalWorkflow["printEligibility"] => {
  if (root.order?.status === "RETURNED")
    return { allowed: false, reason: "RETURNED" };
  if (
    root.order === null ||
    root.order.status === "AWAITING_APPROVAL" ||
    initial === null ||
    root.order.approvedAt?.toISOString() !== initial.approvedAt
  )
    return { allowed: false, reason: "NOT_APPROVED" };
  if (
    issues.some(
      (issue) =>
        (issue.state === "SALES_CONTACT" || issue.state === "REAPPROVAL") &&
        issue.latestProposalId !== null,
    )
  )
    return { allowed: false, reason: "PENDING_REAPPROVAL" };
  return { allowed: true, reason: null };
};

type InitialPiece = Pick<
  NonNullable<ApprovalOrderRecord["pieces"][number]["orderPiece"]>,
  "stage" | "workState" | "issueId" | "receivedAt" | "cancelledAt"
>;
export const assertInitialDecisionState = (
  root: {
    order: Pick<
      NonNullable<ApprovalOrderRecord["order"]>,
      "status" | "approvedAt"
    > | null;
    pieces: readonly { orderPiece: InitialPiece | null }[];
  },
  hasInitialApproval: boolean,
): void => {
  if (root.order === null)
    throw new InternalServerError("A submitted order has no header.");
  if (
    root.order.status !== "AWAITING_APPROVAL" ||
    root.order.approvedAt !== null ||
    hasInitialApproval
  )
    throw new OrderStateConflictError();
  const active = root.pieces.filter(
    ({ orderPiece }) => orderPiece?.stage !== "CANCELLED",
  );
  if (
    root.pieces.length < 1 ||
    root.pieces.length > MAX_DRAFT_PIECES ||
    root.pieces.some(
      ({ orderPiece: piece }) =>
        piece === null ||
        (piece.stage === "CANCELLED"
          ? piece.workState !== "BLOCKED" ||
            piece.issueId !== null ||
            piece.cancelledAt === null
          : piece.stage !== "AWAITING_APPROVAL" ||
            piece.workState !== "INCOMING" ||
            piece.issueId !== null ||
            piece.receivedAt !== null ||
            piece.cancelledAt !== null),
    )
  )
    throw new InternalServerError(
      "A pending order has an inconsistent physical graph.",
    );
  if (active.length === 0) throw new OrderStateConflictError();
};
