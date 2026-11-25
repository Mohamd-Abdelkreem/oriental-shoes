import {
  manufacturingOrderHeaderSchema,
  manufacturingOrderSummarySchema,
} from "@template/contracts";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { toManufacturingGroup } from "../model/manufacturing-view.model";
import type { PersistedDepartmentTableProps } from "./department-piece-table-types";
import assert from "node:assert/strict";
import { useState, type ReactNode } from "react";
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/toast";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { DepartmentOrderTable } from "./department-order-table";
import type { DepartmentPieceTableProps } from "./department-piece-table-types";

import {
  qualityOrderDataSchema,
  qualityOrderSummarySchema,
} from "@template/contracts";
import {
  resolveQualityTargets,
  toQualityGroup,
} from "../model/quality-view.model";
import type { QualityDepartmentTableProps } from "./department-piece-table-types";

const scenario = vi.hoisted(
  (): {
    role: DepartmentPieceTableProps["deptRole"];
    stage: DepartmentPieceTableProps["stageName"];
    orderId: string;
    customAction: boolean;
  } => ({
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    customAction: false,
  }),
);

vi.mock("next/navigation", () => ({
  usePathname: () => `/${scenario.role}/incoming`,
}));

function DepartmentScreen() {
  const store = useMvpStore();
  const [customAction, setCustomAction] = useState("");
  return (
    <>
      <DepartmentOrderTable
        orders={store.orders.filter((order) => order.id === scenario.orderId)}
        deptRole={scenario.role}
        stageName={scenario.stage}
        actionButtonLabel={scenario.customAction ? "الإجراء المخصص" : undefined}
        onAction={
          scenario.customAction
            ? (order, segment) => {
                setCustomAction(`${order.id} / ${segment?.id ?? ""}`);
              }
            : undefined
        }
      />
      <output aria-label="نتيجة الإجراء المخصص">{customAction}</output>
    </>
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ToastProvider>
      <DepartmentScreen />
      {children}
    </ToastProvider>
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
  Object.assign(scenario, {
    role: "production",
    stage: "الإنتاج والإصلاح",
    orderId: "EXTERNAL-2026-0004",
    customAction: false,
  });
});
afterEach(() => {
  localStorage.clear();
});

it.each(["grouped", "flat"])(
  "keeps per-piece start and transfer behavior in the %s layout",
  async (layout) => {
    const { result } = renderHook(useMvpStore, { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).not.toBeNull();
    });
    if (layout === "flat") fireEvent.click(screen.getByTitle("عرض جدول القطع"));
    else
      fireEvent.click(
        screen.getByRole("button", { name: "توسيع تفاصيل الكل" }),
      );

    const startButton = screen.getAllByRole("button", { name: "بدء العمل" })[0];
    assert.ok(startButton);
    fireEvent.click(startButton);
    let order = result.current.orders.find(
      (candidate) => candidate.id === scenario.orderId,
    );
    assert.ok(order);
    expect(order.items[0]?.deptStatus).toBe("جاري العمل");
    expect(order.items[0]?.responsibleWorker).toBe("أحمد عادل");

    fireEvent.click(screen.getByRole("button", { name: /^جاري العمل/u }));
    const transferButton = screen.getAllByRole("button", {
      name: "إنهاء وتحويل",
    })[0];
    assert.ok(transferButton);
    fireEvent.click(transferButton);
    order = result.current.orders.find(
      (candidate) => candidate.id === scenario.orderId,
    );
    assert.ok(order);
    expect(order.items[0]?.currentLocation).toBe("في الجودة");
    expect(order.items[1]?.currentLocation).toBe("في الإنتاج");
  },
);

it("keeps the existing custom action exclusive to the flat table", async () => {
  scenario.customAction = true;
  renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "توسيع تفاصيل الكل" }));
  expect(
    screen.queryByRole("button", { name: "الإجراء المخصص" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "بدء العمل" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByTitle("عرض جدول القطع"));
  const customButton = screen.getAllByRole("button", {
    name: "الإجراء المخصص",
  })[0];
  assert.ok(customButton);
  fireEvent.click(customButton);
  expect(screen.getByLabelText("نتيجة الإجراء المخصص")).toHaveTextContent(
    "EXTERNAL-2026-0004 / s-04a",
  );
});

