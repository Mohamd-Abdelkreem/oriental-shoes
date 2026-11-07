import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  salesOrderSummarySchema,
  approvalIssuesDataSchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import { ApprovalPendingView } from "./approval-pending-view";

const transport = vi.hoisted(() => ({
  order: vi.fn(),
  resolve: vi.fn(),
  dashboard: vi.fn(),
  orders: vi.fn(),
  issues: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../api/approval.api", () => ({ approvalApi: transport }));
const client = createQueryClient();
const summary = () =>
  salesOrderSummarySchema.parse({
    ...Object.fromEntries(
      Object.entries(orderFixture()).filter(([key]) =>
        [
          "id",
          "version",
          "owner",
          "type",
          "status",
          "businessNumber",
          "businessYear",
          "sequence",
          "customerId",
          "customerSnapshot",
          "createdAt",
          "updatedAt",
          "submittedAt",
          "deliveryDate",
          "money",
          "counts",
          "allowedActions",
        ].includes(key),
      ),
    ),
    returnInfo: null,
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, {
    user: { ...p03Session().user, department: "APPROVAL" },
  });
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  transport.orders.mockResolvedValue({
    items: [summary()],
    pagination: { ...p03Pagination, total: 1, totalPages: 1 },
  });
  transport.issues.mockResolvedValue({ items: [], pagination: p03Pagination });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ApprovalPendingView />
    </QueryClientProvider>,
  );
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=problems"),
}));
it("preserves the problems tab, held owner work and server search/type/pagination", async () => {
  const order = summary(),
    piece = orderFixture().pieces[0];
  if (!piece) throw new Error("Missing piece");
  const rows = approvalIssuesDataSchema.parse({
    items: [
      {
        order,
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
          id: p03Ids.source,
          pieceId: piece.id,
          state: "SALES_CONTACT",
          reportedAt: p03Instant,
          reason: "Customer confirmation needed",
          notes: null,
          resumeTarget: "CUTTING",
          instructions: null,
          sourceDepartment: "CUTTING",
          currentProposalId: null,
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
      total: 30,
      totalPages: 2,
      hasNextPage: true,
    },
  });
  transport.issues.mockImplementation((query: { page: number }) =>
    Promise.resolve({
      ...rows,
      pagination: {
        ...rows.pagination,
        page: query.page,
        hasNextPage: query.page === 1,
        hasPreviousPage: query.page > 1,
      },
    }),
  );
  mount();
  expect(await screen.findByText("بانتظار تواصل المبيعات")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /اتخاذ القرار/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "التالي" }));
  await waitFor(() => {
    expect(transport.issues).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    );
  });
  fireEvent.change(
    screen.getByPlaceholderText("ابحث برقم الطلب، العميل، أو الهاتف..."),
    { target: { value: "server search" } },
  );
  await waitFor(() => {
    expect(transport.issues).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "server search", page: 1 }),
      expect.any(AbortSignal),
    );
  });
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "REPAIR" },
  });
  await waitFor(() => {
    expect(transport.issues).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "REPAIR", page: 1 }),
      expect.any(AbortSignal),
    );
  });
  fireEvent.click(
    screen.getByRole("button", { name: /أوامر بانتظار الاعتماد المبدئي/ }),
  );
  expect(
    await screen.findByRole("link", { name: "فتح للمراجعة والقرار" }),
  ).toHaveAttribute("href", `/approval/orders/${p03Ids.order}`);
});
it("shows a failed issue read without an empty-success message", async () => {
  transport.issues.mockRejectedValue(new Error("Failed"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل طابور الاعتماد",
  );
  expect(
    screen.queryByText("لا توجد مشكلات تصنيع محالة بانتظار الاعتماد حالياً."),
  ).not.toBeInTheDocument();
});

it("opens the exact issue and retains parent recovery after closing its uncertain dialog", async () => {
  const original = orderFixture(2);
  const data = approvalOrderDataSchema.parse({
    order: {
      ...original,
      status: "APPROVED",
      approval: { ...original.approval, approvedAt: p03Instant },
      pieces: original.pieces.map((piece) => ({
        ...piece,
        stage: "CUTTING",
        workState: "BLOCKED",
      })),
    },
    workflow: {
      initialApproval: {
        decisionId: p03Ids.command,
        orderVersion: 1,
        actor: {
          id: p03Ids.actor,
          fullName: "Actual reviewer",
          role: "USER",
          department: "APPROVAL",
        },
        approvedAt: p03Instant,
      },
      currentReturn: null,
      allowedActions: { canApproveInitial: false, canReturnInitial: false },
      printEligibility: { allowed: true, reason: null },
      issues: [
        {
          id: p03Ids.source,
          orderId: p03Ids.order,
          pieceId: p03Ids.piece,
          state: "APPROVAL_REVIEW",
          reportedAt: p03Instant,
          reason: "Selected factory issue",
          notes: null,
          resumeTarget: null,
          instructions: null,
          allowedActions: {
            canResolve: true,
            canSubmitContact: false,
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
  const piece = data.order.pieces[0],
    issue = data.workflow.issues[0];
  if (!piece || !issue) throw new Error("Missing selected issue");
  transport.issues.mockResolvedValue({
    items: [
      {
        order: { ...summary(), status: "APPROVED" },
        piece: {
          id: piece.id,
          position: piece.position,
          model: piece.model,
          size: piece.size,
          leatherBase: piece.leatherBase,
          sole: piece.sole,
          stage: piece.stage,
          workState: piece.workState,
        },
        issue: {
          id: issue.id,
          pieceId: issue.pieceId,
          state: issue.state,
          reportedAt: issue.reportedAt,
          reason: issue.reason,
          notes: issue.notes,
          resumeTarget: issue.resumeTarget,
          instructions: issue.instructions,
          allowedActions: issue.allowedActions,
          sourceDepartment: issue.source.department,
          currentProposalId: null,
        },
      },
    ],
    pagination: { ...p03Pagination, total: 1, totalPages: 1 },
  });
  transport.order.mockResolvedValue(data);
  transport.resolve.mockRejectedValue(
    new Error("Lost selected issue response"),
  );
  mount();
  const open = await screen.findByRole("button", {
    name: "اتخاذ قرار الاعتماد (أ، ب، ج)",
  });
  await waitFor(() => expect(open).toBeEnabled());
  fireEvent.click(open);
  expect(
    await screen.findByRole("heading", { name: "قرار معالجة مشكلة التصنيع" }),
  ).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText("توجيه إلى قسم:"), {
    target: { value: "PRODUCTION" },
  });
  fireEvent.change(
    screen.getByLabelText("ملاحظات وتوجيه حل المشكلة للقسم *:"),
    { target: { value: "Resume only this selected piece" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "تنفيذ قرار الاعتماد" }));
  expect(
    await screen.findByText(
      "نتيجة العملية غير مؤكدة. تحقق منها قبل إرسال عملية جديدة.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
  expect(
    screen.queryByRole("heading", { name: "قرار معالجة مشكلة التصنيع" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "إعادة نفس العملية" }),
  ).toBeInTheDocument();
  expect(transport.resolve).toHaveBeenCalledWith(
    p03Ids.order,
    p03Ids.piece,
    p03Ids.source,
    expect.objectContaining({
      expectedVersion: 2,
      decision: "RETURN_TO_DEPARTMENT",
      target: "PRODUCTION",
      notes: "Resume only this selected piece",
    }),
  );
  expect(transport.resolve).toHaveBeenCalledTimes(1);
});
