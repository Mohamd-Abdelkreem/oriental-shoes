import {
  factoryOrderPaperDataSchema,
  manufacturingCommandDataSchema,
  manufacturingPieceContextSchema,
  manufacturingWorkVisitSchema,
  type FactoryOrderPaperData,
  type ManufacturingCommandData,
  type ManufacturingDepartment,
  type ManufacturingPieceContext,
} from "@template/contracts";
import { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import { deriveOrderCounts } from "../sales-orders/sales-orders.rules.js";
import {
  isReturnedManufacturingWork,
  manufacturingActionHints,
} from "./manufacturing.rules.js";
import type { ManufacturingPieceContextRecord } from "./manufacturing.types.js";

export const MANUFACTURING_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  department: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  payloadHash: true,
  outcome: true,
  occurredAt: true,
} satisfies Prisma.ManufacturingCommandSelect;
export type ManufacturingCommandRecord = Prisma.ManufacturingCommandGetPayload<{
  select: typeof MANUFACTURING_COMMAND_SELECT;
}>;

const WORK_ACTOR_SELECT = {
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
} as const;
type WorkActorRecord = Pick<
  ManufacturingCommandRecord,
  "actorId" | "actorFullName" | "actorRole" | "actorDepartment"
>;
const mapWorkActor = (command: WorkActorRecord | null) =>
  command === null
    ? null
    : {
        id: command.actorId,
        fullName: command.actorFullName,
        role: command.actorRole,
        department: command.actorDepartment,
      };

export const MANUFACTURING_VISIT_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  department: true,
  sequence: true,
  originKind: true,
  sourceDepartment: true,
  sourceApprovalCommandId: true,
  sourceTransferEventId: true,
  sourceIssueId: true,
  sourceReferenceId: true,
  sourceCorrectionCycle: true,
  sourceOrderVersion: true,
  instructions: true,
  enteredAt: true,
  receivedAt: true,
  receivedCommandId: true,
  startedAt: true,
  startedCommandId: true,
  endedAt: true,
  endReason: true,
  endManufacturingCommandId: true,
  endApprovalCommandId: true,
  destination: true,
  legacyUnknownStart: true,
  receivedCommand: { select: WORK_ACTOR_SELECT },
  startedCommand: { select: WORK_ACTOR_SELECT },
  endManufacturingCommand: { select: WORK_ACTOR_SELECT },
  endApprovalCommand: { select: WORK_ACTOR_SELECT },
} as const satisfies Prisma.ManufacturingWorkVisitSelect;
export type ManufacturingVisitRecord = Prisma.ManufacturingWorkVisitGetPayload<{
  select: typeof MANUFACTURING_VISIT_SELECT;
}>;

export const MANUFACTURING_PHYSICAL_PIECE_SELECT = {
  id: true,
  orderId: true,
  stage: true,
  workState: true,
  issueId: true,
  receivedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  currentWorkVisitId: true,
} as const satisfies Prisma.SalesOrderPieceSelect;
export type ManufacturingPhysicalPieceRecord =
  Prisma.SalesOrderPieceGetPayload<{
    select: typeof MANUFACTURING_PHYSICAL_PIECE_SELECT;
  }>;

export const MANUFACTURING_ORDER_SELECT = {
  id: true,
  status: true,
  version: true,
  type: true,
  deliveryDate: true,
  generalNotes: true,
  repairNote: true,
  adjustmentRequested: true,
  adjustmentReason: true,
  adjustmentActionTaken: true,
  order: {
    select: {
      id: true,
      status: true,
      businessNumber: true,
      customerName: true,
    },
  },
  pieces: {
    where: { removedAt: null },
    take: 201,
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
      orderPiece: { select: MANUFACTURING_PHYSICAL_PIECE_SELECT },
    },
  },
} as const satisfies Prisma.SalesDraftSelect;
export type ManufacturingOrderRecord = Prisma.SalesDraftGetPayload<{
  select: typeof MANUFACTURING_ORDER_SELECT;
}>;

