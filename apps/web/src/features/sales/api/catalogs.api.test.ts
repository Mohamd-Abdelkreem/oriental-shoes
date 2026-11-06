import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { p03Envelope, p03Ids, catalogFixture } from "@/test/p03-fixtures";
import { catalogsApi } from "./catalogs.api";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: mocks,
}));
beforeEach(() => {
  vi.resetAllMocks();
});
it("uses exact catalog and quote boundaries, signals and correlated readiness without client source authority", async () => {
  const signal = new AbortController().signal,
    catalog = catalogFixture();
  mocks.get.mockResolvedValue(p03Envelope(catalog));
  expect(await catalogsApi.get(signal)).toEqual(catalog);
  expect(mocks.get).toHaveBeenCalledWith("/catalogs", { signal });
  const body = {
      requestId: p03Ids.command,
      pieces: [{ id: p03Ids.piece, decoration: null }],
    },
    quote = {
      availability: "unavailable",
      requestId: body.requestId,
      sourceId: null,
      fingerprint: null,
      total: null,
      items: [
        {
          pieceId: p03Ids.piece,
          availability: "unavailable",
          reason: "CATALOG_UNAVAILABLE",
        },
      ],
    };
  mocks.post.mockResolvedValue(p03Envelope(quote));
  expect(await catalogsApi.quote(body, signal)).toEqual(quote);
  expect(mocks.post).toHaveBeenCalledWith("/catalogs/quotes", body, { signal });
  await expect(
    catalogsApi.quote(Object.assign({}, body, { sourceId: p03Ids.source })),
  ).rejects.toThrow();
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("rejects malformed/private catalog or quote payloads and preserves real transport failures", async () => {
  mocks.get.mockResolvedValue(
    p03Envelope({
      availability: "unavailable",
      reason: "CATALOG_NOT_LOADED",
      unitPrice: "0.00",
    }),
  );
  await expect(catalogsApi.get()).rejects.toBeInstanceOf(ApiContractError);
  mocks.post.mockResolvedValue(
    p03Envelope({ availability: "available", total: 0 }),
  );
  await expect(
    catalogsApi.quote({
      requestId: p03Ids.command,
      pieces: [{ id: p03Ids.piece, decoration: null }],
    }),
  ).rejects.toBeInstanceOf(ApiContractError);
  const failure = new Error("network");
  mocks.get.mockRejectedValue(failure);
  await expect(catalogsApi.get()).rejects.toBe(failure);
});
