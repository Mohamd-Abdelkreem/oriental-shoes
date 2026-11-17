import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  administrationActivityDataSchema,
  administrationCorrectionsDataSchema,
  administrationOrdersDataSchema,
  administrationApprovalsQuerySchema,
  administrationCorrectionsQuerySchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationFilterOptionsDataSchema,
  administrationOrdersQuerySchema,
  administrationOrderDataSchema,
  administrationReportQuerySchema,
  administrationReportPrintQuerySchema,
  administrationReportDataSchema,
  administrationReportPrintDataSchema,
  draftCaptureSchema,
  draftSchema,
} from "../index.ts";

const instant = "2026-11-15T10:00:00.000Z";
const noPieces = {
  original: 0,
  cancelled: 0,
  active: 0,
  received: 0,
  completionPercent: 0,
};
const page = (total = 0) => ({
  page: 1,
  limit: 25,
  total,
  totalPages: Math.ceil(total / 25),
  hasNextPage: total > 25,
  hasPreviousPage: false,
});
const draftRow = () => {
  const orderId = randomUUID();
  return {
    kind: "draft",
    orderId,
    businessNumber: null,
    displayReference: orderId,
    type: "SHOP",
    status: "DRAFT",
    createdAt: instant,
    deliveryDate: null,
    customer: { name: null, phone: null, address: null },
    salesperson: { id: randomUUID(), fullName: "Sales" },
    counts: { ...noPieces },
    currentDepartments: [],
    isOverdue: false,
    hasQualityCorrectionHistory: false,
    isCurrentlyReturned: false,
  };
};
const report = () => ({
  meta: {
    generatedAt: instant,
    businessDate: "2026-11-15",
    businessTimeZone: "Asia/Riyadh",
    generatedBy: { id: randomUUID(), fullName: "Admin" },
    filters: { period: "ALL" },
    effectiveFrom: null,
    effectiveTo: null,
    cohort: { kind: "MIXED", orderCount: 0 },
    complete: true,
  },
  kpis: {
    orders: 0,
    originalPieces: 0,
    cancelledPieces: 0,
    activePieces: 0,
    receivedPieces: 0,
    completionPercent: 0,
    readyOrders: 0,
    deliveredOrders: 0,
    overdueOrders: 0,
  },
  departments: [
    "CUTTING",
    "PRODUCTION",
    "QUALITY",
    "WAREHOUSE",
    "WITH_COURIER",
  ].map((department) => ({ department, pieces: 0 })),
  exceptions: {
    categoryCases: 0,
    distinctOrders: 0,
    overdueOrders: 0,
    failedOrders: 0,
    correctionHistoryOrders: 0,
    returnedOrders: 0,
  },
  workforce: {
    scope: { kind: "CURRENT_DIRECTORY", department: null },
    activeStaff: 0,
    totalStaff: 0,
    items: [],
  },
  endorsements: { mode: "MANUAL", signatories: [] },
  orders: { items: [], pagination: page() },
});
const printReport = (numberOfOrders = 0) => {
  const { orders: _orders, ...base } = report();
  return {
    ...base,
    meta: {
      ...base.meta,
      cohort: { kind: "MIXED", orderCount: numberOfOrders },
    },
    kpis: { ...base.kpis, orders: numberOfOrders },
    orders: {
      items: Array.from({ length: numberOfOrders }, draftRow),
      total: numberOfOrders,
    },
    exceptionRows: [],
  };
};

