import { draftCaptureSchema } from "../sales-drafts/sales-drafts.schema.ts";
import {
  qualityWorkVisitSchema,
  qualityOrderDataSchema,
  qualityOrdersQuerySchema,
  qualityPiecesQuerySchema,
  qualityActivityQuerySchema,
  qualityOrdersDataSchema,
  qualityPiecesDataSchema,
  qualityIssueActivityEventSchema,
  qualityActivityDataSchema,
  qualityOrderHistoryDataSchema,
  type QualityOrderData,
  type QualityWorkVisit,
} from "./quality.schema.ts";
import { describe, expect, it } from "vitest";
import {
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  type QualityCommandData,
} from "./quality-command.schema.ts";
import {
  qualityActivityEventSchema,
  type QualityActivityEvent,
} from "./quality-event.schema.ts";

const uuid = (ordinal: number) =>
  "00000000-0000-4000-8000-" + ordinal.toString(16).padStart(12, "0");
const actor = {
  id: uuid(90),
  fullName: "Quality colleague",
  role: "USER",
  department: "QUALITY",
} as const;
const occurredAt = "2026-11-11T10:00:00.000Z";
const startBody = () => ({
  commandId: uuid(1),
  operation: "RECEIVE_AND_START",
  orders: [
    { orderId: uuid(2), expectedVersion: 4, pieceIds: [uuid(3), uuid(4)] },
  ],
});
const inspectBody = () => ({
  commandId: uuid(1),
  operation: "INSPECT",
  orders: [
    {
      orderId: uuid(2),
      expectedVersion: 4,
      decisions: [
        { pieceId: uuid(3), decision: "ACCEPT" },
        {
          pieceId: uuid(4),
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "  Loose bond  ",
          instructions: " Rebond as approved ",
        },
      ],
    },
  ],
});
const groupAt = <T>(groups: readonly T[], index = 0): T => {
  const group = groups[index];
  if (group === undefined) throw new Error("Missing fixture group");
  return group;
};
const inspectionResult = (): QualityCommandData => ({
  kind: "quality-command",
  receipt: { commandId: uuid(1), operation: "INSPECT", actor, occurredAt },
  replayed: false,
  outcome: {
    orders: [
      {
        eventId: uuid(5),
        orderId: uuid(2),
        beforeVersion: 4,
        afterVersion: 5,
        pieces: [
          {
            pieceId: uuid(3),
            visitId: uuid(6),
            decision: "ACCEPT",
            stage: "WAREHOUSE",
            workState: "INCOMING",
            correctionId: null,
            issueId: null,
          },
          {
            pieceId: uuid(4),
            visitId: uuid(7),
            decision: "REJECT",
            stage: "PRODUCTION",
            workState: "INCOMING",
            correctionId: uuid(8),
            issueId: null,
          },
        ],
        packingGroupId: null,
      },
    ],
  },
});
const inspectionEvent = (): QualityActivityEvent => {
  const command = inspectionResult();
  const group = groupAt(command.outcome.orders);
  return {
    id: group.eventId,
    commandId: command.receipt.commandId,
    orderId: group.orderId,
    orderVersion: group.afterVersion,
    businessNumber: "SHOP-2026-0001",
    department: "QUALITY",
    operation: "INSPECT",
    actor,
    occurredAt,
    pieces: group.pieces,
    correctionLinks: [
      { pieceId: uuid(4), correctionId: uuid(8), cycle: 1, action: "OPENED" },
    ],
    inspection: {
      decisions: [
        { pieceId: uuid(3), decision: "ACCEPT" },
        {
          pieceId: uuid(4),
          decision: "REJECT",
          target: "PRODUCTION",
          reason: "Loose bond",
          instructions: "Rebond",
        },
      ],
      inspectorNote: null,
      packing: null,
    },
    report: null,
  };
};

