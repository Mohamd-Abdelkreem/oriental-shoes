import type { Prisma } from "@template/database";
import { Department, UserRole, UserStatus } from "@template/database";
import { describe, expect, it, vi } from "vitest";

import { UnauthorizedException } from "../../core/errors/unauthorized.error.js";
import {
  AccountRestrictedError,
  DepartmentAccessDeniedError,
} from "./auth.errors.js";
import {
  assertBusinessAuthority,
  AUTHORITY_ACCOUNT_SELECT,
  type AuthorityAccount,
  loadIdentityAccount,
  lockAccountRows,
} from "./account-authority.js";

const VERIFIED_AT = new Date("2026-08-18T00:00:00.000Z");
const APPROVED_AT = new Date("2026-08-19T00:00:00.000Z");
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const APPROVER_ID = "22222222-2222-4222-8222-222222222222";

const account = (
  overrides: Partial<AuthorityAccount> = {},
): AuthorityAccount => ({
  id: "33333333-3333-4333-8333-333333333333",
  email: "user@example.com",
  fullName: "Template User",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  department: Department.SALES,
  staffApprovedAt: APPROVED_AT,
  staffApprovedById: APPROVER_ID,
  accessVersion: 2,
  emailVerifiedAt: VERIFIED_AT,
  createdAt: VERIFIED_AT,
  updatedAt: APPROVED_AT,
  ...overrides,
});

describe("authority account selection", () => {
  it("selects exactly the defined internal account fields", () => {
    expect(Object.keys(AUTHORITY_ACCOUNT_SELECT).sort()).toEqual([
      "accessVersion",
      "createdAt",
      "department",
      "email",
      "emailVerifiedAt",
      "fullName",
      "id",
      "phone",
      "role",
      "staffApprovedAt",
      "staffApprovedById",
      "status",
      "updatedAt",
    ]);
  });

  it("never selects a credential or a token field", () => {
    for (const field of Object.keys(AUTHORITY_ACCOUNT_SELECT)) {
      expect(field).not.toMatch(/password|token/iu);
    }
  });
});

describe("business authority assertions", () => {
  it("allows a verified active administrator without employee fields", () => {
    expect(() => {
      assertBusinessAuthority(
        account({
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
        }),
      );
    }).not.toThrow();
  });

  it("exempts a verified active administrator from department matching", () => {
    expect(() => {
      assertBusinessAuthority(
        account({
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
        }),
        Department.CUTTING,
      );
    }).not.toThrow();
  });

  it("denies an unverified or suspended administrator", () => {
    expect(() => {
      assertBusinessAuthority(
        account({
          role: UserRole.ADMIN,
          status: UserStatus.PENDING_VERIFICATION,
          emailVerifiedAt: null,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
        }),
      );
    }).toThrow(AccountRestrictedError);
    expect(() => {
      assertBusinessAuthority(
        account({
          role: UserRole.ADMIN,
          status: UserStatus.SUSPENDED,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
        }),
      );
    }).toThrow(AccountRestrictedError);
  });

  it("allows an approved verified active employee", () => {
    expect(() => {
      assertBusinessAuthority(account());
    }).not.toThrow();
    expect(() => {
      assertBusinessAuthority(account(), Department.SALES);
    }).not.toThrow();
  });

  it("denies an employee without exactly one department", () => {
    expect(() => {
      assertBusinessAuthority(account({ department: null }));
    }).toThrow(AccountRestrictedError);
  });

  it("denies an employee without the complete approval pair", () => {
    expect(() => {
      assertBusinessAuthority(account({ staffApprovedAt: null }));
    }).toThrow(AccountRestrictedError);
    expect(() => {
      assertBusinessAuthority(account({ staffApprovedById: null }));
    }).toThrow(AccountRestrictedError);
  });

  it("denies every restricted employee state", () => {
    for (const status of [
      UserStatus.PENDING_VERIFICATION,
      UserStatus.PENDING_APPROVAL,
      UserStatus.REJECTED,
      UserStatus.SUSPENDED,
    ]) {
      expect(() => {
        assertBusinessAuthority(
          account({
            status,
            emailVerifiedAt:
              status === UserStatus.PENDING_VERIFICATION ? null : VERIFIED_AT,
            department: null,
            staffApprovedAt: null,
            staffApprovedById: null,
          }),
        );
      }).toThrow(AccountRestrictedError);
    }
  });

  it("denies a legacy suspension that was never approved", () => {
    expect(() => {
      assertBusinessAuthority(
        account({
          status: UserStatus.SUSPENDED,
          department: null,
          staffApprovedAt: null,
          staffApprovedById: null,
        }),
      );
    }).toThrow(AccountRestrictedError);
  });

  it("denies an unverified active employee", () => {
    expect(() => {
      assertBusinessAuthority(account({ emailVerifiedAt: null }));
    }).toThrow(AccountRestrictedError);
  });

  it("denies an employee requesting another department", () => {
    expect(() => {
      assertBusinessAuthority(account(), Department.CUTTING);
    }).toThrow(DepartmentAccessDeniedError);
  });
});

