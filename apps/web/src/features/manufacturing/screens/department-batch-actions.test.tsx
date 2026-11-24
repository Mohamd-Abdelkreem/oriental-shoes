import assert from "node:assert/strict";
import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";
import { DepartmentOrderTable } from "./department-order-table";

import { qualityOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { resolveManufacturingTargets } from "../model/manufacturing-view.model";
import { resolveQualityTargets } from "../model/quality-view.model";
import { DepartmentBatchActions } from "./department-batch-actions";

const scenario = vi.hoisted(
  (): {
    path: string;
    role: DepartmentPieceTableProps["deptRole"];
    stage: DepartmentPieceTableProps["stageName"];
    tab: DepartmentPieceTableProps["activeTab"];
    orderIds: string[];
  } => ({
    path: "/warehouse/ready",
    role: "warehouse",
    stage: "المستودع",
    tab: "in_progress",
    orderIds: [],
  }),
);

vi.mock("next/navigation", () => ({ usePathname: () => scenario.path }));

function BatchScreen() {
  const store = useMvpStore();
  return (
    <DepartmentOrderTable
      orders={store.orders.filter((order) =>
        scenario.orderIds.includes(order.id),
      )}
      deptRole={scenario.role}
      stageName={scenario.stage}
      forcedTab={scenario.tab}
      hideTabs
    />
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ToastProvider>
      <BatchScreen />
      {children}
    </ToastProvider>
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
  Object.assign(scenario, {
    path: "/warehouse/ready",
    role: "warehouse",
    stage: "المستودع",
    tab: "in_progress",
    orderIds: ["SHOP-2026-0024", "EXTERNAL-2026-0025"],
  });
});
afterEach(() => {
  localStorage.clear();
});

function selectAllOrders() {
  for (const button of screen.getAllByTitle("تحديد كل قطع هذا الأمر"))
    fireEvent.click(button);
}

it.each([
  { input: "quick", expected: "الهاتف مغلق طوال اليوم" },
  { input: "blank", expected: "تعذر تسليم الطلب للعميل مع المندوب" },
])(
  "preserves the $input delivery-failure reason",
  async ({ input, expected }) => {
    Object.assign(scenario, {
      path: "/warehouse/out-for-delivery",
      orderIds: ["EXTERNAL-2026-0026", "SHOP-2026-0027"],
    });
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    selectAllOrders();
    fireEvent.click(
      screen.getByRole("button", { name: "حدثت مشكلة في التسليم (3)" }),
    );
    if (input === "quick") fireEvent.click(screen.getByText(expected));
    else
      fireEvent.change(
        screen.getByPlaceholderText(/^اكتب هنا تفاصيل سبب عدم التسليم/u),
        { target: { value: "   " } },
      );
    fireEvent.click(
      screen.getByText("تأكيد تسجيل المشكلة ونقل الطلب لتعذر التسليم"),
    );
    for (const orderId of scenario.orderIds) {
      expect(
        result.current.orders.find((order) => order.id === orderId)
          ?.deliveryNote,
      ).toBe(expected);
    }
  },
);

it("keeps dispatch, failure reporting and delivery history connected across a multi-order selection", async () => {
  const { result, rerender } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const originalEvents = result.current.events;
  const unrelated = result.current.orders.find(
    (order) => order.id === "SHOP-2026-0020",
  );
  selectAllOrders();
  fireEvent.click(screen.getByRole("button", { name: "إرسال مع المندوب (5)" }));
  expect(
    screen.queryByRole("button", { name: "إلغاء التحديد" }),
  ).not.toBeInTheDocument();
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("خرج مع المندوب");
    expect(
      order.items.every((piece) => piece.currentLocation === "مع المندوب"),
    ).toBe(true);
    expect(
      order.segments.every((segment) => segment.stage === "مع المندوب"),
    ).toBe(true);
  }

  scenario.path = "/warehouse/out-for-delivery";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "حدثت مشكلة في التسليم (5)" }),
  );
  fireEvent.change(
    screen.getByPlaceholderText(/^اكتب هنا تفاصيل سبب عدم التسليم/u),
    { target: { value: "  طلب العميل التأجيل  " } },
  );
  fireEvent.click(
    screen.getByText("تأكيد تسجيل المشكلة ونقل الطلب لتعذر التسليم"),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("تعذر التسليم");
    expect(order.deliveryNote).toBe("طلب العميل التأجيل");
    expect(
      order.deliveryAttempts?.filter(
        (attempt) => attempt.status === "تعذر التسليم",
      ),
    ).toHaveLength(1);
    expect(
      order.items.every(
        (piece) =>
          piece.currentLocation === "في المستودع" &&
          piece.deptStatus === "بها مشكلة",
      ),
    ).toBe(true);
  }

  scenario.path = "/warehouse/delivery-failed";
  scenario.tab = "problems";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "إعادة إرسال مع المندوب (5)" }),
  );
  scenario.path = "/warehouse/out-for-delivery";
  scenario.tab = "in_progress";
  rerender();
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "تأكيد تسليم الطلب للعميل (5)" }),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.status).toBe("تم الاستلام");
    expect(
      order.items.every((piece) => piece.currentLocation === "تم الاستلام"),
    ).toBe(true);
    expect(
      order.deliveryAttempts?.some(
        (attempt) => attempt.status === "تعذر التسليم",
      ),
    ).toBe(true);
  }
  expect(
    result.current.orders.find((order) => order.id === "SHOP-2026-0020"),
  ).toEqual(unrelated);
  expect(result.current.events.slice(-originalEvents.length)).toEqual(
    originalEvents,
  );
});

