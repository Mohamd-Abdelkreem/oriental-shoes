import {
  AxiosHeaders,
  CanceledError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiClientModule from "./api-client";

const navigationMocks = vi.hoisted(() => ({
  assign: vi.fn(),
  getLocation: vi.fn(() => ({ pathname: "/", search: "" })),
}));

vi.mock("./browser-location", () => ({
  assignBrowserLocation: navigationMocks.assign,
  getBrowserLocation: navigationMocks.getLocation,
}));

type TransportModule = typeof ApiClientModule;

let transport: TransportModule;

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SUBJECT_ID = "22222222-2222-4222-8222-222222222222";

const safeUserFixture = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: SUBJECT_ID,
  fullName: "Test User",
  email: "test.user@example.com",
  phone: "+201000000000",
  role: "USER",
  status: "ACTIVE",
  department: "SALES",
  staffApprovedAt: "2026-08-01T00:00:00.000Z",
  accessVersion: 1,
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const successEnvelope = (
  data: unknown,
  path = "/api/v1/auth/refresh",
): Record<string, unknown> => ({
  success: true,
  statusCode: 200,
  message: "Session refreshed.",
  data,
  requestId: "refresh-request",
  timestamp: "2026-08-18T00:00:00.000Z",
  path,
});

const sessionData = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  user: safeUserFixture(),
  tokens: { accessToken: "fresh-token" },
  ...overrides,
});

const responseFor = (
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
): AxiosResponse<unknown> => ({
  data,
  status,
  statusText: status >= 400 ? "Error" : "OK",
  headers: new AxiosHeaders(),
  config,
});

const failureFor = (
  config: InternalAxiosRequestConfig,
  options: Readonly<{
    status?: number;
    data?: unknown;
    code?: string;
  }> = {},
): Error => {
  const error = Object.assign(
    new Error(
      options.status === undefined
        ? "Network request failed"
        : `HTTP ${String(options.status)}`,
    ),
    {
      name: "AxiosError",
      code: options.code ?? "ERR_BAD_REQUEST",
      config,
      isAxiosError: true,
    },
  );
  return options.status === undefined
    ? error
    : Object.assign(error, {
        response: responseFor(config, options.data ?? {}, options.status),
      });
};

const rejectFor = (
  config: InternalAxiosRequestConfig,
  status = 401,
  data: unknown = {},
): Promise<never> => Promise.reject(failureFor(config, { status, data }));

const errorEnvelope = (statusCode: number, code: string) => ({
  success: false,
  statusCode,
  code,
  message: `Failure ${code}`,
  requestId: `request-${code}`,
});

