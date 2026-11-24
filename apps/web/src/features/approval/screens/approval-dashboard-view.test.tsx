import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  approvalOrderDataSchema,
  salesOrderSummarySchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readP04OperationalScope } from "@/shared/query/operational-scope";
import {
  orderFixture,
  p03Ids,
  p03Instant,
  p03Session,
  p03Pagination,
} from "@/test/p03-fixtures";
import { approvalKeys } from "../hooks/approval.hooks";
import { ApprovalDashboardView } from "./approval-dashboard-view";

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
      <ApprovalDashboardView />
    </QueryClientProvider>,
    { wrapper: ToastProvider },
  );
it("renders server-wide counts and current roots, with retained-data refresh errors and no local decisions", async () => {
  transport.dashboard.mockResolvedValue({
    counts: {
      initialOrders: 37,
      unresolvedIssues: 11,
      approvalIssues: 4,
      salesContactPieces: 5,
      reapprovalPieces: 2,
      approvedToday: 19,
      returnedOrders: 23,
    },
    recentOrders: [summary()],
  });
  mount();
  await screen.findByText("37");
  for (const count of ["11", "19", "23"])
    expect(screen.getByText(count)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: summary().businessNumber }),
  ).toHaveAttribute("href", `/approval/orders/${p03Ids.order}`);
  const scope = readP04OperationalScope(client, "APPROVAL");
  if (!scope) throw new Error("Missing scope");
  transport.dashboard.mockRejectedValue(new Error("Refresh failed"));
  await act(async () => {
    await client.refetchQueries({ queryKey: approvalKeys.dashboard(scope) });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل لوحة الاعتماد",
  );
  expect(screen.getByText("37")).toBeInTheDocument();
  act(() => {
    client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  });
  await waitFor(() => expect(screen.queryByText("37")).not.toBeInTheDocument());
});
it("distinguishes failed loading from a successful empty dashboard", async () => {
  transport.dashboard.mockRejectedValue(new Error("Unavailable"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "تعذّر تحميل لوحة الاعتماد",
  );
  expect(
    screen.queryByText("لا توجد طلبات معلقة للاعتماد"),
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
  transport.dashboard.mockResolvedValue({
    counts: {
      initialOrders: 0,
      unresolvedIssues: 1,
      approvalIssues: 1,
      salesContactPieces: 0,
      reapprovalPieces: 0,
      approvedToday: 0,
      returnedOrders: 0,
    },
    recentOrders: [],
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
