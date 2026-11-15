import { Prisma } from "@template/database";
import {
  warehouseCommandDataSchema,
  type WarehouseCommandData,
} from "@template/contracts";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import type { WarehouseCommandRecord } from "./warehouse.types.js";
import type {
  WarehouseAttemptRecord,
  WarehouseOrderContextRecord,
  WarehouseReceiptGroupRecord,
} from "./warehouse.types.js";
import {
  warehouseOrderSummarySchema,
  warehousePieceContextSchema,
  warehouseReceiptGroupSchema,
  warehouseAttemptSchema,
  type WarehouseOrderSummary,
  type WarehousePieceContext,
  warehouseOrderDataSchema,
} from "@template/contracts";
import type { z } from "zod";
import { serializeNullableDateOnly } from "../../core/date-only.js";
import { deriveOrderCounts } from "../sales-orders/sales-orders.rules.js";
import { mapManufacturingPaperPiece } from "../manufacturing/manufacturing.mapper.js";
import { mapManufacturingPaper } from "../manufacturing/manufacturing.mapper.js";
import {
  warehouseActionHints,
  warehousePieceActionHints,
} from "./warehouse.rules.js";
import { MANUFACTURING_ORDER_SELECT } from "../manufacturing/manufacturing.mapper.js";

const ACTOR_SELECT = {
  actorId: true,
  actorFullName: true,
  actorRole: true,
  actorDepartment: true,
  occurredAt: true,
} as const;

export const WAREHOUSE_COMMAND_SELECT = {
  ...ACTOR_SELECT,
  commandId: true,
  operation: true,
  payloadHash: true,
  outcome: true,
} as const satisfies Prisma.WarehouseCommandSelect;

export const mapWarehouseCommandResult = (
  record: WarehouseCommandRecord,
  replayed: boolean,
): WarehouseCommandData => {
  const result = warehouseCommandDataSchema.safeParse({
    kind: "warehouse-command",
    replayed,
    receipt: {
      commandId: record.commandId,
      operation: record.operation,
      occurredAt: record.occurredAt.toISOString(),
      actor: {
        id: record.actorId,
        fullName: record.actorFullName,
        role: record.actorRole,
        department: record.actorDepartment,
      },
    },
    outcome: record.outcome,
  });
  if (!result.success)
    throw new InternalServerError(
      "A retained warehouse command has an invalid safe result.",
    );
  return result.data;
};
const MEMBER_SELECT = {
  select: { pieceId: true },
  take: 201,
  orderBy: { pieceId: "asc" },
} as const;
const COMMAND_ORDER_SELECT = {
  select: { command: { select: ACTOR_SELECT } },
} as const;

const safeProjection = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new InternalServerError("A warehouse read has invalid safe fields.");
  return result.data;
};
const mapActor = (
  record: WarehouseReceiptGroupRecord["commandOrder"]["command"],
) => ({
  id: record.actorId,
  fullName: record.actorFullName,
  role: record.actorRole,
  department: record.actorDepartment,
});
export const mapWarehouseReceiptGroup = (group: WarehouseReceiptGroupRecord) =>
  safeProjection(warehouseReceiptGroupSchema, {
    id: group.id,
    orderId: group.orderId,
    pieceIds: group.members.map((member) => member.pieceId),
    actor: mapActor(group.commandOrder.command),
    receivedAt: group.commandOrder.command.occurredAt.toISOString(),
    cartonCount: group.cartonCount,
    storageLocation: group.storageLocation,
    notes: group.notes,
  });
