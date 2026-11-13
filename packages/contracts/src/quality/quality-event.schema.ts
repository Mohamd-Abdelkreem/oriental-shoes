import { z } from "zod";
import { approvalActorSchema } from "../approval/approval-command.schema.ts";
import { nonEmptyBoundedString } from "../http/http.schema.ts";
import {
  MAX_DRAFT_PIECES,
  salesInstantSchema,
  salesUuidSchema,
  salesVersionSchema,
} from "../sales-drafts/sales-draft-values.schema.ts";
import { salesBusinessNumberSchema } from "../sales-orders/sales-order-values.schema.ts";
import {
  qualityCommandDataSchema,
  qualityCommandOperationSchema,
  qualityInspectionDecisionSchema,
  qualityPieceOutcomeSchema,
} from "./quality-command.schema.ts";

const recordedTextSchema = nonEmptyBoundedString(4000);
const qualityActorSchema = approvalActorSchema.refine(
  (actor) => actor.role === "ADMIN" || actor.department === "QUALITY",
  "Quality action actor is required",
);
export const qualityPackingGroupSchema = z
  .object({
    id: salesUuidSchema,
    inspectionId: salesUuidSchema,
    acceptedPieceIds: z.array(salesUuidSchema).min(1).max(MAX_DRAFT_PIECES),
    cartonCount: recordedTextSchema.nullable(),
    cartonNumbers: recordedTextSchema.nullable(),
    inspectorNote: recordedTextSchema.nullable(),
    inspector: qualityActorSchema,
    packedAt: salesInstantSchema,
  })
  .strict()
  .refine(
    (group) =>
      new Set(group.acceptedPieceIds).size === group.acceptedPieceIds.length &&
      (group.cartonCount !== null || group.cartonNumbers !== null),
    "Packing must have distinct accepted identities and actual carton text",
  );

export const qualityInspectionSummarySchema = z
  .object({
    decisionId: salesUuidSchema,
    inspectionId: salesUuidSchema,
    visitId: salesUuidSchema,
    decision: z.enum(["ACCEPT", "REJECT"]),
    inspector: qualityActorSchema,
    inspectedAt: salesInstantSchema,
    inspectorNote: recordedTextSchema.nullable(),
    packingGroupId: salesUuidSchema.nullable(),
    correctionId: salesUuidSchema.nullable(),
  })
  .strict()
  .refine(
    (inspection) =>
      inspection.decision === "ACCEPT" ||
      (inspection.correctionId !== null && inspection.packingGroupId === null),
    "Rejection must link its correction and cannot have accepted packing",
  );

export const qualityCorrectionEventLinkSchema = z
  .object({
    pieceId: salesUuidSchema,
    correctionId: salesUuidSchema,
    cycle: salesVersionSchema,
    action: z.enum(["OPENED", "REINSPECTION_STARTED", "ACCEPTED", "REJECTED"]),
  })
  .strict();

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  new Set(left).size === left.length &&
  new Set(right).size === right.length &&
  left.every((id) => right.includes(id));
const inspectionEventSchema = z
  .object({
    decisions: z
      .array(qualityInspectionDecisionSchema)
      .min(1)
      .max(MAX_DRAFT_PIECES),
    inspectorNote: recordedTextSchema.nullable(),
    packing: qualityPackingGroupSchema.nullable(),
  })
  .strict();
const reportEventSchema = z
  .object({
    reason: recordedTextSchema,
    notes: recordedTextSchema.nullable(),
  })
  .strict();
const activityEventShapeSchema = z
  .object({
    id: salesUuidSchema,
    commandId: salesUuidSchema,
    orderId: salesUuidSchema,
    orderVersion: salesVersionSchema,
    businessNumber: salesBusinessNumberSchema,
    department: z.literal("QUALITY"),
    operation: qualityCommandOperationSchema,
    actor: qualityActorSchema,
    occurredAt: salesInstantSchema,
    pieces: z.array(qualityPieceOutcomeSchema).min(1).max(MAX_DRAFT_PIECES),
    correctionLinks: z
      .array(qualityCorrectionEventLinkSchema)
      .max(MAX_DRAFT_PIECES * 2),
    inspection: inspectionEventSchema.nullable(),
    report: reportEventSchema.nullable(),
  })
  .strict();