it("receives each selected warehouse piece and updates its pending segment", async () => {
  scenario.path = "/warehouse/incoming";
  scenario.tab = "ready";
  scenario.orderIds = ["SHOP-2026-0020", "EXTERNAL-2026-0021"];
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  selectAllOrders();
  fireEvent.click(
    screen.getByRole("button", { name: "استلام وتخزين بالمستودع (5)" }),
  );
  for (const orderId of scenario.orderIds) {
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    expect(order.items.every((piece) => piece.deptStatus === "مكتملة")).toBe(
      true,
    );
    expect(order.segments.every((segment) => segment.state === "مستلم")).toBe(
      true,
    );
  }
});

it.each([
  {
    role: "cutting",
    stage: "القص",
    orderId: "SHOP-2026-0012",
    start: /^بدء قص القطع المحددة/u,
    transfer: /^إنهاء القص والتحويل للإنتاج/u,
    destination: "في الإنتاج",
  },
  {
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    start: /^بدء تركيب وتجميع القطع المحددة/u,
    transfer: /^إنهاء التركيب والتحويل للجودة/u,
    destination: "في الجودة",
  },
  {
    role: "quality",
    stage: "الجودة والتغليف",
    orderId: "EXTERNAL-2026-0006",
    start: /^بدء الفحص/u,
    transfer: /^قبول وإرسال للمستودع/u,
    destination: "في المستودع",
  },
] as const)(
  "starts and transfers selected pieces in $role",
  async ({ role, stage, orderId, start, transfer, destination }) => {
    Object.assign(scenario, {
      path: `/${role}/incoming`,
      role,
      stage,
      tab: "ready",
      orderIds: [orderId],
    });
    const { result, rerender } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    selectAllOrders();
    fireEvent.click(screen.getByRole("button", { name: start }));
    expect(
      screen.queryByRole("button", { name: "إلغاء التحديد" }),
    ).not.toBeInTheDocument();
    scenario.tab = "in_progress";
    rerender();
    const order = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(order);
    const activePieceIds = order.items
      .filter((piece) => piece.deptStatus === "جاري العمل")
      .map((piece) => piece.id);
    expect(activePieceIds.length).toBeGreaterThan(0);
    selectAllOrders();
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "إجراءات القطع المحددة" }),
      ).getByRole("button", { name: transfer }),
    );
    const updated = result.current.orders.find(
      (candidate) => candidate.id === orderId,
    );
    assert.ok(updated);
    expect(
      updated.items
        .filter((piece) => activePieceIds.includes(piece.id))
        .every((piece) => piece.currentLocation === destination),
    ).toBe(true);
  },
);
const id = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

