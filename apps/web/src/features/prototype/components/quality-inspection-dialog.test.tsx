import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { qualityOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { resolveQualityTargets } from "@/features/manufacturing/model/quality-view.model";
import { QualityInspectPieceModal } from "@/features/manufacturing/screens/quality-inspect-piece-modal";
import type { QualityReadAvailability } from "@/features/manufacturing/model/quality-view.model";
import { QualityInspectionDialog } from "./quality-inspection-dialog";
import { captureQualityInspection } from "@/features/manufacturing/model/quality-selection.model";
import type { QualityInspectionFormValues } from "@/features/manufacturing/model/quality-form.model";

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

const rows = () => {
  const data = qualityDetail();
  return resolveQualityTargets(
    data,
    data.paper.order.pieces.map((piece) => ({
      orderId: data.paper.order.id,
      expectedVersion: data.paper.order.version,
      pieceId: piece.id,
    })),
  );
};
const props = () => ({
  source: "quality" as const,
  readAvailability: "ready" as const,
  readFailure: null,
  onReadRetry: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  rows: rows(),
  open: true,
  onClose: vi.fn(),
  pending: false,
  failure: null,
  reviewRequired: false,
  onReview: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  onConfirm: vi
    .fn<(values: QualityInspectionFormValues) => Promise<void>>()
    .mockResolvedValue(undefined),
});
it("requires explicit per-piece outcomes and maps a mixed subset without count allocation", async () => {
  const p = props();
  render(<QualityInspectionDialog {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
  expect(p.onConfirm).not.toHaveBeenCalled();
  const choices = screen.getAllByLabelText("نتيجة القطعة");
  for (const [i, choice] of choices.entries())
    fireEvent.change(choice, {
      target: { value: i === 1 ? "REJECT" : "ACCEPT" },
    });
  const included = screen.getAllByLabelText("فحص هذه القطعة");
  for (const input of included.slice(3)) fireEvent.click(input);
  fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
    target: { value: "CUTTING" },
  });
  fireEvent.change(screen.getByLabelText("سبب الرفض"), {
    target: { value: "Actual defect" },
  });
  fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
    target: { value: "Actual repair" },
  });
  fireEvent.change(screen.getByLabelText("عدد الكراتين (اختياري)"), {
    target: { value: "  X/2  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
  });
  const values = p.onConfirm.mock.calls[0]?.[0];
  if (!values) throw new Error("Expected submitted values");
  expect(captureQualityInspection(p.rows, values)[0]).toMatchObject({
    packing: { cartonCount: "  X/2  ", cartonNumbers: null },
    decisions: [
      { pieceId: id(1), decision: "ACCEPT" },
      {
        pieceId: id(2),
        decision: "REJECT",
        target: "CUTTING",
        reason: "Actual defect",
        instructions: "Actual repair",
      },
      { pieceId: id(3), decision: "ACCEPT" },
    ],
  });
  expect(screen.getAllByText("ستبقى هذه القطعة دون تغيير")).toHaveLength(2);
});
it("preserves dirty text on refreshed props, blocks oversized text, and requires explicit review after conflict", async () => {
  const p = props(),
    view = render(<QualityInspectionDialog {...p} />),
    note = screen.getByLabelText("ملاحظات فاحص الجودة (اختياري)");
  fireEvent.change(note, { target: { value: "x".repeat(4001) } });
  for (const choice of screen.getAllByLabelText("نتيجة القطعة"))
    fireEvent.change(choice, { target: { value: "ACCEPT" } });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  expect(p.onConfirm).not.toHaveBeenCalled();
  view.rerender(
    <QualityInspectionDialog
      {...p}
      rows={rows()}
      reviewRequired
      failure="تغيرت البيانات"
    />,
  );
  expect(note).toHaveValue("x".repeat(4001));
  expect(
    screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "تحديث ومراجعة جميع القطع" }),
  );
  expect(p.onReview).toHaveBeenCalledTimes(1);
});

it("keeps exact grouped decisions frozen while one confirmation is pending and closing sends nothing else", async () => {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
      release = resolve;
    }),
    p = props();
  p.onConfirm.mockImplementation(() => pending);
  const view = render(<QualityInspectionDialog {...p} />);
  try {
    for (const choice of screen.getAllByLabelText("نتيجة القطعة"))
      fireEvent.change(choice, { target: { value: "ACCEPT" } });
    const button = screen.getByRole("button", { name: "تأكيد نتيجة الفحص" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => {
      expect(p.onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(button).toBeDisabled();
    expect(screen.getAllByLabelText("نتيجة القطعة")[0]).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      release();
      await pending;
    });
    view.unmount();
  }
});

