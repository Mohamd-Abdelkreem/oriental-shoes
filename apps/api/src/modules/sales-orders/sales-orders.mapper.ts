import {
  salesOrderSummarySchema,
  type SalesOrderSummary,
} from "@template/contracts";
import type {
  FactoryOrderProjection,
  PieceCatalogSelections,
  SalesOrderDto,
} from "@template/contracts";
import type { Prisma } from "@template/database";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  calculateOrderMoney,
  deriveOrderCounts,
  formatMoneyCents,
  MAX_ORDER_TOTAL_CENTS,
  parseMoneyCents,
} from "./sales-orders.rules.js";

export const SALES_ORDER_SELECT = {
  id: true,
  version: true,
  status: true,
  ownerId: true,
  customerId: true,
  type: true,
  deliveryDate: true,
  generalNotes: true,
  responsibleSignature: true,
  repairNote: true,
  adjustmentRequested: true,
  adjustmentReason: true,
  adjustmentActionTaken: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  order: {
    select: {
      id: true,
      status: true,
      businessNumber: true,
      numberSequence: true,
      numberYear: true,
      submittedAt: true,
      submittedById: true,
      ownerFullNameAtSubmission: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      customerAddress: true,
      catalogSourceId: true,
      totalAmount: true,
      paidAmount: true,
      approvedAt: true,
      currentReturnDecisionId: true,
      currentReturnOrderVersion: true,
      currentReturnReason: true,
      currentReturnedAt: true,
    },
  },
  pieces: {
    where: { removedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      position: true,
      quantity: true,
      model: true,
      size: true,
      leatherBase: true,
      decoration: true,
      decorationColor: true,
      faceRight: true,
      faceLeft: true,
      mixing: true,
      face: true,
      sole: true,
      soleAddition: true,
      soleColor: true,
      additions: true,
      aField: true,
      fField: true,
      sideNotes: true,
      catalogSelections: { select: { field: true, entryId: true } },
      orderPiece: {
        select: {
          id: true,
          orderId: true,
          decorationEntryId: true,
          priceSourceId: true,
          decorationLabel: true,
          unitPrice: true,
          priceSourceCell: true,
          stage: true,
          workState: true,
          issueId: true,
          receivedAt: true,
          cancelledAt: true,
          cancellationReason: true,
        },
      },
    },
  },
} as const satisfies Prisma.SalesDraftSelect;
export type SalesOrderRecord = Prisma.SalesDraftGetPayload<{
  select: typeof SALES_ORDER_SELECT;
}>;
type SelectedPiece = SalesOrderRecord["pieces"][number];
const submittedHeader = (record: SalesOrderRecord) => {
  if (
    record.status !== "SUBMITTED" ||
    record.order === null ||
    record.order.id !== record.id ||
    record.customerId === null ||
    record.pieces.length < 1 ||
    record.pieces.length > 200
  )
    throw new InternalServerError("The submitted order graph is inconsistent.");
  return record.order;
};
const physicalPiece = (piece: SelectedPiece, orderId: string) => {
  const terms = piece.orderPiece;
  if (
    terms === null ||
    terms.id !== piece.id ||
    terms.orderId !== orderId ||
    piece.quantity !== 1
  )
    throw new InternalServerError(
      "A submitted piece has inconsistent identity or terms.",
    );
  return {
    id: piece.id,
    position: piece.position,
    quantity: 1 as const,
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    decoration: piece.decoration,
    decorationColor: piece.decorationColor,
    faceRight: piece.faceRight,
    faceLeft: piece.faceLeft,
    mixing: piece.mixing,
    face: piece.face,
    sole: piece.sole,
    soleAddition: piece.soleAddition,
    soleColor: piece.soleColor,
    additions: piece.additions,
    aField: piece.aField,
    fField: piece.fField,
    sideNotes: piece.sideNotes,
    stage: terms.stage,
    workState: terms.workState,
    receivedAt: terms.receivedAt?.toISOString() ?? null,
    cancelledAt: terms.cancelledAt?.toISOString() ?? null,
    cancellationReason: terms.cancellationReason,
  };
};
const selectedReferences = (piece: SelectedPiece): PieceCatalogSelections => {
  const selections: PieceCatalogSelections = {};
  for (const selection of piece.catalogSelections)
    selections[selection.field] = selection.entryId;
  return selections;
};
export const deriveSalesOrderActions = (
  order: {
    ownerId: string;
    status: SalesOrderDto["status"];
    approvedAt: Date | null;
    currentReturn: boolean;
  },
  actor: Pick<AuthorityAccount, "id" | "role" | "department">,
) => ({
  canResubmit:
    order.ownerId === actor.id &&
    (actor.role === "ADMIN" || actor.department === "SALES") &&
    order.currentReturn,
  canSetPaid:
    (actor.role === "ADMIN" ||
      (actor.department === "SALES" && order.ownerId === actor.id)) &&
    order.approvedAt !== null &&
    order.status !== "RETURNED" &&
    order.status !== "AWAITING_APPROVAL",
});