it("opens inspection from a quality card without showing start-work controls", async () => {
  Object.assign(scenario, {
    role: "quality",
    stage: "الجودة والتغليف",
    orderId: "EXTERNAL-2026-0006",
  });
  renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "توسيع تفاصيل الكل" }));
  expect(
    screen.queryByRole("button", { name: "بدء العمل" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "فحص الجودة" }));
  expect(
    screen.getByRole("heading", { name: "فحص جودة وتغليف القطعة" }),
  ).toBeInTheDocument();
});

it("receives the warehouse group without modifying pieces still in production", async () => {
  Object.assign(scenario, {
    role: "warehouse",
    stage: "المستودع",
    orderId: "EXTERNAL-2026-0005",
  });
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const original = result.current.orders.find(
    (candidate) => candidate.id === scenario.orderId,
  );
  assert.ok(original);
  fireEvent.click(screen.getByRole("button", { name: "استلام بالمستودع (3)" }));
  const updated = result.current.orders.find(
    (candidate) => candidate.id === scenario.orderId,
  );
  assert.ok(updated);
  expect(updated.items.slice(0, 3).map((piece) => piece.deptStatus)).toEqual([
    "مكتملة",
    "مكتملة",
    "مكتملة",
  ]);
  expect(updated.items.slice(3)).toEqual(original.items.slice(3));
});

it("renders persisted counts and whole-selection review state without any legacy provider", () => {
  const detail = manufacturingDetailFixture(),
    { order } = detail.paper;
  const summary = {
    ...manufacturingOrderHeaderSchema.parse({
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts: order.counts,
    }),
    matchingPieceIds: [order.pieces[0]?.id],
    matchingPieceCount: 1,
    lastWorkAt: null,
  };
  const parsed = manufacturingOrderSummarySchema.parse(summary),
    group = toManufacturingGroup(parsed, detail),
    target = group.rows[0]?.target;
  if (!target) throw new Error("Missing target");
  const change = vi.fn(),
    props: PersistedDepartmentTableProps = {
      source: "persisted",
      department: "CUTTING",
      view: "INCOMING",
      searchValue: "",
      searchError: null,
      onSearchChange: change,
      typeFilter: "ALL",
      onTypeFilterChange: vi.fn(),
      onClearFilters: vi.fn(),
      mode: "grouped",
      onModeChange: vi.fn(),
      busy: false,
      onRetry: vi.fn(),
      selectedTargets: [target],
      onToggleSelect: vi.fn(),
      onToggleSelectMultiple: vi.fn(),
      onClearSelection: vi.fn(),
      expandedOrderIds: [order.id],
      groupDetails: new Map([
        [order.id, { phase: "ready", group, failure: null }],
      ]),
      onToggleExpand: vi.fn(),
      onSetGroupExpansion: vi.fn(),
      selection: {
        phase: "stale",
        rows: [],
        failure: "تغير إصدار إحدى القطع. حدّث وراجع المجموعة كاملة.",
      },
      onLoadGroup: () => Promise.resolve(group),
      callbacks: {
        onReceiveAndStart: vi.fn(),
        onContinue: vi.fn(),
        onCompleteTransfer: vi.fn(),
        onReportIssue: vi.fn(),
      },
      queryStatus: "ready",
      rows: [],
      groups: [parsed],
      counts: { orders: 17, pieces: 43 },
      pagination: { page: 1, totalPages: 2, total: 17, onPageChange: vi.fn() },
      failure: null,
    };
  const view = render(<DepartmentOrderTable {...props} />);
  expect(screen.getByText("المحدد: 1 قطعة")).toBeInTheDocument();
  expect(screen.getByText("عرض 43 من أصل 43 قطعة")).toBeInTheDocument();
  expect(screen.getByText("(إجمالي 17 عنصر)")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "استلام وبدء المحدد" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("المجموعة كاملة");
  view.rerender(
    <DepartmentOrderTable {...props} queryStatus="refreshing" busy />,
  );
  expect(
    screen.getByRole("checkbox", { name: "تحديد قطع SHOP-2026-0001" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "استلام وبدء العمل" }),
  ).toBeDisabled();
  view.rerender(
    <DepartmentOrderTable
      {...props}
      mode="flat"
      busy={false}
      rows={group.rows}
      groups={[]}
      pagination={{ page: 1, totalPages: 5, total: 43, onPageChange: vi.fn() }}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "تحديد قطع الصفحة" }));
  expect(props.onToggleSelectMultiple).toHaveBeenCalledWith([target], false);
  const {
    queryStatus: _status,
    rows: _rows,
    groups: _groups,
    counts: _counts,
    pagination: _pagination,
    failure: _failure,
    ...controls
  } = props;
  view.rerender(
    <DepartmentOrderTable
      {...controls}
      queryStatus="loading"
      rows={[]}
      groups={[]}
      counts={null}
      pagination={null}
      failure={null}
    />,
  );
  expect(screen.getByRole("textbox")).toBeInTheDocument();
  expect(screen.queryByText("عرض 43 من أصل 43 قطعة")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("جارٍ تحميل");
});
const id = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
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