type ActivityEventShape = z.infer<typeof activityEventShapeSchema>;

const hasBoundInspection = (event: ActivityEventShape): boolean => {
  if (event.operation !== "INSPECT") return event.inspection === null;
  if (
    event.inspection === null ||
    !sameIds(
      event.pieces.map((piece) => piece.pieceId),
      event.inspection.decisions.map((decision) => decision.pieceId),
    )
  )
    return false;
  if (
    !event.inspection.decisions.every((decision) => {
      const piece = event.pieces.find(
        (outcome) => outcome.pieceId === decision.pieceId,
      );
      return (
        piece?.decision === decision.decision &&
        (decision.decision === "ACCEPT" || piece.stage === decision.target)
      );
    })
  )
    return false;
  const packing = event.inspection.packing;
  return (
    packing === null ||
    (packing.inspectionId === event.id &&
      packing.inspectorNote === event.inspection.inspectorNote &&
      packing.packedAt === event.occurredAt &&
      packing.inspector.id === event.actor.id &&
      packing.inspector.fullName === event.actor.fullName &&
      packing.inspector.role === event.actor.role &&
      packing.inspector.department === event.actor.department &&
      sameIds(
        packing.acceptedPieceIds,
        event.pieces
          .filter((piece) => piece.decision === "ACCEPT")
          .map((piece) => piece.pieceId),
      ))
  );
};

const hasBoundCorrectionLinks = (event: ActivityEventShape): boolean => {
  const keys = event.correctionLinks.map((link) =>
    JSON.stringify([link.pieceId, link.correctionId, link.action]),
  );
  if (
    new Set(keys).size !== keys.length ||
    event.correctionLinks.some(
      (link) => !event.pieces.some((piece) => piece.pieceId === link.pieceId),
    )
  )
    return false;
  return event.pieces.every((piece) => {
    const links = event.correctionLinks.filter(
      (link) => link.pieceId === piece.pieceId,
    );
    if (event.operation === "CONTINUE" || event.operation === "REPORT_ISSUES")
      return links.length === 0;
    if (event.operation === "RECEIVE_AND_START" || piece.decision === "ACCEPT")
      return piece.correctionId === null
        ? links.length === 0
        : links.length === 1 &&
            links[0]?.correctionId === piece.correctionId &&
            links[0].action ===
              (event.operation === "INSPECT"
                ? "ACCEPTED"
                : "REINSPECTION_STARTED");
    const opened = links.find((link) => link.action === "OPENED");
    if (opened === undefined || opened.correctionId !== piece.correctionId)
      return false;
    if (links.length === 1) return opened.cycle === 1;
    const rejected = links.find((link) => link.action === "REJECTED");
    return (
      links.length === 2 &&
      rejected !== undefined &&
      rejected.correctionId !== opened.correctionId &&
      rejected.cycle + 1 === opened.cycle
    );
  });
};
export const qualityActivityEventSchema = activityEventShapeSchema.refine(
  (event) => {
    const delta = event.operation === "REPORT_ISSUES" ? event.pieces.length : 1;
    return (
      (event.operation === "REPORT_ISSUES"
        ? event.report !== null
        : event.report === null) &&
      hasBoundInspection(event) &&
      hasBoundCorrectionLinks(event) &&
      qualityCommandDataSchema.safeParse({
        kind: "quality-command",
        replayed: true,
        receipt: {
          commandId: event.commandId,
          operation: event.operation,
          actor: event.actor,
          occurredAt: event.occurredAt,
        },
        outcome: {
          orders: [
            {
              eventId: event.id,
              orderId: event.orderId,
              beforeVersion: event.orderVersion - delta,
              afterVersion: event.orderVersion,
              pieces: event.pieces,
              packingGroupId: event.inspection?.packing?.id ?? null,
            },
          ],
        },
      }).success
    );
  },
  "Quality history must bind the complete original inspection, packing, operation and correction links",
);

export type QualityPackingGroup = z.infer<typeof qualityPackingGroupSchema>;
export type QualityInspectionSummary = z.infer<
  typeof qualityInspectionSummarySchema
>;
export type QualityCorrectionEventLink = z.infer<
  typeof qualityCorrectionEventLinkSchema
>;
export type QualityActivityEvent = z.infer<typeof qualityActivityEventSchema>;
