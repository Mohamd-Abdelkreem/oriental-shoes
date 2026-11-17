import {
  qualityCommandDataSchema,
  qualityPieceContextSchema,
  qualityWorkVisitSchema,
  type QualityCommandData,
  type QualityInspectionSummary,
  type QualityPieceContext,
} from "@template/contracts";
import { Prisma } from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  mapManufacturingPaper,
  type ManufacturingPhysicalPieceRecord,
  type ManufacturingOrderRecord,
} from "../manufacturing/manufacturing.mapper.js";
import { isCurrentQualityWork, qualityActionHints } from "./quality.rules.js";
import type {
  QualityArrivalRecord,
  QualityPieceContextRecord,
} from "./quality.types.js";

export type QualityPhysicalPieceRecord = ManufacturingPhysicalPieceRecord;
export type QualityOrderRecord = ManufacturingOrderRecord;
export const mapQualityPaper = mapManufacturingPaper;
export const QUALITY_ACTOR_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  occurredAt: true,
} as const satisfies Prisma.QualityCommandSelect;
export type QualityActorCommandRecord = Prisma.QualityCommandGetPayload<{
  select: typeof QUALITY_ACTOR_COMMAND_SELECT;
}>;
export const QUALITY_COMMAND_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  occurredAt: true,
  payloadHash: true,
  outcome: true,
} as const satisfies Prisma.QualityCommandSelect;
export type QualityCommandRecord = Prisma.QualityCommandGetPayload<{
  select: typeof QUALITY_COMMAND_SELECT;
}>;
export const QUALITY_APPROVAL_ACTOR_SELECT = {
  commandId: true,
  operation: true,
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  occurredAt: true,
} as const satisfies Prisma.ApprovalCommandSelect;
export type QualityApprovalActorRecord = Prisma.ApprovalCommandGetPayload<{
  select: typeof QUALITY_APPROVAL_ACTOR_SELECT;
}>;
export const QUALITY_VISIT_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  sequence: true,
  originKind: true,
  sourceProductionEventId: true,
  sourceCorrectionId: true,
  enteredAt: true,
  receivedAt: true,
  startedAt: true,
  startedCommandId: true,
  endedAt: true,
  endReason: true,
  endQualityEventId: true,
  endApprovalCommandId: true,
  endAdministrationCommandId: true,
  legacyUnknownStart: true,
  startedCommand: { select: QUALITY_ACTOR_COMMAND_SELECT },
  endQualityEvent: {
    select: {
      id: true,
      commandId: true,
      commandOrder: {
        select: { command: { select: QUALITY_ACTOR_COMMAND_SELECT } },
      },
    },
  },
  endApprovalCommand: { select: QUALITY_APPROVAL_ACTOR_SELECT },
  endAdministrationCommand: {
    select: {
      actorId: true,
      actorFullName: true,
      actorRole: true,
      actorDepartment: true,
    },
  },
} as const satisfies Prisma.QualityWorkVisitSelect;
export type QualityVisitRecord = Prisma.QualityWorkVisitGetPayload<{
  select: typeof QUALITY_VISIT_SELECT;
}>;
export const QUALITY_CORRECTION_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  cycle: true,
  rejectionEventId: true,
  target: true,
  reason: true,
  instructions: true,
  state: true,
  resolvedAt: true,
  resolutionQualityEventId: true,
  resolutionApprovalCommandId: true,
  rejectionEvent: {
    select: {
      id: true,
      commandId: true,
      commandOrder: {
        select: { command: { select: QUALITY_ACTOR_COMMAND_SELECT } },
      },
    },
  },
} as const satisfies Prisma.QualityCorrectionCycleSelect;
export type QualityCorrectionRecord = Prisma.QualityCorrectionCycleGetPayload<{
  select: typeof QUALITY_CORRECTION_SELECT;
}>;
export const QUALITY_ARRIVAL_SELECT = {
  id: true,
  commandId: true,
  orderId: true,
  pieceId: true,
  commandOrder: { select: { command: { select: { occurredAt: true } } } },
} as const satisfies Prisma.ManufacturingPieceEventSelect;
export type QualityArrivalSelectionRecord =
  Prisma.ManufacturingPieceEventGetPayload<{
    select: typeof QUALITY_ARRIVAL_SELECT;
  }>;
