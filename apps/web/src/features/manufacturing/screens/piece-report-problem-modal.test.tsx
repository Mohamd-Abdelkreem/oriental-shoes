import { QueryClientProvider } from "@tanstack/react-query";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { p03Ids } from "@/test/p03-fixtures";
import {
  manufacturingDetailFixture,
  factorySessionFixture,
} from "../model/manufacturing.fixture";
import { manufacturingApi } from "../api/manufacturing.api";
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
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { PieceReportProblemModal } from "./piece-report-problem-modal";

function ProblemScreen() {
  const store = useMvpStore();
  const [closed, setClosed] = useState(false);
  const order = store.orders.find(
    (candidate) => candidate.id === "EXTERNAL-2026-0004",
  );
  assert.ok(order);
  const piece = order.items[0];
  assert.ok(piece);
  return closed ? null : (
    <PieceReportProblemModal
      order={order}
      piece={piece}
      deptName="قسم الإنتاج والإصلاح"
      workerName="أحمد عادل"
      onClose={() => {
        setClosed(true);
      }}
    />
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MvpStoreProvider>
    <ProblemScreen />
    {children}
  </MvpStoreProvider>
);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

it("requires a reason and notes and reports only the selected piece under the current worker", async () => {
  const { result } = renderHook(useMvpStore, { wrapper });
  await waitFor(() => {
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  const original = result.current.orders.find(
    (order) => order.id === "EXTERNAL-2026-0004",
  );
  assert.ok(original);
  const submit = screen.getByRole("button", { name: "إرسال المشكلة للاعتماد" });
  const reason = screen.getByLabelText(/^سبب المشكلة المصنعية/u);
  const notes = screen.getByLabelText(/^تفاصيل المشكلة والمقترح الفني/u);
  expect(submit).toBeDisabled();
  expect(
    screen.getByLabelText("الفني / الموظف القائم بالإبلاغ:"),
  ).toBeDisabled();
  expect(screen.getByLabelText("الفني / الموظف القائم بالإبلاغ:")).toHaveValue(
    "أحمد عادل",
  );
  fireEvent.change(reason, { target: { value: "   " } });
  fireEvent.change(notes, { target: { value: "  إعادة تثبيت النعل  " } });
  expect(submit).toBeDisabled();
  fireEvent.change(reason, { target: { value: "  عدم ثبات الغراء  " } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  const updated = result.current.orders.find(
    (order) => order.id === original.id,
  );
  assert.ok(updated);
  expect(updated.items[0]?.problem).toMatchObject({
    reason: "عدم ثبات الغراء",
    notes: "إعادة تثبيت النعل",
    reportedByWorker: "أحمد عادل",
    reportedByDept: "قسم الإنتاج والإصلاح",
  });
  expect(updated.items[0]?.currentLocation).toBe("لدى الاعتماد بسبب مشكلة");
  expect(updated.items.slice(1)).toEqual(original.items.slice(1));
  expect(
    screen.queryByRole("button", { name: "إرسال المشكلة للاعتماد" }),
  ).not.toBeInTheDocument();
});

it("reports an exact persisted piece with optional notes and Arabic field recovery", async () => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  const client = createQueryClient();
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  const detail = manufacturingDetailFixture(),
    close = vi.fn();
  const orderRead = vi
    .spyOn(manufacturingApi, "order")
    .mockResolvedValue(detail);
  const report = vi
    .spyOn(manufacturingApi, "reportIssue")
    .mockRejectedValue(new Error("lost-result"));
  const view = render(
    <QueryClientProvider client={client}>
      <PieceReportProblemModal
        source="persisted"
        department="CUTTING"
        data={detail}
        target={{
          orderId: p03Ids.order,
          expectedVersion: 2,
          pieceId: p03Ids.piece,
        }}
        onClose={close}
      />
    </QueryClientProvider>,
  );
  try {
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "تسجيل المشكلة" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
    expect(
      await screen.findByText(/أدخل سبب المشكلة المطلوب/u),
    ).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("سبب المشكلة (مطلوب)"), {
      target: { value: "x".repeat(4001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
    expect(
      await screen.findByText(/اختصر السبب ثم أعد المحاولة/u),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("سبب المشكلة (مطلوب)")).toHaveValue(
      "x".repeat(4001),
    );
    expect(report).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("سبب المشكلة (مطلوب)"), {
      target: { value: "عيب في الجلد" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
    await waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    expect(report).toHaveBeenCalledWith(
      p03Ids.order,
      p03Ids.piece,
      expect.objectContaining({ expectedVersion: 2, reason: "عيب في الجلد" }),
    );
    expect(screen.getByLabelText("سبب المشكلة (مطلوب)")).toHaveValue(
      "عيب في الجلد",
    );
    expect(close).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    orderRead.mockRestore();
    report.mockRestore();
    client.clear();
    beginAuthSessionEpoch("confirmed-ending");
  }
});