describe("canonical administrative query admission", () => {
  it("uses endpoint defaults and canonical IDs without accepting UI labels or hidden authority", () => {
    expect(administrationOrdersQuerySchema.parse({})).toMatchObject({
      period: "ALL",
      page: 1,
      limit: 25,
    });
    expect(administrationReportQuerySchema.parse({})).toMatchObject({
      period: "MONTH",
      page: 1,
      limit: 25,
    });
    expect(administrationReportPrintQuerySchema.parse({})).toMatchObject({
      period: "ALL",
    });
    expect(administrationApprovalsQuerySchema.parse({}).tab).toBe("PENDING");
    expect(administrationCorrectionsQuerySchema.parse({}).tab).toBe("ACTIVE");
    expect(administrationDeliveryExceptionsQuerySchema.parse({}).tab).toBe(
      "FAILED",
    );
    const salespersonId = randomUUID();
    expect(
      administrationOrdersQuerySchema.parse({
        search: "  reference  ",
        salespersonId: salespersonId.toUpperCase(),
      }),
    ).toMatchObject({ search: "reference", salespersonId });
    expect(
      JSON.stringify(administrationOrdersQuerySchema.parse({ search: " " })),
    ).not.toContain("search");
    for (const invalid of [
      { period: "month" },
      { status: "active" },
      { department: "SALES" },
      { role: "ADMIN" },
      { salespersonId: "Name" },
      { search: ["one", "two"] },
      { search: "\u0000" },
      { page: 0 },
      { limit: 101 },
      { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    ])
      expect(administrationOrdersQuerySchema.safeParse(invalid).success).toBe(
        false,
      );
    expect(
      administrationReportPrintQuerySchema.safeParse({ page: 1 }).success,
    ).toBe(false);
  });
  it("admits open/inclusive real calendar dates and rejects impossible or reversed explicit ranges", () => {
    for (const period of ["TODAY", "MONTH", "YEAR", "ALL"])
      expect(
        administrationReportQuerySchema.parse({
          period,
          from: "2024-02-29",
          to: "2024-02-29",
        }),
      ).toMatchObject({ period, from: "2024-02-29", to: "2024-02-29" });
    expect(
      administrationOrdersQuerySchema.safeParse({ from: "0001-01-01" }).success,
    ).toBe(true);
    expect(
      administrationOrdersQuerySchema.safeParse({ to: "9999-12-31" }).success,
    ).toBe(true);
    for (const invalid of [
      { from: "2026-02-29" },
      { to: "2026-13-01" },
      { from: "0000-01-01" },
      { from: "2026-11-16", to: "2026-11-15" },
    ])
      expect(administrationReportQuerySchema.safeParse(invalid).success).toBe(
        false,
      );
  });
});
it("binds read-only incomplete draft detail to its actual root and prohibits physical administrative actions", () => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [{ id: randomUUID() }],
  });
  const { customerId: _customerId, ...fields } = capture;
  const draft = draftSchema.parse({
    ...fields,
    id: randomUUID(),
    version: 1,
    status: "DRAFT",
    owner: { id: randomUUID(), fullName: "Sales" },
    customer: null,
    pieces: capture.pieces.map((piece, index) => ({
      ...piece,
      position: index + 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: {
      availability: "unavailable",
      reason: "CATALOG_NOT_LOADED",
    },
    submission: { available: false, reason: "CATALOG_NOT_LOADED" },
  });
  const detail = {
    kind: "draft",
    draft,
    historyCount: 1,
    adminActions: { canCancel: false, canCorrect: false, canPrint: false },
    context: { orderId: draft.id },
  };
  expect(administrationOrderDataSchema.parse(detail)).toEqual(detail);
  for (const invalid of [
    { ...detail, context: { orderId: randomUUID() } },
    { ...detail, adminActions: { ...detail.adminActions, canCorrect: true } },
    { ...detail, tracking: { counts: noPieces } },
  ])
    expect(administrationOrderDataSchema.safeParse(invalid).success).toBe(
      false,
    );
});
it("requires explicit legacy owner resolution and bounded distinct real owner IDs", () => {
  const owner = { id: randomUUID(), fullName: "Duplicate name", phone: null };
  const options = {
    context: { query: { salespersonName: owner.fullName } },
    salespeople: [owner],
    legacySalesperson: {
      input: owner.fullName,
      match: "UNIQUE",
      salespersonId: owner.id,
    },
  };
  expect(administrationFilterOptionsDataSchema.parse(options)).toEqual(options);
  for (const match of ["MISSING", "AMBIGUOUS"])
    expect(
      administrationFilterOptionsDataSchema.parse({
        ...options,
        legacySalesperson: {
          ...options.legacySalesperson,
          match,
          salespersonId: null,
        },
      }).legacySalesperson?.salespersonId,
    ).toBeNull();
  for (const invalid of [
    { ...options, salespeople: [owner, owner] },
    {
      ...options,
      legacySalesperson: { ...options.legacySalesperson, match: "AMBIGUOUS" },
    },
    {
      ...options,
      legacySalesperson: { ...options.legacySalesperson, salespersonId: null },
    },
  ])
    expect(
      administrationFilterOptionsDataSchema.safeParse(invalid).success,
    ).toBe(false);
});
it("binds history to its fixed root and rejects a value-free summary on the protected full-admin endpoint", () => {
  const orderId = randomUUID();
  const event = {
    id: randomUUID(),
    orderId,
    orderVersion: 2,
    businessNumber: "SHOP-2026-0001",
    operation: "ADMIN_CORRECT",
    actor: {
      id: randomUUID(),
      fullName: "Admin",
      role: "ADMIN",
      department: null,
    },
    occurredAt: instant,
    pieceIds: [],
    changedFields: ["customerAddress"],
  };
  expect(
    administrationActivityDataSchema.safeParse({
      events: [{ kind: "administration", event }],
      pagination: page(1),
      context: { orderId, query: { page: 1, limit: 25 } },
    }).success,
  ).toBe(false);
  expect(
    administrationActivityDataSchema.parse({
      events: [],
      pagination: page(),
      context: { orderId, query: { page: 1, limit: 25 } },
    }),
  ).toMatchObject({ events: [], context: { orderId } });
});

describe("complete operational report output", () => {
  it("keeps all six sections with a separately scoped empty current directory and honest manual endorsement", () => {
    const screen = report();
    expect(administrationReportDataSchema.parse(screen)).toEqual(screen);
    expect(administrationReportPrintDataSchema.parse(printReport())).toEqual(
      expect.objectContaining({
        orders: { items: [], total: 0 },
        exceptionRows: [],
      }),
    );
    for (const invalid of [
      {
        ...screen,
        meta: { ...screen.meta, businessTimeZone: "invalid/calendar" },
      },
      {
        ...screen,
        meta: {
          ...screen.meta,
          effectiveFrom: "2026-11-16",
          effectiveTo: "2026-11-15",
        },
      },
      {
        ...screen,
        endorsements: { mode: "MANUAL", signatories: ["Director"] },
      },
      { ...screen, kpis: { ...screen.kpis, orders: 1 } },
      { ...screen, money: { total: "0.00" } },
    ])
      expect(administrationReportDataSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it("retains complete output beyond the current page and honest null draft contacts/reference", () => {
    const print = printReport(26);
    expect(
      administrationReportPrintDataSchema.parse(print).orders.items,
    ).toHaveLength(26);
    const first = print.orders.items[0];
    if (!first) throw new Error("Missing synthetic report row");
    for (const patch of [
      { displayReference: "Invented" },
      { businessNumber: "SHOP-2026-0001" },
      { counts: { ...noPieces, original: 1, active: 1 } },
      { customer: { ...first.customer, email: "private@example.test" } },
    ])
      expect(
        administrationReportPrintDataSchema.safeParse({
          ...print,
          orders: {
            ...print.orders,
            items: [{ ...first, ...patch }, ...print.orders.items.slice(1)],
          },
        }).success,
      ).toBe(false);
    expect(
      administrationReportPrintDataSchema.safeParse({
        ...print,
        orders: { ...print.orders, total: 25 },
      }).success,
    ).toBe(false);
    expect(
      administrationReportPrintDataSchema.safeParse({
        ...print,
        meta: { ...print.meta, complete: false },
      }).success,
    ).toBe(false);
  });
  it("rejects partial, duplicate or oversized order/roster/exception output", () => {
    const print = printReport(1);
    const first = print.orders.items[0];
    if (!first) throw new Error("Missing synthetic report row");
    expect(
      administrationReportPrintDataSchema.safeParse({
        ...print,
        orders: { items: [first, first], total: 2 },
        meta: { ...print.meta, cohort: { kind: "DRAFT", orderCount: 2 } },
        kpis: { ...print.kpis, orders: 2 },
      }).success,
    ).toBe(false);
    expect(
      administrationReportPrintDataSchema.safeParse(printReport(5001)).success,
    ).toBe(false);
    const staff = {
      id: randomUUID(),
      fullName: "Staff",
      phone: null,
      role: "USER",
      department: "QUALITY",
      status: "ACTIVE",
    };
    expect(
      administrationReportDataSchema.safeParse({
        ...report(),
        workforce: {
          scope: { kind: "CURRENT_DIRECTORY", department: "CUTTING" },
          activeStaff: 1,
          totalStaff: 1,
          items: [staff],
        },
      }).success,
    ).toBe(false);
    const exception = {
      orderId: first.orderId,
      businessNumber: null,
      customerName: null,
      category: "RETURNED_FOR_CORRECTION",
      currentDepartments: [],
      deliveryDate: null,
    };
    expect(
      administrationReportPrintDataSchema.safeParse({
        ...print,
        exceptionRows: [exception, exception],
        exceptions: { ...print.exceptions, categoryCases: 2 },
      }).success,
    ).toBe(false);
    const oversized = printReport(5000);
    expect(
      administrationReportPrintDataSchema.safeParse({
        ...oversized,
        orders: {
          ...oversized.orders,
          items: oversized.orders.items.map((row) => ({
            ...row,
            customer: { ...row.customer, address: "A".repeat(2000) },
          })),
        },
      }).success,
    ).toBe(false);
  });
});

it("rejects inconsistent paged echoes, filtered totals and fabricated cycle dates", () => {
  const query = administrationCorrectionsQuerySchema.parse({});
  const cycle = {
    id: randomUUID(),
    orderId: randomUUID(),
    businessNumber: "SHOP-2026-0001",
    customerName: "Customer",
    pieceId: randomUUID(),
    position: 1,
    model: "Model",
    target: "PRODUCTION",
    cycle: 1,
    state: "OPEN",
    reason: "Bond failure",
    instructions: "Rebond",
    rejectedAt: instant,
    resolvedAt: null,
  };
  const cycles = {
    items: [cycle],
    pagination: page(1),
    counts: { active: 1, resolved: 0, all: 1, activePieces: 1 },
    context: { query },
  };
  expect(administrationCorrectionsDataSchema.parse(cycles)).toEqual(cycles);
  for (const invalid of [
    { ...cycles, context: { query: { ...query, page: 2 } } },
    { ...cycles, items: [] },
    { ...cycles, items: [{ ...cycle, state: "ACCEPTED" }] },
    { ...cycles, items: [{ ...cycle, rejectedAt: null }] },
  ])
    expect(administrationCorrectionsDataSchema.safeParse(invalid).success).toBe(
      false,
    );
  const orders = {
    items: [],
    pagination: page(),
    totalOrders: 0,
    totalPieces: 0,
    statusCounts: {
      DRAFT: 0,
      AWAITING_APPROVAL: 0,
      RETURNED: 0,
      APPROVED: 0,
      READY_FOR_DELIVERY: 0,
      OUT_FOR_DELIVERY: 0,
      DELIVERY_FAILED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    },
    context: { query: administrationOrdersQuerySchema.parse({}) },
  };
  expect(administrationOrdersDataSchema.parse(orders)).toEqual(orders);
  expect(
    administrationOrdersDataSchema.safeParse({
      ...orders,
      context: { query: { ...orders.context.query, limit: 100 } },
    }).success,
  ).toBe(false);
});
