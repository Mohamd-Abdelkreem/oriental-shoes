import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authUserDataSchema,
  createCustomerBodySchema,
  createDraftBodySchema,
  salesCommandDataSchema,
  type SalesCommandData,
} from "@template/contracts";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  useCustomerList,
  customerKeys,
} from "@/features/customers/hooks/customers.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  ApiContractError,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";
import { readOperationalScope } from "@/shared/query/operational-scope";
import {
  SalesSynchronizationError,
  type SalesCommandIntent,
} from "../model/sales-command-state";
import {
  synchronizeSalesCommand,
  useSalesCommand,
  useSalesCommandReceipt,
} from "./sales-commands.hooks";

const mocks = vi.hoisted(() => ({
  customer: { create: vi.fn(), update: vi.fn(), get: vi.fn(), list: vi.fn() },
  draft: { create: vi.fn(), save: vi.fn(), get: vi.fn() },
  receipt: vi.fn(),
}));
vi.mock("@/features/customers/api/customers.api", () => ({
  customersApi: mocks.customer,
}));
vi.mock("../api/drafts.api", () => ({ draftsApi: mocks.draft }));
vi.mock("../api/sales-commands.api", () => ({
  salesCommandsApi: { get: mocks.receipt },
}));
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  commandId = "33333333-3333-4333-8333-333333333333",
  piece = "44444444-4444-4444-8444-444444444444",
  instant = "2026-11-05T00:00:00.000Z";
const client = createQueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const session = () =>
  authUserDataSchema.parse({
    user: {
      id: actor,
      fullName: "Sales",
      email: "sales@example.test",
      phone: null,
      role: "USER",
      status: "ACTIVE",
      department: "SALES",
      staffApprovedAt: instant,
      emailVerifiedAt: instant,
      accessVersion: 1,
      createdAt: instant,
      updatedAt: instant,
    },
  });
