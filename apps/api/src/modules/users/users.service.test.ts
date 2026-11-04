import { describe, expect, it, vi, type Mock } from "vitest";

import {
  Department,
  UserRole,
  UserStatus,
  type DatabaseClient,
} from "@template/database";

import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import { AccountRestrictedError } from "../auth/auth.errors.js";
import { SAFE_USER_SELECT } from "./users.mapper.js";
import { UsersService } from "./users.service.js";

type AsyncMock = Mock<(args: unknown) => Promise<unknown>>;

const ACCOUNT_ID = "1b3d904e-a46c-4dd8-9cb7-d0767546ea95";

const argumentAt = (value: unknown, path: readonly string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const firstArgument = (mock: AsyncMock): unknown => mock.mock.calls[0]?.[0];

const account = (overrides: Record<string, unknown> = {}) => ({
  id: ACCOUNT_ID,
  fullName: "Template User",
  email: "user@example.com",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  department: Department.SALES,
  staffApprovedAt: new Date("2026-08-18T00:00:00.000Z"),
  accessVersion: 1,
  emailVerifiedAt: new Date("2026-08-18T00:00:00.000Z"),
  createdAt: new Date("2026-08-18T00:00:00.000Z"),
  updatedAt: new Date("2026-08-18T00:00:00.000Z"),
  ...overrides,
});

const createHarness = (
  overrides: Readonly<{ current?: unknown; updated?: unknown }> = {},
) => {
  const current =
    overrides.current === undefined ? account() : overrides.current;
  const updated = overrides.updated === undefined ? current : overrides.updated;

  const findUnique = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(current);
  const update = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(updated);
  const queryRaw = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue([]);
  const transaction = {
    $queryRaw: queryRaw,
    user: { findUnique, update },
  };
  const runTransaction = vi
    .fn<
      (
        callback: (value: typeof transaction) => Promise<unknown>,
      ) => Promise<unknown>
    >()
    .mockImplementation(async (callback) => callback(transaction));
  const database = {
    $transaction: runTransaction,
  } as unknown as DatabaseClient;
  const service = new UsersService(database);

  return { service, findUnique, update, queryRaw };
};

describe("UsersService current identity", () => {
  it("returns the own current state for a restricted identity", async () => {
    const { service } = createHarness({
      current: account({
        status: UserStatus.PENDING_APPROVAL,
        department: null,
        staffApprovedAt: null,
      }),
    });

    await expect(service.getCurrentUser(ACCOUNT_ID)).resolves.toMatchObject({
      id: ACCOUNT_ID,
      status: UserStatus.PENDING_APPROVAL,
      department: null,
    });
  });

  it("rejects a missing identity with 401", async () => {
    const { service } = createHarness({ current: null });

    await expect(service.getCurrentUser(ACCOUNT_ID)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("reads the current row instead of a cached projection", async () => {
    const { service, findUnique } = createHarness();

    await service.getCurrentUser(ACCOUNT_ID);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      select: SAFE_USER_SELECT,
    });
  });
});

describe("UsersService profile update", () => {
  it("requires current business eligibility", async () => {
    const { service, update } = createHarness({
      current: account({
        status: UserStatus.PENDING_APPROVAL,
        department: null,
        staffApprovedAt: null,
      }),
    });

    await expect(
      service.updateCurrentUser(ACCOUNT_ID, { fullName: "New Name" }),
    ).rejects.toBeInstanceOf(AccountRestrictedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("performs no write for an unchanged profile", async () => {
    const { service, update } = createHarness();

    await expect(
      service.updateCurrentUser(ACCOUNT_ID, { fullName: "Template User" }),
    ).resolves.toMatchObject({ id: ACCOUNT_ID });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates only the supplied profile fields", async () => {
    const { service, update } = createHarness({
      updated: account({ fullName: "Renamed User" }),
    });

    await expect(
      service.updateCurrentUser(ACCOUNT_ID, { fullName: "  Renamed User  " }),
    ).resolves.toMatchObject({ fullName: "Renamed User" });

    const data = argumentAt(firstArgument(update), ["data"]);
    expect(argumentAt(data, ["fullName"])).toBe("Renamed User");
    expect(argumentAt(data, ["phone"])).toBeUndefined();
    expect(argumentAt(data, ["role"])).toBeUndefined();
    expect(argumentAt(data, ["status"])).toBeUndefined();
    expect(argumentAt(data, ["department"])).toBeUndefined();
    expect(argumentAt(data, ["staffApprovedAt"])).toBeUndefined();
    expect(argumentAt(data, ["accessVersion"])).toBeUndefined();
  });

  it("clears an explicitly blank phone", async () => {
    const { service, update } = createHarness({
      current: account({ phone: "+201000000000" }),
      updated: account({ phone: null }),
    });

    await expect(
      service.updateCurrentUser(ACCOUNT_ID, { phone: "   " }),
    ).resolves.toMatchObject({ phone: null });
    expect(
      argumentAt(argumentAt(firstArgument(update), ["data"]), ["phone"]),
    ).toBe(null);
  });
});