const captureFailure = async (request: Promise<unknown>): Promise<unknown> => {
  try {
    await request;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the request to fail.");
};

const refreshResponse = (config: InternalAxiosRequestConfig) =>
  responseFor(config, successEnvelope(sessionData()));

const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(async () => {
  vi.resetModules();
  transport = await import("./api-client");
  navigationMocks.assign.mockReset();
  navigationMocks.getLocation.mockReset();
  navigationMocks.getLocation.mockReturnValue({ pathname: "/", search: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiClient configuration and errors", () => {
  it("normalizes the configured base URL and sends credentials", () => {
    expect(transport.apiClient.defaults.baseURL).toBe(
      "http://localhost:4000/api/v1",
    );
    expect(transport.apiClient.defaults.withCredentials).toBe(true);
  });

  it("keeps the access token in discriminated module memory", () => {
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    const epoch = transport.getAuthSessionEpoch();
    transport.setAccessToken("token", epoch, SUBJECT_ID);
    expect(transport.getAccessToken()).toEqual({
      kind: "value",
      value: "token",
    });
  });

  it("parses the real error envelope and groups repeated field errors", () => {
    const result = transport.getApiError({
      isAxiosError: true,
      response: {
        status: 422,
        headers: {},
        data: {
          success: false,
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "Validation failed.",
          requestId: "request-1",
          errors: [
            { field: "body.email", message: "Invalid." },
            { field: "body.email", message: "Already used." },
          ],
        },
      },
    });
    expect(result).toEqual({
      message: "Validation failed.",
      statusCode: 422,
      code: "VALIDATION_ERROR",
      requestId: "request-1",
      fieldErrors: { "body.email": ["Invalid.", "Already used."] },
    });
  });

  it("uses generic English network and timeout fallbacks", () => {
    expect(transport.getApiError({ isAxiosError: true }).statusCode).toBe(0);
    expect(transport.getApiError({ isAxiosError: true }).message).toContain(
      "Unable to reach",
    );
    expect(
      transport.getApiError({ isAxiosError: true, code: "ECONNABORTED" })
        .message,
    ).toContain("timed out");
  });

  it("preserves a response-header request ID for malformed envelopes", () => {
    const result = transport.getApiError({
      isAxiosError: true,
      response: {
        status: 503,
        data: "not-an-envelope",
        headers: { "x-request-id": "header-request" },
      },
    });
    expect(result.requestId).toBe("header-request");
    expect(result.code).toBe("HTTP_ERROR");
    expect(result.message).toContain("temporarily unavailable");
  });

  it("classifies only exact public auth paths, including absolute URLs", () => {
    expect(transport.isPublicAuthRequest("/auth/login?next=x")).toBe(true);
    expect(
      transport.isPublicAuthRequest(
        "http://localhost:4000/api/v1/auth/validate-reset-token?token=x",
      ),
    ).toBe(true);
    expect(transport.isPublicAuthRequest("/auth/login-extra")).toBe(false);
    expect(transport.isPublicAuthRequest("/users/me")).toBe(false);
  });

  it("maps the three local errors without a received HTTP status", () => {
    const contract = transport.getApiError(new transport.ApiContractError());
    expect(contract).toEqual({
      message: "The server returned an unexpected response.",
      statusCode: 502,
      code: "CONTRACT_ERROR",
      requestId: "",
      fieldErrors: {},
    });

    const identity = transport.getApiError(
      new transport.AuthIdentityChangedError(),
    );
    expect(identity.statusCode).toBe(409);
    expect(identity.code).toBe("AUTH_IDENTITY_CHANGED");
    expect(identity.requestId).toBe("");
    expect(identity.fieldErrors).toEqual({});

    const reauthentication = transport.getApiError(
      new transport.AuthReauthenticationRequiredError(),
    );
    expect(reauthentication).toEqual({
      message: "Sign in again to continue.",
      statusCode: 409,
      code: "AUTH_REAUTHENTICATION_REQUIRED",
      requestId: "",
      fieldErrors: {},
    });
  });

  it("sanitizes the contract error request ID", () => {
    expect(new transport.ApiContractError("req-1").requestId).toBe("req-1");
    expect(new transport.ApiContractError("bad id\n").requestId).toBe("badid");
  });
});

describe("apiClient transport security", () => {
  it("attaches and then removes the in-memory bearer token", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      requests.push(config);
      return Promise.resolve(responseFor(config, {}));
    };
    transport.setAccessToken(
      "access-token",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );
    await transport.apiClient.get("/users/me");
    transport.clearAccessToken();
    await transport.apiClient.get("/users/me");
    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer access-token",
    );
    expect(requests[1]?.headers.get("Authorization")).toBeUndefined();
  });

  it("never writes access tokens to browser storage", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    transport.apiClient.defaults.adapter = (config) =>
      Promise.resolve(responseFor(config, {}));
    transport.setAccessToken(
      "memory-only",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );
    await transport.apiClient.get("/users/me");
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it("attaches decoded CSRF only to unsafe methods", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "csrfToken=csrf%20value",
    });
    const requests: InternalAxiosRequestConfig[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      requests.push(config);
      return Promise.resolve(responseFor(config, {}));
    };
    await transport.apiClient.get("/users/me");
    for (const method of ["post", "put", "patch", "delete"] as const) {
      await transport.apiClient.request({ method, url: "/resource", data: {} });
    }
    expect(requests[0]?.headers.get("x-csrf-token")).toBeUndefined();
    for (const request of requests.slice(1)) {
      expect(request.headers.get("x-csrf-token")).toBe("csrf value");
    }
  });

  it("never refreshes a public authentication 401", async () => {
    let refreshCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") refreshCalls += 1;
      return rejectFor(config);
    };

    await expect(
      transport.apiClient.post("/auth/login", {}),
    ).rejects.toBeDefined();

    expect(refreshCalls).toBe(0);
  });

  it("refreshes one protected 401 and replays it once with the new token", async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    const authorization: unknown[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return Promise.resolve(refreshResponse(config));
      }
      protectedCalls += 1;
      authorization.push(config.headers.get("Authorization"));
      return protectedCalls === 1
        ? rejectFor(config)
        : Promise.resolve(responseFor(config, { ok: true }));
    };
    transport.setAccessToken(
      "expired-token",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );
    await expect(transport.apiClient.get("/users/me")).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(authorization).toEqual([
      "Bearer expired-token",
      "Bearer fresh-token",
    ]);
  });

  it("uses a single refresh for concurrent protected failures", async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return refreshResponse(config);
      }
      protectedCalls += 1;
      if (protectedCalls <= 2) {
        await gate;
        return rejectFor(config);
      }
      return responseFor(config, {});
    };
    const first = transport.apiClient.get("/users/me");
    const second = transport.apiClient.get("/users/preferences");
    await vi.waitFor(() => {
      expect(protectedCalls).toBe(2);
    });
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(refreshCalls).toBe(1);
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
  ])(
    "clears, redirects, and propagates exact anonymous refresh %s/%s",
    async (statusCode, code) => {
      navigationMocks.getLocation.mockReturnValue({
        pathname: "/settings",
        search: "?section=security",
      });
      let protectedFailure: unknown;
      let refreshFailure = new Error("Refresh failure was not captured.");
      transport.apiClient.defaults.adapter = (config) => {
        const failure =
          config.url === "/auth/refresh"
            ? failureFor(config, {
                status: statusCode,
                data: errorEnvelope(statusCode, code),
              })
            : failureFor(config, { status: 401 });
        if (config.url === "/auth/refresh") refreshFailure = failure;
        else protectedFailure = failure;
        return Promise.reject(failure);
      };
      transport.setAccessToken(
        "expired-token",
        transport.getAuthSessionEpoch(),
        SUBJECT_ID,
      );

      const failure = await captureFailure(
        transport.apiClient.get("/users/me"),
      );

      expect(failure).toBe(refreshFailure);
      expect(failure).not.toBe(protectedFailure);
      expect(transport.getApiError(failure)).toMatchObject({
        statusCode,
        code,
      });
      expect(transport.getAccessToken()).toEqual({ kind: "missing" });
      expect(navigationMocks.assign).toHaveBeenCalledWith(
        "/auth/login?returnTo=%2Fsettings%3Fsection%3Dsecurity",
      );
    },
  );

  it.each([
    [400, "VALIDATION_ERROR"],
    [401, "TOKEN_REPLAYED"],
    [403, "FORBIDDEN"],
    [409, "CONFLICT"],
    [429, "TOO_MANY_REQUESTS"],
    [500, "INTERNAL_SERVER_ERROR"],
    [501, "NOT_IMPLEMENTED"],
    [502, "BAD_GATEWAY"],
    [503, "SERVICE_UNAVAILABLE"],
    [504, "GATEWAY_TIMEOUT"],
  ])(
    "surfaces unexpected refresh %s/%s without redirecting",
    async (statusCode, code) => {
      let refreshFailure = new Error("Refresh failure was not captured.");
      transport.apiClient.defaults.adapter = (config) => {
        if (config.url !== "/auth/refresh") return rejectFor(config);
        refreshFailure = failureFor(config, {
          status: statusCode,
          data: errorEnvelope(statusCode, code),
        });
        return Promise.reject(refreshFailure);
      };
      transport.setAccessToken(
        "expired-token",
        transport.getAuthSessionEpoch(),
        SUBJECT_ID,
      );

      const failure = await captureFailure(
        transport.apiClient.get("/users/me"),
      );

      expect(failure).toBe(refreshFailure);
      expect(transport.getApiError(failure)).toMatchObject({
        statusCode,
        code,
      });
      expect(transport.getAccessToken()).toEqual({ kind: "missing" });
      expect(navigationMocks.assign).not.toHaveBeenCalled();
    },
  );

  it("surfaces a refresh network failure without redirecting", async () => {
    let refreshFailure = new Error("Refresh failure was not captured.");
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url !== "/auth/refresh") return rejectFor(config);
      refreshFailure = failureFor(config, { code: "ERR_NETWORK" });
      return Promise.reject(refreshFailure);
    };
    transport.setAccessToken(
      "expired-token",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );

    const failure = await captureFailure(transport.apiClient.get("/users/me"));

    expect(failure).toBe(refreshFailure);
    expect(transport.getApiError(failure)).toMatchObject({
      statusCode: 0,
      code: "NETWORK_ERROR",
    });
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    expect(navigationMocks.assign).not.toHaveBeenCalled();
  });

  it("surfaces refresh timeout behavior without redirecting", async () => {
    let refreshFailure = new Error("Refresh failure was not captured.");
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url !== "/auth/refresh") return rejectFor(config);
      refreshFailure = failureFor(config, { code: "ECONNABORTED" });
      return Promise.reject(refreshFailure);
    };

    const failure = await captureFailure(transport.apiClient.get("/users/me"));
    const apiError = transport.getApiError(failure);

    expect(failure).toBe(refreshFailure);
    expect(apiError).toMatchObject({ statusCode: 0, code: "NETWORK_ERROR" });
    expect(apiError.message).toContain("timed out");
    expect(navigationMocks.assign).not.toHaveBeenCalled();
  });

  it.each([403, 500, 401])(
    "propagates replay HTTP %s without another refresh or redirect",
    async (replayStatus) => {
      let protectedCalls = 0;
      let refreshCalls = 0;
      let replayFailure = new Error("Replay failure was not captured.");
      transport.apiClient.defaults.adapter = (config) => {
        if (config.url === "/auth/refresh") {
          refreshCalls += 1;
          return Promise.resolve(refreshResponse(config));
        }
        protectedCalls += 1;
        if (protectedCalls === 1) return rejectFor(config);
        replayFailure = failureFor(config, { status: replayStatus });
        return Promise.reject(replayFailure);
      };

      const failure = await captureFailure(
        transport.apiClient.get("/users/me"),
      );

      expect(failure).toBe(replayFailure);
      expect(transport.getApiError(failure).statusCode).toBe(replayStatus);
      expect(refreshCalls).toBe(1);
      expect(protectedCalls).toBe(2);
      expect(transport.getAccessToken()).toEqual({
        kind: "value",
        value: "fresh-token",
      });
      expect(navigationMocks.assign).not.toHaveBeenCalled();
    },
  );

  it("resets the refresh promise after success", async () => {
    let refreshCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return Promise.resolve(refreshResponse(config));
      }
      return config._templateRetried === true
        ? Promise.resolve(responseFor(config, {}))
        : rejectFor(config);
    };

    await transport.apiClient.get("/users/me");
    await transport.apiClient.get("/users/preferences");

    expect(refreshCalls).toBe(2);
  });

  it("resets the refresh promise after failure", async () => {
    let refreshCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return refreshCalls === 1
          ? Promise.reject(
              failureFor(config, {
                status: 503,
                data: errorEnvelope(503, "SERVICE_UNAVAILABLE"),
              }),
            )
          : Promise.resolve(refreshResponse(config));
      }
      return config._templateRetried === true
        ? Promise.resolve(responseFor(config, {}))
        : rejectFor(config);
    };

    await expect(transport.apiClient.get("/users/me")).rejects.toBeDefined();
    await expect(transport.apiClient.get("/users/me")).resolves.toBeDefined();

    expect(refreshCalls).toBe(2);
  });

  it("drops credential-bearing return paths on refresh failure", async () => {
    navigationMocks.getLocation.mockReturnValue({
      pathname: "/settings",
      search: "?token=secret",
    });
    transport.apiClient.defaults.adapter = (config) =>
      config.url === "/auth/refresh"
        ? rejectFor(config, 401, errorEnvelope(401, "UNAUTHORIZED"))
        : rejectFor(config);
    await expect(transport.apiClient.get("/users/me")).rejects.toBeDefined();
    expect(navigationMocks.assign).toHaveBeenCalledWith("/auth/login");
  });

  it("does not redirect again while already on an auth route", async () => {
    navigationMocks.getLocation.mockReturnValue({
      pathname: "/auth/login",
      search: "",
    });
    transport.apiClient.defaults.adapter = (config) =>
      config.url === "/auth/refresh"
        ? rejectFor(config, 401, errorEnvelope(401, "UNAUTHORIZED"))
        : rejectFor(config);
    await expect(transport.apiClient.get("/users/me")).rejects.toBeDefined();
    expect(navigationMocks.assign).not.toHaveBeenCalled();
  });
});

