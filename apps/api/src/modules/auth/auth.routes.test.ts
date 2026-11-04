import type { Router } from "express";
import { describe, expect, it } from "vitest";

import type { AuthController } from "./auth.controller.js";
import { authRoutes } from "./auth.routes.js";

type RouteEntry = {
  path: string;
  methods: string[];
  handlerCount: number;
};

const collectRoutes = (router: Router): RouteEntry[] => {
  const entries: RouteEntry[] = [];
  for (const layer of router.stack) {
    const candidate = layer as unknown as {
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: unknown[];
      };
    };
    if (candidate.route === undefined) continue;
    entries.push({
      path: candidate.route.path,
      methods: Object.keys(candidate.route.methods).filter(
        (method) => candidate.route?.methods[method] === true,
      ),
      handlerCount: candidate.route.stack.length,
    });
  }
  return entries;
};

const controllerMock = {
  register: () => undefined,
  verifyEmail: () => undefined,
  resendVerification: () => undefined,
  login: () => undefined,
  refresh: () => undefined,
  logout: () => undefined,
  logoutAll: () => undefined,
  forgotPassword: () => undefined,
  resetPassword: () => undefined,
  validateResetToken: () => undefined,
  changePassword: () => undefined,
} as unknown as AuthController;

describe("auth route wiring", () => {
  // This file claims ROUTE WIRING ONLY. The actual Express authority, cookie
  // behaviour and database state are proven by the app integration suite.
  const router = authRoutes(
    controllerMock,
    (_request, _response, next) => {
      next();
    },
    (_request, _response, next) => {
      next();
    },
  );

  it("owns exactly the documented auth route ledger", () => {
    expect(collectRoutes(router)).toEqual([
      { path: "/register", methods: ["post"], handlerCount: 3 },
      { path: "/verify-email", methods: ["post"], handlerCount: 4 },
      { path: "/resend-verification", methods: ["post"], handlerCount: 4 },
      { path: "/login", methods: ["post"], handlerCount: 4 },
      { path: "/refresh", methods: ["post"], handlerCount: 3 },
      { path: "/logout", methods: ["post"], handlerCount: 4 },
      { path: "/logout-all", methods: ["post"], handlerCount: 4 },
      { path: "/forgot-password", methods: ["post"], handlerCount: 4 },
      { path: "/reset-password", methods: ["post"], handlerCount: 4 },
      { path: "/validate-reset-token", methods: ["get"], handlerCount: 4 },
      { path: "/change-password", methods: ["patch"], handlerCount: 5 },
    ]);
  });

  it("guards the credential and password routes before the controller", () => {
    for (const route of collectRoutes(router)) {
      expect(route.handlerCount).toBeGreaterThan(1);
    }
  });
});
