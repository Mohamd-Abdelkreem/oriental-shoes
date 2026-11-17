import { expect, it } from "vitest";
import {
  administrationFilterOptionsDataSchema,
  administrationReportPrintQuerySchema,
} from "@template/contracts";
import { p03Ids } from "@/test/p03-fixtures";
import {
  parseAdministrationRoute,
  resolveAdministrationSalespersonRoute,
  administrationRouteHref,
  administrationRouteSearch,
  administrationOrderHref,
  administrationReportPrintHref,
  type AdministrationRoute,
} from "./administration-query.model";

const parse = (route: AdministrationRoute, query: string) =>
  parseAdministrationRoute(route, new URLSearchParams(query));
it.each([
  ["orders", "", "ALL"],
  ["reports", "", "MONTH"],
  ["report-print", "", "ALL"],
  ["reports", "period=اليوم", "TODAY"],
  ["reports", "period=الشهر", "MONTH"],
  ["reports", "period=السنة", "YEAR"],
  ["reports", "period=كل الفترات", "ALL"],
  ["report-print", "period=الكل", "ALL"],
] as const)("preserves %s period semantics for %s", (route, search, period) => {
  const state = parse(route, search);
  expect(state.kind).toBe("valid");
  if (state.kind !== "valid") throw new Error("Expected valid route");
  expect(state.query).toMatchObject({ period });
  expect(parse(route, administrationRouteSearch(state))).toEqual(state);
});
it.each([
  ["status=بانتظار الاعتماد", { status: "AWAITING_APPROVAL" }],
  ["status=قيد التصنيع", { status: "APPROVED" }],
  ["status=معتمد", { status: "APPROVED" }],
  ["status=تم الاستلام", { status: "DELIVERED" }],
  ["status=ملغي بالكامل", { status: "CANCELLED" }],
  ["status=ملغي جزئياً", { exception: "PARTIALLY_CANCELLED" }],
  ["department=القص", { department: "CUTTING" }],
  ["department=الإنتاج والإصلاح", { department: "PRODUCTION" }],
  ["department=الجودة والتغليف", { department: "QUALITY" }],
  ["department=المستودع", { department: "WAREHOUSE" }],
  ["flag=متأخرة", { exception: "OVERDUE" }],
  ["flag=ملغاة جزئياً", { exception: "PARTIALLY_CANCELLED" }],
  ["flag=جاهزة للتسليم", { exception: "READY" }],
  ["flag=مستلمة", { exception: "DELIVERED" }],
  [
    "dateFrom=2026-11-01&dateTo=2026-11-06",
    { from: "2026-11-01", to: "2026-11-06" },
  ],
  ["search=%20literal_%25%20", { search: "literal_%" }],
] as const)("normalizes only declared association %s", (query, expected) => {
  const state = parse("orders", query);
  expect(state.kind).toBe("valid");
  if (state.kind !== "valid") throw new Error("Expected valid alias");
  expect(state.query).toMatchObject(expected);
  expect(state.canonicalSearch).not.toContain("flag=");
});
it.each([
  "SHOP",
  "EXTERNAL",
  "REPAIR",
  "GIFT",
  "READY",
  "ACCESSORY",
  "ADJUSTMENT",
])("round-trips exact seven-type token %s", (type) => {
  const state = parse("orders", `type=${type}`);
  expect(state.kind).toBe("valid");
  if (state.kind !== "valid") throw new Error("Expected type");
  expect(state.query).toMatchObject({ type });
  expect(parse("orders", state.canonicalSearch)).toEqual(state);
});
it.each([
  "page=1&page=1",
  "search=a&search=b",
  "unknown=ignored",
  "utm_source=decorative",
  "type=UNKNOWN",
  "status=unknown",
  "department=SALES",
  "salespersonId=not-a-uuid",
  "from=2026-02-29",
  "from=2026-11-08&to=2026-11-01",
  "page=-1",
  "limit=101",
  "page=9007199254740991",
  "search=%00",
  "search=" + "x".repeat(151),
  "flag=متأخرة&exception=READY",
  "dateFrom=2026-11-01&from=2026-11-02",
  "status=ملغي جزئياً&exception=OVERDUE",
])("refuses %s without a broadened valid query", (query) => {
  expect(parse("orders", query).kind).toBe("invalid");
});
it("deduplicates agreeing aliases while preserving IDs, partial endpoints and encoded URL values", () => {
  const state = parse(
    "orders",
    `salesperson=${p03Ids.actor.toUpperCase()}&salespersonId=${p03Ids.actor}&flag=متأخرة&exception=OVERDUE&dateFrom=2026-11-01&from=2026-11-01`,
  );
  expect(state.kind).toBe("valid");
  if (state.kind !== "valid" || state.route !== "orders")
    throw new Error("Expected order route");
  expect(state.query).toMatchObject({
    salespersonId: p03Ids.actor,
    from: "2026-11-01",
    period: "ALL",
  });
  expect(state.query.to).toBeUndefined();
  const href = administrationRouteHref("orders", {
    search: "اسم & ? %",
    page: 2,
  });
  expect(href).toContain("%26");
  expect(href).not.toContain("اسم &");
  expect(administrationOrderHref(p03Ids.order)).toBe(
    `/admin/orders/${p03Ids.order}`,
  );
  expect(() => administrationOrderHref("javascript:alert(1)")).toThrow();
  expect(
    administrationReportPrintHref(
      administrationReportPrintQuerySchema.parse({
        period: "MONTH",
        from: "2026-11-01",
        to: "2026-11-06",
      }),
    ),
  ).toContain("to=2026-11-06");
});
it.each(["MISSING", "AMBIGUOUS"] as const)(
  "keeps a %s legacy owner unresolved rather than clearing its filter",
  (match) => {
    const state = parse("reports", "salesperson=Actual name");
    if (state.kind !== "resolve-salesperson")
      throw new Error("Expected owner lookup");
    const options = administrationFilterOptionsDataSchema.parse({
      context: { query: { salespersonName: "Actual name" } },
      salespeople: [],
      legacySalesperson: { input: "Actual name", match, salespersonId: null },
    });
    const resolved = resolveAdministrationSalespersonRoute(state, options);
    expect(resolved.kind).toBe("invalid");
    if (resolved.kind !== "invalid") throw new Error("Expected invalid owner");
    expect(resolved.fieldErrors["salespersonId"]?.join(" ")).toContain("اختر");
  },
);
it("uses only a context-bound UNIQUE actual owner and checks a coexisting canonical ID", () => {
  const state = parse(
    "orders",
    `salesperson=Actual name&salespersonId=${p03Ids.actor}`,
  );
  if (state.kind !== "resolve-salesperson")
    throw new Error("Expected owner lookup");
  const options = administrationFilterOptionsDataSchema.parse({
    context: { query: { salespersonName: "Actual name" } },
    salespeople: [
      { id: p03Ids.actor, fullName: "Same display name", phone: null },
      { id: p03Ids.customer, fullName: "Same display name", phone: null },
    ],
    legacySalesperson: {
      input: "Actual name",
      match: "UNIQUE",
      salespersonId: p03Ids.actor,
    },
  });
  const resolved = resolveAdministrationSalespersonRoute(state, options);
  expect(resolved).toMatchObject({
    kind: "valid",
    route: "orders",
    query: { salespersonId: p03Ids.actor },
  });
  expect(
    resolveAdministrationSalespersonRoute(state, {
      ...options,
      context: { query: { salespersonName: "Other name" } },
    }).kind,
  ).toBe("invalid");
  expect(
    resolveAdministrationSalespersonRoute(state, {
      ...options,
      legacySalesperson: {
        ...options.legacySalesperson,
        input: "Actual name",
        match: "UNIQUE",
        salespersonId: p03Ids.customer,
      },
    }).kind,
  ).toBe("invalid");
});
it.each([
  ["approvals", "pending", "PENDING"],
  ["corrections", "resolved", "RESOLVED"],
  ["delivery-exceptions", "dispatched", "DISPATCHED"],
] as const)(
  "binds %s legacy tab and rejects other-resource filters",
  (route, tab, expected) => {
    expect(parse(route, `tab=${tab}`)).toMatchObject({
      kind: "valid",
      route,
      query: { tab: expected },
    });
    expect(parse(route, "period=ALL").kind).toBe("invalid");
  },
);
it("keeps Back/Forward query snapshots independent and print pages reject screen pagination", () => {
  const before = parse("orders", "search=old&page=2"),
    after = parse("orders", "search=new&page=1");
  expect(before).toMatchObject({
    kind: "valid",
    query: { search: "old", page: 2 },
  });
  expect(after).toMatchObject({
    kind: "valid",
    query: { search: "new", page: 1 },
  });
  expect(parse("report-print", "page=2").kind).toBe("invalid");
  expect(parse("activity", `orderId=${p03Ids.order}&page=2`)).toMatchObject({
    kind: "valid",
    query: { orderId: p03Ids.order, page: 2 },
  });
});
