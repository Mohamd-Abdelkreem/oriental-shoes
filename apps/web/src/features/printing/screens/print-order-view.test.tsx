import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  officialOrderPaperDataSchema,
  type AuthUserData,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import {
  initialSnapshot,
  storageKey,
} from "@/features/prototype/state/mvp-store";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import PrintLayout from "@/app/(print)/layout";
import OrderAlias from "@/app/(print)/orders/[orderId]/print/page";
import PrintAlias from "@/app/(print)/print/order/[orderId]/page";
import { orderPaperKeys } from "../hooks/order-paper.hooks";
import { PrintOrderView } from "./print-order-view";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<ReturnType<typeof p03Envelope>>>(),
  print: vi.fn<() => void>(),
  pathname: "/print/order/22222222-2222-4222-8222-222222222222",
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
const official = (version = 2) => {
  const original = orderFixture(version);
  const actor = {
    id: p03Ids.source,
    role: "USER",
    department: "APPROVAL",
    fullName: "Actual initial approver",
  };
  return officialOrderPaperDataSchema.parse({
    order: {
      ...original,
      status: "APPROVED",
      responsibleSignature: "Original captured signature",
      approval: { ...original.approval, approvedAt: p03Instant },
      pieces: original.pieces.map((piece) => ({
        ...piece,
        stage: "CUTTING",
        workState: "INCOMING",
      })),
    },
    approval: {
      initial: {
        decisionId: p03Ids.command,
        orderVersion: 1,
        actor,
        approvedAt: p03Instant,
      },
      pieces: [
        {
          decisionId: p03Ids.source,
          orderVersion: 2,
          actor: { ...actor, fullName: "Actual amendment approver" },
          approvedAt: p03Instant,
          pieceId: p03Ids.piece,
          proposalId: p03Ids.customer,
        },
      ],
    },
    printVersion: version,
  });
};
const failure = (status: number, code: string) =>
  new AxiosError("Read denied", undefined, undefined, undefined, {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "Official read unavailable",
      requestId: "paper-request",
    },
  });
