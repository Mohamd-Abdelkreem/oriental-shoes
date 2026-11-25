import { renderWithToast as render } from "@/test/render-with-toast";
import { StrictMode } from "react";
import type * as ManufacturingTransport from "../api/manufacturing.api";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  factoryWorkFixture,
} from "../model/manufacturing.fixture";
import { ManufacturingCommandRecovery } from "../components/manufacturing-command-recovery";
import {
  manufacturingCommandBodySchema,
  type ManufacturingCommandBody,
  type ManufacturingDepartment,
} from "@template/contracts";
import { FactoryTaskDetailView } from "./factory-task-detail-view";

import {
  qualityOrderDataSchema,
  authUserDataSchema,
  qualityCommandBodySchema,
  qualityCommandDataSchema,
} from "@template/contracts";
import { apiClient } from "@/services/api/api-client";
import { p03Session, p03Envelope, p03Instant } from "@/test/p03-fixtures";
import { QualityCommandRecovery } from "../components/quality-command-recovery";

const transport = vi.hoisted(() => ({ order: vi.fn(), command: vi.fn() }));
const route = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => ({ push: vi.fn() }),

  useSearchParams: () => new URLSearchParams(route.params),
}));
vi.mock("../api/manufacturing.api", async (original) => ({
  ...(await original<typeof ManufacturingTransport>()),
  manufacturingApi: transport,
}));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  route.params = "";
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  transport.order.mockResolvedValue(manufacturingDetailFixture());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <FactoryTaskDetailView
        source="persisted"
        department="CUTTING"
        orderId={p03Ids.order}
      />
    </QueryClientProvider>,
  );
it("requires explicit exact selection, preserving legacy piece and real visit links without fallback", async () => {
  const view = mount();
  await screen.findByRole("heading", { name: "اختر قطعة لعرض المهمة" });
  expect(
    screen.queryByRole("button", { name: "استلام وبدء العمل" }),
  ).not.toBeInTheDocument();
  route.params = `itemId=${p03Ids.piece}`;
  view.rerender(
    <QueryClientProvider client={client}>
      <FactoryTaskDetailView
        source="persisted"
        department="CUTTING"
        orderId={p03Ids.order}
      />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "استلام وبدء العمل" }),
  ).toBeInTheDocument();
  route.params = `pieceId=${p03Ids.actor}`;
  act(() => {
    view.rerender(
      <QueryClientProvider client={client}>
        <FactoryTaskDetailView
          source="persisted"
          department="CUTTING"
          orderId={p03Ids.order}
        />
      </QueryClientProvider>,
    );
  });
  expect(
    screen.queryByRole("button", { name: "استلام وبدء العمل" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("اختيار قطعة المهمة");
});

it.each(["CUTTING", "PRODUCTION"] as const)(
  "keeps %s recovery after the sending task unmounts with its confirmation open (P05-C02)",
  async (department) => {
    route.params = `pieceId=${p03Ids.piece}`;
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      factorySessionFixture(department),
    );
    transport.order.mockResolvedValue(
      manufacturingDetailFixture(2, department),
    );
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.command.mockImplementation(
      (requested: ManufacturingDepartment, body: ManufacturingCommandBody) =>
        pending.then(() =>
          factoryWorkFixture(requested, body.operation, 2, body.commandId),
        ),
    );
    const view = render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <FactoryTaskDetailView
            source="persisted"
            department={department}
            orderId={p03Ids.order}
          />
        </QueryClientProvider>
      </StrictMode>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "استلام وبدء العمل" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "تأكيد استلام وبدء العمل" }),
    );
    await waitFor(() => {
      expect(transport.command).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const sent = manufacturingCommandBodySchema.parse(
      transport.command.mock.calls[0]?.[1],
    );
    view.unmount();
    const recovery = render(
      <QueryClientProvider client={client}>
        <ManufacturingCommandRecovery department={department} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("متابعة نتيجة الإجراء")).toHaveTextContent(
      "جارٍ إرسال الإجراء",
    );
    transport.order.mockResolvedValue(
      manufacturingDetailFixture(3, department, true),
    );
    await act(async () => {
      release();
      await pending;
    });
    expect(
      await screen.findByText(/تم استلام وبدء العمل/u),
    ).toBeInTheDocument();
    expect(transport.command).toHaveBeenCalledTimes(1);
    expect(sent.orders).toEqual([
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ]);
    await waitFor(() => {
      expect(
        screen.queryByLabelText("متابعة نتيجة الإجراء"),
      ).not.toBeInTheDocument();
    });
    recovery.unmount();
  },
);
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

