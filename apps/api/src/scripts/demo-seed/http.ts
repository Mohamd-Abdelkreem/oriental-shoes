import {
  authEmptyDataSchema,
  authSessionDataSchema,
  errorEnvelopeSchema,
  successEnvelopeSchema,
} from "@template/contracts";
import type { ZodType } from "zod";

export type DemoCredentials = Readonly<{ email: string; password: string }>;
export type DemoRequest = <T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  method?: "PATCH" | "PUT",
) => Promise<T>;

export class DemoSeedError extends Error {}

const parseResponse = async <T>(
  response: Response,
  path: string,
  schema: ZodType<T>,
): Promise<T> => {
  const route = path.split("?", 1)[0] ?? "/";
  const raw: unknown = await response.json().catch(() => {
    throw new DemoSeedError(`Invalid HTTP response at ${route}`);
  });
  if (!response.ok) {
    const failure = errorEnvelopeSchema.safeParse(raw);
    const fields = failure.success
      ? failure.data.errors?.map(({ field }) => field).join(", ")
      : undefined;
    throw new DemoSeedError(
      `HTTP ${String(response.status)} ${route} ${failure.success ? failure.data.code : ""}${fields ? ` (${fields})` : ""}`,
    );
  }
  const envelope = successEnvelopeSchema.safeParse(raw);
  const parsed = envelope.success ? schema.safeParse(envelope.data.data) : null;
  if (!parsed?.success) throw new DemoSeedError(`Invalid response at ${route}`);
  return parsed.data;
};

export const demoHttp = (api: string) => {
  const sessions: DemoRequest[] = [];
  const send = async (
    path: string,
    headers: Record<string, string>,
    body?: unknown,
    method?: "PATCH" | "PUT",
  ) => {
    try {
      return await fetch(api + path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: { ...headers, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new DemoSeedError(
        `Request interrupted at ${path.split("?", 1)[0] ?? "/"}`,
      );
    }
  };
  const anonymous: DemoRequest = async (path, schema, body) =>
    parseResponse(await send(path, {}, body), path, schema);

  const login = async (credentials: DemoCredentials) => {
    const path = "/auth/login";
    const response = await send(
      path,
      {},
      { ...credentials, rememberMe: false },
    );
    const { user, tokens } = await parseResponse(
      response,
      path,
      authSessionDataSchema,
    );
    const cookies = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0]);
    const csrf = cookies.find((cookie) => cookie?.startsWith("csrfToken="));
    const refresh = cookies.find((cookie) =>
      cookie?.startsWith("refreshToken="),
    );
    if (!csrf || !refresh)
      throw new DemoSeedError("Session cookies are missing");
    const headers = {
      authorization: `Bearer ${tokens.accessToken}`,
      "x-csrf-token": csrf.slice("csrfToken=".length),
    };
    const request: DemoRequest = async (route, schema, body, method) => {
      const cookie = route === "/auth/logout" ? `${csrf}; ${refresh}` : csrf;
      return parseResponse(
        await send(route, { ...headers, cookie }, body, method),
        route,
        schema,
      );
    };
    sessions.push(request);
    return { user, request };
  };
  const logout = async () => {
    const settled = await Promise.allSettled(
      sessions.map((request) =>
        request("/auth/logout", authEmptyDataSchema, {}),
      ),
    );
    if (settled.some(({ status }) => status === "rejected"))
      console.warn("Some seed sessions could not be signed out.");
  };
  return { anonymous, login, logout };
};
