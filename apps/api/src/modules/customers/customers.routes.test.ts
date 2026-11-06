import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import pino from "pino";
import request from "supertest";
import {
  customerCommandDataSchema,
  customerDataSchema,
  safeUserSchema,
  type SafeUser,
} from "@template/contracts";
import { expect, it } from "vitest";
import { csrfConfig } from "../../core/config/csrf.config.js";
import { errorHandlerMiddleware } from "../../middlewares/error-handler.middleware.js";
import { CustomersController } from "./customers.controller.js";
import { customersRoutes } from "./customers.routes.js";
import type { CustomersService } from "./customers.service.js";

// This proves only the HTTP adapter. Its use-case collaborator is outside this
// boundary; real credentials, services and persistence are exercised in T016.
const instant = "2026-11-05T00:00:00.000Z",
  actorId = randomUUID(),
  customerId = randomUUID();
const actor = safeUserSchema.parse({
  id: actorId,
  fullName: "Sales",
  email: "sales@example.test",
  phone: null,
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: instant,
  accessVersion: 0,
  emailVerifiedAt: instant,
  createdAt: instant,
  updatedAt: instant,
});
const customer = {
  id: customerId,
  name: "Customer",
  phone: "+966500000001",
  email: null,
  address: null,
  notes: null,
  version: 1,
  createdAt: instant,
  updatedAt: instant,
};
const data = customerDataSchema.parse({
  customer,
  draftCount: 0,
  latestDraftAt: null,
  latestMeasurement: null,
  submittedHistory: {
    availability: "not_available",
    reason: "P03_NOT_IMPLEMENTED",
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
const fixture = (user: SafeUser = actor) => {
  const observed: unknown[] = [];
  const service: Pick<
    CustomersService,
    | "list"
    | "get"
    | "getByPhone"
    | "measurements"
    | "drafts"
    | "create"
    | "update"
  > = {
    list: (id, query) => {
      observed.push({ operation: "list", id, query });
      return Promise.resolve({
        customers: [],
        pagination: {
          ...pagination,
          page: query.page,
          limit: query.limit,
          hasPreviousPage: query.page > 1,
        },
        totalCustomers: 0,
      });
    },
    get: (id, target) => {
      observed.push({ operation: "get", id, target });
      return Promise.resolve(data);
    },
    getByPhone: (id, phone) => {
      observed.push({ operation: "phone", id, phone });
      return Promise.resolve(data);
    },
    drafts: (id, target, query) => {
      observed.push({ operation: "drafts", id, target, query });
      return Promise.resolve({ drafts: [], pagination });
    },
    measurements: (id, target, query) => {
      observed.push({ operation: "measurements", id, target, query });
      return Promise.resolve({ measurements: [], pagination });
    },
    create: (id, body) => {
      observed.push({ operation: "create", id, body });
      return Promise.resolve(
        customerCommandDataSchema.parse({
          kind: "customer",
          receipt: {
            commandId: body.commandId,
            operation: "CREATE_CUSTOMER",
            resourceId: customerId,
            actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
            beforeVersion: null,
            afterVersion: 1,
            occurredAt: instant,
          },
          replayed: false,
          savedCustomer: { ...customer, ...body.customer },
        }),
      );
    },
    update: (id, target, body) => {
      observed.push({ operation: "update", id, target, body });
      return Promise.resolve(
        customerCommandDataSchema.parse({
          kind: "customer",
          receipt: {
            commandId: body.commandId,
            operation: "UPDATE_CUSTOMER",
            resourceId: target,
            actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
            beforeVersion: body.expectedVersion,
            afterVersion: body.expectedVersion + 1,
            occurredAt: instant,
          },
          replayed: false,
          savedCustomer: {
            ...customer,
            ...body.patch,
            id: target,
            version: body.expectedVersion + 1,
          },
        }),
      );
    },
  };
  const controller = new CustomersController(service),
    app = express();
  const context: RequestHandler = (incoming, _response, next) => {
    incoming.requestId = "customer-adapter";
    incoming.log = pino({ enabled: false });
    next();
  };
  const authenticate: RequestHandler = (incoming, _response, next) => {
    incoming.user = user;
    next();
  };
  app.use(express.json(), cookieParser(), context);
  app.use("/customers", customersRoutes(controller, authenticate));
  app.use(errorHandlerMiddleware);
  return { app, observed, controller, context, authenticate };
};
it("routes literal phone and paged directory reads through normalized typed arguments", async () => {
  const { app, observed } = fixture();
  expect(
    (await request(app).get("/customers?search=Customer&page=2&limit=10"))
      .status,
  ).toBe(200);
  expect(
    (await request(app).get("/customers/by-phone/0500000001")).status,
  ).toBe(200);
  expect((await request(app).get(`/customers/${customerId}`)).status).toBe(200);
  expect(
    (await request(app).get(`/customers/${customerId}/measurements?page=1`))
      .status,
  ).toBe(200);
  expect(observed).toEqual([
    {
      operation: "list",
      id: actorId,
      query: { search: "Customer", page: 2, limit: 10 },
    },
    { operation: "phone", id: actorId, phone: "+966500000001" },
    { operation: "get", id: actorId, target: customerId },
    {
      operation: "measurements",
      id: actorId,
      target: customerId,
      query: { page: 1, limit: 25 },
    },
  ]);
});
it("projects create201 and patch200 with exact actor/target/command and clear semantics", async () => {
  const { app, observed } = fixture(),
    commandId = randomUUID();
  const created = await request(app)
    .post("/customers")
    .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
    .set(csrfConfig.headerName, "unit-csrf")
    .send({ commandId, customer: { name: " Customer ", phone: "٠٥٠٠٠٠٠٠٠١" } });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({
    success: true,
    data: { kind: "customer", savedCustomer: { phone: "+966500000001" } },
  });
  const updateId = randomUUID();
  const updated = await request(app)
    .patch(`/customers/${customerId}`)
    .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
    .set(csrfConfig.headerName, "unit-csrf")
    .send({ commandId: updateId, expectedVersion: 1, patch: { email: "" } });
  expect(updated.status).toBe(200);
  expect(observed).toEqual([
    {
      operation: "create",
      id: actorId,
      body: {
        commandId,
        customer: {
          name: "Customer",
          phone: "+966500000001",
          email: null,
          address: null,
          notes: null,
        },
      },
    },
    {
      operation: "update",
      id: actorId,
      target: customerId,
      body: { commandId: updateId, expectedVersion: 1, patch: { email: null } },
    },
  ]);
});
it("rejects unsupported query/body shapes and absent CSRF before the service boundary", async () => {
  const { app, observed } = fixture();
  expect((await request(app).get("/customers?ownerId=other")).status).toBe(400);
  expect(
    (await request(app).get(`/customers/${customerId}?unexpected=1`)).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/customers")
        .send({
          commandId: randomUUID(),
          customer: { name: "C", phone: "0500000001" },
        })
    ).status,
  ).toBe(403);
  const invalid = await request(app)
    .post("/customers")
    .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
    .set(csrfConfig.headerName, "unit-csrf")
    .send({
      commandId: randomUUID(),
      customer: { name: "C", phone: "0500000001", ownerId: actorId },
    });
  expect(invalid.status).toBe(400);
  expect(invalid.body).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(observed).toEqual([]);
});
it("runs department denial before handlers while allowing ADMIN at the route boundary", async () => {
  const denied = fixture({ ...actor, department: "CUTTING" });
  expect((await request(denied.app).get("/customers")).status).toBe(403);
  expect(denied.observed).toEqual([]);
  const allowed = fixture(
    safeUserSchema.parse({
      ...actor,
      role: "ADMIN",
      department: null,
      staffApprovedAt: null,
    }),
  );
  expect((await request(allowed.app).get("/customers")).status).toBe(200);
});
it.each(["missing-actor", "missing-query", "invalid-query"] as const)(
  "treats %s controller context as a server wiring defect",
  async (kind) => {
    const { controller, observed, context, authenticate } = fixture(),
      app = express();
    app.use(context);
    if (kind !== "missing-actor") app.use(authenticate);
    app.get(
      "/",
      (incoming, _response, next) => {
        if (kind === "invalid-query")
          incoming.validated = { query: { page: "bad" } };
        next();
      },
      controller.list,
    );
    app.use(errorHandlerMiddleware);
    const result = await request(app).get("/");
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(observed).toEqual([]);
  },
);
