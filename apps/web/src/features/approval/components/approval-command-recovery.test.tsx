import { renderWithToast as render } from "@/test/render-with-toast";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApprovalCommandRecovery } from "./approval-command-recovery";

const controls = vi.hoisted(() => {
  const state: Record<string, unknown> = { phase: "idle" };
  return {
    state,
    observe: vi.fn(),
    retrySame: vi.fn(),
    synchronize: vi.fn(),
    acknowledge: vi.fn(),
  };
});
vi.mock("../hooks/approval-commands.hooks", () => ({
  useApprovalCommand: () => controls,
}));
it("keeps confirmed refresh recovery separate from unknown replay controls", async () => {
  controls.state = {
    phase: "confirmed",
    syncError: null,
    originScope: { actorId: "actor", accessVersion: 1, epoch: 1 },
    command: { body: { commandId: "command" } },
  };
  controls.synchronize.mockResolvedValue(undefined);
  const view = render(
    <ApprovalCommandRecovery orderId="test-order" capability="APPROVAL" />,
  );
  expect(
    screen.queryByRole("button", { name: "إعادة نفس العملية" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "تحديث العرض" }));
  await waitFor(() => {
    expect(controls.synchronize).toHaveBeenCalledTimes(1);
  });
  controls.state = {
    phase: "unknown",
    originScope: { actorId: "actor", accessVersion: 1, epoch: 1 },
    command: { body: { commandId: "command" } },
    failure: { message: "Safe network failure", requestId: "request-1" },
  };
  view.rerender(
    <ApprovalCommandRecovery orderId="test-order" capability="APPROVAL" />,
  );
  expect(screen.getByText(/request-1/)).toBeInTheDocument();
  controls.observe.mockRejectedValue(new Error("Retained in shared state"));
  fireEvent.click(screen.getByRole("button", { name: "التحقق من النتيجة" }));
  await waitFor(() => {
    expect(controls.observe).toHaveBeenCalledTimes(1);
  });
  controls.state = { phase: "idle" };
  view.rerender(
    <ApprovalCommandRecovery orderId="test-order" capability="APPROVAL" />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
