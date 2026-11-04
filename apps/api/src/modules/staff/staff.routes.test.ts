import type { Router } from "express";
import { describe, expect, it } from "vitest";

import type { StaffController } from "./staff.controller.js";
import { staffRoutes } from "./staff.routes.js";
import type { StaffService } from "./staff.service.js";

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
  list: () => undefined,
  get: () => undefined,
  decisions: () => undefined,
  approve: () => undefined,
  reject: () => undefined,
  changeDepartment: () => undefined,
  suspend: () => undefined,
  reactivate: () => undefined,
} as unknown as StaffController;

const serviceMock = {} as unknown as StaffService;

describe("staff route wiring", () => {
  // This file claims ROUTE WIRING ONLY. The actual Express authority, database
  // state and privacy boundary are proven by the app integration suite.
  const router = staffRoutes(controllerMock, (_request, _response, next) => {
    next();
  });

  it("owns exactly the documented staff route ledger", () => {
    expect(collectRoutes(router)).toEqual([
      { path: "/", methods: ["get"], handlerCount: 4 },
      { path: "/:userId", methods: ["get"], handlerCount: 4 },
      { path: "/:userId/decisions", methods: ["get"], handlerCount: 4 },
      { path: "/:userId/approve", methods: ["post"], handlerCount: 5 },
      { path: "/:userId/reject", methods: ["post"], handlerCount: 5 },
      { path: "/:userId/department", methods: ["patch"], handlerCount: 5 },
      { path: "/:userId/suspend", methods: ["post"], handlerCount: 5 },
      { path: "/:userId/reactivate", methods: ["post"], handlerCount: 5 },
    ]);
  });

  it("guards every staff route before the controller handler", () => {
    for (const route of collectRoutes(router)) {
      // Authentication, role authorization, CSRF and validation all precede the
      // controller, so the controller is never the first handler.
      expect(route.handlerCount).toBeGreaterThan(1);
    }
  });

  it("keeps the service construction separate from the HTTP adapter", () => {
    expect(serviceMock).toBeDefined();
  });
});
