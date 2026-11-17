import { describe, expect, it } from "vitest";

import { createLogger, LOGGER_REDACT_PATHS } from "./logger.js";

describe("logger redaction", () => {
  it("explicitly redacts the double-submit CSRF request header", () => {
    expect(LOGGER_REDACT_PATHS).toContain("req.headers['x-csrf-token']");
  });

  it("redacts credentials from actual serialized Pino output", () => {
    const chunks: string[] = [];
    const testLogger = createLogger({
      level: "info",
      pretty: false,
      destination: {
        write: (chunk) => {
          chunks.push(chunk);
        },
      },
    });
    const secrets = [
      "Bearer access-secret",
      "refreshToken=refresh-secret",
      "csrf-secret",
      "password-secret",
      "new-password-secret",
      "top-level-access-secret",
      "reset-token-secret",
      "smtp-secret",
      "refreshToken=response-secret",
    ];

    const namedCredentials = {
      DATABASE_URL: "owned-database-url-secret",
      SMTP_PASSWORD: "owned-smtp-password-secret",
      RESEND_API_KEY: "owned-resend-key-secret",
      API_KEY: "owned-api-key-secret",
    };
    const nestedCredentials = {
      databaseUrl: "nested-database-url-secret",
      resendApiKey: "nested-resend-key-secret",
    };
    testLogger.info({
      ...namedCredentials,
      req: {
        headers: {
          authorization: secrets[0],
          cookie: secrets[1],
          "x-csrf-token": secrets[2],
        },
        body: { password: secrets[3], newPassword: secrets[4] },
      },
      accessToken: secrets[5],
      resetToken: secrets[6],
      credentials: { smtpPassword: secrets[7], ...nestedCredentials },
      res: { headers: { "set-cookie": secrets[8] } },
    });

    const serialized = chunks.join("");
    for (const secret of [
      ...secrets,
      ...Object.values(namedCredentials),
      ...Object.values(nestedCredentials),
    ])
      expect(serialized).not.toContain(secret);
    const event = JSON.parse(serialized) as {
      req: { headers: Record<string, string>; body: Record<string, string> };
      accessToken: string;
      resetToken: string;
      credentials: { smtpPassword: string };
      res: { headers: Record<string, string> };
    };
    expect(event).toMatchObject(
      Object.fromEntries(
        Object.keys(namedCredentials).map((key) => [key, "[REDACTED]"]),
      ),
    );
    expect(event.credentials).toMatchObject(
      Object.fromEntries(
        Object.keys(nestedCredentials).map((key) => [key, "[REDACTED]"]),
      ),
    );
    expect(event.req.headers).toMatchObject({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "x-csrf-token": "[REDACTED]",
    });
    expect(event.req.body).toMatchObject({
      password: "[REDACTED]",
      newPassword: "[REDACTED]",
    });
    expect(event.accessToken).toBe("[REDACTED]");
    expect(event.resetToken).toBe("[REDACTED]");
    expect(event.credentials.smtpPassword).toBe("[REDACTED]");
    expect(event.res.headers["set-cookie"]).toBe("[REDACTED]");
  });
});