describe("quality exact command intent", () => {
  it("retains exact mixed decisions and original nonblank text without quantity authority", () => {
    const parsed = qualityCommandBodySchema.parse(inspectBody());
    expect(parsed).toEqual({
      ...inspectBody(),
      orders: [
        {
          ...groupAt(inspectBody().orders),
          inspectorNote: null,
          packing: null,
        },
      ],
    });
    expect(
      qualityCommandBodySchema.safeParse({ ...inspectBody(), acceptedQty: 1 })
        .success,
    ).toBe(false);
  });

  it.each([undefined, null, "", " \t\n "])(
    "normalizes absent optional text (%s) without inventing packing",
    (text) => {
      const body = inspectBody();
      const group = groupAt(body.orders);
      const parsed = qualityCommandBodySchema.parse({
        ...body,
        orders: [
          {
            ...group,
            inspectorNote: text,
            packing: { cartonCount: text, cartonNumbers: text },
          },
        ],
      });
      expect(parsed.orders[0]).toMatchObject({
        inspectorNote: null,
        packing: null,
      });
    },
  );

  it("records original carton text, including nonnumeric Arabic, and a note without a carton policy", () => {
    const body = inspectBody();
    const parsed = qualityCommandBodySchema.parse({
      ...body,
      orders: [
        {
          ...groupAt(body.orders),
          inspectorNote: " Protect surfaces ",
          packing: {
            cartonCount: " نصف صندوق ",
            cartonNumbers: " C-01 / كرتون ",
          },
        },
      ],
    });
    expect(parsed.orders[0]).toMatchObject({
      inspectorNote: " Protect surfaces ",
      packing: { cartonCount: " نصف صندوق ", cartonNumbers: " C-01 / كرتون " },
    });
  });

  it("permits a rejection-only note but rejects carton facts without accepted members", () => {
    const body = inspectBody();
    const group = groupAt(body.orders);
    const rejected = {
      ...group,
      decisions: [groupAt(group.decisions, 1)],
      inspectorNote: " Recheck ",
    };
    expect(
      qualityCommandBodySchema.parse({ ...body, orders: [rejected] }),
    ).toMatchObject({
      orders: [{ inspectorNote: " Recheck ", packing: null }],
    });
    expect(
      qualityCommandBodySchema.safeParse({
        ...body,
        orders: [{ ...rejected, packing: { cartonCount: "2" } }],
      }).success,
    ).toBe(false);
  });

  it.each([
    { orders: [] },
    { orders: [{ orderId: uuid(2), expectedVersion: 4, pieceIds: [] }] },
    {
      orders: [
        { orderId: uuid(2), expectedVersion: 4, pieceIds: [uuid(3), uuid(3)] },
      ],
    },
    {
      orders: [
        { orderId: uuid(2), expectedVersion: 4, pieceIds: [uuid(3)] },
        { orderId: uuid(2), expectedVersion: 4, pieceIds: [uuid(4)] },
      ],
    },
    {
      orders: [
        { orderId: uuid(2), expectedVersion: 4, pieceIds: [uuid(3)] },
        { orderId: uuid(5), expectedVersion: 4, pieceIds: [uuid(3)] },
      ],
    },
    { actorId: uuid(90) },
    { department: "QUALITY" },
    { occurredAt },
    { receivedAt: occurredAt },
  ])("rejects invalid identities or injected authority: %j", (patch) => {
    expect(
      qualityCommandBodySchema.safeParse({ ...startBody(), ...patch }).success,
    ).toBe(false);
  });

  it("accepts 200 total members and rejects a 201st across orders", () => {
    const command = {
      ...startBody(),
      orders: [
        {
          orderId: uuid(2),
          expectedVersion: 4,
          pieceIds: Array.from({ length: 200 }, (_, index) =>
            uuid(index + 100),
          ),
        },
      ],
    };
    expect(qualityCommandBodySchema.safeParse(command).success).toBe(true);
    expect(
      qualityCommandBodySchema.safeParse({
        ...command,
        orders: [
          ...command.orders,
          { orderId: uuid(999), expectedVersion: 4, pieceIds: [uuid(998)] },
        ],
      }).success,
    ).toBe(false);
  });

  it.each([null, "", " \t", "x".repeat(4001), "bad\u0000text"])(
    "rejects missing or invalid rejection text: %s",
    (text) => {
      const body = inspectBody();
      const group = groupAt(body.orders);
      for (const field of ["reason", "instructions"]) {
        const decision = { ...groupAt(group.decisions, 1), [field]: text };
        expect(
          qualityCommandBodySchema.safeParse({
            ...body,
            orders: [{ ...group, decisions: [decision] }],
          }).success,
        ).toBe(false);
      }
    },
  );

  it("accepts the text bound and rejects duplicate/overlapping decisions and invalid targets", () => {
    const body = inspectBody(),
      group = groupAt(body.orders),
      rejection = groupAt(group.decisions, 1);
    expect(
      qualityCommandBodySchema.safeParse({
        ...body,
        orders: [
          {
            ...group,
            decisions: [
              {
                ...rejection,
                reason: "x".repeat(4000),
                instructions: "y".repeat(4000),
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    for (const decisions of [
      [groupAt(group.decisions), { ...rejection, pieceId: uuid(3) }],
      [{ ...rejection, target: "WAREHOUSE" }],
      [{ pieceId: uuid(3), decision: "ACCEPT", reason: "Hidden rejection" }],
    ])
      expect(
        qualityCommandBodySchema.safeParse({
          ...body,
          orders: [{ ...group, decisions }],
        }).success,
      ).toBe(false);
  });

  it.each(["RECEIVE_AND_START", "CONTINUE", "REPORT_ISSUES"] as const)(
    "accepts the %s branch with its own strict fields",
    (operation) => {
      const body = {
        ...startBody(),
        operation,
        ...(operation === "REPORT_ISSUES"
          ? { reason: " Needs approval ", notes: " " }
          : {}),
      };
      expect(qualityCommandBodySchema.parse(body)).toMatchObject(
        operation === "REPORT_ISSUES"
          ? { operation, reason: " Needs approval ", notes: null }
          : { operation },
      );
      expect(
        qualityCommandBodySchema.safeParse({
          ...body,
          packing: { cartonCount: "1" },
        }).success,
      ).toBe(false);
    },
  );
});

describe("quality immutable results and history", () => {
  it("accepts mixed results but rejects physical-receipt, premature decision and wrong-department outcomes", () => {
    const result = inspectionResult();
    expect(qualityCommandDataSchema.parse(result)).toEqual(result);
    const group = groupAt(result.outcome.orders),
      piece = groupAt(group.pieces);
    for (const patch of [
      { stage: "QUALITY" },
      { workState: "IN_PROGRESS" },
      { visitId: null },
      { issueId: uuid(22) },
      { receivedAt: occurredAt },
    ])
      expect(
        qualityCommandDataSchema.safeParse({
          ...result,
          outcome: {
            orders: [
              {
                ...group,
                pieces: [{ ...piece, ...patch }, groupAt(group.pieces, 1)],
              },
            ],
          },
        }).success,
      ).toBe(false);
    expect(
      qualityCommandDataSchema.safeParse({
        ...result,
        receipt: { ...result.receipt, operation: "RECEIVE_AND_START" },
      }).success,
    ).toBe(false);
  });

  it("binds report +N independently for every selected order, including an unstarted member", () => {
    const result = inspectionResult(),
      group = groupAt(result.outcome.orders);
    const reportGroup = {
      ...group,
      afterVersion: 6,
      pieces: group.pieces.map((piece, index) => ({
        ...piece,
        visitId: index === 0 ? null : piece.visitId,
        decision: null,
        stage: "QUALITY",
        workState: "BLOCKED",
        issueId: uuid(index + 30),
      })),
    };
    const report = {
      ...result,
      receipt: { ...result.receipt, operation: "REPORT_ISSUES" },
      outcome: { orders: [reportGroup] },
    };
    expect(qualityCommandDataSchema.safeParse(report).success).toBe(true);
    expect(
      qualityCommandDataSchema.safeParse({
        ...report,
        outcome: { orders: [{ ...reportGroup, afterVersion: 5 }] },
      }).success,
    ).toBe(false);
    expect(
      qualityCommandDataSchema.safeParse({
        ...report,
        outcome: { orders: [{ ...reportGroup, packingGroupId: uuid(33) }] },
      }).success,
    ).toBe(false);
  });

  it("rejects unauthorized historical actor and duplicate result identities", () => {
    const result = inspectionResult(),
      group = groupAt(result.outcome.orders);
    expect(
      qualityCommandDataSchema.safeParse({
        ...result,
        receipt: {
          ...result.receipt,
          actor: { ...actor, department: "PRODUCTION" },
        },
      }).success,
    ).toBe(false);
    expect(
      qualityCommandDataSchema.safeParse({
        ...result,
        outcome: {
          orders: [
            {
              ...group,
              pieces: [groupAt(group.pieces), groupAt(group.pieces)],
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      qualityCommandDataSchema.safeParse({
        ...result,
        outcome: {
          orders: [
            { ...group, beforeVersion: 2147483647, afterVersion: 2147483648 },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("retains complete mixed history and exactly binds packing to accepted members", () => {
    const event = inspectionEvent();
    if (event.inspection === null)
      throw new Error("Inspection fixture missing");
    const packing = {
      id: uuid(40),
      inspectionId: event.id,
      acceptedPieceIds: [uuid(3)],
      cartonCount: " 2 ",
      cartonNumbers: null,
      inspectorNote: null,
      inspector: actor,
      packedAt: occurredAt,
    };
    const packed = { ...event, inspection: { ...event.inspection, packing } };
    expect(qualityActivityEventSchema.parse(packed)).toEqual(packed);
    for (const patch of [
      { acceptedPieceIds: [uuid(4)] },
      { acceptedPieceIds: [uuid(3), uuid(4)] },
      { inspectionId: uuid(41) },
      { cartonCount: null },
      { inspector: { ...actor, fullName: "Changed" } },
      { inspectorNote: "Different" },
    ])
      expect(
        qualityActivityEventSchema.safeParse({
          ...packed,
          inspection: {
            ...packed.inspection,
            packing: { ...packing, ...patch },
          },
        }).success,
      ).toBe(false);
  });

  it("records failed cycle k and opened k+1 as separate immutable links", () => {
    const event = inspectionEvent();
    const links = [
      {
        pieceId: uuid(4),
        correctionId: uuid(42),
        cycle: 1,
        action: "REJECTED",
      },
      { pieceId: uuid(4), correctionId: uuid(8), cycle: 2, action: "OPENED" },
    ];
    expect(
      qualityActivityEventSchema.safeParse({ ...event, correctionLinks: links })
        .success,
    ).toBe(true);
    for (const correctionLinks of [
      links.slice(1),
      [...links, groupAt(links)],
      [groupAt(links), { ...groupAt(links, 1), cycle: 3 }],
      [{ ...groupAt(links, 1), pieceId: uuid(43) }],
    ])
      expect(
        qualityActivityEventSchema.safeParse({ ...event, correctionLinks })
          .success,
      ).toBe(false);
  });

  it("binds start/accepted correction links and forbids fabricated lifecycle changes on continuation", () => {
    const event = inspectionEvent(),
      piece = groupAt(event.pieces);
    const started = {
      ...event,
      operation: "RECEIVE_AND_START",
      inspection: null,
      pieces: [
        {
          ...piece,
          decision: null,
          stage: "QUALITY",
          workState: "IN_PROGRESS",
          correctionId: uuid(44),
        },
      ],
      correctionLinks: [
        {
          pieceId: piece.pieceId,
          correctionId: uuid(44),
          cycle: 2,
          action: "REINSPECTION_STARTED",
        },
      ],
    };
    expect(qualityActivityEventSchema.safeParse(started).success).toBe(true);
    expect(
      qualityActivityEventSchema.safeParse({
        ...started,
        operation: "CONTINUE",
      }).success,
    ).toBe(false);
    expect(
      qualityActivityEventSchema.safeParse({ ...started, correctionLinks: [] })
        .success,
    ).toBe(false);
    expect(
      qualityActivityEventSchema.safeParse({
        ...started,
        operation: "CONTINUE",
        correctionLinks: [],
      }).success,
    ).toBe(true);
  });
});

const safeDetail = (): QualityOrderData => {
  const capture = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [{ id: uuid(3), model: "SM" }],
  });
  const { catalogSelections: _catalogSelections, ...specification } = groupAt(
    capture.pieces,
  );
  return {
    department: "QUALITY",
    packingGroups: [],
    paper: {
      issues: [],
      order: {
        id: uuid(2),
        version: 5,
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
            ...specification,
            position: 1,
            quantity: 1,
            stage: "QUALITY",
            workState: "INCOMING",
            receivedAt: null,
            cancelledAt: null,
            cancellationReason: null,
          },
        ],
      },
    },
    work: [
      {
        pieceId: uuid(3),
        visit: null,
        lastAction: null,
        currentCorrection: null,
        latestInspection: null,
        allowedActions: {
          canReceiveAndStart: true,
          canContinue: false,
          canInspect: false,
          canReportIssue: true,
        },
      },
    ],
  };
};
const visit = (): QualityWorkVisit => ({
  id: uuid(6),
  pieceId: uuid(3),
  sequence: 1,
  originKind: "PRODUCTION_ARRIVAL",
  sourceProductionEventId: uuid(50),
  sourceCorrectionId: null,
  enteredAt: "2026-11-11T09:00:00.000Z",
  receivedAt: occurredAt,
  startedAt: occurredAt,
  startedBy: actor,
  endedAt: null,
  endReason: null,
  endedBy: null,
  legacyUnknownStart: false,
});
const pagination = (total: number, page = 1, limit = 25) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPreviousPage: page > 1,
});
const header = () => {
  const detail = safeDetail();
  const {
    pieces: _pieces,
    generalNotes: _notes,
    repairNote: _repair,
    adjustmentRequested: _requested,
    adjustmentReason: _reason,
    adjustmentActionTaken: _action,
    ...orderHeader
  } = detail.paper.order;
  return orderHeader;
};

describe("safe quality reads", () => {
  it("accepts ordinary incoming with no quality visit and preserves a real or unknown legacy start", () => {
    expect(qualityOrderDataSchema.parse(safeDetail())).toEqual(safeDetail());
    expect(qualityWorkVisitSchema.parse(visit())).toEqual(visit());
    const legacy = {
      ...visit(),
      originKind: "LEGACY_BASELINE",
      sourceProductionEventId: null,
      enteredAt: null,
      receivedAt: null,
      startedAt: null,
      startedBy: null,
      legacyUnknownStart: true,
    };
    expect(qualityWorkVisitSchema.safeParse(legacy).success).toBe(true);
    for (const patch of [
      { legacyUnknownStart: false },
      { startedBy: actor },
      { receivedAt: occurredAt },
    ])
      expect(
        qualityWorkVisitSchema.safeParse({ ...legacy, ...patch }).success,
      ).toBe(false);
    expect(
      qualityWorkVisitSchema.safeParse({
        ...visit(),
        endedAt: "2026-11-11T08:00:00.000Z",
        endReason: "INSPECT_ACCEPTED",
        endedBy: actor,
      }).success,
    ).toBe(false);
  });

  it("keeps a prior closed rejection distinct from the current correction and no workshop actions", () => {
    const detail = safeDetail(),
      context = groupAt(detail.work);
    const closedVisit = {
      ...visit(),
      endedAt: occurredAt,
      endReason: "INSPECT_REJECTED" as const,
      endedBy: actor,
    };
    const corrected = {
      ...detail,
      paper: {
        ...detail.paper,
        order: {
          ...detail.paper.order,
          pieces: detail.paper.order.pieces.map((piece) => ({
            ...piece,
            stage: "PRODUCTION",
          })),
        },
      },
      work: [
        {
          ...context,
          visit: closedVisit,
          currentCorrection: {
            id: uuid(8),
            pieceId: uuid(3),
            cycle: 1,
            target: "PRODUCTION",
            reason: "Loose bond",
            instructions: "Rebond",
            rejectedAt: occurredAt,
            inspector: actor,
            phase: "WAITING_CORRECTION",
          },
          latestInspection: {
            decisionId: uuid(51),
            inspectionId: uuid(5),
            visitId: uuid(6),
            decision: "REJECT",
            inspector: actor,
            inspectedAt: occurredAt,
            inspectorNote: null,
            packingGroupId: null,
            correctionId: uuid(8),
          },
          allowedActions: {
            canReceiveAndStart: false,
            canContinue: false,
            canInspect: false,
            canReportIssue: false,
          },
        },
      ],
    };
    expect(qualityOrderDataSchema.safeParse(corrected).success).toBe(true);
    expect(
      qualityOrderDataSchema.safeParse({
        ...corrected,
        work: [
          {
            ...groupAt(corrected.work),
            allowedActions: {
              ...groupAt(corrected.work).allowedActions,
              canInspect: true,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects foreign or duplicate nested identities, active hints after handoff, and private paper fields", () => {
    const detail = safeDetail(),
      context = groupAt(detail.work);
    for (const work of [
      [{ ...context, pieceId: uuid(60) }],
      [context, context],
      [{ ...context, visit: { ...visit(), pieceId: uuid(61) } }],
    ])
      expect(
        qualityOrderDataSchema.safeParse({ ...detail, work }).success,
      ).toBe(false);
    for (const patch of [
      { stage: "WAREHOUSE" },
      { receivedAt: occurredAt },
      { workState: "BLOCKED" },
    ])
      expect(
        qualityOrderDataSchema.safeParse({
          ...detail,
          paper: {
            ...detail.paper,
            order: {
              ...detail.paper.order,
              pieces: detail.paper.order.pieces.map((piece) => ({
                ...piece,
                ...patch,
              })),
            },
          },
        }).success,
      ).toBe(false);
    for (const field of [
      "money",
      "customerId",
      "customerSnapshot",
      "proposedSpecifications",
    ])
      expect(
        qualityOrderDataSchema.safeParse({
          ...detail,
          paper: {
            ...detail.paper,
            order: { ...detail.paper.order, [field]: {} },
          },
        }).success,
      ).toBe(false);
  });

  it("retains accepted packing after onward handoff and requires exactly the referenced registry", () => {
    const detail = safeDetail();
    const inspection = {
      decisionId: uuid(51),
      inspectionId: uuid(5),
      visitId: uuid(6),
      decision: "ACCEPT",
      inspector: actor,
      inspectedAt: occurredAt,
      inspectorNote: "Protect",
      packingGroupId: uuid(40),
      correctionId: null,
    };
    const group = {
      id: uuid(40),
      inspectionId: uuid(5),
      acceptedPieceIds: [uuid(3)],
      cartonCount: "2",
      cartonNumbers: null,
      inspectorNote: "Protect",
      inspector: actor,
      packedAt: occurredAt,
    };
    const accepted = {
      ...detail,
      paper: {
        ...detail.paper,
        order: {
          ...detail.paper.order,
          pieces: detail.paper.order.pieces.map((piece) => ({
            ...piece,
            stage: "WAREHOUSE",
          })),
        },
      },
      work: detail.work.map((context) => ({
        ...context,
        visit: {
          ...visit(),
          endedAt: occurredAt,
          endReason: "INSPECT_ACCEPTED",
          endedBy: actor,
        },
        latestInspection: inspection,
        allowedActions: {
          canReceiveAndStart: false,
          canContinue: false,
          canInspect: false,
          canReportIssue: false,
        },
      })),
      packingGroups: [group],
    };
    expect(qualityOrderDataSchema.safeParse(accepted).success).toBe(true);
    for (const packingGroups of [
      [],
      [group, group],
      [{ ...group, inspectionId: uuid(99) }],
      [{ ...group, acceptedPieceIds: [uuid(99)] }],
    ])
      expect(
        qualityOrderDataSchema.safeParse({ ...accepted, packingGroups })
          .success,
      ).toBe(false);
  });

  it("bounds and normalizes only supported list queries across all seven types", () => {
    for (const type of [
      "SHOP",
      "EXTERNAL",
      "REPAIR",
      "GIFT",
      "READY",
      "ACCESSORY",
      "ADJUSTMENT",
    ])
      expect(
        qualityOrdersQuerySchema.parse({
          view: "INCOMING",
          type,
          search: "  SM  ",
          page: "2",
          limit: "10",
        }),
      ).toEqual({ view: "INCOMING", type, search: "SM", page: 2, limit: 10 });
    expect(
      qualityPiecesQuerySchema.parse({ view: "INSPECTION", search: "  " }),
    ).toMatchObject({ page: 1, limit: 25 });
    for (const query of [
      { view: "RETURNED" },
      { view: "INCOMING", limit: 26 },
      { view: "INCOMING", page: 1.5 },
      { view: "INCOMING", search: "x".repeat(151) },
      { view: "INCOMING", search: "bad\u0000" },
      { view: "INCOMING", page: Number.MAX_SAFE_INTEGER },
      { view: "INCOMING", worker: uuid(90) },
    ])
      expect(qualityOrdersQuerySchema.safeParse(query).success).toBe(false);
    expect(qualityActivityQuerySchema.safeParse({ actor: "me" }).success).toBe(
      false,
    );
  });

  it("binds grouped/flat counts, distinct members and honest out-of-range pages", () => {
    const detail = safeDetail();
    const summary = {
      ...header(),
      matchingPieceIds: [uuid(3)],
      matchingPieceCount: 1,
      lastWorkAt: null,
    };
    const grouped = {
      department: "QUALITY",
      view: "INCOMING",
      items: [summary],
      counts: { orders: 1, pieces: 1 },
      pagination: pagination(1),
    };
    expect(qualityOrdersDataSchema.safeParse(grouped).success).toBe(true);
    expect(
      qualityOrdersDataSchema.safeParse({
        ...grouped,
        items: [],
        pagination: pagination(1, 2),
      }).success,
    ).toBe(true);
    expect(
      qualityOrdersDataSchema.safeParse({ ...grouped, items: [] }).success,
    ).toBe(false);
    expect(
      qualityOrdersDataSchema.safeParse({
        ...grouped,
        counts: { orders: 0, pieces: 1 },
      }).success,
    ).toBe(false);
    const flat = {
      ...grouped,
      items: [
        {
          order: header(),
          piece: groupAt(detail.paper.order.pieces),
          work: groupAt(detail.work),
        },
      ],
      packingGroups: [],
    };
    expect(qualityPiecesDataSchema.safeParse(flat).success).toBe(true);
    expect(
      qualityPiecesDataSchema.safeParse({
        ...flat,
        counts: { orders: 1, pieces: 2 },
      }).success,
    ).toBe(false);
    expect(
      qualityPiecesDataSchema.safeParse({ ...flat, department: "PRODUCTION" })
        .success,
    ).toBe(false);
  });

  it("keeps real P05 departments in quality history and full original mixed inspection groups", () => {
    const event = inspectionEvent();
    const manufacturing = {
      id: uuid(55),
      commandId: uuid(56),
      orderId: uuid(2),
      orderVersion: 4,
      businessNumber: "SHOP-2026-0001",
      department: "PRODUCTION",
      operation: "COMPLETE_TRANSFER",
      actor: { ...actor, department: "PRODUCTION" },
      occurredAt,
      pieces: [
        {
          pieceId: uuid(3),
          visitId: uuid(57),
          nextVisitId: null,
          stage: "QUALITY",
          workState: "INCOMING",
        },
      ],
      destination: "QUALITY",
    };
    const history = {
      department: "QUALITY",
      orderId: uuid(2),
      events: [
        { kind: "quality", event },
        { kind: "manufacturing", event: manufacturing },
      ],
      pagination: pagination(2),
    };
    expect(qualityOrderHistoryDataSchema.safeParse(history).success).toBe(true);
    expect(
      qualityOrderHistoryDataSchema.safeParse({ ...history, orderId: uuid(99) })
        .success,
    ).toBe(false);
    expect(
      qualityActivityDataSchema.safeParse({ ...history, orderId: undefined })
        .success,
    ).toBe(false);
    expect(
      qualityOrderHistoryDataSchema.safeParse({
        ...history,
        events: [
          {
            kind: "quality",
            event: { ...event, pieces: event.pieces.slice(0, 1) },
          },
        ],
        pagination: pagination(1),
      }).success,
    ).toBe(false);
  });

  it("binds a correction cancellation to a safe P04 event even from a correction department", () => {
    const event = {
      id: uuid(60),
      commandId: uuid(60),
      orderId: uuid(2),
      orderVersion: 7,
      businessNumber: "SHOP-2026-0001",
      pieceId: uuid(3),
      issueId: uuid(61),
      sourceDepartment: "CUTTING",
      operation: "RESOLVE_ISSUE",
      result: "CANCELLED",
      target: null,
      actor: { ...actor, department: "APPROVAL" },
      occurredAt,
      reason: "Cannot correct",
      notes: null,
      correctionResolution: {
        correctionId: uuid(8),
        cycle: 2,
        outcome: "CANCELLED",
      },
    };
    expect(qualityIssueActivityEventSchema.safeParse(event).success).toBe(true);
    for (const patch of [
      { actor },
      { notes: "private contact" },
      { result: "RELEASED", reason: null, target: "PRODUCTION" },
      { commandId: uuid(62) },
      { proposedSpecifications: { model: "unapproved" } },
    ])
      expect(
        qualityIssueActivityEventSchema.safeParse({ ...event, ...patch })
          .success,
      ).toBe(false);
  });
});
