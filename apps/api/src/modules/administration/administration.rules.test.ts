import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Prisma } from "@template/database";
import { administrationCommandBodySchema } from "@template/contracts";
import type { AdministrationRootRecord } from "./administration.types.js";
import type { AuthorityAccount } from "../auth/account-authority.js";
import {
  mapAdministrationCommandFacts,
  planAdministrativeCancellation,
  planAdministrativeCorrection,
  resolveAdministrationPeriod,
} from "./administration.rules.js";

const occurredAt = new Date("2026-11-16T12:00:00Z");
const actor: AuthorityAccount = {
  id: randomUUID(),
  email: "admin@example.test",
  fullName: "Admin",
  phone: null,
  role: "ADMIN",
  status: "ACTIVE",
  department: null,
  staffApprovedAt: null,
  staffApprovedById: null,
  accessVersion: 1,
  emailVerifiedAt: occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
};
const fixture = (): AdministrationRootRecord => {
  const id = randomUUID(),
    customerId = randomUUID(),
    catalogSourceId = randomUUID();
  return {
    id,
    version: 5,
    status: "SUBMITTED",
    ownerId: actor.id,
    customerId,
    type: "SHOP",
    deliveryDate: null,
    generalNotes: "Original notes",
    responsibleSignature: null,
    repairNote: null,
    adjustmentRequested: null,
    adjustmentReason: null,
    adjustmentActionTaken: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    owner: { id: actor.id, fullName: actor.fullName },
    order: {
      id,
      status: "READY_FOR_DELIVERY",
      businessNumber: "SHOP-2026-0001",
      numberSequence: 1n,
      numberYear: 2026,
      submittedAt: occurredAt,
      submittedById: actor.id,
      ownerFullNameAtSubmission: actor.fullName,
      customerName: "Original name",
      customerPhone: "+966500000001",
      customerEmail: "original@example.test",
      customerAddress: "Original address",
      administrationCorrections: [],
      catalogSourceId,
      totalAmount: new Prisma.Decimal("200.00"),
      paidAmount: new Prisma.Decimal("150.00"),
      approvedAt: occurredAt,
      currentReturnDecisionId: null,
      currentReturnOrderVersion: null,
      currentReturnReason: null,
      currentReturnedAt: null,
      approvalCommands: [],
      warehouseCommandOrders: [],
    },
    pieces: [0, 1].map((position) => {
      const pieceId = randomUUID();
      return {
        id: pieceId,
        position,
        quantity: 1,
        model: "Model",
        size: "42",
        leatherBase: "Leather",
        decoration: "Decoration",
        decorationColor: null,
        faceRight: null,
        faceLeft: null,
        mixing: null,
        face: null,
        sole: null,
        soleAddition: null,
        soleColor: null,
        additions: null,
        aField: null,
        fField: null,
        sideNotes: null,
        catalogSelections: [],
        orderPiece: {
          id: pieceId,
          orderId: id,
          decorationEntryId: randomUUID(),
          priceSourceId: catalogSourceId,
          decorationLabel: "Decoration",
          unitPrice: new Prisma.Decimal("100.00"),
          priceSourceCell: "AA3",
          stage: "WAREHOUSE",
          workState: "COMPLETED",
          issueId: null,
          receivedAt: occurredAt,
          cancelledAt: null,
          cancellationReason: null,
          currentWorkVisitId: null,
          currentIssue: null,
          qualityVisits: [],
          qualityCorrections: [],
        },
      };
    }),
  };
};
const cancel = (
  root: AdministrationRootRecord,
  pieceIds = root.pieces.map((piece) => piece.id),
  scope: "ORDER" | "ITEM" | "QUANTITY" = "ORDER",
) => {
  const body = administrationCommandBodySchema.parse({
    commandId: randomUUID(),
    operation: "ADMIN_CANCEL",
    orderId: root.id,
    expectedVersion: root.version,
    scope,
    pieceIds,
  });
  if (body.operation !== "ADMIN_CANCEL")
    throw new Error("Cancellation fixture required");
  return planAdministrativeCancellation({ root, body, actor, occurredAt });
};

it("cancels exact received pieces using frozen prices, retaining receipt, paid and companion facts", () => {
  const root = fixture(),
    snapshot = structuredClone(mapAdministrationCommandFacts(root)),
    selected = root.pieces[0];
  if (!selected) throw new Error("Piece required");
  const plan = cancel(root, [selected.id], "ITEM");
  expect(plan.after.money).toEqual({
    total: "100.00",
    paidAmount: "150.00",
    remainingDue: "0.00",
    surplus: "50.00",
  });
  expect(plan.after.counts).toEqual({
    original: 2,
    cancelled: 1,
    active: 1,
    received: 1,
    completionPercent: 100,
  });
  expect(plan.after.pieces[0]).toMatchObject({
    id: selected.id,
    stage: "CANCELLED",
    workState: "BLOCKED",
    receivedAt: occurredAt.toISOString(),
    cancelledAt: occurredAt.toISOString(),
  });
  expect(plan.after.pieces[1]).toEqual(snapshot.pieces[1]);
  expect(mapAdministrationCommandFacts(root)).toEqual(snapshot);
  expect(cancel(root).after).toMatchObject({
    status: "CANCELLED",
    counts: { active: 0, completionPercent: 0 },
    money: { total: "0.00", paidAmount: "150.00", surplus: "150.00" },
  });
});

