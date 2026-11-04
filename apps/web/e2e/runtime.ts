import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The private runtime context of the isolated browser harness.
 *
 * The context is test-generated synthetic data. It never contains a token, an
 * action link, a provider credential or a developer secret, and it is never
 * written to a report, an ordinary log or the committed tree.
 */

/** The environment variable that carries the private runtime manifest path. */
export const E2E_RUNTIME_FILE_ENVIRONMENT_KEY = "P01_E2E_RUNTIME_FILE";

/** The one-time action kinds the harness can capture. */
export type E2eCapturedActionKind = "verification" | "reset";

/** The exact web pathnames that carry a one-time action link. */
export const E2E_ACTION_PATHNAMES: Readonly<
  Record<E2eCapturedActionKind, string>
> = Object.freeze({
  verification: "/auth/verify-email",
  reset: "/auth/reset-password",
});

/** One synthetic identity owned by the harness. */
export type E2eRuntimeIdentity = Readonly<{
  id: string;
  email: string;
  password: string;
}>;

/** The validated private runtime context shared with the test workers. */
export type E2eRuntime = Readonly<{
  apiOrigin: string;
  webOrigin: string;
  mailboxDirectory: string;
  admin: E2eRuntimeIdentity;
  legacyStaffByProject: Record<string, E2eRuntimeIdentity>;
}>;

/** One captured synthetic mailbox record. */
type E2eCapturedMailRecord = Readonly<{
  sequence: number;
  recipient: string;
  kind: E2eCapturedActionKind;
  actionUrl: string;
  html: string;
}>;

const CAPTURE_TIMEOUT_MS = 30_000;
const CAPTURE_POLL_INTERVAL_MS = 150;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `The e2e runtime manifest field "${key}" must be a non-empty string.`,
    );
  }
  return value;
};

