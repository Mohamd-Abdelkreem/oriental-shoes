import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  manufacturingCommandBodySchema,
  manufacturingCommandDataSchema,
  type ManufacturingCommandData,
  type ManufacturingCommandBody,
} from "./manufacturing-command.schema.ts";
import { draftCaptureSchema } from "../sales-drafts/sales-drafts.schema.ts";
import { salesActivityItemSchema } from "../sales-orders/sales-orders.schema.ts";
import {
  manufacturingWorkVisitSchema,
  manufacturingOrderDataSchema,
  manufacturingOrdersQuerySchema,
  manufacturingPiecesQuerySchema,
  manufacturingOrdersDataSchema,
  manufacturingPiecesDataSchema,
  manufacturingDashboardDataSchema,
  manufacturingActivityDataSchema,
  manufacturingIssueActivityEventSchema,
  type ManufacturingOrderData,
  type ManufacturingWorkVisit,
} from "./manufacturing.schema.ts";
import { manufacturingActivityEventSchema } from "./manufacturing-event.schema.ts";

const requiredAt = <T>(entries: readonly T[], index: number): T => {
  const entry = entries[index];
  if (entry === undefined) throw new Error("Missing fixture entry");
  return entry;
};

const selection = (): ManufacturingCommandBody => ({
  commandId: randomUUID(),
  operation: "RECEIVE_AND_START" as const,
  orders: Array.from({ length: 2 }, () => ({
    orderId: randomUUID(),
    expectedVersion: 2,
    pieceIds: [randomUUID()],
  })),
});
const acceptedWork = (
  department: "CUTTING" | "PRODUCTION" = "CUTTING",
  operation: ManufacturingCommandData["receipt"]["operation"] = "RECEIVE_AND_START",
): ManufacturingCommandData => ({
  kind: "manufacturing-command",
  receipt: {
    commandId: randomUUID(),
    department,
    operation,
    actor: { id: randomUUID(), fullName: "Worker A", role: "USER", department },
    occurredAt: "2026-11-11T10:00:00.000Z",
  },
  replayed: false,
  outcome: {
    orders: Array.from({ length: 2 }, () => ({
      eventId: randomUUID(),
      orderId: randomUUID(),
      beforeVersion: 2,
      afterVersion: 3,
      pieces: [
        {
          pieceId: randomUUID(),
          visitId: randomUUID(),
          nextVisitId:
            operation === "COMPLETE_TRANSFER" && department === "CUTTING"
              ? randomUUID()
              : null,
          stage:
            operation === "COMPLETE_TRANSFER"
              ? department === "CUTTING"
                ? "PRODUCTION"
                : "QUALITY"
              : department,
          workState:
            operation === "COMPLETE_TRANSFER" ? "INCOMING" : "IN_PROGRESS",
        },
      ],
    })),
  },
});

