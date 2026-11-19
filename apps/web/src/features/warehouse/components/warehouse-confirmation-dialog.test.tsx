import { readWarehouseOperationalScope } from "@/shared/query/operational-scope";
import { warehouseKeys } from "../hooks/warehouse.hooks";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  authUserDataSchema,
  warehouseOrderDataSchema,
  type WarehouseCommandOperation,
} from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import {
  p03Ids,
  p03Instant,
  p03Session,
  p03Envelope,
} from "@/test/p03-fixtures";
import { useWarehouseOrder } from "../hooks/warehouse.hooks";
import { useWarehouseConfirmation } from "../hooks/warehouse-confirmation.hooks";
import { useWarehouseCommand } from "../hooks/warehouse-commands.hooks";
import {
  resolveWarehouseTargets,
  type WarehouseRowCallbacks,
} from "../model/warehouse-view.model";
import { WarehousePieceActions } from "./warehouse-piece-actions";
import { WarehouseCommandRecovery } from "./warehouse-command-recovery";
import { DeliveryFailedDialog } from "@/features/prototype/components/delivery-failed-dialog";
import { RetryDeliveryDialog } from "@/features/prototype/components/retry-delivery-dialog";
import { ConfirmDeliveryDialog } from "@/features/prototype/components/confirm-delivery-dialog";
import { DispatchDeliveryDialog } from "@/features/prototype/components/dispatch-delivery-dialog";
import type { WarehouseDialogProps } from "../model/warehouse-view.model";
import { ConfirmWarehouseReceiptDialog } from "@/features/prototype/components/confirm-warehouse-receipt-dialog";
import { WarehouseConfirmationDialog } from "./warehouse-confirmation-dialog";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
  post: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StrictMode>
);
const actor = {
  id: p03Ids.actor,
  fullName: "Warehouse colleague",
  role: "USER",
  department: "WAREHOUSE",
};
const detailFixture = (operation: WarehouseCommandOperation) => {
  const original = manufacturingDetailFixture().paper.order,
    received = operation !== "RECEIVE",
    outbound =
      operation === "CONFIRM_DELIVERY" || operation === "FAIL_DELIVERY",
    failed = operation === "RETRY_DELIVERY";
  const counts = {
    ...original.counts,
    received: received ? original.counts.active : 0,
    completionPercent: received ? 100 : 0,
  };
  const order = {
    ...original,
    status: outbound
      ? "OUT_FOR_DELIVERY"
      : failed
        ? "DELIVERY_FAILED"
        : received
          ? "READY_FOR_DELIVERY"
          : "APPROVED",
    counts,
    pieces: original.pieces.map((piece) => ({
      ...piece,
      stage: "WAREHOUSE",
      workState: received ? "COMPLETED" : "INCOMING",
      receivedAt: received ? p03Instant : null,
    })),
  };
  const attempt =
    outbound || failed
      ? {
          id: p03Ids.source,
          orderId: order.id,
          number: 1,
          pieceIds: order.pieces.map((piece) => piece.id),
          status: failed ? "FAILED" : "DISPATCHED",
          dispatchedBy: actor,
          dispatchedAt: p03Instant,
          deliveryNote: null,
          outcome: failed
            ? {
                id: p03Ids.command,
                kind: "FAILED",
                recordedBy: actor,
                recordedAt: p03Instant,
                notes: null,
                reason: "Customer unavailable",
                returnedToWarehouse: true,
              }
            : null,
          retry: null,
        }
      : null;
  const detail = warehouseOrderDataSchema.parse({
    summary: {
      id: order.id,
      version: order.version,
      type: order.type,
      status: order.status,
      businessNumber: order.businessNumber,
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      counts,
      matchingPieceIds: order.pieces.map((piece) => piece.id),
      matchingPieceCount: order.pieces.length,
      lastActionAt: null,
      allowedActions: {
        canDispatch: operation === "DISPATCH",
        canConfirmDelivery: outbound,
        canFailDelivery: outbound,
        canRetryDelivery: failed,
      },
      currentAttemptId: attempt?.id ?? null,
      retryDate: null,
    },
    paper: { order, issues: [] },
    deliveryContact: {
      name: order.customerName,
      phone: "+966500000001",
      address: null,
    },
    work: order.pieces.map((piece) => ({
      pieceId: piece.id,
      acceptedHandoff: received
        ? null
        : {
            eventId: p03Ids.command,
            commandId: p03Ids.command,
            acceptedAt: p03Instant,
            actor: { ...actor, department: "QUALITY" },
            packingGroupId: null,
          },
      receiptGroupId: null,
      receivedAt: piece.receivedAt,
      legacyReceipt: received,
      allowedActions: { canReceive: !received },
    })),
    receiptGroups: [],
    qualityPackingGroups: [],
    currentAttempt: attempt,
  });
  return detail;
};

