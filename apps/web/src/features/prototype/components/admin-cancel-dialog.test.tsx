import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { localizedZodResolver } from "@/shared/forms/form";
import { p08DetailFixture } from "@/test/p08-fixtures";
import {
  administrationCancelFormSchema,
  captureAdministrationCancellation,
  type AdministrationCancelForm,
} from "@/features/administration/model/administration-form.model";
import { AdminCancelDialog } from "./admin-cancel-dialog";

it("uses exact eligible identities, derives quantity and awaits confirmation without closing", async () => {
  const detail = p08DetailFixture(),
    first = detail.order.pieces[0];
  if (!first) throw new Error("Expected retained piece");
  const secondId = "80000000-0000-4000-8000-000000000001";
  detail.order.pieces = [
    { ...first, unitPrice: "650.00" },
    { ...first, id: secondId, position: 2, unitPrice: "650.00" },
  ];
  detail.order.counts = { ...detail.order.counts, original: 2, active: 2 };
  detail.order.money = {
    total: "1300.00",
    paidAmount: "1000.00",
    remainingDue: "300.00",
    surplus: "0.00",
  };
  detail.tracking.counts = detail.order.counts;
  detail.tracking.pieces = detail.order.pieces.map((piece) => ({
    pieceId: piece.id,
    stage: piece.stage,
    workState: piece.workState,
    receivedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  }));
  detail.cancellationCandidates = detail.order.pieces.map((piece) => ({
    pieceId: piece.id,
    position: piece.position,
    model: piece.model,
    stage: piece.stage,
    workState: piece.workState,
    receivedAt: null,
    eligible: true,
    denialReason: null,
  }));
  const defaults: AdministrationCancelForm = {
    scope: "QUANTITY",
    itemPieceId: first.id,
    selectedPieceIds: [first.id],
    reason: "",
  };
  const review = captureAdministrationCancellation(detail, defaults),
    confirm = vi.fn<(values: AdministrationCancelForm) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    close = vi.fn();
  function Harness() {
    const form = useForm<AdministrationCancelForm>({
      resolver: localizedZodResolver(administrationCancelFormSchema),
      defaultValues: defaults,
    });
    return (
      <AdminCancelDialog
        open
        onClose={close}
        review={review}
        form={form}
        preparing={false}
        pending={false}
        reviewRequired={false}
        failure={null}
        onReviewCurrent={() => Promise.resolve()}
        onConfirm={confirm}
      />
    );
  }
  render(<Harness />);
  const boxes = screen.getAllByRole("checkbox");
  const firstBox = boxes[0],
    secondBox = boxes[1];
  if (!firstBox || !secondBox)
    throw new Error("Expected two physical-piece choices");
  fireEvent.click(firstBox);
  fireEvent.click(secondBox);
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByText(/الفائض: 350.00/)).toBeInTheDocument();
  const reason = screen.getByRole("textbox", { name: /سبب الإلغاء الإداري/ });
  const invalidReason = "r".repeat(4001);
  fireEvent.change(reason, { target: { value: invalidReason } });
  expect(screen.getByText(/الفائض: 350.00/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تأكيد إلغاء 1 قطعة" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "تأكيد إلغاء 1 قطعة" }));
  await waitFor(() => expect(reason).toHaveAttribute("aria-invalid", "true"));
  expect(reason).toHaveAccessibleDescription(/٤٠٠٠/);
  expect(reason).toHaveFocus();
  expect(reason).toHaveValue(invalidReason);
  expect(screen.getByText(/الإجمالي بعد الإلغاء:/)).toHaveTextContent("650.00");
  expect(screen.getByText(/الإجمالي بعد الإلغاء:/)).toHaveTextContent(
    "1000.00",
  );
  expect(screen.getByText(/القطع المحددة:/)).toHaveTextContent("القطعة 02");
  expect(screen.getByRole("dialog")).not.toHaveTextContent(secondId);
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.change(reason, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد إلغاء 1 قطعة" }));
  await waitFor(() => {
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  expect(confirm.mock.calls[0]?.[0]).toMatchObject({
    selectedPieceIds: [secondId],
    scope: "QUANTITY",
    reason: "",
  });
  expect(close).not.toHaveBeenCalled();
});
