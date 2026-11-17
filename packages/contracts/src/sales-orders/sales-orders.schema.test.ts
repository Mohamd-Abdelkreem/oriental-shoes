import {
  salesOrderMoneySchema as publicMoneySchema,
  currentOrderCountsSchema as publicCurrentCounts,
  retainedOrderCountsSchema as publicRetainedCounts,
} from "../index.ts";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { draftCaptureSchema } from "../sales-drafts/sales-drafts.schema.ts";
import { salesCommandDataSchema } from "../sales-commands/sales-commands.schema.ts";
import {
  customerOrdersQuerySchema,
  customerOrderMeasurementsQuerySchema,
  factoryOrderSchema,
  returnedOrderCorrectionsSchema,
  salesOrderActivityQuerySchema,
  salesActivityItemSchema,
  salesOrderListQuerySchema,
  salesOrderRevisionDataSchema,
  salesOrderSchema,
  retainedSalesOrderSchema,
  currentOrderCountsSchema,
  retainedOrderCountsSchema,
  salesOrderSummarySchema,
  setOrderPaidBodySchema,
  submissionCaptureSchema,
  submitOrderBodySchema,
} from "./sales-orders.schema.ts";

const instant = "2026-11-06T12:00:00.000Z";
const completeCapture = () =>
  submissionCaptureSchema.parse({
    type: "SHOP",
    customerId: randomUUID(),
    pieces: [
      {
        id: randomUUID(),
        model: "SM",
        size: "40",
        leatherBase: "001 - جلد ",
        decoration: "زبيري - z",
        face: "custom face",
      },
    ],
  });