const readLoopbackOrigin = (
  record: Record<string, unknown>,
  key: string,
): string => {
  const value = readString(record, key);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`The e2e runtime manifest field "${key}" must be a URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `The e2e runtime manifest field "${key}" must use http or https.`,
    );
  }
  if (
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "[::1]"
  ) {
    throw new Error(
      `The e2e runtime manifest field "${key}" must address a loopback host.`,
    );
  }
  return url.origin;
};

const parseIdentity = (value: unknown, label: string): E2eRuntimeIdentity => {
  if (!isRecord(value)) {
    throw new Error(
      `The e2e runtime manifest field "${label}" must be an object.`,
    );
  }
  return Object.freeze({
    id: readString(value, "id"),
    email: readString(value, "email"),
    password: readString(value, "password"),
  });
};

/**
 * Validates an unknown value as the private runtime context. The same
 * validation guards the writer in the global setup and the reader in a worker,
 * so a malformed manifest fails closed instead of reaching an assertion.
 */
export const parseE2eRuntime = (value: unknown): E2eRuntime => {
  if (!isRecord(value)) {
    throw new Error("The e2e runtime manifest must be a JSON object.");
  }

  const legacyStaffByProject = value["legacyStaffByProject"];
  if (!isRecord(legacyStaffByProject)) {
    throw new Error(
      'The e2e runtime manifest field "legacyStaffByProject" must be an object.',
    );
  }

  const identities: Record<string, E2eRuntimeIdentity> = {};
  for (const [project, identity] of Object.entries(legacyStaffByProject)) {
    identities[project] = parseIdentity(
      identity,
      `legacyStaffByProject.${project}`,
    );
  }

  return Object.freeze({
    apiOrigin: readLoopbackOrigin(value, "apiOrigin"),
    webOrigin: readLoopbackOrigin(value, "webOrigin"),
    mailboxDirectory: readString(value, "mailboxDirectory"),
    admin: parseIdentity(value["admin"], "admin"),
    legacyStaffByProject: Object.freeze(identities),
  });
};

let cachedRuntime: E2eRuntime | undefined;

/**
 * Reads the private runtime manifest written by the global setup. The manifest
 * path arrives through the environment, never through a committed file.
 */
export const readE2eRuntime = (): E2eRuntime => {
  if (cachedRuntime !== undefined) {
    return cachedRuntime;
  }

  const runtimeFile = process.env[E2E_RUNTIME_FILE_ENVIRONMENT_KEY];
  if (runtimeFile === undefined || runtimeFile.length === 0) {
    throw new Error(
      `The e2e runtime manifest path is missing from ${E2E_RUNTIME_FILE_ENVIRONMENT_KEY}.`,
    );
  }

  const contents = readFileSync(runtimeFile, "utf8");
  const parsed = parseE2eRuntime(JSON.parse(contents) as unknown);
  cachedRuntime = parsed;
  return parsed;
};

const parseCapturedRecord = (value: unknown): E2eCapturedMailRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const sequence = value["sequence"];
  const recipient = value["recipient"];
  const kind = value["kind"];
  const actionUrl = value["actionUrl"];
  const html = value["html"];

  if (
    typeof sequence !== "number" ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    typeof recipient !== "string" ||
    recipient.length === 0 ||
    (kind !== "verification" && kind !== "reset") ||
    typeof actionUrl !== "string" ||
    actionUrl.length === 0 ||
    typeof html !== "string"
  ) {
    return null;
  }

  return { sequence, recipient, kind, actionUrl, html };
};

/**
 * The highest sequence already consumed for one recipient and kind. A repeated
 * recovery request therefore cannot reuse an earlier captured link.
 */
const consumedSequences = new Map<string, number>();

const consumptionKey = (
  recipient: string,
  kind: E2eCapturedActionKind,
): string => `${recipient}::${kind}`;

/**
 * The safe timeout classification of a capture that never arrived. The message
 * carries no HTML, token, credential or action link.
 */
export class E2eCaptureTimeoutError extends Error {
  readonly kind: E2eCapturedActionKind;
  readonly recipient: string;

  constructor(kind: E2eCapturedActionKind, recipient: string) {
    super("E2E_CAPTURE_TIMEOUT");
    this.name = "E2eCaptureTimeoutError";
    this.kind = kind;
    this.recipient = recipient;
  }
}

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

const assertActionUrl = (
  record: E2eCapturedMailRecord,
  webOrigin: string,
  kind: E2eCapturedActionKind,
): void => {
  let url: URL;
  try {
    url = new URL(record.actionUrl);
  } catch {
    throw new Error("E2E_CAPTURE_INVALID_ACTION");
  }

  if (url.origin !== webOrigin || url.pathname !== E2E_ACTION_PATHNAMES[kind]) {
    throw new Error("E2E_CAPTURE_INVALID_ACTION");
  }
};

/**
 * Finds the newest unconsumed capture for one exact recipient and kind inside
 * the owned mailbox directory. The origin and the exact action pathname are
 * verified before the link is handed back to a test.
 */
const findCapturedAction = async (
  mailboxDirectory: string,
  recipient: string,
  kind: E2eCapturedActionKind,
  consumed: number,
  webOrigin: string,
): Promise<E2eCapturedMailRecord | null> => {
  const entries = await readdir(mailboxDirectory);
  let selected: E2eCapturedMailRecord | null = null;

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const contents = await readFile(join(mailboxDirectory, entry), "utf8");
    const record = parseCapturedRecord(JSON.parse(contents) as unknown);
    if (record === null) {
      continue;
    }
    if (record.recipient !== recipient || record.kind !== kind) {
      continue;
    }
    if (record.sequence <= consumed) {
      continue;
    }
    if (selected === null || record.sequence > selected.sequence) {
      selected = record;
    }
  }

  if (selected === null) {
    return null;
  }

  assertActionUrl(selected, webOrigin, kind);
  return selected;
};

/**
 * Waits for the captured action link of one exact recipient and kind.
 *
 * The helper is test coordination only. It never returns an HTML body, it
 * never logs a token and it never reads the database.
 */
export const waitForCapturedAction = async (
  email: string,
  kind: E2eCapturedActionKind,
): Promise<string> => {
  const runtime = readE2eRuntime();
  const recipient = email.trim().toLowerCase();
  const key = consumptionKey(recipient, kind);
  const consumed = consumedSequences.get(key) ?? 0;
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const record = await findCapturedAction(
      runtime.mailboxDirectory,
      recipient,
      kind,
      consumed,
      runtime.webOrigin,
    );

    if (record !== null) {
      consumedSequences.set(key, record.sequence);
      return record.actionUrl;
    }

    await delay(CAPTURE_POLL_INTERVAL_MS);
  }

  throw new E2eCaptureTimeoutError(kind, recipient);
};
