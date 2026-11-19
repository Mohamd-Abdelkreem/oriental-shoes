import { emailConfig } from "../../core/config/email.config.js";
import { logger } from "../logger/logger.js";
import type { EmailDelivery } from "./email-delivery.js";
import {
  RESET_PASSWORD_SUBJECT,
  resetPasswordTemplate,
} from "./templates/reset-password.template.js";
import {
  VERIFY_EMAIL_SUBJECT,
  verifyEmailTemplate,
} from "./templates/verify-email.template.js";

export class EmailService {
  private readonly logoUrl: string;

  constructor(
    private readonly delivery: EmailDelivery,
    private readonly fromAddress = emailConfig.fromAddress,
    private readonly fromName = emailConfig.fromName,
    private readonly replyTo = emailConfig.replyTo,
    private readonly publicWebUrl = emailConfig.publicWebUrl,
  ) {
    this.logoUrl = new URL(
      "brand/oriental-logo.png",
      `${this.publicWebUrl}/`,
    ).href;
  }

  async sendVerificationEmail(
    name: string,
    email: string,
    token: string,
  ): Promise<void> {
    const actionUrl = this.buildPublicUrl("/auth/verify-email", token);
    await this.send({
      to: email,
      subject: VERIFY_EMAIL_SUBJECT,
      html: verifyEmailTemplate(name, actionUrl, this.logoUrl),
      localPreviewUrl: actionUrl,
    });
  }

  async sendPasswordResetEmail(
    name: string,
    email: string,
    token: string,
  ): Promise<void> {
    const actionUrl = this.buildPublicUrl("/auth/reset-password", token);
    await this.send({
      to: email,
      subject: RESET_PASSWORD_SUBJECT,
      html: resetPasswordTemplate(name, actionUrl, this.logoUrl),
      localPreviewUrl: actionUrl,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    html: string;
    localPreviewUrl: string;
  }): Promise<void> {
    const result = await this.delivery.send({
      from: `"${this.fromName}" <${this.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      localPreviewUrl: input.localPreviewUrl,
      ...(this.replyTo === "" ? {} : { replyTo: this.replyTo }),
    });
    logger.info(
      {
        provider: this.delivery.provider,
        outcome: "email_sent",
        providerMessageId: result.providerMessageId,
        recipientDomain: input.to.split("@")[1] ?? null,
      },
      "Email sent.",
    );
  }

  private buildPublicUrl(path: string, token: string): string {
    const url = new URL(`${this.publicWebUrl}${path}`);
    url.searchParams.set("token", token);
    return url.toString();
  }
}
