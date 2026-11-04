import { describe, expect, it, vi, type Mock } from "vitest";

import {
  Department,
  UserRole,
  UserStatus,
  type DatabaseClient,
} from "@template/database";

import { BadRequestException } from "../../core/errors/bad-request.error.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { ServiceUnavailableException } from "../../core/errors/service-unavailable.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import type { EmailService } from "../../infrastructure/email/email.service.js";
import type * as SecurityModule from "../../infrastructure/security/index.js";
import {
  generateResetToken,
  generateTokenPair,
  generateVerificationToken,
  sha256,
} from "../../infrastructure/security/index.js";
import { SAFE_USER_SELECT } from "../users/users.mapper.js";
import { AuthService } from "./auth.service.js";
import { AccountRestrictedError } from "./auth.errors.js";
import { VERIFICATION_TOKEN_TTL_MS } from "./auth.constants.js";

vi.mock("../../infrastructure/security/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof SecurityModule>();
  return {
    ...actual,
    // A deterministic hashing double keeps the credential boundary observable
    // without paying for argon2 in every unit case.
    compareHash: vi.fn((plainText: string, hash: string) =>
      Promise.resolve(hash === `plain:${plainText}`),
    ),
    generateHash: vi.fn((value: string) => Promise.resolve(`plain:${value}`)),
  };
});

type AsyncMock = Mock<(args: unknown) => Promise<unknown>>;

const ACCOUNT_ID = "1b3d904e-a46c-4dd8-9cb7-d0767546ea95";
const APPROVER_ID = "9f1b1a3c-0f1e-4d2b-9c33-6a2f1f9f0a11";
const CURRENT_PASSWORD = "a-secure-test-password";