it("associates Arabic target and character errors, focuses the first invalid field and retains its draft", async () => {
  const p = props();
  render(<QualityInspectionDialog {...p} rows={p.rows.slice(0, 1)} />);
  fireEvent.change(screen.getByLabelText("نتيجة القطعة"), {
    target: { value: "REJECT" },
  });
  const target = screen.getByLabelText("القسم المسؤول"),
    reason = screen.getByLabelText("سبب الرفض");
  fireEvent.change(target, { target: { value: "CUTTING" } });
  fireEvent.change(target, { target: { value: "" } });
  fireEvent.change(reason, { target: { value: "defect\u0000" } });
  fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
    target: { value: "Repair" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => expect(target).toHaveAttribute("aria-invalid", "true"));
  await waitFor(() => expect(target).toHaveFocus());
  expect(target).toHaveAccessibleDescription(
    "قسم التصحيح مطلوب؛ اختر القص أو الإنتاج ثم أعد التأكيد.",
  );
  expect(reason).toHaveAttribute("aria-invalid", "true");
  expect(reason).toHaveAccessibleDescription(
    "سبب الرفض يحتوي على أحرف غير مدعومة؛ احذفها ثم أعد التأكيد.",
  );
  expect(reason).toHaveValue("defect\u0000");
  expect(p.onConfirm).not.toHaveBeenCalled();
});

it("retains invalid rejection and packing drafts while submitting only active outcomes", async () => {
  const p = props();
  render(<QualityInspectionDialog {...p} rows={p.rows.slice(0, 2)} />);
  const choices = screen.getAllByLabelText("نتيجة القطعة");
  for (const choice of choices)
    fireEvent.change(choice, { target: { value: "ACCEPT" } });
  fireEvent.change(screen.getByLabelText("عدد الكراتين (اختياري)"), {
    target: { value: "c".repeat(4001) },
  });
  const first = choices[0],
    second = choices[1];
  if (!first || !second) throw new Error("Two controls required");
  fireEvent.change(first, { target: { value: "REJECT" } });
  fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
    target: { value: "CUTTING" },
  });
  fireEvent.change(screen.getByLabelText("سبب الرفض"), {
    target: { value: "r".repeat(4001) },
  });
  fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
    target: { value: "Repair one" },
  });
  fireEvent.change(first, { target: { value: "ACCEPT" } });
  fireEvent.change(screen.getByLabelText("عدد الكراتين (اختياري)"), {
    target: { value: "  Box  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
  });
  const accepted = p.onConfirm.mock.calls[0]?.[0];
  if (!accepted) throw new Error("Accepted draft required");
  expect(
    captureQualityInspection(p.rows.slice(0, 2), accepted)[0]?.decisions,
  ).toEqual([
    { pieceId: id(1), decision: "ACCEPT" },
    { pieceId: id(2), decision: "ACCEPT" },
  ]);
  fireEvent.change(first, { target: { value: "REJECT" } });
  expect(screen.getByLabelText("سبب الرفض")).toHaveValue("r".repeat(4001));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() =>
    expect(screen.getByLabelText("سبب الرفض")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(p.onConfirm).toHaveBeenCalledTimes(1);
  const included = screen.getAllByLabelText("فحص هذه القطعة")[0];
  if (!included) throw new Error("Included control required");
  fireEvent.click(included);
  fireEvent.change(screen.getByLabelText("عدد الكراتين (اختياري)"), {
    target: { value: "c".repeat(4001) },
  });
  fireEvent.change(second, { target: { value: "REJECT" } });
  fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
    target: { value: "PRODUCTION" },
  });
  fireEvent.change(screen.getByLabelText("سبب الرفض"), {
    target: { value: "Second defect" },
  });
  fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
    target: { value: "Repair two" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(p.onConfirm).toHaveBeenCalledTimes(2);
  });
  const rejected = p.onConfirm.mock.calls[1]?.[0];
  if (!rejected) throw new Error("Rejected draft required");
  expect(
    captureQualityInspection(p.rows.slice(0, 2), rejected)[0],
  ).toMatchObject({
    packing: null,
    decisions: [
      { pieceId: id(2), decision: "REJECT", reason: "Second defect" },
    ],
  });
  fireEvent.change(second, { target: { value: "ACCEPT" } });
  expect(screen.getByLabelText("عدد الكراتين (اختياري)")).toHaveValue(
    "c".repeat(4001),
  );
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() =>
    expect(screen.getByLabelText("عدد الكراتين (اختياري)")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(p.onConfirm).toHaveBeenCalledTimes(2);
});

