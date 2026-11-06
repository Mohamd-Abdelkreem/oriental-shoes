import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { draftCaptureSchema } from "@template/contracts";
import { draftsApi } from "./drafts.api";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/services/api/api-client", async (original) => ({
  ...(await original<typeof Transport>()),
  apiClient: mocks,
}));
const id = "11111111-1111-4111-8111-111111111111";
const instant = "2026-11-05T00:00:00.000Z";
const envelope = (data: unknown) => ({
  data: {
    success: true,
    statusCode: 200,
    message: "OK",
    data,
    requestId: "test-request",
    timestamp: instant,
    path: "/api/v1/test",
  },
});
const pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
beforeEach(() => {
  vi.resetAllMocks();
});
const capture = draftCaptureSchema.parse({ type: "SHOP", pieces: [{ id }] });
const { customerId: _customerId, ...fields } = capture;
const draft = {
  ...fields,
  id,
  version: 1,
  status: "DRAFT",
  owner: { id, fullName: "Sales" },
  customer: null,
  pieces: capture.pieces.map((piece) => ({
    ...piece,
    position: 1,
    quantity: 1,
  })),
  createdAt: instant,
  updatedAt: instant,
  pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
  submission: { available: false, reason: "P03_NOT_READY" },
};
it("uses exact bounded read paths and signals with real response parsing", async () => {
  const signal = new AbortController().signal;
  mocks.get
    .mockResolvedValueOnce(
      envelope({ drafts: [], pagination, totalDrafts: 0, totalPieces: 0 }),
    )
    .mockResolvedValueOnce(envelope({ draft }))
    .mockResolvedValue(envelope({ changes: [], pagination }));
  await draftsApi.list({ page: 1 }, signal);
  expect((await draftsApi.get(id, signal)).draft.paidAmount).toBeNull();
  await draftsApi.changes(id, { page: 1 }, signal);
  await draftsApi.activity({ page: 1 }, signal);
  expect(mocks.get.mock.calls).toEqual([
    ["/sales-drafts", { params: { page: 1 }, signal }],
    [`/sales-drafts/${id}`, { signal }],
    [`/sales-drafts/${id}/changes`, { params: { page: 1 }, signal }],
    ["/sales-drafts/changes", { params: { page: 1 }, signal }],
  ]);
});
it("sends one supplied command and preserves saved image/replay fields", async () => {
  const receipt = {
    commandId: id,
    operation: "CREATE_DRAFT",
    resourceId: id,
    actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
    beforeVersion: null,
    afterVersion: 1,
    occurredAt: instant,
  };
  const result = { kind: "draft", receipt, savedDraft: draft, replayed: true };
  mocks.post.mockResolvedValue(envelope(result));
  const create = { commandId: id, draft: capture };
  expect(await draftsApi.create(create)).toEqual(result);
  expect(mocks.post).toHaveBeenCalledWith("/sales-drafts", create);
  const save = { commandId: id, expectedVersion: 1, draft: capture };
  mocks.put.mockResolvedValue(
    envelope({
      ...result,
      savedDraft: { ...draft, version: 2 },
      receipt: {
        ...receipt,
        operation: "SAVE_DRAFT",
        beforeVersion: 1,
        afterVersion: 2,
      },
    }),
  );
  expect((await draftsApi.save(id, save)).savedDraft.version).toBe(2);
  expect(mocks.put).toHaveBeenCalledWith(`/sales-drafts/${id}`, save);
});
it.each([
  { draft: { ...draft, price: 0 } },
  { draft: { ...draft, paidAmount: 12 } },
  { savedDraft: draft },
  { draft: { ...draft, pieces: [] } },
])("rejects invalid aggregate outputs", async (data) => {
  mocks.get.mockResolvedValue(envelope(data));
  await expect(draftsApi.get(id)).rejects.toBeInstanceOf(ApiContractError);
});
it("preserves missing/denied/conflict failures", async () => {
  const failure = new Error("404");
  mocks.get.mockRejectedValue(failure);
  await expect(draftsApi.get(id)).rejects.toBe(failure);
});
