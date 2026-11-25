import { renderWithToast as render } from "@/test/render-with-toast";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  qualityOrderDataSchema,
  authUserDataSchema,
  warehouseOrderDataSchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  apiClient,
  beginAuthSessionEpoch,
  acceptCredentialLogin,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ManufacturingOrderDetailView } from "./manufacturing-order-detail-view";
import { WarehouseOrderOperations } from "./warehouse-order-operations";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Order was not found");
  },
}));
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});
const callbacks = () => ({
  onReceive: vi.fn(),
  onDispatch: vi.fn(),
  onConfirmDelivery: vi.fn(),
  onFailDelivery: vi.fn(),
  onRetryDelivery: vi.fn(),
});
const warehouseDetail = (received: boolean) => {
  const original = manufacturingDetailFixture().paper.order,
    first = original.pieces[0];
  if (!first) throw new Error("Piece required");
  const pieces = received
    ? [
        {
          ...first,
          stage: "WAREHOUSE",
          workState: "COMPLETED",
          receivedAt: p03Instant,
        },
      ]
    : [
        { ...first, stage: "WAREHOUSE", workState: "INCOMING" },
        {
          ...first,
          id: "30000000-0000-4000-8000-000000000002",
          position: 2,
          stage: "PRODUCTION",
          workState: "IN_PROGRESS",
        },
      ];
  const counts = {
      original: pieces.length,
      cancelled: 0,
      active: pieces.length,
      received: received ? 1 : 0,
      completionPercent: received ? 100 : 0,
    },
    order = {
      ...original,
      status: received ? "READY_FOR_DELIVERY" : "APPROVED",
      pieces,
      counts,
    };
  return warehouseOrderDataSchema.parse({
    summary: {
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: pieces.map((piece) => piece.id),
      matchingPieceCount: pieces.length,
      lastActionAt: null,
      allowedActions: {
        canDispatch: received,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: false,
      },
      currentAttemptId: null,
      retryDate: null,
    },
    paper: { order, issues: [] },
    deliveryContact: {
      name: order.customerName,
      phone: "+966500000001",
      address: null,
    },
    work: pieces.map((piece, index) => ({
      pieceId: piece.id,
      acceptedHandoff:
        !received && index === 0
          ? {
              eventId: p03Ids.command,
              commandId: p03Ids.command,
              acceptedAt: p03Instant,
              actor: {
                id: p03Ids.actor,
                fullName: "Quality colleague",
                role: "USER",
                department: "QUALITY",
              },
              packingGroupId: null,
            }
          : null,
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: received,
      allowedActions: { canReceive: !received && index === 0 },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
it("requests full-order dispatch review from canonical ready authority without local writes", () => {
  const data = warehouseDetail(true),
    actions = callbacks();
  render(
    <WarehouseOrderOperations
      data={data}
      readAvailability="ready"
      readFailure={null}
      onReadRetry={vi.fn()}
      callbacks={actions}
      busy={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال الطلب الكامل مع مندوب التوصيل" }),
  );
  expect(actions.onDispatch).toHaveBeenCalledExactlyOnceWith([
    { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
  ]);
  expect(
    screen.queryByRole("button", { name: "تأكيد التسليم الكامل للعميل" }),
  ).not.toBeInTheDocument();
  expect(localStorage.length).toBe(0);
});
it("keeps dispatch unavailable while an upstream companion remains and receives exact incoming only", () => {
  const data = warehouseDetail(false),
    actions = callbacks();
  render(
    <WarehouseOrderOperations
      data={data}
      readAvailability="ready"
      readFailure={null}
      onReadRetry={vi.fn()}
      callbacks={actions}
      busy={false}
    />,
  );
  expect(
    screen.queryByRole("button", { name: /إرسال الطلب الكامل/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /تأكيد استلام وتسجيل الكراتين/ }),
  );
  expect(actions.onReceive).toHaveBeenCalledExactlyOnceWith([
    { orderId: p03Ids.order, expectedVersion: 2, pieceId: p03Ids.piece },
  ]);
  expect(localStorage.length).toBe(0);
});
it("does not expose warehouse operations in another department's authoritative detail view", async () => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  const client = createQueryClient();
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
  const source = manufacturingDetailFixture(),
    paper = {
      ...source.paper,
      order: {
        ...source.paper.order,
        pieces: source.paper.order.pieces.map((piece) => ({
          ...piece,
          stage: "QUALITY",
          workState: "INCOMING",
        })),
      },
    },
    detail = qualityOrderDataSchema.parse({
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
  const get = vi.spyOn(apiClient, "get").mockResolvedValue(p03Envelope(detail)),
    view = render(
      <QueryClientProvider client={client}>
        <ManufacturingOrderDetailView
          orderId={p03Ids.order}
          deptRole="quality"
        />
      </QueryClientProvider>,
    );
  try {
    await screen.findByText(/Factory customer/);
    expect(screen.getByRole("link", { name: "العودة للقسم" })).toHaveAttribute(
      "href",
      "/quality/dashboard",
    );
    expect(
      screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("إجمالي الكراتين المسجلة:"),
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    client.clear();
    get.mockRestore();
    beginAuthSessionEpoch("confirmed-ending");
  }
});
