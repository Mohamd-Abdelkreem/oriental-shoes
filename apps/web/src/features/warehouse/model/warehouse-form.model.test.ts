import { expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { AxiosError, AxiosHeaders } from "axios";
import {
  warehouseOrderDataSchema,
  type WarehouseCommandOperation,
} from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { p03Ids, p03Instant } from "@/test/p03-fixtures";
import type { WarehouseReview } from "./warehouse-view.model";
import {
  captureWarehouseReceipt,
  captureWarehouseWholeOrders,
} from "./warehouse-selection.model";
import { resolveWarehouseTargets } from "./warehouse-view.model";
import {
  warehouseActionFormSchema,
  toWarehouseCommand,
  applyWarehouseFormErrors,
  warehouseFailureMessage,
  type WarehouseActionFormValues,
} from "./warehouse-form.model";

const actor = {
  id: p03Ids.actor,
  fullName: "Warehouse colleague",
  role: "USER",
  department: "WAREHOUSE",
};
const reviewFixture = (
  operation: WarehouseCommandOperation,
): WarehouseReview => {
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
  const targets = order.pieces.map((piece) => ({
    orderId: order.id,
    expectedVersion: order.version,
    pieceId: piece.id,
  }));
  return operation === "RECEIVE"
    ? captureWarehouseReceipt(resolveWarehouseTargets(detail, targets))
    : captureWarehouseWholeOrders(operation, [detail], targets);
};
it.each([
  {
    operation: "RECEIVE",
    orders: [
      {
        orderId: p03Ids.order,
        cartonCount: " 2 ",
        storageLocation: "Shelf B-12",
        notes: "Protect finished surfaces",
      },
    ],
  },
  {
    operation: "DISPATCH",
    orders: [{ orderId: p03Ids.order, deliveryNote: "Actual handoff" }],
  },
  {
    operation: "CONFIRM_DELIVERY",
    orders: [
      {
        orderId: p03Ids.order,
        recipient: "Test Recipient",
        deliveredAtText: "2026-11-13T14:30",
        notes: "Handed to recipient",
      },
    ],
  },
  {
    operation: "FAIL_DELIVERY",
    orders: [
      {
        orderId: p03Ids.order,
        reason: "Customer unavailable",
        notes: "All goods returned",
        returnedToWarehouse: true,
      },
    ],
  },
  {
    operation: "RETRY_DELIVERY",
    orders: [
      {
        orderId: p03Ids.order,
        retryDateText: "2026-11-15",
        notes: "After contact",
      },
    ],
  },
] satisfies WarehouseActionFormValues[])(
  "maps $operation values to only the original reviewed identities and actual capture",
  (values) => {
    const review = reviewFixture(values.operation),
      body = toWarehouseCommand(values, review, p03Ids.command),
      first = body.orders[0];
    expect(first).toMatchObject({
      orderId: p03Ids.order,
      expectedVersion: 2,
      pieceIds: [p03Ids.piece],
    });
    expect(body.operation).toBe(values.operation);
    switch (body.operation) {
      case "RECEIVE":
        expect(body.orders[0]?.receipt).toEqual({
          cartonCount: " 2 ",
          storageLocation: "Shelf B-12",
          notes: "Protect finished surfaces",
        });
        break;
      case "DISPATCH":
        expect(body.orders[0]?.deliveryNote).toBe("Actual handoff");
        break;
      case "CONFIRM_DELIVERY":
        expect(body.orders[0]).toMatchObject({
          attemptId: p03Ids.source,
          recipient: "Test Recipient",
          deliveredAt: new Date(2026, 10, 13, 14, 30).toISOString(),
          notes: "Handed to recipient",
        });
        break;
      case "FAIL_DELIVERY":
        expect(body.orders[0]).toMatchObject({
          attemptId: p03Ids.source,
          reason: "Customer unavailable",
          returnedToWarehouse: true,
          notes: "All goods returned",
        });
        break;
      case "RETRY_DELIVERY":
        expect(body.orders[0]).toMatchObject({
          attemptId: p03Ids.source,
          retryDate: "2026-11-15",
          notes: "After contact",
        });
        break;
    }
    expect(() =>
      toWarehouseCommand(
        warehouseActionFormSchema.parse({
          ...values,
          orders: values.orders.map((entry) => ({
            ...entry,
            orderId: p03Ids.actor,
          })),
        }),
        review,
        p03Ids.command,
      ),
    ).toThrow();
  },
);
it("normalizes optional absence without defaults, rejects raw excess/NUL and requires specific return evidence", () => {
  const review = reviewFixture("RECEIVE"),
    values = {
      operation: "RECEIVE",
      orders: [
        {
          orderId: p03Ids.order,
          cartonCount: "",
          storageLocation: " ",
          notes: "",
        },
      ],
    } satisfies WarehouseActionFormValues;
  const body = toWarehouseCommand(values, review, p03Ids.command);
  if (body.operation !== "RECEIVE") throw new Error("Receipt required");
  expect(body.orders[0]?.receipt).toEqual({
    cartonCount: null,
    storageLocation: null,
    notes: null,
  });
  for (const text of ["x".repeat(4001), " ".repeat(4001), "invalid\u0000text"])
    expect(
      warehouseActionFormSchema.safeParse({
        ...values,
        orders: [{ ...values.orders[0], notes: text }],
      }).success,
    ).toBe(false);
  expect(
    warehouseActionFormSchema.safeParse({
      ...values,
      orders: [{ ...values.orders[0], notes: "x".repeat(4000) }],
    }).success,
  ).toBe(true);
  for (const entry of [
    { reason: " ", returnedToWarehouse: true },
    { reason: "Customer unavailable", returnedToWarehouse: false },
  ])
    expect(
      warehouseActionFormSchema.safeParse({
        operation: "FAIL_DELIVERY",
        orders: [{ orderId: p03Ids.order, notes: "", ...entry }],
      }).success,
    ).toBe(false);
  const retry = toWarehouseCommand(
    {
      operation: "RETRY_DELIVERY",
      orders: [{ orderId: p03Ids.order, retryDateText: "", notes: "" }],
    },
    reviewFixture("RETRY_DELIVERY"),
    p03Ids.command,
  );
  if (retry.operation !== "RETRY_DELIVERY") throw new Error("Retry required");
  expect(retry.orders[0]?.retryDate).toBeNull();
});
it("maps only canonical editable server paths through submitted order IDs into reordered current form indices", () => {
  const review = reviewFixture("RECEIVE"),
    body = toWarehouseCommand(
      {
        operation: "RECEIVE",
        orders: [
          {
            orderId: p03Ids.order,
            cartonCount: "",
            storageLocation: "",
            notes: "",
          },
        ],
      },
      review,
      p03Ids.command,
    );
  const failure = new AxiosError("Raw diagnostics must not render");
  failure.response = {
    status: 400,
    statusText: "Failure",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      success: false,
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Raw SQL secret",
      requestId: "owned",
      timestamp: p03Instant,
      path: "/warehouse/commands",
      errors: [
        {
          field: "body.orders.0.receipt.storageLocation",
          message: "Unsafe raw detail",
        },
        { field: "body.orders.0.actorId", message: "Ignore" },
        { field: "body.orders.0.notes", message: "Ignore" },
        { field: "body.orders.9.notes", message: "Ignore" },
      ],
    },
  };
  const currentValues: WarehouseActionFormValues = {
    operation: "RECEIVE",
    orders: [
      {
        orderId: p03Ids.actor,
        cartonCount: "",
        storageLocation: "",
        notes: "",
      },
      {
        orderId: p03Ids.order,
        cartonCount: "",
        storageLocation: "",
        notes: "",
      },
    ],
  };
  const form = renderHook(() =>
    useForm<WarehouseActionFormValues>({ defaultValues: currentValues }),
  );
  try {
    let message = "";
    act(() => {
      message = applyWarehouseFormErrors(failure, form.result.current, body);
    });
    expect(
      form.result.current.getFieldState("orders.1.storageLocation").error
        ?.message,
    ).toContain("موقع التخزين");
    expect(
      form.result.current.getFieldState("orders.0.storageLocation").error,
    ).toBeUndefined();
    expect(
      form.result.current.getFieldState("orders.1.notes").error,
    ).toBeUndefined();
    expect(
      form.result.current.getFieldState("orders.9.notes").error,
    ).toBeUndefined();
    expect(
      form.result.current.getFieldState("orders.1.storageLocation").error
        ?.message,
    ).not.toContain("Unsafe raw detail");
    expect(message).not.toContain("Raw SQL");
  } finally {
    form.unmount();
  }
  expect(warehouseFailureMessage(new Error("SQL secret"), "review")).toContain(
    "لم يتم إرسال",
  );
  const invalid = warehouseActionFormSchema.safeParse({
    operation: "RECEIVE",
    orders: [],
  });
  if (invalid.success) throw new Error("Invalid form must reject");
  expect(warehouseFailureMessage(invalid.error, "RECEIVE")).toContain(
    "لم يتم إرسال طلب حفظ",
  );
});
