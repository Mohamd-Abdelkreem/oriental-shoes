import {
  openManufacturingVisit,
  interruptManufacturingVisit,
  cancelManufacturingVisit,
} from "../manufacturing/manufacturing-work.lifecycle.js";
import type {
  OfficialOrderPaperData,
  FactoryOrderPaperData,
  ApprovalOrderHistoryQuery,
  SalesOrderActivityData,
  ApprovalEventData,
  ApprovalIssuesQuery,
  SalesContactQuery,
  ApprovalIssuesData,
  SalesContactData,
  ApprovalOrderData,
  ReviewContactBody,
  ResolveIssueBody,
  ReportIssueBody,
  ApprovalOrdersQuery,
  ApprovalOrdersData,
  ApprovalDashboardData,
  ApprovalHistoryQuery,
  ApprovalHistoryData,
  ApprovalCommandData,
  ApproveInitialBody,
  ReturnInitialBody,
} from "@template/contracts";
import {
  contactValuesSchema,
  type ContactValues,
  type SubmitContactBody,
} from "@template/contracts";
import {
  findOfficialPaper,
  findFactoryPaper,
  authorizeOrderHistory,
  findApprovalEvent,
  findApprovalIssues,
  findApprovalOrder,
  findApprovalPending,
  findApprovalDashboard,
  findOwnApprovalHistory,
  lockApprovalOrder,
} from "./approval.queries.js";
import { findOrderActivity } from "../sales-orders/order-activity.queries.js";
import type { CurrentIssueRecord } from "./approval.mapper.js";
import {
  mapContactProposal,
  type PieceContactProposalRecord,
} from "./approval.mapper.js";
import {
  ApprovalProposalConflictError,
  ApprovalIssueNotFoundError,
  ApprovalIssueConflictError,
} from "./approval.errors.js";
import { lockActiveCatalog } from "../catalogs/catalogs.queries.js";
import { resolveCatalogSelection } from "../catalogs/catalogs.rules.js";
import {
  OrderCatalogUnavailableError,
  OrderNotFoundError,
  OrderStateConflictError,
  OrderCalendarUnavailableError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import { ValidationException } from "../../core/errors/validation.error.js";
import type { ApprovalOrderRecord } from "./approval.types.js";
import {
  calculateOrderMoney,
  parseMoneyCents,
} from "../sales-orders/sales-orders.rules.js";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import { randomUUID } from "node:crypto";
import { DepartmentAccessDeniedError } from "../auth/auth.errors.js";
import { CURRENT_ISSUE_SELECT, mapApprovalFacts } from "./approval.mapper.js";
import { Department, Prisma } from "@template/database";
import { parseOrderBusinessTimeZone } from "../../core/config/order.config.js";
import {
  lockAccountRows,
  loadIdentityAccount,
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import { isSalesTransactionConflict } from "../sales-commands/sales-command.errors.js";
import type { DatabaseClient } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { SALES_ORDER_SELECT } from "../sales-orders/sales-orders.mapper.js";
import type { ApprovalCommandExecutor } from "./approval-command-executor.js";
import { hashApprovalCommandIntent } from "./approval-command-executor.js";
import { assertInitialDecisionState } from "./approval.rules.js";

type InitialIntent =
  | { operation: "APPROVE_INITIAL"; body: ApproveInitialBody }
  | { operation: "RETURN_INITIAL"; body: ReturnInitialBody };
export class ApprovalService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: ApprovalCommandExecutor,
    private readonly businessTimeZone: string | null,
  ) {}
  approveInitial(
    actorId: string,
    orderId: string,
    input: ApproveInitialBody,
  ): Promise<ApprovalCommandData> {
    return this.executeInitial(actorId, orderId, {
      operation: "APPROVE_INITIAL",
      body: input,
    });
  }
  returnInitial(
    actorId: string,
    orderId: string,
    input: ReturnInitialBody,
  ): Promise<ApprovalCommandData> {
    return this.executeInitial(actorId, orderId, {
      operation: "RETURN_INITIAL",
      body: input,
    });
  }

  listPending(
    actorId: string,
    query: ApprovalOrdersQuery,
  ): Promise<ApprovalOrdersData> {
    return this.read(actorId, Department.APPROVAL, (tx, actor) =>
      findApprovalPending(tx, actor, query),
    );
  }
  history(
    actorId: string,
    query: ApprovalHistoryQuery,
  ): Promise<ApprovalHistoryData> {
    return this.read(actorId, Department.APPROVAL, (tx, actor) =>
      findOwnApprovalHistory(tx, actor, query),
    );
  }
  dashboard(actorId: string): Promise<ApprovalDashboardData> {
    return this.read(actorId, Department.APPROVAL, (tx, actor) => {
      const zone = parseOrderBusinessTimeZone(
        this.businessTimeZone ?? undefined,
      );
      if (zone === null) throw new OrderCalendarUnavailableError();
      return findApprovalDashboard(tx, actor, new Date(), zone);
    });
  }
  listIssues(
    actorId: string,
    query: ApprovalIssuesQuery,
  ): Promise<ApprovalIssuesData> {
    return this.read(actorId, Department.APPROVAL, (tx, actor) =>
      findApprovalIssues(tx, actor, query, "APPROVAL"),
    );
  }
  salesContacts(
    actorId: string,
    query: SalesContactQuery,
  ): Promise<SalesContactData> {
    return this.read(actorId, Department.SALES, (tx, actor) =>
      findApprovalIssues(tx, actor, query, "CONTACT"),
    );
  }
  getOrder(actorId: string, orderId: string): Promise<ApprovalOrderData> {
    return this.read(actorId, Department.APPROVAL, (tx, actor) =>
      findApprovalOrder(tx, actor, orderId, "APPROVAL"),
    );
  }
  getSalesContactOrder(
    actorId: string,
    orderId: string,
  ): Promise<ApprovalOrderData> {
    return this.read(actorId, Department.SALES, (tx, actor) =>
      findApprovalOrder(tx, actor, orderId, "CONTACT"),
    );
  }
  orderHistory(
    actorId: string,
    orderId: string,
    query: ApprovalOrderHistoryQuery,
  ): Promise<SalesOrderActivityData> {
    return this.read(actorId, undefined, async (tx, actor) =>
      findOrderActivity(
        tx,
        await authorizeOrderHistory(tx, actor, orderId),
        query,
        orderId,
      ),
    );
  }
  event(
    actorId: string,
    orderId: string,
    eventId: string,
  ): Promise<ApprovalEventData> {
    return this.read(actorId, undefined, (tx, actor) =>
      findApprovalEvent(tx, { actor, orderId, eventId }),
    );
  }
  officialPaper(
    actorId: string,
    orderId: string,
  ): Promise<OfficialOrderPaperData> {
    return this.read(actorId, undefined, (tx, actor) =>
      findOfficialPaper(tx, actor, orderId),
    );
  }
  factoryPaper(
    actorId: string,
    orderId: string,
  ): Promise<FactoryOrderPaperData> {
    return this.read(actorId, undefined, (tx, actor) =>
      findFactoryPaper(tx, actor, orderId),
    );
  }
  observe(actorId: string, commandId: string): Promise<ApprovalCommandData> {
    return this.commands.observe(actorId, commandId);
  }
  private async read<T>(
    actorId: string,
    department: Department | undefined,
    work: (tx: Prisma.TransactionClient, actor: AuthorityAccount) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout','5000ms',true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, department);
            return work(tx, actor);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: unknown) {
        if (isSalesTransactionConflict(error) && !retried) {
          retried = true;
          continue;
        }
        throw error;
      }
    }
  }

  reportIssue(
    actorId: string,
    orderId: string,
    pieceId: string,
    input: ReportIssueBody,
  ): Promise<ApprovalCommandData> {
    return this.commands.execute({
      operation: "REPORT_ISSUE",
      actorId,
      orderId,
      pieceId,
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashApprovalCommandIntent({
        operation: "REPORT_ISSUE",
        orderId,
        pieceId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await lockApprovalOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          scope: "FACTORY",
        });
        const selected = root.pieces.find((piece) => piece.id === pieceId);
        if (selected === undefined) throw new OrderNotFoundError();
        const physical = selected.orderPiece;
        if (physical === null)
          throw new InternalServerError(
            "A submitted piece has no physical record.",
          );
        if (
          root.order?.status !== "APPROVED" ||
          (physical.stage !== "CUTTING" &&
            physical.stage !== "PRODUCTION" &&
            physical.stage !== "QUALITY") ||
          physical.receivedAt !== null ||
          physical.cancelledAt !== null
        )
          throw new OrderStateConflictError();
        if (actor.role !== "ADMIN" && actor.department !== physical.stage)
          throw new DepartmentAccessDeniedError();
        if (physical.issueId !== null) throw new ApprovalIssueConflictError();
        if (
          physical.workState !== "INCOMING" &&
          physical.workState !== "IN_PROGRESS"
        )
          throw new OrderStateConflictError();
        const beforeFacts = mapApprovalFacts(root, actor, {
          returnNotes: null,
          pieceId,
          issue: null,
        });
        const last = await tx.manufacturingIssue.findFirst({
          where: { pieceId },
          orderBy: { cycle: "desc" },
          select: { cycle: true },
        });
        if (last !== null && last.cycle >= 2147483647)
          throw new ApprovalIssueConflictError();
        const issueId = randomUUID();
        const issue = await tx.manufacturingIssue.create({
          data: {
            id: issueId,
            orderId,
            pieceId,
            cycle: (last?.cycle ?? 0) + 1,
            state: "APPROVAL_REVIEW",
            sourceDepartment: physical.stage,
            sourceStage: physical.stage,
            sourceWorkState: physical.workState,
            reporterId: actor.id,
            reporterFullName: actor.fullName,
            reporterRole: actor.role,
            reporterDepartment: actor.department,
            reason: input.reason,
            notes: input.notes,
            reportedAt: occurredAt,
            updatedAt: occurredAt,
            reportedCommandId: input.commandId,
          },
          select: CURRENT_ISSUE_SELECT,
        });
        await tx.salesOrderPiece.update({
          where: { id: pieceId },
          data: { workState: "BLOCKED", issueId },
        });
        await interruptManufacturingVisit(tx, {
          orderId,
          pieceId,
          approvalCommandId: input.commandId,
          occurredAt,
        });
        const orderVersion = await this.advanceApprovalOrderVersion(tx, {
          orderId,
          expectedVersion: input.expectedVersion,
          occurredAt,
        });
        const after = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: SALES_ORDER_SELECT,
        });
        return {
          pieceId,
          issueId,
          proposalId: null,
          decision: null,
          decisionNotes: null,
          beforeFacts,
          afterFacts: mapApprovalFacts(after, actor, {
            returnNotes: null,
            pieceId,
            issue,
          }),
          outcome: {
            orderId,
            orderVersion,
            orderStatus: "APPROVED",
            pieceId,
            pieceStage: physical.stage,
            pieceWorkState: "BLOCKED",
            issueId,
            issueState: "APPROVAL_REVIEW",
            proposalId: null,
          },
        };
      },
    });
  }
  resolveIssue(
    actorId: string,
    orderId: string,
    pieceId: string,
    issueId: string,
    input: ResolveIssueBody,
  ): Promise<ApprovalCommandData> {
    return this.commands.execute({
      operation: "RESOLVE_ISSUE",
      actorId,
      orderId,
      pieceId,
      issueId,
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashApprovalCommandIntent({
        operation: "RESOLVE_ISSUE",
        orderId,
        pieceId,
        issueId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await lockApprovalOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          scope: "APPROVAL",
        });
        const issue = await this.currentHeldIssue(
          tx,
          root,
          pieceId,
          issueId,
          "APPROVAL_REVIEW",
        );
        const beforeFacts = mapApprovalFacts(root, actor, {
          returnNotes: null,
          pieceId,
          issue,
        });
        if (input.decision === "CANCEL") {
          await this.cancelIssuePiece(tx, {
            root,
            pieceId,
            issueId,
            reason: input.reason,
            commandId: input.commandId,
            occurredAt,
          });
        } else {
          await tx.manufacturingIssue.update({
            where: { id: issueId },
            data: {
              resumeTarget: input.target,
              updatedAt: occurredAt,
              ...(input.decision === "SEND_TO_SALES"
                ? { state: "SALES_CONTACT" }
                : {
                    state: "RESOLVED",
                    resolutionCommandId: input.commandId,
                    resolvedAt: occurredAt,
                  }),
            },
          });
          if (input.decision === "RETURN_TO_DEPARTMENT") {
            await tx.salesOrderPiece.update({
              where: { id: pieceId },
              data: {
                issueId: null,
                stage: input.target,
                workState: "INCOMING",
              },
            });
            await openManufacturingVisit(tx, {
              orderId,
              pieceId,
              target: input.target,
              origin: {
                kind: "APPROVAL_RETURN",
                approvalCommandId: input.commandId,
                issueId,
                instructions: input.notes,
              },
              occurredAt,
            });
          }
        }
        const orderVersion = await this.advanceApprovalOrderVersion(tx, {
          orderId,
          expectedVersion: input.expectedVersion,
          occurredAt,
        });
        const after = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: SALES_ORDER_SELECT,
        });
        const current = await tx.manufacturingIssue.findUniqueOrThrow({
          where: { id: issueId },
          select: CURRENT_ISSUE_SELECT,
        });
        const afterFacts = mapApprovalFacts(after, actor, {
          returnNotes: null,
          pieceId,
          issue: current,
        });
        const physical = afterFacts.pieces[0];
        if (physical === undefined)
          throw new InternalServerError(
            "Resolved issue has no selected piece.",
          );
        return {
          pieceId,
          issueId,
          proposalId: null,
          decision: input.decision,
          decisionNotes:
            input.decision === "CANCEL" ? input.reason : input.notes,
          beforeFacts,
          afterFacts,
          outcome: {
            orderId,
            orderVersion,
            orderStatus: afterFacts.orderStatus,
            pieceId,
            pieceStage: physical.stage,
            pieceWorkState: physical.workState,
            issueId,
            issueState: current.state,
            proposalId: null,
          },
        };
      },
    });
  }
  private async currentHeldIssue(
    tx: Prisma.TransactionClient,
    root: ApprovalOrderRecord,
    pieceId: string,
    issueId: string,
    state: "APPROVAL_REVIEW" | "SALES_CONTACT" | "REAPPROVAL",
  ): Promise<CurrentIssueRecord> {
    const issue = await tx.manufacturingIssue.findFirst({
      where: { id: issueId, orderId: root.id, pieceId },
      select: CURRENT_ISSUE_SELECT,
    });
    if (issue === null) throw new ApprovalIssueNotFoundError();
    const physical = root.pieces.find(
      (piece) => piece.id === pieceId,
    )?.orderPiece;
    if (root.order?.status !== "APPROVED") throw new OrderStateConflictError();
    if (
      issue.state !== state ||
      physical === undefined ||
      physical === null ||
      physical.issueId !== issueId ||
      physical.stage !== issue.sourceStage ||
      physical.workState !== "BLOCKED" ||
      physical.receivedAt !== null ||
      physical.cancelledAt !== null
    )
      throw new ApprovalIssueConflictError();
    return issue;
  }
  private async cancelIssuePiece(
    tx: Prisma.TransactionClient,
    input: {
      root: ApprovalOrderRecord;
      pieceId: string;
      issueId: string;
      reason: string;
      commandId: string;
      occurredAt: Date;
    },
  ): Promise<void> {
    const { root, pieceId, issueId, reason, commandId, occurredAt } = input;
    const physical = root.pieces.find(
      (piece) => piece.id === pieceId,
    )?.orderPiece;
    if (
      root.order?.status !== "APPROVED" ||
      physical === undefined ||
      physical === null ||
      physical.issueId !== issueId ||
      physical.workState !== "BLOCKED" ||
      !["CUTTING", "PRODUCTION", "QUALITY"].includes(physical.stage) ||
      physical.receivedAt !== null ||
      physical.cancelledAt !== null
    )
      throw new ApprovalIssueConflictError();
    const remaining = root.pieces.filter(
      (piece) =>
        piece.id !== pieceId && piece.orderPiece?.stage !== "CANCELLED",
    );
    const money = calculateOrderMoney(
      remaining.map((piece) => {
        if (piece.orderPiece === null)
          throw new InternalServerError(
            "A retained piece has no frozen price.",
          );
        return parseMoneyCents(
          serializeDecimalToString(piece.orderPiece.unitPrice),
        );
      }),
      parseMoneyCents(serializeDecimalToString(root.order.paidAmount)),
    );
    await tx.salesOrderPiece.update({
      where: { id: pieceId },
      data: {
        stage: "CANCELLED",
        workState: "BLOCKED",
        issueId: null,
        cancelledAt: occurredAt,
        cancellationReason: reason,
      },
    });
    await cancelManufacturingVisit(tx, {
      orderId: root.id,
      pieceId,
      approvalCommandId: commandId,
      occurredAt,
    });
    await tx.manufacturingIssue.update({
      where: { id: issueId },
      data: {
        state: "RESOLVED",
        resolvedAt: occurredAt,
        resolutionCommandId: commandId,
        updatedAt: occurredAt,
      },
    });
    await tx.salesOrder.update({
      where: { id: root.id },
      data: {
        totalAmount: money.total,
        ...(remaining.length === 0 ? { status: "CANCELLED" } : {}),
      },
    });
  }
  submitContact(
    actorId: string,
    orderId: string,
    pieceId: string,
    issueId: string,
    input: SubmitContactBody,
  ): Promise<ApprovalCommandData> {
    return this.commands.execute({
      operation: "SUBMIT_CONTACT",
      actorId,
      orderId,
      pieceId,
      issueId,
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashApprovalCommandIntent({
        operation: "SUBMIT_CONTACT",
        orderId,
        pieceId,
        issueId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await lockApprovalOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          scope: "OWNER",
        });
        const issue = await this.currentHeldIssue(
          tx,
          root,
          pieceId,
          issueId,
          "SALES_CONTACT",
        );
        if (
          issue.resumeTarget !== "CUTTING" &&
          issue.resumeTarget !== "PRODUCTION"
        )
          throw new InternalServerError(
            "A contact issue has no retained target.",
          );
        const before = await this.currentContactValues(tx, root, pieceId);
        const proposed: ContactValues = {
          ...before,
          catalogSelections: { ...before.catalogSelections },
        };
        if (input.kind === "AMEND") {
          const fields = (
            ["model", "size", "leatherBase", "sole"] as const
          ).filter((field) => input.changes[field] !== undefined);
          const active = fields.some((field) => input.changes[field] !== null)
            ? await lockActiveCatalog(tx)
            : null;
          if (
            fields.some((field) => input.changes[field] !== null) &&
            active === null
          )
            throw new OrderCatalogUnavailableError();
          for (const field of fields) {
            const id = input.changes[field];
            if (field === "sole" && id === null) {
              proposed.sole = null;
              proposed.catalogSelections.sole = null;
              continue;
            }
            const entry = active?.entries.find((row) => row.id === id);
            const resolved =
              entry === undefined || active === null
                ? null
                : resolveCatalogSelection(active.entries, active.sourceId, {
                    kind: field,
                    display: entry.displayValue,
                    entryId: entry.id,
                  });
            if (resolved?.status !== "resolved")
              throw new ValidationException([
                {
                  field: `body.changes.${field}`,
                  message: "Select a matching entry from the active catalog.",
                },
              ]);
            proposed[field] = resolved.entry.displayValue;
            proposed.catalogSelections[field] = resolved.entry.id;
          }
        }
        const beforeFacts = mapApprovalFacts(root, actor, {
          returnNotes: null,
          pieceId,
          issue,
        });
        const last = await tx.pieceContactProposal.findFirst({
          where: { issueId },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        });
        if (last !== null && last.sequence >= 2147483647)
          throw new ApprovalIssueConflictError();
        const proposalId = randomUUID();
        await tx.pieceContactProposal.create({
          data: {
            id: proposalId,
            orderId,
            pieceId,
            issueId,
            sequence: (last?.sequence ?? 0) + 1,
            kind: input.kind,
            submittedCommandId: input.commandId,
            submittedById: actor.id,
            submittedByFullName: actor.fullName,
            contactNotes: input.contactNotes,
            submittedAt: occurredAt,
            beforeModel: before.model,
            beforeModelId: before.catalogSelections.model,
            beforeSize: before.size,
            beforeSizeId: before.catalogSelections.size,
            beforeLeatherBase: before.leatherBase,
            beforeLeatherBaseId: before.catalogSelections.leatherBase,
            beforeSole: before.sole,
            beforeSoleId: before.catalogSelections.sole,
            ...(input.kind === "AMEND"
              ? {
                  proposedModel: proposed.model,
                  proposedModelId: proposed.catalogSelections.model,
                  proposedSize: proposed.size,
                  proposedSizeId: proposed.catalogSelections.size,
                  proposedLeatherBase: proposed.leatherBase,
                  proposedLeatherBaseId: proposed.catalogSelections.leatherBase,
                  proposedSole: proposed.sole,
                  proposedSoleId: proposed.catalogSelections.sole,
                }
              : {}),
          },
        });
        const current = await tx.manufacturingIssue.update({
          where: { id: issueId },
          data: {
            state: "REAPPROVAL",
            latestProposalId: proposalId,
            updatedAt: occurredAt,
          },
          select: CURRENT_ISSUE_SELECT,
        });
        if (
          current.latestProposal === null ||
          current.latestProposal.id !== proposalId
        )
          throw new InternalServerError("The submitted proposal is missing.");
        // The immutable command witness is inserted by the executor after these facts.
        // Its in-flight actor comes from the already locked current authority, never a client field.
        current.latestProposal.submittedCommand = {
          actorRole: actor.role,
          actorDepartment: actor.department,
        };
        const orderVersion = await this.advanceApprovalOrderVersion(tx, {
          orderId,
          expectedVersion: input.expectedVersion,
          occurredAt,
        });
        const after = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: SALES_ORDER_SELECT,
        });
        return {
          pieceId,
          issueId,
          proposalId,
          decision: null,
          decisionNotes: null,
          beforeFacts,
          afterFacts: mapApprovalFacts(after, actor, {
            returnNotes: null,
            pieceId,
            issue: current,
          }),
          outcome: {
            orderId,
            orderVersion,
            orderStatus: "APPROVED",
            pieceId,
            pieceStage: issue.sourceStage,
            pieceWorkState: "BLOCKED",
            issueId,
            issueState: "REAPPROVAL",
            proposalId,
          },
        };
      },
    });
  }
  private async currentContactValues(
    tx: Prisma.TransactionClient,
    root: ApprovalOrderRecord,
    pieceId: string,
  ): Promise<ContactValues> {
    const piece = root.pieces.find((row) => row.id === pieceId);
    if (piece === undefined) throw new OrderNotFoundError();
    const references = Object.fromEntries(
      piece.catalogSelections.map((row) => [row.field, row.entryId]),
    );
    const parsed = contactValuesSchema.safeParse({
      model: piece.model,
      size: piece.size,
      leatherBase: piece.leatherBase,
      sole: piece.sole,
      catalogSelections: {
        model: references["model"] ?? null,
        size: references["size"] ?? null,
        leatherBase: references["leatherBase"] ?? null,
        sole: references["sole"] ?? null,
      },
    });
    if (!parsed.success)
      throw new InternalServerError(
        "Retained contact fields are inconsistent.",
      );
    const values = parsed.data;
    const ids = Object.values(values.catalogSelections).filter(
      (id): id is string => id !== null,
    );
    const entries =
      ids.length === 0
        ? []
        : await tx.catalogEntry.findMany({
            where: { id: { in: ids } },
            select: { id: true, kind: true, displayValue: true },
          });
    for (const field of ["model", "size", "leatherBase", "sole"] as const) {
      const id = values.catalogSelections[field];
      if (
        id !== null &&
        !entries.some(
          (entry) =>
            entry.id === id &&
            entry.kind === field &&
            entry.displayValue === values[field],
        )
      )
        throw new InternalServerError(
          "A retained contact reference contradicts its captured field.",
        );
    }
    return values;
  }
  reviewContact(
    actorId: string,
    orderId: string,
    pieceId: string,
    issueId: string,
    input: ReviewContactBody,
  ): Promise<ApprovalCommandData> {
    return this.commands.execute({
      operation: "REVIEW_CONTACT",
      actorId,
      orderId,
      pieceId,
      issueId,
      proposalId: input.proposalId,
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashApprovalCommandIntent({
        operation: "REVIEW_CONTACT",
        orderId,
        pieceId,
        issueId,
        proposalId: input.proposalId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await lockApprovalOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          scope: "APPROVAL",
        });
        const issue = await this.currentHeldIssue(
          tx,
          root,
          pieceId,
          issueId,
          "REAPPROVAL",
        );
        const proposal = issue.latestProposal;
        if (proposal === null || proposal.id !== input.proposalId)
          throw new ApprovalProposalConflictError();
        if (
          issue.resumeTarget !== "CUTTING" &&
          issue.resumeTarget !== "PRODUCTION"
        )
          throw new InternalServerError(
            "A reapproval issue has no retained target.",
          );
        const stored = mapContactProposal(proposal),
          current = await this.currentContactValues(tx, root, pieceId);
        if (
          (["model", "size", "leatherBase", "sole"] as const).some(
            (field) =>
              current[field] !== stored.before[field] ||
              current.catalogSelections[field] !==
                stored.before.catalogSelections[field],
          )
        )
          throw new InternalServerError(
            "A contact proposal no longer matches its approved base.",
          );
        const beforeFacts = mapApprovalFacts(root, actor, {
          returnNotes: null,
          pieceId,
          issue,
        });
        if (input.decision === "CANCEL")
          await this.cancelIssuePiece(tx, {
            root,
            pieceId,
            issueId,
            reason: input.reason,
            commandId: input.commandId,
            occurredAt,
          });
        else if (input.decision === "RETURN_TO_SALES")
          await tx.manufacturingIssue.update({
            where: { id: issueId },
            data: { state: "SALES_CONTACT", updatedAt: occurredAt },
          });
        else {
          if (proposal.kind !== "AMEND")
            throw new ApprovalProposalConflictError();
          await this.applyContactProposal(tx, { proposal, occurredAt });
          await tx.manufacturingIssue.update({
            where: { id: issueId },
            data: {
              state: "RESOLVED",
              resolutionCommandId: input.commandId,
              resolvedAt: occurredAt,
              updatedAt: occurredAt,
            },
          });
          await tx.salesOrderPiece.update({
            where: { id: pieceId },
            data: {
              issueId: null,
              stage: issue.resumeTarget,
              workState: "INCOMING",
            },
          });
          await openManufacturingVisit(tx, {
            orderId,
            pieceId,
            target: issue.resumeTarget,
            origin: {
              kind: "APPROVAL_RETURN",
              approvalCommandId: input.commandId,
              issueId,
              instructions: input.notes,
            },
            occurredAt,
          });
        }
        const orderVersion = await this.advanceApprovalOrderVersion(tx, {
          orderId,
          expectedVersion: input.expectedVersion,
          occurredAt,
        });
        const after = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: SALES_ORDER_SELECT,
        });
        const afterIssue = await tx.manufacturingIssue.findUniqueOrThrow({
          where: { id: issueId },
          select: CURRENT_ISSUE_SELECT,
        });
        const afterFacts = mapApprovalFacts(after, actor, {
            returnNotes: null,
            pieceId,
            issue: afterIssue,
          }),
          physical = afterFacts.pieces[0];
        if (physical === undefined)
          throw new InternalServerError(
            "A reviewed issue has no selected piece.",
          );
        return {
          pieceId,
          issueId,
          proposalId: input.proposalId,
          decision: input.decision,
          decisionNotes:
            input.decision === "ACCEPT" ? input.notes : input.reason,
          beforeFacts,
          afterFacts,
          outcome: {
            orderId,
            orderVersion,
            orderStatus: afterFacts.orderStatus,
            pieceId,
            pieceStage: physical.stage,
            pieceWorkState: physical.workState,
            issueId,
            issueState: afterIssue.state,
            proposalId: input.proposalId,
          },
        };
      },
    });
  }
  private async applyContactProposal(
    tx: Prisma.TransactionClient,
    input: { proposal: PieceContactProposalRecord; occurredAt: Date },
  ): Promise<void> {
    const { proposal, occurredAt } = input,
      values = mapContactProposal(proposal).proposed;
    if (proposal.kind !== "AMEND" || values === null)
      throw new ApprovalProposalConflictError();
    await tx.salesDraftPiece.update({
      where: { id: proposal.pieceId },
      data: {
        model: values.model,
        size: values.size,
        leatherBase: values.leatherBase,
        sole: values.sole,
        updatedAt: occurredAt,
      },
    });
    const fields = ["model", "size", "leatherBase", "sole"] as const;
    await tx.salesPieceCatalogSelection.deleteMany({
      where: { pieceId: proposal.pieceId, field: { in: [...fields] } },
    });
    const selections = fields.flatMap((field) => {
      const entryId = values.catalogSelections[field];
      return entryId === null
        ? []
        : [{ pieceId: proposal.pieceId, field, entryId }];
    });
    if (selections.length > 0)
      await tx.salesPieceCatalogSelection.createMany({ data: selections });
  }
  private executeInitial(
    actorId: string,
    orderId: string,
    intent: InitialIntent,
  ): Promise<ApprovalCommandData> {
    const { commandId, expectedVersion } = intent.body;
    const payloadHash =
      intent.operation === "APPROVE_INITIAL"
        ? hashApprovalCommandIntent({
            operation: intent.operation,
            orderId,
            expectedVersion,
            payload: intent.body,
          })
        : hashApprovalCommandIntent({
            operation: intent.operation,
            orderId,
            expectedVersion,
            payload: intent.body,
          });
    return this.commands.execute({
      operation: intent.operation,
      actorId,
      orderId,
      commandId,
      expectedVersion,
      payloadHash,
      work: async (tx, actor, occurredAt) => {
        const root = await lockApprovalOrder(tx, {
          actor,
          orderId,
          expectedVersion,
          scope: "APPROVAL",
        });
        const initial = await tx.approvalCommand.findFirst({
          where: { orderId, operation: "APPROVE_INITIAL" },
          select: { commandId: true },
        });
        assertInitialDecisionState(root, initial !== null);
        const beforeFacts = mapApprovalFacts(root, actor, {
          returnNotes: null,
          pieceId: null,
          issue: null,
        });
        if (intent.operation === "APPROVE_INITIAL") {
          await tx.salesOrder.update({
            where: { id: orderId },
            data: { status: "APPROVED", approvedAt: occurredAt },
          });
          const changed = await tx.salesOrderPiece.updateMany({
            where: {
              orderId,
              id: { in: root.pieces.map((piece) => piece.id) },
              stage: "AWAITING_APPROVAL",
              workState: "INCOMING",
              issueId: null,
              receivedAt: null,
              cancelledAt: null,
            },
            data: { stage: "CUTTING", workState: "INCOMING" },
          });
          if (changed.count !== root.pieces.length)
            throw new InternalServerError(
              "The initial release did not cover the retained pieces.",
            );
          for (const piece of root.pieces) {
            await openManufacturingVisit(tx, {
              orderId,
              pieceId: piece.id,
              target: "CUTTING",
              origin: {
                kind: "INITIAL_APPROVAL",
                approvalCommandId: commandId,
              },
              occurredAt,
            });
          }
        } else {
          await tx.salesOrder.update({
            where: { id: orderId },
            data: {
              status: "RETURNED",
              currentReturnDecisionId: commandId,
              currentReturnOrderVersion: expectedVersion + 1,
              currentReturnReason: intent.body.reason,
              currentReturnedAt: occurredAt,
            },
          });
        }
        const orderVersion = await this.advanceApprovalOrderVersion(tx, {
          orderId,
          expectedVersion,
          occurredAt,
        });
        const after = await tx.salesDraft.findUniqueOrThrow({
          where: { id: orderId },
          select: SALES_ORDER_SELECT,
        });
        return {
          pieceId: null,
          issueId: null,
          proposalId: null,
          decision: null,
          decisionNotes: null,
          beforeFacts,
          afterFacts: mapApprovalFacts(after, actor, {
            returnNotes:
              intent.operation === "RETURN_INITIAL" ? intent.body.notes : null,
            pieceId: null,
            issue: null,
          }),
          outcome: {
            orderId,
            orderVersion,
            orderStatus:
              intent.operation === "APPROVE_INITIAL" ? "APPROVED" : "RETURNED",
            pieceId: null,
            pieceStage: null,
            pieceWorkState: null,
            issueId: null,
            issueState: null,
            proposalId: null,
          },
        };
      },
    });
  }
  private async advanceApprovalOrderVersion(
    tx: Prisma.TransactionClient,
    input: { orderId: string; expectedVersion: number; occurredAt: Date },
  ): Promise<number> {
    const changed = await tx.salesDraft.updateMany({
      where: {
        id: input.orderId,
        status: "SUBMITTED",
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 }, updatedAt: input.occurredAt },
    });
    if (changed.count !== 1) throw new OrderVersionConflictError();
    return input.expectedVersion + 1;
  }
}
