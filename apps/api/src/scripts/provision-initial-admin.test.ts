import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { InitialAdministratorError } from "../modules/auth/initial-administrator.service.js";
import {
  InitialAdministratorArgumentsError,
  assertInitialAdministratorProductionAcknowledgement,
  parseInitialAdministratorArguments,
} from "./initial-administrator.arguments.js";
import {
  INITIAL_ADMINISTRATOR_EXIT_ARGUMENT,
  INITIAL_ADMINISTRATOR_EXIT_INELIGIBLE,
  INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED,
  PROVISIONING_FAILED_OUTPUT,
  classifyInitialAdministratorFailure,
  formatInitialAdministratorPreview,
  formatInitialAdministratorResult,
} from "./provision-initial-admin.js";

const execFileAsync = promisify(execFile);

const USER_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const OPERATOR_REFERENCE = "operator-42";

const VALID_ARGUMENTS: readonly string[] = [
  "--user-id",
  USER_ID,
  "--expected-email",
  "candidate@example.com",
  "--expected-access-version",
  "3",
  "--operator-reference",
  OPERATOR_REFERENCE,
];

type CliProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const runCliProcess = async (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<CliProcessResult> => {
  const scriptPath = fileURLToPath(
    new URL("./provision-initial-admin.ts", import.meta.url),
  );
  const apiRoot = fileURLToPath(new URL("../../", import.meta.url));

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--conditions=development", "--import", "tsx", scriptPath, ...args],
      { cwd: apiRoot, env },
    );

    return { code: 0, stdout, stderr };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const failure = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };

    return {
      code: typeof failure.code === "number" ? failure.code : -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
};

