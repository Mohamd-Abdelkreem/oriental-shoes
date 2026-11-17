import {
  administrationCommandDataSchema,
  type AdministrationCommandData,
} from "@template/contracts";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { Prisma } from "@template/database";
import {
  administrationOrderSummarySchema,
  type AdministrationOrderSummary,
} from "@template/contracts";
import {
  SALES_ORDER_SELECT,
  SALES_ORDER_FINANCIAL_SELECT,
  mapSalesOrderSummary,
} from "../sales-orders/sales-orders.mapper.js";
import {
  APPROVAL_STAMP_SELECT,
  mapApprovalStamp,
} from "../approval/approval.queries.js";
import { getApprovalPrintEligibility } from "../approval/approval.rules.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import type {
  AdministrationAggregateFacts,
  AdministrationSummaryRecord,
} from "./administration.types.js";
import { isAdministrationCancellationEligible } from "./administration.rules.js";

export const ADMINISTRATION_ORDER_SELECT = {
  ...SALES_ORDER_SELECT,
  order: {
    select: {
      ...SALES_ORDER_SELECT.order.select,
      administrationCorrections: {
        take: 1,
        orderBy: [{ afterVersion: "desc" }, { commandId: "desc" }],
        select: {
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          customerAddress: true,
          afterVersion: true,
          commandId: true,
          changedFields: true,
          command: {
            select: {
              actorId: true,
              actorFullName: true,
              actorRole: true,
              actorDepartment: true,
              reason: true,
              occurredAt: true,
            },
          },
        },
      },
      approvalCommands: {
        where: { operation: "APPROVE_INITIAL" },
        take: 1,
        orderBy: { afterVersion: "asc" },
        select: APPROVAL_STAMP_SELECT,
      },
      warehouseCommandOrders: {
        where: { attempt: { isNot: null } },
        take: 1,
        orderBy: { afterVersion: "desc" },
        select: {
          attempt: {
            select: {
              id: true,
              members: {
                orderBy: { pieceId: "asc" },
                take: 200,
                select: { pieceId: true },
              },
              outcome: { select: { kind: true, returnedToWarehouse: true } },
              retry: { select: { id: true } },
            },
          },
        },
      },
    },
  },
  pieces: {
    ...SALES_ORDER_SELECT.pieces,
    take: 200,
    select: {
      ...SALES_ORDER_SELECT.pieces.select,
      orderPiece: {
        select: {
          ...SALES_ORDER_SELECT.pieces.select.orderPiece.select,
          currentWorkVisitId: true,
          currentIssue: {
            select: {
              id: true,
              state: true,
              latestProposalId: true,
              resumeTarget: true,
            },
          },
          qualityVisits: {
            where: { endedAt: null },
            take: 1,
            select: { id: true },
          },
          qualityCorrections: {
            where: { state: "OPEN" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  },
} as const satisfies Prisma.SalesDraftSelect;

export const ADMINISTRATION_SUMMARY_SELECT = {
  ...ADMINISTRATION_ORDER_SELECT,
  pieces: {
    ...SALES_ORDER_FINANCIAL_SELECT.pieces,
    take: 200,
    select: {
      ...SALES_ORDER_FINANCIAL_SELECT.pieces.select,
      orderPiece: {
        select: {
          ...SALES_ORDER_FINANCIAL_SELECT.pieces.select.orderPiece.select,
          workState: true,
          issueId: true,
          cancelledAt: true,
          currentIssue:
            ADMINISTRATION_ORDER_SELECT.pieces.select.orderPiece.select
              .currentIssue,
          qualityCorrections:
            ADMINISTRATION_ORDER_SELECT.pieces.select.orderPiece.select
              .qualityCorrections,
        },
      },
    },
  },
} as const satisfies Prisma.SalesDraftSelect;

export const mapAdministrationActions = (
  record: AdministrationSummaryRecord,
): AdministrationOrderSummary["adminActions"] => {
  const stamp = record.order?.approvalCommands[0];
  const issues = record.pieces.flatMap((piece) =>
    piece.orderPiece?.currentIssue ? [piece.orderPiece.currentIssue] : [],
  );
  return {
    canCancel: isAdministrationCancellationEligible(record),
    canCorrect: record.status === "SUBMITTED" && record.order !== null,
    canPrint: getApprovalPrintEligibility(
      record,
      stamp ? mapApprovalStamp(stamp) : null,
      issues,
    ).allowed,
  };
};
export const mapAdministrationOrderSummary = (
  record: AdministrationSummaryRecord,
  actor: AuthorityAccount,
  facts: AdministrationAggregateFacts,
): AdministrationOrderSummary =>
  administrationOrderSummarySchema.parse({
    ...mapSalesOrderSummary(record, actor),
    currentDepartments: facts.currentDepartments,
    isOverdue: facts.isOverdue,
    hasQualityCorrectionHistory: facts.hasQualityCorrectionHistory,
    hasOpenQualityCorrection: facts.hasOpenQualityCorrection,
    adminActions: mapAdministrationActions(record),
  });

export const ADMINISTRATION_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  orderId: true,
  expectedVersion: true,
  payloadHash: true,
  outcome: true,
} as const satisfies Prisma.AdministrationCommandSelect;
export type AdministrationCommandRecord =
  Prisma.AdministrationCommandGetPayload<{
    select: typeof ADMINISTRATION_COMMAND_SELECT;
  }>;
export const mapAdministrationCommandResult = (
  record: AdministrationCommandRecord,
  replayed: boolean,
): AdministrationCommandData => {
  const parsed = administrationCommandDataSchema.safeParse(record.outcome);
  if (
    !parsed.success ||
    parsed.data.receipt.commandId !== record.commandId ||
    parsed.data.receipt.operation !== record.operation ||
    parsed.data.receipt.actor.id !== record.actorId ||
    parsed.data.receipt.orderId !== record.orderId ||
    parsed.data.receipt.beforeVersion !== record.expectedVersion
  )
    throw new InternalServerError(
      "The retained administration result is inconsistent.",
    );
  return { ...parsed.data, replayed };
};
