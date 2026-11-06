import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import pino from "pino";
import request from "supertest";
import {
  draftCaptureSchema,
  draftCommandDataSchema,
  draftSchema,
  safeUserSchema,
  type DraftCapture,
} from "@template/contracts";
import { expect, it } from "vitest";
import { csrfConfig } from "../../core/config/csrf.config.js";
import { errorHandlerMiddleware } from "../../middlewares/error-handler.middleware.js";
import { SalesDraftsController } from "./sales-drafts.controller.js";
import { salesDraftsRoutes } from "./sales-drafts.routes.js";
import type { SalesDraftsService } from "./sales-drafts.service.js";

const instant = "2026-11-05T00:00:00.000Z",
  actorId = randomUUID(),
  draftId = randomUUID();
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
const capture = draftCaptureSchema.parse({
  type: "SHOP",
  pieces: [{ id: randomUUID() }],
});
const projection = (value: DraftCapture, version = 1) => {
  const { customerId, ...fields } = value;
  if (customerId !== null)
    throw new Error("Adapter fixture only uses unlinked drafts");
  return draftSchema.parse({
    ...fields,
    id: draftId,
    version,
    status: "DRAFT",
    owner: { id: actorId, fullName: "Sales" },
    customer: null,
    pieces: value.pieces.map((piece, index) => ({
      ...piece,
      position: index + 1,
      quantity: 1,
    })),
    createdAt: instant,
    updatedAt: instant,
    pricing: { availability: "unavailable", reason: "P03_NOT_IMPLEMENTED" },
    submission: { available: false, reason: "P03_NOT_READY" },
  });
};
const pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const fixture = () => {
  const observed: unknown[] = [];
  const service: Pick<
    SalesDraftsService,
    "list" | "get" | "changes" | "create" | "save"
  > = {
    list: (id, query) => {
      observed.push({ operation: "list", id, query });
      return Promise.resolve({
        drafts: [],
        pagination,
        totalDrafts: 0,
        totalPieces: 0,
      });
    },
    get: (id, target) => {
      observed.push({ operation: "get", id, target });
      return Promise.resolve({ draft: projection(capture) });
    },
    changes: (id, query, target) => {
      observed.push({ operation: "changes", id, query, target });
      return Promise.resolve({ changes: [], pagination });
    },
    create: (id, body) => {
      observed.push({ operation: "create", id, body });
      return Promise.resolve(
        draftCommandDataSchema.parse({
          kind: "draft",
          receipt: {
            commandId: body.commandId,
            operation: "CREATE_DRAFT",
            resourceId: draftId,
            actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
            beforeVersion: null,
            afterVersion: 1,
            occurredAt: instant,
          },
          replayed: false,
          savedDraft: projection(body.draft),
        }),
      );
    },
    save: (id, target, body) => {
      observed.push({ operation: "save", id, target, body });
      return Promise.resolve(
        draftCommandDataSchema.parse({
          kind: "draft",
          receipt: {
            commandId: body.commandId,
            operation: "SAVE_DRAFT",
            resourceId: target,
            actor: { id, fullName: "Sales", role: "USER", department: "SALES" },
            beforeVersion: body.expectedVersion,
            afterVersion: body.expectedVersion + 1,
            occurredAt: instant,
          },
          replayed: false,
          savedDraft: projection(body.draft, body.expectedVersion + 1),
        }),
      );
    },
  };
  const app = express(),
    controller = new SalesDraftsController(service);
  const auth: RequestHandler = (incoming, _response, next) => {
    incoming.user = actor;
    next();
  };
  app.use(express.json(), cookieParser(), (incoming, _response, next) => {
    incoming.log = pino({ enabled: false });
    incoming.requestId = "draft-adapter";
    next();
  });
  app.use("/drafts", salesDraftsRoutes(controller, auth));
  app.use(errorHandlerMiddleware);
  return { app, observed };
};
it("keeps literal global activity separate from UUID detail and per-draft history", async () => {
  const { app, observed } = fixture();
  expect((await request(app).get("/drafts/changes?page=2")).status).toBe(200);
  expect((await request(app).get(`/drafts/${draftId}/changes`)).status).toBe(
    200,
  );
  expect((await request(app).get(`/drafts/${draftId}`)).status).toBe(200);
  expect(observed).toEqual([
    {
      operation: "changes",
      id: actorId,
      query: { page: 2, limit: 25 },
      target: undefined,
    },
    {
      operation: "changes",
      id: actorId,
      query: { page: 1, limit: 25 },
      target: draftId,
    },
    { operation: "get", id: actorId, target: draftId },
  ]);
});
it("adapts blank create201 and complete replacement200 without discarding explicit nulls", async () => {
  const { app, observed } = fixture(),
    commandId = randomUUID(),
    updateId = randomUUID();
  const first = await request(app)
    .post("/drafts")
    .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
    .set(csrfConfig.headerName, "unit-csrf")
    .send({
      commandId,
      draft: {
        type: "SHOP",
        pieces: capture.pieces.map((piece) => ({ id: piece.id })),
      },
    });
  expect(first.status).toBe(201);
  const changed = await request(app)
    .put(`/drafts/${draftId}`)
    .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
    .set(csrfConfig.headerName, "unit-csrf")
    .send({ commandId: updateId, expectedVersion: 1, draft: capture });
  expect(changed.status).toBe(200);
  expect(observed).toEqual([
    { operation: "create", id: actorId, body: { commandId, draft: capture } },
    {
      operation: "save",
      id: actorId,
      target: draftId,
      body: { commandId: updateId, expectedVersion: 1, draft: capture },
    },
  ]);
});
it("rejects invented activity filters, incomplete replacement, client status and missing CSRF before use cases", async () => {
  const { app, observed } = fixture();
  expect(
    (await request(app).get("/drafts/changes?search=ignored")).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/drafts")
        .send({ commandId: randomUUID(), draft: capture })
    ).status,
  ).toBe(403);
  for (const draft of [
    { type: "SHOP", pieces: [{ id: randomUUID() }] },
    { ...capture, status: "DRAFT" },
  ]) {
    const response = await request(app)
      .put(`/drafts/${draftId}`)
      .set("Cookie", `${csrfConfig.cookieName}=unit-csrf`)
      .set(csrfConfig.headerName, "unit-csrf")
      .send({ commandId: randomUUID(), expectedVersion: 1, draft });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
  }
  expect(observed).toEqual([]);
});
