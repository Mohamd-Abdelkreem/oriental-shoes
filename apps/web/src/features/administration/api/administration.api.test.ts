import { p08CorrectionCommandFixture } from "@/test/p08-fixtures";
import { beforeEach, expect, it, vi } from "vitest";
import {
  administrationOrderDataSchema,
  administrationOrdersQuerySchema,
  administrationReportQuerySchema,
  administrationReportPrintQuerySchema,
  administrationApprovalsQuerySchema,
  administrationCorrectionsQuerySchema,
  administrationDeliveryExceptionsQuerySchema,
  administrationActivityQuerySchema,
  administrationOrderHistoryQuerySchema,
  administrationOrderFiltersSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import {
  draftFixture,
  p03Ids,
  p03Instant,
  p03Envelope,
} from "@/test/p03-fixtures";
import { administrationApi } from "./administration.api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
beforeEach(() => vi.resetAllMocks());
const pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const draft = administrationOrderDataSchema.parse({
  kind: "draft",
  draft: draftFixture(),
  historyCount: 0,
  adminActions: { canCancel: false, canCorrect: false, canPrint: false },
  context: { orderId: p03Ids.order },
});
const zeros = (names: string[]) =>
  Object.fromEntries(names.map((name) => [name, 0]));
const orders = (query = administrationOrdersQuerySchema.parse({})) => ({
  items: [],
  pagination,
  totalOrders: 0,
  totalPieces: 0,
  statusCounts: zeros([
    "DRAFT",
    "AWAITING_APPROVAL",
    "RETURNED",
    "APPROVED",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "DELIVERY_FAILED",
    "DELIVERED",
    "CANCELLED",
  ]),
  context: { query },
});
const report = (period: "ALL" | "MONTH", complete: boolean) => ({
  meta: {
    generatedAt: p03Instant,
    businessDate: "2026-11-06",
    businessTimeZone: "UTC",
    generatedBy: { id: p03Ids.actor, fullName: "Actual administrator" },
    filters: administrationOrderFiltersSchema.parse({ period }),
    effectiveFrom: null,
    effectiveTo: null,
    cohort: { kind: "MIXED", orderCount: 0 },
    complete,
  },
  kpis: zeros([
    "orders",
    "originalPieces",
    "cancelledPieces",
    "activePieces",
    "receivedPieces",
    "completionPercent",
    "readyOrders",
    "deliveredOrders",
    "overdueOrders",
  ]),
  departments: [],
  exceptions: zeros([
    "categoryCases",
    "distinctOrders",
    "overdueOrders",
    "failedOrders",
    "correctionHistoryOrders",
    "returnedOrders",
  ]),
  workforce: {
    scope: { kind: "CURRENT_DIRECTORY", department: null },
    activeStaff: 0,
    totalStaff: 0,
    items: [],
  },
  endorsements: { mode: "MANUAL", signatories: [] },
  orders: complete ? { items: [], total: 0 } : { items: [], pagination },
  ...(complete ? { exceptionRows: [] } : {}),
});
it("uses every exact read path, canonical query, abort signal and strict projection", async () => {
  const signal = new AbortController().signal;
  const dashboard = {
    generatedAt: p03Instant,
    businessDate: "2026-11-06",
    counts: zeros([
      "totalOrders",
      "activeOrders",
      "pendingApproval",
      "activeCorrections",
      "openCorrectionOrders",
      "deliveryExceptions",
      "pendingUsers",
      "readyOrders",
      "overdueOrders",
      "failedDeliveries",
      "activePieces",
      "pendingApprovalPieces",
      "overduePieces",
      "readyPieces",
    ]),
    departments: [],
    recentOrders: [],
  };
  const options = {
    context: { query: {} },
    salespeople: [],
    legacySalesperson: null,
  };
  const approvals = {
    items: [],
    pagination,
    counts: { pending: 0, returned: 0, approved: 0, all: 0 },
    context: { query: administrationApprovalsQuerySchema.parse({}) },
  };
  const corrections = {
    items: [],
    pagination,
    counts: { active: 0, resolved: 0, all: 0, activePieces: 0 },
    context: { query: administrationCorrectionsQuerySchema.parse({}) },
  };
  const delivery = {
    items: [],
    pagination,
    counts: { failed: 0, overdue: 0, dispatched: 0, all: 0 },
    context: { query: administrationDeliveryExceptionsQuerySchema.parse({}) },
  };
  const activity = {
    events: [],
    pagination,
    context: { query: administrationActivityQuerySchema.parse({}) },
  };
  const history = {
    events: [],
    pagination,
    context: {
      orderId: p03Ids.order,
      query: administrationOrderHistoryQuerySchema.parse({}),
    },
  };
  const cases = [
    {
      path: "/administration/dashboard",
      call: () => administrationApi.dashboard(signal),
      saved: dashboard,
    },
    {
      path: "/administration/filter-options",
      call: () => administrationApi.filterOptions({}, signal),
      saved: options,
    },
    {
      path: "/administration/orders",
      call: () => administrationApi.orders({}, signal),
      saved: orders(),
    },
    {
      path: `/administration/orders/${p03Ids.order}`,
      call: () => administrationApi.order(p03Ids.order, signal),
      saved: draft,
    },
    {
      path: `/administration/orders/${p03Ids.order}/history`,
      call: () => administrationApi.orderHistory(p03Ids.order, {}, signal),
      saved: history,
    },
    {
      path: "/administration/approvals",
      call: () => administrationApi.approvals({}, signal),
      saved: approvals,
    },
    {
      path: "/administration/corrections",
      call: () => administrationApi.corrections({}, signal),
      saved: corrections,
    },
    {
      path: "/administration/delivery-exceptions",
      call: () => administrationApi.deliveryExceptions({}, signal),
      saved: delivery,
    },
    {
      path: "/administration/activity",
      call: () => administrationApi.activity({}, signal),
      saved: activity,
    },
    {
      path: "/administration/reports",
      call: () => administrationApi.report({}, signal),
      saved: report("MONTH", false),
    },
    {
      path: "/administration/reports/print",
      call: () => administrationApi.reportPrint({}, signal),
      saved: report("ALL", true),
    },
  ];
  for (const entry of cases) {
    transport.get.mockResolvedValue(p03Envelope(entry.saved));
    expect(await entry.call()).toEqual(entry.saved);
    expect(transport.get).toHaveBeenLastCalledWith(
      entry.path,
      expect.objectContaining({ signal }),
    );
  }
  expect(
    transport.get.mock.calls.find(
      ([path]) => path === "/administration/reports",
    )?.[1],
  ).toEqual({ signal, params: administrationReportQuerySchema.parse({}) });
  expect(
    transport.get.mock.calls.find(
      ([path]) => path === "/administration/reports/print",
    )?.[1],
  ).toEqual({ signal, params: administrationReportPrintQuerySchema.parse({}) });
});
it.each(["absent", "wrong-query", "private-extra"])(
  "rejects %s order page rather than publishing an empty fallback",
  async (fault) => {
    const page = orders();
    transport.get.mockResolvedValue(
      p03Envelope(
        fault === "absent"
          ? { ...page, context: undefined }
          : fault === "wrong-query"
            ? {
                ...page,
                context: {
                  query: administrationOrdersQuerySchema.parse({
                    type: "SHOP",
                  }),
                },
              }
            : { ...page, privateCredential: "forbidden" },
      ),
    );
    await expect(administrationApi.orders({})).rejects.toThrow(
      ApiContractError,
    );
  },
);
it("binds empty history/activity context and requested root even without rows", async () => {
  transport.get.mockResolvedValue(p03Envelope(draft));
  await expect(administrationApi.order(p03Ids.actor)).rejects.toThrow(
    ApiContractError,
  );
  const history = {
    events: [],
    pagination,
    context: {
      orderId: p03Ids.actor,
      query: administrationOrderHistoryQuerySchema.parse({}),
    },
  };
  transport.get.mockResolvedValue(p03Envelope(history));
  await expect(
    administrationApi.orderHistory(p03Ids.order, {}),
  ).rejects.toThrow(ApiContractError);
  await expect(administrationApi.activity({})).rejects.toThrow(
    ApiContractError,
  );
  transport.get.mockResolvedValue(
    p03Envelope({
      ...history,
      context: { query: administrationActivityQuerySchema.parse({}) },
    }),
  );
  await expect(
    administrationApi.orderHistory(p03Ids.order, {}),
  ).rejects.toThrow(ApiContractError);
});
it("binds legacy lookup intent, report filters and complete print without broadening", async () => {
  transport.get.mockResolvedValue(
    p03Envelope({
      context: { query: { salespersonName: "Actual name" } },
      salespeople: [],
      legacySalesperson: {
        input: "Other name",
        match: "MISSING",
        salespersonId: null,
      },
    }),
  );
  await expect(
    administrationApi.filterOptions({ salespersonName: "Actual name" }),
  ).rejects.toThrow(ApiContractError);
  transport.get.mockResolvedValue(p03Envelope(report("ALL", false)));
  await expect(administrationApi.report({})).rejects.toThrow(ApiContractError);
  transport.get.mockResolvedValue(p03Envelope(report("ALL", true)));
  await expect(administrationApi.reportPrint({ type: "SHOP" })).rejects.toThrow(
    ApiContractError,
  );
  transport.get.mockResolvedValue(p03Envelope(report("ALL", false)));
  await expect(administrationApi.reportPrint({})).rejects.toThrow(
    ApiContractError,
  );
});
it("rejects invalid filters before GET and propagates failed reads unchanged", async () => {
  await expect(
    administrationApi.orders({ from: "2026-11-08", to: "2026-11-01" }),
  ).rejects.toThrow();
  expect(transport.get).not.toHaveBeenCalled();
  const failure = new Error("Controlled network boundary failure");
  transport.get.mockRejectedValue(failure);
  await expect(administrationApi.orders({})).rejects.toBe(failure);
});

it("posts exactly the validated original intent without cancellation and observes only its retained UUID", async () => {
  const { body, result } = p08CorrectionCommandFixture();
  transport.post.mockResolvedValue(p03Envelope(result));
  expect(await administrationApi.command(body)).toEqual(result);
  expect(transport.post).toHaveBeenCalledExactlyOnceWith(
    "/administration/commands",
    body,
  );
  const signal = new AbortController().signal;
  transport.get.mockResolvedValue(p03Envelope({ ...result, replayed: true }));
  expect(
    (await administrationApi.observe(body.commandId, signal)).replayed,
  ).toBe(true);
  expect(transport.get).toHaveBeenLastCalledWith(
    `/administration-commands/${body.commandId}`,
    { signal },
  );
  await expect(administrationApi.observe(p03Ids.customer)).rejects.toThrow(
    ApiContractError,
  );
  transport.post.mockResolvedValue(
    p03Envelope({
      ...result,
      receipt: { ...result.receipt, commandId: p03Ids.customer },
    }),
  );
  await expect(administrationApi.command(body)).rejects.toThrow(
    ApiContractError,
  );
});
