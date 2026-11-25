import { renderWithToast as render } from "@/test/render-with-toast";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import { createQueryClient } from "@/shared/query/query-client";
import {
  administrationScopeKey,
  readAdministrationOperationalScope,
} from "@/shared/query/operational-scope";
import {
  p08AdminSession,
  p08CorrectionCommandFixture,
  p08DetailFixture,
} from "@/test/p08-fixtures";
import { p03Ids, p03Envelope } from "@/test/p03-fixtures";
import { administrationCommandSessionSchema } from "../model/administration-command-state";
import { AdministrationCommandRecovery } from "./administration-command-recovery";

const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string, options?: unknown) => Promise<unknown>>(),
  post: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: transport,
}));
let client = createQueryClient();
beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p08AdminSession());
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("keeps accessible recovery outside a closed dialog and disables competing controls until current reads complete", async () => {
  const scope = readAdministrationOperationalScope(client);
  if (!scope) throw new Error("Expected admin scope");
  const fixture = p08CorrectionCommandFixture(),
    key = [...administrationScopeKey(scope), "command-session"];
  client.setQueryData(
    key,
    administrationCommandSessionSchema.parse({
      phase: "unknown",
      originScope: scope,
      body: fixture.body,
      failure: {
        message: "Uncertain",
        statusCode: 0,
        code: "NETWORK_ERROR",
        requestId: "",
        fieldErrors: {},
      },
    }),
  );
  let resolve: (value: unknown) => void = () => {
    throw new Error("Not initialized");
  };
  const delayed = new Promise<unknown>((done) => {
    resolve = done;
  });
  transport.get.mockImplementation((path) =>
    path.includes("administration-commands")
      ? delayed
      : Promise.resolve(p03Envelope(p08DetailFixture(2))),
  );
  render(
    <QueryClientProvider client={client}>
      <AdministrationCommandRecovery />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("غير مؤكدة");
  fireEvent.click(
    screen.getByRole("button", { name: "التحقق من النتيجة الأصلية" }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "إعادة نفس الإجراء" }),
    ).toBeDisabled();
  });
  expect(transport.post).not.toHaveBeenCalled();
  act(() => {
    resolve(p03Envelope(fixture.result));
  });
  await waitFor(() => {
    expect(screen.getByText("تم حفظ تصحيح بيانات الطلب")).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(
      screen.queryByLabelText("متابعة نتيجة الإجراء الإداري"),
    ).not.toBeInTheDocument();
  });
  expect(client.getQueryData(key)).toEqual({ phase: "idle" });
});