const setAccount = (
  role:
    | "SALES"
    | "APPROVAL"
    | "ADMIN"
    | "CUTTING"
    | "PRODUCTION"
    | "QUALITY"
    | "WAREHOUSE",
) => {
  account = authUserDataSchema.parse({
    user: {
      ...p03Session().user,
      ...(role === "ADMIN"
        ? { role: "ADMIN", department: null, staffApprovedAt: null }
        : { department: role }),
    },
  });
  client.setQueryData(AUTH_SESSION_QUERY_KEY, account);
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  setAccount("SALES");
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.pathname = `/print/order/${p03Ids.order}`;
  transport.get.mockImplementation((path: string) => {
    if (path === "/users/me") return Promise.resolve(p03Envelope(account));
    if (path === `/order-paper/${p03Ids.order}`)
      return Promise.resolve(p03Envelope(official()));
    throw new Error(`Unexpected read ${path}`);
  });
  vi.spyOn(window, "print").mockImplementation(() => {
    transport.print();
  });
});
afterEach(() => {
  client.clear();
  localStorage.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = (id = p03Ids.order) =>
  render(
    <QueryClientProvider client={client}>
      <PrintOrderView orderId={id} />
    </QueryClientProvider>,
  );
const paperElement = (container: HTMLElement) =>
  container.querySelector<HTMLDivElement>("[data-official-paper='true']");
it.each(["SALES", "APPROVAL", "ADMIN"] as const)(
  "renders only the strict official projection for current eligible %s",
  async (role) => {
    setAccount(role);
    const view = mount();
    await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
    const document = paperElement(view.container);
    expect(document).not.toBeNull();
    expect(document).toHaveAttribute("data-print-version", "2");
    expect(document).toHaveTextContent("Original captured signature");
    expect(document).toHaveTextContent("Actual initial approver");
    expect(document).not.toHaveTextContent("Actual amendment approver");
    const preview = screen.getByRole("region", { name: "سجل الاعتماد الرسمي" });
    expect(preview).toHaveClass("print:hidden");
    expect(
      within(preview).getByText(/Actual amendment approver/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("الإجمالي المعتمد")).toHaveTextContent(
      "1800.00",
    );
    expect(transport.print).not.toHaveBeenCalled();
    expect(transport.get).toHaveBeenCalledWith(
      `/order-paper/${p03Ids.order}`,
      expect.anything(),
    );
  },
);
it.each(["orders", "print"] as const)(
  "shows loading without a warning before the official preview through the %s alias",
  async (alias) => {
    const pendingPaper =
      Promise.withResolvers<ReturnType<typeof p03Envelope>>();
    const read = transport.get.getMockImplementation();
    if (!read) throw new Error("Missing transport fixture");
    transport.get.mockImplementation((path: string) =>
      path === `/order-paper/${p03Ids.order}`
        ? pendingPaper.promise
        : read(path),
    );
    transport.pathname =
      alias === "orders"
        ? `/orders/${p03Ids.order}/print`
        : `/print/order/${p03Ids.order}`;
    const route =
      alias === "orders"
        ? await OrderAlias({
            params: Promise.resolve({ orderId: p03Ids.order }),
          })
        : await PrintAlias({
            params: Promise.resolve({ orderId: p03Ids.order }),
          });
    const view = render(
      <QueryClientProvider client={client}>
        <PrintLayout>{route}</PrintLayout>
      </QueryClientProvider>,
    );
    const loading = await screen.findByRole("status", { busy: true });
    expect(loading).toHaveTextContent("جارٍ تحميل النسخة الرسمية الحالية");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة" }),
    ).not.toBeInTheDocument();
    expect(paperElement(view.container)).toBeNull();

    pendingPaper.resolve(p03Envelope(official()));
    await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
    expect(
      screen.queryByRole("button", { name: "رجوع" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "طباعة المستند بالعرض (Ctrl + P)" }),
    ).toBeEnabled();
    expect(paperElement(view.container)).toHaveAttribute(
      "data-print-version",
      "2",
    );
    expect(transport.replace).not.toHaveBeenCalled();
  },
);
it.each(["CUTTING", "PRODUCTION", "QUALITY", "WAREHOUSE"] as const)(
  "obtains no financial DTO for current factory %s",
  (role) => {
    setAccount(role);
    const view = mount();
    expect(
      screen.getByText("طباعة الاستمارة غير مصرحة لهذا الحساب"),
    ).toBeInTheDocument();
    expect(paperElement(view.container)).toBeNull();
    expect(transport.get).not.toHaveBeenCalled();
  },
);
it.each([
  [
    "ORDER_PRINT_NOT_APPROVED",
    "لا يمكن طباعة أمر التفصيل قبل اعتماد رسمي محفوظ.",
  ],
  ["ORDER_PRINT_RETURNED", "لا يمكن طباعة طلب معاد للمبيعات حتى حسم اعتماده."],
  [
    "ORDER_PRINT_REAPPROVAL_PENDING",
    "الطباعة الرسمية متوقفة حتى حسم جميع تعديلات القطع المرسلة لإعادة الاعتماد.",
  ],
])(
  "withholds every official document for %s without reading local fallback",
  async (code, text) => {
    const snapshot = initialSnapshot(),
      first = snapshot.orders[0];
    if (!first) throw new Error("Missing local fixture");
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...snapshot,
        sessionRole: "admin",
        orders: [
          {
            ...first,
            id: p03Ids.order,
            customer: "FAKE_LOCAL_CUSTOMER",
            status: "قيد التصنيع",
          },
        ],
      }),
    );
    transport.get.mockRejectedValue(failure(409, code));
    const view = mount();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(paperElement(view.container)).toBeNull();
    expect(screen.queryByText("FAKE_LOCAL_CUSTOMER")).not.toBeInTheDocument();
    expect(transport.print).not.toHaveBeenCalled();
  },
);
it("rejects a foreign-owner read and a malformed resource ID with no document", async () => {
  transport.get.mockRejectedValue(failure(404, "ORDER_NOT_FOUND"));
  const view = mount();
  await screen.findByText("الطلب المطلوب غير متاح. حدّث قائمة الطلبات.");
  expect(paperElement(view.container)).toBeNull();
  view.unmount();
  const reads = transport.get.mock.calls.length;
  const malformed = mount("SHOP-2026-0001");
  expect(screen.getByText("مرجع أمر التفصيل غير صالح")).toBeInTheDocument();
  expect(paperElement(malformed.container)).toBeNull();
  expect(transport.get).toHaveBeenCalledTimes(reads);
});
it("removes retained printable DOM after a failed refresh and restores it only after a successful current read", async () => {
  const view = mount();
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  const scope = readP04OperationalScope(client, "OFFICIAL_PAPER");
  if (!scope) throw new Error("Missing paper scope");
  transport.get.mockRejectedValue(failure(503, "READ_UNAVAILABLE"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: orderPaperKeys.order(scope, p03Ids.order),
      exact: true,
    });
  });
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent(
    "الخدمة غير متاحة مؤقتًا. انتظر قليلًا ثم حدّث البيانات.",
  );
  expect(error).toHaveTextContent("paper-request");
  expect(paperElement(view.container)).toBeNull();
  expect(transport.print).not.toHaveBeenCalled();
  const retryPaper = Promise.withResolvers<ReturnType<typeof p03Envelope>>();
  transport.get.mockReturnValue(retryPaper.promise);
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  expect(await screen.findByRole("status", { busy: true })).toHaveTextContent(
    "جارٍ تحميل النسخة الرسمية الحالية",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  retryPaper.resolve(p03Envelope(official(3)));
  await waitFor(() =>
    expect(paperElement(view.container)).toHaveAttribute(
      "data-print-version",
      "3",
    ),
  );
});
it("waits for the fresh version's DOM commit and prints once despite repeated triggers", async () => {
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <PrintOrderView orderId={p03Ids.order} />
      </QueryClientProvider>
    </StrictMode>,
  );
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  const initialReads = transport.get.mock.calls.length;
  let release: (reply: ReturnType<typeof p03Envelope>) => void = () => {
    throw new Error("Missing preflight");
  };
  const pending = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  transport.get.mockReturnValueOnce(pending);
  const snapshots: { version: string | null; hidden: boolean }[] = [];
  transport.print.mockImplementation(() => {
    window.dispatchEvent(new Event("beforeprint"));
    const element = paperElement(view.container);
    snapshots.push({
      version: element?.getAttribute("data-print-version") ?? null,
      hidden: element?.hidden ?? true,
    });
  });
  const button = screen.getByRole("button", {
    name: "طباعة المستند بالعرض (Ctrl + P)",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(initialReads + 1);
  });
  expect(paperElement(view.container)).toBeNull();
  expect(transport.print).not.toHaveBeenCalled();
  await act(async () => {
    release(p03Envelope(official(3)));
    await pending;
  });
  await waitFor(() => {
    expect(transport.print).toHaveBeenCalledTimes(1);
  });
  expect(snapshots).toEqual([{ version: "3", hidden: false }]);
  expect(transport.get).toHaveBeenCalledTimes(initialReads + 1);
});
it("never opens print when the preflight discovers a pending submitted review", async () => {
  const view = mount();
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  transport.get.mockRejectedValue(
    failure(409, "ORDER_PRINT_REAPPROVAL_PENDING"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "طباعة المستند بالعرض (Ctrl + P)" }),
  );
  expect(
    await screen.findByText(
      "الطباعة الرسمية متوقفة حتى حسم جميع تعديلات القطع المرسلة لإعادة الاعتماد.",
    ),
  ).toBeInTheDocument();
  expect(paperElement(view.container)).toBeNull();
  expect(transport.print).not.toHaveBeenCalled();
});
it("suppresses a preflight completion after account replacement", async () => {
  const view = mount();
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  let release: (reply: ReturnType<typeof p03Envelope>) => void = () => {
    throw new Error("Missing old preflight");
  };
  const pending = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  transport.get
    .mockReturnValueOnce(pending)
    .mockRejectedValue(failure(404, "ORDER_NOT_FOUND"));
  fireEvent.click(
    screen.getByRole("button", { name: "طباعة المستند بالعرض (Ctrl + P)" }),
  );
  await act(async () => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("replacement", epoch, p03Ids.customer);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session(p03Ids.customer));
    release(p03Envelope(official(3)));
    await pending;
  });
  await screen.findByText("الطلب المطلوب غير متاح. حدّث قائمة الطلبات.");
  expect(paperElement(view.container)).toBeNull();
  expect(transport.print).not.toHaveBeenCalled();
});
it("preserves native loaded-preview printing and synchronously hides known invalidation or old-account DOM", async () => {
  const view = mount();
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  const original = paperElement(view.container);
  if (!original) throw new Error("Missing document");
  const scope = readP04OperationalScope(client, "OFFICIAL_PAPER");
  if (!scope) throw new Error("Missing scope");
  const initialReads = transport.get.mock.calls.length;
  act(() => {
    window.dispatchEvent(new Event("beforeprint"));
  });
  expect(original.hidden).toBe(false);
  expect(transport.get).toHaveBeenCalledTimes(initialReads);
  expect(transport.print).not.toHaveBeenCalled();
  let invalidationHidden = false;
  act(() => {
    void client.invalidateQueries({
      queryKey: orderPaperKeys.order(scope, p03Ids.order),
      exact: true,
      refetchType: "none",
    });
    window.dispatchEvent(new Event("beforeprint"));
    invalidationHidden = original.hidden || !original.isConnected;
  });
  expect(invalidationHidden).toBe(true);
  await waitFor(() => {
    expect(paperElement(view.container)).toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  const current = paperElement(view.container);
  if (!current) throw new Error("Missing refreshed document");
  let scopeHidden = false;
  transport.get.mockRejectedValue(failure(404, "ORDER_NOT_FOUND"));
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("replacement", epoch, p03Ids.customer);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session(p03Ids.customer));
    window.dispatchEvent(new Event("beforeprint"));
    scopeHidden = current.hidden || !current.isConnected;
  });
  expect(scopeHidden).toBe(true);
  await waitFor(() => {
    expect(paperElement(view.container)).toBeNull();
  });
});
it("removes focus and print listeners when the valid preview unmounts", async () => {
  const view = mount();
  await screen.findByText("معاينة طباعة أمر التفصيل: SHOP-2026-0001");
  view.unmount();
  const reads = transport.get.mock.calls.length;
  act(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("beforeprint"));
  });
  await Promise.resolve();
  expect(transport.get).toHaveBeenCalledTimes(reads);
  expect(transport.print).not.toHaveBeenCalled();
});

it("withholds a warm cached paper until the new mounted read succeeds", async () => {
  const scope = readP04OperationalScope(client, "OFFICIAL_PAPER");
  if (!scope) throw new Error("Missing paper scope");
  client.setQueryData(orderPaperKeys.order(scope, p03Ids.order), official(2));
  let release: (reply: ReturnType<typeof p03Envelope>) => void = () => {
    throw new Error("Missing fresh read");
  };
  const pending = new Promise<ReturnType<typeof p03Envelope>>((resolve) => {
    release = resolve;
  });
  transport.get.mockReturnValue(pending);
  const view = mount();
  expect(paperElement(view.container)).toBeNull();
  await act(async () => {
    release(p03Envelope(official(3)));
    await pending;
  });
  await waitFor(() =>
    expect(paperElement(view.container)).toHaveAttribute(
      "data-print-version",
      "3",
    ),
  );
  expect(transport.print).not.toHaveBeenCalled();
});
