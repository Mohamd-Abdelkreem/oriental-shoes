import axios, {
  CanceledError,
  type AxiosAdapter,
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  authSessionDataSchema,
  successEnvelopeSchema,
  type AuthSessionData,
  type SuccessEnvelope,
} from "@template/contracts";
import type { ZodType } from "zod";

import { publicEnvironment } from "@/config/public-environment";

import { assignBrowserLocation, getBrowserLocation } from "./browser-location";

export type ApiResponse<T> = Omit<SuccessEnvelope<T>, "data"> & {
  readonly data: T;
};

export type ApiError = Readonly<{
  message: string;
  statusCode: number;
  code: string;
  requestId: string;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
}>;

export type ValueState<T> =
  { readonly kind: "missing" } | { readonly kind: "value"; readonly value: T };

export type AuthSessionRestorePolicy =
  "restore" | "credential-required" | "identity-changed" | "signed-out";

type ParsedErrorEnvelope = Readonly<{
  message: string;
  statusCode: number;
  requestId: string;
  code: string;
  errors: unknown;
}>;

const STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  0: "Unable to reach the server. Check your connection and try again.",
  400: "The request contains invalid data. Review it and try again.",
  401: "Your session has expired. Sign in again to continue.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource could not be found.",
  409: "The request conflicts with the current resource state.",
  422: "Some submitted values are invalid.",
  429: "Too many requests. Wait a moment and try again.",
  500: "The server encountered an unexpected error.",
  501: "The requested operation is not available.",
  502: "The upstream service returned an invalid response.",
  503: "The service is temporarily unavailable.",
  504: "The upstream service took too long to respond.",
});

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_AUTH_PATHS = new Set([
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/login",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/validate-reset-token",
]);
/**
 * Public purpose flows that stay reachable while the credential lifecycle is
 * closed. They never grant business authority.
 */
const PUBLIC_PURPOSE_PATHS = new Set([
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/validate-reset-token",
]);
/**
 * The explicit credential attempt. It is the only flow allowed to open a
 * credential-required gate.
 */
const EXPLICIT_LOGIN_PATHS = new Set(["/auth/login"]);
/**
 * Requests that mutate the browser credential set. They are serialized through
 * one same-tab cookie tail so a Set-Cookie outcome is never reordered.
 */
const COOKIE_MUTATING_PATHS = new Set([
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/logout-all",
  "/auth/change-password",
  "/auth/reset-password",
]);
const CREDENTIAL_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "secret",
  "password",
]);

const baseURL = publicEnvironment.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
const basePath = new URL(baseURL).pathname.replace(/\/+$/, "");

let accessToken: ValueState<string> = { kind: "missing" };
let sessionEpoch = 0;
let restorePolicy: AuthSessionRestorePolicy = "restore";
let expectedSubjectId: string | null = null;
type RefreshSlot = {
  readonly epoch: number;
  readonly promise: Promise<ApiResponse<AuthSessionData>>;
};

let refreshSlot: RefreshSlot | null = null;
let cookieTail: Promise<void> = Promise.resolve();

declare module "axios" {
  interface AxiosRequestConfig {
    _templateRetried?: boolean;
    _templateAuthEpoch?: number;
    _templateRawAdapter?: AxiosAdapter;
  }
}

/**
 * A locally detected contract failure. It never claims that the server
 * answered with HTTP 502.
 */
export class ApiContractError extends Error {
  readonly requestId: string;

  constructor(requestId: string = "") {
    super("The server returned an unexpected response.");
    this.name = "ApiContractError";
    this.requestId = requestId.replace(/[^\w.-]/g, "").slice(0, 128);
  }
}

/**
 * A passive result carried another subject than the bound one. The expected
 * subject is retained and restoration stays closed.
 */
export class AuthIdentityChangedError extends Error {
  constructor() {
    super("Your active account changed. Sign in again to continue.");
    this.name = "AuthIdentityChangedError";
  }
}

/**
 * The credential gate is closed, so protected work cannot continue.
 */
export class AuthReauthenticationRequiredError extends Error {
  constructor() {
    super("Sign in again to continue.");
    this.name = "AuthReauthenticationRequiredError";
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});

export const getAccessToken = (): ValueState<string> => accessToken;

/**
 * Clears the in-memory bearer only. The restore policy and the expected
 * subject are credential-lifecycle metadata and stay untouched.
 */
export const clearAccessToken = (): void => {
  accessToken = { kind: "missing" };
};

export const getAuthSessionEpoch = (): number => sessionEpoch;

export const getAuthSessionRestorePolicy = (): AuthSessionRestorePolicy =>
  restorePolicy;

/**
 * Opens a new credential-lifecycle boundary. The in-memory token, the expected
 * subject and the refresh slot are dropped, the reason-specific closed policy
 * is selected, and the outstanding cookie tail is preserved.
 */
