/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Supertest intentionally exposes response.body as any; boundary assertions validate every consumed field. */
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";

import pino from "pino";
import request, { type Response as SupertestResponse } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "@template/database";

import { createApp } from "./app.js";
import type {
  EmailDelivery,
  EmailSendRequest,
} from "./infrastructure/email/email-delivery.js";
import { InitialAdministratorService } from "./modules/auth/initial-administrator.service.js";
import { sha256 } from "./infrastructure/security/token-hasher.js";
import { resetOwnedIdentityTestData } from "./test-support/reset-test-data.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);
const initialAdministratorService = new InitialAdministratorService(database);

const delivered: EmailSendRequest[] = [];
let deliveryFailure: Error | undefined;
const delivery: EmailDelivery = {
  provider: "console",
  send: (message) => {
    if (deliveryFailure !== undefined) return Promise.reject(deliveryFailure);
    delivered.push(message);
    return Promise.resolve({
      providerMessageId: `test-${String(delivered.length)}`,
    });
  },
};
const app = createApp({
  database,
  logger: pino({ level: "silent" }),
  emailDelivery: delivery,
});

const PASSWORD = "initial-secure-password";
const NEW_PASSWORD = "changed-secure-password";
const RESET_PASSWORD = "reset-secure-password";

const describeResponse = ({ status, type }: SupertestResponse): string =>
  `HTTP ${String(status)} (${type})`;

type TestAgent = ReturnType<typeof request.agent>;

// All requests use the same owned loopback listener. Cookie jars are separate.
const server = createServer(app);
let origin: string;
let appAgent: TestAgent;
let adminAgent: TestAgent;

/**
 * The delivery of a resend or a recovery message is detached by design, so a
 * message can arrive after the response that requested it. Every lookup is
 * therefore correlated with its recipient instead of the delivery array
 * position.
 */
const deliveriesFor = (recipient: string): EmailSendRequest[] =>
  delivered.filter((message) => message.to === recipient);

