import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { localizedZodResolver } from "@/shared/forms/form";
import { p08DetailFixture } from "@/test/p08-fixtures";
import {
  administrationCorrectionFormSchema,
  makeAdministrationCorrectionDefaults,
  type AdministrationCorrectionForm,
} from "@/features/administration/model/administration-form.model";
import { AdminReopenDialog } from "./admin-reopen-dialog";

it("edits only allowed fields, requires a reason and awaits explicit Save without closing", async () => {
  const detail = p08DetailFixture(),
    confirm = vi.fn<(values: AdministrationCorrectionForm) => Promise<void>>(
      () => Promise.resolve(),
    ),
    close = vi.fn();
  function Harness() {
    const form = useForm<AdministrationCorrectionForm>({
      resolver: localizedZodResolver(administrationCorrectionFormSchema),
      defaultValues: makeAdministrationCorrectionDefaults(
        detail.correction.effective,
      ),
    });
    return (
      <AdminReopenDialog
        open
        onClose={close}
        review={{
          operation: "ADMIN_CORRECT",
          orderId: detail.order.id,
          expectedVersion: 1,
          baseline: detail.correction.effective,
        }}
        form={form}
        preparing={false}
        pending={false}
        reviewRequired={false}
        failure={null}
        onReviewCurrent={() => Promise.resolve()}
        onConfirm={confirm}
        context={{
          businessNumber: detail.order.businessNumber,
          statusLabel: "مسلّم",
          createdAt: detail.order.createdAt,
          activePieces: 1,
          receivedPieces: 1,
        }}
      />
    );
  }
  render(<Harness />);
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "حفظ التصحيح" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "أدخل سبب التصحيح",
  );
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: /سبب التصحيح/ }), {
    target: { value: "Confirmed correction" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /عنوان التسليم:/ }), {
    target: { value: "Corrected address" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ التصحيح" }));
  await waitFor(() => {
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  expect(confirm.mock.calls[0]?.[0]).toMatchObject({
    customerAddress: "Corrected address",
    reason: "Confirmed correction",
  });
  expect(close).not.toHaveBeenCalled();
  expect(
    screen.queryByText("تأكيد إعادة فتح الأمر إدارياً"),
  ).not.toBeInTheDocument();
});
