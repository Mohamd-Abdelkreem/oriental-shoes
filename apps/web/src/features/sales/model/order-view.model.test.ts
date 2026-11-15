import { warehouseActivityEventSchema } from "@template/contracts";
import { factoryActivityFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { expect, it } from "vitest";
import {
  salesOrderSchema,
  salesOrderTrackingDataSchema,
  salesOrderSummarySchema,
  approvalActivityEventSchema,
  salesActivityItemSchema,
  type ApprovalCommandOperation,
} from "@template/contracts";
import {
  orderFixture,
  catalogFixture,
  p03Ids,
  p03Instant,
} from "@/test/p03-fixtures";
import {
  toAuthoritativeTracking,
  toSalesActivityRow,
  toSubmittedPaper,
  toAuthoritativePaperState,
  toSalesOrderListRow,
  toSalesOrderStatusLabel,
} from "./order-view.model";

import { qualityActivityEventSchema } from "@template/contracts";

it.each(["1800.00", "1500.00", "650.00"])(
  "maps exact frozen %s and real metadata without prototype facts",
  (price) => {
    const original = orderFixture(),
      order = {
        ...original,
        money: {
          total: price,
          paidAmount: "700.00",
          remainingDue:
            price === "650.00"
              ? "0.00"
              : price === "1500.00"
                ? "800.00"
                : "1100.00",
          surplus: price === "650.00" ? "50.00" : "0.00",
        },
        pieces: original.pieces.map((piece) => ({
          ...piece,
          unitPrice: price,
        })),
      };
    const paper = toSubmittedPaper(order),
      state = toAuthoritativePaperState(order, catalogFixture());
    expect(paper).toMatchObject({
      id: p03Ids.order,
      customer: "Frozen contact",
      phone: "+966501234567",
      address: "Frozen address",
      salesperson: "Sales",
      created: order.createdAt,
      segments: [],
      total: price,
      paid: "700.00",
      balance: order.money.remainingDue,
    });
    expect(paper.items[0]).toMatchObject({
      id: p03Ids.piece,
      unitPrice: price,
      rowTotal: price,
      quantity: 1,
    });
    expect(paper).not.toHaveProperty("reviewer");
    expect(paper).not.toHaveProperty("hijriDate");
    expect(state.finance).toEqual({
      kind: "submitted",
      piecePrices: { [p03Ids.piece]: price },
      money: order.money,
    });
    const row = toSalesOrderListRow({
      kind: "submitted",
      order: salesOrderSummarySchema
        .strip()
        .parse({ ...order, returnInfo: null }),
    });
    expect(row).toMatchObject({
      reference: order.businessNumber,
      id: order.id,
      pieceCount: 1,
      money: order.money,
    });
    expect(toSalesOrderStatusLabel("APPROVED")).toBe("قيد التصنيع");
  },
);
it("keeps frozen money and captured references when current catalog is missing", () => {
  const order = orderFixture(),
    state = toAuthoritativePaperState(order, null);
  expect(state.catalogSourceId).toBeNull();
  expect(state.selectionsByPiece[p03Ids.piece]).toEqual(
    order.pieces[0]?.catalogSelections,
  );
  expect(state.finance.kind).toBe("submitted");
  expect(
    Object.values(state.catalogOptions).every(
      (entries) => entries.length === 0,
    ),
  ).toBe(true);
});

const approvalEvent = (operation: ApprovalCommandOperation) =>
  approvalActivityEventSchema.parse({
    id: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 2,
    businessNumber: "SHOP-2026-0001",
    operation,
    actor: {
      id: p03Ids.actor,
      fullName: "Actual recorded actor",
      role: "USER",
      department:
        operation === "SUBMIT_CONTACT"
          ? "SALES"
          : operation === "REPORT_ISSUE"
            ? "CUTTING"
            : "APPROVAL",
    },
    occurredAt: p03Instant,
    pieceId:
      operation === "APPROVE_INITIAL" || operation === "RETURN_INITIAL"
        ? null
        : p03Ids.piece,
    issueId:
      operation === "APPROVE_INITIAL" || operation === "RETURN_INITIAL"
        ? null
        : p03Ids.source,
    proposalId:
      operation === "SUBMIT_CONTACT" || operation === "REVIEW_CONTACT"
        ? p03Ids.customer
        : null,
    decision:
      operation === "RESOLVE_ISSUE"
        ? "RETURN_TO_DEPARTMENT"
        : operation === "REVIEW_CONTACT"
          ? "RETURN_TO_SALES"
          : null,
    notes: "Actual retained decision context",
    changedFields: ["status"],
  });
it.each([
  ["APPROVE_INITIAL", "اعتماد أولي"],
  ["RETURN_INITIAL", "إعادة للمبيعات"],
  ["REPORT_ISSUE", "إحالة مشكلة تصنيع"],
  ["RESOLVE_ISSUE", "قرار مشكلة تصنيع"],
  ["SUBMIT_CONTACT", "تواصل العميل"],
  ["REVIEW_CONTACT", "مراجعة تواصل العميل"],
] as const)(
  "maps %s from its real summary without a default/drop branch",
  (operation, label) => {
    const event = approvalEvent(operation),
      row = toSalesActivityRow({ kind: "approval", event });
    expect(row).toMatchObject({
      kind: "approval",
      id: `approval:${event.id}`,
      resourceId: event.orderId,
      reference: event.businessNumber,
      label,
      fields: "الحالة",
      actor: event.actor,
      occurredAt: event.occurredAt,
    });
    expect(row.decisionLabel).toBe(
      operation === "RESOLVE_ISSUE"
        ? "إعادة للقسم"
        : operation === "REVIEW_CONTACT"
          ? "إرجاع للمبيعات"
          : null,
    );
  },
);
it("keeps colliding draft/P03/P04 command namespaces distinct in one merged page", () => {
  const common = {
    id: p03Ids.actor,
    fullName: "Actual owner",
    role: "USER",
    department: "SALES",
  };
  const draft = salesActivityItemSchema.parse({
    kind: "draft",
    change: {
      commandId: p03Ids.command,
      operation: "CREATE_DRAFT",
      draftId: p03Ids.order,
      actor: common,
      occurredAt: p03Instant,
      beforeVersion: null,
      afterVersion: 1,
      changedFields: ["generalNotes"],
      addedPieceIds: [],
      removedPieceIds: [],
    },
  });
  const order = salesActivityItemSchema.parse({
    kind: "order",
    event: {
      id: p03Ids.command,
      orderId: p03Ids.order,
      orderVersion: 1,
      businessNumber: "SHOP-2026-0001",
      operation: "SUBMIT_NEW_ORDER",
      pieceIds: [p03Ids.piece],
      actor: common,
      occurredAt: p03Instant,
      notes: null,
      changedFields: ["status"],
      paidChange: null,
    },
  });
  const rows = [
    draft,
    order,
    { kind: "approval" as const, event: approvalEvent("APPROVE_INITIAL") },
  ].map(toSalesActivityRow);
  expect(rows.map((row) => row.id)).toEqual([
    `draft:${p03Ids.command}`,
    `order:${p03Ids.command}`,
    `approval:${p03Ids.command}`,
  ]);
  expect(rows.map((row) => row.label)).toEqual([
    "إنشاء مسودة",
    "إرسال طلب جديد",
    "اعتماد أولي",
  ]);
});

it("projects retained cancellation once with exact active money, paid and surplus", () => {
  const original = orderFixture(3),
    first = original.pieces[0];
  if (!first) throw new Error("Missing piece");
  const order = salesOrderSchema.parse({
    ...original,
    status: "APPROVED",
    approval: { ...original.approval, approvedAt: p03Instant },
    counts: {
      original: 2,
      cancelled: 1,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
    money: {
      total: "1800.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "200.00",
    },
    pieces: [
      { ...first, stage: "CUTTING", workState: "INCOMING" },
      {
        ...first,
        id: p03Ids.source,
        position: 2,
        model: "Retained cancelled model",
        unitPrice: "1500.00",
        stage: "CANCELLED",
        workState: "BLOCKED",
        cancelledAt: p03Instant,
        cancellationReason: "Confirmed retained cancellation",
      },
    ],
  });
  const before = structuredClone(order),
    paper = toSubmittedPaper(order);
  expect(paper.items).toHaveLength(2);
  expect(paper.items[0]).toMatchObject({
    id: first.id,
    isDeleted: false,
    unitPrice: "1800.00",
  });
  expect(paper.items[1]).toMatchObject({
    id: p03Ids.source,
    model: "Retained cancelled model",
    isDeleted: true,
    unitPrice: "1500.00",
  });
  expect(paper).toMatchObject({
    cancelled: 1,
    total: "1800.00",
    paid: "2000.00",
    balance: "0.00",
  });
  expect(toAuthoritativePaperState(order, null).finance).toMatchObject({
    kind: "submitted",
    money: {
      total: "1800.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "200.00",
    },
  });
  expect(toSubmittedPaper(order).items.map((piece) => piece.id)).toEqual(
    paper.items.map((piece) => piece.id),
  );
  expect(order).toEqual(before);
});
it("retains every cancelled identity and paid amount with zero active completion", () => {
  const original = orderFixture(4);
  const order = salesOrderSchema.parse({
    ...original,
    status: "CANCELLED",
    counts: {
      ...original.counts,
      active: 0,
      cancelled: 1,
      completionPercent: 0,
    },
    money: {
      total: "0.00",
      paidAmount: "2000.00",
      remainingDue: "0.00",
      surplus: "2000.00",
    },
    pieces: original.pieces.map((piece) => ({
      ...piece,
      stage: "CANCELLED",
      workState: "BLOCKED",
      cancelledAt: p03Instant,
      cancellationReason: "Approved cancellation",
    })),
  });
  expect(toSubmittedPaper(order)).toMatchObject({
    status: "ملغي",
    warehouse: 0,
    cancelled: 1,
    total: "0.00",
    paid: "2000.00",
    items: [{ id: p03Ids.piece, isDeleted: true, unitPrice: "1800.00" }],
  });
  const tracking = salesOrderTrackingDataSchema.parse({
    orderId: order.id,
    orderVersion: order.version,
    counts: order.counts,
    pieces: order.pieces.map((piece) => ({
      pieceId: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
  });
  expect(toAuthoritativeTracking(order, tracking)).toMatchObject({
    orderStatus: order.status,
    ready: false,
    counts: { active: 0, received: 0, completionPercent: 0 },
  });
});

it("maps a manufacturing event to its exact source, actor and safe inline summary", () => {
  const event = factoryActivityFixture(),
    row = toSalesActivityRow({ kind: "manufacturing", event });
  expect(row).toMatchObject({
    kind: "manufacturing",
    id: `manufacturing:${event.id}`,
    resourceId: event.orderId,
    reference: event.businessNumber,
    actor: event.actor,
    occurredAt: event.occurredAt,
    decisionLabel: null,
  });
  expect(row.fields).toContain("1 قطعة");
  expect(row.fields).toContain("الإنتاج والإصلاح");
  expect(row.fields).not.toContain("1800");
});

const qualityHistoryFixture = () => {
  const source = factoryActivityFixture(),
    member = source.pieces[0];
  if (!member) throw new Error("Historical member required");
  const prior = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    next = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  return qualityActivityEventSchema.parse({
    id: source.id,
    commandId: source.commandId,
    orderId: source.orderId,
    orderVersion: source.orderVersion,
    businessNumber: source.businessNumber,
    department: "QUALITY",
    operation: "INSPECT",
    actor: {
      ...source.actor,
      department: "QUALITY",
      fullName: "Actual quality inspector",
    },
    occurredAt: source.occurredAt,
    report: null,
    pieces: [
      {
        pieceId: member.pieceId,
        visitId: member.visitId,
        decision: "REJECT",
        stage: "PRODUCTION",
        workState: "INCOMING",
        correctionId: next,
        issueId: null,
      },
    ],
    inspection: {
      decisions: [
        {
          pieceId: member.pieceId,
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "Original defect",
          instructions: "Original correction instructions",
        },
      ],
      inspectorNote: null,
      packing: null,
    },
    correctionLinks: [
      {
        pieceId: member.pieceId,
        correctionId: prior,
        cycle: 1,
        action: "REJECTED",
      },
      {
        pieceId: member.pieceId,
        correctionId: next,
        cycle: 2,
        action: "OPENED",
      },
    ],
  });
};
it("maps a quality event to its exact source, actor and safe inline summary", () => {
  const event = qualityHistoryFixture(),
    row = toSalesActivityRow({ kind: "quality", event });
  expect(row).toMatchObject({
    kind: "quality",
    id: `quality:${event.id}`,
    resourceId: event.orderId,
    reference: event.businessNumber,
    actor: event.actor,
    occurredAt: event.occurredAt,
    decisionLabel: null,
  });
  expect(row.fields).toContain("1 قطعة");
  expect(row.fields).toContain("Original correction instructions");
  expect(row.fields).not.toContain("1800");
});

const warehouseHistoryFixture = () => {
  const source = factoryActivityFixture(),
    actor = {
      ...source.actor,
      fullName: "Actual warehouse colleague",
      department: "WAREHOUSE",
    },
    pieceIds = source.pieces.map((piece) => piece.pieceId);
  return warehouseActivityEventSchema.parse({
    id: source.id,
    commandId: source.commandId,
    orderId: source.orderId,
    orderVersion: source.orderVersion,
    businessNumber: source.businessNumber,
    operation: "RECEIVE",
    actor,
    occurredAt: source.occurredAt,
    pieceIds,
    beforeStatus: "APPROVED",
    afterStatus: "READY_FOR_DELIVERY",
    receiptGroup: {
      id: source.id,
      orderId: source.orderId,
      pieceIds,
      actor,
      receivedAt: source.occurredAt,
      cartonCount: "2",
      storageLocation: "Shelf B-12",
      notes: "Original complete arrival <script>text</script>",
    },
    attempt: null,
    retry: null,
  });
};
it("maps a warehouse event to its exact source, actor and safe inline summary", () => {
  const event = warehouseHistoryFixture(),
    row = toSalesActivityRow({ kind: "warehouse", event });
  expect(row).toMatchObject({
    kind: "warehouse",
    id: `warehouse:${event.id}`,
    resourceId: event.orderId,
    reference: event.businessNumber,
    actor: event.actor,
    occurredAt: event.occurredAt,
    decisionLabel: null,
  });
  expect(row.fields).toContain("1 قطعة");
  expect(row.fields).toContain("Original complete arrival");
  expect(row.fields).not.toContain("1800");
});