export const mapSalesOrder = (
  record: SalesOrderRecord,
  actor: AuthorityAccount,
): SalesOrderDto => {
  const header = submittedHeader(record),
    customerId = record.customerId;
  if (customerId === null)
    throw new InternalServerError(
      "A submitted order is missing its customer identity.",
    );
  const pieces = record.pieces.map((piece) => {
    const captured = physicalPiece(piece, record.id),
      terms = piece.orderPiece;
    if (terms === null)
      throw new InternalServerError("A submitted piece has no frozen terms.");
    return {
      ...captured,
      ...(piece.catalogSelections.length === 0
        ? {}
        : { catalogSelections: selectedReferences(piece) }),
      decorationEntryId: terms.decorationEntryId,
      catalogSourceId: terms.priceSourceId,
      unitPrice: formatMoneyCents(
        parseMoneyCents(serializeDecimalToString(terms.unitPrice)),
      ),
    };
  });
  const money = calculateOrderMoney(
    pieces
      .filter((piece) => piece.stage !== "CANCELLED")
      .map((piece) => parseMoneyCents(piece.unitPrice)),
    parseMoneyCents(serializeDecimalToString(header.paidAmount)),
  );
  if (
    parseMoneyCents(
      serializeDecimalToString(header.totalAmount),
      MAX_ORDER_TOTAL_CENTS,
    ) !== parseMoneyCents(money.total, MAX_ORDER_TOTAL_CENTS)
  )
    throw new InternalServerError("A submitted order has inconsistent totals.");
  const currentReturn =
    header.status === "RETURNED" &&
    header.currentReturnDecisionId !== null &&
    header.currentReturnOrderVersion === record.version &&
    header.currentReturnReason !== null &&
    header.currentReturnedAt !== null;
  return {
    id: record.id,
    version: record.version,
    owner: { id: record.ownerId, fullName: header.ownerFullNameAtSubmission },
    type: record.type,
    status: header.status,
    businessNumber: header.businessNumber,
    businessYear: header.numberYear,
    sequence: header.numberSequence.toString(),
    customerId,
    customerSnapshot: {
      name: header.customerName,
      phone: header.customerPhone,
      email: header.customerEmail,
      address: header.customerAddress,
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    submittedAt: header.submittedAt.toISOString(),
    deliveryDate: serializeNullableDateOnly(record.deliveryDate),
    generalNotes: record.generalNotes,
    responsibleSignature: record.responsibleSignature,
    repairNote: record.repairNote,
    adjustmentRequested: record.adjustmentRequested,
    adjustmentReason: record.adjustmentReason,
    adjustmentActionTaken: record.adjustmentActionTaken,
    money,
    counts: deriveOrderCounts(pieces),
    approval: {
      approvedAt: header.approvedAt?.toISOString() ?? null,
      returnDecisionId: header.currentReturnDecisionId,
      returnedAt: header.currentReturnedAt?.toISOString() ?? null,
      returnReason: header.currentReturnReason,
      returnRevision: header.currentReturnOrderVersion ?? 0,
    },
    allowedActions: deriveSalesOrderActions(
      {
        ownerId: record.ownerId,
        status: header.status,
        approvedAt: header.approvedAt,
        currentReturn,
      },
      actor,
    ),
    pieces,
  };
};
export const mapFactoryOrder = (
  record: SalesOrderRecord,
): FactoryOrderProjection => {
  const header = submittedHeader(record);
  const pieces = record.pieces.map((piece) => physicalPiece(piece, record.id));
  return {
    id: record.id,
    version: record.version,
    type: record.type,
    status: header.status,
    businessNumber: header.businessNumber,
    customerName: header.customerName,
    deliveryDate: serializeNullableDateOnly(record.deliveryDate),
    generalNotes: record.generalNotes,
    repairNote: record.repairNote,
    adjustmentRequested: record.adjustmentRequested,
    adjustmentReason: record.adjustmentReason,
    adjustmentActionTaken: record.adjustmentActionTaken,
    counts: deriveOrderCounts(pieces),
    pieces,
  };
};

export const mapSalesOrderSummary = (
  record: SalesOrderRecord,
  actor: AuthorityAccount,
): SalesOrderSummary => {
  const order = mapSalesOrder(record, actor);
  return salesOrderSummarySchema.strip().parse({
    ...order,
    returnInfo:
      order.status === "RETURNED"
        ? {
            reason: order.approval.returnReason,
            returnedAt: order.approval.returnedAt,
          }
        : null,
  });
};
