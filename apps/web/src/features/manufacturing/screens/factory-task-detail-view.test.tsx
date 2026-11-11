import { StrictMode } from "react";
import type * as ManufacturingTransport from "../api/manufacturing.api";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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

const transport = vi.hoisted(() => ({ order: vi.fn(), command: vi.fn() }));
const route = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
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
      await screen.findByText("تم حفظ الإجراء وتحديث البيانات."),
    ).toBeInTheDocument();
    expect(transport.command).toHaveBeenCalledTimes(1);
    expect(sent.orders).toEqual([
      { orderId: p03Ids.order, expectedVersion: 2, pieceIds: [p03Ids.piece] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "إغلاق التأكيد" }));
    await waitFor(() => {
      expect(
        screen.queryByLabelText("متابعة نتيجة الإجراء"),
      ).not.toBeInTheDocument();
    });
    recovery.unmount();
  },
);
