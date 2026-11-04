import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffCommandData, StaffUserData } from "@template/contracts";

import type * as ApiClientModule from "@/services/api/api-client";

import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/hooks/auth.hooks";
import {
  acceptCredentialLogin,
  beginAuthSessionEpoch,
  getAuthSessionEpoch,
} from "@/services/api/api-client";
import { createQueryClient } from "@/shared/query/query-client";

import {
  staffKeys,
  StaffSynchronizationError,
  useStaff,
  useStaffCommand,
  useStaffDecisions,
  useStaffList,
  type StaffCommandVariables,
  type StaffListOptions,
} from "./staff.hooks";

const staffApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  decisions: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  changeDepartment: vi.fn(),
}));

vi.mock("@/features/administration/api/staff.api", () => ({
  staffApi: staffApiMocks,
}));

const usersApiMocks = vi.hoisted(() => ({ getMe: vi.fn() }));

vi.mock("@/features/users/api/users.api", () => ({
  usersApi: usersApiMocks,
}));

const transportMocks = vi.hoisted(() => ({
  onSubjectCall: undefined as undefined | (() => void),
}));

vi.mock("@/services/api/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    assertAuthSessionSubject: (
      subjectId: string,
      expectedEpoch: number,
    ): void => {
      const action = transportMocks.onSubjectCall;
      transportMocks.onSubjectCall = undefined;
      if (action !== undefined) {
        action();
      }
      actual.assertAuthSessionSubject(subjectId, expectedEpoch);
    },
  };
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TARGET_ID = "33333333-3333-4333-8333-333333333333";

const LIST_OPTIONS: StaffListOptions = {
  scope: "all",
  search: "",
  page: 1,
  limit: 25,
};

const safeUser = (
  id: string,
  accessVersion: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id,
  fullName: "Staff Member",
  email: `${id}@example.com`,
  phone: "+201000000000",
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-02T00:00:00.000Z",
  accessVersion,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  ...overrides,
});

const adminAccount = (id: string = ADMIN_ID) => ({
  user: safeUser(id, 1, {
    role: "ADMIN",
    status: "ACTIVE",
    department: null,
    staffApprovedAt: null,
  }),
});

const listData = (pendingCount = 2) => ({
  staff: [safeUser(TARGET_ID, 1)],
  pagination: {
    page: 1,
    limit: 25,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  pendingCount,
});

const detailData = (
  accessVersion: number,
  overrides: Readonly<Record<string, unknown>> = {},
): StaffUserData => ({
  staff: safeUser(
    TARGET_ID,
    accessVersion,
    overrides,
  ) as StaffUserData["staff"],
});

const commandReceipt = (
  accessVersion: number,
  overrides: Readonly<Record<string, unknown>> = {},
): StaffCommandData => ({
  staff: safeUser(TARGET_ID, accessVersion) as StaffCommandData["staff"],
  decision: null,
  replayed: false,
  ...overrides,
});

const approvalVariables = (
  userId: string = TARGET_ID,
  expectedAccessVersion = 1,
): StaffCommandVariables => ({
  operation: "APPROVE",
  userId,
  body: {
    commandId: "44444444-4444-4444-8444-444444444444",
    expectedAccessVersion,
    department: "SALES",
  },
});

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const clients: QueryClient[] = [];

const createClient = (): QueryClient => {
  const client = createQueryClient();
  clients.push(client);
  return client;
};

const wrapperFor = (client: QueryClient) => {
  const StaffQueryWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return StaffQueryWrapper;
};

const openSession = (subjectId: string): number => {
  const epoch = beginAuthSessionEpoch("credential-login");
  acceptCredentialLogin("session-access-token", epoch, subjectId);
  return epoch;
};

/**
 * Flushes the microtask queue until the condition holds. It never waits on a
 * timer, so the ordering stays deterministic.
 */
const flushUntil = async (
  condition: () => boolean,
  limit = 200,
): Promise<boolean> => {
  for (let index = 0; index < limit; index += 1) {
    if (condition()) return true;
    await Promise.resolve();
  }
  return condition();
};

const sessionQueryOf = (client: QueryClient) =>
  client.getQueryCache().find({
    queryKey: AUTH_SESSION_QUERY_KEY,
    exact: true,
  });

const sessionStatusOf = (client: QueryClient) =>
  sessionQueryOf(client)?.state.status;

const runCommand = async (
  mutateAsync: (variables: StaffCommandVariables) => Promise<StaffCommandData>,
  variables: StaffCommandVariables,
): Promise<{ receipt: StaffCommandData | undefined; failure: unknown }> => {
  let receipt: StaffCommandData | undefined;
  let failure: unknown;
  await act(async () => {
    try {
      receipt = await mutateAsync(variables);
    } catch (error: unknown) {
      failure = error;
    }
  });
  return { receipt, failure };
};

beforeEach(() => {
  staffApiMocks.list.mockReset();
  staffApiMocks.get.mockReset();
  staffApiMocks.decisions.mockReset();
  staffApiMocks.approve.mockReset();
  staffApiMocks.reject.mockReset();
  staffApiMocks.suspend.mockReset();
  staffApiMocks.reactivate.mockReset();
  staffApiMocks.changeDepartment.mockReset();
  usersApiMocks.getMe.mockReset();
  transportMocks.onSubjectCall = undefined;
  usersApiMocks.getMe.mockResolvedValue(adminAccount(ADMIN_ID));
  openSession(ADMIN_ID);
});

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.clear();
  }
});

