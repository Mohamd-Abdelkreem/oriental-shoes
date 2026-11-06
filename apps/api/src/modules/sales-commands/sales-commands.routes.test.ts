import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import pino from "pino";
import request from "supertest";
import { customerCommandDataSchema, safeUserSchema } from "@template/contracts";
import { expect, it } from "vitest";
import { errorHandlerMiddleware } from "../../middlewares/error-handler.middleware.js";
import { SalesCommandsController } from "./sales-commands.controller.js";
import { salesCommandsRoutes } from "./sales-commands.routes.js";

const instant = "2026-11-05T00:00:00.000Z",
  actorId = randomUUID(),
  commandId = randomUUID(),
  resourceId = randomUUID();
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
const fixture = (department: "SALES" | "CUTTING" = "SALES") => {
  const observed: unknown[] = [],
    app = express();
  const data = customerCommandDataSchema.parse({
    kind: "customer",
    receipt: {
      commandId,
      operation: "CREATE_CUSTOMER",
      resourceId,
      actor: {
        id: actorId,
        fullName: "Sales",
        role: "USER",
        department: "SALES",
      },
      beforeVersion: null,
      afterVersion: 1,
      occurredAt: instant,
    },
    replayed: true,
    savedCustomer: {
      id: resourceId,
      name: "Customer",
      phone: "+966500000001",
      email: null,
      address: null,
      notes: null,
      version: 1,
      createdAt: instant,
      updatedAt: instant,
    },
  });
  const controller = new SalesCommandsController({
    get: (id, target) => {
      observed.push({ id, target });
      return Promise.resolve(data);
    },
  });
  const auth: RequestHandler = (incoming, _response, next) => {
    incoming.user = { ...actor, department };
    next();
  };
  app.use((incoming, _response, next) => {
    incoming.log = pino({ enabled: false });
    incoming.requestId = "command-adapter";
    next();
  });
  app.use("/commands", salesCommandsRoutes(controller, auth));
  app.use(errorHandlerMiddleware);
  return { app, observed };
};
it("returns the separately named retained after-image through exact UUID selection", async () => {
  const { app, observed } = fixture(),
    result = await request(app).get(`/commands/${commandId}`);
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    data: {
      kind: "customer",
      replayed: true,
      savedCustomer: { id: resourceId },
    },
  });
  expect(observed).toEqual([{ id: actorId, target: commandId }]);
});
it("rejects invalid IDs/query fields and department access before observation", async () => {
  const { app, observed } = fixture();
  expect((await request(app).get("/commands/not-a-uuid")).status).toBe(400);
  expect(
    (await request(app).get(`/commands/${commandId}?actorId=other`)).status,
  ).toBe(400);
  expect(observed).toEqual([]);
  const wrong = fixture("CUTTING");
  expect((await request(wrong.app).get(`/commands/${commandId}`)).status).toBe(
    403,
  );
  expect(wrong.observed).toEqual([]);
});
