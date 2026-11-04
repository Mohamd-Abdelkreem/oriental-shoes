import type { AuthUserData, SafeUser } from "@template/contracts";
import { describe, expect, it } from "vitest";

import { resolveGuestOnlyRouteState } from "./guest-only-route";
import { resolveProtectedRouteState } from "./protected-route";

const user = (overrides: Partial<SafeUser> = {}): AuthUserData => ({
  user: {
    id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
    fullName: "Template User",
    email: "user@example.com",
    phone: null,
    role: "USER",
    status: "ACTIVE",
    department: "SALES",
    staffApprovedAt: "2026-08-01T00:00:00.000Z",
    accessVersion: 1,
    emailVerifiedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  },
});

const admin = (overrides: Partial<SafeUser> = {}): AuthUserData =>
  user({
    role: "ADMIN",
    department: null,
    staffApprovedAt: null,
    ...overrides,
  });

const settled = { isPending: false, isFetched: true, isError: false };

describe("pure route states", () => {
  it("keeps pending and unexpected failures distinct", () => {
    expect(
      resolveProtectedRouteState(
        { ...settled, isPending: true },
        null,
        "/admin/dashboard",
        undefined,
      ).kind,
    ).toBe("pending");
    expect(
      resolveGuestOnlyRouteState({ ...settled, isError: true }, null).kind,
    ).toBe("error");
  });

  it("redirects anonymous users with only a safe return path", () => {
    expect(
      resolveProtectedRouteState(
        settled,
        null,
        "/admin/account?section=profile",
        undefined,
      ),
    ).toEqual({
      kind: "redirecting",
      target: "/auth/login?returnTo=%2Fadmin%2Faccount%3Fsection%3Dprofile",
    });
    expect(
      resolveProtectedRouteState(
        settled,
        null,
        "/admin/account?token=secret",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/login" });
  });

  it("sends every restricted account to its own status surface", () => {
    expect(
      resolveProtectedRouteState(
        settled,
        user({ status: "PENDING_VERIFICATION", department: null }),
        "/admin/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/verify-email" });
    expect(
      resolveProtectedRouteState(
        settled,
        user({
          status: "PENDING_APPROVAL",
          department: null,
          staffApprovedAt: null,
        }),
        "/admin/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/pending-approval" });
    expect(
      resolveProtectedRouteState(
        settled,
        user({ status: "REJECTED", department: null, staffApprovedAt: null }),
        "/admin/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/rejected" });
    expect(
      resolveProtectedRouteState(
        settled,
        user({ status: "SUSPENDED", department: null, staffApprovedAt: null }),
        "/admin/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/suspended" });
  });

  it("denies a malformed or wrongly-placed business account", () => {
    expect(
      resolveProtectedRouteState(
        settled,
        user({ department: null, staffApprovedAt: null }),
        "/sales/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/unauthorized" });
    expect(
      resolveProtectedRouteState(settled, user(), "/sales/dashboard", [
        "ADMIN",
      ]),
    ).toEqual({ kind: "redirecting", target: "/unauthorized" });
    expect(
      resolveProtectedRouteState(
        settled,
        user(),
        "/cutting/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/unauthorized" });
    expect(
      resolveProtectedRouteState(
        settled,
        user(),
        "/admin/dashboard",
        undefined,
      ),
    ).toEqual({ kind: "redirecting", target: "/unauthorized" });
  });

  it("authorizes an account inside its permitted workspace root", () => {
    expect(
      resolveProtectedRouteState(settled, user(), "/sales/dashboard", undefined)
        .kind,
    ).toBe("authorized");
    expect(
      resolveProtectedRouteState(settled, admin(), "/admin/dashboard", [
        "ADMIN",
      ]).kind,
    ).toBe("authorized");
    expect(
      resolveProtectedRouteState(
        settled,
        admin(),
        "/sales/dashboard",
        undefined,
      ).kind,
    ).toBe("authorized");
  });

  it("keeps the print boundary on its existing administrator guard", () => {
    expect(
      resolveProtectedRouteState(settled, user(), "/print/order/1", ["ADMIN"]),
    ).toEqual({ kind: "redirecting", target: "/unauthorized" });
    expect(
      resolveProtectedRouteState(settled, admin(), "/print/order/1", ["ADMIN"])
        .kind,
    ).toBe("authorized");
  });

  it("allows guests and redirects a valid authenticated account", () => {
    expect(resolveGuestOnlyRouteState(settled, null).kind).toBe("authorized");
    expect(resolveGuestOnlyRouteState(settled, user())).toEqual({
      kind: "redirecting",
      target: "/sales/dashboard",
    });
  });

  it("keeps the two-argument guest signature backward compatible", () => {
    expect(resolveGuestOnlyRouteState(settled, user()).kind).toBe(
      "redirecting",
    );
    expect(resolveGuestOnlyRouteState(settled, null).kind).toBe("authorized");
  });

  it("permits the public children for a closed credential policy", () => {
    for (const policy of [
      "credential-required",
      "identity-changed",
      "signed-out",
    ] as const) {
      expect(
        resolveGuestOnlyRouteState(
          { ...settled, isPending: true },
          null,
          null,
          { policy, retainChildren: false },
        ).kind,
      ).toBe("authorized");
    }
  });

  it("permits the public children for either local reauthentication code", () => {
    for (const code of [
      "AUTH_IDENTITY_CHANGED",
      "AUTH_REAUTHENTICATION_REQUIRED",
    ]) {
      expect(
        resolveGuestOnlyRouteState(
          { ...settled, isPending: true },
          null,
          code,
          { policy: "restore", retainChildren: false },
        ).kind,
      ).toBe("authorized");
    }
  });

  it("resolves a successful business identity before retention", () => {
    expect(
      resolveGuestOnlyRouteState(settled, user(), null, {
        policy: "restore",
        retainChildren: true,
        pathname: "/auth/login",
      }),
    ).toEqual({ kind: "redirecting", target: "/sales/dashboard" });
  });

  it("keeps a restored restricted account on the credential form", () => {
    expect(
      resolveGuestOnlyRouteState(
        settled,
        user({
          status: "PENDING_APPROVAL",
          department: null,
          staffApprovedAt: null,
        }),
        null,
        {
          policy: "restore",
          retainChildren: false,
          pathname: "/auth/login",
          credentialCompletedSinceEntry: false,
        },
      ).kind,
    ).toBe("authorized");
  });

  it("sends a restricted account away only after credentials completed here", () => {
    expect(
      resolveGuestOnlyRouteState(
        settled,
        user({
          status: "PENDING_APPROVAL",
          department: null,
          staffApprovedAt: null,
        }),
        null,
        {
          policy: "restore",
          retainChildren: false,
          pathname: "/auth/login",
          credentialCompletedSinceEntry: true,
        },
      ),
    ).toEqual({ kind: "redirecting", target: "/auth/pending-approval" });
  });

  it("keeps a permitted login return and rejects an unsafe one", () => {
    expect(
      resolveGuestOnlyRouteState(settled, user(), null, {
        policy: "restore",
        retainChildren: false,
        pathname: "/auth/login",
        returnTo: "/sales/account?view=profile",
        credentialCompletedSinceEntry: true,
      }),
    ).toEqual({
      kind: "redirecting",
      target: "/sales/account?view=profile",
    });
    expect(
      resolveGuestOnlyRouteState(settled, user(), null, {
        policy: "restore",
        retainChildren: false,
        pathname: "/auth/login",
        returnTo: "https://evil.example/x",
        credentialCompletedSinceEntry: true,
      }),
    ).toEqual({ kind: "redirecting", target: "/sales/dashboard" });
    expect(
      resolveGuestOnlyRouteState(settled, user(), null, {
        policy: "restore",
        retainChildren: false,
        pathname: "/auth/login",
        returnTo: "/cutting/dashboard",
        credentialCompletedSinceEntry: true,
      }),
    ).toEqual({ kind: "redirecting", target: "/sales/dashboard" });
  });

  it("allows an administrator to keep an agreed cross-department return", () => {
    expect(
      resolveGuestOnlyRouteState(settled, admin(), null, {
        policy: "restore",
        retainChildren: false,
        pathname: "/auth/login",
        returnTo: "/sales/dashboard",
        credentialCompletedSinceEntry: true,
      }),
    ).toEqual({ kind: "redirecting", target: "/sales/dashboard" });
  });

  it("retains committed children through pending and error transitions", () => {
    expect(
      resolveGuestOnlyRouteState({ ...settled, isPending: true }, null, null, {
        policy: "restore",
        retainChildren: true,
        pathname: "/auth/login",
      }).kind,
    ).toBe("authorized");
    expect(
      resolveGuestOnlyRouteState({ ...settled, isError: true }, null, null, {
        policy: "restore",
        retainChildren: true,
        pathname: "/auth/login",
      }).kind,
    ).toBe("authorized");
  });

  it("does not apply a previous path retention to a new path", () => {
    expect(
      resolveGuestOnlyRouteState({ ...settled, isPending: true }, null, null, {
        policy: "restore",
        retainChildren: true,
        pathname: "/auth/verify-email",
      }).kind,
    ).toBe("authorized");
  });
});