it.each(["grouped", "flat"] as const)(
  "renders exact quality links and canonical selected identities in %s mode without a local provider",
  (mode) => {
    const data = qualityDetail(),
      order = data.paper.order,
      rows = resolveQualityTargets(
        data,
        order.pieces.map((piece) => ({
          orderId: order.id,
          expectedVersion: order.version,
          pieceId: piece.id,
        })),
      );
    const summary = qualityOrderSummarySchema.parse({
      ...rows[0]?.order,
      matchingPieceIds: order.pieces.map((piece) => piece.id),
      matchingPieceCount: 5,
      lastWorkAt: null,
    });
    const toggle = vi.fn();
    const props: QualityDepartmentTableProps = {
      source: "quality",
      view: "INSPECTION",
      queryStatus: "ready",
      rows,
      groups: [summary],
      counts: { orders: 1, pieces: 5 },
      pagination: { page: 1, totalPages: 1, total: 1, onPageChange: vi.fn() },
      failure: null,
      searchValue: "",
      searchError: null,
      onSearchChange: vi.fn(),
      typeFilter: "ALL",
      onTypeFilterChange: vi.fn(),
      onClearFilters: vi.fn(),
      mode,
      onModeChange: vi.fn(),
      busy: false,
      onRetry: vi.fn(),
      selectedTargets: [],
      onToggleSelect: vi.fn(),
      onToggleSelectMultiple: toggle,
      onClearSelection: vi.fn(),
      expandedOrderIds: [order.id],
      groupDetails: new Map([
        [
          order.id,
          {
            phase: "ready",
            group: toQualityGroup(summary, data),
            failure: null,
          },
        ],
      ]),
      onToggleExpand: vi.fn(),
      onSetGroupExpansion: vi.fn(),
      selection: { phase: "empty", rows: [], failure: null },
      onLoadGroup: () => Promise.resolve(toQualityGroup(summary, data)),
      callbacks: {
        onReceiveAndStart: vi.fn(),
        onContinue: vi.fn(),
        onInspect: vi.fn(),
        onReportIssues: vi.fn(),
      },
    };
    render(<DepartmentOrderTable {...props} />);
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) => link.getAttribute("href") === `/quality/orders/${order.id}`,
        ),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) =>
            link.getAttribute("href") ===
            `/quality/tasks/${order.id}?pieceId=${order.pieces[0]?.id ?? ""}`,
        ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name:
          mode === "flat"
            ? "تحديد قطع الصفحة"
            : `تحديد قطع ${order.businessNumber}`,
      }),
    );
    expect(toggle).toHaveBeenCalledExactlyOnceWith(
      rows.map((row) => row.target),
      true,
    );
  },
);