const submittedOrder = () => {
  const capture = completeCapture();
  const { paidAmount: _initialPaid, ...capturedFields } = capture;
  return salesOrderSchema.parse({
    ...capturedFields,
    id: randomUUID(),
    version: 1,
    owner: { id: randomUUID(), fullName: "Sales A" },
    status: "AWAITING_APPROVAL",
    businessNumber: "SHOP-2026-0001",
    businessYear: 2026,
    sequence: "1",
    customerSnapshot: {
      name: "Customer",
      phone: "+966500000001",
      email: null,
      address: null,
    },
    createdAt: instant,
    updatedAt: instant,
    submittedAt: instant,
    money: {
      total: "1800.00",
      paidAmount: "0.00",
      remainingDue: "1800.00",
      surplus: "0.00",
    },
    counts: {
      original: 1,
      cancelled: 0,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
    approval: {
      approvedAt: null,
      returnDecisionId: null,
      returnedAt: null,
      returnReason: null,
      returnRevision: 0,
    },
    allowedActions: { canResubmit: false, canSetPaid: false },
    pieces: capture.pieces.map((piece) => ({
      ...piece,
      position: 1,
      quantity: 1,
      decorationEntryId: randomUUID(),
      catalogSourceId: randomUUID(),
      unitPrice: "1800.00",
      stage: "AWAITING_APPROVAL",
      workState: "INCOMING",
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    })),
  });
};
const submitBody = () => ({
  origin: "new",
  commandId: randomUUID(),
  capture: completeCapture(),
  expectedCustomerVersion: 1,
  reviewedQuote: { sourceId: randomUUID(), fingerprint: "a".repeat(64) },
});

describe("first submission and correction inputs", () => {
  it("keeps incomplete drafts saveable while requiring customer and complete basic specifications for submission", () => {
    const draft = draftCaptureSchema.parse({
      type: "SHOP",
      pieces: [{ id: randomUUID() }],
    });
    expect(submissionCaptureSchema.safeParse(draft).success).toBe(false);
    const capture = completeCapture();
    expect(capture.pieces[0]?.leatherBase).toBe("001 - جلد ");
    for (const field of [
      "model",
      "size",
      "leatherBase",
      "decoration",
      "face",
    ] as const)
      expect(
        submissionCaptureSchema.safeParse({
          ...capture,
          pieces: capture.pieces.map((piece) => ({ ...piece, [field]: " " })),
        }).success,
      ).toBe(false);
    expect(
      submissionCaptureSchema.safeParse({ ...capture, customerId: null })
        .success,
    ).toBe(false);
  });
  it("distinguishes direct-new from saved submission and rejects caller-selected authority", () => {
    const fresh = submitBody();
    expect(submitOrderBodySchema.parse(fresh).origin).toBe("new");
    expect(
      submitOrderBodySchema.parse({
        ...fresh,
        origin: "draft",
        draftId: randomUUID(),
        expectedVersion: 3,
      }).origin,
    ).toBe("draft");
    for (const invalid of [
      { ...fresh, origin: "draft" },
      { ...fresh, expectedVersion: 1 },
      { ...fresh, businessNumber: "SHOP-2026-0001" },
      { ...fresh, ownerId: randomUUID() },
      {
        ...fresh,
        reviewedQuote: { ...fresh.reviewedQuote, unitPrice: "0.00" },
      },
    ])
      expect(submitOrderBodySchema.safeParse(invalid).success).toBe(false);
  });
  it("allows only full nonprice corrections and keeps decoration references immutable", () => {
    const { type, customerId, paidAmount, pieces, ...headers } =
      completeCapture();
    expect({ type, customerId, paidAmount }).toMatchObject({
      type: "SHOP",
      paidAmount: null,
    });
    const correctionPieces = pieces.map(({ decoration, ...piece }) => {
      expect(decoration).toBe("زبيري - z");
      return {
        ...piece,
        size: "40.5",
        catalogSelections: { size: randomUUID() },
      };
    });
    const corrections = { ...headers, pieces: correctionPieces };
    expect(
      returnedOrderCorrectionsSchema.parse(corrections).pieces[0]?.size,
    ).toBe("40.5");
    for (const invalid of [
      { ...corrections, customerId },
      { ...corrections, paidAmount: "1.00" },
      {
        ...corrections,
        pieces: correctionPieces.map((piece) => ({
          ...piece,
          decoration: "changed",
        })),
      },
      {
        ...corrections,
        pieces: correctionPieces.map((piece) => ({
          ...piece,
          catalogSelections: { decoration: randomUUID() },
        })),
      },
      { ...corrections, pieces: [...correctionPieces, ...correctionPieces] },
    ])
      expect(returnedOrderCorrectionsSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
});

it.each([
  ["0", "0.00"],
  ["001.5", "1.50"],
  ["999999999.99", "999999999.99"],
])(
  "normalizes explicit cumulative paid %s without adding installments",
  (paidAmount, expected) => {
    expect(
      setOrderPaidBodySchema.parse({
        commandId: randomUUID(),
        expectedVersion: 2,
        paidAmount,
      }).paidAmount,
    ).toBe(expected);
  },
);
it.each([undefined, null, "", " ", "-1", "1.001", "1e2", "1000000000", 1])(
  "rejects absent or invalid paid update %j",
  (paidAmount) => {
    expect(
      setOrderPaidBodySchema.safeParse({
        commandId: randomUUID(),
        expectedVersion: 2,
        paidAmount,
      }).success,
    ).toBe(false);
  },
);

describe("safe submitted output and receipts", () => {
  it("requires complete current return proof and does not invent an approval", () => {
    const order = submittedOrder();
    expect(order.approval.approvedAt).toBeNull();
    expect(
      salesOrderSchema.safeParse({ ...order, status: "RETURNED" }).success,
    ).toBe(false);
    const returned = {
      ...order,
      status: "RETURNED",
      approval: {
        ...order.approval,
        returnDecisionId: randomUUID(),
        returnedAt: instant,
        returnReason: "Correct size",
        returnRevision: 1,
      },
    };
    expect(salesOrderSchema.parse(returned)).toEqual(returned);
    expect(
      salesOrderSchema.safeParse({ ...returned, version: 2 }).success,
    ).toBe(false);
    expect(
      salesOrderSchema.safeParse({ ...returned, status: "AWAITING_APPROVAL" })
        .success,
    ).toBe(false);
  });
  it("preserves exact numbers beyond safe Number range and validates their display binding", () => {
    const order = submittedOrder();
    const sequence = "9223372036854775807";
    expect(
      salesOrderSchema.parse({
        ...order,
        sequence,
        businessNumber: `SHOP-2026-${sequence}`,
      }).sequence,
    ).toBe(sequence);
    for (const invalid of [
      {
        ...order,
        sequence: "9223372036854775808",
        businessNumber: "SHOP-2026-9223372036854775808",
      },
      { ...order, sequence: "01" },
      { ...order, sequence: "invalid" },
      { ...order, money: { ...order.money, total: "NaN" } },
      { ...order, money: { ...order.money, surplus: "invalid" } },
      { ...order, businessNumber: "SHOP-2027-0001" },
      { ...order, money: { ...order.money, remainingDue: "0.00" } },
    ])
      expect(salesOrderSchema.safeParse(invalid).success).toBe(false);
  });
  it("parses order results through the common union and rejects wrong operations, identities and revisions", () => {
    const order = submittedOrder();
    const receipt = {
      commandId: randomUUID(),
      operation: "SUBMIT_NEW_ORDER",
      resourceId: order.id,
      actor: { ...order.owner, role: "USER", department: "SALES" },
      beforeVersion: null,
      afterVersion: 1,
      occurredAt: instant,
    };
    const command = {
      kind: "order",
      receipt,
      replayed: true,
      savedOrder: order,
    };
    expect(salesCommandDataSchema.parse(command)).toEqual(command);
    for (const invalidReceipt of [
      { ...receipt, operation: "CREATE_DRAFT" },
      { ...receipt, operation: "SUBMIT_DRAFT" },
      { ...receipt, resourceId: randomUUID() },
      { ...receipt, beforeVersion: 1 },
      { ...receipt, afterVersion: 2 },
    ])
      expect(
        salesCommandDataSchema.safeParse({
          ...command,
          receipt: invalidReceipt,
        }).success,
      ).toBe(false);
    expect(
      salesCommandDataSchema.parse({
        ...command,
        receipt: {
          ...receipt,
          operation: "SET_ORDER_PAID",
          beforeVersion: 1,
          afterVersion: 2,
        },
        savedOrder: { ...order, version: 2 },
      }),
    ).toMatchObject({ savedOrder: { version: 2 } });
  });
  it("requires revision snapshots to agree with their event and predecessor kind", () => {
    const order = submittedOrder();
    const event = {
      id: randomUUID(),
      orderId: order.id,
      orderVersion: 1,
      businessNumber: order.businessNumber,
      operation: "SUBMIT_NEW_ORDER",
      pieceIds: order.pieces.map((piece) => piece.id),
      actor: { ...order.owner, role: "USER", department: "SALES" },
      occurredAt: instant,
      notes: null,
      changedFields: ["status"],
      paidChange: null,
    };
    const revision = { event, before: null, after: order };
    expect(salesOrderRevisionDataSchema.parse(revision)).toEqual(revision);
    for (const invalid of [
      { ...revision, event: { ...event, orderId: randomUUID() } },
      { ...revision, event: { ...event, operation: "SUBMIT_DRAFT" } },
      { ...revision, event: { ...event, operation: "SET_ORDER_PAID" } },
      { ...revision, after: { ...order, version: 2 } },
    ])
      expect(salesOrderRevisionDataSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("rejects private fields at both factory levels instead of silently stripping them", () => {
    const order = submittedOrder();
    const factory = {
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerSnapshot.name,
      deliveryDate: order.deliveryDate,
      generalNotes: order.generalNotes,
      repairNote: order.repairNote,
      adjustmentRequested: order.adjustmentRequested,
      adjustmentReason: order.adjustmentReason,
      adjustmentActionTaken: order.adjustmentActionTaken,
      counts: order.counts,
      pieces: order.pieces.map(
        ({
          decorationEntryId: _decorationEntryId,
          catalogSourceId: _catalogSourceId,
          unitPrice: _unitPrice,
          ...piece
        }) => piece,
      ),
    };
    expect(factoryOrderSchema.parse(factory)).toEqual(factory);
    for (const extra of [
      { money: order.money },
      { customerPhone: order.customerSnapshot.phone },
      { before: order },
    ])
      expect(
        factoryOrderSchema.safeParse({ ...factory, ...extra }).success,
      ).toBe(false);
    for (const extra of [
      { unitPrice: "1800.00" },
      { catalogSourceId: randomUUID() },
      { catalogSelections: {} },
      { customerEmail: "private@example.test" },
    ])
      expect(
        factoryOrderSchema.safeParse({
          ...factory,
          pieces: factory.pieces.map((piece) => ({ ...piece, ...extra })),
        }).success,
      ).toBe(false);
  });
});

it("bounds scoped paging, permits submitted customer statuses only and rejects hidden authority filters", () => {
  expect(salesOrderListQuerySchema.parse({ search: " " })).toEqual({
    page: 1,
    limit: 25,
    search: undefined,
  });
  for (const schema of [
    customerOrdersQuerySchema,
    customerOrderMeasurementsQuerySchema,
  ]) {
    expect(schema.parse({})).toEqual({ page: 1, limit: 25 });
    expect(schema.safeParse({ limit: "26" }).success).toBe(false);
  }
  expect(customerOrdersQuerySchema.safeParse({ status: "DRAFT" }).success).toBe(
    false,
  );
  expect(
    salesOrderActivityQuerySchema.safeParse({ status: "RETURNED" }).success,
  ).toBe(false);
  expect(
    salesOrderListQuerySchema.safeParse({ ownerId: randomUUID() }).success,
  ).toBe(false);
  expect(
    salesOrderListQuerySchema.safeParse({
      page: String(Number.MAX_SAFE_INTEGER),
      limit: "100",
    }).success,
  ).toBe(false);
});

it("requires safe canonical return summary only for returned list rows", () => {
  const order = submittedOrder();
  const summary = salesOrderSummarySchema
    .strip()
    .parse({ ...order, returnInfo: null });
  expect(summary.returnInfo).toBeNull();
  const returned = {
    ...summary,
    status: "RETURNED",
    returnInfo: { reason: "Review size", returnedAt: instant },
  };
  expect(salesOrderSummarySchema.parse(returned).returnInfo?.reason).toBe(
    "Review size",
  );
  for (const invalid of [
    { ...summary, status: "RETURNED" },
    { ...returned, returnInfo: null },
    { ...summary, returnInfo: returned.returnInfo },
    {
      ...returned,
      returnInfo: { ...returned.returnInfo, reviewer: "invented" },
    },
    { ...returned, returnInfo: { reason: " ", returnedAt: instant } },
  ])
    expect(salesOrderSummarySchema.safeParse(invalid).success).toBe(false);
  expect(
    salesOrderSchema.safeParse({ ...order, returnInfo: null }).success,
  ).toBe(false);
});

it("retains an additive quality activity event without turning it into a sales revision", () => {
  const pieceId = randomUUID(),
    correctionId = randomUUID();
  const event = {
    id: randomUUID(),
    commandId: randomUUID(),
    orderId: randomUUID(),
    orderVersion: 5,
    businessNumber: "SHOP-2026-0001",
    department: "QUALITY",
    operation: "INSPECT",
    actor: {
      id: randomUUID(),
      fullName: "Quality",
      role: "USER",
      department: "QUALITY",
    },
    occurredAt: instant,
    pieces: [
      {
        pieceId,
        visitId: randomUUID(),
        decision: "REJECT",
        stage: "PRODUCTION",
        workState: "INCOMING",
        correctionId,
        issueId: null,
      },
    ],
    correctionLinks: [{ pieceId, correctionId, cycle: 1, action: "OPENED" }],
    inspection: {
      decisions: [
        {
          pieceId,
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "Bond",
          instructions: "Rebond",
        },
      ],
      inspectorNote: null,
      packing: null,
    },
    report: null,
  };
  expect(salesActivityItemSchema.parse({ kind: "quality", event })).toEqual({
    kind: "quality",
    event,
  });
  expect(
    salesActivityItemSchema.safeParse({ kind: "order", event }).success,
  ).toBe(false);
});

const incompleteReceiptOrder = () => {
  const base = submittedOrder();
  const piece = base.pieces[0];
  if (!piece) throw new Error("Submitted fixture piece required");
  return {
    ...base,
    status: "APPROVED",
    approval: { ...base.approval, approvedAt: instant },
    counts: {
      original: 200,
      cancelled: 0,
      active: 200,
      received: 199,
      completionPercent: 99,
    },
    money: {
      total: "360000.00",
      paidAmount: "0.00",
      remainingDue: "360000.00",
      surplus: "0.00",
    },
    pieces: Array.from({ length: 200 }, (_, index) => ({
      ...piece,
      id: randomUUID(),
      position: index + 1,
      stage: "WAREHOUSE",
      workState: index < 199 ? "COMPLETED" : "INCOMING",
      receivedAt: index < 199 ? instant : null,
    })),
  };
};
it("rejects rounded complete progress in current projections and preserves both valid retained formulas", () => {
  const current = incompleteReceiptOrder();
  const historical = {
    ...current,
    counts: { ...current.counts, completionPercent: 100 },
  };
  expect(salesOrderSchema.parse(current)).toEqual(current);
  expect(salesOrderSchema.safeParse(historical).success).toBe(false);
  expect(retainedSalesOrderSchema.parse(historical)).toEqual(historical);
  expect(retainedSalesOrderSchema.parse(current)).toEqual(current);
  for (const invalid of [
    { ...historical, businessNumber: "SHOP-2026-0002" },
    { ...historical, pieces: [historical.pieces[0], historical.pieces[0]] },
    { ...historical, status: "RETURNED" },
    { ...historical, counts: { ...historical.counts, completionPercent: 98 } },
  ])
    expect(retainedSalesOrderSchema.safeParse(invalid).success).toBe(false);
});
it.each([
  [3, 0, 3, 2, 67],
  [3, 0, 3, 3, 100],
  [3, 3, 0, 0, 0],
  [200, 0, 200, 199, 99],
])(
  "keeps current and retained count arithmetic for %i/%i/%i/%i/%i",
  (original, cancelled, active, received, completionPercent) => {
    const counts = { original, cancelled, active, received, completionPercent };
    expect(currentOrderCountsSchema.parse(counts)).toEqual(counts);
    expect(retainedOrderCountsSchema.parse(counts)).toEqual(counts);
    for (const schema of [
      currentOrderCountsSchema,
      retainedOrderCountsSchema,
    ]) {
      expect(
        schema.safeParse({ ...counts, original: original + 1 }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...counts, received: active + 1 }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...counts, completionPercent: 42 }).success,
      ).toBe(false);
    }
  },
);
it("retains original rounded facts in command and both revision snapshots without relaxing current outputs", () => {
  const current = incompleteReceiptOrder();
  const historical = {
    ...current,
    version: 5,
    counts: { ...current.counts, completionPercent: 100 },
  };
  const receipt = {
    commandId: randomUUID(),
    operation: "SET_ORDER_PAID",
    resourceId: historical.id,
    actor: { ...historical.owner, role: "USER", department: "SALES" },
    beforeVersion: 4,
    afterVersion: 5,
    occurredAt: instant,
  };
  const command = {
    kind: "order",
    receipt,
    replayed: true,
    savedOrder: historical,
  };
  const originalJson = JSON.stringify(command);
  expect(salesCommandDataSchema.parse(command)).toEqual(command);
  expect(JSON.stringify(command)).toBe(originalJson);
  const event = {
    id: randomUUID(),
    orderId: historical.id,
    orderVersion: 5,
    businessNumber: historical.businessNumber,
    operation: "SET_ORDER_PAID",
    pieceIds: [],
    actor: receipt.actor,
    occurredAt: instant,
    notes: null,
    changedFields: ["paidAmount"],
    paidChange: { before: "0.00", after: "0.00" },
  };
  const revision = {
    event,
    before: { kind: "order", order: { ...historical, version: 4 } },
    after: historical,
  };
  expect(salesOrderRevisionDataSchema.parse(revision)).toEqual(revision);
  expect(salesOrderSchema.safeParse(historical).success).toBe(false);
});

it("exposes exact order facts through the public index without weakening current or retained arithmetic", () => {
  const money = {
    total: "650.00",
    paidAmount: "1000.00",
    remainingDue: "0.00",
    surplus: "350.00",
  };
  expect(publicMoneySchema.parse(money)).toEqual(money);
  for (const invalid of [
    { ...money, surplus: "349.99" },
    { ...money, remainingDue: "350.00" },
    { ...money, total: "650.001" },
    { ...money, paidAmount: "1000000000.00" },
    { ...money, total: "199999999998.01" },
    { ...money, currency: "SAR" },
  ])
    expect(publicMoneySchema.safeParse(invalid).success).toBe(false);
  const partial = {
    original: 200,
    cancelled: 0,
    active: 200,
    received: 199,
    completionPercent: 99,
  };
  expect(publicCurrentCounts.parse(partial)).toEqual(partial);
  expect(
    publicCurrentCounts.safeParse({ ...partial, completionPercent: 100 })
      .success,
  ).toBe(false);
  expect(
    publicRetainedCounts.parse({ ...partial, completionPercent: 100 })
      .completionPercent,
  ).toBe(100);
});