export const mapWarehouseAttempt = (attempt: WarehouseAttemptRecord) => {
  const outcome = attempt.outcome,
    retry = attempt.retry;
  return safeProjection(warehouseAttemptSchema, {
    id: attempt.id,
    orderId: attempt.orderId,
    number: attempt.number,
    pieceIds: attempt.members.map((member) => member.pieceId),
    status: outcome?.kind ?? "DISPATCHED",
    dispatchedBy: mapActor(attempt.commandOrder.command),
    dispatchedAt: attempt.commandOrder.command.occurredAt.toISOString(),
    deliveryNote: attempt.deliveryNote,
    outcome:
      outcome === null
        ? null
        : {
            id: outcome.id,
            kind: outcome.kind,
            recordedBy: mapActor(outcome.commandOrder.command),
            recordedAt: outcome.commandOrder.command.occurredAt.toISOString(),
            notes: outcome.notes,
            ...(outcome.kind === "DELIVERED"
              ? {
                  recipient: outcome.recipient,
                  deliveredAt: outcome.deliveredAt?.toISOString() ?? null,
                }
              : {
                  returnedToWarehouse: outcome.returnedToWarehouse,
                  reason: outcome.reason,
                }),
          },
    retry:
      retry === null
        ? null
        : {
            id: retry.id,
            actor: mapActor(retry.commandOrder.command),
            occurredAt: retry.commandOrder.command.occurredAt.toISOString(),
            retryDate: serializeNullableDateOnly(retry.retryDate),
            notes: retry.notes,
          },
  });
};
export const mapWarehouseOrderSummary = (
  context: WarehouseOrderContextRecord,
  matchingPieceIds: readonly string[],
): WarehouseOrderSummary => {
  const { root } = context,
    header = root.order;
  if (header === null || root.pieces.length > 200)
    throw new InternalServerError(
      "A warehouse order has invalid physical membership.",
    );
  return safeProjection(warehouseOrderSummarySchema, {
    id: root.id,
    version: root.version,
    type: root.type,
    status: header.status,
    businessNumber: header.businessNumber,
    customerName: header.customerName,
    deliveryDate: serializeNullableDateOnly(root.deliveryDate),
    counts: deriveOrderCounts(
      root.pieces.map((piece) => mapManufacturingPaperPiece(piece, root.id)),
    ),
    matchingPieceIds: [...matchingPieceIds],
    matchingPieceCount: matchingPieceIds.length,
    lastActionAt: context.lastActionAt?.toISOString() ?? null,
    allowedActions: warehouseActionHints(context),
    currentAttemptId: context.latestAttempt?.id ?? null,
    retryDate:
      header.status === "READY_FOR_DELIVERY"
        ? serializeNullableDateOnly(
            context.latestAttempt?.retry?.retryDate ?? null,
          )
        : null,
  });
};
export const mapWarehousePieceContext = (
  context: WarehouseOrderContextRecord,
  pieceId: string,
): WarehousePieceContext => {
  const source = context.acceptedByPiece.get(pieceId),
    receipt = context.receiptByPiece.get(pieceId);
  const packing =
    source === undefined
      ? undefined
      : context.qualityPackingGroups.find(
          (group) =>
            group.inspectionId === source.commandOrder.eventId &&
            group.acceptedPieceIds.includes(pieceId),
        );
  return safeProjection(warehousePieceContextSchema, {
    pieceId,
    acceptedHandoff:
      source === undefined
        ? null
        : {
            eventId: source.id,
            commandId: source.commandId,
            acceptedAt: source.commandOrder.command.occurredAt.toISOString(),
            actor: mapActor(source.commandOrder.command),
            packingGroupId: packing?.id ?? null,
          },
    receiptGroupId: receipt?.groupId ?? null,
    receivedAt: receipt?.receivedAt.toISOString() ?? null,
    legacyReceipt: receipt?.origin === "LEGACY_BASELINE",
    allowedActions: warehousePieceActionHints(context, pieceId),
  });
};

export const mapWarehouseOrder = (context: WarehouseOrderContextRecord) => {
  const header = context.root.order;
  if (header === null)
    throw new InternalServerError(
      "A warehouse detail lost its submitted contacts.",
    );
  return safeProjection(warehouseOrderDataSchema, {
    summary: mapWarehouseOrderSummary(
      context,
      context.physical
        .filter((piece) => piece.stage !== "CANCELLED")
        .map((piece) => piece.id),
    ),
    paper: mapManufacturingPaper(context.root, context.issueInstructions),
    deliveryContact: {
      name: header.customerName,
      phone: header.customerPhone,
      address: header.customerAddress,
    },
    work: context.physical.map((piece) =>
      mapWarehousePieceContext(context, piece.id),
    ),
    receiptGroups: context.receiptGroups.map(mapWarehouseReceiptGroup),
    qualityPackingGroups: context.qualityPackingGroups,
    currentAttempt:
      context.latestAttempt === null
        ? null
        : mapWarehouseAttempt(context.latestAttempt),
  });
};

// g/c/h are the immutable event group, its command and the submitted header.
const warehouseHistoricalAttemptSql = Prisma.sql`(
 SELECT jsonb_build_object('id',a.id,'orderId',a.order_id,'number',a.number,
 'pieceIds',(SELECT jsonb_agg(m.piece_id ORDER BY m.piece_id) FROM warehouse_delivery_attempt_members m WHERE m.attempt_id=a.id AND m.order_id=a.order_id),
 'status',CASE WHEN og.command_id IS NULL THEN 'DISPATCHED' ELSE o.kind::text END,
 'dispatchedBy',jsonb_build_object('id',dc.actor_id,'fullName',dc.actor_full_name,'role',dc.actor_role,'department',dc.actor_department),
 'dispatchedAt',dc.occurred_at,'deliveryNote',a.delivery_note,
 'outcome',CASE WHEN og.command_id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'kind',o.kind,
 'recordedBy',jsonb_build_object('id',oc.actor_id,'fullName',oc.actor_full_name,'role',oc.actor_role,'department',oc.actor_department),
 'recordedAt',oc.occurred_at,'notes',o.notes)||CASE WHEN o.kind='DELIVERED' THEN jsonb_build_object('recipient',o.recipient,'deliveredAt',o.delivered_at) ELSE jsonb_build_object('returnedToWarehouse',o.returned_to_warehouse,'reason',o.reason) END END,
 'retry',CASE WHEN tg.command_id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,
 'actor',jsonb_build_object('id',tc.actor_id,'fullName',tc.actor_full_name,'role',tc.actor_role,'department',tc.actor_department),
 'occurredAt',tc.occurred_at,'retryDate',to_char(t.retry_date,'YYYY-MM-DD'),'notes',t.notes) END)
 FROM warehouse_delivery_attempts a JOIN warehouse_commands dc ON dc.command_id=a.command_id
 LEFT JOIN warehouse_delivery_outcomes o ON o.attempt_id=a.id AND o.order_id=a.order_id
 LEFT JOIN warehouse_command_orders og ON og.command_id=o.command_id AND og.order_id=o.order_id AND og.after_version<=g.after_version
 LEFT JOIN warehouse_commands oc ON oc.command_id=og.command_id
 LEFT JOIN warehouse_delivery_retries t ON t.attempt_id=a.id AND t.order_id=a.order_id
 LEFT JOIN warehouse_command_orders tg ON tg.command_id=t.command_id AND tg.order_id=t.order_id AND tg.after_version<=g.after_version
 LEFT JOIN warehouse_commands tc ON tc.command_id=tg.command_id
 WHERE a.order_id=g.order_id AND (a.command_id=g.command_id OR o.command_id=g.command_id OR t.command_id=g.command_id))`;