const tokenFrom = (message: EmailSendRequest): string => {
  const match = message.html.match(/token=([^"&<]+)/u);
  if (match?.[1] === undefined) {
    throw new Error("Expected a token in the delivered message.");
  }
  return decodeURIComponent(match[1]);
};

/**
 * Waits for the delivered one-time credential that the account currently
 * holds. A detached message from an earlier request can still arrive, so the
 * candidate is only accepted when its fingerprint matches the token hash the
 * account stores right now.
 */
const waitForCurrentToken = async (
  recipient: string,
  userId: string,
  kind: "verification" | "reset",
): Promise<string> => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const account = await database.user.findUnique({
      where: { id: userId },
      select: { verificationTokenHash: true, resetTokenHash: true },
    });
    const expected =
      kind === "verification"
        ? (account?.verificationTokenHash ?? null)
        : (account?.resetTokenHash ?? null);
    if (expected !== null) {
      for (const message of [...deliveriesFor(recipient)].reverse()) {
        const candidate = tokenFrom(message);
        if (sha256(candidate) === expected) return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected a current one-time credential for ${recipient}.`);
};

const setCookies = (response: SupertestResponse): string[] => {
  const value: unknown = response.headers["set-cookie"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
};

const cookiePair = (response: SupertestResponse, name: string): string => {
  const pair = setCookies(response)
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (pair === undefined) throw new Error(`Missing ${name} cookie.`);
  return pair;
};

const cookieValue = (pair: string): string =>
  decodeURIComponent(pair.slice(pair.indexOf("=") + 1));

type RegisteredAccount = {
  email: string;
  id: string;
  accessVersion: number;
  status: string;
};

/**
 * Registers and verifies one synthetic account over the real HTTP boundary and
 * returns its current database state.
 */
const registerAndVerify = async (
  localPart: string,
  password: string = PASSWORD,
): Promise<RegisteredAccount> => {
  const email = `${localPart}@example.com`;
  const registered = await request(origin)
    .post("/api/v1/auth/register")
    .send({ fullName: `HTTP ${localPart}`, email, phone: null, password });
  expect(registered.status, describeResponse(registered)).toBe(201);

  const registeredUserId = registered.body.data.user.id as string;
  const verificationToken = await waitForCurrentToken(
    email,
    registeredUserId,
    "verification",
  );

  const verified = await request(origin)
    .post("/api/v1/auth/verify-email")
    .query({ token: verificationToken })
    .send({});
  expect(verified.status).toBe(200);
  expect(verified.body.data.user).toMatchObject({
    id: registeredUserId,
    status: "PENDING_APPROVAL",
  });

  const row = await database.user.findUniqueOrThrow({ where: { email } });
  return {
    email,
    id: row.id,
    accessVersion: row.accessVersion,
    status: row.status,
  };
};

type Session = {
  agent: TestAgent;
  accessToken: string;
  csrfToken: string;
  response: SupertestResponse;
};

const login = async (
  email: string,
  password: string = PASSWORD,
  rememberMe = false,
  agent?: TestAgent,
): Promise<Session> => {
  const sessionAgent = agent ?? appAgent;
  const response = await sessionAgent
    .post("/api/v1/auth/login")
    .send({ email, password, rememberMe });
  expect(response.status, describeResponse(response)).toBe(200);
  return {
    agent: sessionAgent,
    response,
    accessToken: response.body.data.tokens.accessToken as string,
    csrfToken: cookieValue(cookiePair(response, "csrfToken")),
  };
};

/**
 * Establishes the single test administrator through the restricted
 * initial-administrator service, never through a public promotion route.
 */
const establishTestAdministrator = async (
  localPart = "initial.admin",
): Promise<{ account: RegisteredAccount; session: Session }> => {
  const candidate = await registerAndVerify(localPart);
  const row = await database.user.findUniqueOrThrow({
    where: { email: candidate.email },
  });
  expect(row.status).toBe("PENDING_APPROVAL");
  expect(row.department).toBeNull();
  expect(row.staffApprovedAt).toBeNull();

  await initialAdministratorService.apply({
    userId: row.id,
    expectedEmail: row.email,
    expectedAccessVersion: row.accessVersion,
    operatorReference: "app-integration-fixture",
  });

  const account: RegisteredAccount = {
    email: candidate.email,
    id: candidate.id,
    accessVersion: row.accessVersion + 1,
    status: "ACTIVE",
  };
  return {
    account,
    session: await login(account.email, PASSWORD, false, adminAgent),
  };
};

const staffRequest = (
  session: Session,
  method: "get" | "post" | "patch",
  path: string,
  body?: Record<string, unknown>,
): request.Test => {
  const pending = session.agent[method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${session.accessToken}`)
    .set("x-csrf-token", session.csrfToken);
  return body === undefined ? pending : pending.send(body);
};

describe("actual Express account, staff authority and privacy boundary", () => {
  beforeAll(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The owned HTTP listener has no TCP address.");
    }
    origin = `http://127.0.0.1:${String(address.port)}`;
    appAgent = request.agent(origin);
    adminAgent = request.agent(origin);
  });

  beforeEach(async () => {
    delivered.length = 0;
    deliveryFailure = undefined;
    await resetOwnedIdentityTestData(database);
  });

  afterAll(async () => {
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) resolve();
            else reject(error);
          });
        });
      }
      await resetOwnedIdentityTestData(database);
    } finally {
      await database.$disconnect();
    }
  });

  describe("identity versus business authority", () => {
    it("registers an unverified employee that holds only an identity session", async () => {
      const registered = await request(origin)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Pending Employee",
          email: "pending.employee@example.com",
          phone: null,
          password: PASSWORD,
        });

      expect(registered.status).toBe(201);
      expect(registered.body.data.user).toMatchObject({
        email: "pending.employee@example.com",
        status: "PENDING_VERIFICATION",
        department: null,
        staffApprovedAt: null,
        accessVersion: 0,
      });
      expect(registered.body.data.user).not.toHaveProperty("passwordHash");
      expect(registered.body.data.user).not.toHaveProperty("staffApprovedById");

      // A correct credential still opens a private identity session for an
      // unverified account; it grants no business eligibility.
      const session = await login("pending.employee@example.com");
      expect(session.response.status).toBe(200);
      expect(session.response.body.data.user).toMatchObject({
        status: "PENDING_VERIFICATION",
        department: null,
      });

      const me = await session.agent
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.status).toBe("PENDING_VERIFICATION");

      const profile = await session.agent
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .set("x-csrf-token", session.csrfToken)
        .send({ fullName: "Denied Update" });
      expect(profile.status).toBe(403);
      expect(profile.body.code).toBe("ACCOUNT_RESTRICTED");

      const staff = await staffRequest(session, "get", "/staff");
      expect(staff.status).toBe(403);
      expect(staff.body.code).toBe("ACCOUNT_RESTRICTED");
    });

    it("verifies an employee into pending approval without approving it", async () => {
      const registered = await request(origin)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Verified Employee",
          email: "verified.employee@example.com",
          phone: null,
          password: PASSWORD,
        });
      expect(registered.status).toBe(201);

      const verifiedUserId = registered.body.data.user.id as string;
      const verificationToken = await waitForCurrentToken(
        "verified.employee@example.com",
        verifiedUserId,
        "verification",
      );
      const verified = await request(origin)
        .post("/api/v1/auth/verify-email")
        .query({ token: verificationToken })
        .send({});
      expect(verified.status).toBe(200);
      expect(verified.body.data.user).toMatchObject({
        id: verifiedUserId,
        status: "PENDING_APPROVAL",
        department: null,
        staffApprovedAt: null,
        role: "USER",
      });

      const row = await database.user.findUniqueOrThrow({
        where: { email: "verified.employee@example.com" },
      });
      expect(row.department).toBeNull();
      expect(row.staffApprovedAt).toBeNull();
      expect(row.staffApprovedById).toBeNull();
      expect(row.accessVersion).toBe(1);
      await expect(database.staffDecision.count()).resolves.toBe(0);
    });

    it("lets a restricted identity read its own status but denies business work", async () => {
      const employee = await registerAndVerify("restricted.employee");
      const session = await login(employee.email);

      const me = await session.agent
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user).toMatchObject({
        status: "PENDING_APPROVAL",
        department: null,
        staffApprovedAt: null,
      });

      const profile = await session.agent
        .patch("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .set("x-csrf-token", session.csrfToken)
        .send({ fullName: "Denied Update" });
      expect(profile.status).toBe(403);
      expect(profile.body.code).toBe("ACCOUNT_RESTRICTED");

      const staff = await staffRequest(session, "get", "/staff");
      expect(staff.status).toBe(403);
      expect(staff.body.code).toBe("ACCOUNT_RESTRICTED");

      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.fullName).toBe("HTTP restricted.employee");
      expect(row.accessVersion).toBe(employee.accessVersion);
    });

    it("keeps a suspended identity readable but not eligible", async () => {
      const employee = await registerAndVerify("suspended.employee");
      await database.user.update({
        where: { email: employee.email },
        data: { status: "SUSPENDED" },
      });

      const session = await login(employee.email);
      const me = await session.agent
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.status).toBe("SUSPENDED");

      const staff = await staffRequest(session, "get", "/staff");
      expect(staff.status).toBe(403);
      expect(staff.body.code).toBe("ACCOUNT_RESTRICTED");
    });

    it("answers a wrong credential and a missing identity with a safe 401", async () => {
      const employee = await registerAndVerify("wrong.credential");

      await request(origin)
        .post("/api/v1/auth/login")
        .send({
          email: employee.email,
          password: "not-the-password",
          rememberMe: false,
        })
        .expect(401);

      await request(origin).get("/api/v1/users/me").expect(401);
      await request(origin).get("/api/v1/staff").expect(401);
    });

    it("keeps a duplicate registration a 409 without lifecycle detail", async () => {
      await registerAndVerify("duplicate.email");

      const duplicate = await request(origin)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Duplicate Email",
          email: "duplicate.email@example.com",
          phone: null,
          password: PASSWORD,
        });
      expect(duplicate.status).toBe(409);
      expect(JSON.stringify(duplicate.body)).not.toContain(
        "PENDING_VERIFICATION",
      );
    });
  });

  describe("staff management over the actual HTTP stack", () => {
    it("approves an employee through the real staff route and persists the decision", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("approved.employee");

      const command = {
        commandId: randomUUID(),
        expectedAccessVersion: employee.accessVersion,
        department: "SALES",
      };
      const approve = (body: typeof command) =>
        staffRequest(session, "post", `/staff/${employee.id}/approve`, body);
      const approved = await approve(command);
      expect(approved.status).toBe(200);
      expect(approved.body.data.staff).toMatchObject({
        id: employee.id,
        status: "ACTIVE",
        role: "USER",
        department: "SALES",
      });
      expect(approved.body.data.decision).toMatchObject({
        action: "APPROVE",
        targetUserId: employee.id,
      });
      expect(approved.body.data.replayed).toBe(false);

      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.status).toBe("ACTIVE");
      expect(row.department).toBe("SALES");
      expect(row.staffApprovedAt).not.toBeNull();
      expect(row.accessVersion).toBe(employee.accessVersion + 1);
      const replay = await approve(command).expect(200);
      expect(replay.body).toEqual({
        ...approved.body,
        requestId: expect.any(String),
        timestamp: expect.any(String),
        data: { ...approved.body.data, replayed: true },
      });
      const noOp = await approve({
        ...command,
        commandId: randomUUID(),
        expectedAccessVersion: row.accessVersion,
      }).expect(200);
      expect(noOp.body).toEqual({
        ...approved.body,
        requestId: expect.any(String),
        timestamp: expect.any(String),
        data: {
          staff: approved.body.data.staff,
          decision: null,
          replayed: false,
        },
      });
      const binding = await approve({
        ...command,
        department: "CUTTING",
      }).expect(409);
      expect(binding.body).toMatchObject({ code: "STAFF_COMMAND_CONFLICT" });
      expect(binding.body).not.toHaveProperty("data");
      const transition = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/reject`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: row.accessVersion,
        },
      ).expect(409);
      expect(transition.body).toMatchObject({
        code: "STAFF_TRANSITION_CONFLICT",
      });
      expect(transition.body).not.toHaveProperty("data");
      expect(
        await database.user.findUnique({ where: { id: employee.id } }),
      ).toEqual(row);
      await expect(database.staffDecision.count()).resolves.toBe(1);
    });

    it("lists the staff directory with a verified-pending count", async () => {
      const { session } = await establishTestAdministrator();
      const pending = await registerAndVerify("listed.pending");
      const approved = await registerAndVerify("listed.approved");

      await staffRequest(session, "post", `/staff/${approved.id}/approve`, {
        commandId: randomUUID(),
        expectedAccessVersion: approved.accessVersion,
        department: "CUTTING",
      }).expect(200);

      const list = await staffRequest(session, "get", "/staff?scope=all");
      expect(list.status).toBe(200);
      expect(list.body.data.pendingCount).toBe(1);
      const listedStaff = list.body.data.staff as Array<{ email: string }>;
      expect(listedStaff.map((entry) => entry.email)).toEqual(
        expect.arrayContaining([pending.email, approved.email]),
      );
      expect(list.body.data.pagination).toMatchObject({ page: 1, limit: 25 });

      const pendingOnly = await staffRequest(
        session,
        "get",
        "/staff?scope=pending",
      );
      expect(pendingOnly.status).toBe(200);
      expect(pendingOnly.body.data.pendingCount).toBe(1);
      const pendingStaff = pendingOnly.body.data.staff as Array<{
        email: string;
      }>;
      expect(pendingStaff.map((entry) => entry.email)).toEqual([pending.email]);
    });

    it("reads one staff account and its retained decisions", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("history.employee");

      await staffRequest(session, "post", `/staff/${employee.id}/approve`, {
        commandId: randomUUID(),
        expectedAccessVersion: employee.accessVersion,
        department: "WAREHOUSE",
      }).expect(200);

      const detail = await staffRequest(
        session,
        "get",
        `/staff/${employee.id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.staff).toMatchObject({
        id: employee.id,
        department: "WAREHOUSE",
      });
      expect(detail.body.data.staff).not.toHaveProperty("staffApprovedById");

      const history = await staffRequest(
        session,
        "get",
        `/staff/${employee.id}/decisions`,
      );
      expect(history.status).toBe(200);
      expect(history.body.data.decisions).toHaveLength(1);
      expect(history.body.data.decisions[0]).toMatchObject({
        action: "APPROVE",
        targetUserId: employee.id,
      });
      expect(history.body.data.decisions[0]?.actor).toMatchObject({
        role: "ADMIN",
        department: null,
      });
    });

    it("rejects a pending employee and keeps the rejection persisted", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("rejected.employee");

      const rejected = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/reject`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
        },
      );
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.staff.status).toBe("REJECTED");
      expect(rejected.body.data.staff.department).toBeNull();

      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.status).toBe("REJECTED");
      await expect(database.staffDecision.count()).resolves.toBe(1);
    });

    it("changes the department of an approved employee", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("department.employee");

      await staffRequest(session, "post", `/staff/${employee.id}/approve`, {
        commandId: randomUUID(),
        expectedAccessVersion: employee.accessVersion,
        department: "SALES",
      }).expect(200);

      const changed = await staffRequest(
        session,
        "patch",
        `/staff/${employee.id}/department`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion + 1,
          department: "QUALITY",
        },
      );
      expect(changed.status).toBe(200);
      expect(changed.body.data.staff.department).toBe("QUALITY");

      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.department).toBe("QUALITY");
      expect(row.staffApprovedAt).not.toBeNull();
    });

    it("suspends and reactivates an approved employee", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("lifecycle.employee");

      await staffRequest(session, "post", `/staff/${employee.id}/approve`, {
        commandId: randomUUID(),
        expectedAccessVersion: employee.accessVersion,
        department: "PRODUCTION",
      }).expect(200);

      const suspended = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/suspend`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion + 1,
        },
      );
      expect(suspended.status).toBe(200);
      expect(suspended.body.data.staff.status).toBe("SUSPENDED");

      const reactivated = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/reactivate`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion + 2,
        },
      );
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.data.staff.status).toBe("ACTIVE");
      expect(reactivated.body.data.staff.department).toBe("PRODUCTION");
      await expect(database.staffDecision.count()).resolves.toBe(3);
    });

    it("denies a non-administrator caller without leaking the directory", async () => {
      const { session: adminSession } = await establishTestAdministrator();
      const employee = await registerAndVerify("non.admin.employee");

      await staffRequest(
        adminSession,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
          department: "SALES",
        },
      ).expect(200);

      const employeeSession = await login(employee.email);
      const list = await staffRequest(employeeSession, "get", "/staff");
      expect(list.status).toBe(403);
      expect(list.body).not.toHaveProperty("data");
      expect(JSON.stringify(list.body)).not.toContain("pendingCount");
      const existing = await staffRequest(
        employeeSession,
        "get",
        `/staff/${employee.id}`,
      ).expect(403);
      const missing = await staffRequest(
        employeeSession,
        "get",
        `/staff/${randomUUID()}`,
      ).expect(403);
      expect(existing.body).toEqual({
        ...missing.body,
        path: `/api/v1/staff/${employee.id}`,
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });
      expect(existing.body.code).toBe("FORBIDDEN");
      expect(existing.body).not.toHaveProperty("data");
    });

    it("denies an administrator target and a missing target", async () => {
      const { session, account } = await establishTestAdministrator();
      await registerAndVerify("target.employee");

      const adminTarget = await staffRequest(
        session,
        "post",
        `/staff/${account.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: account.accessVersion,
          department: "SALES",
        },
      );
      expect(adminTarget.status).toBe(403);
      expect(adminTarget.body.code).toBe("STAFF_ADMIN_TARGET_FORBIDDEN");

      const missingTarget = await staffRequest(
        session,
        "post",
        `/staff/${randomUUID()}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: 0,
          department: "SALES",
        },
      );
      expect(missingTarget.status).toBe(404);
      expect(missingTarget.body.code).toBe("STAFF_NOT_FOUND");
    });

    it("rejects a stale expected version without appending a decision", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("stale.employee");

      const stale = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion + 5,
          department: "SALES",
        },
      );
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("STAFF_ACCESS_CONFLICT");

      await expect(database.staffDecision.count()).resolves.toBe(0);
      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.status).toBe("PENDING_APPROVAL");
      expect(row.accessVersion).toBe(employee.accessVersion);
    });

    it("rejects a malformed staff command body with a field error", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("malformed.employee");

      const malformed = await staffRequest(
        session,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: "not-a-uuid",
          expectedAccessVersion: "1",
        },
      );
      expect(malformed.status).toBe(400);
      expect(malformed.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "body.commandId" }),
          expect.objectContaining({ field: "body.expectedAccessVersion" }),
        ]),
      );
      await expect(database.staffDecision.count()).resolves.toBe(0);
    });

    it("requires the CSRF header on a staff write", async () => {
      const { session } = await establishTestAdministrator();
      const employee = await registerAndVerify("csrf.employee");

      const withoutCsrf = await session.agent
        .post(`/api/v1/staff/${employee.id}/approve`)
        .set("Authorization", `Bearer ${session.accessToken}`)
        .send({
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
          department: "SALES",
        });
      expect(withoutCsrf.status).toBe(403);
      await expect(database.staffDecision.count()).resolves.toBe(0);
    });
  });

  describe("current authority after a saved restriction", () => {
    it("loses business authority after a saved suspension even with the old session", async () => {
      const { session: adminSession } = await establishTestAdministrator();
      const employee = await registerAndVerify("old.session.employee");

      await staffRequest(
        adminSession,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
          department: "SALES",
        },
      ).expect(200);

      const employeeSession = await login(employee.email);
      const before = await staffRequest(employeeSession, "patch", "/users/me", {
        fullName: "Eligible Profile Save",
        phone: "+201000000000",
      }).expect(200);
      expect(before.body.data.user).toMatchObject({
        id: employee.id,
        fullName: "Eligible Profile Save",
        phone: "+201000000000",
      });
      const unsupported = await staffRequest(
        employeeSession,
        "patch",
        "/users/me",
        {
          fullName: "Unsupported Save",
          role: "ADMIN",
        },
      ).expect(400);
      expect(unsupported.body).not.toHaveProperty("data");
      expect(
        await database.user.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({
        fullName: "Eligible Profile Save",
        phone: "+201000000000",
        role: "USER",
      });
      await request(origin)
        .post("/api/v1/auth/forgot-password")
        .send({ email: employee.email })
        .expect(200);
      const resetToken = await waitForCurrentToken(
        employee.email,
        employee.id,
        "reset",
      );

      await staffRequest(
        adminSession,
        "post",
        `/staff/${employee.id}/suspend`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion + 1,
        },
      ).expect(200);

      const suspended = await database.user.findUniqueOrThrow({
        where: { id: employee.id },
      });
      const after = await staffRequest(employeeSession, "patch", "/users/me", {
        fullName: "Denied Profile Save",
        phone: null,
      }).expect(403);
      expect(after.body.code).toBe("ACCOUNT_RESTRICTED");
      expect(after.body).not.toHaveProperty("data");

      const reset = await request(origin)
        .post("/api/v1/auth/reset-password")
        .query({ token: resetToken })
        .send({
          newPassword: RESET_PASSWORD,
          passwordConfirmation: RESET_PASSWORD,
        })
        .expect(403);
      expect(reset.body.code).toBe("ACCOUNT_RESTRICTED");
      expect(reset.body).not.toHaveProperty("data");
      expect(
        await database.user.findUnique({ where: { id: employee.id } }),
      ).toEqual(suspended);
      expect(await database.staffDecision.count()).toBe(2);

      const me = await employeeSession.agent
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${employeeSession.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.status).toBe("SUSPENDED");
    });
  });

  describe("session, cookie and recovery regressions", () => {
    it("rotates the refresh token once and rejects a replay or a missing cookie", async () => {
      const employee = await registerAndVerify("refresh.employee");
      const session = await login(employee.email, PASSWORD, true);
      const oldRefreshCookie = cookiePair(session.response, "refreshToken");
      const oldCsrfCookie = cookiePair(session.response, "csrfToken");

      const refreshed = await session.agent
        .post("/api/v1/auth/refresh")
        .set("x-csrf-token", session.csrfToken)
        .send({});
      expect(refreshed.status).toBe(200);

      const replay = await request(origin)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `${oldRefreshCookie}; ${oldCsrfCookie}`)
        .set("x-csrf-token", cookieValue(oldCsrfCookie))
        .send({});
      expect(replay.status).toBe(401);

      const missing = await request(origin)
        .post("/api/v1/auth/refresh")
        .send({});
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("BAD_REQUEST");
    });

    it("keeps the refresh cookie HttpOnly and the CSRF cookie readable", async () => {
      const employee = await registerAndVerify("cookie.employee");
      const session = await login(employee.email, PASSWORD, true);

      expect(
        setCookies(session.response).find((cookie) =>
          cookie.startsWith("refreshToken="),
        ),
      ).toContain("HttpOnly");
      expect(
        setCookies(session.response).find((cookie) =>
          cookie.startsWith("csrfToken="),
        ),
      ).not.toContain("HttpOnly");
      expect(JSON.stringify(session.response.body)).not.toContain(
        "refreshToken",
      );
      expect(session.response.body.data.tokens).toEqual({
        accessToken: expect.any(String),
      });
    });

    it("revokes only the current session on logout and every session on logout-all", async () => {
      const employee = await registerAndVerify("logout.employee");
      const sessionA = await login(employee.email);
      // The second session needs its own cookie jar.
      const sessionB = await login(
        employee.email,
        PASSWORD,
        false,
        request.agent(app),
      );
      expect(await database.refreshToken.count()).toBe(2);

      const logout = await sessionA.agent
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${sessionA.accessToken}`)
        .set("x-csrf-token", sessionA.csrfToken)
        .send({});
      expect(logout.status).toBe(200);
      expect(await database.refreshToken.count()).toBe(1);

      const logoutAll = await sessionB.agent
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${sessionB.accessToken}`)
        .set("x-csrf-token", sessionB.csrfToken)
        .send({});
      expect(logoutAll.status).toBe(200);
      expect(await database.refreshToken.count()).toBe(0);
    });

    it("changes the password, revokes the sessions and leaves the approval untouched", async () => {
      const { session: adminSession } = await establishTestAdministrator();
      const employee = await registerAndVerify("password.employee");

      await staffRequest(
        adminSession,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
          department: "SALES",
        },
      ).expect(200);

      const session = await login(employee.email);
      for (const [currentPassword, newPassword, code] of [
        ["incorrect-secure-password", NEW_PASSWORD, "BAD_REQUEST"],
        [PASSWORD, PASSWORD, "VALIDATION_ERROR"],
      ]) {
        const denied = await staffRequest(
          session,
          "patch",
          "/auth/change-password",
          {
            currentPassword,
            newPassword,
            passwordConfirmation: newPassword,
          },
        ).expect(400);
        expect(denied.body.code).toBe(code);
        expect(denied.body).not.toHaveProperty("data");
      }
      expect(
        await database.refreshToken.count({ where: { userId: employee.id } }),
      ).toBe(1);
      const changed = await session.agent
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .set("x-csrf-token", session.csrfToken)
        .send({
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        });
      expect(changed.status).toBe(200);
      await expect(
        database.refreshToken.count({
          where: {
            userId: (
              await database.user.findUniqueOrThrow({
                where: { email: employee.email },
              })
            ).id,
          },
        }),
      ).resolves.toBe(0);

      const row = await database.user.findUniqueOrThrow({
        where: { email: employee.email },
      });
      expect(row.status).toBe("ACTIVE");
      expect(row.department).toBe("SALES");
      expect(row.accessVersion).toBe(employee.accessVersion + 1);
      await expect(database.staffDecision.count()).resolves.toBe(1);

      await request(origin)
        .post("/api/v1/auth/login")
        .send({
          email: employee.email,
          password: PASSWORD,
          rememberMe: false,
        })
        .expect(401);
      await request(origin)
        .post("/api/v1/auth/login")
        .send({
          email: employee.email,
          password: NEW_PASSWORD,
          rememberMe: false,
        })
        .expect(200);
    });

    it("keeps recovery neutral, consumes the reset once and revokes the sessions", async () => {
      const { session: adminSession } = await establishTestAdministrator();
      const employee = await registerAndVerify("recovery.employee");

      // Only a business-eligible identity receives the recovery message.
      await staffRequest(
        adminSession,
        "post",
        `/staff/${employee.id}/approve`,
        {
          commandId: randomUUID(),
          expectedAccessVersion: employee.accessVersion,
          department: "SALES",
        },
      ).expect(200);

      const session = await login(employee.email);

      const unknownRecovery = await request(origin)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "unknown@example.com" });
      const knownRecovery = await request(origin)
        .post("/api/v1/auth/forgot-password")
        .send({ email: employee.email });
      expect(unknownRecovery.body.data).toEqual(knownRecovery.body.data);
      // An unknown address never receives a message.
      expect(deliveriesFor("unknown@example.com")).toHaveLength(0);

      const resetToken = await waitForCurrentToken(
        employee.email,
        employee.id,
        "reset",
      );
      const submitReset = (token: string) =>
        request(origin)
          .post("/api/v1/auth/reset-password")
          .query({ token })
          .send({
            newPassword: RESET_PASSWORD,
            passwordConfirmation: RESET_PASSWORD,
          });
      const invalid = await submitReset("invalid-reset-credential").expect(401);
      expect(invalid.body.code).toBe("UNAUTHORIZED");
      await database.user.update({
        where: { id: employee.id },
        data: { resetTokenExpiresAt: new Date(0) },
      });
      const expired = await submitReset(resetToken).expect(401);
      expect(expired.body).toEqual({
        ...invalid.body,
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });
      await database.user.update({
        where: { id: employee.id },
        data: { resetTokenExpiresAt: new Date(Date.now() + 60_000) },
      });
      await request(origin)
        .get("/api/v1/auth/validate-reset-token")
        .query({ token: resetToken })
        .expect(200);
      await request(origin)
        .post("/api/v1/auth/reset-password")
        .query({ token: resetToken })
        .send({
          newPassword: RESET_PASSWORD,
          passwordConfirmation: RESET_PASSWORD,
        })
        .expect(200);
      await request(origin)
        .get("/api/v1/auth/validate-reset-token")
        .query({ token: resetToken })
        .expect(401);
      const consumed = await submitReset(resetToken).expect(401);
      expect(consumed.body).toEqual({
        ...invalid.body,
        requestId: expect.any(String),
        timestamp: expect.any(String),
      });
      await session.agent
        .post("/api/v1/auth/refresh")
        .set("x-csrf-token", session.csrfToken)
        .send({})
        .expect(401);
    });

    it("keeps a private account result out of an intermediary cache", async () => {
      const employee = await registerAndVerify("cache.employee");
      const session = await login(employee.email);

      const me = await session.agent
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${session.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.headers["cache-control"]).toContain("no-store");
    });

    it("refuses a repeated account-scoped request once its limiter is reached", async () => {
      const target = "rate.limited@example.com";
      const statuses: number[] = [];

      // The account-scoped resend limiter allows five attempts per hour.
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await request(origin)
          .post("/api/v1/auth/resend-verification")
          .send({ email: target });
        statuses.push(response.status);
        if (response.status === 429) {
          expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
        }
      }

      expect(statuses.at(-1)).toBe(429);
      expect(
        statuses.filter((status) => status === 429).length,
      ).toBeGreaterThan(0);
    });

    it("returns a safe 503 and rolls registration back when delivery is unavailable", async () => {
      const providerDetail = "provider failure containing re_secret_fixture";
      deliveryFailure = new Error(providerDetail);

      const failed = await request(origin).post("/api/v1/auth/register").send({
        fullName: "Delivery Failure",
        email: "delivery.failure@example.com",
        phone: null,
        password: PASSWORD,
      });

      expect(failed.status).toBe(503);
      expect(JSON.stringify(failed.body)).not.toContain(providerDetail);
      await expect(database.user.count()).resolves.toBe(0);
    });
  });
});