describe("credential lifecycle policy", () => {
  it("starts in the restore policy with no bound subject", () => {
    expect(transport.getAuthSessionRestorePolicy()).toBe("restore");
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
  });

  it("opens a credential-required gate that blocks passive refresh and protected dispatch", async () => {
    const rawCalls: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      rawCalls.push(config.url ?? "");
      return Promise.resolve(responseFor(config, {}));
    };

    const epoch = transport.beginAuthSessionEpoch("credential-login");

    expect(transport.getAuthSessionRestorePolicy()).toBe("credential-required");
    expect(epoch).toBe(transport.getAuthSessionEpoch());
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });

    await expect(transport.refreshAuthSession(epoch)).rejects.toBeInstanceOf(
      transport.AuthReauthenticationRequiredError,
    );
    await expect(transport.apiClient.get("/users/me")).rejects.toBeInstanceOf(
      transport.AuthReauthenticationRequiredError,
    );
    expect(rawCalls).toEqual([]);
  });

  it("rejects a passive token setter while the gate is closed", () => {
    const epoch = transport.beginAuthSessionEpoch("credential-login");
    expect(transport.setAccessToken("passive", epoch, SUBJECT_ID)).toBe(false);
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    expect(transport.getAuthSessionRestorePolicy()).toBe("credential-required");
  });

  it("keeps the gate closed after a rejected, malformed or unknown login attempt", async () => {
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/login") return rejectFor(config, 401);
      return Promise.resolve(responseFor(config, {}));
    };
    const epoch = transport.beginAuthSessionEpoch("credential-login");

    await expect(
      transport.apiClient.post("/auth/login", {}),
    ).rejects.toBeDefined();

    expect(transport.getAuthSessionRestorePolicy()).toBe("credential-required");
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    expect(epoch).toBe(transport.getAuthSessionEpoch());
  });

  it("keeps the gate closed after a malformed login result", async () => {
    transport.apiClient.defaults.adapter = (config) =>
      Promise.resolve(responseFor(config, successEnvelope({ tokens: {} })));
    transport.beginAuthSessionEpoch("credential-login");

    await transport.apiClient.post("/auth/login", {});

    expect(transport.getAuthSessionRestorePolicy()).toBe("credential-required");
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
  });

  it("reopens restore only for an accepted current required epoch", () => {
    const epoch = transport.beginAuthSessionEpoch("credential-login");

    expect(
      transport.acceptCredentialLogin("accepted-token", epoch, SUBJECT_ID),
    ).toBe(true);
    expect(transport.getAuthSessionRestorePolicy()).toBe("restore");
    expect(transport.getAccessToken()).toEqual({
      kind: "value",
      value: "accepted-token",
    });
  });

  it("does not change state for a false or obsolete credential acceptance", () => {
    const epoch = transport.beginAuthSessionEpoch("credential-login");

    expect(
      transport.acceptCredentialLogin("stale", epoch + 1, SUBJECT_ID),
    ).toBe(false);
    expect(transport.getAuthSessionRestorePolicy()).toBe("credential-required");
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });

    transport.acceptCredentialLogin("accepted", epoch, SUBJECT_ID);
    expect(transport.acceptCredentialLogin("second", epoch, SUBJECT_ID)).toBe(
      false,
    );
    expect(transport.getAccessToken()).toEqual({
      kind: "value",
      value: "accepted",
    });
    expect(transport.getAuthSessionRestorePolicy()).toBe("restore");
  });

  it("binds the same subject and rejects a different one", () => {
    const epoch = transport.getAuthSessionEpoch();
    transport.setAccessToken("first", epoch, SUBJECT_ID);
    expect(transport.setAccessToken("same-subject", epoch, SUBJECT_ID)).toBe(
      true,
    );
    expect(transport.getAccessToken()).toEqual({
      kind: "value",
      value: "same-subject",
    });

    expect(transport.setAccessToken("other", epoch, OTHER_SUBJECT_ID)).toBe(
      false,
    );
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    expect(transport.getAuthSessionRestorePolicy()).toBe("identity-changed");
  });

  it("quarantines a mismatched subject and prevents any replay", async () => {
    const epoch = transport.getAuthSessionEpoch();
    transport.setAccessToken("first", epoch, SUBJECT_ID);
    transport.setAccessToken("other", epoch, OTHER_SUBJECT_ID);

    expect(() => {
      transport.assertAuthSessionSubject(SUBJECT_ID, epoch);
    }).toThrow(transport.AuthIdentityChangedError);

    let refreshCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") refreshCalls += 1;
      return rejectFor(config);
    };

    await expect(transport.apiClient.get("/users/me")).rejects.toBeInstanceOf(
      transport.AuthIdentityChangedError,
    );
    expect(refreshCalls).toBe(0);
  });

  it("blocks restoration and protected dispatch after a confirmed ending", async () => {
    const rawCalls: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      rawCalls.push(config.url ?? "");
      return Promise.resolve(responseFor(config, {}));
    };
    const epoch = transport.beginAuthSessionEpoch("confirmed-ending");

    expect(transport.getAuthSessionRestorePolicy()).toBe("signed-out");
    await expect(transport.refreshAuthSession(epoch)).rejects.toBeInstanceOf(
      transport.AuthReauthenticationRequiredError,
    );
    await expect(transport.apiClient.get("/users/me")).rejects.toBeInstanceOf(
      transport.AuthReauthenticationRequiredError,
    );
    expect(rawCalls).toEqual([]);
  });

  it("cancels an obsolete epoch without touching the current subject", () => {
    const epoch = transport.getAuthSessionEpoch();
    transport.setAccessToken("first", epoch, SUBJECT_ID);

    expect(() => {
      transport.assertAuthSessionSubject(SUBJECT_ID, epoch - 1);
    }).toThrow(CanceledError);
  });

  it("keeps public purpose flows reachable while the gate is closed", async () => {
    const rawCalls: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      rawCalls.push(config.url ?? "");
      return Promise.resolve(responseFor(config, {}));
    };
    transport.beginAuthSessionEpoch("credential-login");

    await transport.apiClient.post("/auth/register", {});
    await transport.apiClient.post("/auth/verify-email", {});
    await transport.apiClient.post("/auth/forgot-password", {});
    await transport.apiClient.post("/auth/reset-password", {});

    expect(rawCalls).toEqual([
      "/auth/register",
      "/auth/verify-email",
      "/auth/forgot-password",
      "/auth/reset-password",
    ]);
  });

  it("allows the explicit login attempt while the gate is closed", async () => {
    const rawCalls: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      rawCalls.push(config.url ?? "");
      return Promise.resolve(responseFor(config, {}));
    };
    transport.beginAuthSessionEpoch("credential-login");

    await transport.apiClient.post("/auth/login", {});

    expect(rawCalls).toEqual(["/auth/login"]);
  });
});

