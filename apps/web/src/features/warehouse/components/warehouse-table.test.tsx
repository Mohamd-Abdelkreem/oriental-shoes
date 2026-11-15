import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { warehouseOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  toWarehouseGroup,
  type WarehouseDepartmentTableProps,
} from "../model/warehouse-view.model";
import { WarehouseTable } from "./warehouse-table";

const detailFixture = (received = false, count = 2, offset = 0) => {
  const original = manufacturingDetailFixture().paper.order,
    first = original.pieces[0];
  if (!first) throw new Error("Fixture piece required");
  const orderId =
    offset === 0 ? original.id : "20000000-0000-4000-8000-000000000002";
  const pieces = Array.from({ length: count }, (_, index) => ({
    ...first,
    id: `30000000-0000-4000-8000-${String(offset + index + 1).padStart(12, "0")}`,
    position: index + 1,
    stage: "WAREHOUSE",
    workState: received ? "COMPLETED" : "INCOMING",
    receivedAt: received ? "2026-11-13T00:00:00.000Z" : null,
  }));
  const counts = {
    original: count,
    cancelled: 0,
    active: count,
    received: received ? count : 0,
    completionPercent: received ? 100 : 0,
  };
  const order = {
    ...original,
    id: orderId,
    status: received ? "READY_FOR_DELIVERY" : "APPROVED",
    counts,
    pieces,
  };
  return warehouseOrderDataSchema.parse({
    summary: {
      id: orderId,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: pieces.map((piece) => piece.id),
      matchingPieceCount: count,
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
    work: pieces.map((piece) => ({
      pieceId: piece.id,
      acceptedHandoff: received
        ? null
        : {
            eventId: "40000000-0000-4000-8000-000000000001",
            commandId: "50000000-0000-4000-8000-000000000001",
            acceptedAt: "2026-11-13T00:00:00.000Z",
            actor: {
              id: "60000000-0000-4000-8000-000000000001",
              fullName: "Inspector",
              role: "USER",
              department: "QUALITY",
            },
            packingGroupId: null,
          },
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: received,
      allowedActions: { canReceive: !received },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: null,
  });
};
const setup = (received = false) => {
  const detail = detailFixture(received),
    group = toWarehouseGroup(detail.summary, detail),
    callbacks = {
      onReceive: vi.fn(),
      onDispatch: vi.fn(),
      onConfirmDelivery: vi.fn(),
      onFailDelivery: vi.fn(),
      onRetryDelivery: vi.fn(),
    };
  const props: WarehouseDepartmentTableProps = {
    source: "warehouse",
    view: "INCOMING",

    mode: "grouped",

    busy: false,
    onRetry: vi.fn(),
    selectedTargets: [],
    onToggleSelect: vi.fn(),
    onToggleSelectMultiple: vi.fn(),
    onClearSelection: vi.fn(),
    expandedOrderIds: [detail.summary.id],
    groupDetails: new Map([
      [detail.summary.id, { phase: "ready", group, failure: null }],
    ]),
    onToggleExpand: vi.fn(),
    selection: { phase: "empty", rows: [], failure: null },
    onLoadGroup: vi.fn().mockResolvedValue(group),
    callbacks,
    queryStatus: "ready",
    rows: [],
    groups: [detail.summary],
    counts: { orders: 1, pieces: 2 },

    failure: null,
  };
  return { props, group };
};
it("preserves canonical count units and grouped/flat matching selection", async () => {
  const { props, group } = setup(),
    view = render(<WarehouseTable {...props} />);
  expect(screen.getByText(/النطاق المطابق:/)).toHaveTextContent(
    "1 أمر تفصيل · 2 قطعة",
  );
  fireEvent.click(
    screen.getByLabelText(`تحديد قطع ${group.order.businessNumber}`),
  );
  await waitFor(() => {
    expect(props.onToggleSelectMultiple).toHaveBeenCalledWith(
      group.rows.map((row) => row.target),
      true,
    );
  });
  expect(props.onLoadGroup).toHaveBeenCalledExactlyOnceWith(group.order);
  view.rerender(
    <WarehouseTable {...props} mode="flat" groups={[]} rows={group.rows} />,
  );
  fireEvent.click(screen.getByLabelText("تحديد قطع الصفحة"));
  expect(props.onToggleSelectMultiple).toHaveBeenLastCalledWith(
    group.rows.map((row) => row.target),
    true,
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "الصفحة التالية" }),
  ).not.toBeInTheDocument();
});
it("renders all 25 server-page pieces without introducing a second local pager (T053)", () => {
  const { props } = setup();
  const detail = detailFixture(false, 25),
    group = toWarehouseGroup(detail.summary, detail);
  render(
    <WarehouseTable
      {...props}
      mode="flat"
      rows={group.rows}
      groups={[]}
      counts={{ orders: 1, pieces: 25 }}
    />,
  );
  expect(
    screen.getAllByRole("checkbox", { name: /^تحديد القطعة /u }),
  ).toHaveLength(25);
  expect(screen.getAllByRole("row")).toHaveLength(26);
  expect(
    screen.queryByRole("button", { name: "الصفحة التالية" }),
  ).not.toBeInTheDocument();
});
it("fences stale grouped details and retained failed/refetching flat reads", () => {
  const { props, group } = setup(),
    view = render(
      <WarehouseTable
        {...props}
        groupDetails={
          new Map([
            [group.order.id, { phase: "refreshing", group, failure: null }],
          ])
        }
      />,
    );
  expect(
    screen.getByLabelText(`تحديد قطع ${group.order.businessNumber}`),
  ).toBeDisabled();
  for (const action of screen.getAllByRole("button", {
    name: "تأكيد الاستلام الفعلي",
  }))
    expect(action).toBeDisabled();
  view.rerender(
    <WarehouseTable
      {...props}
      mode="flat"
      rows={group.rows}
      groups={[]}
      queryStatus="refreshing"
      failure="تعذر تحميل البيانات"
    />,
  );
  expect(screen.getByLabelText("تحديد قطع الصفحة")).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل البيانات");
});
it("does not apply a failed group selection or manufacture partial membership", async () => {
  const { props, group } = setup();
  const failing = {
    ...props,
    onLoadGroup: vi.fn().mockRejectedValue(new Error("PRIVATE")),
  };
  render(<WarehouseTable {...failing} />);
  fireEvent.click(
    screen.getByLabelText(`تحديد قطع ${group.order.businessNumber}`),
  );
  await screen.findByRole("alert");
  expect(props.onToggleSelectMultiple).not.toHaveBeenCalled();
  expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
});
it("keeps incomplete orders locked and rejects stale selection for receipt", () => {
  const { props, group } = setup();
  const view = render(
    <WarehouseTable
      {...props}
      view="INCOMPLETE"
      selectedTargets={group.rows.map((row) => row.target)}
    />,
  );
  expect(screen.getByText(/التوصيل مقفل/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /خروج/ }),
  ).not.toBeInTheDocument();
  view.rerender(
    <WarehouseTable
      {...props}
      selectedTargets={group.rows.map((row) => row.target)}
      selection={{ phase: "stale", rows: [], failure: "راجع التحديد" }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "استلام القطع المحددة فعلياً" }),
  ).toBeDisabled();
});