it.each(["directory read", "command"] as const)(
  "reconciles a decisive %s denial without replay",
  async (operation) => {
    const client = createClient();
    const active = adminAccount(ADMIN_ID);
    const restricted = {
      user: {
        ...active.user,
        status: "SUSPENDED",
        accessVersion: 2,
      },
    };
    client.setQueryData(AUTH_SESSION_QUERY_KEY, active);
    usersApiMocks.getMe.mockResolvedValue(restricted);
    const denial = Object.assign(new Error("Restricted"), {
      isAxiosError: true,
      response: {
        status: 403,
        headers: {},
        data: {
          success: false,
          code: "ACCOUNT_RESTRICTED",
          message: "Restricted",
          statusCode: 403,
          requestId: "test-request",
          timestamp: "2026-11-04T00:00:00.000Z",
          path: "/api/v1/staff",
        },
      },
    });
    const initial = sessionQueryOf(client);
    if (operation === "directory read") {
      staffApiMocks.list.mockRejectedValue(denial);
      const list = renderHook(() => useStaffList(LIST_OPTIONS), {
        wrapper: wrapperFor(client),
      });
      await waitFor(() => {
        expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(restricted);
        expect(list.result.current.fetchStatus).toBe("idle");
        expect(list.result.current.data).toBeUndefined();
      });
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    } else {
      staffApiMocks.approve.mockRejectedValue(denial);
      const command = renderHook(() => useStaffCommand(), {
        wrapper: wrapperFor(client),
      });
      const outcome = await runCommand(
        command.result.current.mutateAsync,
        approvalVariables(),
      );
      expect(outcome.failure).toBe(denial);
      expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    }
    expect(usersApiMocks.getMe).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(restricted);
    expect(sessionQueryOf(client)).toBe(initial);
  },
);

describe("staff key shapes", () => {
  it("publishes the four exact staff key shapes", () => {
    expect(staffKeys.all(ADMIN_ID)).toEqual(["staff", ADMIN_ID]);
    expect(
      staffKeys.list(ADMIN_ID, {
        scope: "all",
        search: "",
        page: 1,
        limit: 25,
      }),
    ).toEqual(["staff", ADMIN_ID, "list", "all", "", 1, 25]);
    expect(staffKeys.detail(ADMIN_ID, TARGET_ID)).toEqual([
      "staff",
      ADMIN_ID,
      "detail",
      TARGET_ID,
    ]);
    expect(
      staffKeys.decisions(ADMIN_ID, TARGET_ID, { page: 2, limit: 25 }),
    ).toEqual(["staff", ADMIN_ID, "decisions", TARGET_ID, 2, 25]);
  });
});

