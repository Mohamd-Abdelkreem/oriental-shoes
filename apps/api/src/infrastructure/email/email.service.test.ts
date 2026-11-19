import { describe, expect, it, vi } from "vitest";

import type { EmailDelivery } from "./email-delivery.js";
import { EmailService } from "./email.service.js";

const createService = () => {
  const send = vi.fn<EmailDelivery["send"]>();
  send.mockResolvedValue({ providerMessageId: "provider-message-id" });
  const delivery = { provider: "console", send } satisfies EmailDelivery;
  return {
    send,
    service: new EmailService(
      delivery,
      "no-reply@example.com",
      "Template",
      "",
      "http://localhost:3000",
    ),
  };
};

describe("EmailService local previews", () => {
  it("renders a branded Arabic verification email with the exact action", async () => {
    const { send, service } = createService();

    await service.sendVerificationEmail(
      "<Template User>",
      "user@example.com",
      "verification-token",
    );

    const message = send.mock.calls[0]?.[0];
    const action =
      "http://localhost:3000/auth/verify-email?token=verification-token";
    expect(message).toMatchObject({
      subject: "تأكيد البريد الإلكتروني | الحذاء الشرقي",
      localPreviewUrl: action,
    });
    expect(message?.html).toContain('<html lang="ar" dir="rtl">');
    expect(message?.html).toContain(
      'src="http://localhost:3000/brand/oriental-logo.png"',
    );
    expect(message?.html).toContain(`href="${action}"`);
    expect(message?.html).toContain("&lt;Template User&gt;");
    expect(message?.html).not.toContain("<Template User>");
  });

  it("uses the Arabic recovery title and links to password reset", async () => {
    const { send, service } = createService();

    await service.sendPasswordResetEmail(
      "Template User",
      "user@example.com",
      "reset-token",
    );

    const message = send.mock.calls[0]?.[0];
    const action =
      "http://localhost:3000/auth/reset-password?token=reset-token";
    expect(message).toMatchObject({
      subject: "إعادة تعيين كلمة المرور | الحذاء الشرقي",
      localPreviewUrl: action,
    });
    expect(message?.html).toContain(`href="${action}"`);
    expect(message?.html).toContain("تعيين كلمة مرور جديدة");
  });
});