const rejection = (status: number, code: string) => {
  const error = new AxiosError("Owned failure");
  error.response = {
    status,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: status,
      code,
      message: "PRIVATE FAILURE MUST NOT RENDER",
      requestId: "owned",
      timestamp: p03Instant,
      path: "/warehouse/commands",
    },
  };
  return error;
};
function Harness({
  operation = "RECEIVE",
}: {
  operation?: WarehouseCommandOperation;
}) {
  const query = useWarehouseOrder(p03Ids.order),
    command = useWarehouseCommand(),
    trigger = useRef<HTMLButtonElement>(null);
  const availability = query.isError
    ? "error"
    : query.isFetching || !query.data
      ? "refreshing"
      : "ready";
  const controller = useWarehouseConfirmation(availability);
  return (
    <>
      <WarehouseCommandRecovery />
      <button
        ref={trigger}
        disabled={availability !== "ready" || controller.preparing}
        onClick={() => {
          const first = query.data?.paper.order.pieces[0];
          if (first && query.data)
            void controller.open(operation, [
              {
                orderId: p03Ids.order,
                expectedVersion: query.data.summary.version,
                pieceId: first.id,
              },
            ]);
        }}
      >
        Prepare
      </button>
      <button
        onClick={() => {
          void query.refetch();
        }}
      >
        Refresh outside
      </button>
      {controller.failure && <p>{controller.failure}</p>}
      {controller.review &&
        (controller.review.operation === "RECEIVE" ? (
          <ConfirmWarehouseReceiptDialog
            source="warehouse"
            open
            review={controller.review}
            pending={controller.preparing || command.state.phase !== "idle"}
            readAvailability={availability}
            readFailure={query.isError ? "تعذر تحميل الطلب" : null}
            failure={controller.failure}
            reviewRequired={controller.reviewRequired}
            onReadRetry={async () => {
              await query.refetch({ throwOnError: true });
            }}
            onReview={controller.reviewCurrent}
            onConfirm={controller.confirm}
            onClose={controller.close}
            returnFocusRef={trigger}
          />
        ) : (
          <DeliveryTestDialog
            source="warehouse"
            open
            review={controller.review}
            pending={controller.preparing || command.state.phase !== "idle"}
            readAvailability={availability}
            readFailure={query.isError ? "تعذر تحميل الطلب" : null}
            failure={controller.failure}
            reviewRequired={controller.reviewRequired}
            onReadRetry={async () => {
              await query.refetch({ throwOnError: true });
            }}
            onReview={controller.reviewCurrent}
            onConfirm={controller.confirm}
            onClose={controller.close}
            returnFocusRef={trigger}
          />
        ))}
    </>
  );
}
beforeEach(() => {
  client = createQueryClient();
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "WAREHOUSE" },
    }),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const open = async (operation: WarehouseCommandOperation = "RECEIVE") => {
  transport.get.mockResolvedValue(p03Envelope(detailFixture(operation)));
  render(<Harness operation={operation} />, { wrapper });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Prepare" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
  return screen.findByRole("dialog");
};
it("keeps per-order receipt capture and exact selected IDs through canonical admission", async () => {
  await open();
  transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
  fireEvent.change(screen.getByLabelText("عدد الكراتين المستلمة"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("موقع التخزين بالرفوف"), {
    target: { value: "Shelf B-12" },
  });
  fireEvent.change(screen.getByLabelText("ملاحظات"), {
    target: { value: "Protect finished surfaces" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  expect(transport.post).toHaveBeenCalledWith(
    "/warehouse/commands",
    expect.objectContaining({
      operation: "RECEIVE",
      orders: [
        {
          orderId: p03Ids.order,
          expectedVersion: 2,
          pieceIds: [p03Ids.piece],
          receipt: {
            cartonCount: "2",
            storageLocation: "Shelf B-12",
            notes: "Protect finished surfaces",
          },
        },
      ],
    }),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("موقع التخزين بالرفوف")).toHaveValue(
    "Shelf B-12",
  );
  expect(
    screen.queryByText("PRIVATE FAILURE MUST NOT RENDER"),
  ).not.toBeInTheDocument();
  await screen.findAllByText(/تعذّر قبول بيانات الطلب|راجع القيم الموضّحة/);
  expect(screen.getByRole("button", { name: "تأكيد الإجراء" })).toBeEnabled();
});
it("cancel discards an unsent review without allocating a UUID or posting", async () => {
  const uuid = vi.spyOn(crypto, "randomUUID");
  await open("DISPATCH");
  expect(
    screen.getByText(/يشمل الإجراء جميع القطع النشطة/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(uuid).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
  uuid.mockRestore();
});
it("gates direct submit before RHF/UUID during refetch, preserves dirty values and read retry focus", async () => {
  const dialog = await open(),
    uuid = vi.spyOn(crypto, "randomUUID");
  fireEvent.change(screen.getByLabelText("ملاحظات"), {
    target: { value: "Dirty receipt" },
  });
  let rejectRead: (error: unknown) => void = () => {
    throw new Error("Read gate missing");
  };
  transport.get.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRead = reject;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh outside" }));
  try {
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "تأكيد الإجراء" }),
      ).toBeDisabled();
    });
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Form required");
    fireEvent.submit(form);
    expect(uuid).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    act(() => {
      rejectRead(rejection(422, "READ_FAILED"));
    });
    const retry = await screen.findByRole("button", {
      name: "إعادة تحميل البيانات",
    });
    retry.focus();
    transport.get.mockResolvedValue(p03Envelope(detailFixture("RECEIVE")));
    fireEvent.click(retry);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "تأكيد الإجراء" }),
      ).toBeEnabled();
    });
    expect(screen.getByLabelText("ملاحظات")).toHaveValue("Dirty receipt");
    expect(dialog).toHaveFocus();
    expect(uuid).not.toHaveBeenCalled();
  } finally {
    rejectRead(rejection(422, "READ_FAILED"));
    uuid.mockRestore();
  }
});
it("requires actual full-return acknowledgement and a nonblank reason", async () => {
  await open("FAIL_DELIVERY");
  transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await screen.findByText(/سبب تعذر التسليم مطلوب/);
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "العميل غير متواجد بالموقع" }),
  );
  fireEvent.click(screen.getByLabelText(/أؤكد عودة جميع قطع/));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  expect(transport.post).toHaveBeenCalledWith(
    "/warehouse/commands",
    expect.objectContaining({
      operation: "FAIL_DELIVERY",
      orders: [
        expect.objectContaining({
          returnedToWarehouse: true,
          reason: "العميل غير متواجد بالموقع",
          attemptId: p03Ids.source,
          pieceIds: [p03Ids.piece],
        }),
      ],
    }),
  );
});
it("keeps an unknown original write after a healthy GET and close/remount recovery", async () => {
  await open();
  transport.post.mockRejectedValue(new AxiosError("reply lost"));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await screen.findByText(/نتيجة الإجراء غير مؤكدة/);
  fireEvent.click(screen.getByRole("button", { name: "Refresh outside" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Prepare" })).toBeEnabled();
  });
  expect(screen.getByText(/نتيجة الإجراء غير مؤكدة/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText(/نتيجة الإجراء غير مؤكدة/)).toBeInTheDocument();
  expect(transport.post).toHaveBeenCalledTimes(1);
});
it("expands a selected piece to all active order pieces before dispatch confirmation", async () => {
  const original = detailFixture("DISPATCH"),
    first = original.paper.order.pieces[0],
    work = original.work[0];
  if (!first || !work) throw new Error("Fixture member required");
  const other = {
      ...first,
      id: "30000000-0000-4000-8000-000000000002",
      position: 2,
    },
    counts = {
      ...original.summary.counts,
      original: 2,
      active: 2,
      received: 2,
    };
  const detail = warehouseOrderDataSchema.parse({
    ...original,
    summary: {
      ...original.summary,
      counts,
      matchingPieceIds: [first.id, other.id],
      matchingPieceCount: 2,
    },
    paper: {
      ...original.paper,
      order: { ...original.paper.order, counts, pieces: [first, other] },
    },
    work: [work, { ...work, pieceId: other.id }],
  });
  transport.get.mockResolvedValue(p03Envelope(detail));
  transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
  render(<Harness operation="DISPATCH" />, { wrapper });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Prepare" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
  await screen.findByRole("dialog");
  expect(screen.getByText(/القطع المشمولة:/)).toHaveTextContent(other.id);
  fireEvent.change(screen.getByLabelText("ملاحظات التوصيل (اختياري)"), {
    target: { value: "Call at gate" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  expect(transport.post).toHaveBeenCalledWith(
    "/warehouse/commands",
    expect.objectContaining({
      operation: "DISPATCH",
      orders: [
        {
          orderId: p03Ids.order,
          expectedVersion: 2,
          pieceIds: [first.id, other.id].sort(),
          deliveryNote: "Call at gate",
        },
      ],
    }),
  );
});
it("requires explicit fresh review of a changed version while retaining dirty fields", async () => {
  await open("DISPATCH");
  const uuid = vi.spyOn(crypto, "randomUUID");
  fireEvent.change(screen.getByLabelText("ملاحظات التوصيل (اختياري)"), {
    target: { value: "Keep my draft" },
  });
  const detail = detailFixture("DISPATCH");
  const updated = warehouseOrderDataSchema.parse({
    ...detail,
    summary: { ...detail.summary, version: 3 },
    paper: { ...detail.paper, order: { ...detail.paper.order, version: 3 } },
  });
  transport.get.mockResolvedValue(p03Envelope(updated));
  fireEvent.click(screen.getByRole("button", { name: "Refresh outside" }));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "تأكيد الإجراء" }),
    ).toBeDisabled();
  });
  await screen.findByRole("button", { name: "مراجعة النطاق الحالي" });
  expect(uuid).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "مراجعة النطاق الحالي" }));
  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "مراجعة النطاق الحالي" }),
    ).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("ملاحظات التوصيل (اختياري)")).toHaveValue(
    "Keep my draft",
  );
  expect(screen.getByText(/الإصدار 3/)).toBeInTheDocument();
  uuid.mockRestore();
});
it("does not reopen a late preparation after the account loses warehouse authority", async () => {
  transport.get.mockResolvedValue(p03Envelope(detailFixture("RECEIVE")));
  render(<Harness />, { wrapper });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Prepare" })).toBeEnabled();
  });
  let release: (value: unknown) => void = () => {
    throw new Error("Preparation gate missing");
  };
  transport.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
  try {
    await waitFor(() => {
      expect(transport.get).toHaveBeenCalledTimes(2);
    });
    act(() => {
      client.setQueryData(AUTH_SESSION_QUERY_KEY, null);
    });
    await act(async () => {
      release(p03Envelope(detailFixture("RECEIVE")));
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transport.post).not.toHaveBeenCalled();
  } finally {
    release(p03Envelope(detailFixture("RECEIVE")));
  }
});

