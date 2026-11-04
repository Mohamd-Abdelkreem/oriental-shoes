import { randomUUID } from "node:crypto";

import type {
  EmailRequestBodyDto,
  LoginBodyDto,
  RegisterBodyDto,
  ResetPasswordBodyDto,
  ChangePasswordBodyDto,
} from "./dto/index.js";
import {
  Prisma,
  UserRole,
  UserStatus,
  type DatabaseClient,
  type User,
} from "@template/database";

import { authConfig } from "../../core/config/auth.config.js";
import { BadRequestException } from "../../core/errors/bad-request.error.js";
import { ConflictException } from "../../core/errors/conflict.error.js";
import { ForbiddenException } from "../../core/errors/forbidden.error.js";
import { ServiceUnavailableException } from "../../core/errors/service-unavailable.error.js";
import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import type { EmailService } from "../../infrastructure/email/index.js";
import { logger } from "../../infrastructure/logger/logger.js";
import {
  compareHash,
  generateHash,
  sha256,
} from "../../infrastructure/security/index.js";
import {
  generateResetToken,
  generateTokenPair,
  generateVerificationToken,
  verifyRefreshToken,
  verifyResetToken,
  verifyVerificationToken,
} from "../../infrastructure/security/index.js";
import {
  mapSafeUser,
  SAFE_USER_SELECT,
  type SafeUserRecord,
} from "../users/users.mapper.js";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
  type AuthorityAccount,
} from "./account-authority.js";
import { AccountRestrictedError } from "./auth.errors.js";
import {
  FORGOT_PASSWORD_NEUTRAL_RESPONSE,
  RESET_TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESEND_NEUTRAL_RESPONSE,
  VERIFICATION_TOKEN_TTL_MS,
} from "./auth.constants.js";
import type {
  AuthResponseWithTokens,
  AuthResponseWithoutTokens,
  TokenPair,
} from "./types/auth.types.js";

/**
 * The identity facts a session is minted from. They are always read from the
 * current database row, never from a token claim.
 */
type SessionIdentity = Readonly<{
  id: string;
  email: string;
  role: UserRole;
}>;