const scope = () => {
  const value = readOperationalScope(client);
  if (value === null) throw new Error("Expected scope");
  return value;
};
const command = (
  operation: SalesCommandIntent["operation"],
): SalesCommandIntent => {
  const customer = createCustomerBodySchema.parse({
      commandId,
      customer: { name: "Saved", phone: "0500000001" },
    }),
    draft = createDraftBodySchema.parse({
      commandId,
      draft: { type: "SHOP", pieces: [{ id: piece }] },
    });
  switch (operation) {
    case "CREATE_CUSTOMER":
      return { operation, body: customer };
    case "UPDATE_CUSTOMER":
      return {
        operation,
        customerId: id,
        body: { commandId, expectedVersion: 1, patch: { notes: null } },
      };
    case "CREATE_DRAFT":
      return { operation, body: draft };
    case "SAVE_DRAFT":
      return {
        operation,
        draftId: id,
        body: { commandId, expectedVersion: 1, draft: draft.draft },
      };
  }
};
const saved = (intent: SalesCommandIntent): SalesCommandData => {
  const update =
      intent.operation === "UPDATE_CUSTOMER" ||
      intent.operation === "SAVE_DRAFT",
    version = update ? 2 : 1;
  const receipt = {
    commandId,
    operation: intent.operation,
    resourceId: id,
    actor: { id: actor, fullName: "Sales", role: "USER", department: "SALES" },
    beforeVersion: update ? 1 : null,
    afterVersion: version,
    occurredAt: instant,
  };
  if (
    intent.operation === "CREATE_CUSTOMER" ||
    intent.operation === "UPDATE_CUSTOMER"
  )
    return salesCommandDataSchema.parse({
      kind: "customer",
      receipt,
      replayed: false,
      savedCustomer: {
        id,
        name: "Saved",
        phone: "+966500000001",
        email: null,
        address: null,
        notes: null,
        version,
        createdAt: instant,
        updatedAt: instant,
      },
    });
  const capture = intent.body.draft;
  const { customerId: _customerId, ...fields } = capture;
  return salesCommandDataSchema.parse({
    kind: "draft",
    receipt,
    replayed: false,
    savedDraft: {
      ...fields,
      id,
      version,
      status: "DRAFT",
      owner: { id: actor, fullName: "Sales" },
      customer: null,
      pieces: capture.pieces.map((row) => ({
        ...row,
        position: 1,
        quantity: 1,
      })),
      createdAt: instant,
      updatedAt: instant,
      pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
      submission: { available: false, reason: "P03_NOT_READY" },
    },
  });
};
const currentCustomer = (result: SalesCommandData) => {
  if (result.kind !== "customer") throw new Error("Expected customer");
  return {
    customer: { ...result.savedCustomer, version: 3 },
    draftCount: 0,
    latestDraftAt: null,
    latestMeasurement: null,
    submittedHistory: {
      availability: "not_available",
      reason: "P03_NOT_IMPLEMENTED",
    },
  };
};
const respond = (result: SalesCommandData) => {
  if (result.kind === "customer") {
    mocks.customer.create.mockResolvedValue(result);
    mocks.customer.update.mockResolvedValue(result);
    mocks.customer.get.mockResolvedValue(currentCustomer(result));
  } else {
    mocks.draft.create.mockResolvedValue(result);
    mocks.draft.save.mockResolvedValue(result);
    mocks.draft.get.mockResolvedValue({
      draft: { ...result.savedDraft, version: 3 },
    });
  }
};
const failure = (status: number) =>
  new AxiosError("failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: "failed",
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
beforeEach(() => {
  vi.resetAllMocks();
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("synthetic", epoch, actor);
  client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
  client.setDefaultOptions({
    queries: { retry: false, staleTime: 30000 },
    mutations: { retry: false },
  });
});
afterEach(() => {
  client.clear();
  beginAuthSessionEpoch("confirmed-ending");
});
it.each([
  "CREATE_CUSTOMER",
  "UPDATE_CUSTOMER",
  "CREATE_DRAFT",
  "SAVE_DRAFT",
] as const)(
  "dispatches %s and synchronizes the current resource without replacing it with an older receipt",
  async (operation) => {
    const intent = command(operation),
      result = saved(intent);
    respond(result);
    const view = renderHook(() => useSalesCommand(), { wrapper });
    await act(async () => {
      expect(
        await view.result.current.mutateAsync({
          scope: scope(),
          command: intent,
        }),
      ).toEqual(result);
    });
    const cached = client.getQueryData(
      result.kind === "customer"
        ? customerKeys.detail(scope(), id)
        : [...customerKeys.root(scope()), "drafts", "detail", id],
    );
    expect(cached).toMatchObject(
      result.kind === "customer"
        ? { customer: { version: 3 } }
        : { draft: { version: 3 } },
    );
    if (operation === "CREATE_CUSTOMER")
      expect(mocks.customer.create).toHaveBeenCalledWith(intent.body);
    if (operation === "UPDATE_CUSTOMER")
      expect(mocks.customer.update).toHaveBeenCalledWith(id, intent.body);
    if (operation === "CREATE_DRAFT")
      expect(mocks.draft.create).toHaveBeenCalledWith(intent.body);
    if (operation === "SAVE_DRAFT")
      expect(mocks.draft.save).toHaveBeenCalledWith(id, intent.body);
    view.unmount();
  },
);
it("keeps the confirmed receipt on refresh failure and retries synchronization with reads only", async () => {
  const intent = command("CREATE_CUSTOMER"),
    result = saved(intent),
    captured = scope();
  respond(result);
  mocks.customer.get.mockRejectedValueOnce(failure(503));
  const view = renderHook(() => useSalesCommand(), { wrapper });
  let rejected: unknown;
  await act(async () => {
    try {
      await view.result.current.mutateAsync({
        scope: captured,
        command: intent,
      });
    } catch (error: unknown) {
      rejected = error;
    }
  });
  expect(rejected).toBeInstanceOf(SalesSynchronizationError);
  expect(rejected).toMatchObject({ result });
  await synchronizeSalesCommand(client, captured, result);
  expect(mocks.customer.create).toHaveBeenCalledTimes(1);
  expect(mocks.customer.get).toHaveBeenCalledTimes(2);
  view.unmount();
});
it("surfaces failed active-query invalidation as confirmed-but-unsynchronized", async () => {
  const intent = command("CREATE_CUSTOMER"),
    result = saved(intent);
  respond(result);
  const pagination = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  mocks.customer.list
    .mockResolvedValueOnce({ customers: [], totalCustomers: 0, pagination })
    .mockRejectedValue(failure(503));
  const view = renderHook(
    () => ({ command: useSalesCommand(), list: useCustomerList({}) }),
    { wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.list.isSuccess).toBe(true);
  });
  await act(async () => {
    await expect(
      view.result.current.command.mutateAsync({
        scope: scope(),
        command: intent,
      }),
    ).rejects.toMatchObject({ result });
  });
  expect(mocks.customer.create).toHaveBeenCalledTimes(1);
  view.unmount();
});
it.each(["actor", "target", "kind", "command"] as const)(
  "rejects a wrong %s receipt before any saved publication",
  async (mismatch) => {
    const intent = command("UPDATE_CUSTOMER"),
      result = saved(intent);
    respond(result);
    const other = "55555555-5555-4555-8555-555555555555";
    const corrupted =
      mismatch === "actor"
        ? {
            ...result,
            receipt: {
              ...result.receipt,
              actor: { ...result.receipt.actor, id: other },
            },
          }
        : mismatch === "target" && result.kind === "customer"
          ? {
              ...result,
              receipt: { ...result.receipt, resourceId: other },
              savedCustomer: { ...result.savedCustomer, id: other },
            }
          : mismatch === "kind"
            ? saved(command("SAVE_DRAFT"))
            : { ...result, receipt: { ...result.receipt, commandId: other } };
    mocks.customer.update.mockResolvedValue(corrupted);
    const view = renderHook(() => useSalesCommand(), { wrapper });
    await act(async () => {
      await expect(
        view.result.current.mutateAsync({ scope: scope(), command: intent }),
      ).rejects.toBeInstanceOf(ApiContractError);
    });
    expect(mocks.customer.get).not.toHaveBeenCalled();
    expect(
      client.getQueryData(customerKeys.detail(scope(), id)),
    ).toBeUndefined();
    view.unmount();
  },
);
it("does not automatically repeat an unknown command and manual observation remains disabled until requested", async () => {
  const intent = command("CREATE_CUSTOMER"),
    result = saved(intent),
    variables = { scope: scope(), command: intent };
  respond(result);
  mocks.customer.create.mockRejectedValueOnce(new AxiosError("lost reply"));
  mocks.receipt
    .mockRejectedValueOnce(failure(404))
    .mockResolvedValueOnce({ ...result, replayed: true });
  const view = renderHook(
    () => ({
      write: useSalesCommand(),
      receipt: useSalesCommandReceipt(commandId),
    }),
    { wrapper },
  );
  expect(mocks.receipt).not.toHaveBeenCalled();
  await act(async () => {
    await expect(
      view.result.current.write.mutateAsync(variables),
    ).rejects.toBeInstanceOf(AxiosError);
  });
  expect(mocks.customer.create).toHaveBeenCalledTimes(1);
  await act(async () => {
    expect((await view.result.current.receipt.refetch()).isError).toBe(true);
  });
  expect(view.result.current.receipt.data).toBeUndefined();
  await act(async () => {
    await view.result.current.receipt.refetch();
  });
  await waitFor(() => {
    expect(view.result.current.receipt.data).toMatchObject({
      receipt: { commandId },
      replayed: true,
    });
  });
  await synchronizeSalesCommand(client, variables.scope, result);
  expect(mocks.customer.create).toHaveBeenCalledTimes(1);
  view.unmount();
});
it("suppresses publication when the scope changes during the confirmed-write readback", async () => {
  const intent = command("CREATE_CUSTOMER"),
    result = saved(intent),
    captured = scope();
  respond(result);
  let resolve: (value: unknown) => void = () => {
    throw new Error("Uninitialized response");
  };
  mocks.customer.get.mockReturnValue(
    new Promise<unknown>((done) => {
      resolve = done;
    }),
  );
  const view = renderHook(() => useSalesCommand(), { wrapper });
  let settled: Promise<unknown> = Promise.resolve();
  act(() => {
    settled = view.result.current
      .mutateAsync({ scope: captured, command: intent })
      .catch((error: unknown) => error);
  });
  await waitFor(() => {
    expect(mocks.customer.get).toHaveBeenCalledTimes(1);
  });
  act(() => {
    const epoch = beginAuthSessionEpoch("credential-login");
    acceptCredentialLogin("new", epoch, actor);
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session());
  });
  resolve(currentCustomer(result));
  let outcome: unknown;
  await act(async () => {
    outcome = await settled;
  });
  expect(outcome).toBeInstanceOf(SalesSynchronizationError);
  expect(outcome).toMatchObject({ result });
  expect(
    client.getQueryData(customerKeys.detail(captured, id)),
  ).toBeUndefined();
  view.unmount();
});