it.each(["AWAITING_APPROVAL", "RETURNED", "DELIVERY_FAILED"] as const)(
  "retains %s for partial cancellation and carries only current returned proof",
  (status) => {
    const root = fixture(),
      header = root.order;
    if (!header) throw new Error("Header required");
    header.status = status;
    if (status === "RETURNED")
      Object.assign(header, {
        currentReturnDecisionId: randomUUID(),
        currentReturnOrderVersion: root.version,
        currentReturnReason: "Review",
        currentReturnedAt: occurredAt,
      });
    if (status === "DELIVERY_FAILED")
      header.warehouseCommandOrders = [
        {
          attempt: {
            id: randomUUID(),
            members: root.pieces.map((piece) => ({ pieceId: piece.id })),
            outcome: { kind: "FAILED", returnedToWarehouse: true },
            retry: null,
          },
        },
      ];
    const plan = cancel(root, [root.pieces[0]?.id ?? ""], "QUANTITY");
    expect(plan.after.status).toBe(status);
    expect(plan.after.returnProof).toEqual(
      status === "RETURNED" ? { ...plan.before.returnProof, version: 6 } : null,
    );
    expect(cancel(root).after.returnProof).toBeNull();
  },
);

it("rejects unresolved custody, changed full selection, foreign, cancelled and duplicate members atomically", () => {
  const root = fixture(),
    first = root.pieces[0];
  if (!first) throw new Error("Piece required");
  expect(() => cancel(root, [first.id])).toThrow(
    expect.objectContaining({ code: "ADMINISTRATION_SELECTION_CONFLICT" }),
  );
  expect(() => cancel(root, [randomUUID()], "ITEM")).toThrow(
    expect.objectContaining({ code: "ORDER_NOT_FOUND" }),
  );
  for (const status of ["OUT_FOR_DELIVERY", "DELIVERED"] as const) {
    if (root.order) root.order.status = status;
    expect(() => cancel(root)).toThrow(
      expect.objectContaining({ code: "ORDER_STATE_CONFLICT" }),
    );
  }
  if (root.order) {
    root.order.status = "READY_FOR_DELIVERY";
    root.order.warehouseCommandOrders = [
      {
        attempt: { id: randomUUID(), members: [], outcome: null, retry: null },
      },
    ];
  }
  expect(() => cancel(root)).toThrow(
    expect.objectContaining({ code: "ORDER_STATE_CONFLICT" }),
  );
});

it("corrects any submitted terminal order without changing lifecycle, money, pieces or original contacts", () => {
  const root = fixture();
  if (!root.order) throw new Error("Header required");
  root.order.status = "DELIVERED";
  const before = mapAdministrationCommandFacts(root),
    body = administrationCommandBodySchema.parse({
      commandId: randomUUID(),
      operation: "ADMIN_CORRECT",
      orderId: root.id,
      expectedVersion: root.version,
      patch: { customerName: "  Current name  ", customerEmail: null },
      reason: "  Correct transcription  ",
    });
  if (body.operation !== "ADMIN_CORRECT")
    throw new Error("Correction required");
  const plan = planAdministrativeCorrection({
    root,
    body,
    actor,
    occurredAt,
    effective: before.correction,
  });
  expect(plan.changedFields).toEqual(["customerEmail", "customerName"]);
  expect(plan.after).toMatchObject({
    version: 6,
    status: "DELIVERED",
    pieces: before.pieces,
    money: before.money,
    correction: {
      customerName: "Current name",
      customerEmail: null,
      customerPhone: before.correction.customerPhone,
      generalNotes: before.correction.generalNotes,
    },
  });
  expect(root.order.customerName).toBe("Original name");
  expect(() =>
    planAdministrativeCorrection({
      root,
      body: { ...body, patch: { customerName: "Original name" } },
      actor,
      occurredAt,
      effective: before.correction,
    }),
  ).toThrow(
    expect.objectContaining({ code: "ADMINISTRATION_CORRECTION_UNCHANGED" }),
  );
});

it("rejects stale and exhausted versions before planning effects", () => {
  const root = fixture();
  root.version = 2_147_483_647;
  const body = {
    commandId: randomUUID(),
    operation: "ADMIN_CANCEL" as const,
    orderId: root.id,
    expectedVersion: 5,
    scope: "ORDER" as const,
    pieceIds: root.pieces.map((piece) => piece.id),
    reason: null,
  };
  expect(() =>
    planAdministrativeCancellation({ root, body, actor, occurredAt }),
  ).toThrow(expect.objectContaining({ code: "ORDER_VERSION_CONFLICT" }));
});

it.each([
  ["TODAY", "2026-03-08T04:30:00Z", "2026-03-07", "2026-03-07"],
  ["MONTH", "2026-11-01T03:30:00Z", "2026-10-01", "2026-10-31"],
  ["YEAR", "2027-01-01T04:30:00Z", "2026-01-01", "2026-12-31"],
  ["ALL", "2026-11-01T05:30:00Z", null, null],
] as const)(
  "resolves %s in the explicit business calendar at DST/year boundaries",
  (period, instant, from, to) => {
    expect(
      resolveAdministrationPeriod(
        { search: undefined, period },
        new Date(instant),
        "America/New_York",
      ),
    ).toMatchObject({ effectiveFrom: from, effectiveTo: to });
  },
);
it("uses explicit endpoints and rejects absent calendars or effective reversed dates", () => {
  expect(
    resolveAdministrationPeriod(
      { search: undefined, period: "MONTH", from: "2026-01-01" },
      occurredAt,
      "Africa/Cairo",
    ),
  ).toMatchObject({ effectiveFrom: "2026-01-01", effectiveTo: "2026-11-16" });
  expect(() =>
    resolveAdministrationPeriod(
      { search: undefined, period: "ALL" },
      occurredAt,
      null,
    ),
  ).toThrow(expect.objectContaining({ code: "ORDER_CALENDAR_UNAVAILABLE" }));
  expect(() =>
    resolveAdministrationPeriod(
      { search: undefined, period: "TODAY", from: "2026-12-01" },
      occurredAt,
      "Africa/Cairo",
    ),
  ).toThrow();
});