it("offers the transfer for started corrections and prevents a mixed selection from acting on a subset", () => {
  const detail = manufacturingDetailFixture(2, "CUTTING", true);
  const order = detail.paper.order;
  const [started] = resolveManufacturingTargets(
    detail,
    order.pieces.map((piece) => ({
      orderId: order.id,
      expectedVersion: order.version,
      pieceId: piece.id,
    })),
  );
  if (!started) throw new Error("Expected a started piece");
  const awaitingCorrection = {
    ...started,
    key: `${order.id}/${id(2)}`,
    target: { ...started.target, pieceId: id(2) },
    piece: { ...started.piece, id: id(2), workState: "INCOMING" as const },
    work: {
      ...started.work,
      pieceId: id(2),
      allowedActions: {
        ...started.work.allowedActions,
        canReceiveAndStart: true,
        canCompleteTransfer: false,
      },
    },
  };
  const props = {
    source: "persisted" as const,
    department: "CUTTING" as const,
    view: "RETURNED" as const,
    busy: false,
    onClearSelection: vi.fn(),
    callbacks: { onReceiveAndStart: vi.fn(), onCompleteTransfer: vi.fn() },
  };
  const rows = [started, awaitingCorrection];
  const { rerender } = render(
    <DepartmentBatchActions
      {...props}
      selectedTargets={rows.map((row) => row.target)}
      selection={{ phase: "ready", rows, failure: null }}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "مسح التحديد" })).toBeEnabled();
  expect(screen.getByText(/حدّد قطعًا مؤهلة لنفس الإجراء/u)).toBeVisible();

  rerender(
    <DepartmentBatchActions
      {...props}
      selectedTargets={[started.target]}
      selection={{ phase: "ready", rows: [started], failure: null }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "إتمام التصحيح وتحويل المحدد إلى الإنتاج",
    }),
  );
  expect(props.callbacks.onCompleteTransfer).toHaveBeenCalledExactlyOnceWith([
    started.target,
  ]);
});

const qualityDetail = () => {
  const source = manufacturingDetailFixture(),
    piece = source.paper.order.pieces[0];
  if (!piece) throw new Error("Owned piece required");
  const pieces = Array.from({ length: 5 }, (_, i) => ({
    ...piece,
    id: id(i + 1),
    position: i + 1,
    stage: "QUALITY",
    workState: "IN_PROGRESS",
  }));
  return qualityOrderDataSchema.parse({
    department: "QUALITY",
    packingGroups: [],
    paper: {
      ...source.paper,
      order: {
        ...source.paper.order,
        counts: {
          original: 5,
          active: 5,
          cancelled: 0,
          received: 0,
          completionPercent: 0,
        },
        pieces,
      },
    },
    work: pieces.map((piece) => ({
      pieceId: piece.id,
      visit: {
        id: id(piece.position + 10),
        pieceId: piece.id,
        sequence: 1,
        originKind: "LEGACY_BASELINE",
        sourceProductionEventId: null,
        sourceCorrectionId: null,
        enteredAt: null,
        receivedAt: null,
        startedAt: null,
        startedBy: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
        legacyUnknownStart: true,
      },
      lastAction: null,
      currentCorrection: null,
      latestInspection: null,
      allowedActions: {
        canReceiveAndStart: false,
        canContinue: true,
        canInspect: true,
        canReportIssue: true,
      },
    })),
  });
};

it("keeps exact quality batch membership, disables partial and busy selections, and calls inspection in group mode", () => {
  const data = qualityDetail(),
    rows = resolveQualityTargets(
      data,
      data.paper.order.pieces.map((piece) => ({
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        pieceId: piece.id,
      })),
    ),
    targets = rows.map((row) => row.target);
  const callbacks = {
    onReceiveAndStart: vi.fn(),
    onContinue: vi.fn(),
    onInspect: vi.fn(),
    onReportIssues: vi.fn(),
  };
  const props = {
    source: "quality" as const,
    selectedTargets: targets,
    selection: { phase: "ready" as const, rows, failure: null },
    busy: false,
    callbacks,
    onClearSelection: vi.fn(),
  };
  const view = render(<DepartmentBatchActions {...props} />);
  expect(
    screen.queryByRole("button", { name: /استلام وبدء/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "تسجيل نتيجة فحص المحدد" }),
  );
  expect(callbacks.onInspect).toHaveBeenCalledExactlyOnceWith(targets, "group");
  fireEvent.click(screen.getByRole("button", { name: /تسجيل مشكلة للمحدد/ }));
  expect(callbacks.onReportIssues).toHaveBeenCalledExactlyOnceWith(targets);
  view.rerender(
    <DepartmentBatchActions
      {...props}
      selection={{ phase: "ready", rows: rows.slice(1), failure: null }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "تسجيل نتيجة فحص المحدد" }),
  ).toBeDisabled();
  view.rerender(<DepartmentBatchActions {...props} busy />);
  expect(
    screen.getByRole("button", { name: /تسجيل مشكلة للمحدد/ }),
  ).toBeDisabled();
});