it.each([403, 409])(
  "retains the same intent after an unknown attempt followed by rejection %i",
  async (status) => {
    const intent = command("CREATE_CUSTOMER"),
      variables = { scope: scope(), command: intent };
    mocks.customer.create
      .mockRejectedValueOnce(new AxiosError("lost reply"))
      .mockRejectedValueOnce(failure(status));
    const view = renderHook(() => useSalesCommand(), { wrapper });
    await act(async () => {
      await expect(
        view.result.current.mutateAsync(variables),
      ).rejects.toBeInstanceOf(AxiosError);
    });
    await act(async () => {
      await expect(
        view.result.current.mutateAsync(variables),
      ).rejects.toBeInstanceOf(AxiosError);
    });
    await waitFor(() => {
      expect(view.result.current.variables).toEqual(variables);
    });
    expect(mocks.customer.create.mock.calls).toEqual([
      [intent.body],
      [intent.body],
    ]);
    expect(mocks.customer.get).not.toHaveBeenCalled();
    view.unmount();
  },
);
it("wraps missing readback publication without repeating a confirmed write", async () => {
  const intent = command("CREATE_CUSTOMER"),
    result = saved(intent);
  respond(result);
  mocks.customer.get.mockResolvedValueOnce({});
  const view = renderHook(() => useSalesCommand(), { wrapper });
  await act(async () => {
    await expect(
      view.result.current.mutateAsync({ scope: scope(), command: intent }),
    ).rejects.toMatchObject({ result });
  });
  expect(mocks.customer.create).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(customerKeys.detail(scope(), id))).toBeUndefined();
  view.unmount();
});
