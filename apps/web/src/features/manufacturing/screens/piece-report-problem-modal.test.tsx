import { renderWithToast as render } from "@/test/render-with-toast";
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
  renderHook,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  MvpStoreProvider,
  useMvpStore,
} from "@/features/prototype/state/mvp-provider";
import { storageKey } from "@/features/prototype/state/mvp-selectors";
import { PieceReportProblemModal } from "./piece-report-problem-modal";

import {
  qualityOrderDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
  authUserDataSchema,
} from "@template/contracts";
import { apiClient } from "@/services/api/api-client";
import { p03Session, p03Instant, p03Envelope } from "@/test/p03-fixtures";
import { resolveQualityTargets } from "../model/quality-view.model";

import { QualityCommandRecovery } from "../components/quality-command-recovery";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cutting/incoming",
  useRouter: () => ({ push: vi.fn() }),
}));
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

it.each(["incoming", "in-progress"])(
  "reports three exact cross-order Quality pieces in one recoverable POST from %s",
  async (mode) => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
    const client = createQueryClient();
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      authUserDataSchema.parse({
        user: { ...p03Session().user, department: "QUALITY" },
      }),
    );
    const data = qualityDetail(),
      all = resolveQualityTargets(
        data,
        data.paper.order.pieces.map((piece) => ({
          orderId: data.paper.order.id,
          expectedVersion: data.paper.order.version,
          pieceId: piece.id,
        })),
      ),
      first = all[0],
      second = all[1],
      third = all[2];
    if (!first || !second || !third) throw new Error("Three rows required");
    const selected = [
      first,
      second,
      {
        ...third,
        order: { ...third.order, id: p03Ids.customer },
        target: { ...third.target, orderId: p03Ids.customer },
      },
    ].map((row) =>
      mode === "incoming"
        ? {
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
          }
        : row,
    );
    const post = vi
        .spyOn(apiClient, "post")
        .mockImplementation((_path, raw) => {
          const input = qualityCommandBodySchema.parse(raw);
          if (input.operation !== "REPORT_ISSUES")
            throw new Error("Report required");
          return Promise.resolve(
            p03Envelope(
              qualityCommandDataSchema.parse({
                kind: "quality-command",
                replayed: false,
                receipt: {
                  commandId: input.commandId,
                  operation: input.operation,
                  actor: {
                    id: p03Ids.actor,
                    fullName: "Actual worker",
                    role: "USER",
                    department: "QUALITY",
                  },
                  occurredAt: p03Instant,
                },
                outcome: {
                  orders: input.orders.map((order, i) => ({
                    orderId: order.orderId,
                    eventId: id(100 + i),
                    beforeVersion: order.expectedVersion,
                    afterVersion: order.expectedVersion + order.pieceIds.length,
                    packingGroupId: null,
                    pieces: order.pieceIds.map((pieceId, j) => ({
                      pieceId,
                      visitId: null,
                      decision: null,
                      stage: "QUALITY",
                      workState: "BLOCKED",
                      correctionId: null,
                      issueId: id(200 + i * 10 + j),
                    })),
                  })),
                },
              }),
            ),
          );
        }),
      close = vi.fn(),
      view = render(
        <QueryClientProvider client={client}>
          <PieceReportProblemModal
            source="quality"
            readAvailability="ready"
            readFailure={null}
            onReadRetry={() => Promise.resolve()}
            rows={selected}
            onClose={close}
          />
        </QueryClientProvider>,
      );
    try {
      fireEvent.change(screen.getByLabelText("سبب المشكلة (مطلوب)"), {
        target: { value: "Actual common reason" },
      });
      fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
      await waitFor(() => {
        expect(close).toHaveBeenCalledTimes(1);
      });
      expect(post).toHaveBeenCalledTimes(1);
      const input = qualityCommandBodySchema.parse(post.mock.calls[0]?.[1]);
      expect(input).toMatchObject({
        operation: "REPORT_ISSUES",
        reason: "Actual common reason",
        notes: null,
      });
      expect(
        input.orders
          .flatMap((order) => ("pieceIds" in order ? order.pieceIds : []))
          .toSorted(),
      ).toEqual(selected.map((row) => row.piece.id).toSorted());
    } finally {
      view.unmount();
      client.clear();
      post.mockRestore();
      beginAuthSessionEpoch("confirmed-ending");
    }
  },
);
it.each(["resolved", "rejected"] as const)(
  "retains uncertain report feedback through a %s read retry, form close and account loss",
  async (retryOutcome) => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
    const client = createQueryClient();
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      authUserDataSchema.parse({
        user: { ...p03Session().user, department: "QUALITY" },
      }),
    );
    const data = qualityDetail(),
      rows = resolveQualityTargets(
        data,
        data.paper.order.pieces.map((piece) => ({
          orderId: data.paper.order.id,
          expectedVersion: data.paper.order.version,
          pieceId: piece.id,
        })),
      ),
      post = vi
        .spyOn(apiClient, "post")
        .mockRejectedValue(new Error("Owned network loss"));
    const reportView = (readAvailability: "ready" | "error") => (
      <QueryClientProvider client={client}>
        <PieceReportProblemModal
          source="quality"
          readAvailability={readAvailability}
          readFailure={
            readAvailability === "error"
              ? "تعذر تحديث المهمة. أعد المحاولة."
              : null
          }
          onReadRetry={() =>
            retryOutcome === "resolved"
              ? Promise.resolve()
              : Promise.reject(new Error("Raw read retry transport details"))
          }
          rows={rows}
          onClose={vi.fn()}
        />
        <QualityCommandRecovery />
      </QueryClientProvider>
    );
    const view = render(reportView("ready"));
    try {
      fireEvent.change(screen.getByLabelText("سبب المشكلة (مطلوب)"), {
        target: { value: "Actual reason" },
      });
      fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "إعادة نفس الإجراء" }),
        ).toBeInTheDocument();
      });
      const body = qualityCommandBodySchema.parse(post.mock.calls[0]?.[1]);
      view.rerender(reportView("error"));
      const dialog = screen.getByRole("dialog");
      await act(() => {
        fireEvent.click(
          within(dialog).getByRole("button", { name: "إعادة المحاولة" }),
        );
        return Promise.resolve();
      });
      view.rerender(reportView("ready"));
      expect(within(dialog).getByRole("alert")).toHaveTextContent("غير مؤكدة");
      expect(screen.getByLabelText("سبب المشكلة (مطلوب)")).toHaveValue(
        "Actual reason",
      );
      const recovery = screen.getByLabelText("متابعة نتيجة الإجراء");
      expect(recovery).toHaveTextContent("نتيجة الإجراء غير مؤكدة");
      if (body.operation !== "REPORT_ISSUES")
        throw new Error("Exact report required");
      for (const order of body.orders) {
        expect(recovery).not.toHaveTextContent(order.orderId);
        for (const pieceId of order.pieceIds)
          expect(recovery).not.toHaveTextContent(pieceId);
      }
      expect(dialog).not.toHaveTextContent("Raw read retry transport details");
      expect(post).toHaveBeenCalledTimes(1);
      view.rerender(
        <QueryClientProvider client={client}>
          <QualityCommandRecovery />
        </QueryClientProvider>,
      );
      expect(
        screen.getByRole("button", { name: "إعادة نفس الإجراء" }),
      ).toBeInTheDocument();
      client.setQueryData(AUTH_SESSION_QUERY_KEY, null);
      await waitFor(() => {
        expect(
          screen.queryByLabelText("متابعة نتيجة الإجراء"),
        ).not.toBeInTheDocument();
      });
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      client.clear();
      post.mockRestore();
      beginAuthSessionEpoch("confirmed-ending");
    }
  },
);