describe("staff read eligibility", () => {
  it("reads the directory for a successful verified ACTIVE ADMIN session", async () => {
    const client = createClient();
    staffApiMocks.list.mockResolvedValue(listData());

    const { result } = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });

    expect(staffApiMocks.list).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    expect(staffApiMocks.list).toHaveBeenCalledWith(
      { scope: "all", page: 1, limit: 25 },
      expect.anything(),
    );
  });

  it("never reads staff data for an errored session query", async () => {
    const client = createClient();
    usersApiMocks.getMe.mockRejectedValue(new Error("session unavailable"));

    const { result } = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("error");
    });
    expect(staffApiMocks.list).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("never reads staff data for a non-administrator session", async () => {
    const client = createClient();
    usersApiMocks.getMe.mockResolvedValue({
      user: safeUser(TARGET_ID, 1),
    });

    const { result } = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    expect(staffApiMocks.list).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("cancels the superseded search read", async () => {
    const client = createClient();
    const signals: AbortSignal[] = [];
    staffApiMocks.list.mockImplementation((_query, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });

    const { rerender } = renderHook(
      ({ search }: { search: string }) =>
        useStaffList({ ...LIST_OPTIONS, search }),
      {
        initialProps: { search: "" },
        wrapper: wrapperFor(client),
      },
    );

    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    });
    rerender({ search: "shoes" });

    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(2);
    });
    expect(signals[0]?.aborted).toBe(true);
  });

  it("keeps the staff keys actor scoped", async () => {
    const client = createClient();
    staffApiMocks.list.mockResolvedValue(listData());

    const { result } = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(
      client.getQueryCache().findAll({ queryKey: ["staff", ADMIN_ID] }).length,
    ).toBeGreaterThan(0);
    expect(
      client.getQueryCache().findAll({ queryKey: ["staff", SECOND_ADMIN_ID] })
        .length,
    ).toBe(0);
  });
});

