import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { administrationReportPrintQuerySchema } from "@template/contracts";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import { administrationKeys } from "@/features/administration/hooks/administration.hooks";
import { readAdministrationOperationalScope } from "@/shared/query/operational-scope";
import { p08AdminSession, p08ReportPrintFixture } from "@/test/p08-fixtures";
import { p03Ids, p03Envelope } from "@/test/p03-fixtures";
import { useAdministrationReportPrintController } from "./administration-report-print.hooks";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
const query = administrationReportPrintQuerySchema.parse({});
const key = () => {
  const scope = readAdministrationOperationalScope(client);
  if (!scope) throw new Error("Expected admin scope");
  return administrationKeys.reportPrint(scope, query);
};
function Harness() {
  const {
    paperRef,
    query: reportQuery,
    ...controller
  } = useAdministrationReportPrintController(query);
  return (
    <>
      <button
        disabled={!controller.eligible}
        onClick={() => {
          void controller.prepare();
        }}
      >
        Print
      </button>
      <button onClick={controller.reload}>Reload</button>
      {controller.failure && <p role="alert">{controller.failure}</p>}
      {reportQuery.data !== undefined && (
        <div ref={paperRef} data-testid="paper">
          {reportQuery.data.meta.generatedBy.fullName}
        </div>
      )}
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
  transport.get.mockResolvedValue(p03Envelope(p08ReportPrintFixture()));
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  beginAuthSessionEpoch("confirmed-ending");
});
const view = () => (
  <StrictMode>
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  </StrictMode>
);
it("freshens and prints once under StrictMode, and denies unprepared native menu print", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {
    window.dispatchEvent(new Event("beforeprint"));
    expect(screen.getByTestId("paper")).not.toHaveAttribute("hidden");
    window.dispatchEvent(new Event("afterprint"));
  });
  render(view());
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });
  act(() => {
    window.dispatchEvent(new Event("beforeprint"));
  });
  expect(screen.getByTestId("paper")).toHaveAttribute("hidden");
  act(() => {
    window.dispatchEvent(new Event("afterprint"));
  });
  const before = transport.get.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Print" }));
  await waitFor(() => {
    expect(print).toHaveBeenCalledTimes(1);
  });
  expect(transport.get).toHaveBeenCalledTimes(before + 1);
});
it.each(["removed", "malformed", "invalidated"] as const)(
  "withdraws eligible DOM immediately when exact cache is %s",
  async (change) => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(view());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    });
    act(() => {
      if (change === "removed")
        client.removeQueries({ queryKey: key(), exact: true });
      else if (change === "malformed") {
        const cached = client
          .getQueryCache()
          .find({ queryKey: key(), exact: true });
        if (!cached) throw new Error("Expected active print query");
        cached.setState({ data: { incomplete: true } });
      } else {
        void client.invalidateQueries({
          queryKey: key(),
          exact: true,
          refetchType: "none",
        });
      }
    });
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(screen.queryByTestId("paper")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    expect(print).not.toHaveBeenCalled();
  },
);
it("intercepts keyboard printing and prevents a late response from printing after account change", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
  render(view());
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });
  let resolve: (reply: unknown) => void = () => {
    throw new Error("Not initialized");
  };
  const pending = new Promise<unknown>((done) => {
    resolve = done;
  });
  transport.get.mockReturnValueOnce(pending);
  const before = transport.get.mock.calls.length;
  fireEvent.keyDown(window, { key: "p", ctrlKey: true });
  await waitFor(() => {
    expect(transport.get).toHaveBeenCalledTimes(before + 1);
  });
  act(() => {
    beginAuthSessionEpoch("confirmed-ending");
    client.removeQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
  });
  await act(async () => {
    resolve(p03Envelope(p08ReportPrintFixture()));
    await pending;
  });
  expect(print).not.toHaveBeenCalled();
  expect(screen.queryByTestId("paper")).not.toBeInTheDocument();
});
it("rejects foreign generation actor and incomplete snapshots instead of enabling print", async () => {
  const foreign = p08ReportPrintFixture();
  foreign.meta.generatedBy.id = "80000000-0000-4000-8000-000000000001";
  transport.get.mockResolvedValue(p03Envelope(foreign));
  render(view());
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر التحقق");
  expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
});

it("repairs only a corrupted report cache through an explicit current read", async () => {
  render(view());
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });
  const query = client.getQueryCache().find({ queryKey: key(), exact: true });
  if (!query) throw new Error("Expected active report");
  act(() => {
    query.setState({ data: { malformed: true } });
  });
  expect(screen.queryByTestId("paper")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });
  expect(screen.getByTestId("paper")).toHaveTextContent("Actual administrator");
});
