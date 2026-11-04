import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { cookieConfig } from "../../core/config/cookie.config.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

const user = {
  id: "1b3d904e-a46c-4dd8-9cb7-d0767546ea95",
  fullName: "Template User",
  email: "user@example.com",
  phone: null,
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-08-18T00:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
} as const;

const responseMock = () => {
  const response = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
};

const loginRequest = {
  path: "/auth/login",
  requestId: "request-id",
  validated: {
    body: {
      email: "user@example.com",
      password: "a-secure-test-password",
      rememberMe: false,
    },
  },
} as unknown as Request;

describe("AuthController cookie options", () => {
  it.each([false, true])(
    "sets exact refresh and CSRF options for rememberMe=%s",
    async (rememberMe) => {
      const authService = {
        login: vi.fn().mockResolvedValue({
          user,
          tokens: { accessToken: "access", refreshToken: "refresh" },
          rememberMe,
        }),
      } as unknown as AuthService;
      const controller = new AuthController(authService);
      const response = responseMock();
      await controller.login(
        {
          ...loginRequest,
          validated: {
            body: {
              ...(loginRequest.validated?.body as object),
              rememberMe,
            },
          },
        } as Request,
        response as unknown as Response,
      );

      const lifetime = rememberMe
        ? { maxAge: cookieConfig.refreshMaxAgeSeconds * 1_000 }
        : {};
      expect(response.cookie).toHaveBeenNthCalledWith(
        1,
        "refreshToken",
        "refresh",
        {
          httpOnly: true,
          secure: cookieConfig.secure,
          sameSite: cookieConfig.sameSite,
          path: cookieConfig.refreshPath,
          ...lifetime,
        },
      );
      expect(response.cookie).toHaveBeenNthCalledWith(
        2,
        "csrfToken",
        expect.any(String),
        {
          httpOnly: false,
          secure: cookieConfig.secure,
          sameSite: cookieConfig.sameSite,
          path: "/",
          ...lifetime,
        },
      );
      expect(response.cookie.mock.calls[1]?.[1]).toMatch(/^[a-f0-9]{64}$/u);
    },
  );

  it("clears both cookies with matching security and path attributes", async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const response = responseMock();
    await controller.logout(
      {
        path: "/auth/logout",
        requestId: "request-id",
        user,
        cookies: { refreshToken: "refresh" },
      } as unknown as Request,
      response as unknown as Response,
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(1, "refreshToken", {
      path: cookieConfig.refreshPath,
      sameSite: cookieConfig.sameSite,
      secure: cookieConfig.secure,
    });
    expect(response.clearCookie).toHaveBeenNthCalledWith(2, "csrfToken", {
      path: "/",
      sameSite: cookieConfig.sameSite,
      secure: cookieConfig.secure,
    });
  });
});

describe("AuthController required context", () => {
  it("never treats a missing authenticated actor as an empty actor", async () => {
    const logout = vi.fn();
    const logoutAll = vi.fn();
    const changePassword = vi.fn();
    const authService = {
      logout,
      logoutAll,
      changePassword,
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const response = responseMock();

    await expect(
      controller.logout(
        {
          path: "/auth/logout",
          requestId: "request-id",
          cookies: { refreshToken: "refresh" },
        } as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(InternalServerError);
    await expect(
      controller.logoutAll(
        {
          path: "/auth/logout-all",
          requestId: "request-id",
        } as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(InternalServerError);
    await expect(
      controller.changePassword(
        {
          path: "/auth/change-password",
          requestId: "request-id",
          validated: { body: { currentPassword: "a", newPassword: "b" } },
        } as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(InternalServerError);

    expect(logout).not.toHaveBeenCalled();
    expect(logoutAll).not.toHaveBeenCalled();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("does not clear the session cookies when the service fails", async () => {
    const authService = {
      logout: vi.fn().mockRejectedValue(new Error("service failure")),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const response = responseMock();

    await expect(
      controller.logout(
        {
          path: "/auth/logout",
          requestId: "request-id",
          user,
          cookies: { refreshToken: "refresh" },
        } as unknown as Request,
        response as unknown as Response,
      ),
    ).rejects.toThrow("service failure");
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});

describe("AuthController private response policy", () => {
  it("marks the credential and account result paths as no-store", async () => {
    const authService = {
      login: vi.fn().mockResolvedValue({
        user,
        tokens: { accessToken: "access", refreshToken: "refresh" },
        rememberMe: false,
      }),
      refresh: vi.fn().mockResolvedValue({
        user,
        tokens: { accessToken: "access", refreshToken: "refresh" },
        rememberMe: false,
      }),
      register: vi.fn().mockResolvedValue({ user }),
      verifyEmail: vi.fn().mockResolvedValue({ user }),
      resendVerification: vi.fn().mockResolvedValue({ message: "sent" }),
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
      resetPassword: vi.fn().mockResolvedValue({ user }),
      validateResetToken: vi.fn().mockResolvedValue({ valid: true }),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    const paths: Array<[string, (response: Response) => Promise<unknown>]> = [
      ["login", (response) => controller.login(loginRequest, response)],
      [
        "refresh",
        (response) =>
          controller.refresh(
            {
              path: "/auth/refresh",
              requestId: "request-id",
            } as unknown as Request,
            response,
          ),
      ],
      [
        "register",
        (response) =>
          controller.register(
            {
              path: "/auth/register",
              requestId: "request-id",
              validated: { body: {} },
            } as unknown as Request,
            response,
          ),
      ],
      [
        "verify-email",
        (response) =>
          controller.verifyEmail(
            {
              path: "/auth/verify-email",
              requestId: "request-id",
              validated: { query: { token: "token" } },
            } as unknown as Request,
            response,
          ),
      ],
      [
        "resend-verification",
        (response) =>
          controller.resendVerification(
            {
              path: "/auth/resend-verification",
              requestId: "request-id",
              validated: { body: { email: "user@example.com" } },
            } as unknown as Request,
            response,
          ),
      ],
      [
        "forgot-password",
        (response) =>
          controller.forgotPassword(
            {
              path: "/auth/forgot-password",
              requestId: "request-id",
              validated: { body: { email: "user@example.com" } },
            } as unknown as Request,
            response,
          ),
      ],
      [
        "reset-password",
        (response) =>
          controller.resetPassword(
            {
              path: "/auth/reset-password",
              requestId: "request-id",
              validated: { body: { password: "a" }, query: { token: "token" } },
            } as unknown as Request,
            response,
          ),
      ],
      [
        "validate-reset-token",
        (response) =>
          controller.validateResetToken(
            {
              path: "/auth/validate-reset-token",
              requestId: "request-id",
              validated: { query: { token: "token" } },
            } as unknown as Request,
            response,
          ),
      ],
    ];

    for (const [name, invoke] of paths) {
      const response = responseMock();
      await invoke(response as unknown as Response);
      expect(
        response.setHeader,
        `expected ${name} to apply the private no-store policy`,
      ).toHaveBeenCalledWith("Cache-Control", "no-store");
    }
  });
});