describe("the strict argument parser", () => {
  it("previews by default and never mutates by accident", () => {
    const options = parseInitialAdministratorArguments(VALID_ARGUMENTS);

    expect(options.apply).toBe(false);
    expect(options.allowProduction).toBe(false);
    expect(options.input).toStrictEqual({
      userId: USER_ID,
      expectedEmail: "candidate@example.com",
      expectedAccessVersion: 3,
      operatorReference: OPERATOR_REFERENCE,
    });
  });

  it("accepts the explicit mutation and production flags", () => {
    const options = parseInitialAdministratorArguments([
      ...VALID_ARGUMENTS,
      "--apply",
      "--allow-production",
    ]);

    expect(options.apply).toBe(true);
    expect(options.allowProduction).toBe(true);
  });

  it("accepts the inline value form", () => {
    const options = parseInitialAdministratorArguments([
      `--user-id=${USER_ID}`,
      "--expected-email=candidate@example.com",
      "--expected-access-version=3",
      `--operator-reference=${OPERATOR_REFERENCE}`,
    ]);

    expect(options.input.userId).toBe(USER_ID);
    expect(options.input.expectedAccessVersion).toBe(3);
  });

  it("normalizes the expected email and the operator reference", () => {
    const options = parseInitialAdministratorArguments([
      "--user-id",
      USER_ID.toUpperCase(),
      "--expected-email",
      "  Candidate@Example.com ",
      "--expected-access-version",
      "0",
      "--operator-reference",
      `  ${OPERATOR_REFERENCE}  `,
    ]);

    expect(options.input.userId).toBe(USER_ID);
    expect(options.input.expectedEmail).toBe("candidate@example.com");
    expect(options.input.expectedAccessVersion).toBe(0);
    expect(options.input.operatorReference).toBe(OPERATOR_REFERENCE);
  });

  it("refuses an unknown argument", () => {
    expect(() =>
      parseInitialAdministratorArguments([...VALID_ARGUMENTS, "--promote-all"]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a duplicated flag", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        ...VALID_ARGUMENTS,
        "--user-id",
        USER_ID,
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a missing required flag", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        "--user-id",
        USER_ID,
        "--expected-email",
        "candidate@example.com",
        "--expected-access-version",
        "3",
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a value flag without a value", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        ...VALID_ARGUMENTS,
        "--operator-reference",
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a value for a boolean flag", () => {
    expect(() =>
      parseInitialAdministratorArguments([...VALID_ARGUMENTS, "--apply=true"]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a duplicated boolean flag", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        ...VALID_ARGUMENTS,
        "--apply",
        "--apply",
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a malformed user id", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        "--user-id",
        "not-a-uuid",
        "--expected-email",
        "candidate@example.com",
        "--expected-access-version",
        "3",
        "--operator-reference",
        OPERATOR_REFERENCE,
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a malformed expected email", () => {
    expect(() =>
      parseInitialAdministratorArguments([
        "--user-id",
        USER_ID,
        "--expected-email",
        "not-an-email",
        "--expected-access-version",
        "3",
        "--operator-reference",
        OPERATOR_REFERENCE,
      ]),
    ).toThrow(InitialAdministratorArgumentsError);
  });

  it("refuses a negative, fractional or oversized access version", () => {
    for (const version of ["-1", "1.5", "two", "2147483648"]) {
      expect(() =>
        parseInitialAdministratorArguments([
          "--user-id",
          USER_ID,
          "--expected-email",
          "candidate@example.com",
          "--expected-access-version",
          version,
          "--operator-reference",
          OPERATOR_REFERENCE,
        ]),
      ).toThrow(InitialAdministratorArgumentsError);
    }
  });

  it("refuses a blank, oversized or control-character operator reference", () => {
    for (const reference of [
      "   ",
      "x".repeat(129),
      "operator\u0000reference",
    ]) {
      expect(() =>
        parseInitialAdministratorArguments([
          "--user-id",
          USER_ID,
          "--expected-email",
          "candidate@example.com",
          "--expected-access-version",
          "3",
          "--operator-reference",
          reference,
        ]),
      ).toThrow(InitialAdministratorArgumentsError);
    }
  });

  it("never repeats a rejected argument value in its message", () => {
    let message = "";

    try {
      parseInitialAdministratorArguments([
        "--user-id",
        "secret-value",
        "--expected-email",
        "candidate@example.com",
        "--expected-access-version",
        "3",
        "--operator-reference",
        OPERATOR_REFERENCE,
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toBe("--user-id must be a UUID.");
    expect(message).not.toContain("secret-value");
  });
});

describe("the production acknowledgment gate", () => {
  it("requires the explicit acknowledgment for a production apply", () => {
    const options = parseInitialAdministratorArguments([
      ...VALID_ARGUMENTS,
      "--apply",
    ]);

    expect(() => {
      assertInitialAdministratorProductionAcknowledgement(options, true);
    }).toThrow(InitialAdministratorArgumentsError);
  });

  it("accepts an acknowledged production apply", () => {
    const options = parseInitialAdministratorArguments([
      ...VALID_ARGUMENTS,
      "--apply",
      "--allow-production",
    ]);

    expect(() => {
      assertInitialAdministratorProductionAcknowledgement(options, true);
    }).not.toThrow();
  });

  it("never demands the acknowledgment for a preview", () => {
    const options = parseInitialAdministratorArguments(VALID_ARGUMENTS);

    expect(() => {
      assertInitialAdministratorProductionAcknowledgement(options, true);
    }).not.toThrow();
  });
});

describe("the process exit classification", () => {
  it("reports a known ineligible or stale outcome as exit three", () => {
    const classified = classifyInitialAdministratorFailure(
      new InitialAdministratorError("STALE_CANDIDATE"),
    );

    expect(classified.exitCode).toBe(INITIAL_ADMINISTRATOR_EXIT_INELIGIBLE);
    expect(classified.output).toContain("reason=STALE_CANDIDATE");
  });

  it("reports every unexpected failure as PROVISIONING_FAILED alone", () => {
    const classified = classifyInitialAdministratorFailure(
      new Error("connection refused to postgres://operator:hunter2@db/secret"),
    );

    expect(classified.exitCode).toBe(INITIAL_ADMINISTRATOR_EXIT_UNEXPECTED);
    expect(classified.output).toBe(PROVISIONING_FAILED_OUTPUT);
    expect(classified.output).not.toContain("hunter2");
  });
});

describe("the safe process output", () => {
  it("masks the address of a previewed account", () => {
    const output = formatInitialAdministratorPreview({
      user: {
        id: USER_ID,
        fullName: "Bootstrap Candidate",
        email: "candidate@example.com",
        phone: null,
        role: "USER",
        status: "PENDING_APPROVAL",
        department: null,
        staffApprovedAt: null,
        accessVersion: 3,
        emailVerifiedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      eligible: true,
      reason: "ELIGIBLE",
    });

    expect(output).toContain(`selected_id=${USER_ID}`);
    expect(output).toContain("email_masked=c***@e***.com");
    expect(output).toContain("reason=ELIGIBLE");
    expect(output).not.toContain("candidate@example.com");
  });

  it("shows no account for an absent identity", () => {
    const output = formatInitialAdministratorPreview({
      user: null,
      eligible: false,
      reason: "INVALID_CANDIDATE",
    });

    expect(output).toContain("selected_id=none");
    expect(output).toContain("reason=INVALID_CANDIDATE");
  });

  it("prints only the outcome, the selected id, the operator and the time", () => {
    const output = formatInitialAdministratorResult({
      user: {
        id: USER_ID,
        fullName: "Bootstrap Candidate",
        email: "candidate@example.com",
        phone: null,
        role: "ADMIN",
        status: "ACTIVE",
        department: null,
        staffApprovedAt: null,
        accessVersion: 4,
        emailVerifiedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      operatorReference: OPERATOR_REFERENCE,
      occurredAt: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("outcome=PROVISIONED");
    expect(output).toContain(`selected_id=${USER_ID}`);
    expect(output).toContain(`operator_reference=${OPERATOR_REFERENCE}`);
    expect(output).toContain("occurred_at=2026-01-01T00:00:00.000Z");
    expect(output).not.toContain("candidate@example.com");
    expect(output).not.toContain("Bootstrap Candidate");
  });
});

describe("the standalone process", () => {
  it("refuses malformed arguments before it resolves a connection", async () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env["DATABASE_URL"];
    delete env["P01_TEST_DATABASE_URL"];

    const result = await runCliProcess(["--user-id", "not-a-uuid"], env);

    expect(result.code).toBe(INITIAL_ADMINISTRATOR_EXIT_ARGUMENT);
    expect(result.stderr).toContain("ARGUMENT_ERROR");
    expect(result.stdout).toBe("");
  }, 60_000);
});
