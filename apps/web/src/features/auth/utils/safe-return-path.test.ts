import { describe, expect, it } from "vitest";

import { resolvePostLoginPath, sanitizeReturnPath } from "./safe-return-path";

describe("safe return paths", () => {
  it.each(["/admin/dashboard", "/sales/orders/new", "/warehouse/account"])(
    "allows a project route %s",
    (path) => {
      expect(sanitizeReturnPath(path)).toBe(path);
    },
  );

  it.each([
    "https://attacker.example/admin",
    "//attacker.example/admin",
    "/auth/login",
    "/dashboard",
    "/settings",
    "/admin/dashboard?token=secret",
    "/admin%00",
    "/user@example.com",
    "/admin\\redirect",
    "%E0%A4%A",
  ])("rejects an unsafe or removed route %s", (path) => {
    expect(sanitizeReturnPath(path)).toBeNull();
  });

  it("sends an admin to the project admin dashboard by default", () => {
    expect(resolvePostLoginPath(null, "ADMIN")).toBe("/admin/dashboard");
    expect(resolvePostLoginPath("//attacker.example", "ADMIN")).toBe(
      "/admin/dashboard",
    );
  });

  it("sends a standard account to the project sales dashboard by default", () => {
    expect(resolvePostLoginPath(null, "USER")).toBe("/sales/dashboard");
  });
});
