import {
  authUserDataSchema,
  administrationReportPrintDataSchema,
  administrationReportPrintQuerySchema,
  administrationCommandBodySchema,
  administrationCommandDataSchema,
  administrationOrderDataSchema,
  administrationCommandFactsSchema,
  administrationActivityEventSchema,
} from "@template/contracts";
import {
  orderFixture,
  draftFixture,
  p03Ids,
  p03Instant,
  p03Session,
} from "./p03-fixtures";

export const p08AdminSession = () =>
  authUserDataSchema.parse({
    user: {
      ...p03Session().user,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    },
  });
export const p08DraftDetailFixture = (version = 1) =>
  administrationOrderDataSchema.options[0].parse({
    kind: "draft",
    draft: draftFixture(version),
    historyCount: 0,
    adminActions: { canCancel: false, canCorrect: false, canPrint: false },
    context: { orderId: p03Ids.order },
  });
export const p08CommandFactsFixture = (version = 1) => {
  const order = orderFixture(version);
  return administrationCommandFactsSchema.parse({
    version,
    status: order.status,
    counts: order.counts,
    money: order.money,
    correction: {
      generalNotes: order.generalNotes,
      customerName: order.customerSnapshot.name,
      customerPhone: order.customerSnapshot.phone,
      customerEmail: order.customerSnapshot.email,
      customerAddress: order.customerSnapshot.address,
    },
    pieces: order.pieces.map((piece) => ({
      id: piece.id,
      stage: piece.stage,
      workState: piece.workState,
      issueId: null,
      currentWorkVisitId: null,
      receivedAt: piece.receivedAt,
      cancelledAt: piece.cancelledAt,
      cancellationReason: piece.cancellationReason,
    })),
    returnProof: null,
  });
};
export const p08DetailFixture = (version = 1) => {
  const order = orderFixture(version),
    facts = p08CommandFactsFixture(version);
  return administrationOrderDataSchema.options[1].parse({
    kind: "submitted",
    order,
    historyCount: 0,
    tracking: {
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
    },
    adminActions: { canCancel: true, canCorrect: true, canPrint: false },
    cancellationCandidates: order.pieces.map((piece) => ({
      pieceId: piece.id,
      position: piece.position,
      model: piece.model,
      stage: piece.stage,
      workState: piece.workState,
      receivedAt: piece.receivedAt,
      eligible: true,
      denialReason: null,
    })),
    correction: {
      originalSubmitted: facts.correction,
      effective: facts.correction,
      lastCorrection: null,
    },
    context: { orderId: order.id },
  });
};
export const p08CorrectionEventFixture = () => {
  const before = p08CommandFactsFixture(),
    after = p08CommandFactsFixture(2);
  after.correction.customerAddress = "Corrected order-only address";
  return administrationActivityEventSchema.parse({
    id: p03Ids.command,
    orderId: p03Ids.order,
    orderVersion: 2,
    businessNumber: "SHOP-2026-0001",
    operation: "ADMIN_CORRECT",
    actor: {
      id: p03Ids.actor,
      fullName: "Actual administrator",
      role: "ADMIN",
      department: null,
    },
    occurredAt: p03Instant,
    pieceIds: [],
    changedFields: ["customerAddress"],
    reason: "Confirmed contact correction",
    before,
    after,
  });
};

export const p08CorrectionCommandFixture = () => {
  const event = p08CorrectionEventFixture();
  const body = administrationCommandBodySchema.parse({
    commandId: event.id,
    operation: "ADMIN_CORRECT",
    orderId: event.orderId,
    expectedVersion: event.before.version,
    patch: { customerAddress: event.after.correction.customerAddress },
    reason: event.reason,
  });
  if (body.operation !== "ADMIN_CORRECT")
    throw new Error("Expected owned correction intent");
  const result = administrationCommandDataSchema.parse({
    receipt: {
      commandId: event.id,
      operation: event.operation,
      orderId: event.orderId,
      beforeVersion: event.before.version,
      afterVersion: event.after.version,
      actor: event.actor,
      occurredAt: event.occurredAt,
    },
    replayed: false,
    result: {
      orderId: event.orderId,
      version: event.after.version,
      status: event.after.status,
      counts: event.after.counts,
      money: event.after.money,
      correction: event.after.correction,
      pieceIds: event.pieceIds,
    },
    before: event.before,
    after: event.after,
  });
  return { body, result };
};

export const p08ReportPrintFixture = () =>
  administrationReportPrintDataSchema.parse({
    meta: {
      generatedAt: p03Instant,
      businessDate: "2026-11-06",
      businessTimeZone: "Asia/Riyadh",
      generatedBy: { id: p03Ids.actor, fullName: "Actual administrator" },
      filters: administrationReportPrintQuerySchema.parse({}),
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
    departments: [],
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
    orders: { items: [], total: 0 },
    exceptionRows: [],
  });
