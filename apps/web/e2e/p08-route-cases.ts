export type P08RouteCase = Readonly<{
  sourcePage: string;
  routePattern: string;
  kind: "screen" | "redirect" | "development-only";
  allowedContext:
    | "anonymous"
    | "eligible-admin"
    | "eligible-sales-owner"
    | "eligible-approval"
    | "eligible-cutting"
    | "eligible-production"
    | "eligible-quality"
    | "eligible-warehouse"
    | "credential-valid-restricted";
  fixtureKey: string | null;
  expectedDestination: string | null;
  scenarioKey: string;
}>;

export const P08_ROUTE_CASES = [
  {
    sourcePage: "apps/web/src/app/(print)/orders/[orderId]/print/page.tsx",
    routePattern: "/orders/[orderId]/print",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/orders/[orderId]/print",
  },
  {
    sourcePage: "apps/web/src/app/(print)/print/order/[orderId]/page.tsx",
    routePattern: "/print/order/[orderId]",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/print/order/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(print)/reports/print/page.tsx",
    routePattern: "/reports/print",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/reports/print",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/account/page.tsx",
    routePattern: "/admin/account",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/activity/page.tsx",
    routePattern: "/admin/activity",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/activity",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/approvals/page.tsx",
    routePattern: "/admin/approvals",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/approvals",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/corrections/page.tsx",
    routePattern: "/admin/corrections",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/corrections",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/customers/[phone]/page.tsx",
    routePattern: "/admin/customers/[phone]",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: "owned-customer",
    expectedDestination: null,
    scenarioKey: "route:/admin/customers/[phone]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/customers/page.tsx",
    routePattern: "/admin/customers",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/customers",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/dashboard/page.tsx",
    routePattern: "/admin/dashboard",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/dashboard",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/admin/delivery-exceptions/page.tsx",
    routePattern: "/admin/delivery-exceptions",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/delivery-exceptions",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/orders/[orderId]/page.tsx",
    routePattern: "/admin/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/admin/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/orders/page.tsx",
    routePattern: "/admin/orders",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/orders",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/page.tsx",
    routePattern: "/admin",
    kind: "redirect",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: "/admin/dashboard",
    scenarioKey: "route:/admin",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/admin/registration-requests/page.tsx",
    routePattern: "/admin/registration-requests",
    kind: "redirect",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: "/admin/users/pending",
    scenarioKey: "route:/admin/registration-requests",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/reports/page.tsx",
    routePattern: "/admin/reports",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/reports",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/users/page.tsx",
    routePattern: "/admin/users",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/users",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/admin/users/pending/page.tsx",
    routePattern: "/admin/users/pending",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/admin/users/pending",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/approval/account/page.tsx",
    routePattern: "/approval/account",
    kind: "screen",
    allowedContext: "eligible-approval",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/approval/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/approval/dashboard/page.tsx",
    routePattern: "/approval/dashboard",
    kind: "screen",
    allowedContext: "eligible-approval",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/approval/dashboard",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/approval/history/page.tsx",
    routePattern: "/approval/history",
    kind: "screen",
    allowedContext: "eligible-approval",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/approval/history",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/approval/orders/[orderId]/page.tsx",
    routePattern: "/approval/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-approval",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/approval/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/approval/page.tsx",
    routePattern: "/approval",
    kind: "redirect",
    allowedContext: "eligible-approval",
    fixtureKey: null,
    expectedDestination: "/approval/dashboard",
    scenarioKey: "route:/approval",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/approval/pending/page.tsx",
    routePattern: "/approval/pending",
    kind: "screen",
    allowedContext: "eligible-approval",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/approval/pending",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/account/page.tsx",
    routePattern: "/cutting/account",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/activity/page.tsx",
    routePattern: "/cutting/activity",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/activity",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/completed/page.tsx",
    routePattern: "/cutting/completed",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/completed",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/dashboard/page.tsx",
    routePattern: "/cutting/dashboard",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/dashboard",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/in-progress/page.tsx",
    routePattern: "/cutting/in-progress",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/in-progress",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/incoming/page.tsx",
    routePattern: "/cutting/incoming",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/incoming",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/cutting/orders/[orderId]/page.tsx",
    routePattern: "/cutting/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/cutting/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/page.tsx",
    routePattern: "/cutting",
    kind: "redirect",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: "/cutting/dashboard",
    scenarioKey: "route:/cutting",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/returned/page.tsx",
    routePattern: "/cutting/returned",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/cutting/returned",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/sent/page.tsx",
    routePattern: "/cutting/sent",
    kind: "redirect",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: "/cutting/completed",
    scenarioKey: "route:/cutting/sent",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/tasks/[orderId]/page.tsx",
    routePattern: "/cutting/tasks/[orderId]",
    kind: "screen",
    allowedContext: "eligible-cutting",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/cutting/tasks/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/cutting/waiting/page.tsx",
    routePattern: "/cutting/waiting",
    kind: "redirect",
    allowedContext: "eligible-cutting",
    fixtureKey: null,
    expectedDestination: "/cutting/incoming",
    scenarioKey: "route:/cutting/waiting",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/account/page.tsx",
    routePattern: "/production/account",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/activity/page.tsx",
    routePattern: "/production/activity",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/activity",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/completed/page.tsx",
    routePattern: "/production/completed",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/completed",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/dashboard/page.tsx",
    routePattern: "/production/dashboard",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/dashboard",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/in-progress/page.tsx",
    routePattern: "/production/in-progress",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/in-progress",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/incoming/page.tsx",
    routePattern: "/production/incoming",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/incoming",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/production/orders/[orderId]/page.tsx",
    routePattern: "/production/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/production/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/page.tsx",
    routePattern: "/production",
    kind: "redirect",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: "/production/dashboard",
    scenarioKey: "route:/production",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/repairs/page.tsx",
    routePattern: "/production/repairs",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/repairs",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/returned/page.tsx",
    routePattern: "/production/returned",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/production/returned",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/sent/page.tsx",
    routePattern: "/production/sent",
    kind: "redirect",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: "/production/completed",
    scenarioKey: "route:/production/sent",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/production/tasks/[orderId]/page.tsx",
    routePattern: "/production/tasks/[orderId]",
    kind: "screen",
    allowedContext: "eligible-production",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/production/tasks/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/production/waiting/page.tsx",
    routePattern: "/production/waiting",
    kind: "redirect",
    allowedContext: "eligible-production",
    fixtureKey: null,
    expectedDestination: "/production/incoming",
    scenarioKey: "route:/production/waiting",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/accepted/page.tsx",
    routePattern: "/quality/accepted",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/accepted",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/account/page.tsx",
    routePattern: "/quality/account",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/activity/page.tsx",
    routePattern: "/quality/activity",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/activity",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/corrections/page.tsx",
    routePattern: "/quality/corrections",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/corrections",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/dashboard/page.tsx",
    routePattern: "/quality/dashboard",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/dashboard",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/incoming/page.tsx",
    routePattern: "/quality/incoming",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/incoming",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/inspection/page.tsx",
    routePattern: "/quality/inspection",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/quality/inspection",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/quality/orders/[orderId]/page.tsx",
    routePattern: "/quality/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/quality/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/page.tsx",
    routePattern: "/quality",
    kind: "redirect",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: "/quality/dashboard",
    scenarioKey: "route:/quality",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/reinspection/page.tsx",
    routePattern: "/quality/reinspection",
    kind: "redirect",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: "/quality/corrections",
    scenarioKey: "route:/quality/reinspection",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/sent/page.tsx",
    routePattern: "/quality/sent",
    kind: "redirect",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: "/quality/accepted",
    scenarioKey: "route:/quality/sent",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/tasks/[orderId]/page.tsx",
    routePattern: "/quality/tasks/[orderId]",
    kind: "screen",
    allowedContext: "eligible-quality",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/quality/tasks/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/quality/waiting/page.tsx",
    routePattern: "/quality/waiting",
    kind: "redirect",
    allowedContext: "eligible-quality",
    fixtureKey: null,
    expectedDestination: "/quality/incoming",
    scenarioKey: "route:/quality/waiting",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/account/page.tsx",
    routePattern: "/sales/account",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/activity/page.tsx",
    routePattern: "/sales/activity",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/activity",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/sales/customers/[phone]/edit/page.tsx",
    routePattern: "/sales/customers/[phone]/edit",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: "owned-customer",
    expectedDestination: null,
    scenarioKey: "route:/sales/customers/[phone]/edit",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/customers/[phone]/page.tsx",
    routePattern: "/sales/customers/[phone]",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: "owned-customer",
    expectedDestination: null,
    scenarioKey: "route:/sales/customers/[phone]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/customers/new/page.tsx",
    routePattern: "/sales/customers/new",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/customers/new",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/customers/page.tsx",
    routePattern: "/sales/customers",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/customers",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/dashboard/page.tsx",
    routePattern: "/sales/dashboard",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/dashboard",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/sales/orders/[orderId]/edit/page.tsx",
    routePattern: "/sales/orders/[orderId]/edit",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: "returned-order",
    expectedDestination: null,
    scenarioKey: "route:/sales/orders/[orderId]/edit",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/orders/[orderId]/page.tsx",
    routePattern: "/sales/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/sales/orders/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/orders/drafts/page.tsx",
    routePattern: "/sales/orders/drafts",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/orders/drafts",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/orders/new/page.tsx",
    routePattern: "/sales/orders/new",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/orders/new",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/orders/page.tsx",
    routePattern: "/sales/orders",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/orders",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/orders/returned/page.tsx",
    routePattern: "/sales/orders/returned",
    kind: "screen",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/sales/orders/returned",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/sales/page.tsx",
    routePattern: "/sales",
    kind: "redirect",
    allowedContext: "eligible-sales-owner",
    fixtureKey: null,
    expectedDestination: "/sales/dashboard",
    scenarioKey: "route:/sales",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/account/page.tsx",
    routePattern: "/warehouse/account",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/account",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/activity/page.tsx",
    routePattern: "/warehouse/activity",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/activity",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/dashboard/page.tsx",
    routePattern: "/warehouse/dashboard",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/dashboard",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/delivered/page.tsx",
    routePattern: "/warehouse/delivered",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/delivered",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/warehouse/delivery-failed/page.tsx",
    routePattern: "/warehouse/delivery-failed",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/delivery-failed",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/in-progress/page.tsx",
    routePattern: "/warehouse/in-progress",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/in-progress",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/incoming/page.tsx",
    routePattern: "/warehouse/incoming",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/incoming",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/incomplete/page.tsx",
    routePattern: "/warehouse/incomplete",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/incomplete",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/warehouse/orders/[orderId]/page.tsx",
    routePattern: "/warehouse/orders/[orderId]",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: "owned-order",
    expectedDestination: null,
    scenarioKey: "route:/warehouse/orders/[orderId]",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/warehouse/out-for-delivery/page.tsx",
    routePattern: "/warehouse/out-for-delivery",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/out-for-delivery",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/page.tsx",
    routePattern: "/warehouse",
    kind: "redirect",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: "/warehouse/dashboard",
    scenarioKey: "route:/warehouse",
  },
  {
    sourcePage: "apps/web/src/app/(workspace)/warehouse/ready/page.tsx",
    routePattern: "/warehouse/ready",
    kind: "screen",
    allowedContext: "eligible-warehouse",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/warehouse/ready",
  },
  {
    sourcePage:
      "apps/web/src/app/(workspace)/warehouse/tasks/[orderId]/page.tsx",
    routePattern: "/warehouse/tasks/[orderId]",
    kind: "redirect",
    allowedContext: "eligible-warehouse",
    fixtureKey: "owned-order",
    expectedDestination: "/warehouse/orders/[orderId]",
    scenarioKey: "route:/warehouse/tasks/[orderId]",
  },
  {
    sourcePage: "apps/web/src/app/auth/forgot-password/page.tsx",
    routePattern: "/auth/forgot-password",
    kind: "screen",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/forgot-password",
  },
  {
    sourcePage: "apps/web/src/app/auth/login/page.tsx",
    routePattern: "/auth/login",
    kind: "screen",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/login",
  },
  {
    sourcePage: "apps/web/src/app/auth/otp/page.tsx",
    routePattern: "/auth/otp",
    kind: "development-only",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/otp",
  },
  {
    sourcePage: "apps/web/src/app/auth/pending-approval/page.tsx",
    routePattern: "/auth/pending-approval",
    kind: "screen",
    allowedContext: "credential-valid-restricted",
    fixtureKey: "pending-approval",
    expectedDestination: null,
    scenarioKey: "route:/auth/pending-approval",
  },
  {
    sourcePage: "apps/web/src/app/auth/register/page.tsx",
    routePattern: "/auth/register",
    kind: "screen",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/register",
  },
  {
    sourcePage: "apps/web/src/app/auth/rejected/page.tsx",
    routePattern: "/auth/rejected",
    kind: "screen",
    allowedContext: "credential-valid-restricted",
    fixtureKey: "rejected",
    expectedDestination: null,
    scenarioKey: "route:/auth/rejected",
  },
  {
    sourcePage: "apps/web/src/app/auth/reset-password/page.tsx",
    routePattern: "/auth/reset-password",
    kind: "screen",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/reset-password",
  },
  {
    sourcePage: "apps/web/src/app/auth/suspended/page.tsx",
    routePattern: "/auth/suspended",
    kind: "screen",
    allowedContext: "credential-valid-restricted",
    fixtureKey: "suspended",
    expectedDestination: null,
    scenarioKey: "route:/auth/suspended",
  },
  {
    sourcePage: "apps/web/src/app/auth/verify-email/page.tsx",
    routePattern: "/auth/verify-email",
    kind: "screen",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/verify-email",
  },
  {
    sourcePage: "apps/web/src/app/auth/verify-otp/page.tsx",
    routePattern: "/auth/verify-otp",
    kind: "development-only",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/auth/verify-otp",
  },
  {
    sourcePage: "apps/web/src/app/page.tsx",
    routePattern: "/",
    kind: "redirect",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: "/auth/login",
    scenarioKey: "route:/",
  },
  {
    sourcePage: "apps/web/src/app/prototype-preview/page.tsx",
    routePattern: "/prototype-preview",
    kind: "development-only",
    allowedContext: "anonymous",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/prototype-preview",
  },
  {
    sourcePage: "apps/web/src/app/unauthorized/page.tsx",
    routePattern: "/unauthorized",
    kind: "screen",
    allowedContext: "eligible-admin",
    fixtureKey: null,
    expectedDestination: null,
    scenarioKey: "route:/unauthorized",
  },
] as const satisfies readonly P08RouteCase[];

