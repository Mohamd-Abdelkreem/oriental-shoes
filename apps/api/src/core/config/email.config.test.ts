import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionSmtpSecurity } from "./email.config.js";

const accepted = {
  isProduction: true,
  provider: "smtp",
  allowSelfSignedTls: false,
  tlsMinVersion: "TLSv1.2",
} as const;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production SMTP admission", () => {
  it.each(["TLSv1.2", "TLSv1.3"] as const)(
    "permits verified %s without changing other provider capabilities",
    (tlsMinVersion) => {
      expect(() => {
        assertProductionSmtpSecurity({ ...accepted, tlsMinVersion });
      }).not.toThrow();
      expect(() => {
        assertProductionSmtpSecurity({
          ...accepted,
          isProduction: false,
          allowSelfSignedTls: true,
          tlsMinVersion: "TLSv1",
        });
      }).not.toThrow();
      expect(() => {
        assertProductionSmtpSecurity({
          ...accepted,
          provider: "resend",
          allowSelfSignedTls: true,
          tlsMinVersion: "TLSv1",
        });
      }).not.toThrow();
    },
  );
  it("rejects unsafe production certificate/protocol settings with safe actionable key names", () => {
    expect(() => {
      assertProductionSmtpSecurity({ ...accepted, allowSelfSignedTls: true });
    }).toThrow("SMTP_ALLOW_SELF_SIGNED_TLS is not allowed in production.");
    expect(() => {
      assertProductionSmtpSecurity({ ...accepted, tlsMinVersion: "TLSv1" });
    }).toThrow(
      "SMTP_TLS_MIN_VERSION must be TLSv1.2 or TLSv1.3 in production.",
    );
  });
  it.each([
    [
      { SMTP_ALLOW_SELF_SIGNED_TLS: "true" },
      "SMTP_ALLOW_SELF_SIGNED_TLS is not allowed in production.",
    ],
    [
      { SMTP_TLS_MIN_VERSION: "TLSv1" },
      "SMTP_TLS_MIN_VERSION must be TLSv1.2 or TLSv1.3 in production.",
    ],
    [
      { EMAIL_PROVIDER: "console" },
      "EMAIL_PROVIDER=console is not allowed in production.",
    ],
    [
      { WEB_APP_URL: "http://app.example.test" },
      "WEB_APP_URL must use https in production.",
    ],
    [
      { SMTP_PASSWORD: "" },
      "SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required for production SMTP.",
    ],
    [
      { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_example_secret" },
      "RESEND_API_KEY must be a non-placeholder key when Resend is selected.",
    ],
  ])(
    "refuses invalid production configuration before publication: %j",
    async (overrides, message) => {
      const settings: Record<string, string> = {
        NODE_ENV: "production",
        EMAIL_PROVIDER: "smtp",
        WEB_APP_URL: "https://app.example.test",
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "synthetic",
        SMTP_PASSWORD: "synthetic-only",
        SMTP_ALLOW_SELF_SIGNED_TLS: "false",
        SMTP_TLS_MIN_VERSION: "TLSv1.2",
        ...overrides,
      };
      for (const [key, setting] of Object.entries(settings))
        vi.stubEnv(key, setting);
      vi.resetModules();
      await expect(import("./email.config.js")).rejects.toThrow(message);
    },
  );
  it("publishes the exact admitted SMTP settings once and preserves valid Resend configuration", async () => {
    for (const [key, setting] of Object.entries({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      WEB_APP_URL: "https://app.example.test",
      RESEND_API_KEY: "synthetic-provider-key-not-live",
      SMTP_ALLOW_SELF_SIGNED_TLS: "true",
      SMTP_TLS_MIN_VERSION: "TLSv1",
    }))
      vi.stubEnv(key, setting);
    vi.resetModules();
    const { emailConfig } = await import("./email.config.js");
    expect(emailConfig).toMatchObject({
      provider: "resend",
      allowSelfSignedTls: true,
      tlsMinVersion: "TLSv1",
      publicWebUrl: "https://app.example.test",
    });
  });
});
