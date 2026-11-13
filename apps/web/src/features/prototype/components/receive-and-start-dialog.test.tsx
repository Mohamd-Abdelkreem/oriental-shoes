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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QualityReadAvailability } from "@/features/manufacturing/model/quality-view.model";
import { ReceiveAndStartDialog } from "./receive-and-start-dialog";

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
it("awaits one exact continuation, retains recovery meaning after close, and restores focus", async () => {
  const client = new QueryClient(),
    trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
      release = resolve;
    }),
    confirm = vi.fn(() => pending),
    close = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <ReceiveAndStartDialog
        source="quality"
        readAvailability="ready"
        readFailure={null}
        onReadRetry={() => Promise.resolve()}
        operation="CONTINUE"
        rows={rows()}
        open
        onClose={close}
        pending={false}
        failure={null}
        reviewRequired={false}
        onReview={() => Promise.resolve()}
        onConfirm={confirm}
      />
    </QueryClientProvider>,
  );
  try {
    const button = screen.getByRole("button", { name: /تأكيد متابعة/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/الإغلاق لا يلغي/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/بداية سابقة غير مسجلة/)).toHaveLength(5);
  } finally {
    await act(async () => {
      release();
      await pending;
    });
    view.unmount();
    client.clear();
    expect(trigger).toHaveFocus();
    trigger.remove();
  }
});

it("handles a rejected review callback without enabling confirmation or leaking raw errors", async () => {
  const client = new QueryClient(),
    review = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("Raw internal failure")),
    confirm = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const view = render(
    <QueryClientProvider client={client}>
      <ReceiveAndStartDialog
        source="quality"
        readAvailability="ready"
        readFailure={null}
        onReadRetry={() => Promise.resolve()}
        operation="CONTINUE"
        rows={rows()}
        open
        onClose={vi.fn()}
        pending={false}
        failure={null}
        reviewRequired
        onReview={review}
        onConfirm={confirm}
      />
    </QueryClientProvider>,
  );
  try {
    fireEvent.click(
      screen.getByRole("button", { name: "تحديث ومراجعة القطع المحددة" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Raw internal failure",
    );
    expect(screen.getByRole("button", { name: /تأكيد متابعة/ })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    client.clear();
  }
});

it.each(["RECEIVE_AND_START", "CONTINUE"] as const)(
  "fences an open %s confirmation until a successful read retry without pretending a write is pending",
  async (operation) => {
    const client = new QueryClient(),
      confirm = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const selected = rows().map((row) =>
      operation === "CONTINUE"
        ? row
        : {
            ...row,
            piece: { ...row.piece, workState: "INCOMING" as const },
            work: {
              ...row.work,
              visit: null,
              allowedActions: {
                canReceiveAndStart: true,
                canContinue: false,
                canInspect: false,
                canReportIssue: true,
              },
            },
          },
    );
    const formView = (readAvailability: QualityReadAvailability) => (
      <QueryClientProvider client={client}>
        <ReceiveAndStartDialog
          source="quality"
          operation={operation}
          rows={selected}
          open
          onClose={vi.fn()}
          pending={false}
          failure={null}
          reviewRequired={false}
          onReview={() => Promise.resolve()}
          onConfirm={confirm}
          readAvailability={readAvailability}
          readFailure="تعذر تحديث بيانات الجودة. أعد المحاولة قبل التأكيد."
          onReadRetry={retry}
        />
      </QueryClientProvider>
    );
    const view = render(formView("refreshing"));
    try {
      for (const state of ["refreshing", "error"] as const) {
        view.rerender(formView(state));
        const button = screen.getByRole("button", { name: /تأكيد / });
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(confirm).not.toHaveBeenCalled();
        expect(
          screen.queryByText(/جارٍ إرسال الإجراء/),
        ).not.toBeInTheDocument();
      }
      await act(() => {
        const button = screen.getByRole("button", { name: "إعادة المحاولة" });
        fireEvent.click(button);
        fireEvent.click(button);
        return Promise.resolve();
      });
      expect(retry).toHaveBeenCalledTimes(1);
      view.rerender(formView("ready"));
      fireEvent.click(screen.getByRole("button", { name: /تأكيد / }));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledTimes(1);
      });
    } finally {
      view.unmount();
      client.clear();
    }
  },
);