it("ready row and selected-piece batch request a whole-order review without writing", () => {
  const { props, group } = setup(true),
    first = group.rows[0];
  if (!first) throw new Error("Row required");
  render(
    <WarehouseTable
      {...props}
      view="READY"
      selectedTargets={[first.target]}
      selection={{ phase: "ready", rows: [first], failure: null }}
    />,
  );
  const row = screen.getAllByRole("button", {
    name: "مراجعة خروج الطلب الكامل للتوصيل",
  })[0];
  if (!row) throw new Error("Row action required");
  fireEvent.click(row);
  expect(props.callbacks.onDispatch).toHaveBeenCalledWith([first.target]);
  fireEvent.click(
    screen.getByRole("button", { name: "مراجعة خروج الطلبات الكاملة للتوصيل" }),
  );
  expect(props.callbacks.onDispatch).toHaveBeenLastCalledWith([first.target]);
});

it("failed delivery offers reviewed retry only, without a direct dispatch shortcut", () => {
  const { props, group } = setup(true);
  const rows = group.rows.map((row) => ({
    ...row,
    order: {
      ...row.order,
      status: "DELIVERY_FAILED" as const,
      currentAttemptId: "10000000-0000-4000-8000-000000000001",
      allowedActions: {
        canDispatch: false,
        canConfirmDelivery: false,
        canFailDelivery: false,
        canRetryDelivery: true,
      },
    },
  }));
  render(
    <WarehouseTable
      {...props}
      mode="flat"
      view="DELIVERY_FAILED"
      rows={rows}
      groups={[]}
      selectedTargets={rows.map((row) => row.target)}
      selection={{ phase: "ready", rows, failure: null }}
    />,
  );
  expect(
    screen.queryByRole("button", { name: /خروج الطلب/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /تسليم الطلب.*للعميل/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "مراجعة إعادة الطلبات الكاملة للجاهز" }),
  );
  expect(props.callbacks.onRetryDelivery).toHaveBeenCalledExactlyOnceWith(
    rows.map((row) => row.target),
  );
});

it("shows physical warehouse receipt separately from an upstream incomplete companion", () => {
  const { props, group } = setup(true),
    rows = group.rows.map((row, index) => ({
      ...row,
      order: {
        ...row.order,
        status: "APPROVED" as const,
        counts: { ...row.order.counts, received: 1, completionPercent: 50 },
        allowedActions: {
          canDispatch: false,
          canConfirmDelivery: false,
          canFailDelivery: false,
          canRetryDelivery: false,
        },
      },
      ...(index === 1
        ? {
            piece: {
              ...row.piece,
              stage: "PRODUCTION" as const,
              workState: "IN_PROGRESS" as const,
              receivedAt: null,
            },
            work: {
              ...row.work,
              receivedAt: null,
              legacyReceipt: false,
              allowedActions: { canReceive: false },
            },
          }
        : {}),
    }));
  render(
    <WarehouseTable
      {...props}
      view="INCOMPLETE"
      mode="flat"
      rows={rows}
      groups={[]}
    />,
  );
  expect(screen.getByRole("table")).toHaveTextContent(
    "المستودع — تم الاستلام الفعلي",
  );
  expect(screen.getByRole("table")).toHaveTextContent(
    "الإنتاج والإصلاح — قيد التنفيذ — لم تستلم فعلياً",
  );
  expect(
    screen.queryByRole("button", { name: /خروج الطلب/ }),
  ).not.toBeInTheDocument();
});
