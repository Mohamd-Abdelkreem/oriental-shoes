import type { NextFunction, Request, Response } from "express";

import type { DatabaseClient } from "@template/database";

import { UnauthorizedException } from "../core/errors/unauthorized.error.js";
import {
  assertBusinessAuthority,
  AUTHORITY_ACCOUNT_SELECT,
  type AuthorityAccount,
} from "../modules/auth/account-authority.js";
import { mapSafeUser } from "../modules/users/users.mapper.js";
import { verifyAccessToken } from "../infrastructure/security/jwt.service.js";

type UserLookupClient = Pick<DatabaseClient, "user">;

/**
 * Resolves the current extant identity behind the bearer credential. A missing,
 * invalid or expired credential, and a removed identity, are all
 * `401 UNAUTHORIZED`. The returned account is the current database state, never
 * a claim carried by the token.
 */
const resolveIdentityAccount = async (
  database: UserLookupClient,
  authorizationHeader: string | undefined,
): Promise<AuthorityAccount> => {
  const [scheme, token] = authorizationHeader?.split(" ") ?? [];
  if (scheme !== "Bearer" || token === undefined || token.length === 0) {
    throw new UnauthorizedException(
      "Authentication required. Provide a valid bearer token.",
    );
  }

  const verified = verifyAccessToken(token);
  if (!verified.valid) {
    throw new UnauthorizedException(verified.error);
  }

  const account = await database.user.findUnique({
    where: { id: verified.payload.userId },
    select: AUTHORITY_ACCOUNT_SELECT,
  });
  if (account === null) {
    throw new UnauthorizedException(
      "The account is unavailable. Sign in again.",
    );
  }

  return account;
};

/**
 * Private identity guard. It accepts any extant credential-valid identity so a
 * restricted account can read its own current status and exit. It grants no
 * business eligibility.
 */
export const createIdentityAuthenticationMiddleware =
  (database: UserLookupClient) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    response.setHeader("Cache-Control", "no-store");
    const account = await resolveIdentityAccount(
      database,
      request.headers.authorization,
    );
    request.user = mapSafeUser(account);
    next();
  };

/**
 * Business guard. It reuses the same identity resolution and additionally
 * requires current business eligibility, so a restricted identity keeps its
 * valid session while failing with `403 ACCOUNT_RESTRICTED`.
 */
export const createAuthenticationMiddleware =
  (database: UserLookupClient) =>
  async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    response.setHeader("Cache-Control", "no-store");
    const account = await resolveIdentityAccount(
      database,
      request.headers.authorization,
    );
    assertBusinessAuthority(account);
    request.user = mapSafeUser(account);
    next();
  };