const argumentAt = (value: unknown, path: readonly string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const firstArgument = (mock: AsyncMock): unknown => mock.mock.calls[0]?.[0];

const authorityRow = (overrides: Record<string, unknown> = {}) => ({
  id: ACCOUNT_ID,
  email: "user@example.com",
  fullName: "Template User",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  department: Department.SALES,
  staffApprovedAt: new Date("2026-08-18T00:00:00.000Z"),
  staffApprovedById: APPROVER_ID,
  accessVersion: 1,
  emailVerifiedAt: new Date("2026-08-18T00:00:00.000Z"),
  createdAt: new Date("2026-08-18T00:00:00.000Z"),
  updatedAt: new Date("2026-08-18T00:00:00.000Z"),
  ...overrides,
});

const credentialRow = (overrides: Record<string, unknown> = {}) => ({
  id: ACCOUNT_ID,
  passwordHash: `plain:${CURRENT_PASSWORD}`,
  resetTokenHash: null,
  resetTokenExpiresAt: null,
  ...overrides,
});

const SAFE_SELECT_KEYS = Object.keys(SAFE_USER_SELECT);

const REFRESH_TOKEN_ID = "5b3d904e-a46c-4dd8-9cb7-d0767546ea95";

const issueRefreshToken = (): string =>
  generateTokenPair({
    userId: ACCOUNT_ID,
    tokenId: REFRESH_TOKEN_ID,
    role: UserRole.USER,
    email: "user@example.com",
    rememberMe: false,
    absoluteExpiresAt: new Date(Date.now() + 3_600_000),
  }).refreshToken;

type TransactionDouble = {
  $queryRaw: AsyncMock;
  user: {
    findUnique: AsyncMock;
    findFirst: AsyncMock;
    updateMany: AsyncMock;
    update: AsyncMock;
    create: AsyncMock;
  };
  refreshToken: {
    findFirst: AsyncMock;
    create: AsyncMock;
    deleteMany: AsyncMock;
  };
};

const createHarness = (
  overrides: Readonly<{
    authority?: unknown;
    credential?: unknown;
    insideCredential?: unknown;
    safe?: unknown;
    findFirst?: unknown;
    updateMany?: unknown;
    update?: unknown;
    create?: unknown;
    refreshFindFirst?: unknown;
    refreshDeleteMany?: unknown;
  }> = {},
) => {
  const authority =
    overrides.authority === undefined ? authorityRow() : overrides.authority;
  const credential =
    overrides.credential === undefined ? credentialRow() : overrides.credential;
  const insideCredential =
    overrides.insideCredential === undefined
      ? credential
      : overrides.insideCredential;
  const safe = overrides.safe === undefined ? authority : overrides.safe;

  const user = {
    findUnique: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockImplementation((args: unknown) => {
        const select = argumentAt(args, ["select"]);
        const selectedKeys =
          typeof select === "object" && select !== null
            ? Object.keys(select)
            : [];
        const readsCredential = selectedKeys.some((key) =>
          ["passwordHash", "resetTokenHash", "resetTokenExpiresAt"].includes(
            key,
          ),
        );
        if (!readsCredential) {
          const readsSafeProjection =
            !selectedKeys.includes("staffApprovedById") &&
            SAFE_SELECT_KEYS.every((key) => selectedKeys.includes(key));
          return Promise.resolve(readsSafeProjection ? safe : authority);
        }
        return Promise.resolve(
          selectedKeys.includes("id") ? credential : insideCredential,
        );
      }),
    findFirst: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.findFirst ?? null),
    updateMany: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.updateMany ?? { count: 1 }),
    update: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.update ?? authority),
    create: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.create ?? null),
  };
  const refreshToken = {
    findFirst: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.refreshFindFirst ?? null),
    create: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue({ count: 1 }),
    deleteMany: vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue(overrides.refreshDeleteMany ?? { count: 1 }),
  };
  const queryRaw = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue([]);
  const transaction: TransactionDouble = {
    $queryRaw: queryRaw,
    user,
    refreshToken,
  };
  const runTransaction = vi
    .fn<
      (
        callback: (value: TransactionDouble) => Promise<unknown>,
      ) => Promise<unknown>
    >()
    .mockImplementation(async (callback) => callback(transaction));
  const database = {
    $transaction: runTransaction,
    user,
    refreshToken,
  } as unknown as DatabaseClient;
  const sendVerificationEmail = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(undefined);
  const sendPasswordResetEmail = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(undefined);
  const emailService = {
    sendVerificationEmail,
    sendPasswordResetEmail,
  } as unknown as EmailService;
  const service = new AuthService(database, emailService);

  return {
    service,
    database,
    emailService,
    transaction,
    user,
    refreshToken,
    queryRaw,
    sendVerificationEmail,
    sendPasswordResetEmail,
  };
};

describe("AuthService registration", () => {
  it("registers a pending verification identity with no employee fields", async () => {
    const created = authorityRow({
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    });
    const { service, user } = createHarness({ create: created });

    await expect(
      service.register({
        fullName: "  Template User  ",
        email: "  User@Example.com ",
        phone: null,
        password: CURRENT_PASSWORD,
      }),
    ).resolves.toMatchObject({
      user: {
        email: "user@example.com",
        status: UserStatus.PENDING_VERIFICATION,
      },
    });

    const data = argumentAt(firstArgument(user.create), ["data"]);
    expect(argumentAt(data, ["status"])).toBe(UserStatus.PENDING_VERIFICATION);
    expect(argumentAt(data, ["department"])).toBeNull();
    expect(argumentAt(data, ["staffApprovedAt"])).toBeNull();
    expect(argumentAt(data, ["staffApprovedById"])).toBeNull();
    expect(argumentAt(data, ["accessVersion"])).toBe(0);
    expect(argumentAt(data, ["fullName"])).toBe("Template User");
    expect(argumentAt(data, ["email"])).toBe("user@example.com");
  });

  it("rejects registration when verification email delivery fails", async () => {
    const deleteMany = vi
      .fn<(args: unknown) => Promise<unknown>>()
      .mockResolvedValue({ count: 1 });
    const created = authorityRow({
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    });
    const database = {
      user: { create: vi.fn().mockResolvedValue(created), deleteMany },
    } as unknown as DatabaseClient;
    const deliveryError = new Error("delivery unavailable");
    const emailService = {
      sendVerificationEmail: vi.fn().mockRejectedValue(deliveryError),
    } as unknown as EmailService;
    const service = new AuthService(database, emailService);

    const registration = service.register({
      fullName: "Template User",
      email: "user@example.com",
      phone: null,
      password: CURRENT_PASSWORD,
    });
    await expect(registration).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(registration).rejects.toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Registration is temporarily unavailable. Please try again.",
    });
    await expect(registration).rejects.not.toBe(deliveryError);
    const where = argumentAt(firstArgument(deleteMany), ["where"]);
    expect(argumentAt(where, ["id"])).toBe(ACCOUNT_ID);
    expect(argumentAt(where, ["status"])).toBe(UserStatus.PENDING_VERIFICATION);
    expect(typeof argumentAt(where, ["verificationTokenHash"])).toBe("string");
  });
});

