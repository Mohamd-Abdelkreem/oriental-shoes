import { beforeEach, expect, it, vi } from "vitest";
import type * as Transport from "@/services/api/api-client";
import { ApiContractError } from "@/services/api/api-client";
import { salesCommandsApi } from "./sales-commands.api";

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
beforeEach(() => {
  vi.resetAllMocks();
});
it("forwards only the actor-private command selector and signal", async () => {
  mocks.get.mockResolvedValue(envelope({ kind: "wrong" }));
  const signal = new AbortController().signal;
  await expect(salesCommandsApi.get(id, signal)).rejects.toBeInstanceOf(
    ApiContractError,
  );
  expect(mocks.get).toHaveBeenCalledWith(`/sales-commands/${id}`, { signal });
});
it("does not convert missing receipts into an empty successful outcome", async () => {
  const failure = new Error("404");
  mocks.get.mockRejectedValue(failure);
  await expect(salesCommandsApi.get(id)).rejects.toBe(failure);
});

it("accepts a validated immutable customer receipt rather than inventing current data", async () => {
  const result = {
    kind: "customer",
    savedCustomer: {
      id,
      name: "Saved",
      phone: "+966500000001",
      email: null,
      address: null,
      notes: null,
      version: 1,
      createdAt: instant,
      updatedAt: instant,
    },
    replayed: true,
    receipt: {
      commandId: id,
      resourceId: id,
      operation: "CREATE_CUSTOMER",
      actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
      beforeVersion: null,
      afterVersion: 1,
      occurredAt: instant,
    },
  };
  mocks.get.mockResolvedValue(envelope(result));
  expect(await salesCommandsApi.get(id)).toEqual(result);
});