const qualitySession = () => {
  client.setQueryData(
    AUTH_SESSION_QUERY_KEY,
    authUserDataSchema.parse({
      user: { ...p03Session().user, department: "QUALITY" },
    }),
  );
};
it("shows the Quality picker, rejects empty/foreign aliases, and reaches the explicit singleton inspection form", async () => {
  qualitySession();
  const get = vi
    .spyOn(apiClient, "get")
    .mockResolvedValue(p03Envelope(qualityDetail()));
  const view = render(
    <QueryClientProvider client={client}>
      <FactoryTaskDetailView source="quality" orderId={p03Ids.order} />
    </QueryClientProvider>,
  );
  try {
    await screen.findByText("اختر قطعة لعرض المهمة");
    route.params = "pieceId=";
    view.rerender(
      <QueryClientProvider client={client}>
        <FactoryTaskDetailView source="quality" orderId={p03Ids.order} />
      </QueryClientProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "تسجيل نتيجة الفحص" }),
    ).not.toBeInTheDocument();
    route.params = `pieceId=${id(1)}`;
    view.rerender(
      <QueryClientProvider client={client}>
        <FactoryTaskDetailView source="quality" orderId={p03Ids.order} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "تسجيل نتيجة الفحص" }));
    await screen.findByRole("dialog");
    expect(
      screen.getByRole("radio", { name: "قبول وتغليف (مطابقة)" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText(/عدد الكراتين/)).not.toBeInTheDocument();
  } finally {
    view.unmount();
    get.mockRestore();
  }
});
it("leaves the Quality destination recovery notice after its pending task confirmation unmounts", async () => {
  qualitySession();
  route.params = `pieceId=${id(1)}`;
  const incoming = qualityDetail();
  incoming.paper.order.pieces = incoming.paper.order.pieces.map((piece) => ({
    ...piece,
    workState: "INCOMING",
  }));
  incoming.work = incoming.work.map((work) => ({
    ...work,
    visit: null,
    allowedActions: {
      canReceiveAndStart: true,
      canContinue: false,
      canInspect: false,
      canReportIssue: true,
    },
  }));
  const get = vi
    .spyOn(apiClient, "get")
    .mockResolvedValue(p03Envelope(incoming));
  let release: (value: unknown) => void = () => undefined;
  const gate = new Promise<unknown>((resolve) => {
      release = resolve;
    }),
    post = vi.spyOn(apiClient, "post").mockImplementation(() => gate);
  const view = render(
    <QueryClientProvider client={client}>
      <StrictMode>
        <FactoryTaskDetailView source="quality" orderId={p03Ids.order} />
      </StrictMode>
    </QueryClientProvider>,
  );
  let destination: ReturnType<typeof render> | null = null;
  try {
    fireEvent.click(
      await screen.findByRole("button", { name: "استلام وبدء الفحص" }),
    );
    await screen.findByRole("dialog");
    fireEvent.click(
      screen.getByRole("button", { name: "تأكيد استلام وبدء الفحص" }),
    );
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });
    const input = qualityCommandBodySchema.parse(post.mock.calls[0]?.[1]);
    if (input.operation !== "RECEIVE_AND_START")
      throw new Error("Start required");
    view.unmount();
    destination = render(
      <QueryClientProvider client={client}>
        <QualityCommandRecovery />
      </QueryClientProvider>,
    );
    const fresh = qualityDetail();
    fresh.paper.order.version = 3;
    get.mockResolvedValue(p03Envelope(fresh));
    const result = qualityCommandDataSchema.parse({
      kind: "quality-command",
      replayed: false,
      receipt: {
        commandId: input.commandId,
        operation: input.operation,
        actor: {
          id: p03Ids.actor,
          fullName: "Actual quality worker",
          role: "USER",
          department: "QUALITY",
        },
        occurredAt: p03Instant,
      },
      outcome: {
        orders: input.orders.map((order) => ({
          orderId: order.orderId,
          eventId: id(50),
          beforeVersion: 2,
          afterVersion: 3,
          packingGroupId: null,
          pieces: order.pieceIds.map((pieceId) => ({
            pieceId,
            visitId: id(11),
            decision: null,
            stage: "QUALITY",
            workState: "IN_PROGRESS",
            correctionId: null,
            issueId: null,
          })),
        })),
      },
    });
    await act(async () => {
      release(p03Envelope(result));
      await gate;
    });
    await screen.findByText(/تم استلام وبدء فحص/u);
    expect(
      screen.queryByLabelText("متابعة نتيجة الإجراء"),
    ).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    release(p03Envelope({}));
    await gate;
    view.unmount();
    destination?.unmount();
    post.mockRestore();
    get.mockRestore();
  }
});

