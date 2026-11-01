import assert from "node:assert/strict";
import { useState, type ReactNode } from "react";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
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
