import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

const smtpEnvironment = (port: number, production = true): void => {
  vi.stubEnv("NODE_ENV", production ? "production" : "development");
  vi.stubEnv("RAILWAY_ENVIRONMENT", "p08-owned-config-test");
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("WEB_APP_URL", "https://app.example.test");
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(port));
  vi.stubEnv("SMTP_USER", "synthetic-smtp-user");
  vi.stubEnv("SMTP_PASSWORD", "synthetic-smtp-password");
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_ALLOW_SELF_SIGNED_TLS", "false");
  vi.stubEnv("SMTP_TLS_MIN_VERSION", "TLSv1.2");
  vi.stubEnv("LOG_LEVEL", "silent");
  for (const key of [
    "AUTH_JWT_SECRET",
    "AUTH_REFRESH_JWT_SECRET",
    "AUTH_VERIFICATION_JWT_SECRET",
    "AUTH_RESET_JWT_SECRET",
  ])
    vi.stubEnv(key, randomBytes(48).toString("base64url"));
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("rejects production mail at a refusing loopback STARTTLS boundary before AUTH or MAIL", async () => {
  const verbs: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setEncoding("utf8");
    socket.write("220 owned.local ESMTP\r\n");
    let buffer = "",
      inMessage = false;
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let boundary = buffer.indexOf("\r\n");
      while (boundary >= 0) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const verb = line.split(" ", 1)[0] ?? "";
        if (inMessage) {
          if (line === ".") {
            inMessage = false;
            socket.write("250 queued\r\n");
          }
        } else {
          verbs.push(verb);
          if (verb === "EHLO")
            socket.write("250-owned.local\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (verb === "HELO") socket.write("250 owned.local\r\n");
          else if (verb === "STARTTLS") socket.write("454 TLS unavailable\r\n");
          else if (verb === "AUTH") socket.write("235 authenticated\r\n");
          else if (verb === "DATA") {
            inMessage = true;
            socket.write("354 message follows\r\n");
          } else if (verb === "QUIT") socket.end("221 goodbye\r\n");
          else socket.write("250 ok\r\n");
        }
        boundary = buffer.indexOf("\r\n");
      }
    });
  });
  let closeTransport = (): void => undefined;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Missing owned loopback port");
    smtpEnvironment(address.port);
    vi.resetModules();
    const { getSmtpTransporter } = await import("./mailer.config.js");
    const { SmtpEmailDelivery, EmailDeliveryError } =
      await import("../../infrastructure/email/email-delivery.js");
    const transport = getSmtpTransporter();
    closeTransport = () => {
      transport.close();
    };
    const delivery = new SmtpEmailDelivery(
      () => transport,
      () => Promise.resolve(),
    );
    await expect(
      delivery.send({
        from: "sender@example.test",
        to: "recipient@example.test",
        subject: "Synthetic",
        html: "<p>Synthetic body</p>",
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
    expect(verbs).toContain("STARTTLS");
    expect(verbs).not.toContain("AUTH");
    expect(verbs).not.toContain("MAIL");
  } finally {
    closeTransport();
    for (const socket of sockets) socket.destroy();
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
  }
});
it.each([
  [true, false, true],
  [true, true, false],
  [false, false, false],
])(
  "retains secure/cached transporter options for production=%s implicitTLS=%s",
  async (production, implicitTls, requireTls) => {
    smtpEnvironment(587, production);
    vi.stubEnv("SMTP_SECURE", String(implicitTls));
    vi.resetModules();
    const { getSmtpTransporter } = await import("./mailer.config.js");
    const transport = getSmtpTransporter();
    try {
      expect(getSmtpTransporter()).toBe(transport);
      expect(transport.options).toMatchObject({
        secure: implicitTls,
        requireTLS: requireTls,
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      });
    } finally {
      transport.close();
    }
  },
);