describe("refresh session ownership", () => {
  it("binds the subject during an initial restore", async () => {
    transport.apiClient.defaults.adapter = (config) =>
      Promise.resolve(refreshResponse(config));

    const epoch = transport.getAuthSessionEpoch();
    const parsed = await transport.refreshAuthSession(epoch);

    expect(parsed.data.user.id).toBe(SUBJECT_ID);
    expect(transport.getAccessToken()).toEqual({
      kind: "value",
      value: "fresh-token",
    });
    expect(() => {
      transport.assertAuthSessionSubject(SUBJECT_ID, epoch);
    }).not.toThrow();
  });

  it("installs no token for a malformed complete refresh", async () => {
    transport.apiClient.defaults.adapter = (config) =>
      Promise.resolve(
        responseFor(config, successEnvelope({ user: { id: SUBJECT_ID } })),
      );

    const epoch = transport.getAuthSessionEpoch();
    const failure = await captureFailure(transport.refreshAuthSession(epoch));

    expect(failure).toBeInstanceOf(transport.ApiContractError);
    expect(transport.getApiError(failure)).toMatchObject({
      code: "CONTRACT_ERROR",
      statusCode: 502,
    });
    expect(transport.getAccessToken()).toEqual({ kind: "missing" });
    expect(transport.getAuthSessionRestorePolicy()).toBe("restore");
  });

  it("shares one raw refresh between a restore and two concurrent 401s", async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        await gate;
        return refreshResponse(config);
      }
      protectedCalls += 1;
      await gate;
      return protectedCalls <= 2 ? rejectFor(config) : responseFor(config, {});
    };

    const epoch = transport.getAuthSessionEpoch();
    const restore = transport.refreshAuthSession(epoch);
    const first = transport.apiClient.get("/users/me");
    const second = transport.apiClient.get("/users/preferences");

    await vi.waitFor(() => {
      expect(protectedCalls).toBe(2);
    });
    release();

    await restore;
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(refreshCalls).toBe(1);
  });

  it("does not let one cancelled waiter cancel the shared refresh", async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        await gate;
        return refreshResponse(config);
      }
      protectedCalls += 1;
      return protectedCalls <= 2 ? rejectFor(config) : responseFor(config, {});
    };

    const controller = new AbortController();
    const cancelled = transport.apiClient.get("/users/me", {
      signal: controller.signal,
    });
    const survivor = transport.apiClient.get("/users/preferences");

    await vi.waitFor(() => {
      expect(refreshCalls).toBe(1);
    });
    controller.abort();
    release();

    await expect(cancelled).rejects.toBeDefined();
    await expect(survivor).resolves.toBeDefined();
    expect(refreshCalls).toBe(1);
  });

  it("keeps an old refresh finally from clearing a newer slot", async () => {
    const first = deferred<AxiosResponse<unknown>>();
    const second = deferred<AxiosResponse<unknown>>();
    let refreshCalls = 0;
    transport.apiClient.defaults.adapter = (_config) => {
      refreshCalls += 1;
      return refreshCalls === 1 ? first.promise : second.promise;
    };

    const oldEpoch = transport.getAuthSessionEpoch();
    const oldRefresh = transport.refreshAuthSession(oldEpoch);
    await vi.waitFor(() => {
      expect(refreshCalls).toBe(1);
    });

    const newEpoch = transport.beginAuthSessionEpoch("credential-login");
    transport.acceptCredentialLogin("new-token", newEpoch, SUBJECT_ID);
    const newRefresh = transport.refreshAuthSession(newEpoch);

    first.resolve(
      responseFor(
        {} as InternalAxiosRequestConfig,
        successEnvelope(sessionData()),
      ),
    );
    await expect(oldRefresh).rejects.toBeInstanceOf(CanceledError);

    await vi.waitFor(() => {
      expect(refreshCalls).toBe(2);
    });

    const joined = transport.refreshAuthSession(newEpoch);
    await Promise.resolve();
    expect(refreshCalls).toBe(2);

    second.resolve(
      responseFor(
        {} as InternalAxiosRequestConfig,
        successEnvelope(sessionData()),
      ),
    );
    await expect(newRefresh).resolves.toBeDefined();
    await expect(joined).resolves.toBeDefined();

    expect(refreshCalls).toBe(2);
  });
});