describe("exact manufacturing command intent", () => {
  it("retains exact cross-order membership and normalizes UUID case without choosing workers", () => {
    const body = selection();
    const first = requiredAt(body.orders, 0);
    first.pieceIds = first.pieceIds.map((id) => id.toUpperCase());
    expect(manufacturingCommandBodySchema.parse(body)).toEqual({
      ...body,
      orders: body.orders.map((order) => ({
        ...order,
        pieceIds: order.pieceIds.map((id) => id.toLowerCase()),
      })),
    });
  });

  it.each([
    [
      "empty orders",
      (body: ReturnType<typeof selection>) => ({ ...body, orders: [] }),
    ],
    [
      "empty pieces",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: [{ ...body.orders[0], pieceIds: [] }],
      }),
    ],
    [
      "duplicate orders",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: [body.orders[0], body.orders[0]],
      }),
    ],
    [
      "duplicate piece in one group",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: [
          {
            ...body.orders[0],
            pieceIds: [
              requiredAt(body.orders, 0).pieceIds[0],
              requiredAt(body.orders, 0).pieceIds[0],
            ],
          },
        ],
      }),
    ],
    [
      "piece repeated across orders",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: body.orders.map((order) => ({
          ...order,
          pieceIds: requiredAt(body.orders, 0).pieceIds,
        })),
      }),
    ],
    [
      "aggregate budget overflow",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: body.orders.map((order, index) => ({
          ...order,
          pieceIds: Array.from({ length: 100 + index }, () => randomUUID()),
        })),
      }),
    ],
    [
      "zero version",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: [{ ...body.orders[0], expectedVersion: 0 }],
      }),
    ],
    [
      "actor injection",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        actorId: randomUUID(),
      }),
    ],
    [
      "visit injection",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        orders: [{ ...body.orders[0], visitId: randomUUID() }],
      }),
    ],
    [
      "alternate destination",
      (body: ReturnType<typeof selection>) => ({
        ...body,
        destination: "QUALITY",
      }),
    ],
  ])("rejects %s as a whole input", (_label, invalid) => {
    expect(
      manufacturingCommandBodySchema.safeParse(invalid(selection())).success,
    ).toBe(false);
  });

  it("accepts the full technical budget without changing the original membership", () => {
    const body = selection();
    body.orders = [
      {
        orderId: randomUUID(),
        expectedVersion: 2_147_483_647,
        pieceIds: Array.from({ length: 200 }, () => randomUUID()),
      },
    ];
    expect(manufacturingCommandBodySchema.parse(body)).toEqual(body);
    const manyOrders = {
      ...body,
      orders: Array.from({ length: 200 }, () => ({
        orderId: randomUUID(),
        expectedVersion: 1,
        pieceIds: [randomUUID()],
      })),
    };
    expect(manufacturingCommandBodySchema.parse(manyOrders)).toEqual(
      manyOrders,
    );
    expect(
      manufacturingCommandBodySchema.safeParse({
        ...manyOrders,
        orders: [
          ...manyOrders.orders,
          {
            orderId: randomUUID(),
            expectedVersion: 1,
            pieceIds: [randomUUID()],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("immutable manufacturing result", () => {
  it("validates the exact 200-piece result budget across order boundaries", () => {
    const receipt = acceptedWork();
    receipt.outcome.orders = receipt.outcome.orders.map((order, index) => ({
      ...order,
      pieces: Array.from({ length: 100 + index }, () => ({
        pieceId: randomUUID(),
        visitId: randomUUID(),
        nextVisitId: null,
        stage: "CUTTING",
        workState: "IN_PROGRESS",
      })),
    }));
    expect(manufacturingCommandDataSchema.safeParse(receipt).success).toBe(
      false,
    );
    requiredAt(receipt.outcome.orders, 1).pieces.pop();
    expect(manufacturingCommandDataSchema.parse(receipt)).toEqual(receipt);
  });
  it.each([
    ["CUTTING", "RECEIVE_AND_START"],
    ["PRODUCTION", "RECEIVE_AND_START"],
    ["CUTTING", "CONTINUE"],
    ["PRODUCTION", "CONTINUE"],
    ["CUTTING", "COMPLETE_TRANSFER"],
    ["PRODUCTION", "COMPLETE_TRANSFER"],
  ] as const)(
    "accepts %s %s with the normal route and exact source/next visits",
    (department, operation) => {
      const receipt = acceptedWork(department, operation);
      expect(manufacturingCommandDataSchema.parse(receipt)).toEqual(receipt);
      expect(
        manufacturingCommandDataSchema.parse({ ...receipt, replayed: true })
          .replayed,
      ).toBe(true);
    },
  );

  it.each([
    [
      "wrong captured department",
      (receipt: ManufacturingCommandData) => {
        receipt.receipt.actor.department = "PRODUCTION";
      },
    ],
    [
      "missing new production visit",
      (receipt: ManufacturingCommandData) => {
        requiredAt(
          requiredAt(receipt.outcome.orders, 0).pieces,
          0,
        ).nextVisitId = null;
      },
    ],
    [
      "skipped production",
      (receipt: ManufacturingCommandData) => {
        requiredAt(requiredAt(receipt.outcome.orders, 0).pieces, 0).stage =
          "QUALITY";
      },
    ],
    [
      "wrong work state",
      (receipt: ManufacturingCommandData) => {
        requiredAt(requiredAt(receipt.outcome.orders, 0).pieces, 0).workState =
          "COMPLETED";
      },
    ],
    [
      "unchanged version",
      (receipt: ManufacturingCommandData) => {
        requiredAt(receipt.outcome.orders, 0).afterVersion = 2;
      },
    ],
    [
      "duplicate order event",
      (receipt: ManufacturingCommandData) => {
        requiredAt(receipt.outcome.orders, 1).eventId = requiredAt(
          receipt.outcome.orders,
          0,
        ).eventId;
      },
    ],
    [
      "duplicate result piece",
      (receipt: ManufacturingCommandData) => {
        requiredAt(requiredAt(receipt.outcome.orders, 1).pieces, 0).pieceId =
          requiredAt(requiredAt(receipt.outcome.orders, 0).pieces, 0).pieceId;
      },
    ],
    [
      "reused source as destination",
      (receipt: ManufacturingCommandData) => {
        requiredAt(
          requiredAt(receipt.outcome.orders, 0).pieces,
          0,
        ).nextVisitId = requiredAt(
          requiredAt(receipt.outcome.orders, 0).pieces,
          0,
        ).visitId;
      },
    ],
  ])("rejects %s", (_label, invalidate) => {
    const receipt = acceptedWork("CUTTING", "COMPLETE_TRANSFER");
    invalidate(receipt);
    expect(manufacturingCommandDataSchema.safeParse(receipt).success).toBe(
      false,
    );
  });

  it("rejects a private nested snapshot and version overflow while allowing the actual ADMIN identity", () => {
    const receipt = acceptedWork();
    const order = requiredAt(receipt.outcome.orders, 0);
    expect(
      manufacturingCommandDataSchema.safeParse({
        ...receipt,
        outcome: { orders: [{ ...order, money: { total: "1.00" } }] },
      }).success,
    ).toBe(false);
    order.beforeVersion = 2_147_483_647;
    order.afterVersion = 2_147_483_648;
    expect(manufacturingCommandDataSchema.safeParse(receipt).success).toBe(
      false,
    );
    const adminReceipt = acceptedWork();
    adminReceipt.receipt.actor = {
      id: randomUUID(),
      fullName: "Admin",
      role: "ADMIN",
      department: null,
    };
    expect(
      manufacturingCommandDataSchema.parse(adminReceipt).receipt.actor,
    ).toEqual(adminReceipt.receipt.actor);
  });
});

const safeDetail = (): ManufacturingOrderData => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [
      {
        id: randomUUID(),
        model: "SM",
        soleAddition: "floor",
        additions: "other",
      },
    ],
  });
  const piece = requiredAt(capture.pieces, 0);
  const { catalogSelections: _catalogSelections, ...specifications } = piece;
  const visit: ManufacturingWorkVisit = {
    id: randomUUID(),
    pieceId: piece.id,
    department: "CUTTING",
    sequence: 1,
    origin: {
      kind: "INITIAL_APPROVAL",
      sourceDepartment: "APPROVAL",
      eventId: randomUUID(),
      issueId: null,
      referenceId: null,
      correctionCycle: null,
      instructions: null,
    },
    enteredAt: "2026-11-11T09:00:00.000Z",
    receivedAt: null,
    startedAt: null,
    endedAt: null,
    receivedBy: null,
    startedBy: null,
    endedBy: null,
    endReason: null,
    destination: null,
    legacyUnknownStart: false,
  };
  return {
    department: "CUTTING",
    paper: {
      order: {
        id: randomUUID(),
        version: 2,
        type: "SHOP",
        status: "APPROVED",
        businessNumber: "SHOP-2026-0001",
        customerName: "Customer",
        deliveryDate: null,
        generalNotes: null,
        repairNote: null,
        adjustmentRequested: null,
        adjustmentReason: null,
        adjustmentActionTaken: null,
        counts: {
          original: 1,
          active: 1,
          cancelled: 0,
          received: 0,
          completionPercent: 0,
        },
        pieces: [
          {
            ...specifications,
            position: 1,
            quantity: 1,
            stage: "CUTTING",
            workState: "INCOMING",
            receivedAt: null,
            cancelledAt: null,
            cancellationReason: null,
          },
        ],
      },
      issues: [],
    },
    work: [
      {
        pieceId: piece.id,
        visit,
        lastAction: null,
        isReturned: false,
        allowedActions: {
          canReceiveAndStart: true,
          canContinue: false,
          canCompleteTransfer: false,
          canReportIssue: true,
        },
      },
    ],
  };
};
const emptyPagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe("safe factory detail and visit provenance", () => {
  it("retains original distinct specification fields and one context for each physical piece", () => {
    const detail = safeDetail();
    expect(manufacturingOrderDataSchema.parse(detail)).toEqual(detail);
    expect(
      requiredAt(
        manufacturingOrderDataSchema.parse(detail).paper.order.pieces,
        0,
      ),
    ).toMatchObject({ soleAddition: "floor", additions: "other" });
  });

  it.each([
    [
      "missing context",
      (detail: ManufacturingOrderData) => {
        detail.work = [];
      },
    ],
    [
      "duplicate context",
      (detail: ManufacturingOrderData) => {
        detail.work.push(requiredAt(detail.work, 0));
      },
    ],
    [
      "foreign context",
      (detail: ManufacturingOrderData) => {
        requiredAt(detail.work, 0).pieceId = randomUUID();
      },
    ],
    [
      "foreign department visit",
      (detail: ManufacturingOrderData) => {
        const visit = requiredAt(detail.work, 0).visit;
        if (visit) visit.department = "PRODUCTION";
      },
    ],
  ])("rejects %s", (_label, invalidate) => {
    const detail = safeDetail();
    invalidate(detail);
    expect(manufacturingOrderDataSchema.safeParse(detail).success).toBe(false);
  });

  it("rejects finance hidden in paper and an omitted nullable response witness", () => {
    const detail = safeDetail();
    expect(
      manufacturingOrderDataSchema.safeParse({
        ...detail,
        paper: {
          ...detail.paper,
          order: { ...detail.paper.order, money: { total: "1.00" } },
        },
      }).success,
    ).toBe(false);
    const { endedBy: _endedBy, ...withoutWitness } =
      requiredAt(detail.work, 0).visit ?? {};
    expect(manufacturingWorkVisitSchema.safeParse(withoutWitness).success).toBe(
      false,
    );
  });

  it("accepts honest unknown baseline and ended history without assigning historical actions", () => {
    const detail = safeDetail();
    const work = requiredAt(detail.work, 0);
    const visit = manufacturingWorkVisitSchema.parse({
      ...work.visit,
      origin: {
        kind: "LEGACY_BASELINE",
        sourceDepartment: null,
        eventId: null,
        issueId: null,
        referenceId: null,
        correctionCycle: null,
        instructions: null,
      },
      enteredAt: null,
      legacyUnknownStart: true,
    });
    expect(manufacturingWorkVisitSchema.parse(visit).startedBy).toBeNull();
    expect(
      manufacturingWorkVisitSchema.safeParse({
        ...work.visit,
        legacyUnknownStart: true,
      }).success,
    ).toBe(true);
    expect(
      manufacturingWorkVisitSchema.safeParse({
        ...visit,
        startedAt: "2026-11-11T10:00:00.000Z",
        startedBy: {
          id: randomUUID(),
          fullName: "Invented legacy start",
          role: "ADMIN",
          department: null,
        },
      }).success,
    ).toBe(false);
    const ended = {
      ...visit,
      endedAt: "2026-11-11T10:00:00.000Z",
      endedBy: {
        id: randomUUID(),
        fullName: "Approval",
        role: "USER",
        department: "APPROVAL",
      },
      endReason: "ISSUE_REPORTED",
    };
    expect(manufacturingWorkVisitSchema.safeParse(ended).success).toBe(true);
    expect(
      manufacturingOrderDataSchema.safeParse({
        ...detail,
        work: [{ ...work, visit: ended }],
      }).success,
    ).toBe(false);
    const noActions = {
      canReceiveAndStart: false,
      canContinue: false,
      canCompleteTransfer: false,
      canReportIssue: false,
    };
    expect(
      manufacturingOrderDataSchema.safeParse({
        ...detail,
        work: [{ ...work, visit: ended, allowedActions: noActions }],
      }).success,
    ).toBe(true);
    expect(
      manufacturingOrderDataSchema.safeParse({
        ...detail,
        work: [{ ...work, visit: null, allowedActions: noActions }],
      }).success,
    ).toBe(true);
  });
});

describe("bounded department reads", () => {
  it("normalizes blank and literal search without widening list budgets", () => {
    expect(
      manufacturingOrdersQuerySchema.parse({ view: "INCOMING", search: "  " }),
    ).toEqual({ view: "INCOMING", page: 1, limit: 25, search: undefined });
    expect(
      manufacturingPiecesQuerySchema.parse({
        view: "RETURNED",
        page: "2",
        limit: "100",
        search: "  A_%  ",
      }).search,
    ).toBe("A_%");
    for (const query of [
      { view: "INCOMING", limit: 26 },
      { view: "INCOMING", search: "x".repeat(151) },
      { view: "INCOMING", search: "a\u0000" },
      { view: "INCOMING", phone: "private" },
      { view: "INCOMING", page: Number.MAX_SAFE_INTEGER },
    ])
      expect(manufacturingOrdersQuerySchema.safeParse(query).success).toBe(
        false,
      );
  });

  it("accepts actual empty grouped and flat pages, rejecting divergent totals and count authority", () => {
    const page = {
      department: "CUTTING",
      view: "INCOMING",
      items: [],
      counts: { orders: 0, pieces: 0 },
      pagination: emptyPagination,
    };
    expect(manufacturingOrdersDataSchema.safeParse(page).success).toBe(true);
    expect(manufacturingPiecesDataSchema.safeParse(page).success).toBe(true);
    expect(
      manufacturingOrdersDataSchema.safeParse({
        ...page,
        counts: { orders: 1, pieces: 2 },
      }).success,
    ).toBe(false);
    expect(
      manufacturingPiecesDataSchema.safeParse({
        ...page,
        counts: { orders: 2, pieces: 1 },
      }).success,
    ).toBe(false);
    const zero = { orders: 0, pieces: 0 };
    const dashboard = {
      department: "CUTTING",
      counts: {
        incoming: zero,
        inProgress: zero,
        returned: zero,
        completed: zero,
        repairs: zero,
      },
      recentOrders: [],
    };
    expect(manufacturingDashboardDataSchema.safeParse(dashboard).success).toBe(
      true,
    );
    expect(
      manufacturingDashboardDataSchema.safeParse({
        ...dashboard,
        counts: { ...dashboard.counts, repairs: { orders: 1, pieces: 1 } },
      }).success,
    ).toBe(false);
  });
});

describe("safe manufacturing activity compatibility", () => {
  it("adds an order-scoped work event to the existing closed activity union without importing full reads into events", () => {
    const command = acceptedWork("CUTTING", "COMPLETE_TRANSFER");
    const order = requiredAt(command.outcome.orders, 0);
    const event = {
      id: order.eventId,
      commandId: command.receipt.commandId,
      orderId: order.orderId,
      orderVersion: order.afterVersion,
      businessNumber: "SHOP-2026-0001",
      department: command.receipt.department,
      operation: command.receipt.operation,
      actor: command.receipt.actor,
      occurredAt: command.receipt.occurredAt,
      pieces: order.pieces,
      destination: "PRODUCTION",
    };
    expect(manufacturingActivityEventSchema.parse(event)).toEqual(event);
    expect(
      salesActivityItemSchema.parse({ kind: "manufacturing", event }),
    ).toEqual({ kind: "manufacturing", event });
    expect(
      manufacturingActivityEventSchema.safeParse({
        ...event,
        destination: "QUALITY",
      }).success,
    ).toBe(false);
    const page = {
      department: "CUTTING",
      events: [{ kind: "manufacturing", event }],
      pagination: { ...emptyPagination, total: 1, totalPages: 1 },
    };
    expect(manufacturingActivityDataSchema.safeParse(page).success).toBe(true);
    expect(
      manufacturingActivityDataSchema.safeParse({
        ...page,
        department: "PRODUCTION",
      }).success,
    ).toBe(false);
  });

  it("keeps private contact text out of held issue history and rejects contradictory decisions", () => {
    const event = {
      id: randomUUID(),
      commandId: "",
      orderId: randomUUID(),
      orderVersion: 4,
      businessNumber: "SHOP-2026-0001",
      pieceId: randomUUID(),
      issueId: randomUUID(),
      department: "CUTTING",
      sourceDepartment: "CUTTING",
      operation: "RESOLVE_ISSUE",
      result: "HELD_FOR_CONTACT",
      target: null,
      actor: {
        id: randomUUID(),
        fullName: "Approval",
        role: "USER",
        department: "APPROVAL",
      },
      occurredAt: "2026-11-11T10:00:00.000Z",
      reason: null,
      notes: null,
    };
    event.commandId = event.id;
    expect(manufacturingIssueActivityEventSchema.parse(event)).toEqual(event);
    expect(
      manufacturingIssueActivityEventSchema.safeParse({
        ...event,
        notes: "private correspondence",
      }).success,
    ).toBe(false);
    expect(
      manufacturingIssueActivityEventSchema.safeParse({
        ...event,
        result: "REPORTED",
      }).success,
    ).toBe(false);
    expect(
      manufacturingIssueActivityEventSchema.safeParse({
        ...event,
        result: "RELEASED",
        target: "PRODUCTION",
      }).success,
    ).toBe(true);
    expect(
      manufacturingIssueActivityEventSchema.safeParse({
        ...event,
        result: "CANCELLED",
        reason: "Cancelled by approval",
      }).success,
    ).toBe(true);
  });
});
