import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandlerMiddleware } from "./error-handler.middleware.js";

describe("errorHandlerMiddleware", () => {
  it("classifies Zod errors outside request validation as internal bugs", () => {
    const parsed = z.object({ count: z.number() }).safeParse({ count: "bug" });
    if (parsed.success) throw new Error("Expected the fixture to fail.");
    const requestLog = { error: vi.fn(), warn: vi.fn() };
    const request = {
      log: requestLog,
      path: "/internal-schema-bug",
      requestId: "request-id",
    } as unknown as Request;
    const json = vi.fn();
    const status = vi.fn();
    const response = {
      status,
      json,
    } as unknown as Response;
    status.mockReturnValue(response);

    errorHandlerMiddleware(parsed.error, request, response, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
    expect(requestLog.error).toHaveBeenCalledOnce();
    expect(requestLog.warn).not.toHaveBeenCalled();
  });
});

it.each([
  ["entity.parse.failed", 400, "INVALID_JSON"],
  ["entity.too.large", 413, "PAYLOAD_TOO_LARGE"],
] as const)(
  "sanitizes %s responses and operational logs even in development",
  async (type, statusCode, code) => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    try {
      const [
        { default: express },
        { default: request },
        { default: pino },
        { errorHandlerMiddleware: handler },
      ] = await Promise.all([
        import("express"),
        import("supertest"),
        import("pino"),
        import("./error-handler.middleware.js"),
      ]);
      const logs: string[] = [];
      const logger = pino(
        { level: "warn" },
        {
          write: (line: string) => {
            logs.push(line);
          },
        },
      );
      const app = express();
      app.use((incoming, _response, next) => {
        incoming.requestId = "parser-test";
        incoming.log = logger;
        next();
      });
      const original = Object.assign(new Error("sensitive original body"), {
        type,
        status: statusCode,
        body: "sensitive original body",
        stack: "sensitive original stack",
      });
      app.get("/", (_incoming, _response, next) => {
        next(original);
      });
      app.use(handler);
      const response = await request(app).get("/");
      expect(response.status).toBe(statusCode);
      expect(response.body).toMatchObject({
        success: false,
        code,
        requestId: "parser-test",
      });
      expect(response.body).not.toHaveProperty("stack");
      expect(JSON.stringify(response.body)).not.toContain("sensitive original");
      expect(logs).toHaveLength(1);
      expect(logs.join()).toContain(code);
      expect(logs.join()).not.toContain("sensitive original");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  },
);

it.each([
  { type: "entity.parse.failed", status: 400 },
  Object.assign(new Error("wrong status"), {
    type: "entity.parse.failed",
    status: 413,
  }),
  Object.assign(new Error("string status"), {
    type: "entity.parse.failed",
    status: "400",
  }),
])(
  "does not trust parser-like objects or mismatched status pairs",
  async (error) => {
    const [{ default: express }, { default: request }, { default: pino }] =
      await Promise.all([
        import("express"),
        import("supertest"),
        import("pino"),
      ]);
    const app = express();
    const logger = pino({ enabled: false });
    app.use((incoming, _response, next) => {
      incoming.requestId = "parser-test";
      incoming.log = logger;
      next();
    });
    app.get("/", (_incoming, _response, next) => {
      next(error);
    });
    app.use(errorHandlerMiddleware);
    const response = await request(app).get("/");
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  },
);
