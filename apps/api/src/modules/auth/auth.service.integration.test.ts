import {
  createDatabaseClient,
  Department,
  UserRole,
  UserStatus,
} from "@template/database";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestException } from "../../core/errors/bad-request.error.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { ServiceUnavailableException } from "../../core/errors/service-unavailable.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import type { EmailDelivery } from "../../infrastructure/email/email-delivery.js";
import { EmailService } from "../../infrastructure/email/email.service.js";
import {
  generateHash,
  generateResetToken,
  generateVerificationToken,
} from "../../infrastructure/security/index.js";
import { sha256 } from "../../infrastructure/security/token-hasher.js";
import { verifyAccessToken } from "../../infrastructure/security/jwt.service.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { AuthService } from "./auth.service.js";
import { AccountRestrictedError } from "./auth.errors.js";

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database = createDatabaseClient(databaseUrl);

type CapturedMessage = Readonly<{
  to: string;
  subject: string;
  html: string;
}>;

/**
 * Mail is captured only at the delivery boundary. The provider acknowledgment
 * proves that the message was handed to the provider; it never proves that the
 * recipient read or received it.
 */
const capturedMessages: CapturedMessage[] = [];
const acknowledgedMessageIds: string[] = [];
const delivery: EmailDelivery = {
  provider: "smtp",
  send: (message) => {
    capturedMessages.push({
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    const providerMessageId = `test-message-${String(capturedMessages.length)}`;
    acknowledgedMessageIds.push(providerMessageId);
    return Promise.resolve({ providerMessageId });
  },
};
const emailService = new EmailService(
  delivery,
  "no-reply@example.com",
  "Template",
  "",
  "http://localhost:3000",
);
const service = new AuthService(database, emailService);

const tokenFromLastMessage = (subject: string): string => {
  const html = capturedMessages
    .filter(({ subject: sent }) => sent === subject)
    .at(-1)?.html;
  const match = html?.match(/token=([^"&<]+)/u);
  if (match?.[1] === undefined) {
    throw new Error("Expected a token in the captured email.");
  }
  return decodeURIComponent(match[1]);
};

const INITIAL_PASSWORD = "initial-secure-password";

const createUserRow = async (input: {
  email: string;
  fullName?: string;
  role?: UserRole;
  status: UserStatus;
  emailVerifiedAt?: Date | null;
  department?: Department | null;
  staffApprovedById?: string | null;
  password?: string;
}) => {
  const password = input.password ?? INITIAL_PASSWORD;
  const pendingVerification = input.status === UserStatus.PENDING_VERIFICATION;
  const emailVerifiedAt =
    input.emailVerifiedAt === undefined ? new Date() : input.emailVerifiedAt;
  const staffApprovedById = input.staffApprovedById ?? null;

  return database.user.create({
    data: {
      email: input.email,
      fullName: input.fullName ?? "Fixture User",
      passwordHash: await generateHash(password),
      role: input.role ?? UserRole.USER,
      status: input.status,
      emailVerifiedAt: pendingVerification ? null : emailVerifiedAt,
      department: input.department ?? null,
      staffApprovedAt: staffApprovedById === null ? null : new Date(),
      staffApprovedById,
    },
  });
};

const createApprover = async (email = "approver@example.com") =>
  createUserRow({
    email,
    fullName: "Staff Approver",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });

const createApprovedEmployee = async (
  email: string,
  approverId: string,
  password = INITIAL_PASSWORD,
) =>
  createUserRow({
    email,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    department: Department.SALES,
    staffApprovedById: approverId,
    password,
  });

const createPendingEmployee = async (email: string) =>
  createUserRow({
    email,
    role: UserRole.USER,
    status: UserStatus.PENDING_APPROVAL,
  });

// The first pre-transaction credential read stays real. Complete the competing
// database write before returning that snapshot to the operation.
const createObservedService = (
  afterCredentialRead: () => Promise<unknown>,
): AuthService => {
  const user = new Proxy(database.user, {
    get(delegate, property, receiver): unknown {
      if (property === "findUnique") {
        return async (args: Parameters<typeof delegate.findUnique>[0]) => {
          const result = await delegate.findUnique(args);
          await afterCredentialRead();
          return result;
        };
      }
      return Reflect.get(delegate, property, receiver);
    },
  });
  const observed = new Proxy(database, {
    get(client, property, receiver): unknown {
      if (property === "user") return user;
      if (property === "$transaction") return client.$transaction.bind(client);
      return Reflect.get(client, property, receiver);
    },
  });
  return new AuthService(observed, emailService);
};

const withRefreshDeleteTrigger = async (
  body:
    | "RAISE EXCEPTION 'forced refresh deletion failure';"
    | "PERFORM pg_advisory_xact_lock(90212);",
  run: () => Promise<void>,
): Promise<void> => {
  await database.$executeRawUnsafe(`
    CREATE FUNCTION p01_refresh_delete_fixture() RETURNS trigger AS $$
    BEGIN
      ${body}
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql`);
  try {
    await database.$executeRawUnsafe(`
      CREATE TRIGGER p01_refresh_delete_fixture BEFORE DELETE ON refresh_tokens
      FOR EACH ROW EXECUTE FUNCTION p01_refresh_delete_fixture()`);
    await run();
  } finally {
    await database.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS p01_refresh_delete_fixture ON refresh_tokens`,
    );
    await database.$executeRawUnsafe(
      `DROP FUNCTION p01_refresh_delete_fixture()`,
    );
  }
};

describe("AuthService with PostgreSQL", () => {
  beforeEach(async () => {
    capturedMessages.length = 0;
    acknowledgedMessageIds.length = 0;
    await resetOwnedIdentityTestData(database);
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  describe("registration and verification", () => {
    it("registers a pending verification identity without employee fields", async () => {
      const registered = await service.register({
        fullName: "Template User",
        email: "USER@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });

      expect(registered.user).not.toHaveProperty("passwordHash");
      expect(registered.user.status).toBe(UserStatus.PENDING_VERIFICATION);
      expect(registered.user.department).toBeNull();
      expect(registered.user.staffApprovedAt).toBeNull();

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "user@example.com" },
      });
      expect(stored.department).toBeNull();
      expect(stored.staffApprovedAt).toBeNull();
      expect(stored.staffApprovedById).toBeNull();
      expect(stored.accessVersion).toBe(0);
      expect(stored.emailVerifiedAt).toBeNull();
      expect(stored.verificationTokenHash).toBe(
        sha256(tokenFromLastMessage("Verify your email")),
      );
      expect(stored.verificationTokenHash).not.toBe(
        tokenFromLastMessage("Verify your email"),
      );
    });

    it("keeps a verified account when the pending registration delivery fails", async () => {
      const email = "delivery-race@example.com";
      let verifiedId: string | undefined;
      const failingDelivery: EmailDelivery = {
        provider: "smtp",
        send: async ({ html }) => {
          const token = html.match(/token=([^"&<]+)/u)?.[1];
          if (token === undefined)
            throw new Error("Missing verification credential.");
          const verified = await service.verifyEmail(decodeURIComponent(token));
          verifiedId = verified.user.id;
          throw new Error("Controlled delivery failure after verification.");
        },
      };
      const registering = new AuthService(
        database,
        new EmailService(
          failingDelivery,
          "no-reply@example.com",
          "Template",
          "",
          "http://localhost:3000",
        ),
      );
      await expect(
        registering.register({
          email,
          fullName: "Verified During Delivery",
          phone: null,
          password: INITIAL_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(verifiedId).toBeDefined();
      expect(
        await database.user.findUnique({ where: { email } }),
      ).toMatchObject({
        id: verifiedId,
        status: UserStatus.PENDING_APPROVAL,
        verificationTokenHash: null,
        department: null,
        staffApprovedAt: null,
      });
      expect(await database.staffDecision.count()).toBe(0);
    });

    it("verifies a pending user into pending approval without fabricating approval", async () => {
      await service.register({
        fullName: "Template User",
        email: "user@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });
      const verificationToken = tokenFromLastMessage("Verify your email");

      const verified = await service.verifyEmail(verificationToken);

      expect(verified.user.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(verified.user.emailVerifiedAt).not.toBeNull();
      expect(verified.user.department).toBeNull();
      expect(verified.user.staffApprovedAt).toBeNull();

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "user@example.com" },
      });
      expect(stored.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(stored.emailVerifiedAt).toBeInstanceOf(Date);
      expect(stored.department).toBeNull();
      expect(stored.staffApprovedAt).toBeNull();
      expect(stored.staffApprovedById).toBeNull();
      expect(stored.accessVersion).toBe(1);
      expect(stored.verificationTokenHash).toBeNull();
      expect(stored.verificationTokenExpiresAt).toBeNull();
      await expect(database.staffDecision.count()).resolves.toBe(0);

      await expect(
        service.verifyEmail(verificationToken),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("verifies a pending administrator into active keeping the administrator role", async () => {
      const token = generateVerificationToken("admin@example.com");
      await createUserRow({
        email: "admin@example.com",
        fullName: "Pending Administrator",
        role: UserRole.ADMIN,
        status: UserStatus.PENDING_VERIFICATION,
      });
      await database.user.update({
        where: { email: "admin@example.com" },
        data: {
          verificationTokenHash: sha256(token),
          verificationTokenExpiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      const verified = await service.verifyEmail(token);

      expect(verified.user.role).toBe(UserRole.ADMIN);
      expect(verified.user.status).toBe(UserStatus.ACTIVE);
      expect(verified.user.department).toBeNull();
      expect(verified.user.staffApprovedAt).toBeNull();

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "admin@example.com" },
      });
      expect(stored.role).toBe(UserRole.ADMIN);
      expect(stored.status).toBe(UserStatus.ACTIVE);
      expect(stored.accessVersion).toBe(1);
      expect(stored.department).toBeNull();
      expect(stored.staffApprovedById).toBeNull();
      await expect(database.staffDecision.count()).resolves.toBe(0);
    });

    it("rejects an expired verification credential without changing authority", async () => {
      await service.register({
        fullName: "Template User",
        email: "user@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });
      const verificationToken = tokenFromLastMessage("Verify your email");
      await database.user.update({
        where: { email: "user@example.com" },
        data: { verificationTokenExpiresAt: new Date(0) },
      });

      await expect(
        service.verifyEmail(verificationToken),
      ).rejects.toBeInstanceOf(BadRequestException);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "user@example.com" },
      });
      expect(stored.status).toBe(UserStatus.PENDING_VERIFICATION);
      expect(stored.emailVerifiedAt).toBeNull();
      expect(stored.accessVersion).toBe(0);
      expect(stored.verificationTokenHash).not.toBeNull();
    });

    it("rejects a suspended candidate without activating it", async () => {
      await service.register({
        fullName: "Suspended User",
        email: "suspended@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });
      const verificationToken = tokenFromLastMessage("Verify your email");
      await database.user.update({
        where: { email: "suspended@example.com" },
        data: {
          status: UserStatus.SUSPENDED,
          emailVerifiedAt: new Date(),
        },
      });

      await expect(
        service.verifyEmail(verificationToken),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "suspended@example.com" },
      });
      expect(stored.status).toBe(UserStatus.SUSPENDED);
      expect(stored.accessVersion).toBe(0);
      expect(stored.verificationTokenHash).not.toBeNull();
    });

    it("consumes exactly one verification credential under concurrent requests", async () => {
      await service.register({
        fullName: "Concurrent User",
        email: "concurrent@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });
      const verificationToken = tokenFromLastMessage("Verify your email");

      const outcomes = await Promise.allSettled([
        service.verifyEmail(verificationToken),
        service.verifyEmail(verificationToken),
      ]);

      expect(outcomes.map(({ status }) => status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      if (rejected?.status !== "rejected") {
        throw new Error("Expected one rejected verification attempt.");
      }
      expect(rejected.reason).toBeInstanceOf(BadRequestException);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "concurrent@example.com" },
      });
      expect(stored.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(stored.accessVersion).toBe(1);
      expect(stored.verificationTokenHash).toBeNull();
    });

    it("replaces an expired verification credential when verification is resent", async () => {
      await service.register({
        fullName: "Resend User",
        email: "resend@example.com",
        phone: null,
        password: INITIAL_PASSWORD,
      });
      const oldToken = tokenFromLastMessage("Verify your email");
      await database.user.update({
        where: { email: "resend@example.com" },
        data: { verificationTokenExpiresAt: new Date(0) },
      });

      await service.resendVerification({ email: "resend@example.com" });
      await vi.waitFor(() => {
        expect(
          capturedMessages.filter(
            ({ subject }) => subject === "Verify your email",
          ),
        ).toHaveLength(2);
      });
      const newToken = tokenFromLastMessage("Verify your email");

      expect(newToken).not.toBe(oldToken);
      await expect(service.verifyEmail(oldToken)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.verifyEmail(newToken)).resolves.toMatchObject({
        user: { status: UserStatus.PENDING_APPROVAL },
      });
    });
  });

  describe("login and refresh", () => {
    it("establishes an identity session for a restricted identity", async () => {
      await createPendingEmployee("restricted@example.com");

      const login = await service.login({
        email: "restricted@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      expect(login.user.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(login.tokens.accessToken.length).toBeGreaterThan(0);
      const stored = await database.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(sha256(login.tokens.refreshToken));
      expect(stored[0]?.tokenHash).not.toBe(login.tokens.refreshToken);
    });

    it("creates no session from a stale credential snapshot", async () => {
      const account = await createPendingEmployee("stale-login@example.com");
      const replacement = await generateHash("replaced-secure-password");
      const observed = createObservedService(() =>
        database.user.update({
          where: { id: account.id },
          data: { passwordHash: replacement },
        }),
      );
      await expect(
        observed.login({
          email: account.email,
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await database.refreshToken.count()).toBe(0);
      expect(
        await database.user.findUnique({ where: { id: account.id } }),
      ).toMatchObject({
        passwordHash: replacement,
        status: account.status,
        accessVersion: account.accessVersion,
      });
    });

    it("rejects a wrong password without creating a session", async () => {
      await createPendingEmployee("restricted@example.com");

      await expect(
        service.login({
          email: "restricted@example.com",
          password: "a-wrong-password",
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(database.refreshToken.count()).resolves.toBe(0);
    });

    it("rejects an unknown identity without creating a session", async () => {
      await expect(
        service.login({
          email: "unknown@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(database.refreshToken.count()).resolves.toBe(0);
    });

    it("rotates one-time refresh credentials atomically", async () => {
      await createPendingEmployee("restricted@example.com");
      const login = await service.login({
        email: "restricted@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      const rotated = await service.refresh(login.tokens.refreshToken);

      expect(rotated.tokens.refreshToken).not.toBe(login.tokens.refreshToken);
      const stored = await database.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(sha256(rotated.tokens.refreshToken));
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("allows exactly one concurrent refresh to consume a credential", async () => {
      await createPendingEmployee("restricted@example.com");
      const login = await service.login({
        email: "restricted@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      const outcomes = await Promise.allSettled([
        service.refresh(login.tokens.refreshToken),
        service.refresh(login.tokens.refreshToken),
      ]);

      expect(outcomes.map(({ status }) => status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      await expect(database.refreshToken.count()).resolves.toBe(1);
    });

    it("returns the current database state rather than the issued session state", async () => {
      await createPendingEmployee("restricted@example.com");
      const login = await service.login({
        email: "restricted@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      await database.user.update({
        where: { email: "restricted@example.com" },
        data: { status: UserStatus.SUSPENDED },
      });

      const refreshed = await service.refresh(login.tokens.refreshToken);

      expect(refreshed.user.status).toBe(UserStatus.SUSPENDED);
    });
  });

  describe("recovery", () => {
    it("answers neutrally for an unknown and an ineligible identity", async () => {
      await createPendingEmployee("pending@example.com");

      const unknown = await service.forgotPassword({
        email: "unknown@example.com",
      });
      const ineligible = await service.forgotPassword({
        email: "pending@example.com",
      });

      expect(unknown).toEqual(ineligible);
      expect(capturedMessages).toHaveLength(0);
      const stored = await database.user.findUniqueOrThrow({
        where: { email: "pending@example.com" },
      });
      expect(stored.resetTokenHash).toBeNull();
    });

    it("issues a reset credential only for a business eligible identity", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);

      const response = await service.forgotPassword({
        email: "employee@example.com",
      });

      expect(typeof response.message).toBe("string");
      await vi.waitFor(() => {
        expect(capturedMessages).toHaveLength(1);
      });
      expect(capturedMessages[0]?.to).toBe("employee@example.com");
      expect(acknowledgedMessageIds).toHaveLength(1);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.resetTokenHash).toBe(
        sha256(tokenFromLastMessage("Reset your password")),
      );
      expect(stored.resetTokenExpiresAt).toBeInstanceOf(Date);
    });

    it("consumes a reset credential once and revokes every session", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");

      await expect(service.validateResetToken(resetToken)).resolves.toEqual({
        valid: true,
      });
      await service.resetPassword(
        {
          newPassword: "replacement-secure-password",
          passwordConfirmation: "replacement-secure-password",
        },
        resetToken,
      );

      await expect(
        service.validateResetToken(resetToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(database.refreshToken.count()).resolves.toBe(0);
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.login({
          email: "employee@example.com",
          password: "replacement-secure-password",
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { status: UserStatus.ACTIVE } });
    });

    it("rejects reusing the current password with 400", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");

      await expect(
        service.resetPassword(
          {
            newPassword: INITIAL_PASSWORD,
            passwordConfirmation: INITIAL_PASSWORD,
          },
          resetToken,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.resetTokenHash).not.toBeNull();
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("rejects a valid reset credential for a now suspended identity with 403", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      const observed = createObservedService(() =>
        database.user.update({
          where: { email: "employee@example.com" },
          data: { status: UserStatus.SUSPENDED },
        }),
      );

      await expect(
        observed.resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          resetToken,
        ),
      ).rejects.toBeInstanceOf(AccountRestrictedError);
      await expect(
        service.validateResetToken(resetToken),
      ).rejects.toBeInstanceOf(AccountRestrictedError);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.status).toBe(UserStatus.SUSPENDED);
      expect(stored.resetTokenHash).not.toBeNull();
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("rejects a wrong purpose credential with 401", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      const verificationToken = generateVerificationToken(
        "employee@example.com",
      );

      await expect(
        service.validateResetToken(verificationToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          verificationToken,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects an expired reset credential with 401", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      await database.user.update({
        where: { email: "employee@example.com" },
        data: { resetTokenExpiresAt: new Date(0) },
      });

      await expect(
        service.validateResetToken(resetToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          resetToken,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("re-evaluates the reset expiry against fresh server time inside the write transaction", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      await database.user.update({
        where: { email: "employee@example.com" },
        data: { resetTokenExpiresAt: new Date(Date.now() + 3_600_000) },
      });

      const observedService = createObservedService(() =>
        database.user.update({
          where: { email: "employee@example.com" },
          data: { resetTokenExpiresAt: new Date(0) },
        }),
      );

      const outcome = observedService
        .resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          resetToken,
        )
        .catch((error: unknown) => error);
      const result = await outcome;

      expect(result).toBeInstanceOf(UnauthorizedException);
      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.resetTokenHash).not.toBeNull();
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("denies a reset whose credential was replaced before the commit", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      const replacementToken = generateResetToken("employee@example.com");

      const observedService = createObservedService(() =>
        database.user.update({
          where: { email: "employee@example.com" },
          data: {
            resetTokenHash: sha256(replacementToken),
            resetTokenExpiresAt: new Date(Date.now() + 3_600_000),
          },
        }),
      );

      const outcome = observedService
        .resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          resetToken,
        )
        .catch((error: unknown) => error);
      const result = await outcome;

      expect(result).toBeInstanceOf(UnauthorizedException);
      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.resetTokenHash).toBe(sha256(replacementToken));
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("denies a reset whose password was replaced before the commit", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      const concurrentPasswordHash = await generateHash(
        "concurrent-secure-password",
      );

      const observedService = createObservedService(() =>
        database.user.update({
          where: { email: "employee@example.com" },
          data: { passwordHash: concurrentPasswordHash },
        }),
      );

      const outcome = observedService
        .resetPassword(
          {
            newPassword: "replacement-secure-password",
            passwordConfirmation: "replacement-secure-password",
          },
          resetToken,
        )
        .catch((error: unknown) => error);
      const result = await outcome;

      expect(result).toBeInstanceOf(UnauthorizedException);
      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.passwordHash).toBe(concurrentPasswordHash);
      await expect(
        service.login({
          email: "employee@example.com",
          password: "concurrent-secure-password",
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("rolls the password and the session revocation back together", async () => {
      const approver = await createApprover();
      await createApprovedEmployee("employee@example.com", approver.id);
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      await service.forgotPassword({ email: "employee@example.com" });
      const resetToken = tokenFromLastMessage("Reset your password");
      const storedBefore = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      const refreshBefore = await database.refreshToken.findMany();

      await database.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION reject_fixture_refresh_delete() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'forced refresh deletion failure';
        END;
        $$ LANGUAGE plpgsql;
      `);
      await database.$executeRawUnsafe(`
        CREATE TRIGGER reject_fixture_refresh_delete_trigger
        BEFORE DELETE ON "refresh_tokens"
        FOR EACH ROW EXECUTE FUNCTION reject_fixture_refresh_delete();
      `);

      try {
        await expect(
          service.resetPassword(
            {
              newPassword: "replacement-secure-password",
              passwordConfirmation: "replacement-secure-password",
            },
            resetToken,
          ),
        ).rejects.toBeInstanceOf(Error);
      } finally {
        await database.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS reject_fixture_refresh_delete_trigger ON "refresh_tokens"`,
        );
        await database.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS reject_fixture_refresh_delete()`,
        );
      }

      const storedAfter = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(storedAfter.passwordHash).toBe(storedBefore.passwordHash);
      expect(storedAfter.resetTokenHash).toBe(storedBefore.resetTokenHash);
      expect(storedAfter.accessVersion).toBe(storedBefore.accessVersion);
      expect(storedAfter.status).toBe(storedBefore.status);
      await expect(database.staffDecision.count()).resolves.toBe(0);
      const refreshAfter = await database.refreshToken.findMany();
      expect(refreshAfter).toHaveLength(refreshBefore.length);
      expect(refreshAfter[0]?.tokenHash).toBe(refreshBefore[0]?.tokenHash);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).resolves.toMatchObject({ user: { id: storedAfter.id } });
    });
  });

  describe("password change", () => {
    it("rolls back changePassword when session revocation fails", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "change-rollback@example.com",
        approver.id,
      );
      await service.login({
        email: employee.email,
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      await service.forgotPassword({ email: employee.email });
      const readAccount = () =>
        database.user.findUniqueOrThrow({ where: { id: employee.id } });
      const readSessions = () =>
        database.refreshToken.findMany({ where: { userId: employee.id } });
      const account = await readAccount();
      const sessions = await readSessions();
      expect(account.resetTokenHash).not.toBeNull();
      expect(sessions).toHaveLength(1);
      await withRefreshDeleteTrigger(
        "RAISE EXCEPTION 'forced refresh deletion failure';",
        async () => {
          await expect(
            service.changePassword(employee.id, {
              currentPassword: INITIAL_PASSWORD,
              newPassword: "replacement-secure-password",
              passwordConfirmation: "replacement-secure-password",
            }),
          ).rejects.toThrow(/forced refresh deletion failure/u);
        },
      );
      expect(await readAccount()).toEqual(account);
      expect(await readSessions()).toEqual(sessions);
      expect(await database.staffDecision.count()).toBe(0);
    });

    it("denies a password change after a suspension commits", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "suspended-during-change@example.com",
        approver.id,
      );
      await service.forgotPassword({ email: employee.email });
      const expected = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });
      const observed = createObservedService(() =>
        database.user.update({
          where: { id: employee.id },
          data: {
            status: UserStatus.SUSPENDED,
            accessVersion: { increment: 1 },
          },
        }),
      );
      await expect(
        observed.changePassword(employee.id, {
          currentPassword: INITIAL_PASSWORD,
          newPassword: "replacement-secure-password",
          passwordConfirmation: "replacement-secure-password",
        }),
      ).rejects.toBeInstanceOf(AccountRestrictedError);
      expect(
        await database.user.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({
        status: UserStatus.SUSPENDED,
        accessVersion: expected.accessVersion + 1,
        passwordHash: expected.passwordHash,
        resetTokenHash: expected.resetTokenHash,
        resetTokenExpiresAt: expected.resetTokenExpiresAt,
      });
    });

    it("changes the password and revokes every session", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      const changed = await service.changePassword(employee.id, {
        currentPassword: INITIAL_PASSWORD,
        newPassword: "changed-secure-password",
        passwordConfirmation: "changed-secure-password",
      });

      expect(changed.user.status).toBe(UserStatus.ACTIVE);
      await expect(database.refreshToken.count()).resolves.toBe(0);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.login({
          email: "employee@example.com",
          password: "changed-secure-password",
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: changed.user.id } });
    });

    it("rejects an incorrect current password with 400", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );

      await expect(
        service.changePassword(employee.id, {
          currentPassword: "a-wrong-password",
          newPassword: "changed-secure-password",
          passwordConfirmation: "changed-secure-password",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      await expect(
        service.login({
          email: "employee@example.com",
          password: INITIAL_PASSWORD,
          rememberMe: false,
        }),
      ).resolves.toMatchObject({ user: { id: stored.id } });
    });

    it("rejects a reused new password with 400", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );

      await expect(
        service.changePassword(employee.id, {
          currentPassword: INITIAL_PASSWORD,
          newPassword: INITIAL_PASSWORD,
          passwordConfirmation: INITIAL_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("denies a password change for a restricted identity with 403", async () => {
      const pending = await createPendingEmployee("pending@example.com");

      await expect(
        service.changePassword(pending.id, {
          currentPassword: INITIAL_PASSWORD,
          newPassword: "changed-secure-password",
          passwordConfirmation: "changed-secure-password",
        }),
      ).rejects.toBeInstanceOf(AccountRestrictedError);
    });

    it("denies a password change whose password was replaced before the commit", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      const concurrentPasswordHash = await generateHash(
        "concurrent-secure-password",
      );

      const observedService = createObservedService(() =>
        database.user.update({
          where: { email: "employee@example.com" },
          data: { passwordHash: concurrentPasswordHash },
        }),
      );

      const outcome = observedService
        .changePassword(employee.id, {
          currentPassword: INITIAL_PASSWORD,
          newPassword: "changed-secure-password",
          passwordConfirmation: "changed-secure-password",
        })
        .catch((error: unknown) => error);
      const result = await outcome;

      expect(result).toBeInstanceOf(BadRequestException);
      const stored = await database.user.findUniqueOrThrow({
        where: { email: "employee@example.com" },
      });
      expect(stored.passwordHash).toBe(concurrentPasswordHash);
    });
  });

  describe("logout", () => {
    it("deletes only the matching owned refresh credential", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      await createApprovedEmployee("other@example.com", approver.id);
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      const otherLogin = await service.login({
        email: "other@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      await service.logout(employee.id, login.tokens.refreshToken);

      const stored = await database.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.userId).not.toBe(login.user.id);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.refresh(otherLogin.tokens.refreshToken),
      ).resolves.toMatchObject({ user: { id: otherLogin.user.id } });
    });

    it("never revokes another identity with a foreign credential", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      await createApprovedEmployee("other@example.com", approver.id);
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      const otherLogin = await service.login({
        email: "other@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      await service.logout(employee.id, otherLogin.tokens.refreshToken);

      const stored = await database.refreshToken.findMany();
      expect(stored).toHaveLength(2);
      await expect(
        service.refresh(otherLogin.tokens.refreshToken),
      ).resolves.toMatchObject({ user: { id: otherLogin.user.id } });
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).resolves.toMatchObject({ user: { id: login.user.id } });
    });

    it("deletes every owned refresh credential on logout all", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      await createApprovedEmployee("other@example.com", approver.id);
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });
      const otherLogin = await service.login({
        email: "other@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      await service.logoutAll(employee.id);

      const stored = await database.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.userId).not.toBe(login.user.id);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.refresh(otherLogin.tokens.refreshToken),
      ).resolves.toMatchObject({ user: { id: otherLogin.user.id } });
    });

    it.each(["refresh", "logout-all"] as const)(
      "serializes a %s winner and ends with no refresh credentials",
      async (winner) => {
        const employee = await createPendingEmployee("logout-race@example.com");
        const login = await service.login({
          email: employee.email,
          password: INITIAL_PASSWORD,
          rememberMe: false,
        });
        const gate = createDatabaseClient(databaseUrl);
        const second = createDatabaseClient(databaseUrl);
        try {
          await withRefreshDeleteTrigger(
            "PERFORM pg_advisory_xact_lock(90212);",
            async () => {
              const locked = deferred();
              const release = deferred();
              const holding = gate.$transaction(
                async (tx) => {
                  await tx.$executeRaw`SELECT pg_advisory_xact_lock(90212)`;
                  locked.resolve();
                  await release.promise;
                },
                { timeout: 15_000 },
              );
              const holdingSettled = Promise.allSettled([holding]);
              const operations: Promise<unknown>[] = [];
              try {
                await Promise.race([locked.promise, holding]);
                const other = new AuthService(second, emailService);
                const refresh = () =>
                  (winner === "refresh" ? service : other).refresh(
                    login.tokens.refreshToken,
                  );
                const logout = () =>
                  (winner === "logout-all" ? service : other).logoutAll(
                    employee.id,
                  );
                const first = winner === "refresh" ? refresh() : logout();
                operations.push(Promise.allSettled([first]));
                const waitForDelete = async () => {
                  const [row] = await database.$queryRaw<
                    Array<{ pid: number }>
                  >`
                  SELECT pid FROM pg_locks
                   WHERE locktype = 'advisory' AND NOT granted AND classid = 0
                     AND objid = 90212 AND objsubid = 1
                `;
                  return row?.pid;
                };
                await expect
                  .poll(waitForDelete, { timeout: 4_000 })
                  .toBeTypeOf("number");
                const firstPid = await waitForDelete();
                const waiting = winner === "refresh" ? logout() : refresh();
                operations.push(Promise.allSettled([waiting]));
                await expect
                  .poll(
                    async () => {
                      const [row] = await database.$queryRaw<
                        Array<{ pid: number }>
                      >`
                  SELECT pid FROM pg_stat_activity
                   WHERE datname = current_database()
                     AND query LIKE '%FROM "users"%FOR %'
                     AND ${firstPid ?? -1}::int = ANY(pg_blocking_pids(pid))
                `;
                      return row?.pid;
                    },
                    { timeout: 4_000 },
                  )
                  .toBeTypeOf("number");
                release.resolve();
                await holding;
                if (winner === "refresh") {
                  await expect(first).resolves.toMatchObject({
                    user: { id: employee.id },
                  });
                  await expect(waiting).resolves.toBeUndefined();
                } else {
                  await expect(first).resolves.toBeUndefined();
                  await expect(waiting).rejects.toBeInstanceOf(
                    UnauthorizedException,
                  );
                }
                expect(
                  await database.refreshToken.count({
                    where: { userId: employee.id },
                  }),
                ).toBe(0);
              } finally {
                release.resolve();
                await holdingSettled;
                await Promise.all(operations);
              }
            },
          );
        } finally {
          await gate.$disconnect();
          await second.$disconnect();
        }
      },
      30_000,
    );

    it("keeps an already issued access credential valid after logout", async () => {
      const approver = await createApprover();
      const employee = await createApprovedEmployee(
        "employee@example.com",
        approver.id,
      );
      const login = await service.login({
        email: "employee@example.com",
        password: INITIAL_PASSWORD,
        rememberMe: false,
      });

      await service.logoutAll(employee.id);

      const verified = verifyAccessToken(login.tokens.accessToken);
      expect(verified.valid).toBe(true);
      await expect(
        service.refresh(login.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