describe("AuthService email verification", () => {
  it("verifies a pending user into pending approval without fabricating approval", async () => {
    const token = generateVerificationToken(" User@Example.com ");
    const pending = authorityRow({
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    });
    const { service, user } = createHarness({
      authority: pending,
      findFirst: { id: ACCOUNT_ID },
      safe: authorityRow({
        status: UserStatus.PENDING_APPROVAL,
        emailVerifiedAt: new Date(),
        accessVersion: 1,
      }),
    });

    await expect(service.verifyEmail(token)).resolves.toMatchObject({
      user: { status: UserStatus.PENDING_APPROVAL },
    });

    const update = argumentAt(firstArgument(user.updateMany), ["data"]);
    expect(argumentAt(update, ["status"])).toBe(UserStatus.PENDING_APPROVAL);
    expect(argumentAt(update, ["verificationTokenHash"])).toBeNull();
    expect(argumentAt(update, ["verificationTokenExpiresAt"])).toBeNull();
    expect(argumentAt(update, ["accessVersion"])).toEqual({ increment: 1 });
    expect(argumentAt(update, ["department"])).toBeUndefined();
    expect(argumentAt(update, ["staffApprovedAt"])).toBeUndefined();
    expect(argumentAt(update, ["staffApprovedById"])).toBeUndefined();
  });

  it("verifies a pending administrator into active and keeps the administrator role", async () => {
    const token = generateVerificationToken("admin@example.com");
    const pendingAdmin = authorityRow({
      email: "admin@example.com",
      role: UserRole.ADMIN,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
      accessVersion: 0,
    });
    const { service, user } = createHarness({
      authority: pendingAdmin,
      findFirst: { id: ACCOUNT_ID },
      safe: authorityRow({
        email: "admin@example.com",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        accessVersion: 1,
      }),
    });

    await expect(service.verifyEmail(token)).resolves.toMatchObject({
      user: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });

    const update = argumentAt(firstArgument(user.updateMany), ["data"]);
    expect(argumentAt(update, ["status"])).toBe(UserStatus.ACTIVE);
    expect(argumentAt(update, ["accessVersion"])).toEqual({ increment: 1 });
    expect(argumentAt(update, ["role"])).toBeUndefined();
  });

  it("rejects an invalid verification token without touching the account", async () => {
    const { service, user } = createHarness();

    await expect(service.verifyEmail("not-a-token")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a suspended candidate without changing its status", async () => {
    const token = generateVerificationToken("user@example.com");
    const suspended = authorityRow({
      status: UserStatus.SUSPENDED,
      emailVerifiedAt: new Date(),
    });
    const { service, user } = createHarness({
      authority: suspended,
      findFirst: { id: ACCOUNT_ID },
    });

    await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a token that loses the atomic consumption race", async () => {
    const token = generateVerificationToken("user@example.com");
    const pending = authorityRow({
      status: UserStatus.PENDING_VERIFICATION,
      emailVerifiedAt: null,
    });
    const { service, user } = createHarness({
      authority: pending,
      findFirst: { id: ACCOUNT_ID },
      updateMany: { count: 0 },
    });

    await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(user.updateMany).toHaveBeenCalledOnce();
  });
});

describe("AuthService verification resend", () => {
  it("replaces the current verification token and delivers a new one", async () => {
    const { service, user, sendVerificationEmail } = createHarness({
      authority: {
        id: ACCOUNT_ID,
        fullName: "Template User",
        email: "user@example.com",
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: null,
        verificationTokenHash: "current-hash",
        verificationTokenExpiresAt: new Date(0),
      },
    });

    const response = await service.resendVerification({
      email: "user@example.com",
    });

    expect(typeof response.message).toBe("string");
    expect(user.updateMany).toHaveBeenCalledOnce();
    expect(sendVerificationEmail).toHaveBeenCalledOnce();
  });

  it("keeps the neutral response and sends nothing during the cooldown", async () => {
    const { service, user, sendVerificationEmail } = createHarness({
      authority: {
        id: ACCOUNT_ID,
        fullName: "Template User",
        email: "user@example.com",
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: null,
        verificationTokenHash: "current-hash",
        verificationTokenExpiresAt: new Date(
          Date.now() + VERIFICATION_TOKEN_TTL_MS,
        ),
      },
    });

    const response = await service.resendVerification({
      email: "user@example.com",
    });

    expect(typeof response.message).toBe("string");
    expect(user.updateMany).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe("AuthService login", () => {
  it("establishes an identity session for a restricted identity", async () => {
    const restricted = authorityRow({
      status: UserStatus.PENDING_APPROVAL,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
    });
    const { service, refreshToken } = createHarness({ authority: restricted });

    const result = await service.login({
      email: " User@Example.com ",
      password: CURRENT_PASSWORD,
      rememberMe: false,
    });

    expect(result.user.status).toBe(UserStatus.PENDING_APPROVAL);
    expect(result.tokens.accessToken.length).toBeGreaterThan(0);
    expect(refreshToken.create).toHaveBeenCalledOnce();
  });

  it("rejects a wrong password without creating a refresh record", async () => {
    const { service, refreshToken } = createHarness();

    await expect(
      service.login({
        email: "user@example.com",
        password: "a-wrong-password",
        rememberMe: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects a password replaced between the comparison and the write", async () => {
    const { service, refreshToken } = createHarness({
      insideCredential: credentialRow({
        passwordHash: "plain:replacement-password",
      }),
    });

    await expect(
      service.login({
        email: "user@example.com",
        password: CURRENT_PASSWORD,
        rememberMe: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("AuthService refresh", () => {
  it("rotates the session and returns the current account", async () => {
    const refreshTokenValue = issueRefreshToken();
    const { service, refreshToken } = createHarness({
      refreshFindFirst: {
        id: REFRESH_TOKEN_ID,
        userId: ACCOUNT_ID,
        tokenHash: sha256(refreshTokenValue),
      },
      refreshDeleteMany: { count: 1 },
    });

    const result = await service.refresh(refreshTokenValue);

    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(refreshToken.deleteMany).toHaveBeenCalledOnce();
    expect(refreshToken.create).toHaveBeenCalledOnce();
  });

  it("rejects a consumed refresh token without minting a replacement", async () => {
    const refreshTokenValue = issueRefreshToken();
    const { service, refreshToken } = createHarness({
      refreshFindFirst: {
        id: REFRESH_TOKEN_ID,
        userId: ACCOUNT_ID,
        tokenHash: sha256(refreshTokenValue),
      },
      refreshDeleteMany: { count: 0 },
    });

    await expect(service.refresh(refreshTokenValue)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects a refresh token without a stored record", async () => {
    const refreshTokenValue = issueRefreshToken();
    const { service, refreshToken } = createHarness({
      refreshFindFirst: null,
    });

    await expect(service.refresh(refreshTokenValue)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("AuthService recovery", () => {
  it("answers neutrally and delivers nothing for an ineligible identity", async () => {
    const pending = authorityRow({
      status: UserStatus.PENDING_APPROVAL,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
    });
    const { service, sendPasswordResetEmail } = createHarness({
      authority: pending,
    });

    const response = await service.forgotPassword({
      email: "user@example.com",
    });

    expect(typeof response.message).toBe("string");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("issues a reset token for a business eligible identity", async () => {
    const { service, sendPasswordResetEmail, user } = createHarness();

    const response = await service.forgotPassword({
      email: "user@example.com",
    });

    expect(typeof response.message).toBe("string");
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(
      typeof argumentAt(firstArgument(user.update), ["data", "resetTokenHash"]),
    ).toBe("string");
  });

  it("rejects an expired purpose credential with 401", async () => {
    const token = generateResetToken("user@example.com");
    const { service } = createHarness({
      credential: credentialRow({
        resetTokenHash: sha256(token),
        resetTokenExpiresAt: new Date(0),
      }),
    });

    await expect(service.validateResetToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a valid purpose credential for a now ineligible identity with 403", async () => {
    const token = generateResetToken("user@example.com");
    const suspended = authorityRow({
      status: UserStatus.SUSPENDED,
      emailVerifiedAt: new Date(),
    });
    const { service } = createHarness({
      authority: suspended,
      credential: credentialRow({
        resetTokenHash: sha256(token),
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    });

    await expect(service.validateResetToken(token)).rejects.toBeInstanceOf(
      AccountRestrictedError,
    );
    await expect(service.validateResetToken(token)).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCOUNT_RESTRICTED",
    });
  });

  it("rejects reusing the current password with 400", async () => {
    const token = generateResetToken("user@example.com");
    const { service, refreshToken } = createHarness({
      credential: credentialRow({
        resetTokenHash: sha256(token),
        resetTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    });

    await expect(
      service.resetPassword(
        {
          newPassword: CURRENT_PASSWORD,
          passwordConfirmation: CURRENT_PASSWORD,
        },
        token,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("AuthService password change", () => {
  it("rejects an incorrect current password with 400", async () => {
    const { service, refreshToken } = createHarness();

    await expect(
      service.changePassword(ACCOUNT_ID, {
        currentPassword: "a-wrong-password",
        newPassword: "another-secure-test-password",
        passwordConfirmation: "another-secure-test-password",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a restricted identity with the business denial", async () => {
    const pending = authorityRow({
      status: UserStatus.PENDING_APPROVAL,
      department: null,
      staffApprovedAt: null,
      staffApprovedById: null,
    });
    const { service, refreshToken } = createHarness({ authority: pending });

    await expect(
      service.changePassword(ACCOUNT_ID, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: "another-secure-test-password",
        passwordConfirmation: "another-secure-test-password",
      }),
    ).rejects.toBeInstanceOf(AccountRestrictedError);
    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("revokes every owned refresh record together with the password update", async () => {
    const { service, refreshToken } = createHarness();

    await expect(
      service.changePassword(ACCOUNT_ID, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: "another-secure-test-password",
        passwordConfirmation: "another-secure-test-password",
      }),
    ).resolves.toMatchObject({ user: { id: ACCOUNT_ID } });
    expect(refreshToken.deleteMany).toHaveBeenCalledOnce();
    expect(
      argumentAt(firstArgument(refreshToken.deleteMany), ["where"]),
    ).toEqual({
      userId: ACCOUNT_ID,
    });
  });
});

describe("AuthService logout", () => {
  it("deletes only the matching owned refresh record", async () => {
    const { service, refreshToken } = createHarness();

    await service.logout(ACCOUNT_ID, "refresh-token");

    const where = argumentAt(firstArgument(refreshToken.deleteMany), ["where"]);
    expect(argumentAt(where, ["userId"])).toBe(ACCOUNT_ID);
    expect(argumentAt(where, ["tokenHash"])).toBe(sha256("refresh-token"));
  });

  it("is a safe no-op for an empty refresh token", async () => {
    const { service, refreshToken } = createHarness();

    await service.logout(ACCOUNT_ID, "");

    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes every owned refresh record on logout all", async () => {
    const { service, refreshToken } = createHarness();

    await service.logoutAll(ACCOUNT_ID);

    expect(
      argumentAt(firstArgument(refreshToken.deleteMany), ["where"]),
    ).toEqual({
      userId: ACCOUNT_ID,
    });
  });
});
