/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Supertest intentionally exposes response.body as any; boundary assertions validate every consumed field. */
import express, { type Application } from "express";
import jwt from "jsonwebtoken";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDatabaseClient,
  Department,
  type DatabaseClient,
  UserRole,
  UserStatus,
} from "@template/database";

import { jwtConfig } from "../core/config/auth.config.js";
import {
  errorHandlerMiddleware,
  requestIdMiddleware,
} from "../middlewares/index.js";
import { generateTokenPair } from "../infrastructure/security/jwt.service.js";
import { createRequestLoggerMiddleware } from "../middlewares/request-logger.middleware.js";
import { resetOwnedIdentityTestData } from "../test-support/reset-test-data.js";
import {
  createAuthenticationMiddleware,
  createIdentityAuthenticationMiddleware,
} from "./auth.middleware.js";
import { authorizeDepartments } from "./authorization.middleware.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("The Testcontainers DATABASE_URL was not provided.");
}

const database: DatabaseClient = createDatabaseClient(databaseUrl);

const ADMIN_ID = "cccccccc-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "dddddddd-4444-4444-8444-444444444444";
const RESTRICTED_ID = "eeeeeeee-5555-4555-8555-555555555555";

const protectedHandler = vi.fn(
  (_request: express.Request, response: express.Response): void => {
    response.json({ user: _request.user });
  },
);

const createFixtureApp = (): Application => {
  const app = express();
  const logger = pino({ level: "silent" });

  app.use(requestIdMiddleware);
  app.use(createRequestLoggerMiddleware(logger));
  app.use(express.json());

  const identity = createIdentityAuthenticationMiddleware(database);
  const business = createAuthenticationMiddleware(database);

  app.get("/identity", identity, protectedHandler);
  app.get("/business", business, protectedHandler);
  app.get(
    "/department",
    business,
    authorizeDepartments(Department.SALES),
    protectedHandler,
  );

  app.use(errorHandlerMiddleware);
  return app;
};

const app = createFixtureApp();

const accessTokenFor = (
  userId: string,
  role: UserRole,
  email: string,
): string =>
  generateTokenPair({
    userId,
    tokenId: "44444444-4444-4444-8444-444444444444",
    role,
    email,
    rememberMe: false,
    absoluteExpiresAt: new Date(Date.now() + 3_600_000),
  }).accessToken;

const expiredTokenFor = (
  userId: string,
  role: UserRole,
  email: string,
): string =>
  jwt.sign(
    {
      sub: userId,
      jti: "55555555-5555-4555-8555-555555555555",
      userId,
      tokenId: "55555555-5555-4555-8555-555555555555",
      role,
      email,
      type: "ACCESS",
    },
    jwtConfig.accessSecret,
    {
      algorithm: "HS256",
      expiresIn: -60,
      issuer: "full-stack-boilerplate",
      audience: "full-stack-boilerplate-web",
    },
  );

const employeeToken = (): string =>
  accessTokenFor(EMPLOYEE_ID, UserRole.USER, "authority.employee@example.com");
const restrictedToken = (): string =>
  accessTokenFor(
    RESTRICTED_ID,
    UserRole.USER,
    "authority.restricted@example.com",
  );
const adminToken = (): string =>
  accessTokenFor(ADMIN_ID, UserRole.ADMIN, "authority.admin@example.com");

beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  protectedHandler.mockClear();

  await database.user.create({
    data: {
      id: ADMIN_ID,
      email: "authority.admin@example.com",
      passwordHash: "argon2-test-hash",
      fullName: "Authority Admin",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  await database.user.create({
    data: {
      id: EMPLOYEE_ID,
      email: "authority.employee@example.com",
      passwordHash: "argon2-test-hash",
      fullName: "Authority Employee",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      department: Department.SALES,
      staffApprovedAt: new Date(),
      staffApprovedById: ADMIN_ID,
    },
  });
  await database.user.create({
    data: {
      id: RESTRICTED_ID,
      email: "authority.restricted@example.com",
      passwordHash: "argon2-test-hash",
      fullName: "Authority Restricted",
      role: UserRole.USER,
      status: UserStatus.PENDING_APPROVAL,
      emailVerifiedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

const bearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

describe("identity and business middleware over the real application stack", () => {
  it("lets a restricted identity read its own current status but denies business work", async () => {
    const identityResponse = await request(app)
      .get("/identity")
      .set(bearer(restrictedToken()));
    expect(identityResponse.status).toBe(200);
    expect(identityResponse.body.user.status).toBe("PENDING_APPROVAL");
    expect(identityResponse.body.user.department).toBeNull();

    const businessResponse = await request(app)
      .get("/business")
      .set(bearer(restrictedToken()));
    expect(businessResponse.status).toBe(403);
    expect(businessResponse.body.code).toBe("ACCOUNT_RESTRICTED");
    expect(businessResponse.body.user).toBeUndefined();
    expect(protectedHandler).toHaveBeenCalledTimes(1);
  });

  it("denies a business request from another department without reaching the handler", async () => {
    await database.user.update({
      where: { id: EMPLOYEE_ID },
      data: { department: Department.CUTTING },
    });

    const response = await request(app)
      .get("/department")
      .set(bearer(employeeToken()));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DEPARTMENT_ACCESS_DENIED");
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it("allows an administrator across every department", async () => {
    const response = await request(app)
      .get("/department")
      .set(bearer(adminToken()));
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ADMIN");
    expect(protectedHandler).toHaveBeenCalledTimes(1);
  });

  it("obeys the current row after a saved suspension even with the same old token", async () => {
    const token = employeeToken();
    const before = await request(app).get("/business").set(bearer(token));
    expect(before.status).toBe(200);

    await database.user.update({
      where: { id: EMPLOYEE_ID },
      data: { status: UserStatus.SUSPENDED },
    });

    const stored = await database.user.findUniqueOrThrow({
      where: { id: EMPLOYEE_ID },
      select: { status: true },
    });
    expect(stored.status).toBe(UserStatus.SUSPENDED);

    const after = await request(app).get("/business").set(bearer(token));
    expect(after.status, JSON.stringify(after.body)).toBe(403);
    expect(after.body.code).toBe("ACCOUNT_RESTRICTED");
  });

  it("obeys the current row after a saved reassignment", async () => {
    const token = employeeToken();
    await database.user.update({
      where: { id: EMPLOYEE_ID },
      data: { department: Department.QUALITY },
    });

    const response = await request(app).get("/department").set(bearer(token));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DEPARTMENT_ACCESS_DENIED");
  });

  it("does not let an old token claim override a changed role", async () => {
    const token = accessTokenFor(
      EMPLOYEE_ID,
      UserRole.ADMIN,
      "authority.employee@example.com",
    );
    const response = await request(app).get("/business").set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("USER");
    expect(response.body.user.role).not.toBe("ADMIN");
  });

  it("denies a missing, forged or expired identity credential", async () => {
    const missing = await request(app).get("/identity");
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("UNAUTHORIZED");

    const forged = await request(app)
      .get("/identity")
      .set(bearer("not.a.real.token"));
    expect(forged.status).toBe(401);

    const expired = await request(app)
      .get("/identity")
      .set(
        bearer(
          expiredTokenFor(
            EMPLOYEE_ID,
            UserRole.USER,
            "authority.employee@example.com",
          ),
        ),
      );
    expect(expired.status).toBe(401);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it("denies a removed identity without disclosing a private account", async () => {
    const token = employeeToken();
    await database.user.delete({ where: { id: EMPLOYEE_ID } });

    const response = await request(app).get("/identity").set(bearer(token));
    expect(response.status).toBe(401);
    expect(response.body.user).toBeUndefined();
  });

  it("keeps the private response policy out of caches", async () => {
    const response = await request(app)
      .get("/identity")
      .set(bearer(employeeToken()));
    expect(response.headers["cache-control"]).toContain("no-store");
  });
});