export const QUALITY_CURRENT_ISSUE_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  state: true,
  sourceDepartment: true,
  sourceStage: true,
  sourceWorkState: true,
  reason: true,
  notes: true,
  reportedAt: true,
  reportedCommandId: true,
  resumeTarget: true,
  resolvedAt: true,
  resolutionCommandId: true,
} as const satisfies Prisma.ManufacturingIssueSelect;
export type SafeCurrentIssueRecord = Prisma.ManufacturingIssueGetPayload<{
  select: typeof QUALITY_CURRENT_ISSUE_SELECT;
}>;
export const QUALITY_PIECE_EVENT_SELECT = {
  id: true,
  commandId: true,
  orderId: true,
  pieceId: true,
  visitId: true,
  decision: true,
  correctionId: true,
  issueId: true,
  approvalCommandId: true,
  beforeStage: true,
  beforeWorkState: true,
  afterStage: true,
  afterWorkState: true,
} as const satisfies Prisma.QualityPieceEventSelect;
export type QualityPieceEventRecord = Prisma.QualityPieceEventGetPayload<{
  select: typeof QUALITY_PIECE_EVENT_SELECT;
}>;
export const QUALITY_PACKING_SELECT = {
  id: true,
  commandId: true,
  orderId: true,
  cartonCount: true,
  cartonNumbers: true,
  pieces: { take: 201, orderBy: { pieceId: "asc" }, select: { pieceId: true } },
} as const satisfies Prisma.QualityPackingGroupSelect;
export type QualityPackingRecord = Prisma.QualityPackingGroupGetPayload<{
  select: typeof QUALITY_PACKING_SELECT;
}>;

const mapActor = (
  record: Pick<
    QualityCommandRecord,
    "actorId" | "actorFullName" | "actorRole" | "actorDepartment"
  > | null,
) =>
  record === null
    ? null
    : {
        id: record.actorId,
        fullName: record.actorFullName,
        role: record.actorRole,
        department: record.actorDepartment,
      };