export const mapManufacturingCommandResult = (
  record: ManufacturingCommandRecord,
  replayed: boolean,
): ManufacturingCommandData => {
  const parsed = manufacturingCommandDataSchema.safeParse({
    kind: "manufacturing-command",
    replayed,
    receipt: {
      commandId: record.commandId,
      operation: record.operation,
      department: record.department,
      actor: mapWorkActor(record),
      occurredAt: record.occurredAt.toISOString(),
    },
    outcome: record.outcome,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A retained manufacturing command has an invalid safe result.",
    );
  return parsed.data;
};

const mapVisit = (visit: ManufacturingVisitRecord) => {
  const parsed = manufacturingWorkVisitSchema.safeParse({
    id: visit.id,
    pieceId: visit.pieceId,
    department: visit.department,
    sequence: visit.sequence,
    origin: {
      kind: visit.originKind,
      sourceDepartment: visit.sourceDepartment,
      eventId: visit.sourceApprovalCommandId ?? visit.sourceTransferEventId,
      issueId: visit.sourceIssueId,
      referenceId: visit.sourceReferenceId,
      correctionCycle: visit.sourceCorrectionCycle,
      instructions: visit.instructions,
    },
    enteredAt: visit.enteredAt?.toISOString() ?? null,
    receivedAt: visit.receivedAt?.toISOString() ?? null,
    startedAt: visit.startedAt?.toISOString() ?? null,
    endedAt: visit.endedAt?.toISOString() ?? null,
    receivedBy: mapWorkActor(visit.receivedCommand),
    startedBy: mapWorkActor(visit.startedCommand),
    endedBy: mapWorkActor(
      visit.endManufacturingCommand ?? visit.endApprovalCommand,
    ),
    endReason: visit.endReason,
    destination: visit.destination,
    legacyUnknownStart: visit.legacyUnknownStart,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A manufacturing visit has invalid safe provenance.",
    );
  return parsed.data;
};

export const mapManufacturingPieceContext = (
  record: ManufacturingPieceContextRecord,
  actor: AuthorityAccount,
  department: ManufacturingDepartment,
): ManufacturingPieceContext => {
  const action = record.lastAction;
  const parsed = manufacturingPieceContextSchema.safeParse({
    pieceId: record.piece.id,
    visit: record.visit === null ? null : mapVisit(record.visit),
    lastAction:
      action === null
        ? null
        : {
            eventId: action.eventId,
            commandId: action.commandId,
            operation: action.operation,
            actor: mapWorkActor(action),
            occurredAt: action.occurredAt.toISOString(),
          },
    isReturned: isReturnedManufacturingWork(record, department),
    allowedActions: manufacturingActionHints(record, actor, department),
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A manufacturing piece has invalid safe work context.",
    );
  return parsed.data;
};

export const mapManufacturingPaperPiece = (
  piece: ManufacturingOrderRecord["pieces"][number],
  orderId: string,
) => {
  const physical = piece.orderPiece;
  if (
    physical === null ||
    physical.id !== piece.id ||
    physical.orderId !== orderId ||
    piece.quantity !== 1
  )
    throw new InternalServerError(
      "A manufacturing piece has inconsistent physical membership.",
    );
  return {
    id: piece.id,
    position: piece.position,
    quantity: piece.quantity,
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
    stage: physical.stage,
    workState: physical.workState,
    receivedAt: physical.receivedAt?.toISOString() ?? null,
    cancelledAt: physical.cancelledAt?.toISOString() ?? null,
    cancellationReason: physical.cancellationReason,
  };
};

export const mapManufacturingPaper = (
  record: ManufacturingOrderRecord,
  issues: FactoryOrderPaperData["issues"],
): FactoryOrderPaperData => {
  const header = record.order;
  if (
    record.status !== "SUBMITTED" ||
    header === null ||
    header.id !== record.id
  )
    throw new InternalServerError(
      "A manufacturing order has no valid submitted header.",
    );
  const pieces = record.pieces.map((piece) =>
    mapManufacturingPaperPiece(piece, record.id),
  );
  const parsed = factoryOrderPaperDataSchema.safeParse({
    order: {
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
    },
    issues,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A manufacturing order has invalid safe paper fields.",
    );
  return parsed.data;
};

// Aliases c/g/h are fixed owners shared with the existing upstream activity query.
export const manufacturingSummarySql = Prisma.sql`jsonb_build_object(
 'id',g.event_id,'commandId',c.command_id,'orderId',g.order_id,'orderVersion',g.after_version,
 'businessNumber',h.business_number,'department',c.department,'operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'pieces',(SELECT o->'pieces' FROM jsonb_array_elements(c.outcome->'orders') o WHERE o->>'orderId'=g.order_id::text),
 'destination',CASE WHEN c.operation='COMPLETE_TRANSFER' THEN CASE WHEN c.department='CUTTING' THEN 'PRODUCTION' ELSE 'QUALITY' END ELSE NULL END)`;
