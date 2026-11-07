import {
  errorEnvelopeSchema,
  successEnvelopeSchema,
  safeUserSchema,
  approvalCommandDataSchema,
} from "@template/contracts";
import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import pino from "pino";
import request from "supertest";
import { expect, it } from "vitest";
import type { Department } from "@template/database";
import { AppError } from "../../core/errors/app.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import { csrfConfig } from "../../core/config/csrf.config.js";
import { errorHandlerMiddleware } from "../../middlewares/error-handler.middleware.js";
import { buildOpenApiDocument } from "../../infrastructure/openapi/openapi.js";
import { ApprovalController } from "./approval.controller.js";
import {
  approvalRoutes,
  salesContactRoutes,
  orderPaperRoutes,
  manufacturingOrderRoutes,
  approvalCommandRoutes,
} from "./approval.routes.js";

const actorId = randomUUID(),
  orderId = randomUUID(),
  pieceId = randomUUID(),
  issueId = randomUUID(),
  proposalId = randomUUID(),
  commandId = randomUUID(),
  instant = "2026-11-07T00:00:00Z";
const actor = safeUserSchema.parse({
  id: actorId,
  fullName: "Adapter approver",
  email: "adapter@example.test",
  role: "USER",
  status: "ACTIVE",
  department: "APPROVAL",
  phone: null,
  staffApprovedAt: instant,
  accessVersion: 1,
  emailVerifiedAt: instant,
  createdAt: instant,
  updatedAt: instant,
});
const body = { commandId, expectedVersion: 3 };
const fixture = (
  department: Department = "APPROVAL",
  authenticated = true,
  admin = false,
) => {
  const calls: Array<{ operation: string; args: unknown[] }> = [];
  const selected =
    (operation: string) =>
    (...args: unknown[]): Promise<never> => {
      calls.push({ operation, args });
      return Promise.reject(
        new AppError("Controlled adapter selection", 409, "ADAPTER_SELECTED"),
      );
    };
  // These rejections verify adapter selection only, never persistence or business acceptance.
  const service: ConstructorParameters<typeof ApprovalController>[0] = {
    dashboard: selected("dashboard"),
    listPending: selected("listPending"),
    listIssues: selected("listIssues"),
    history: selected("history"),
    getOrder: selected("getOrder"),
    approveInitial: selected("approveInitial"),
    returnInitial: selected("returnInitial"),
    orderHistory: selected("orderHistory"),
    event: selected("event"),
    resolveIssue: selected("resolveIssue"),
    reviewContact: selected("reviewContact"),
    salesContacts: selected("salesContacts"),
    getSalesContactOrder: selected("getSalesContactOrder"),
    submitContact: selected("submitContact"),
    officialPaper: selected("officialPaper"),
    factoryPaper: selected("factoryPaper"),
    reportIssue: selected("reportIssue"),
    observe: selected("observe"),
  };
  const controller = new ApprovalController(service),
    app = express();
  const auth: RequestHandler = (incoming, _response, next) => {
    if (!authenticated)
      throw new UnauthorizedException("Authentication required");
    incoming.user = { ...actor, department, role: admin ? "ADMIN" : "USER" };
    next();
  };
  app.use(express.json(), cookieParser());
  app.use((incoming, _response, next) => {
    incoming.log = pino({ enabled: false });
    incoming.requestId = "approval-adapter";
    next();
  });
  app.use("/approvals", approvalRoutes(controller, auth));
  app.use("/sales-contact", salesContactRoutes(controller, auth));
  app.use("/order-paper", orderPaperRoutes(controller, auth));
  app.use("/manufacturing-orders", manufacturingOrderRoutes(controller, auth));
  app.use("/approval-commands", approvalCommandRoutes(controller, auth));
  app.use(errorHandlerMiddleware);
  return { app, calls, service };
};
const headers = {
  Cookie: `${csrfConfig.cookieName}=adapter-csrf`,
  [csrfConfig.headerName]: "adapter-csrf",
};
const issuePath = `/orders/${orderId}/pieces/${pieceId}/issues/${issueId}`;
const ledger = [
  { method: "get", path: "/approvals/dashboard", operation: "dashboard" },
  { method: "get", path: "/approvals/orders", operation: "listPending" },
  { method: "get", path: "/approvals/issues", operation: "listIssues" },
  { method: "get", path: "/approvals/history", operation: "history" },
  {
    method: "get",
    path: `/approvals/orders/${orderId}`,
    operation: "getOrder",
  },
  {
    method: "post",
    path: `/approvals/orders/${orderId}/approve`,
    operation: "approveInitial",
    body,
  },
  {
    method: "post",
    path: `/approvals/orders/${orderId}/return`,
    operation: "returnInitial",
    body: { ...body, reason: "Return reason" },
  },
  {
    method: "get",
    path: `/approvals/orders/${orderId}/history`,
    operation: "orderHistory",
  },
  {
    method: "get",
    path: `/approvals/orders/${orderId}/events/${commandId}`,
    operation: "event",
  },
  {
    method: "post",
    path: `/approvals${issuePath}/resolve`,
    operation: "resolveIssue",
    body: {
      ...body,
      decision: "SEND_TO_SALES",
      target: "PRODUCTION",
      notes: "Contact instructions",
    },
  },
  {
    method: "post",
    path: `/approvals${issuePath}/review`,
    operation: "reviewContact",
    body: {
      ...body,
      proposalId,
      decision: "ACCEPT",
      notes: "Review instructions",
    },
  },
  { method: "get", path: "/sales-contact", operation: "salesContacts" },
  {
    method: "get",
    path: `/sales-contact/orders/${orderId}`,
    operation: "getSalesContactOrder",
  },
  {
    method: "post",
    path: `/sales-contact${issuePath}/proposals`,
    operation: "submitContact",
    body: {
      ...body,
      kind: "AMEND",
      contactNotes: "Customer confirmation",
      changes: {},
    },
  },
  {
    method: "get",
    path: `/order-paper/${orderId}`,
    operation: "officialPaper",
  },
  {
    method: "get",
    path: `/manufacturing-orders/${orderId}`,
    operation: "factoryPaper",
  },
  {
    method: "post",
    path: `/manufacturing-orders/${orderId}/pieces/${pieceId}/issues`,
    operation: "reportIssue",
    body: { ...body, reason: "Source reason" },
  },
  {
    method: "get",
    path: `/approval-commands/${commandId}`,
    operation: "observe",
  },
] as const;
it.each(ledger)(
  "selects the exact $operation adapter and documents its method",
  async (entry) => {
    const { app, calls } = fixture("APPROVAL", true, true),
      result =
        entry.method === "get"
          ? await request(app).get(entry.path)
          : await request(app).post(entry.path).set(headers).send(entry.body);
    expect(result.status).toBe(409);
    expect(errorEnvelopeSchema.parse(result.body).code).toBe(
      "ADAPTER_SELECTED",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.operation).toBe(entry.operation);
    expect(calls[0]?.args[0]).toBe(actorId);
    const path = entry.path
        .replace(orderId, "{orderId}")
        .replace(pieceId, "{pieceId}")
        .replace(issueId, "{issueId}")
        .replace(
          commandId,
          entry.operation === "observe" ? "{commandId}" : "{eventId}",
        ),
      document = buildOpenApiDocument();
    const operation = document.paths?.[path]?.[entry.method];
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["201"]).toBeUndefined();
    expect(operation?.security).toEqual([
      entry.method === "get"
        ? { BearerAuth: [] }
        : { BearerAuth: [], CsrfHeader: [] },
    ]);
  },
);
it("orders authentication, department, CSRF and strict validation before service selection", async () => {
  const absent = fixture("APPROVAL", false),
    wrong = fixture("CUTTING"),
    allowed = fixture();
  expect(
    (
      await request(absent.app)
        .post("/approvals/orders/invalid/approve")
        .send({})
    ).status,
  ).toBe(401);
  expect(
    (
      await request(wrong.app)
        .post("/approvals/orders/invalid/approve")
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await request(allowed.app)
        .post(`/approvals/orders/${orderId}/approve`)
        .send({ actorId: "spoof" })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(allowed.app)
        .post(`/approvals/orders/${orderId}/approve`)
        .set(headers)
        .send({ ...body, actorId: "spoof" })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(allowed.app).get(
        `/approvals/orders/${orderId}?ownerId=spoof`,
      )
    ).status,
  ).toBe(400);
  expect(absent.calls).toEqual([]);
  expect(wrong.calls).toEqual([]);
  expect(allowed.calls).toEqual([]);
});
it("returns HTTP200 metadata with private no-store and only parsed server actor/intent", async () => {
  const { app, calls, service } = fixture();
  const data = approvalCommandDataSchema.parse({
    kind: "approval-command",
    replayed: false,
    receipt: {
      commandId,
      operation: "APPROVE_INITIAL",
      orderId,
      actor: {
        id: actorId,
        fullName: actor.fullName,
        role: "USER",
        department: "APPROVAL",
      },
      beforeVersion: 3,
      afterVersion: 4,
      occurredAt: instant,
    },
    outcome: {
      orderId,
      orderVersion: 4,
      orderStatus: "APPROVED",
      pieceId: null,
      pieceStage: null,
      pieceWorkState: null,
      issueId: null,
      issueState: null,
      proposalId: null,
    },
  });
  service.approveInitial = (...args) => {
    calls.push({ operation: "approveInitial", args });
    return Promise.resolve(data);
  };
  const result = await request(app)
    .post(`/approvals/orders/${orderId}/approve`)
    .set(headers)
    .send(body);
  expect(result.status).toBe(200);
  expect(result.headers["cache-control"]).toBe("private, no-store");
  expect(
    approvalCommandDataSchema.parse(
      successEnvelopeSchema.parse(result.body).data,
    ),
  ).toEqual(data);
  expect(calls).toEqual([
    { operation: "approveInitial", args: [actorId, orderId, body] },
  ]);
});
