import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  salesOrderSummarySchema,
  approvalOrderDataSchema,
  approvalIssuesDataSchema,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  orderFixture,
  catalogFixture,
  p03Envelope,
  p03Ids,
  p03Instant,
  p03Pagination,
  p03Session,
} from "@/test/p03-fixtures";
import { SalesReturnedView } from "./sales-returned-view";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
const client = createQueryClient();
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
  vi.resetAllMocks();
});
it("reads a bounded returned queue and shows canonical reason/time without fabricated reviewer metadata", async () => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  const order = salesOrderSummarySchema.strip().parse({
    ...orderFixture(3),
    status: "RETURNED",
    returnInfo: { reason: "Correct the face", returnedAt: p03Instant },
    allowedActions: { canResubmit: true, canSetPaid: false },
  });
  const returnedResponse = p03Envelope({
    items: [{ kind: "submitted", order }],
    pagination: p03Pagination,
    totalOrders: 1,
    totalPieces: 1,
    statusCounts: {
      DRAFT: 0,
      AWAITING_APPROVAL: 0,
      RETURNED: 1,
      APPROVED: 0,
      READY_FOR_DELIVERY: 0,
      OUT_FOR_DELIVERY: 0,
      DELIVERY_FAILED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    },
  });
  transport.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/sales-contact"
        ? p03Envelope({ items: [], pagination: p03Pagination })
        : returnedResponse,
    ),
  );
  render(
    <QueryClientProvider client={client}>
      <SalesReturnedView />
    </QueryClientProvider>,
  );
  await screen.findByText("Correct the face");
  expect(screen.getByText(p03Instant)).toBeInTheDocument();
  expect(screen.getByText(order.businessNumber)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "تصحيح وإعادة الإرسال" }),
  ).toHaveAttribute("href", `/sales/orders/new?edit=${order.id}`);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledWith(
      "/sales-orders",
      expect.objectContaining({
        params: { page: 1, limit: 25, status: "RETURNED" },
      }),
    );
  });
  expect(screen.queryByText(/المراجع:/u)).not.toBeInTheDocument();
});

const start = () => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
};
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <SalesReturnedView />
    </QueryClientProvider>,
  );