describe("account row locks", () => {
  const createTransaction = () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const tx = {
      $queryRaw: (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown[]> => {
        calls.push({ query: strings.join("?"), values });
        return Promise.resolve([]);
      },
    };
    return {
      tx: tx as unknown as Prisma.TransactionClient,
      calls,
    };
  };

  it("canonicalizes, deduplicates and sorts the locked identities", async () => {
    const { tx, calls } = createTransaction();
    await lockAccountRows(
      tx,
      [
        "33333333-3333-4333-8333-333333333333",
        "  11111111-1111-4111-8111-111111111111  ",
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      "write",
    );

    expect(calls.map(({ values }) => values[0])).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("uses one fixed read lock text and one fixed write lock text", async () => {
    const { tx, calls } = createTransaction();
    await lockAccountRows(tx, [ADMIN_ID], "read");
    await lockAccountRows(tx, [ADMIN_ID], "write");

    expect(calls[0]?.query).toContain("FOR SHARE");
    expect(calls[0]?.query).not.toContain("FOR UPDATE");
    expect(calls[1]?.query).toContain("FOR UPDATE");
    expect(calls[1]?.query).not.toContain("FOR SHARE");
  });

  it("acquires the locks sequentially in one transaction", async () => {
    const { tx, calls } = createTransaction();
    await lockAccountRows(
      tx,
      ["22222222-2222-4222-8222-222222222222", ADMIN_ID],
      "write",
    );
    expect(calls).toHaveLength(2);
  });

  it("never derives a SQL identifier from the environment", async () => {
    const { tx, calls } = createTransaction();
    await lockAccountRows(tx, [ADMIN_ID], "read");
    expect(calls[0]?.query).toBe(
      'SELECT "id" FROM "users" WHERE "id" = ?::uuid FOR SHARE',
    );
    expect(calls[0]?.values[0]).toBe(ADMIN_ID);
  });

  it("ignores an empty identity list", async () => {
    const { tx, calls } = createTransaction();
    await lockAccountRows(tx, [], "write");
    expect(calls).toEqual([]);
  });
});

describe("identity account loading", () => {
  it("loads the current account through the shared authority selection", async () => {
    const findUnique = vi.fn().mockResolvedValue(account());
    const tx = {
      user: { findUnique },
    } as unknown as Prisma.TransactionClient;

    const loaded = await loadIdentityAccount(
      tx,
      "33333333-3333-4333-8333-333333333333",
    );

    expect(loaded.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "33333333-3333-4333-8333-333333333333" },
      select: AUTHORITY_ACCOUNT_SELECT,
    });
  });

  it("denies a removed identity", async () => {
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      loadIdentityAccount(tx, "33333333-3333-4333-8333-333333333333"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
