import { renderWithToast as render } from "@/test/render-with-toast";
import { manufacturingCommandBodySchema } from "@template/contracts";
import type * as ManufacturingTransport from "../api/manufacturing.api";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import { CuttingWorkspace } from "./cutting-workspace";
import { ProductionWorkspace } from "./production-workspace";

const transport = vi.hoisted(() => ({ order: vi.fn(), command: vi.fn() }));
const route = vi.hoisted(() => ({ department: "CUTTING", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: route.push }),

  usePathname: () =>
    `/${route.department === "CUTTING" ? "cutting" : "production"}/tasks/22222222-2222-4222-8222-222222222222`,
  useSearchParams: () =>
    new URLSearchParams({ pieceId: "33333333-3333-4333-8333-333333333333" }),
}));
vi.mock("../api/manufacturing.api", async (original) => ({
  ...(await original<typeof ManufacturingTransport>()),
  manufacturingApi: transport,
}));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it.each(["CUTTING", "PRODUCTION"] as const)(
  "completes and transfers the exact %s task without leaving its detail",
  async (department) => {
    route.department = department;
    client.setQueryData(
      AUTH_SESSION_QUERY_KEY,
      factorySessionFixture(department),
    );
    let detail = manufacturingDetailFixture(2, department, true);
    transport.order.mockImplementation(() => Promise.resolve(detail));
    transport.command.mockImplementation(
      (_department: string, body: { commandId: string }) => {
        const result = factoryWorkFixture(
          department,
          "COMPLETE_TRANSFER",
          2,
          body.commandId,
        );
        detail = manufacturingDetailFixture(3, department, true);
        return Promise.resolve(result);
      },
    );
    render(
      <QueryClientProvider client={client}>
        {department === "CUTTING" ? (
          <CuttingWorkspace />
        ) : (
          <ProductionWorkspace />
        )}
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "إتمام وتحويل" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "تأكيد إتمام وتحويل العمل",
    });
    expect(screen.getByRole("dialog")).toHaveTextContent(
      department === "CUTTING" ? "الإنتاج والإصلاح" : "الجودة والتغليف",
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(transport.command).toHaveBeenCalledTimes(1);
    });
    expect(transport.command).toHaveBeenCalledWith(
      department,
      expect.objectContaining({
        operation: "COMPLETE_TRANSFER",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const nextDepartment = department === "CUTTING" ? "الإنتاج" : "الجودة";
    expect(
      screen.getByText(`تم إتمام وتحويل القطعة المحددة إلى ${nextDepartment}`),
    ).toBeVisible();
    expect(route.push).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  },
);

it("keeps the original saved result in recovery when its dialog closes during sending", async () => {
  route.department = "CUTTING";
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
  let detail = manufacturingDetailFixture(2, "CUTTING", true),
    resolve!: (result: ReturnType<typeof factoryWorkFixture>) => void;
  transport.order.mockImplementation(() => Promise.resolve(detail));
  transport.command.mockReturnValue(
    new Promise<ReturnType<typeof factoryWorkFixture>>((yes) => {
      resolve = yes;
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <CuttingWorkspace />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "إتمام وتحويل" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "تأكيد إتمام وتحويل العمل" }),
  );
  await waitFor(() => {
    expect(transport.command).toHaveBeenCalledTimes(1);
  });
  const body = manufacturingCommandBodySchema.parse(
    transport.command.mock.calls[0]?.[1],
  );
  fireEvent.click(screen.getByRole("button", { name: "إغلاق النافذة" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  detail = manufacturingDetailFixture(3, "CUTTING", true);
  resolve(
    factoryWorkFixture("CUTTING", "COMPLETE_TRANSFER", 2, body.commandId),
  );
  expect(await screen.findByText(/تم إتمام وتحويل/u)).toBeInTheDocument();
  expect(
    screen.queryByLabelText("متابعة نتيجة الإجراء"),
  ).not.toBeInTheDocument();
  expect(transport.command).toHaveBeenCalledTimes(1);
  expect(route.push).not.toHaveBeenCalled();
});

it.each(["CUTTING", "PRODUCTION"] as const)(
  "lets colleague B continue exact P1 in %s while retaining A and leaving P2 out of the command",
  async (department) => {
    route.department = department;
    const session = factorySessionFixture(department);
    session.user.id = p03Ids.customer;
    session.user.fullName = "Colleague B";
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("synthetic-colleague", epoch, p03Ids.customer);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session);
    let detail = manufacturingDetailFixture(2, department, true);
    const piece = detail.paper.order.pieces[0],
      work = detail.work[0];
    if (!piece || !work || !work.visit)
      throw new Error("Missing original work");
    work.allowedActions.canContinue = true;
    const companion = structuredClone(piece);
    companion.id = p03Ids.source;
    companion.position = 2;
    const companionWork = structuredClone(work);
    companionWork.pieceId = companion.id;
    if (!companionWork.visit) throw new Error("Missing companion visit");
    companionWork.visit.id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    companionWork.visit.pieceId = companion.id;
    detail.paper.order.pieces.push(companion);
    detail.work.push(companionWork);
    detail.paper.order.counts = {
      ...detail.paper.order.counts,
      original: 2,
      active: 2,
    };
    const companionBefore = structuredClone(companionWork);
    transport.order.mockImplementation(() => Promise.resolve(detail));
    transport.command.mockImplementation(
      (_department: string, body: { commandId: string }) => {
        const saved = factoryWorkFixture(
          department,
          "CONTINUE",
          2,
          body.commandId,
        );
        saved.receipt.actor = {
          id: p03Ids.customer,
          fullName: "Colleague B",
          role: "USER",
          department,
        };
        detail = {
          ...detail,
          paper: {
            ...detail.paper,
            order: { ...detail.paper.order, version: 3 },
          },
          work: detail.work.map((context) =>
            context.pieceId !== p03Ids.piece
              ? context
              : {
                  ...context,
                  allowedActions: {
                    ...context.allowedActions,
                    canContinue: false,
                  },
                  lastAction: {
                    eventId: p03Ids.command,
                    commandId: body.commandId,
                    operation: "CONTINUE",
                    actor: saved.receipt.actor,
                    occurredAt: saved.receipt.occurredAt,
                  },
                },
          ),
        };
        return Promise.resolve(saved);
      },
    );
    render(
      <QueryClientProvider client={client}>
        {department === "CUTTING" ? (
          <CuttingWorkspace />
        ) : (
          <ProductionWorkspace />
        )}
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "متابعة العمل" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "تأكيد متابعة العمل" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(transport.command).toHaveBeenCalledWith(
      department,
      expect.objectContaining({
        operation: "CONTINUE",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
          },
        ],
      }),
    );
    expect(screen.getByText(/بدأ العمل: Original worker/u)).toBeInTheDocument();
    expect(screen.getByText(/آخر منفذ فعلي: Colleague B/u)).toBeInTheDocument();
    expect(
      detail.work.find((context) => context.pieceId === p03Ids.source),
    ).toEqual(companionBefore);
    expect(
      screen.queryByRole("button", { name: "متابعة العمل" }),
    ).not.toBeInTheDocument();
  },
);