it("fences the open Quality report during cached refresh failure and resumes its exact draft after read retry", async () => {
  qualitySession();
  const detail = qualityDetail(),
    piece = detail.paper.order.pieces[0];
  if (!piece) throw new Error("Piece required");
  route.params = `pieceId=${piece.id}`;
  const get = vi.spyOn(apiClient, "get").mockResolvedValue(p03Envelope(detail)),
    post = vi
      .spyOn(apiClient, "post")
      .mockRejectedValue(new Error("Owned write response lost"));
  const view = render(
    <QueryClientProvider client={client}>
      <FactoryTaskDetailView source="quality" orderId={p03Ids.order} />
    </QueryClientProvider>,
  );
  let rejectRead: (reason: Error) => void = () => {};
  const gate = new Promise<unknown>((_resolve, reject) => {
    rejectRead = reject;
  });
  let refresh: Promise<void> | undefined;
  let restoreUuid: (() => void) | undefined;
  try {
    const inspect = await screen.findByRole("button", {
      name: "تسجيل نتيجة الفحص",
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل مشكلة" }));
    const reason = await screen.findByLabelText("سبب المشكلة (مطلوب)");
    const dialog = screen.getByRole("dialog"),
      submit = within(dialog).getByRole("button", { name: "تسجيل المشكلة" }),
      form = reason.closest("form");
    if (!form) throw new Error("Report form required");
    const uuid = vi.spyOn(crypto, "randomUUID");
    restoreUuid = () => {
      uuid.mockRestore();
    };
    fireEvent.change(reason, { target: { value: "Retained dirty report" } });
    get.mockImplementation(() => gate);
    act(() => {
      refresh = client.refetchQueries({ queryKey: ["p06"], type: "active" });
    });
    expect(await screen.findByText("جارٍ تحديث المهمة…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(inspect).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(reason).toBeEnabled();
    await act(() => {
      fireEvent.submit(form);
      return Promise.resolve();
    });
    expect(post).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(reason).toHaveValue("Retained dirty report");
    await act(async () => {
      rejectRead(new Error("Transient read failure"));
      await refresh;
    });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "تحديث المهمة",
    );
    expect(inspect).toBeDisabled();
    expect(submit).toBeDisabled();
    await act(() => {
      fireEvent.submit(form);
      return Promise.resolve();
    });
    expect(uuid).not.toHaveBeenCalled();
    expect(reason).toHaveValue("Retained dirty report");
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeDefined();
    get.mockResolvedValue(p03Envelope(detail));
    const retry = within(dialog).getByRole("button", {
      name: "إعادة المحاولة",
    });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(inspect).toBeEnabled());
    expect(dialog).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(reason).toHaveValue("Retained dirty report");
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1);
    });
    expect(
      qualityCommandBodySchema.parse(post.mock.calls[0]?.[1]),
    ).toMatchObject({
      operation: "REPORT_ISSUES",
      reason: "Retained dirty report",
      notes: null,
      orders: [
        {
          orderId: detail.paper.order.id,
          expectedVersion: detail.paper.order.version,
          pieceIds: [piece.id],
        },
      ],
    });
    expect(uuid).toHaveBeenCalledTimes(1);
  } finally {
    rejectRead(new Error("Owned cleanup"));
    await refresh;
    view.unmount();
    get.mockRestore();
    post.mockRestore();
    restoreUuid?.();
  }
});