const contactData = () => {
  const order = orderFixture(2),
    piece = order.pieces[0];
  if (!piece) throw new Error("Missing piece");
  const reviewer = {
    id: p03Ids.source,
    fullName: "Actual approver",
    role: "USER",
    department: "APPROVAL",
  };
  const wrapper = approvalOrderDataSchema.parse({
    order: {
      ...order,
      status: "APPROVED",
      approval: { ...order.approval, approvedAt: p03Instant },
      pieces: order.pieces.map((current) => ({
        ...current,
        stage: "CUTTING",
        workState: "BLOCKED",
      })),
    },
    workflow: {
      initialApproval: {
        decisionId: p03Ids.command,
        orderVersion: 1,
        actor: reviewer,
        approvedAt: p03Instant,
      },
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: true, reason: null },
      issues: [
        {
          id: p03Ids.source,
          orderId: order.id,
          pieceId: piece.id,
          state: "SALES_CONTACT",
          reportedAt: p03Instant,
          reason: "Contact the customer",
          notes: null,
          resumeTarget: "PRODUCTION",
          instructions: {
            commandId: p03Ids.command,
            actor: reviewer,
            occurredAt: p03Instant,
            text: "Confirm this exact piece",
          },
          allowedActions: {
            canResolve: false,
            canSubmitContact: true,
            canReviewContact: false,
          },
          source: {
            department: "CUTTING",
            stage: "CUTTING",
            workState: "IN_PROGRESS",
          },
          reporter: {
            id: p03Ids.customer,
            fullName: "Actual reporter",
            role: "USER",
            department: "CUTTING",
          },
          currentProposal: null,
        },
      ],
    },
  });
  const issue = wrapper.workflow.issues[0];
  if (!issue) throw new Error("Missing issue");
  const summary = salesOrderSummarySchema
    .strip()
    .parse({ ...wrapper.order, returnInfo: null });
  const row = {
    order: summary,
    piece: {
      id: piece.id,
      position: piece.position,
      model: piece.model,
      size: piece.size,
      leatherBase: piece.leatherBase,
      sole: piece.sole,
      stage: "CUTTING",
      workState: "BLOCKED",
    },
    issue: {
      id: issue.id,
      pieceId: piece.id,
      state: "SALES_CONTACT",
      reportedAt: issue.reportedAt,
      reason: issue.reason,
      notes: null,
      resumeTarget: issue.resumeTarget,
      instructions: issue.instructions,
      allowedActions: issue.allowedActions,
      sourceDepartment: "CUTTING",
      currentProposalId: null,
    },
  };
  const queued = approvalIssuesDataSchema.parse({
    items: [
      row,
      {
        ...row,
        order: {
          ...row.order,
          id: p03Ids.customer,
          businessNumber: "SHOP-2026-0002",
          sequence: "2",
        },
        piece: { ...row.piece, id: p03Ids.command },
        issue: {
          ...row.issue,
          id: p03Ids.actor,
          pieceId: p03Ids.command,
          state: "REAPPROVAL",
          currentProposalId: p03Ids.customer,
          allowedActions: {
            canResolve: false,
            canSubmitContact: false,
            canReviewContact: false,
          },
        },
      },
    ],
    pagination: {
      ...p03Pagination,
      total: 27,
      totalPages: 2,
      hasNextPage: true,
    },
  });
  return { wrapper, queued };
};
const returnedPage = (page = 1) => ({
  items: [
    {
      kind: "submitted",
      order: salesOrderSummarySchema.strip().parse({
        ...orderFixture(3),
        id: p03Ids.command,
        businessNumber: "SHOP-2026-0003",
        sequence: "3",
        status: "RETURNED",
        returnInfo: {
          reason: "Original initial correction",
          returnedAt: p03Instant,
        },
        allowedActions: { canResubmit: true, canSetPaid: false },
      }),
    },
  ],
  pagination: {
    ...p03Pagination,
    page,
    total: 26,
    totalPages: 2,
    hasNextPage: page === 1,
    hasPreviousPage: page > 1,
  },
  totalOrders: 26,
  totalPieces: 26,
  statusCounts: {
    DRAFT: 0,
    AWAITING_APPROVAL: 0,
    RETURNED: 26,
    APPROVED: 0,
    READY_FOR_DELIVERY: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERY_FAILED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  },
});
it("keeps initial-return and both contact states independently paged without a wrapper request for each row", async () => {
  start();
  const { queued } = contactData();
  transport.get.mockImplementation(
    (path: string, options?: { params?: { page?: number } }) => {
      const page = options?.params?.page ?? 1;
      if (path === "/sales-orders")
        return Promise.resolve(p03Envelope(returnedPage(page)));
      if (path === "/sales-contact")
        return Promise.resolve(
          p03Envelope({
            ...queued,
            pagination: {
              ...queued.pagination,
              page,
              hasNextPage: page === 1,
              hasPreviousPage: page > 1,
            },
          }),
        );
      return Promise.reject(new Error(`Unexpected read ${path}`));
    },
  );
  mount();
  await screen.findByText("Original initial correction");
  const contact = screen.getByRole("region", {
    name: "قطع تحتاج تواصلاً مع العميل",
  });
  expect(
    await within(contact).findByText("بانتظار إعادة الاعتماد"),
  ).toBeInTheDocument();
  expect(
    within(contact).getByText("بانتظار تواصل المبيعات"),
  ).toBeInTheDocument();
  expect(
    within(contact).getAllByRole("button", { name: "التواصل مع العميل" }),
  ).toHaveLength(1);
  expect(screen.getByRole("link", { name: "SHOP-2026-0003" })).toHaveAttribute(
    "href",
    `/sales/orders/${p03Ids.command}`,
  );
  expect(
    transport.get.mock.calls.some(
      (call: readonly unknown[]) =>
        typeof call[0] === "string" &&
        call[0].startsWith("/sales-contact/orders/"),
    ),
  ).toBe(false);
  fireEvent.click(
    within(contact).getByRole("button", { name: "الصفحة التالية" }),
  );
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledWith(
      "/sales-contact",
      expect.objectContaining({ params: { page: 2, limit: 25 } }),
    );
  });
  const nextButtons = screen.getAllByRole("button", { name: "الصفحة التالية" });
  const next = nextButtons[0];
  if (!next) throw new Error("Missing order next page");
  fireEvent.click(next);
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledWith(
      "/sales-orders",
      expect.objectContaining({
        params: { page: 2, limit: 25, status: "RETURNED" },
      }),
    );
  });
  expect(within(contact).getByText("27 قطعة")).toBeInTheDocument();
});
it("opens the exact contact piece and preserves parent uncertainty after closing", async () => {
  start();
  const { wrapper, queued } = contactData();
  transport.get.mockImplementation((path: string) => {
    if (path === "/sales-orders")
      return Promise.resolve(p03Envelope(returnedPage()));
    if (path === "/sales-contact") return Promise.resolve(p03Envelope(queued));
    if (path === `/sales-contact/orders/${p03Ids.order}`)
      return Promise.resolve(p03Envelope(wrapper));
    if (path === "/catalogs")
      return Promise.resolve(p03Envelope(catalogFixture()));
    return Promise.reject(new Error(`Unexpected read ${path}`));
  });
  transport.post.mockRejectedValue(new Error("Lost contact response"));
  mount();
  const open = await screen.findByRole("button", { name: "التواصل مع العميل" });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  fireEvent.change(
    await screen.findByLabelText("ملاحظات تواصل المبيعات مع العميل *:"),
    { target: { value: "Customer confirmed the retained values" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال المقترح للاعتماد" }),
  );
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(transport.post).toHaveBeenCalledWith(
    `/sales-contact/orders/${p03Ids.order}/pieces/${p03Ids.piece}/issues/${p03Ids.source}/proposals`,
    expect.objectContaining({ kind: "AMEND", expectedVersion: 2, changes: {} }),
  );
  expect(transport.post).toHaveBeenCalledTimes(1);
});
it("keeps a contact failure distinct from a successful initial-return queue and hides old scope", async () => {
  start();
  transport.get.mockImplementation((path: string) =>
    path === "/sales-orders"
      ? Promise.resolve(p03Envelope(returnedPage()))
      : Promise.reject(new Error("Contact unavailable")),
  );
  mount();
  expect(
    await screen.findByText("Original initial correction"),
  ).toBeInTheDocument();
  expect(
    await screen.findByText("تعذّر تحميل قطع التواصل."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("لا توجد قطع تحتاج تواصلاً"),
  ).not.toBeInTheDocument();
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { ...p03Session().user, department: "APPROVAL" },
    });
  });
  await waitFor(() =>
    expect(
      screen.queryByText("Original initial correction"),
    ).not.toBeInTheDocument(),
  );
});
