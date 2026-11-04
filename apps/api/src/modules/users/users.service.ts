import type { SafeUser } from "@template/contracts";
import type { DatabaseClient } from "@template/database";

import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import {
  assertBusinessAuthority,
  loadIdentityAccount,
  lockAccountRows,
} from "../auth/account-authority.js";
import type { UpdateProfileBodyDto } from "./dto/update-profile.dto.js";
import { mapSafeUser, SAFE_USER_SELECT } from "./users.mapper.js";

export class UsersService {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * The own current identity. It is an identity read, not a business eligibility
   * read: a restricted account still sees its own current state.
   */
  async getCurrentUser(userId: string): Promise<SafeUser> {
    return this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [userId], "read");
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: SAFE_USER_SELECT,
      });
      if (user === null) throw new UnauthorizedException("User not found.");
      return mapSafeUser(user);
    });
  }

  /**
   * A profile save. It requires current business eligibility, touches only the
   * owned profile fields and never changes authority, approval or history.
   */
  async updateCurrentUser(
    userId: string,
    data: UpdateProfileBodyDto,
  ): Promise<SafeUser> {
    return this.database.$transaction(async (transaction) => {
      await lockAccountRows(transaction, [userId], "write");
      const account = await loadIdentityAccount(transaction, userId);
      assertBusinessAuthority(account);

      const updates: { fullName?: string; phone?: string | null } = {};
      if (data.fullName !== undefined) updates.fullName = data.fullName.trim();
      if (data.phone !== undefined) {
        const phone = data.phone === null ? "" : data.phone.trim();
        updates.phone = phone.length === 0 ? null : phone;
      }

      const isUnchanged =
        (updates.fullName === undefined ||
          updates.fullName === account.fullName) &&
        (updates.phone === undefined || updates.phone === account.phone);
      if (isUnchanged) {
        return mapSafeUser(account);
      }

      const updated = await transaction.user.update({
        where: { id: userId },
        data: updates,
        select: SAFE_USER_SELECT,
      });
      return mapSafeUser(updated);
    });
  }
}