export const beginAuthSessionEpoch = (
  reason: "credential-login" | "confirmed-ending",
): number => {
  sessionEpoch += 1;
  accessToken = { kind: "missing" };
  expectedSubjectId = null;
  refreshSlot = null;
  restorePolicy =
    reason === "credential-login" ? "credential-required" : "signed-out";
  return sessionEpoch;
};

/**
 * The only path that may bind a new subject. It succeeds for a fully parsed
 * credential result of the current required epoch and changes nothing
 * otherwise.
 */
export const acceptCredentialLogin = (
  token: string,
  expectedEpoch: number,
  subjectId: string,
): boolean => {
  if (expectedEpoch !== sessionEpoch) return false;
  if (restorePolicy !== "credential-required") return false;
  accessToken = { kind: "value", value: token };
  expectedSubjectId = subjectId;
  restorePolicy = "restore";
  return true;
};

/**
 * Passive credential acceptance. It never opens a credential-required gate and
 * never adopts a different subject.
 */
export const setAccessToken = (
  token: string,
  expectedEpoch: number,
  subjectId: string,
): boolean => {
  if (expectedEpoch !== sessionEpoch) return false;
  if (restorePolicy !== "restore") return false;
  if (expectedSubjectId !== null && expectedSubjectId !== subjectId) {
    accessToken = { kind: "missing" };
    restorePolicy = "identity-changed";
    return false;
  }
  accessToken = { kind: "value", value: token };
  expectedSubjectId = subjectId;
  return true;
};

/**
 * Binds or verifies the subject of an own-account result. An obsolete epoch is
 * cancellation, a mismatched subject closes restoration and a closed gate
 * forbids passive acceptance.
 */
export const assertAuthSessionSubject = (
  subjectId: string,
  expectedEpoch: number,
): void => {
  if (expectedEpoch !== sessionEpoch) {
    throw new CanceledError("Obsolete authentication epoch.");
  }
  if (restorePolicy === "identity-changed") {
    throw new AuthIdentityChangedError();
  }
  if (restorePolicy !== "restore") {
    throw new AuthReauthenticationRequiredError();
  }
  if (expectedSubjectId === null) {
    expectedSubjectId = subjectId;
    return;
  }
  if (expectedSubjectId !== subjectId) {
    restorePolicy = "identity-changed";
    throw new AuthIdentityChangedError();
  }
};

/**
 * Parses a complete success envelope and its operation data. A malformed
 * envelope or data payload is a contract failure, never a partial success.
 */
export const parseApiResponse = <T>(
  raw: unknown,
  dataSchema: ZodType<T>,
): ApiResponse<T> => {
  const envelope = successEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new ApiContractError();
  }
  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new ApiContractError(envelope.data.requestId);
  }
  const { data: _rawData, ...rest } = envelope.data;
  return { ...rest, data: data.data };
};

const readBrowserCookie = (name: string): ValueState<string> => {
  if (typeof document === "undefined") return { kind: "missing" };
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (cookie === undefined) return { kind: "missing" };
  try {
    return {
      kind: "value",
      value: decodeURIComponent(cookie.slice(prefix.length)),
    };
  } catch {
    return { kind: "missing" };
  }
};