export class AuthService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly emailService: EmailService,
  ) {}

  async register(data: RegisterBodyDto): Promise<AuthResponseWithoutTokens> {
    const email = data.email.trim().toLowerCase();
    const verificationToken = generateVerificationToken(email);
    const verificationTokenHash = sha256(verificationToken);
    const passwordHash = await generateHash(data.password);
    let user: User;

    try {
      user = await this.database.user.create({
        data: {
          email,
          fullName: data.fullName.trim(),
          phone: data.phone,
          passwordHash,
          status: UserStatus.PENDING_VERIFICATION,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
          accessVersion: 0,
          verificationTokenHash,
          verificationTokenExpiresAt: new Date(
            Date.now() + VERIFICATION_TOKEN_TTL_MS,
          ),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Email is already in use.");
      }
      throw error;
    }

    try {
      await this.emailService.sendVerificationEmail(
        user.fullName,
        user.email,
        verificationToken,
      );
    } catch {
      await this.removeUndeliverablePendingUser(user.id, verificationTokenHash);
      throw new ServiceUnavailableException(
        "Registration is temporarily unavailable. Please try again.",
      );
    }

    return { user: mapSafeUser(user) };
  }

  async resendVerification(
    data: EmailRequestBodyDto,
  ): Promise<typeof RESEND_NEUTRAL_RESPONSE> {
    const email = data.email.trim().toLowerCase();

    const prepared = await this.database.$transaction(async (transaction) => {
      const candidate = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (candidate === null) {
        return null;
      }

      await lockAccountRows(transaction, [candidate.id], "write");

      const current = await transaction.user.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
          verificationTokenHash: true,
          verificationTokenExpiresAt: true,
        },
      });

      if (
        current === null ||
        current.status !== UserStatus.PENDING_VERIFICATION ||
        current.emailVerifiedAt !== null ||
        current.verificationTokenHash === null ||
        current.verificationTokenExpiresAt === null
      ) {
        return null;
      }

      const issuedAt =
        current.verificationTokenExpiresAt.getTime() -
        VERIFICATION_TOKEN_TTL_MS;
      if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
        return null;
      }

      const token = generateVerificationToken(current.email);
      const replaced = await transaction.user.updateMany({
        where: {
          id: current.id,
          status: UserStatus.PENDING_VERIFICATION,
          emailVerifiedAt: null,
          verificationTokenHash: current.verificationTokenHash,
          verificationTokenExpiresAt: current.verificationTokenExpiresAt,
        },
        data: {
          verificationTokenHash: sha256(token),
          verificationTokenExpiresAt: new Date(
            Date.now() + VERIFICATION_TOKEN_TTL_MS,
          ),
        },
      });

      if (replaced.count !== 1) {
        return null;
      }

      return {
        userId: current.id,
        fullName: current.fullName,
        email: current.email,
        token,
      };
    });

    if (prepared !== null) {
      void this.emailService
        .sendVerificationEmail(
          prepared.fullName,
          prepared.email,
          prepared.token,
        )
        .catch((_error: unknown) => {
          logger.error(
            { userId: prepared.userId, outcome: "verification_resend_failed" },
            "Failed to resend verification email.",
          );
        });
    }

    return RESEND_NEUTRAL_RESPONSE;
  }

  async verifyEmail(token: string): Promise<AuthResponseWithoutTokens> {
    const verified = verifyVerificationToken(token);

    if (!verified.valid) {
      throw new BadRequestException("Invalid or expired verification token.");
    }

    const normalizedEmail = verified.payload.email.trim().toLowerCase();
    const tokenHash = sha256(token);

    const updated = await this.database.$transaction(async (transaction) => {
      const candidate = await transaction.user.findFirst({
        where: {
          email: normalizedEmail,
          verificationTokenHash: tokenHash,
        },
        select: { id: true },
      });

      if (candidate === null) {
        throw new BadRequestException("Invalid or expired verification token.");
      }

      await lockAccountRows(transaction, [candidate.id], "write");

      const account = await loadIdentityAccount(transaction, candidate.id);

      if (account.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException("Account is suspended.");
      }

      if (
        account.status !== UserStatus.PENDING_VERIFICATION ||
        account.emailVerifiedAt !== null
      ) {
        throw new BadRequestException("Invalid or expired verification token.");
      }

      const now = new Date();
      const nextStatus =
        account.role === UserRole.ADMIN
          ? UserStatus.ACTIVE
          : UserStatus.PENDING_APPROVAL;

      const consumed = await transaction.user.updateMany({
        where: {
          id: account.id,
          email: normalizedEmail,
          role: account.role,
          status: UserStatus.PENDING_VERIFICATION,
          emailVerifiedAt: null,
          verificationTokenHash: tokenHash,
          verificationTokenExpiresAt: { gt: now },
        },
        data: {
          status: nextStatus,
          emailVerifiedAt: now,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
          accessVersion: { increment: 1 },
        },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException("Invalid or expired verification token.");
      }

      const activated = await transaction.user.findUnique({
        where: { id: account.id },
        select: SAFE_USER_SELECT,
      });

      if (activated === null) {
        throw new BadRequestException("Invalid or expired verification token.");
      }

      return activated;
    });

    return { user: mapSafeUser(updated) };
  }

  async login(data: LoginBodyDto): Promise<AuthResponseWithTokens> {
    const email = data.email.trim().toLowerCase();
    const credential = await this.database.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (credential === null)
      throw new UnauthorizedException("Invalid credentials.");

    const passwordMatches = await compareHash(
      data.password,
      credential.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [credential.id], "read");

      const account = await loadIdentityAccount(transaction, credential.id);

      const current = await transaction.user.findUnique({
        where: { id: account.id },
        select: { passwordHash: true },
      });
      if (
        current === null ||
        current.passwordHash !== credential.passwordHash
      ) {
        throw new UnauthorizedException("Invalid credentials.");
      }

      const generated = this.buildTokenPair(account, data.rememberMe);
      await transaction.refreshToken.create({ data: generated.record });

      return {
        user: mapSafeUser(account),
        tokens: generated.tokens,
        rememberMe: data.rememberMe,
      };
    });
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    if (refreshToken.length === 0) return;
    const tokenHash = sha256(refreshToken);
    await this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [userId], "write");
      await loadIdentityAccount(transaction, userId);
      await transaction.refreshToken.deleteMany({
        where: { userId, tokenHash },
      });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [userId], "write");
      await loadIdentityAccount(transaction, userId);
      await transaction.refreshToken.deleteMany({ where: { userId } });
    });
  }

  async refresh(refreshToken: string): Promise<AuthResponseWithTokens> {
    if (refreshToken.length === 0) {
      throw new BadRequestException("Refresh token is required.");
    }

    const verified = verifyRefreshToken(refreshToken);
    if (!verified.valid) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const oldTokenHash = sha256(refreshToken);

    return this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [verified.payload.userId], "read");

      const now = new Date();
      const oldToken = await transaction.refreshToken.findFirst({
        where: {
          id: verified.payload.tokenId,
          userId: verified.payload.userId,
          tokenHash: oldTokenHash,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      });
      if (oldToken === null) {
        throw new UnauthorizedException("Invalid or expired refresh token.");
      }

      const account = await loadIdentityAccount(transaction, oldToken.userId);

      const absoluteExpiry = new Date(verified.payload.expiresAt * 1_000);
      if (absoluteExpiry <= now) {
        throw new UnauthorizedException("Refresh token has expired.");
      }

      const replacement = this.buildTokenPairWithExpiry(
        account,
        verified.payload.rememberMe,
        absoluteExpiry,
      );

      const deleted = await transaction.refreshToken.deleteMany({
        where: {
          id: oldToken.id,
          userId: oldToken.userId,
          tokenHash: oldTokenHash,
        },
      });
      if (deleted.count !== 1) {
        throw new UnauthorizedException("Refresh token has already been used.");
      }
      await transaction.refreshToken.create({ data: replacement.record });

      return {
        user: mapSafeUser(account),
        tokens: replacement.tokens,
        rememberMe: verified.payload.rememberMe,
      };
    });
  }

  async forgotPassword(
    data: EmailRequestBodyDto,
  ): Promise<typeof FORGOT_PASSWORD_NEUTRAL_RESPONSE> {
    const email = data.email.trim().toLowerCase();

    const prepared = await this.database.$transaction(async (transaction) => {
      const candidate = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (candidate === null) {
        return null;
      }

      await lockAccountRows(transaction, [candidate.id], "write");

      const account = await loadIdentityAccount(transaction, candidate.id);
      if (!this.isBusinessEligible(account)) {
        return null;
      }

      const token = generateResetToken(account.email);
      await transaction.user.update({
        where: { id: account.id },
        data: {
          resetTokenHash: sha256(token),
          resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      return {
        userId: account.id,
        fullName: account.fullName,
        email: account.email,
        token,
      };
    });

    if (prepared !== null) {
      void this.emailService
        .sendPasswordResetEmail(
          prepared.fullName,
          prepared.email,
          prepared.token,
        )
        .catch((_error: unknown) => {
          logger.error(
            { userId: prepared.userId, outcome: "password_reset_email_failed" },
            "Failed to send password reset email.",
          );
        });
    }

    return FORGOT_PASSWORD_NEUTRAL_RESPONSE;
  }

  async resetPassword(
    data: ResetPasswordBodyDto,
    token: string,
  ): Promise<AuthResponseWithoutTokens> {
    const verified = verifyResetToken(token);
    if (!verified.valid) {
      throw new UnauthorizedException("Invalid or expired reset token.");
    }

    const tokenHash = sha256(token);
    const email = verified.payload.email.trim().toLowerCase();
    const credential = await this.database.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        resetTokenHash: true,
        resetTokenExpiresAt: true,
      },
    });
    if (
      credential === null ||
      credential.resetTokenHash !== tokenHash ||
      credential.resetTokenExpiresAt === null ||
      credential.resetTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException("Invalid or expired reset token.");
    }

    await this.assertNewPasswordDiffers(
      data.newPassword,
      credential.passwordHash,
    );
    const passwordHash = await generateHash(data.newPassword);

    const updated = await this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [credential.id], "write");

      const account = await loadIdentityAccount(transaction, credential.id);

      const now = new Date();
      const current = await transaction.user.findUnique({
        where: { id: account.id },
        select: {
          passwordHash: true,
          resetTokenHash: true,
          resetTokenExpiresAt: true,
        },
      });
      if (
        current === null ||
        current.resetTokenHash !== tokenHash ||
        current.resetTokenExpiresAt === null ||
        current.resetTokenExpiresAt.getTime() <= now.getTime()
      ) {
        throw new UnauthorizedException("Invalid or expired reset token.");
      }

      if (!this.isBusinessEligible(account)) {
        throw new AccountRestrictedError();
      }

      const consumed = await transaction.user.updateMany({
        where: {
          id: account.id,
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: { gt: now },
          passwordHash: credential.passwordHash,
        },
        data: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException("Invalid or expired reset token.");
      }
      await transaction.refreshToken.deleteMany({
        where: { userId: account.id },
      });
      const safeUser = await transaction.user.findUnique({
        where: { id: account.id },
        select: SAFE_USER_SELECT,
      });
      if (safeUser === null) {
        throw new UnauthorizedException("Invalid or expired reset token.");
      }
      return safeUser;
    });
    return { user: mapSafeUser(updated) };
  }

  async validateResetToken(token: string): Promise<{ valid: true }> {
    const verified = verifyResetToken(token);
    if (!verified.valid) {
      throw new UnauthorizedException("Invalid or expired reset token.");
    }

    const tokenHash = sha256(token);
    const email = verified.payload.email.trim().toLowerCase();

    const account = await this.database.$transaction(async (transaction) => {
      const candidate = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (candidate === null) {
        throw new UnauthorizedException("Invalid or expired reset token.");
      }

      await lockAccountRows(transaction, [candidate.id], "read");

      const current = await loadIdentityAccount(transaction, candidate.id);
      const credential = await transaction.user.findUnique({
        where: { id: current.id },
        select: { resetTokenHash: true, resetTokenExpiresAt: true },
      });
      if (
        credential === null ||
        credential.resetTokenHash !== tokenHash ||
        credential.resetTokenExpiresAt === null ||
        credential.resetTokenExpiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException("Invalid or expired reset token.");
      }

      return current;
    });

    if (!this.isBusinessEligible(account)) {
      throw new AccountRestrictedError();
    }

    return { valid: true };
  }

  async changePassword(
    userId: string,
    data: ChangePasswordBodyDto,
  ): Promise<AuthResponseWithoutTokens> {
    const credential = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (credential === null) throw new UnauthorizedException("User not found.");

    if (!(await compareHash(data.currentPassword, credential.passwordHash))) {
      throw new BadRequestException("Current password is not correct.");
    }
    await this.assertNewPasswordDiffers(
      data.newPassword,
      credential.passwordHash,
    );
    const updated = await this.updatePasswordAndRevokeTokens(
      credential.id,
      credential.passwordHash,
      data.newPassword,
    );
    return { user: mapSafeUser(updated) };
  }

  private async assertNewPasswordDiffers(
    newPassword: string,
    passwordHash: string,
  ): Promise<void> {
    if (await compareHash(newPassword, passwordHash)) {
      throw new BadRequestException(
        "New password must differ from current password.",
      );
    }
  }

  private async updatePasswordAndRevokeTokens(
    userId: string,
    comparedPasswordHash: string,
    newPassword: string,
  ): Promise<SafeUserRecord> {
    const passwordHash = await generateHash(newPassword);
    return this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [userId], "write");

      const account = await loadIdentityAccount(transaction, userId);
      assertBusinessAuthority(account);

      const current = await transaction.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (current === null || current.passwordHash !== comparedPasswordHash) {
        throw new BadRequestException("Current password is not correct.");
      }

      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
        select: SAFE_USER_SELECT,
      });
      await transaction.refreshToken.deleteMany({ where: { userId } });
      return updated;
    });
  }

  private buildTokenPair(
    identity: SessionIdentity,
    rememberMe: boolean,
  ): {
    tokens: TokenPair;
    record: Prisma.RefreshTokenUncheckedCreateInput;
  } {
    const ttlSeconds = rememberMe
      ? authConfig.refreshRememberedTtlSeconds
      : authConfig.refreshFamilyTtlSeconds;
    return this.buildTokenPairWithExpiry(
      identity,
      rememberMe,
      new Date(Date.now() + ttlSeconds * 1_000),
    );
  }

  private buildTokenPairWithExpiry(
    identity: SessionIdentity,
    rememberMe: boolean,
    expiresAt: Date,
  ): {
    tokens: TokenPair;
    record: Prisma.RefreshTokenUncheckedCreateInput;
  } {
    const tokenId = randomUUID();
    const tokens = generateTokenPair({
      userId: identity.id,
      tokenId,
      role: identity.role,
      email: identity.email,
      rememberMe,
      absoluteExpiresAt: expiresAt,
    });
    return {
      tokens,
      record: {
        id: tokenId,
        userId: identity.id,
        tokenHash: sha256(tokens.refreshToken),
        expiresAt,
      },
    };
  }

  /**
   * Business eligibility for the recovery flow. It reuses the single authority
   * owner so the recovery path cannot drift from the protected business paths.
   */
  private isBusinessEligible(account: AuthorityAccount): boolean {
    try {
      assertBusinessAuthority(account);
      return true;
    } catch (error) {
      if (error instanceof AccountRestrictedError) {
        return false;
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private async removeUndeliverablePendingUser(
    userId: string,
    verificationTokenHash: string,
  ): Promise<void> {
    try {
      const deleted = await this.database.user.deleteMany({
        where: {
          id: userId,
          status: UserStatus.PENDING_VERIFICATION,
          emailVerifiedAt: null,
          verificationTokenHash,
        },
      });
      if (deleted.count !== 1) {
        logger.error(
          { userId, outcome: "registration_delivery_rollback_missed" },
          "Pending registration could not be removed after email delivery failure.",
        );
      }
    } catch {
      logger.error(
        { userId, outcome: "registration_delivery_rollback_failed" },
        "Pending registration cleanup failed after email delivery failure.",
      );
    }
  }
}