it.each([
  ["reason", "", "سبب المشكلة (مطلوب)", "سبب المشكلة مطلوب"],
  ["reason", "   ", "سبب المشكلة (مطلوب)", "سبب المشكلة مطلوب"],
  [
    "reason",
    "x".repeat(4001),
    "سبب المشكلة (مطلوب)",
    "سبب المشكلة بحد أقصى ٤٠٠٠",
  ],
  [
    "notes",
    "x".repeat(4001),
    "ملاحظات إضافية (اختيارية)",
    "ملاحظات إضافية بحد أقصى ٤٠٠٠",
  ],
] as const)(
  "keeps invalid Quality %s local, Arabic, associated and focused",
  async (field, draft, label, message) => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
    const client = createQueryClient();
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      authUserDataSchema.parse({
        user: { ...p03Session().user, department: "QUALITY" },
      }),
    );
    const data = qualityDetail(),
      piece = data.paper.order.pieces[0];
    if (!piece) throw new Error("Piece required");
    const rows = resolveQualityTargets(data, [
      {
        orderId: data.paper.order.id,
        expectedVersion: data.paper.order.version,
        pieceId: piece.id,
      },
    ]);
    const post = vi
        .spyOn(apiClient, "post")
        .mockRejectedValue(new Error("No invalid POST permitted")),
      close = vi.fn();
    const view = render(
      <QueryClientProvider client={client}>
        <PieceReportProblemModal
          source="quality"
          readAvailability="ready"
          readFailure={null}
          onReadRetry={() => Promise.resolve()}
          rows={rows}
          onClose={close}
        />
      </QueryClientProvider>,
    );
    try {
      if (field === "notes")
        fireEvent.change(screen.getByLabelText("سبب المشكلة (مطلوب)"), {
          target: { value: "Actual defect" },
        });
      const control = screen.getByLabelText(label);
      fireEvent.change(control, { target: { value: draft } });
      fireEvent.click(screen.getByRole("button", { name: "تسجيل المشكلة" }));
      await waitFor(() =>
        expect(control).toHaveAttribute("aria-invalid", "true"),
      );
      expect(control).toHaveAccessibleDescription(
        expect.stringContaining(message),
      );
      expect(control).toHaveAccessibleDescription(
        expect.stringContaining("أعد التأكيد"),
      );
      await waitFor(() => expect(control).toHaveFocus());
      expect(control).toHaveValue(draft);
      expect(post).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      client.clear();
      post.mockRestore();
      beginAuthSessionEpoch("confirmed-ending");
    }
  },
);
