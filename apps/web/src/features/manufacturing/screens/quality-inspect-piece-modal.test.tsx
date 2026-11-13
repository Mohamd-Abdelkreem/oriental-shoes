import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { qualityOrderDataSchema } from "@template/contracts";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { resolveQualityTargets } from "@/features/manufacturing/model/quality-view.model";
import { QualityInspectPieceModal } from "./quality-inspect-piece-modal";
import { captureQualityInspection } from "../model/quality-selection.model";
import type { QualityInspectionFormValues } from "../model/quality-form.model";

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
it("uses an undecided singleton with no packing inputs and records only an explicit accepted member", async () => {
  const row = rows()[0];
  if (!row) throw new Error("Row required");
  const confirm = vi
    .fn<(values: QualityInspectionFormValues) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <QualityInspectPieceModal
      source="quality"
      readAvailability="ready"
      readFailure={null}
      onReadRetry={() => Promise.resolve()}
      row={row}
      open
      onClose={vi.fn()}
      pending={false}
      failure={null}
      reviewRequired={false}
      onReview={() => Promise.resolve()}
      onConfirm={confirm}
    />,
  );
  expect(screen.queryByLabelText(/عدد الكراتين/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "قبول وتغليف (مطابقة)" }));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  const values = confirm.mock.calls[0]?.[0];
  if (!values) throw new Error("Values required");
  expect(captureQualityInspection([row], values)[0]).toMatchObject({
    packing: null,
    inspectorNote: null,
    decisions: [{ pieceId: row.piece.id, decision: "ACCEPT" }],
  });
});

it("associates an undecided compact result with its group and focuses its choice without submitting", async () => {
  const row = rows()[0];
  if (!row) throw new Error("Row required");
  const confirm =
    vi.fn<(values: QualityInspectionFormValues) => Promise<void>>();
  render(
    <QualityInspectPieceModal
      source="quality"
      readAvailability="ready"
      readFailure={null}
      onReadRetry={() => Promise.resolve()}
      row={row}
      open
      onClose={vi.fn()}
      pending={false}
      failure={null}
      reviewRequired={false}
      onReview={() => Promise.resolve()}
      onConfirm={confirm}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  const group = screen.getByRole("radiogroup", { name: "نتيجة القطعة" });
  await waitFor(() => expect(group).toHaveAttribute("aria-invalid", "true"));
  expect(group).toHaveAccessibleDescription(
    "اختر قبول القطعة أو رفضها قبل التأكيد.",
  );
  expect(
    screen.getByRole("radio", { name: "قبول وتغليف (مطابقة)" }),
  ).toHaveFocus();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.keyDown(group, { key: "End" });
  await waitFor(() =>
    expect(
      screen.getByRole("radio", { name: "رفض وإعادة للتصحيح" }),
    ).toBeChecked(),
  );
  expect(
    screen.getByRole("radio", { name: "رفض وإعادة للتصحيح" }),
  ).toHaveFocus();
});

it("retains an invalid compact rejection draft when accepting and blocks it again on return", async () => {
  const row = rows()[0];
  if (!row) throw new Error("Row required");
  const confirm = vi
    .fn<(values: QualityInspectionFormValues) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <QualityInspectPieceModal
      source="quality"
      readAvailability="ready"
      readFailure={null}
      onReadRetry={() => Promise.resolve()}
      row={row}
      open
      onClose={vi.fn()}
      pending={false}
      failure={null}
      reviewRequired={false}
      onReview={() => Promise.resolve()}
      onConfirm={confirm}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "رفض وإعادة للتصحيح" }));
  fireEvent.change(screen.getByLabelText("القسم المسؤول"), {
    target: { value: "PRODUCTION" },
  });
  fireEvent.change(screen.getByLabelText("سبب الرفض"), {
    target: { value: "r".repeat(4001) },
  });
  fireEvent.change(screen.getByLabelText("تعليمات التصحيح"), {
    target: { value: "Repair" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "قبول وتغليف (مطابقة)" }));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() => {
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  const submitted = confirm.mock.calls[0]?.[0];
  if (!submitted) throw new Error("Submitted draft required");
  expect(captureQualityInspection([row], submitted)[0]).toMatchObject({
    packing: null,
    decisions: [{ pieceId: row.piece.id, decision: "ACCEPT" }],
  });
  fireEvent.click(screen.getByRole("radio", { name: "رفض وإعادة للتصحيح" }));
  expect(screen.getByLabelText("سبب الرفض")).toHaveValue("r".repeat(4001));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد نتيجة الفحص" }));
  await waitFor(() =>
    expect(screen.getByLabelText("سبب الرفض")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(confirm).toHaveBeenCalledTimes(1);
});