export const P08_ACTION_CASES = [
  {
    roadmapEntry:
      "Staff approve/reject/manage and department/status controls in `admin-users-view.tsx`",
    callers: [
      "apps/web/src/features/administration/screens/admin-users-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/staff-identity.spec.ts",
        scenarioKey:
          "C1: a verified employee waits for approval, then reaches only the approved workspace",
      },
      {
        owner: "apps/web/e2e/staff-identity.spec.ts",
        scenarioKey:
          "C2: the directory keeps every decision of the same identity and never reactivates a legacy suspended account",
      },
      {
        owner: "apps/web/e2e/staff-identity.spec.ts",
        scenarioKey:
          "C3: a suspended employee's next protected request is denied and a later department is allowed",
      },
    ],
  },
  {
    roadmapEntry: "`admin-assign-role-dialog.tsx`",
    callers: [
      "apps/web/src/features/administration/screens/admin-users-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/staff-identity.spec.ts",
        scenarioKey:
          "C2: the directory keeps every decision of the same identity and never reactivates a legacy suspended account",
      },
    ],
  },
  {
    roadmapEntry: "Profile, password, logout and logout-all forms",
    callers: [
      "apps/web/src/features/prototype/components/oriental-account-settings.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/staff-identity.spec.ts",
        scenarioKey:
          "C4: recovery, a password change and a session ending behave truthfully",
      },
    ],
  },
  {
    roadmapEntry: "`inline-customer-modal.tsx` and customer create/edit forms",
    callers: [
      "apps/web/src/features/sales/screens/sales-create-order-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P02-C2 inline captures and copied physical pieces persist without implicit saves",
      },
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P02-C1 shared customers, equivalent phones and stable identity",
      },
    ],
  },
  {
    roadmapEntry:
      "Paper cells, searchable portal menu, size table, adjustment fields, notes/signature, floor/options and money controls",
    callers: [
      "apps/web/src/features/orders/components/order-paper-form-screen.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P03 catalog selections, exact quotes, free text and 1/8/9/17 physical paper rows",
      },
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P02-C2 inline captures and copied physical pieces persist without implicit saves",
      },
    ],
  },
  {
    roadmapEntry: "Add, duplicate, remove piece; save draft; submit/resubmit",
    callers: [
      "apps/web/src/features/sales/screens/sales-create-order-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P03 direct and dirty saved submission retain terms with A/B/admin scoped histories after reload",
      },
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P02-C2 inline captures and copied physical pieces persist without implicit saves",
      },
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P03 returned correction, lazy history and paid-only lost-response recovery use persisted consumer fixtures",
      },
    ],
  },
  {
    roadmapEntry: "`approval-return-modal.tsx`",
    callers: [
      "apps/web/src/features/approval/screens/approval-decision-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey:
          "P04 US1 return correct resubmit approve persists terms and denies stale and foreign decisions",
      },
    ],
  },
  {
    roadmapEntry: "`approval-problem-resolution-modal.tsx`",
    callers: [
      "apps/web/src/features/approval/screens/approval-decision-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey:
          "P04 US2 RETURN_TO_DEPARTMENT changes only the reported piece",
        sourceWitness: "`P04 US2 ${decision} changes only the reported piece`",
      },
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey: "P04 US2 SEND_TO_SALES changes only the reported piece",
        sourceWitness: "`P04 US2 ${decision} changes only the reported piece`",
      },
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey: "P04 US2 CANCEL changes only the reported piece",
        sourceWitness: "`P04 US2 ${decision} changes only the reported piece`",
      },
    ],
  },
  {
    roadmapEntry:
      "`sales-problem-contact-modal.tsx`, including its nested cancellation confirmation",
    callers: [
      "apps/web/src/features/sales/screens/sales-order-detail-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey:
          "P04 US3 four-field proposal stays held through return and renewed acceptance",
      },
      {
        owner: "apps/web/e2e/approval-reapproval-printing.spec.ts",
        scenarioKey:
          "P04 US3 cancellation request changes no money until approval cancellation",
      },
    ],
  },
  {
    roadmapEntry:
      "`receive-and-start-dialog.tsx`, `confirm-receipt-dialog.tsx`, `start-work-dialog.tsx`",
    callers: [
      "apps/web/src/features/manufacturing/screens/factory-task-detail-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/quality-packing-reinspection.spec.ts",
        scenarioKey:
          "P06 US1 ordinary colleagues exact subsets optional packing and physical receipt separation",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US2 CUTTING colleague preserves starter and exact companions",
        sourceWitness:
          "`P05 US2 ${department} colleague preserves starter and exact companions`",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US2 PRODUCTION colleague preserves starter and exact companions",
        sourceWitness:
          "`P05 US2 ${department} colleague preserves starter and exact companions`",
      },
    ],
  },
  {
    roadmapEntry:
      "`record-completion-dialog.tsx` and piece/batch completion controls",
    callers: [
      "apps/web/src/features/manufacturing/screens/factory-task-detail-view.tsx",
      "apps/web/src/features/manufacturing/screens/cutting-workspace.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US2 CUTTING colleague preserves starter and exact companions",
        sourceWitness:
          "`P05 US2 ${department} colleague preserves starter and exact companions`",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US2 PRODUCTION colleague preserves starter and exact companions",
        sourceWitness:
          "`P05 US2 ${department} colleague preserves starter and exact companions`",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US3 SHOP exact subset follows both normal destinations",
        sourceWitness:
          "`P05 US3 ${type} exact subset follows both normal destinations`",
      },
    ],
  },
  {
    roadmapEntry: "`piece-report-problem-modal.tsx`",
    callers: [
      "apps/web/src/features/manufacturing/screens/department-piece-table.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/quality-packing-reinspection.spec.ts",
        scenarioKey:
          "P06 US5 exact issue holds retained safe history aliases filters keyboard and current authority",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US4 CUTTING one-piece hold repeated approved returns and cancellation retain history",
        sourceWitness:
          "`P05 US4 ${department} one-piece hold repeated approved returns and cancellation retain history`",
      },
    ],
  },
  {
    roadmapEntry:
      "`quality-inspect-piece-modal.tsx`, `quality-inspection-dialog.tsx`",
    callers: [
      "apps/web/src/features/manufacturing/screens/quality-workspace.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/quality-packing-reinspection.spec.ts",
        scenarioKey:
          "P06 US3 both correction routes repeated cycles paginated immutable history and correction-department cancellation",
      },
      {
        owner: "apps/web/e2e/quality-packing-reinspection.spec.ts",
        scenarioKey:
          "P06 US1 ordinary colleagues exact subsets optional packing and physical receipt separation",
      },
    ],
  },
  {
    roadmapEntry:
      "`confirm-warehouse-receipt-dialog.tsx` and shared warehouse receipt operations",
    callers: [
      "apps/web/src/features/warehouse/components/warehouse-queue.tsx",
      "apps/web/src/features/warehouse/components/warehouse-order-detail.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US1 separate physical arrivals retain exact fields and reconcile ready across colleagues",
      },
    ],
  },
  {
    roadmapEntry:
      "`dispatch-delivery-dialog.tsx` and whole-order batch dispatch",
    callers: [
      "apps/web/src/features/warehouse/components/warehouse-order-detail.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US3 cancelled companion whole-order review cancel dispatch and supplied customer receipt",
      },
    ],
  },
  {
    roadmapEntry: "`confirm-delivery-dialog.tsx`",
    callers: [
      "apps/web/src/features/warehouse/components/warehouse-order-detail.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US3 cancelled companion whole-order review cancel dispatch and supplied customer receipt",
      },
    ],
  },
  {
    roadmapEntry:
      "`delivery-failed-dialog.tsx`, `record-delivery-failed-dialog.tsx`",
    callers: [
      "apps/web/src/features/warehouse/components/warehouse-queue.tsx",
      "apps/web/src/features/warehouse/components/warehouse-order-detail.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US5 repeated acknowledged returns retain attempts and explicit retry dates",
      },
    ],
  },
  {
    roadmapEntry: "`retry-delivery-dialog.tsx` and warehouse retry operations",
    callers: [
      "apps/web/src/features/warehouse/components/warehouse-order-detail.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US5 repeated acknowledged returns retain attempts and explicit retry dates",
      },
    ],
  },
  {
    roadmapEntry: "`admin-cancel-dialog.tsx` and `cancellation-scope.tsx`",
    callers: [
      "apps/web/src/features/administration/screens/admin-order-detail-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 exact cancellation scopes retain paid and audit while terminal correction never rewinds work",
      },
    ],
  },
  {
    roadmapEntry: "`admin-reopen-dialog.tsx` and admin correction controls",
    callers: [
      "apps/web/src/features/administration/screens/admin-order-detail-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 exact cancellation scopes retain paid and audit while terminal correction never rewinds work",
      },
    ],
  },
  {
    roadmapEntry:
      "Report filters/print preview, pagination, group/flat tabs, expand/select-all, tracking/history tabs",
    callers: [
      "apps/web/src/features/administration/screens/admin-reports-view.tsx",
      "apps/web/src/features/manufacturing/screens/department-order-table.tsx",
      "apps/web/src/features/manufacturing/screens/department-piece-table.tsx",
      "apps/web/src/features/warehouse/components/warehouse-queue.tsx",
      "apps/web/src/features/administration/screens/admin-order-detail-view.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 complete report snapshot and physical portrait preserve six sections and real rows",
      },
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 report filters retain one order cohort and a separately scoped current staff directory",
      },
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 dashboard drilldown counts pages oversight tabs and lazy history use the current backend",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US1 safe current and retained reads preserve routes exact selection and presentation",
      },
      {
        owner: "apps/web/e2e/cutting-production-workspaces.spec.ts",
        scenarioKey:
          "P05 US1 CUTTING server pages filters and select-all retain exact current-page identities",
        sourceWitness:
          "`P05 US1 ${department} server pages filters and select-all retain exact current-page identities`",
      },
      {
        owner: "apps/web/e2e/warehouse-receipt-delivery.spec.ts",
        scenarioKey:
          "P07 US6 access safe projections aliases keyboard and page-scoped selection",
      },
      {
        owner: "apps/web/e2e/customer-drafts.spec.ts",
        scenarioKey:
          "P03 returned correction, lazy history and paid-only lost-response recovery use persisted consumer fixtures",
      },
    ],
  },
  {
    roadmapEntry: "Toasts and success/error confirmations",
    callers: [
      "apps/web/src/features/administration/components/administration-command-recovery.tsx",
    ],
    evidence: [
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 committed lost reply survives close and observes original intent without repost",
      },
    ],
  },
  {
    roadmapEntry: "OTP input and role/reset/demo controls in prototype preview",
    callers: ["apps/web/src/features/prototype/screens/prototype-preview.tsx"],
    evidence: [
      {
        owner: "apps/web/e2e/administration-readiness.spec.ts",
        scenarioKey:
          "P08 every route case renders in its admitted context with exact redirects and production isolation",
      },
    ],
  },
] as const;

export const P08_UNREACHED_ALTERNATIVES = [
  "ConfirmReceiptDialog",
  "StartWorkDialog",
  "AdminAssignRoleDialog",
] as const;
