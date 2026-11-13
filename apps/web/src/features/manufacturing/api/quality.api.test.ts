import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { beforeEach, expect, it, vi } from "vitest";
import {
  qualityOrderDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { p03Ids, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { bindQualityCommandResult, qualityApi } from "./quality.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => vi.resetAllMocks());
const command = qualityCommandBodySchema.parse({
  commandId: p03Ids.command,
  operation: "INSPECT",
  orders: [
    {
      orderId: p03Ids.order,
      expectedVersion: 2,
      decisions: [
        {
          pieceId: p03Ids.piece,
          decision: "REJECT",
          target: "CUTTING",
          reason: "Defect",
          instructions: "Correct",
        },
      ],
    },
  ],
});
const saved = qualityCommandDataSchema.parse({
  kind: "quality-command",
  replayed: false,
  receipt: {
    commandId: p03Ids.command,
    operation: "INSPECT",
    actor: {
      id: p03Ids.actor,
      fullName: "Actual inspector",
      role: "USER",
      department: "QUALITY",
    },
    occurredAt: p03Instant,
  },
  outcome: {
    orders: [
      {
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderId: p03Ids.order,
        beforeVersion: 2,
        afterVersion: 3,
        packingGroupId: null,
        pieces: [
          {
            pieceId: p03Ids.piece,
            visitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            decision: "REJECT",
            stage: "CUTTING",
            workState: "INCOMING",
            correctionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            issueId: null,
          },
        ],
      },
    ],
  },
});
it("sends one atomic command without a cancellation signal and observes the same original result", async () => {
  transport.post.mockResolvedValue(p03Envelope(saved));
  expect(await qualityApi.command(command)).toEqual(saved);
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/quality/commands",
    command,
  );
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope(saved));
  expect(await qualityApi.observe(command.commandId, signal)).toEqual(saved);
  expect(transport.get).toHaveBeenCalledWith(
    `/quality-commands/${command.commandId}`,
    { signal },
  );
  expect(bindQualityCommandResult(saved, command, p03Ids.actor)).toEqual(saved);
  expect(() => bindQualityCommandResult(saved, command, p03Ids.order)).toThrow(
    ApiContractError,
  );
});
it.each(["command", "piece", "version", "target", "decision", "packing"])(
  "rejects a wrong %s in a nominal command success",
  async (field) => {
    const malformed = structuredClone(saved),
      group = malformed.outcome.orders[0],
      piece = group?.pieces[0];
    if (!group || !piece) throw new Error("Canonical member required");
    if (field === "command") malformed.receipt.commandId = p03Ids.order;
    if (field === "piece") piece.pieceId = p03Ids.order;
    if (field === "version") {
      group.beforeVersion = 3;
      group.afterVersion = 4;
    }
    if (field === "target") piece.stage = "PRODUCTION";
    if (field === "decision") {
      piece.decision = "ACCEPT";
      piece.stage = "WAREHOUSE";
      piece.correctionId = null;
    }
    if (field === "packing") group.packingGroupId = p03Ids.order;
    transport.post.mockResolvedValue(p03Envelope(malformed));
    await expect(qualityApi.command(command)).rejects.toThrow(ApiContractError);
  },
);
it("binds report batches to their per-order selected count rather than a single version increment", () => {
  const body = qualityCommandBodySchema.parse({
    commandId: command.commandId,
    operation: "REPORT_ISSUES",
    reason: "Issue",
    orders: [
      {
        orderId: p03Ids.order,
        expectedVersion: 2,
        pieceIds: [p03Ids.piece, p03Ids.order],
      },
    ],
  });
  const result = structuredClone(saved);
  result.receipt.operation = "REPORT_ISSUES";
  const group = result.outcome.orders[0];
  if (!group) throw new Error("Canonical group required");
  group.afterVersion = 4;
  group.pieces = [p03Ids.piece, p03Ids.order].map((pieceId, index) => ({
    pieceId,
    visitId: null,
    decision: null,
    stage: "QUALITY",
    workState: "BLOCKED",
    correctionId: null,
    issueId:
      index === 0
        ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        : "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  }));
  expect(bindQualityCommandResult(result, body)).toEqual(result);
  group.afterVersion = 3;
  expect(() => bindQualityCommandResult(result, body)).toThrow(
    ApiContractError,
  );
});
it.each(["dashboard", "orders", "pieces", "activity", "orderHistory"] as const)(
  "binds %s read schemas and normalized page/scope instead of returning malformed success",
  async (method) => {
    transport.get.mockResolvedValue(
      p03Envelope({
        department: "PRODUCTION",
        items: [],
        pagination: {
          page: 2,
          limit: 25,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      }),
    );
    const read = () => {
      switch (method) {
        case "dashboard":
          return qualityApi.dashboard();
        case "orders":
          return qualityApi.orders({ view: "INCOMING" });
        case "pieces":
          return qualityApi.pieces({ view: "INCOMING" });
        case "activity":
          return qualityApi.activity({});
        case "orderHistory":
          return qualityApi.orderHistory(p03Ids.order, {});
      }
    };
    await expect(read()).rejects.toThrow(ApiContractError);
  },
);
it("keeps valid empty reads distinct from transport failure and forwards normalized query and abort signal", async () => {
  const pagination = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(
    p03Envelope({
      department: "QUALITY",
      view: "INCOMING",
      items: [],
      counts: { orders: 0, pieces: 0 },
      pagination,
    }),
  );
  expect((await qualityApi.orders({ view: "INCOMING" }, signal)).items).toEqual(
    [],
  );
  expect(transport.get).toHaveBeenCalledWith("/quality/orders", {
    signal,
    params: { view: "INCOMING", search: undefined, page: 1, limit: 25 },
  });
  transport.get.mockRejectedValue(new Error("Owned transport failure"));
  await expect(qualityApi.orders({ view: "INCOMING" })).rejects.toThrow(
    "Owned transport failure",
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...saved,
      receipt: { ...saved.receipt, commandId: p03Ids.order },
    }),
  );
  await expect(qualityApi.observe(command.commandId)).rejects.toThrow(
    ApiContractError,
  );
});

it("binds safe detail to the requested order without substituting another paper", async () => {
  const source = manufacturingDetailFixture(),
    paper = {
      ...source.paper,
      order: {
        ...source.paper.order,
        pieces: source.paper.order.pieces.map((piece) => ({
          ...piece,
          stage: "QUALITY",
        })),
      },
    };
  const detail = qualityOrderDataSchema.parse({
    department: "QUALITY",
    paper,
    packingGroups: [],
    work: paper.order.pieces.map((piece) => ({
      pieceId: piece.id,
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
    })),
  });
  transport.get.mockResolvedValue(p03Envelope(detail));
  expect(await qualityApi.order(p03Ids.order)).toEqual(detail);
  transport.get.mockResolvedValue(
    p03Envelope({
      ...detail,
      paper: { ...paper, order: { ...paper.order, id: p03Ids.actor } },
    }),
  );
  await expect(qualityApi.order(p03Ids.order)).rejects.toThrow(
    ApiContractError,
  );
});
it("preserves the original entire history group for a matching piece filter and rejects an unrelated event", async () => {
  const group = saved.outcome.orders[0],
    order = command.orders[0];
  if (!group || !order || !("decisions" in order))
    throw new Error("Inspection required");
  const event = {
    id: group.eventId,
    commandId: command.commandId,
    orderId: p03Ids.order,
    orderVersion: 3,
    businessNumber: "SHOP-2026-0001",
    department: "QUALITY",
    operation: "INSPECT",
    actor: saved.receipt.actor,
    occurredAt: p03Instant,
    pieces: group.pieces,
    correctionLinks: [
      {
        pieceId: p03Ids.piece,
        correctionId: group.pieces[0]?.correctionId,
        cycle: 1,
        action: "OPENED",
      },
    ],
    inspection: {
      decisions: order.decisions,
      inspectorNote: null,
      packing: null,
    },
    report: null,
  };
  const history = {
    department: "QUALITY",
    orderId: p03Ids.order,
    events: [{ kind: "quality", event }],
    pagination: {
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  transport.get.mockResolvedValue(p03Envelope(history));
  expect(
    (await qualityApi.orderHistory(p03Ids.order, { pieceId: p03Ids.piece }))
      .events,
  ).toEqual(history.events);
  await expect(
    qualityApi.orderHistory(p03Ids.order, { pieceId: p03Ids.actor }),
  ).rejects.toThrow(ApiContractError);
});
it.each(["page", "view"])(
  "rejects a valid queue page with mismatched %s",
  async (field) => {
    const pagination = {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
    transport.get.mockResolvedValue(
      p03Envelope({
        department: "QUALITY",
        view: field === "view" ? "ACCEPTED" : "INCOMING",
        items: [],
        counts: { orders: 0, pieces: 0 },
        pagination,
      }),
    );
    await expect(
      qualityApi.orders({ view: "INCOMING", page: field === "page" ? 2 : 1 }),
    ).rejects.toThrow(ApiContractError);
  },
);