it("offers receipt only for canonical eligible work and forwards exact targets", () => {
  const detail = detailFixture("RECEIVE"),
    piece = detail.paper.order.pieces[0];
  if (!piece) throw new Error("Piece required");
  const row = resolveWarehouseTargets(detail, [
    {
      orderId: detail.summary.id,
      expectedVersion: detail.summary.version,
      pieceId: piece.id,
    },
  ])[0];
  if (!row) throw new Error("Row required");
  const callbacks: WarehouseRowCallbacks = {
    onReceive: vi.fn(),
    onDispatch: vi.fn(),
    onConfirmDelivery: vi.fn(),
    onFailDelivery: vi.fn(),
    onRetryDelivery: vi.fn(),
  };
  const view = render(
    <WarehousePieceActions row={row} busy={false} callbacks={callbacks} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "تأكيد الاستلام الفعلي" }),
  );
  expect(callbacks.onReceive).toHaveBeenCalledExactlyOnceWith([row.target]);
  view.rerender(
    <WarehousePieceActions
      row={{
        ...row,
        work: { ...row.work, allowedActions: { canReceive: false } },
      }}
      busy={false}
      callbacks={callbacks}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

function DeliveryTestDialog(props: WarehouseDialogProps) {
  return props.review.operation === "DISPATCH" ? (
    <DispatchDeliveryDialog
      {...props}
      review={{ ...props.review, operation: "DISPATCH" as const }}
    />
  ) : props.review.operation === "CONFIRM_DELIVERY" ? (
    <ConfirmDeliveryDialog
      {...props}
      review={{ ...props.review, operation: "CONFIRM_DELIVERY" as const }}
    />
  ) : props.review.operation === "FAIL_DELIVERY" ? (
    <DeliveryFailedDialog
      {...props}
      review={{ ...props.review, operation: "FAIL_DELIVERY" as const }}
    />
  ) : props.review.operation === "RETRY_DELIVERY" ? (
    <RetryDeliveryDialog
      {...props}
      review={{ ...props.review, operation: "RETRY_DELIVERY" as const }}
    />
  ) : (
    <WarehouseConfirmationDialog {...props} />
  );
}

it.each([false, true])(
  "retains optional actual customer delivery capture (supplied=%s)",
  async (supplied) => {
    await open("CONFIRM_DELIVERY");
    transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
    expect(screen.getByLabelText("اسم المستلم الفعلي (اختياري)")).toHaveValue(
      "",
    );
    expect(
      screen.getByLabelText("وقت وتاريخ التسليم الفعلي (اختياري)"),
    ).toHaveValue("");
    if (supplied) {
      fireEvent.change(screen.getByLabelText("اسم المستلم الفعلي (اختياري)"), {
        target: { value: "Actual recipient" },
      });
      fireEvent.change(
        screen.getByLabelText("وقت وتاريخ التسليم الفعلي (اختياري)"),
        { target: { value: "2026-11-13 14:30 +02:00" } },
      );
      fireEvent.change(screen.getByLabelText("ملاحظات"), {
        target: { value: "Handed to recipient" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    expect(transport.post).toHaveBeenCalledWith(
      "/warehouse/commands",
      expect.objectContaining({
        operation: "CONFIRM_DELIVERY",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
            attemptId: p03Ids.source,
            recipient: supplied ? "Actual recipient" : null,
            deliveredAt: supplied ? "2026-11-13T12:30:00.000Z" : null,
            notes: supplied ? "Handed to recipient" : null,
          },
        ],
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  },
);

it.each(["", "2026-11-16"])(
  "retry preserves optional calendar %s and restores ready intent only",
  async (date) => {
    await open("RETRY_DELIVERY");
    transport.post.mockRejectedValue(
      rejection(409, "WAREHOUSE_VERSION_CONFLICT"),
    );
    expect(
      screen.getByLabelText("موعد المحاولة الجديدة (اختياري)"),
    ).toHaveValue("");
    fireEvent.change(screen.getByLabelText("موعد المحاولة الجديدة (اختياري)"), {
      target: { value: date },
    });
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "Call first" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
    await waitFor(() => {
      expect(transport.post).toHaveBeenCalledTimes(1);
    });
    expect(transport.post).toHaveBeenCalledWith(
      "/warehouse/commands",
      expect.objectContaining({
        operation: "RETRY_DELIVERY",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
            attemptId: p03Ids.source,
            retryDate: date || null,
            notes: "Call first",
          },
        ],
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("ملاحظات")).toHaveValue("Call first");
    expect(
      screen.queryByRole("button", { name: /خروج الطلب/ }),
    ).not.toBeInTheDocument();
  },
);

it("explicit whole-order review recomputes remaining active membership after a selected piece is cancelled", async () => {
  const base = detailFixture("DISPATCH"),
    first = base.paper.order.pieces[0],
    work = base.work[0];
  if (!first || !work) throw new Error("Member required");
  const second = {
      ...first,
      id: "30000000-0000-4000-8000-000000000002",
      position: 2,
    },
    counts = {
      original: 2,
      cancelled: 0,
      active: 2,
      received: 2,
      completionPercent: 100,
    };
  const original = warehouseOrderDataSchema.parse({
    ...base,
    summary: {
      ...base.summary,
      counts,
      matchingPieceIds: [first.id, second.id],
      matchingPieceCount: 2,
    },
    paper: {
      ...base.paper,
      order: { ...base.paper.order, counts, pieces: [first, second] },
    },
    work: [work, { ...work, pieceId: second.id }],
  });
  transport.get.mockResolvedValue(p03Envelope(original));
  transport.post.mockRejectedValue(rejection(422, "VALIDATION_ERROR"));
  render(<Harness operation="DISPATCH" />, { wrapper });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Prepare" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("ملاحظات التوصيل (اختياري)"), {
    target: { value: "Preserve original draft" },
  });
  const currentCounts = {
    original: 2,
    cancelled: 1,
    active: 1,
    received: 1,
    completionPercent: 100,
  };
  const updated = warehouseOrderDataSchema.parse({
    ...original,
    summary: {
      ...original.summary,
      version: 3,
      counts: currentCounts,
      matchingPieceIds: [second.id],
      matchingPieceCount: 1,
    },
    paper: {
      ...original.paper,
      order: {
        ...original.paper.order,
        version: 3,
        counts: currentCounts,
        pieces: [
          {
            ...first,
            stage: "CANCELLED",
            workState: "BLOCKED",
            cancelledAt: p03Instant,
            cancellationReason: "Approved cancellation",
          },
          second,
        ],
      },
    },
  });
  transport.get.mockResolvedValue(p03Envelope(updated));
  fireEvent.click(screen.getByRole("button", { name: "Refresh outside" }));
  const review = await screen.findByRole("button", {
    name: "مراجعة النطاق الحالي",
  });
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(review);
  await screen.findByText(/الإصدار 3/);
  expect(screen.getByLabelText("ملاحظات التوصيل (اختياري)")).toHaveValue(
    "Preserve original draft",
  );
  expect(screen.getByText(/القطع المشمولة:/)).toHaveTextContent(second.id);
  expect(screen.getByText(/القطع المشمولة:/)).not.toHaveTextContent(first.id);
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
  await waitFor(() => {
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  expect(transport.post).toHaveBeenCalledWith(
    "/warehouse/commands",
    expect.objectContaining({
      operation: "DISPATCH",
      orders: [
        {
          orderId: p03Ids.order,
          expectedVersion: 3,
          pieceIds: [second.id],
          deliveryNote: "Preserve original draft",
        },
      ],
    }),
  );
});

it("a concurrent dispatch during asynchronous RHF validation stays an unsent review failure", async () => {
  await open("DISPATCH");
  const uuid = vi.spyOn(crypto, "randomUUID"),
    scope = readWarehouseOperationalScope(client);
  if (!scope) throw new Error("Scope required");
  const outbound = detailFixture("CONFIRM_DELIVERY"),
    current = warehouseOrderDataSchema.parse({
      ...outbound,
      summary: { ...outbound.summary, version: 3 },
      paper: {
        ...outbound.paper,
        order: { ...outbound.paper.order, version: 3 },
      },
    });
  try {
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));
    act(() => {
      client.setQueryData(warehouseKeys.order(scope, p03Ids.order), current);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "مراجعة النطاق الحالي" }),
      ).toBeInTheDocument();
    });
    expect(transport.post).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("غير مؤكدة");
    expect(screen.getByRole("dialog")).toHaveTextContent("لم يتم إرسال");
  } finally {
    uuid.mockRestore();
  }
});