describe("staff detail ordering", () => {
  it("keeps the higher cached revision when an earlier detail read resolves late", async () => {
    const client = createClient();
    const firstRead = createDeferred<StaffUserData>();
    let firstSignal: AbortSignal | undefined;
    staffApiMocks.get.mockImplementation(
      (_userId: string, signal: AbortSignal) => {
        if (firstSignal === undefined) {
          firstSignal = signal;
          return firstRead.promise;
        }
        return Promise.resolve(detailData(2));
      },
    );
    staffApiMocks.approve.mockResolvedValue(commandReceipt(2));

    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(1);
    });

    // The reader becomes inactive, so its earlier read is disabled and can no
    // longer publish.
    detail.unmount();
    expect(firstSignal?.aborted).toBe(true);

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    const { receipt, failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );
    expect(failure).toBeUndefined();
    expect(receipt?.staff.accessVersion).toBe(2);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);

    firstRead.resolve(detailData(1));
    await waitFor(() => {
      expect(
        client.getQueryData<StaffUserData>(
          staffKeys.detail(ADMIN_ID, TARGET_ID),
        )?.staff.accessVersion,
      ).toBe(2);
    });
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
  });

  it("keeps the higher cached revision when the result is published between the resolved read and the cache commit", async () => {
    const client = createClient();
    const deferred = createDeferred<StaffUserData>();
    staffApiMocks.get.mockReturnValue(deferred.promise);

    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(1);
    });

    // The publication runs after the query function resolved and before the
    // query commits its own result to the cache.
    void deferred.promise.then(() => {
      client.setQueryData(staffKeys.detail(ADMIN_ID, TARGET_ID), detailData(2));
    });

    deferred.resolve(detailData(1));

    await waitFor(() => {
      expect(
        client.getQueryState(staffKeys.detail(ADMIN_ID, TARGET_ID))
          ?.fetchStatus,
      ).toBe("idle");
    });
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
    await waitFor(() => {
      expect(detail.result.current.data?.staff.accessVersion).toBe(2);
    });
    detail.unmount();
  });

  it("keeps the higher command revision and both original receipts", async () => {
    const client = createClient();
    const newerReceipt = commandReceipt(3);
    const olderReceipt = commandReceipt(2);
    staffApiMocks.approve
      .mockResolvedValueOnce(newerReceipt)
      .mockResolvedValueOnce(olderReceipt);

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });

    const first = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );
    const second = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(first.failure).toBeUndefined();
    expect(second.failure).toBeUndefined();
    expect(first.receipt).toEqual(newerReceipt);
    expect(second.receipt).toEqual(olderReceipt);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(3);
  });

  it("keeps a command created revision when a later detail read resolves an older one", async () => {
    const client = createClient();
    staffApiMocks.approve.mockResolvedValue(commandReceipt(3));

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    await runCommand(command.result.current.mutateAsync, approvalVariables());
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(3);

    staffApiMocks.get.mockResolvedValue(detailData(2));
    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await detail.result.current.refetch();
    });

    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(3);
    await waitFor(() => {
      expect(detail.result.current.data?.staff.accessVersion).toBe(3);
    });
    detail.unmount();
  });

  it("accepts an equal version profile change with normal sharing", async () => {
    const client = createClient();
    staffApiMocks.get
      .mockResolvedValueOnce(detailData(2, { fullName: "First Name" }))
      .mockResolvedValueOnce(detailData(2, { fullName: "Second Name" }));

    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(detail.result.current.isSuccess).toBe(true);
    });
    const first = detail.result.current.data;
    expect(first?.staff.fullName).toBe("First Name");

    await act(async () => {
      await detail.result.current.refetch();
    });

    await waitFor(() => {
      expect(detail.result.current.data?.staff.fullName).toBe("Second Name");
    });
    const second = detail.result.current.data;
    expect(second?.staff.accessVersion).toBe(2);
    expect(second?.staff.phone).toBe(first?.staff.phone);
    expect(second?.staff.department).toBe(first?.staff.department);
    expect(second?.staff).not.toBe(first?.staff);
    detail.unmount();
  });

  it("never compares another target or another actor", async () => {
    const client = createClient();
    staffApiMocks.approve.mockResolvedValue({
      staff: safeUser(OTHER_TARGET_ID, 1),
      decision: null,
      replayed: false,
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(OTHER_TARGET_ID),
    );

    expect(
      client.getQueryData<StaffUserData>(
        staffKeys.detail(ADMIN_ID, OTHER_TARGET_ID),
      )?.staff.accessVersion,
    ).toBe(1);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();
    expect(
      client.getQueryData<StaffUserData>(
        staffKeys.detail(SECOND_ADMIN_ID, OTHER_TARGET_ID),
      ),
    ).toBeUndefined();
  });

  it("rejects a wrong target reply as a contract failure", async () => {
    const client = createClient();
    staffApiMocks.approve.mockResolvedValue({
      staff: safeUser(OTHER_TARGET_ID, 1),
      decision: null,
      replayed: false,
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    const { receipt, failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(receipt).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(StaffSynchronizationError);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();
  });

  it("never publishes or recreates a cleared entry in an obsolete scope", async () => {
    const client = createClient();
    staffApiMocks.approve.mockResolvedValue(commandReceipt(2));
    const epoch = getAuthSessionEpoch();

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    beginAuthSessionEpoch("confirmed-ending");
    expect(getAuthSessionEpoch()).not.toBe(epoch);

    const { receipt, failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(receipt).toBeUndefined();
    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    expect(
      (failure as StaffSynchronizationError).result.staff.accessVersion,
    ).toBe(2);
    expect((failure as StaffSynchronizationError).syncError).toBeNull();
    expect(
      client.getQueryCache().find({
        queryKey: staffKeys.detail(ADMIN_ID, TARGET_ID),
        exact: true,
      }),
    ).toBeUndefined();
  });
});

describe("staff command synchronization", () => {
  it("rejects an invalidation failure with the original receipt and a normalized error", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);
    staffApiMocks.list
      .mockResolvedValueOnce(listData())
      .mockRejectedValueOnce(new Error("directory refresh failed"));

    const directory = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(directory.result.current.isSuccess).toBe(true);
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    const { failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    const synchronizationError = failure as StaffSynchronizationError;
    expect(synchronizationError.result).toEqual(receipt);
    expect(synchronizationError.result.staff.accessVersion).toBe(2);
    expect(synchronizationError.syncError).not.toBeNull();
    expect(synchronizationError.syncError?.code).toBe("NETWORK_ERROR");
    expect(synchronizationError.syncError?.statusCode).toBe(0);
    expect(synchronizationError.syncError?.requestId).toBe("");
    expect(Object.keys(synchronizationError.syncError ?? {})).toEqual([
      "message",
      "statusCode",
      "code",
      "requestId",
      "fieldErrors",
    ]);
    expect("cause" in synchronizationError).toBe(false);
    expect(staffApiMocks.approve).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
    directory.unmount();
  });

  it("rejects with a null synchronization error when the session query is errored", async () => {
    const client = createClient();
    const receipt = commandReceipt(1);
    const commandResponse = createDeferred<StaffCommandData>();
    staffApiMocks.approve.mockReturnValue(commandResponse.promise);

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });

    let failure: unknown;
    await act(async () => {
      const pending = command.result.current
        .mutateAsync(approvalVariables())
        .catch((error: unknown) => {
          failure = error;
        });
      await flushUntil(() => staffApiMocks.approve.mock.calls.length === 1);
      sessionQueryOf(client)?.setState({
        status: "error",
        error: new Error("session unavailable"),
      });
      commandResponse.resolve(receipt);
      await pending;
    });

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    const synchronizationError = failure as StaffSynchronizationError;
    expect(synchronizationError.result).toEqual(receipt);
    expect(synchronizationError.syncError).toBeNull();
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();

    // The same actor and epoch recovering later never turns the terminal
    // rejection into a normal success.
    sessionQueryOf(client)?.setState({
      status: "success",
      error: null,
      data: adminAccount(ADMIN_ID),
    });
    await waitFor(() => {
      expect(command.result.current.isError).toBe(true);
    });
    expect(command.result.current.data).toBeUndefined();
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();
  });

  it("rejects terminally when the functional publication is skipped", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });

    transportMocks.onSubjectCall = () => {
      sessionQueryOf(client)?.setState({
        status: "error",
        error: new Error("session unavailable"),
      });
    };

    const { failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    const synchronizationError = failure as StaffSynchronizationError;
    expect(synchronizationError.result).toEqual(receipt);
    expect(synchronizationError.syncError).toBeNull();
    expect(
      client.getQueryCache().find({
        queryKey: staffKeys.detail(ADMIN_ID, TARGET_ID),
        exact: true,
      }),
    ).toBeUndefined();
  });

  it("rejects terminally when the scope is lost during the awaited invalidation", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);
    const directoryRead = createDeferred<unknown>();
    staffApiMocks.list.mockReturnValue(directoryRead.promise);

    const directory = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    let failure: unknown;
    await act(async () => {
      const pending = command.result.current
        .mutateAsync(approvalVariables())
        .catch((error: unknown) => {
          failure = error;
        });
      await flushUntil(() => staffApiMocks.list.mock.calls.length >= 2);
      // The scope is lost after the refreshed read passed its own scope check
      // and before the awaited invalidation completes.
      void directoryRead.promise.then(() => {
        sessionQueryOf(client)?.setState({
          status: "error",
          error: new Error("session unavailable"),
        });
      });
      directoryRead.resolve(listData());
      await pending;
    });

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    const synchronizationError = failure as StaffSynchronizationError;
    expect(synchronizationError.result).toEqual(receipt);
    expect(synchronizationError.syncError).toBeNull();
    directory.unmount();
  });

  it("keeps the normalized invalidation error even when the scope is false at catch time", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);
    const directoryRead = createDeferred<unknown>();
    staffApiMocks.list.mockReturnValue(directoryRead.promise);

    const directory = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(1);
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    let failure: unknown;
    await act(async () => {
      const pending = command.result.current
        .mutateAsync(approvalVariables())
        .catch((error: unknown) => {
          failure = error;
        });
      await flushUntil(() => staffApiMocks.list.mock.calls.length >= 2);
      sessionQueryOf(client)?.setState({
        status: "error",
        error: new Error("session unavailable"),
      });
      directoryRead.reject(new Error("directory refresh failed"));
      await pending;
    });

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    const synchronizationError = failure as StaffSynchronizationError;
    expect(synchronizationError.result).toEqual(receipt);
    expect(synchronizationError.syncError).not.toBeNull();
    expect(synchronizationError.syncError?.code).toBe("NETWORK_ERROR");
    directory.unmount();
  });

  it("invalidates the directory count and the retained history after a successful command", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);
    staffApiMocks.list.mockResolvedValue(listData(5));
    staffApiMocks.decisions.mockResolvedValue({
      decisions: [],
      pagination: listData().pagination,
    });

    const directory = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });
    const history = renderHook(
      () => useStaffDecisions(TARGET_ID, { page: 1, limit: 25 }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => {
      expect(directory.result.current.isSuccess).toBe(true);
      expect(history.result.current.isSuccess).toBe(true);
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    const { receipt: confirmed } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(confirmed).toEqual(receipt);
    await waitFor(() => {
      expect(staffApiMocks.list).toHaveBeenCalledTimes(2);
      expect(staffApiMocks.decisions).toHaveBeenCalledTimes(2);
    });
    expect(directory.result.current.data?.pendingCount).toBe(5);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
    directory.unmount();
    history.unmount();
  });

  it("treats a null decision and a replayed receipt as successful results", async () => {
    const client = createClient();
    const noChange = commandReceipt(2);
    const replayed = commandReceipt(2, { replayed: true });
    staffApiMocks.approve
      .mockResolvedValueOnce(noChange)
      .mockResolvedValueOnce(replayed);

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(sessionStatusOf(client)).toBe("success");
    });
    const first = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );
    expect(first.receipt).toEqual(noChange);
    expect(first.failure).toBeUndefined();

    const second = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );
    expect(second.receipt).toEqual(replayed);
    expect(second.failure).toBeUndefined();
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
  });

  it("keeps the confirmed cache data when the follow-up refetch fails", async () => {
    const client = createClient();
    const receipt = commandReceipt(2);
    staffApiMocks.approve.mockResolvedValue(receipt);
    staffApiMocks.list
      .mockResolvedValueOnce(listData())
      .mockRejectedValueOnce(new Error("directory refresh failed"));

    const directory = renderHook(() => useStaffList(LIST_OPTIONS), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(directory.result.current.isSuccess).toBe(true);
    });

    const command = renderHook(() => useStaffCommand(), {
      wrapper: wrapperFor(client),
    });
    const { failure } = await runCommand(
      command.result.current.mutateAsync,
      approvalVariables(),
    );

    expect(failure).toBeInstanceOf(StaffSynchronizationError);
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID))
        ?.staff.accessVersion,
    ).toBe(2);
    directory.unmount();
  });
});

