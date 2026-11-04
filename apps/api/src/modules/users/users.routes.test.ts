import type { Router } from "express";
import { describe, expect, it } from "vitest";

import type { UsersController } from "./users.controller.js";
import { usersRoutes } from "./users.routes.js";

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
  getMe: () => undefined,
  updateMe: () => undefined,
} as unknown as UsersController;

describe("users route wiring", () => {
  // This file claims ROUTE WIRING ONLY. The actual Express authority and
  // database state are proven by the app integration suite.
  const router = usersRoutes(
    controllerMock,
    (_request, _response, next) => {
      next();
    },
    (_request, _response, next) => {
      next();
    },
  );

  it("owns the current-user read and the current-user profile update", () => {
    expect(collectRoutes(router)).toEqual([
      { path: "/me", methods: ["get"], handlerCount: 2 },
      { path: "/me", methods: ["patch"], handlerCount: 4 },
    ]);
  });

  it("guards the profile update before the controller handler", () => {
    const patch = collectRoutes(router).find((route) =>
      route.methods.includes("patch"),
    );
    expect(patch?.handlerCount).toBeGreaterThan(1);
  });
});