export const warehouseSummarySql = Prisma.sql`jsonb_build_object(
 'id',g.event_id,'commandId',c.command_id,'orderId',g.order_id,'orderVersion',g.after_version,'businessNumber',h.business_number,
 'operation',c.operation,'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),
 'occurredAt',c.occurred_at,'pieceIds',g.piece_ids,'beforeStatus',g.before_status,'afterStatus',g.after_status,
 'receiptGroup',(SELECT jsonb_build_object('id',rg.id,'orderId',rg.order_id,'pieceIds',(SELECT jsonb_agg(r.piece_id ORDER BY r.piece_id) FROM warehouse_receipt_pieces r WHERE r.group_id=rg.id AND r.order_id=rg.order_id),
 'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),'receivedAt',c.occurred_at,'cartonCount',rg.carton_count,'storageLocation',rg.storage_location,'notes',rg.notes)
 FROM warehouse_receipt_groups rg WHERE rg.command_id=g.command_id AND rg.order_id=g.order_id),
 'attempt',${warehouseHistoricalAttemptSql},
 'retry',(SELECT jsonb_build_object('id',t.id,'actor',jsonb_build_object('id',c.actor_id,'fullName',c.actor_full_name,'role',c.actor_role,'department',c.actor_department),'occurredAt',c.occurred_at,'retryDate',to_char(t.retry_date,'YYYY-MM-DD'),'notes',t.notes)
 FROM warehouse_delivery_retries t WHERE t.command_id=g.command_id AND t.order_id=g.order_id))`;

export const WAREHOUSE_ORDER_SELECT = {
  ...MANUFACTURING_ORDER_SELECT,
  updatedAt: true,
  order: {
    select: {
      ...MANUFACTURING_ORDER_SELECT.order.select,
      approvedAt: true,
      customerPhone: true,
      customerAddress: true,
    },
  },
} as const satisfies Prisma.SalesDraftSelect;
export const WAREHOUSE_LOCKED_ROOT_SELECT = {
  id: true,
  status: true,
  version: true,
  order: { select: { id: true, status: true, approvedAt: true } },
} as const satisfies Prisma.SalesDraftSelect;
export const WAREHOUSE_ACCEPTED_SOURCE_SELECT = {
  id: true,
  orderId: true,
  pieceId: true,
  commandId: true,
  decision: true,
  beforeStage: true,
  afterStage: true,
  commandOrder: {
    select: {
      eventId: true,
      afterVersion: true,
      command: { select: { ...ACTOR_SELECT, operation: true } },
    },
  },
} as const satisfies Prisma.QualityPieceEventSelect;
export const WAREHOUSE_RECEIPT_PIECE_SELECT = {
  pieceId: true,
  orderId: true,
  origin: true,
  groupId: true,
  qualityEventId: true,
  receivedAt: true,
} as const satisfies Prisma.WarehouseReceiptPieceSelect;
export const WAREHOUSE_RECEIPT_GROUP_SELECT = {
  id: true,
  commandId: true,
  orderId: true,
  cartonCount: true,
  storageLocation: true,
  notes: true,
  commandOrder: COMMAND_ORDER_SELECT,
  members: MEMBER_SELECT,
} as const satisfies Prisma.WarehouseReceiptGroupSelect;
export const WAREHOUSE_ATTEMPT_SELECT = {
  id: true,
  orderId: true,
  number: true,
  commandId: true,
  deliveryNote: true,
  predecessorRetryId: true,
  commandOrder: COMMAND_ORDER_SELECT,
  members: MEMBER_SELECT,
  outcome: {
    select: {
      id: true,
      attemptId: true,
      orderId: true,
      commandId: true,
      kind: true,
      recipient: true,
      deliveredAt: true,
      reason: true,
      notes: true,
      returnedToWarehouse: true,
      commandOrder: COMMAND_ORDER_SELECT,
    },
  },
  retry: {
    select: {
      id: true,
      attemptId: true,
      orderId: true,
      outcomeId: true,
      commandId: true,
      retryDate: true,
      notes: true,
      commandOrder: COMMAND_ORDER_SELECT,
    },
  },
} as const satisfies Prisma.WarehouseDeliveryAttemptSelect;
