import type {
  ApproveInitialBody,
  ReturnInitialBody,
  ReportIssueBody,
  ResolveIssueBody,
  SubmitContactBody,
  ReviewContactBody,
  ApprovalActivityEvent,
  ApprovalEventFacts,
  ApprovalCommandOutcome,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type { SalesOrderRecord } from "../sales-orders/sales-orders.mapper.js";

export type ApprovalDecision = NonNullable<ApprovalActivityEvent["decision"]>;
export type ApprovalOrderRecord = SalesOrderRecord;
type InitialTargets = {
  operation: "APPROVE_INITIAL" | "RETURN_INITIAL";
  orderId: string;
};
type ReportTargets = {
  operation: "REPORT_ISSUE";
  orderId: string;
  pieceId: string;
};
type IssueTargets = {
  operation: "RESOLVE_ISSUE" | "SUBMIT_CONTACT";
  orderId: string;
  pieceId: string;
  issueId: string;
};
type ReviewTargets = {
  operation: "REVIEW_CONTACT";
  orderId: string;
  pieceId: string;
  issueId: string;
  proposalId: string;
};
export type ApprovalCommandWorkResult = {
  pieceId: string | null;
  issueId: string | null;
  proposalId: string | null;
  decision: ApprovalDecision | null;
  decisionNotes: string | null;
  beforeFacts: ApprovalEventFacts;
  afterFacts: ApprovalEventFacts;
  outcome: ApprovalCommandOutcome;
};
export type ApprovalCommandExecution = Readonly<
  InitialTargets | ReportTargets | IssueTargets | ReviewTargets
> &
  Readonly<{
    actorId: string;
    commandId: string;
    expectedVersion: number;
    payloadHash: string;
    work(
      tx: Prisma.TransactionClient,
      actor: AuthorityAccount,
      occurredAt: Date,
    ): Promise<ApprovalCommandWorkResult>;
  }>;
export type ApprovalCommandHashIntent = Readonly<{ expectedVersion: number }> &
  (
    | Readonly<{
        operation: "APPROVE_INITIAL";
        orderId: string;
        payload: ApproveInitialBody;
      }>
    | Readonly<{
        operation: "RETURN_INITIAL";
        orderId: string;
        payload: ReturnInitialBody;
      }>
    | Readonly<ReportTargets & { payload: ReportIssueBody }>
    | Readonly<
        Omit<IssueTargets, "operation"> & {
          operation: "RESOLVE_ISSUE";
          payload: ResolveIssueBody;
        }
      >
    | Readonly<
        Omit<IssueTargets, "operation"> & {
          operation: "SUBMIT_CONTACT";
          payload: SubmitContactBody;
        }
      >
    | Readonly<ReviewTargets & { payload: ReviewContactBody }>
  );