export const mapQualityArrival = (
  record: QualityArrivalSelectionRecord,
): QualityArrivalRecord => ({
  eventId: record.id,
  commandId: record.commandId,
  orderId: record.orderId,
  pieceId: record.pieceId,
  occurredAt: record.commandOrder.command.occurredAt,
});
export const mapQualityCommandResult = (
  record: QualityCommandRecord,
  replayed: boolean,
): QualityCommandData => {
  const parsed = qualityCommandDataSchema.safeParse({
    kind: "quality-command",
    replayed,
    receipt: {
      commandId: record.commandId,
      operation: record.operation,
      actor: mapActor(record),
      occurredAt: record.occurredAt.toISOString(),
    },
    outcome: record.outcome,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A retained quality command has an invalid safe result.",
    );
  return parsed.data;
};
export const mapQualityVisit = (visit: QualityVisitRecord) => {
  const terminal = [
    visit.endQualityEvent?.commandOrder.command ?? null,
    visit.endApprovalCommand,
    visit.endAdministrationCommand,
  ].filter((source) => source !== null);
  if (terminal.length !== (visit.endedAt === null ? 0 : 1))
    throw new InternalServerError(
      "A quality visit has invalid terminal provenance.",
    );
  const parsed = qualityWorkVisitSchema.safeParse({
    id: visit.id,
    pieceId: visit.pieceId,
    sequence: visit.sequence,
    originKind: visit.originKind,
    sourceProductionEventId: visit.sourceProductionEventId,
    sourceCorrectionId: visit.sourceCorrectionId,
    enteredAt: visit.enteredAt?.toISOString() ?? null,
    receivedAt: visit.receivedAt?.toISOString() ?? null,
    startedAt: visit.startedAt?.toISOString() ?? null,
    startedBy: mapActor(visit.startedCommand),
    endedAt: visit.endedAt?.toISOString() ?? null,
    endReason: visit.endReason,
    endedBy: mapActor(terminal[0] ?? null),
    legacyUnknownStart: visit.legacyUnknownStart,
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A quality visit has invalid safe provenance.",
    );
  return parsed.data;
};
export const mapQualityPieceContext = (
  record: QualityPieceContextRecord,
  actor: AuthorityAccount,
  latestInspection: QualityInspectionSummary | null,
): QualityPieceContext => {
  const action = record.lastAction,
    cycle = record.correction;
  const parsed = qualityPieceContextSchema.safeParse({
    pieceId: record.piece.id,
    visit: record.visit === null ? null : mapQualityVisit(record.visit),
    lastAction:
      action === null
        ? null
        : {
            eventId: action.eventId,
            commandId: action.commandId,
            operation: action.operation,
            actor: mapActor(action),
            occurredAt: action.occurredAt.toISOString(),
          },
    currentCorrection:
      cycle?.state !== "OPEN"
        ? null
        : {
            id: cycle.id,
            pieceId: cycle.pieceId,
            cycle: cycle.cycle,
            target: cycle.target,
            reason: cycle.reason,
            instructions: cycle.instructions,
            rejectedAt:
              cycle.rejectionEvent.commandOrder.command.occurredAt.toISOString(),
            inspector: mapActor(cycle.rejectionEvent.commandOrder.command),
            phase: !isCurrentQualityWork(record)
              ? "WAITING_CORRECTION"
              : record.piece.workState === "INCOMING"
                ? "AWAITING_REINSPECTION"
                : "INSPECTING",
          },
    latestInspection,
    allowedActions: qualityActionHints(record, actor),
  });
  if (!parsed.success)
    throw new InternalServerError(
      "A quality piece has invalid safe work context.",
    );
  return parsed.data;
};

// The fixed packing/g/c aliases belong to quality read/history projections.
export const qualityPackingSummarySql = Prisma.sql`jsonb_build_object(
 'id',packing.id,'inspectionId',g.event_id,'acceptedPieceIds',(SELECT jsonb_agg(pp.piece_id ORDER BY pp.piece_id) FROM quality_packing_pieces pp WHERE pp.group_id=packing.id),
 'cartonCount',packing.carton_count,'cartonNumbers',packing.carton_numbers,'inspectorNote',g.inspector_note,
 'inspector',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'packedAt',c.occurred_at)`;

// Only positive immutable report membership suppresses a real P04 audit child.
export const qualityReportChildSql = Prisma.sql`(c.operation='REPORT_ISSUE' AND EXISTS (
 SELECT 1 FROM quality_approval_reports link
 JOIN quality_commands parent ON parent.command_id=link.command_id AND parent.operation='REPORT_ISSUES'
 JOIN quality_piece_events member ON member.command_id=link.command_id AND member.order_id=link.order_id AND member.piece_id=link.piece_id
 WHERE link.approval_command_id=c.command_id AND link.order_id=c.order_id AND link.piece_id=c.piece_id
 AND member.approval_command_id=c.command_id AND member.issue_id=c.issue_id))`;
export const qualitySummarySql = Prisma.sql`jsonb_build_object(
 'id',g.event_id,'commandId',c.command_id,'orderId',g.order_id,'orderVersion',g.after_version,
 'businessNumber',h.business_number,'department','QUALITY','operation',c.operation,
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,
 'pieces',(SELECT original->'pieces' FROM jsonb_array_elements(c.outcome->'orders') original WHERE original->>'eventId'=g.event_id::text),
 'correctionLinks',coalesce((SELECT jsonb_agg(jsonb_build_object('pieceId',links.piece_id,'correctionId',links.correction_id,'cycle',links.cycle,'action',links.action) ORDER BY links.piece_id,links.cycle,links.action) FROM (
  SELECT event.piece_id,cycle.id AS correction_id,cycle.cycle,'OPENED'::text AS action FROM quality_piece_events event
   JOIN quality_correction_cycles cycle ON cycle.rejection_event_id=event.id AND cycle.order_id=event.order_id AND cycle.piece_id=event.piece_id
   WHERE event.command_id=g.command_id AND event.order_id=g.order_id AND c.operation='INSPECT'
  UNION ALL SELECT event.piece_id,cycle.id,cycle.cycle,cycle.state::text FROM quality_piece_events event
   JOIN quality_correction_cycles cycle ON cycle.resolution_quality_event_id=event.id AND cycle.order_id=event.order_id AND cycle.piece_id=event.piece_id
   WHERE event.command_id=g.command_id AND event.order_id=g.order_id AND c.operation='INSPECT' AND cycle.state IN ('ACCEPTED','REJECTED')
  UNION ALL SELECT event.piece_id,cycle.id,cycle.cycle,'REINSPECTION_STARTED' FROM quality_piece_events event
   JOIN quality_work_visits visit ON visit.id=event.visit_id AND visit.order_id=event.order_id AND visit.piece_id=event.piece_id AND visit.started_command_id=event.command_id
   JOIN quality_correction_cycles cycle ON cycle.id=visit.source_correction_id AND cycle.order_id=visit.order_id AND cycle.piece_id=visit.piece_id
   WHERE event.command_id=g.command_id AND event.order_id=g.order_id AND c.operation='RECEIVE_AND_START'
 ) links),'[]'::jsonb),
 'inspection',CASE WHEN c.operation='INSPECT' THEN jsonb_build_object(
 'decisions',(SELECT jsonb_agg(CASE WHEN event.decision='ACCEPT' THEN jsonb_build_object('pieceId',event.piece_id,'decision','ACCEPT') ELSE jsonb_build_object('pieceId',event.piece_id,'decision','REJECT','target',cycle.target,'reason',cycle.reason,'instructions',cycle.instructions) END ORDER BY event.piece_id)
 FROM quality_piece_events event LEFT JOIN quality_correction_cycles cycle ON cycle.rejection_event_id=event.id AND cycle.order_id=event.order_id AND cycle.piece_id=event.piece_id WHERE event.command_id=g.command_id AND event.order_id=g.order_id),
 'inspectorNote',g.inspector_note,'packing',(SELECT ${qualityPackingSummarySql} FROM quality_packing_groups packing WHERE packing.command_id=g.command_id AND packing.order_id=g.order_id)) ELSE NULL END,
 'report',CASE WHEN c.operation='REPORT_ISSUES' THEN (SELECT jsonb_build_object('reason',issue.reason,'notes',issue.notes) FROM quality_piece_events event JOIN manufacturing_issues issue ON issue.id=event.issue_id AND issue.order_id=event.order_id AND issue.piece_id=event.piece_id WHERE event.command_id=g.command_id AND event.order_id=g.order_id ORDER BY event.piece_id LIMIT 1) ELSE NULL END)`;