it.each(["grouped", "compact"] as const)(
  "keeps the %s inspection draft editable while read health fences button and form submission",
  async (mode) => {
    const p = props(),
      row = p.rows[0];
    if (!row) throw new Error("One selected piece required");
    const formView = (readAvailability: QualityReadAvailability) => {
      const read = {
        readAvailability,
        readFailure: "تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد.",
      };
      return mode === "compact" ? (
        <QualityInspectPieceModal {...p} {...read} row={row} />
      ) : (
        <QualityInspectionDialog {...p} {...read} rows={[row]} />
      );
    };
    const view = render(formView("ready"));
    if (mode === "compact")
      fireEvent.click(
        screen.getByRole("radio", { name: "قبول وتغليف (مطابقة)" }),
      );
    else
      fireEvent.change(screen.getByLabelText("نتيجة القطعة"), {
        target: { value: "ACCEPT" },
      });
    const note = screen.getByLabelText("ملاحظات فاحص الجودة (اختياري)"),
      form = note.closest("form");
    if (!form) throw new Error("Inspection form required");
    fireEvent.change(note, { target: { value: "Retained exact inspection" } });
    for (const availability of ["refreshing", "error"] as const) {
      view.rerender(formView(availability));
      expect(
        screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }),
      ).toBeDisabled();
      expect(note).toBeEnabled();
      await act(() => {
        fireEvent.submit(form);
        return Promise.resolve();
      });
      expect(p.onConfirm).not.toHaveBeenCalled();
      expect(note).toHaveValue("Retained exact inspection");
      expect(screen.queryByText(/جارٍ إرسال الإجراء/)).not.toBeInTheDocument();
    }
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    expect(retry).toHaveFocus();
    await act(() => {
      fireEvent.click(retry);
      fireEvent.click(retry);
      return Promise.resolve();
    });
    expect(p.onReadRetry).toHaveBeenCalledTimes(1);
    view.rerender(formView("ready"));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
    await waitFor(() => {
      expect(p.onConfirm).toHaveBeenCalledTimes(1);
    });
    const submitted = p.onConfirm.mock.calls[0]?.[0];
    if (!submitted) throw new Error("Submitted inspection required");
    expect(captureQualityInspection([row], submitted)).toEqual([
      {
        orderId: row.order.id,
        expectedVersion: row.order.version,
        inspectorNote: "Retained exact inspection",
        packing: null,
        decisions: [{ pieceId: row.piece.id, decision: "ACCEPT" }],
      },
    ]);
  },
);

it.each(["grouped", "compact"] as const)(
  "describes a rejected %s review callback as a read failure while retaining its exact draft",
  async (mode) => {
    const p = props(),
      row = p.rows[0];
    if (!row) throw new Error("One selected piece required");
    p.onReview.mockRejectedValue(new Error("Raw review transport details"));
    const reviewProps = { ...p, reviewRequired: true };
    if (mode === "compact")
      render(<QualityInspectPieceModal {...reviewProps} row={row} />);
    else render(<QualityInspectionDialog {...reviewProps} rows={[row]} />);
    if (mode === "compact")
      fireEvent.click(
        screen.getByRole("radio", { name: "رفض وإعادة للتصحيح" }),
      );
    else
      fireEvent.change(screen.getByLabelText("نتيجة القطعة"), {
        target: { value: "REJECT" },
      });
    const reason = screen.getByLabelText("سبب الرفض"),
      instructions = screen.getByLabelText("تعليمات التصحيح");
    fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
      target: { value: "PRODUCTION" },
    });
    fireEvent.change(reason, { target: { value: "Actual retained defect" } });
    fireEvent.change(instructions, {
      target: { value: "Actual retained repair" },
    });
    const review = screen.getByRole("button", {
      name: "تحديث ومراجعة جميع القطع",
    });
    fireEvent.click(review);
    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("تعذر مراجعة القطع");
    expect(failure).not.toHaveTextContent("غير مؤكدة");
    expect(failure).not.toHaveTextContent("Raw review transport details");
    expect(failure).toHaveTextContent("حدّث العرض");
    expect(reason).toHaveValue("Actual retained defect");
    expect(instructions).toHaveValue("Actual retained repair");
    expect(screen.getByLabelText("القسم المسؤول")).toHaveValue("PRODUCTION");
    expect(p.onConfirm).not.toHaveBeenCalled();
    expect(review).toBeEnabled();
  },
);