const getRequestPath = (url: string): string => {
  try {
    const pathname = new URL(url, baseURL).pathname;
    return pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
};

export const isPublicAuthRequest = (url: string): boolean =>
  PUBLIC_AUTH_PATHS.has(getRequestPath(url));

const isUnsafeMethod = (method: string): boolean =>
  UNSAFE_METHODS.has(method.toUpperCase());

const safeCurrentPath = (): string | null => {
  const location = getBrowserLocation();
  if (location === null) return null;
  const value = `${location.pathname}${location.search}`;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (location.pathname.startsWith("/auth/")) return null;
  const parsed = new URL(value, "https://template.invalid");
  for (const key of parsed.searchParams.keys()) {
    if (CREDENTIAL_QUERY_KEYS.has(key.toLowerCase())) return null;
  }
  return `${parsed.pathname}${parsed.search}`;
};

const redirectToLogin = (): void => {
  const location = getBrowserLocation();
  if (location === null || location.pathname.startsWith("/auth/")) return;
  const returnTo = safeCurrentPath();
  assignBrowserLocation(
    returnTo === null
      ? "/auth/login"
      : `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  );
};

const isExpectedAnonymousRefreshFailure = (error: unknown): boolean => {
  const apiError = getApiError(error);

  return (
    (apiError.statusCode === 400 && apiError.code === "BAD_REQUEST") ||
    (apiError.statusCode === 401 && apiError.code === "UNAUTHORIZED")
  );
};

const resolveRawAdapter = (
  config: InternalAxiosRequestConfig,
): AxiosAdapter => {
  const stored = config._templateRawAdapter;
  if (stored !== undefined) return stored;
  const resolved = axios.getAdapter(
    apiClient.defaults.adapter ?? ["xhr", "http", "fetch"],
  );
  config._templateRawAdapter = resolved;
  return resolved;
};

/**
 * Serializes one raw attempt behind the outstanding cookie tail. The slot is
 * released as soon as the raw attempt settles, before any response
 * interception, so a protected 401 can enqueue a refresh without a deadlock.
 */
const runAuthCookieRequest = async <T>(
  expectedEpoch: number,
  request: () => Promise<T>,
): Promise<T> => {
  const previous = cookieTail;
  let release: () => void = () => undefined;
  cookieTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    if (expectedEpoch !== sessionEpoch) {
      throw new CanceledError("Obsolete authentication epoch.");
    }
    await previous;
    if (expectedEpoch !== sessionEpoch) {
      throw new CanceledError("Obsolete authentication epoch.");
    }
    return await request();
  } finally {
    release();
  }
};

const assertDispatchAllowed = (path: string): void => {
  if (EXPLICIT_LOGIN_PATHS.has(path)) return;
  if (PUBLIC_PURPOSE_PATHS.has(path)) return;
  if (restorePolicy === "restore") return;
  if (restorePolicy === "identity-changed") {
    throw new AuthIdentityChangedError();
  }
  throw new AuthReauthenticationRequiredError();
};

const applyDispatchHeaders = (config: InternalAxiosRequestConfig): void => {
  config.headers.delete("Authorization");
  if (accessToken.kind === "value") {
    config.headers.set("Authorization", `Bearer ${accessToken.value}`);
  }
  if (!isUnsafeMethod(config.method ?? "GET")) return;
  config.headers.delete(CSRF_HEADER_NAME);
  const csrfToken = readBrowserCookie(CSRF_COOKIE_NAME);
  if (csrfToken.kind === "value") {
    config.headers.set(CSRF_HEADER_NAME, csrfToken.value);
  }
};

/**
 * The raw dispatch owner. It rechecks the captured epoch and the restore
 * policy, refreshes the bearer and CSRF headers at dispatch time and keeps
 * the credential-mutating attempts on one same-tab cookie tail.
 */
const cookieAwareAdapter: AxiosAdapter = (config) => {
  const raw = resolveRawAdapter(config);
  const path = getRequestPath(config.url ?? "");
  const capturedEpoch = config._templateAuthEpoch ?? sessionEpoch;

  const dispatch = async (): Promise<AxiosResponse> => {
    if (capturedEpoch !== sessionEpoch) {
      throw new CanceledError("Obsolete authentication epoch.", config);
    }
    assertDispatchAllowed(path);
    applyDispatchHeaders(config);
    return raw(config);
  };

  if (!COOKIE_MUTATING_PATHS.has(path)) {
    return dispatch();
  }
  return runAuthCookieRequest(capturedEpoch, dispatch);
};

/**
 * Releases a refresh slot only when it still holds the settled attempt. An
 * older attempt can never clear a newer slot.
 */
const releaseRefreshSlot = (
  candidate: Promise<ApiResponse<AuthSessionData>>,
): void => {
  const slot: RefreshSlot | null = refreshSlot;
  if (slot === null) return;
  if (slot.promise === candidate) {
    refreshSlot = null;
  }
};

/**
 * The one refresh POST, full-response parse and passive publication owner. It
 * is shared by initial restoration and by the protected 401 replay.
 */
export const refreshAuthSession = async (
  expectedEpoch: number,
): Promise<ApiResponse<AuthSessionData>> => {
  if (expectedEpoch !== sessionEpoch) {
    throw new CanceledError("Obsolete authentication epoch.");
  }
  if (restorePolicy !== "restore") {
    throw restorePolicy === "identity-changed"
      ? new AuthIdentityChangedError()
      : new AuthReauthenticationRequiredError();
  }
  const existing: RefreshSlot | null = refreshSlot;
  if (existing !== null && existing.epoch === expectedEpoch) {
    return existing.promise;
  }

  const promise = (async (): Promise<ApiResponse<AuthSessionData>> => {
    const response = await apiClient.post(
      "/auth/refresh",
      {},
      {
        _templateAuthEpoch: expectedEpoch,
      },
    );
    const parsed = parseApiResponse(response.data, authSessionDataSchema);
    const accepted = setAccessToken(
      parsed.data.tokens.accessToken,
      expectedEpoch,
      parsed.data.user.id,
    );
    if (!accepted) {
      if (getAuthSessionRestorePolicy() === "identity-changed") {
        throw new AuthIdentityChangedError();
      }
      throw new CanceledError("Obsolete authentication epoch.");
    }
    return parsed;
  })();

  refreshSlot = { epoch: expectedEpoch, promise };
  try {
    return await promise;
  } finally {
    releaseRefreshSlot(promise);
  }
};

apiClient.interceptors.request.use(
  (config) => {
    if (config._templateAuthEpoch === undefined) {
      config._templateAuthEpoch = sessionEpoch;
    }
    config.adapter = cookieAwareAdapter;
    return config;
  },
  undefined,
  { synchronous: true },
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    const config = error.config;
    const requestUrl = config?.url;
    if (
      config === undefined ||
      typeof requestUrl !== "string" ||
      error.response?.status !== 401 ||
      isPublicAuthRequest(requestUrl) ||
      config._templateRetried === true
    ) {
      throw error;
    }
    const capturedEpoch = config._templateAuthEpoch;
    const abortedBefore = config.signal?.aborted ?? false;
    if (
      capturedEpoch === undefined ||
      capturedEpoch !== getAuthSessionEpoch() ||
      abortedBefore
    ) {
      throw error;
    }
    config._templateRetried = true;
    try {
      await refreshAuthSession(capturedEpoch);
    } catch (refreshError: unknown) {
      clearAccessToken();

      if (isExpectedAnonymousRefreshFailure(refreshError)) {
        redirectToLogin();
      }

      throw refreshError;
    }
    const abortedAfter = config.signal?.aborted ?? false;
    if (capturedEpoch !== getAuthSessionEpoch() || abortedAfter) {
      throw error;
    }
    return apiClient.request(config);
  },
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readFieldErrors = (value: unknown): Record<string, string[]> => {
  if (!Array.isArray(value)) return {};
  const grouped = new Map<string, string[]>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const field = item["field"];
    const message = item["message"];
    if (typeof field !== "string" || typeof message !== "string") continue;
    grouped.set(field, [...(grouped.get(field) ?? []), message]);
  }
  return Object.fromEntries(grouped);
};

const readErrorEnvelope = (value: unknown): ValueState<ParsedErrorEnvelope> => {
  if (!isRecord(value) || value["success"] !== false)
    return { kind: "missing" };
  const message = value["message"];
  const statusCode = value["statusCode"];
  const requestId = value["requestId"];
  const code = value["code"];
  if (
    typeof message !== "string" ||
    typeof statusCode !== "number" ||
    typeof requestId !== "string" ||
    typeof code !== "string"
  ) {
    return { kind: "missing" };
  }
  return {
    kind: "value",
    value: { message, statusCode, requestId, code, errors: value["errors"] },
  };
};

const readHeaderRequestId = (
  response: AxiosResponse<unknown> | undefined,
): string => {
  const value: unknown = response?.headers["x-request-id"] as unknown;
  return typeof value === "string" ? value : "";
};

export function getApiError(error: unknown): ApiError {
  if (error instanceof ApiContractError) {
    return {
      message: error.message,
      statusCode: 502,
      code: "CONTRACT_ERROR",
      requestId: error.requestId,
      fieldErrors: {},
    };
  }
  if (error instanceof AuthIdentityChangedError) {
    return {
      message: error.message,
      statusCode: 409,
      code: "AUTH_IDENTITY_CHANGED",
      requestId: "",
      fieldErrors: {},
    };
  }
  if (error instanceof AuthReauthenticationRequiredError) {
    return {
      message: error.message,
      statusCode: 409,
      code: "AUTH_REAUTHENTICATION_REQUIRED",
      requestId: "",
      fieldErrors: {},
    };
  }
  const axiosError: AxiosError | undefined = axios.isAxiosError(error)
    ? error
    : undefined;
  const envelope = readErrorEnvelope(axiosError?.response?.data);
  const responseStatus = axiosError?.response?.status ?? 0;
  const statusCode =
    envelope.kind === "value" ? envelope.value.statusCode : responseStatus;
  const isTimeout =
    axiosError?.code === "ECONNABORTED" || axiosError?.code === "ETIMEDOUT";
  return {
    message:
      envelope.kind === "value"
        ? envelope.value.message
        : isTimeout
          ? "The request timed out. Try again."
          : (STATUS_MESSAGES[statusCode] ??
            "The request could not be completed."),
    statusCode,
    code:
      envelope.kind === "value"
        ? envelope.value.code
        : statusCode === 0
          ? "NETWORK_ERROR"
          : "HTTP_ERROR",
    requestId:
      envelope.kind === "value"
        ? envelope.value.requestId
        : readHeaderRequestId(axiosError?.response),
    fieldErrors:
      envelope.kind === "value" ? readFieldErrors(envelope.value.errors) : {},
  };
}