describe("raw cookie tail", () => {
  it("orders a newer login dispatch after the deferred old cookie operation", async () => {
    const logout = deferred<AxiosResponse<unknown>>();
    const order: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      const url = config.url ?? "";
      order.push(url);
      return url === "/auth/logout"
        ? logout.promise
        : Promise.resolve(responseFor(config, {}));
    };

    const logoutRequest = transport.apiClient.post("/auth/logout", {});
    await vi.waitFor(() => {
      expect(order).toEqual(["/auth/logout"]);
    });

    const loginRequest = transport.apiClient.post("/auth/login", {});
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["/auth/logout"]);

    logout.resolve(responseFor({} as InternalAxiosRequestConfig, {}));
    await logoutRequest;
    await loginRequest;

    expect(order).toEqual(["/auth/logout", "/auth/login"]);
  });

  it("never dispatches a superseded queued attempt", async () => {
    const first = deferred<AxiosResponse<unknown>>();
    const rawCalls: string[] = [];
    transport.apiClient.defaults.adapter = (config) => {
      rawCalls.push(config.url ?? "");
      return config.url === "/auth/login"
        ? first.promise
        : Promise.resolve(responseFor(config, {}));
    };

    const blocking = transport.apiClient.post("/auth/login", {});
    await vi.waitFor(() => {
      expect(rawCalls).toEqual(["/auth/login"]);
    });

    const queued = transport.apiClient.post("/auth/logout-all", {});
    transport.beginAuthSessionEpoch("credential-login");

    first.resolve(responseFor({} as InternalAxiosRequestConfig, {}));
    await blocking;

    const failure = await captureFailure(queued);
    expect(failure).toBeInstanceOf(CanceledError);
    expect(rawCalls).toEqual(["/auth/login"]);
  });

  it("lets a protected logout 401 refresh and replay without a deadlock", async () => {
    let refreshCalls = 0;
    let logoutCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return Promise.resolve(refreshResponse(config));
      }
      logoutCalls += 1;
      return logoutCalls === 1
        ? rejectFor(config)
        : Promise.resolve(responseFor(config, { ok: true }));
    };
    transport.setAccessToken(
      "token",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );

    await expect(
      transport.apiClient.post("/auth/logout", {}),
    ).resolves.toMatchObject({ data: { ok: true } });

    expect(refreshCalls).toBe(1);
    expect(logoutCalls).toBe(2);
  });

  it("lets a protected change-password 401 refresh and replay without a deadlock", async () => {
    let refreshCalls = 0;
    let passwordCalls = 0;
    transport.apiClient.defaults.adapter = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return Promise.resolve(refreshResponse(config));
      }
      passwordCalls += 1;
      return passwordCalls === 1
        ? rejectFor(config)
        : Promise.resolve(responseFor(config, { ok: true }));
    };
    transport.setAccessToken(
      "token",
      transport.getAuthSessionEpoch(),
      SUBJECT_ID,
    );

    await expect(
      transport.apiClient.post("/auth/change-password", {}),
    ).resolves.toMatchObject({ data: { ok: true } });

    expect(refreshCalls).toBe(1);
    expect(passwordCalls).toBe(2);
  });
});
