import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CatalogData,
  CatalogQuoteBody,
  CatalogQuoteData,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import { catalogFixture, p03Ids, p03Session } from "@/test/p03-fixtures";
import {
  catalogKeys,
  useCatalog,
  useOrderQuote,
  CatalogSourceChangedError,
} from "./catalogs.hooks";

const mocks = vi.hoisted(() => ({ get: vi.fn(), quote: vi.fn() }));
vi.mock("../api/catalogs.api", () => ({ catalogsApi: mocks }));
const client = createQueryClient(),
  wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
const catalog = catalogFixture();
if (catalog.availability !== "available")
  throw new Error("Expected fixture catalog");
const priced = (body: CatalogQuoteBody): CatalogQuoteData => ({
  availability: "available",
  requestId: body.requestId,
  sourceId: catalog.sourceId,
  fingerprint: "a".repeat(64),
  total: "1800.00",
  items: body.pieces.map((piece) => {
    const entry = catalog.entries.find(
      (entry) =>
        entry.kind === "decoration" && entry.displayValue === piece.decoration,
    );
    if (!entry) throw new Error("Missing fixture decoration");
    return {
      pieceId: piece.id,
      availability: "available",
      decorationEntryId: entry.id,
      decoration: entry.displayValue,
      unitPrice: "1800.00",
    };
  }),
});
const input = {
  sourceId: catalog.sourceId,
  pieces: [{ id: p03Ids.piece, decoration: "زبيري - z" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, p03Ids.actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, p03Session());
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30000 } });
  mocks.get.mockResolvedValue(catalog);
  mocks.quote.mockImplementation((body: CatalogQuoteBody) =>
    Promise.resolve(priced(body)),
  );
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it("publishes parsed source/quote, keeps correlation on refetch and revokes old input on change", async () => {
  const view = renderHook(({ selected }) => useOrderQuote(selected), {
    wrapper,
    initialProps: { selected: input },
  });
  await waitFor(() => {
    expect(view.result.current.isSuccess).toBe(true);
  });
  const initial = view.result.current.data?.requestId;
  await act(async () => {
    await view.result.current.refetch();
  });
  expect(view.result.current.data?.requestId).toBe(initial);
  let resolve!: (quote: CatalogQuoteData) => void;
  mocks.quote.mockImplementationOnce(
    (body: CatalogQuoteBody) =>
      new Promise<CatalogQuoteData>((done) => {
        resolve = () => {
          done(priced(body));
        };
      }),
  );
  view.rerender({
    selected: {
      ...input,
      pieces: [{ id: p03Ids.piece, decoration: "نعام - O" }],
    },
  });
  await waitFor(() => {
    expect(mocks.quote).toHaveBeenCalledTimes(3);
  });
  expect(view.result.current.data).toBeUndefined();
  view.rerender({ selected: input });
  await waitFor(() => {
    expect(view.result.current.data?.items[0]).toMatchObject({
      decoration: "زبيري - z",
    });
  });
  act(() => {
    resolve(priced({ requestId: p03Ids.command, pieces: input.pieces }));
  });
  expect(view.result.current.data?.items[0]).toMatchObject({
    decoration: "زبيري - z",
  });
  view.unmount();
});
it.each(["request", "piece", "reference", "text"] as const)(
  "rejects mismatched %s before publishing amounts",
  async (mismatch) => {
    mocks.quote.mockImplementation((body: CatalogQuoteBody) => {
      const quote = priced(body);
      if (quote.availability !== "available") throw new Error("Expected quote");
      return Promise.resolve({
        ...quote,
        requestId: mismatch === "request" ? p03Ids.actor : quote.requestId,
        items: quote.items.map((item) => ({
          ...item,
          ...(mismatch === "piece" ? { pieceId: p03Ids.actor } : {}),
          ...(mismatch === "reference"
            ? { decorationEntryId: p03Ids.actor }
            : {}),
          ...(mismatch === "text" ? { decoration: "changed" } : {}),
        })),
      });
    });
    const view = renderHook(() => useOrderQuote(input), { wrapper });
    await waitFor(() => {
      expect(view.result.current.isError).toBe(true);
    });
    expect(view.result.current.data).toBeUndefined();
    view.unmount();
  },
);
it("refreshes exact catalog key once for a changed source and retains no old amounts", async () => {
  const current = readOperationalScope(client);
  if (!current) throw new Error("Expected scope");
  mocks.quote.mockImplementation((body: CatalogQuoteBody) =>
    Promise.resolve({ ...priced(body), sourceId: p03Ids.actor }),
  );
  const view = renderHook(() => useOrderQuote(input), { wrapper });
  await waitFor(() => {
    expect(view.result.current.error).toBeInstanceOf(CatalogSourceChangedError);
  });
  expect(view.result.current.data).toBeUndefined();
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.quote).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(catalogKeys.active(current))).toEqual(catalog);
  view.unmount();
});
it("prevents an obsolete account read from publishing and keeps unavailable readiness distinct from failure", async () => {
  let resolve!: (value: CatalogData) => void;
  mocks.get.mockReturnValue(
    new Promise<CatalogData>((done) => {
      resolve = done;
    }),
  );
  const view = renderHook(() => useCatalog(), { wrapper });
  await waitFor(() => {
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  act(() => {
    beginAuthSessionEpoch("confirmed-ending");
    resolve(catalog);
  });
  await waitFor(() => {
    expect(view.result.current.data).toBeUndefined();
  });
  view.unmount();
});
