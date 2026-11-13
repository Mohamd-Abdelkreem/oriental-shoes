import { QueryClientProvider } from "@tanstack/react-query";
import {
  qualityOrderDataSchema,
  authUserDataSchema,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  apiClient,
  beginAuthSessionEpoch,
  acceptCredentialLogin,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids, p03Session, p03Envelope } from "@/test/p03-fixtures";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import assert from "node:assert/strict";
import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Role } from "@/features/prototype/fixtures/prototype-data";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { ManufacturingOrderDetailView } from "./manufacturing-order-detail-view";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Order was not found");
  },
}));

function mountOrder(
  orderId: string,
  deptRole: Exclude<Role, "admin" | "sales" | "approval"> = "warehouse",
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MvpStoreProvider>
      <ManufacturingOrderDetailView orderId={orderId} deptRole={deptRole} />
      {children}
    </MvpStoreProvider>
  );
  return renderHook(useMvpStore, { wrapper });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it("keeps dispatch and delivery confirmation connected to the prototype order history", async () => {
  const { result } = mountOrder("EXTERNAL-2026-0002");
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const previousEvents = result.current.events;
  fireEvent.click(
    screen.getByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  );
  fireEvent.change(
    screen.getByPlaceholderText(
      "مثال: تم إرسال الشحنة مع سيارة التوزيع الأولى...",
    ),
    { target: { value: "Courier reference" } },
  );
  fireEvent.click(screen.getByText("تأكيد الخروج للتسليم"));
  let order = result.current.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0002",
  );
  assert.ok(order);
  expect(order.status).toBe("خرج مع المندوب");
  expect(order.deliveryAttempts?.at(-1)?.note).toContain("Courier reference");
  expect(
    order.segments.every((segment) => segment.stage === "مع المندوب"),
  ).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "تأكيد التسليم للعميل" }));
  fireEvent.click(screen.getByText("تأكيد التسليم بنجاح وإغلاق الطلب"));
  order = result.current.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0002",
  );
  assert.ok(order);
  expect(order.status).toBe("تم الاستلام");
  expect(order.deliveryAttempts?.map((attempt) => attempt.status)).toEqual([
    "مع المندوب",
    "تم الاستلام",
  ]);
  expect(
    order.segments.every((segment) => segment.stage === "تم الاستلام"),
  ).toBe(true);
  expect(result.current.events.slice(2)).toEqual(previousEvents);
});

it("keeps dispatch unavailable when part of the order is still in production", async () => {
  mountOrder("EXTERNAL-2026-0005");
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  expect(
    screen.getByText("التسليم مقفل (الكمية غير مكتملة بالمستودع)"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إرسال مع مندوب التوصيل" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تأكيد استلام وتسجيل الكراتين" }),
  ).toBeInTheDocument();
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
