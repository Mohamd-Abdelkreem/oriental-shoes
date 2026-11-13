import {
  MAX_DRAFT_PIECES,
  qualityCommandBodySchema,
  salesUuidSchema,
  type QualityCommandBody,
  type QualityOrderData,
} from "@template/contracts";
import {
  qualityInspectionFormSchema,
  type QualityInspectionFormValues,
} from "./quality-form.model";
import { QualityLocalCommandError } from "./quality-command-state";
import type { QualityWorkRow, QualityPieceTarget } from "./quality-view.model";

const localCommandId = "00000000-0000-4000-8000-000000000000";
const assertRow = (row: QualityWorkRow) => {
  if (
    row.target.orderId !== row.order.id ||
    row.target.expectedVersion !== row.order.version ||
    row.target.pieceId !== row.piece.id ||
    row.work.pieceId !== row.piece.id
  )
    throw new QualityLocalCommandError("MISMATCH");
};
export const captureQualitySelection = (
  operation: "RECEIVE_AND_START" | "CONTINUE" | "REPORT_ISSUES",
  rows: readonly QualityWorkRow[],
): Extract<
  QualityCommandBody,
  { operation: "RECEIVE_AND_START" }
>["orders"] => {
  const groups = new Map<
    string,
    { orderId: string; expectedVersion: number; pieceIds: string[] }
  >();
  for (const row of rows) {
    assertRow(row);
    const allowed =
      operation === "RECEIVE_AND_START"
        ? row.work.allowedActions.canReceiveAndStart
        : operation === "CONTINUE"
          ? row.work.allowedActions.canContinue
          : row.work.allowedActions.canReportIssue;
    if (
      !allowed ||
      row.piece.stage !== "QUALITY" ||
      row.piece.receivedAt !== null ||
      row.piece.cancelledAt !== null ||
      row.piece.cancellationReason !== null ||
      (operation !== "RECEIVE_AND_START" &&
        row.piece.workState === "IN_PROGRESS" &&
        row.work.visit?.endedAt !== null)
    )
      throw new QualityLocalCommandError("MISMATCH");
    const group = groups.get(row.target.orderId);
    if (group !== undefined) {
      if (group.expectedVersion !== row.target.expectedVersion)
        throw new QualityLocalCommandError("MISMATCH");
      group.pieceIds.push(row.target.pieceId);
    } else
      groups.set(row.target.orderId, {
        orderId: row.target.orderId,
        expectedVersion: row.target.expectedVersion,
        pieceIds: [row.target.pieceId],
      });
  }
  const orders = [...groups.values()]
    .sort((a, b) => a.orderId.localeCompare(b.orderId))
    .map((group) => ({ ...group, pieceIds: group.pieceIds.toSorted() }));
  const body = qualityCommandBodySchema.parse({
    commandId: localCommandId,
    operation,
    orders,
    ...(operation === "REPORT_ISSUES"
      ? { reason: "Selection validation", notes: null }
      : {}),
  });
  if (body.operation === "INSPECT")
    throw new QualityLocalCommandError("INVARIANT");
  return body.orders;
};
export const validateQualityTaskSelection = (
  data: QualityOrderData,
  params: { pieceId?: string; itemId?: string; segmentId?: string },
): readonly QualityPieceTarget[] => {
  if (
    params.pieceId === undefined &&
    params.itemId === undefined &&
    params.segmentId === undefined
  )
    return [];
  const pieceId = params.pieceId ?? params.itemId;
  if (pieceId === undefined) throw new QualityLocalCommandError("MISMATCH");
  const id = salesUuidSchema.parse(pieceId);
  if (
    params.itemId !== undefined &&
    salesUuidSchema.parse(params.itemId) !== id
  )
    throw new QualityLocalCommandError("MISMATCH");
  const piece = data.paper.order.pieces.find((piece) => piece.id === id),
    work = data.work.find((work) => work.pieceId === id);
  if (
    piece === undefined ||
    work === undefined ||
    (params.segmentId !== undefined &&
      work.visit?.id !== salesUuidSchema.parse(params.segmentId))
  )
    throw new QualityLocalCommandError("MISMATCH");
  return [
    {
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: id,
    },
  ];
};
export const captureQualityInspection = (
  rows: readonly QualityWorkRow[],
  values: QualityInspectionFormValues,
): Extract<QualityCommandBody, { operation: "INSPECT" }>["orders"] => {
  const form = qualityInspectionFormSchema.parse(values),
    byOrder = new Map<string, QualityWorkRow[]>();
  if (
    rows.length === 0 ||
    rows.length > MAX_DRAFT_PIECES ||
    new Set(rows.map((row) => row.piece.id)).size !== rows.length
  )
    throw new QualityLocalCommandError("MISMATCH");
  for (const row of rows) {
    assertRow(row);
    const group = byOrder.get(row.order.id);
    if (group === undefined) byOrder.set(row.order.id, [row]);
    else group.push(row);
  }
  if (
    form.orders.length !== byOrder.size ||
    new Set(form.orders.map((order) => order.orderId)).size !==
      form.orders.length
  )
    throw new QualityLocalCommandError("MISMATCH");
  const orders: Extract<
    QualityCommandBody,
    { operation: "INSPECT" }
  >["orders"] = [];
  for (const group of form.orders) {
    const selected = byOrder.get(group.orderId);
    if (
      selected === undefined ||
      group.pieces.length !== selected.length ||
      new Set(group.pieces.map((piece) => piece.pieceId)).size !==
        group.pieces.length
    )
      throw new QualityLocalCommandError("MISMATCH");
    const decisions: Extract<
      QualityCommandBody,
      { operation: "INSPECT" }
    >["orders"][number]["decisions"] = [];
    for (const piece of group.pieces) {
      const row = selected.find((row) => row.piece.id === piece.pieceId);
      if (
        row === undefined ||
        row.target.expectedVersion !== group.expectedVersion
      )
        throw new QualityLocalCommandError("MISMATCH");
      if (!piece.included) continue;
      if (
        !row.work.allowedActions.canInspect ||
        row.piece.stage !== "QUALITY" ||
        row.piece.workState !== "IN_PROGRESS" ||
        row.piece.receivedAt !== null ||
        row.piece.cancelledAt !== null ||
        row.work.visit === null ||
        row.work.visit.endedAt !== null
      )
        throw new QualityLocalCommandError("MISMATCH");
      if (piece.decision === "ACCEPT")
        decisions.push({ pieceId: piece.pieceId, decision: "ACCEPT" });
      else if (
        piece.decision === "REJECT" &&
        (piece.target === "CUTTING" || piece.target === "PRODUCTION")
      )
        decisions.push({
          pieceId: piece.pieceId,
          decision: "REJECT",
          target: piece.target,
          reason: piece.reason,
          instructions: piece.instructions,
        });
      else throw new QualityLocalCommandError("MISMATCH");
    }
    if (decisions.length > 0)
      orders.push({
        orderId: group.orderId,
        expectedVersion: group.expectedVersion,
        decisions: decisions.toSorted((a, b) =>
          a.pieceId.localeCompare(b.pieceId),
        ),
        inspectorNote: group.inspectorNote,
        packing: decisions.some((decision) => decision.decision === "ACCEPT")
          ? {
              cartonCount: group.cartonCount,
              cartonNumbers: group.cartonNumbers,
            }
          : null,
      });
  }
  const body = qualityCommandBodySchema.parse({
    commandId: localCommandId,
    operation: "INSPECT",
    orders: orders.sort((a, b) => a.orderId.localeCompare(b.orderId)),
  });
  if (body.operation !== "INSPECT")
    throw new QualityLocalCommandError("INVARIANT");
  return body.orders;
};
