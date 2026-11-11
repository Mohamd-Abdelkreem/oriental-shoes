import type * as ManufacturingTransport from "../api/manufacturing.api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  getApiError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import {
  readManufacturingOperationalScope,
  manufacturingScopeKey,
} from "@/shared/query/operational-scope";
import { p03Ids } from "@/test/p03-fixtures";
import {
  factorySessionFixture,
  factoryWorkFixture,
} from "../model/manufacturing.fixture";
import { ManufacturingCommandRecovery } from "./manufacturing-command-recovery";

const transport = vi.hoisted(() => ({ observeWork: vi.fn() }));
vi.mock("../api/manufacturing.api", async (original) => ({
  ...(await original<typeof ManufacturingTransport>()),
  manufacturingApi: transport,
}));
const client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, factorySessionFixture("CUTTING"));
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("keeps a closed-form unknown result visible and observes it without another write", async () => {
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Missing scope");
  client.setQueryData([...manufacturingScopeKey(scope), "command-session"], {
    phase: "unknown",
    originScope: scope,
    intent: {
      kind: "work",
      department: "CUTTING",
      body: {
        commandId: p03Ids.command,
        operation: "RECEIVE_AND_START",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
          },
        ],
      },
    },
    failure: getApiError(new Error("private diagnostics")),
  });
  transport.observeWork.mockResolvedValue(
    factoryWorkFixture("CUTTING", "RECEIVE_AND_START"),
  );
  render(
    <QueryClientProvider client={client}>
      <ManufacturingCommandRecovery department="CUTTING" />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("متابعة نتيجة الإجراء")).toHaveTextContent(
    "القسم الأصلي: القص",
  );
  expect(screen.queryByText("private diagnostics")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "التحقق من النتيجة" }));
  await waitFor(() =>
    expect(
      screen.getByText("تم حفظ الإجراء وتحديث البيانات."),
    ).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "إغلاق التأكيد" }));
  await waitFor(() =>
    expect(
      screen.queryByText("تم حفظ الإجراء وتحديث البيانات."),
    ).not.toBeInTheDocument(),
  );
});

it.each(["pending", "confirmed", "synchronized"] as const)(
  "renders the actual %s state and its appropriate recovery",
  async (phase) => {
    const scope = readManufacturingOperationalScope(client, "CUTTING");
    if (!scope) throw new Error("Missing scope");
    const context = {
      originScope: scope,
      intent: {
        kind: "work",
        department: "CUTTING",
        body: {
          commandId: p03Ids.command,
          operation: "RECEIVE_AND_START",
          orders: [
            {
              orderId: p03Ids.order,
              expectedVersion: 2,
              pieceIds: [p03Ids.piece],
            },
          ],
        },
      },
    };
    const result = {
      kind: "work",
      data: factoryWorkFixture("CUTTING", "RECEIVE_AND_START"),
    };
    client.setQueryData(
      [...manufacturingScopeKey(scope), "command-session"],
      phase === "pending"
        ? { ...context, phase }
        : {
            ...context,
            phase,
            result,
            ...(phase === "confirmed"
              ? { syncError: getApiError(new Error("refresh failed")) }
              : {}),
          },
    );
    render(
      <QueryClientProvider client={client}>
        <ManufacturingCommandRecovery department="CUTTING" />
      </QueryClientProvider>,
    );
    if (phase === "pending") {
      expect(screen.getByText(/جارٍ إرسال الإجراء/u)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "إعادة نفس الإجراء" }),
      ).not.toBeInTheDocument();
    }
    if (phase === "confirmed") {
      expect(
        screen.getByText(/تم حفظ الإجراء، لكن تعذر تحديث العرض/u),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "تحديث البيانات المحفوظة" }),
      );
      expect(
        await screen.findByText("تم حفظ الإجراء وتحديث البيانات."),
      ).toBeInTheDocument();
    }
    if (phase === "synchronized") {
      fireEvent.click(screen.getByRole("button", { name: "إغلاق التأكيد" }));
      await waitFor(() =>
        expect(
          screen.queryByLabelText("متابعة نتيجة الإجراء"),
        ).not.toBeInTheDocument(),
      );
    }
  },
);

it("shows confirmed work as refreshing until synchronization actually fails", () => {
  const scope = readManufacturingOperationalScope(client, "CUTTING");
  if (!scope) throw new Error("Current scope missing");
  client.setQueryData([...manufacturingScopeKey(scope), "command-session"], {
    phase: "confirmed",
    originScope: scope,
    intent: {
      kind: "work",
      department: "CUTTING",
      body: {
        commandId: p03Ids.command,
        operation: "RECEIVE_AND_START",
        orders: [
          {
            orderId: p03Ids.order,
            expectedVersion: 2,
            pieceIds: [p03Ids.piece],
          },
        ],
      },
    },
    result: {
      kind: "work",
      data: factoryWorkFixture("CUTTING", "RECEIVE_AND_START"),
    },
  });
  render(
    <QueryClientProvider client={client}>
      <ManufacturingCommandRecovery department="CUTTING" />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("متابعة نتيجة الإجراء")).toHaveTextContent(
    "جارٍ تحديث البيانات",
  );
  expect(screen.queryByText(/تعذر تحديث العرض/u)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "تحديث البيانات المحفوظة" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إعادة نفس الإجراء" }),
  ).not.toBeInTheDocument();
});
