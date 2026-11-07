import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { AuthUserData } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { useP04OperationalScope } from "@/shared/query/operational-scope";
import { useMvpStore } from "@/features/prototype/state/mvp-store";
import { p03Ids, p03Session, p03Envelope } from "@/test/p03-fixtures";
import OrderAlias from "@/app/(print)/orders/[orderId]/print/page";
import PrintAlias from "@/app/(print)/print/order/[orderId]/page";
import { PrintAccessBoundary } from "./print-access-boundary";

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  pathname: `/orders/22222222-2222-4222-8222-222222222222/print`,
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => transport.pathname,
  useRouter: () => ({ replace: transport.replace }),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: { get: transport.get },
}));
const client = createQueryClient();
let account: AuthUserData;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  account = p03Session();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account);
  transport.pathname = `/orders/${p03Ids.order}/print`;
  transport.get.mockImplementation((path: string) => {
    if (path !== "/users/me") throw new Error(`Unexpected read ${path}`);
    return Promise.resolve(p03Envelope(account));
  });
});
afterEach(() => {
  client.clear();
  localStorage.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
function OfficialCapabilityProbe() {
  const scope = useP04OperationalScope("OFFICIAL_PAPER");
  return (
    <p>
      {scope === null
        ? "Official capability denied"
        : "Official capability available"}
    </p>
  );
}
function ReportProviderProbe() {
  const store = useMvpStore();
  return (
    <p>
      {Array.isArray(store.orders)
        ? "Legacy report provider available"
        : "Invalid provider"}
    </p>
  );
}
const mount = (report = false) =>
  render(
    <QueryClientProvider client={client}>
      <PrintAccessBoundary>
        {report ? <ReportProviderProbe /> : <OfficialCapabilityProbe />}
      </PrintAccessBoundary>
    </QueryClientProvider>,
  );
it.each([
  ["SALES", "orders"],
  ["APPROVAL", "orders"],
  ["ADMIN", "orders"],
  ["SALES", "print"],
  ["APPROVAL", "print"],
  ["ADMIN", "print"],
] as const)(
  "composes current business protection and official capability for %s at the %s alias",
  async (role, alias) => {
    account = {
      user: {
        ...p03Session().user,
        ...(role === "ADMIN"
          ? { role: "ADMIN", department: null, staffApprovedAt: null }
          : { department: role }),
      },
    };
    transport.pathname =
      alias === "orders"
        ? `/orders/${p03Ids.order}/print`
        : `/print/order/${p03Ids.order}`;
    mount();
    expect(
      await screen.findByText("Official capability available"),
    ).toBeInTheDocument();
    expect(transport.replace).not.toHaveBeenCalled();
  },
);
it.each(["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"] as const)(
  "keeps factory %s business entry separate from official paper eligibility",
  async (department) => {
    account = { user: { ...p03Session().user, department } };
    mount();
    expect(
      await screen.findByText("Official capability denied"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Official capability available"),
    ).not.toBeInTheDocument();
    expect(
      transport.get.mock.calls.every(
        (call: readonly unknown[]) => call[0] === "/users/me",
      ),
    ).toBe(true);
  },
);
it.each([
  "/reports/print",
  "/print/order",
  `/orders/${p03Ids.order}/print/extra`,
  `/print/order/${p03Ids.order}/extra`,
])("retains ADMIN restriction for report/unknown family %s", async (path) => {
  transport.pathname = path;
  mount();
  await waitFor(() => {
    expect(transport.replace).toHaveBeenCalledWith("/unauthorized");
  });
  expect(
    screen.queryByText("Official capability available"),
  ).not.toBeInTheDocument();
});
it("retains the actual legacy provider for ADMIN reports", async () => {
  account = {
    user: {
      ...p03Session().user,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    },
  };
  transport.pathname = "/reports/print";
  mount(true);
  expect(
    await screen.findByText("Legacy report provider available"),
  ).toBeInTheDocument();
});
it.each(["SUSPENDED", "PENDING_APPROVAL"] as const)(
  "withholds order content for a current %s account",
  async (status) => {
    account = {
      user: {
        ...p03Session().user,
        status,
        ...(status === "PENDING_APPROVAL"
          ? { department: null, staffApprovedAt: null }
          : {}),
      },
    };
    mount();
    await waitFor(() => {
      expect(transport.replace).toHaveBeenCalled();
    });
    expect(
      screen.queryByText("Official capability available"),
    ).not.toBeInTheDocument();
  },
);
it("awaits both server route params and passes the identical explicit ID to the common screen", async () => {
  const first = await OrderAlias({
    params: Promise.resolve({ orderId: p03Ids.order }),
  });
  const second = await PrintAlias({
    params: Promise.resolve({ orderId: p03Ids.order }),
  });
  expect(first).toHaveProperty("props.orderId", p03Ids.order);
  expect(second).toHaveProperty("props.orderId", p03Ids.order);
  expect(first.type).toBe(second.type);
});