describe("staff late results", () => {
  it("suppresses a late detail result from an obsolete epoch", async () => {
    const client = createClient();
    const deferred = createDeferred<StaffUserData>();
    staffApiMocks.get.mockReturnValue(deferred.promise);

    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(1);
    });

    beginAuthSessionEpoch("confirmed-ending");
    deferred.resolve(detailData(1));

    await waitFor(() => {
      expect(detail.result.current.fetchStatus).toBe("idle");
    });
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();
    detail.unmount();
  });

  it("never publishes a result of another actor into the current cache", async () => {
    const client = createClient();
    const deferred = createDeferred<StaffUserData>();
    staffApiMocks.get.mockReturnValue(deferred.promise);

    const detail = renderHook(() => useStaff(TARGET_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => {
      expect(staffApiMocks.get).toHaveBeenCalledTimes(1);
    });

    client.setQueryData(AUTH_SESSION_QUERY_KEY, adminAccount(SECOND_ADMIN_ID));
    deferred.resolve(detailData(1));

    await waitFor(() => {
      expect(detail.result.current.fetchStatus).toBe("idle");
    });
    expect(
      client.getQueryData<StaffUserData>(
        staffKeys.detail(SECOND_ADMIN_ID, TARGET_ID),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData<StaffUserData>(staffKeys.detail(ADMIN_ID, TARGET_ID)),
    ).toBeUndefined();
    detail.unmount();
  });
});
