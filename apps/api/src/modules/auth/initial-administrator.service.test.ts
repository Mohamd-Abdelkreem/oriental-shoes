import { Department, UserRole, UserStatus } from "@template/database";
import { describe, expect, it } from "vitest";

import type { AuthorityAccount } from "./account-authority.js";
import {
  InitialAdministratorError,
  evaluateInitialAdministratorEligibility,
  type InitialAdministratorGate,
  type InitialAdministratorInput,
} from "./initial-administrator.service.js";

const CANDIDATE_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const CANDIDATE_EMAIL = "candidate@example.com";
const VERIFIED_AT = new Date("2026-01-01T00:00:00.000Z");

const buildCandidate = (
  overrides: Partial<AuthorityAccount> = {},
): AuthorityAccount => ({
  id: CANDIDATE_ID,
  email: CANDIDATE_EMAIL,
  fullName: "Bootstrap Candidate",
  phone: null,
  role: UserRole.USER,
  status: UserStatus.PENDING_APPROVAL,
  emailVerifiedAt: VERIFIED_AT,
  department: null,
  staffApprovedAt: null,
  staffApprovedById: null,
  accessVersion: 3,
  createdAt: VERIFIED_AT,
  updatedAt: VERIFIED_AT,
  ...overrides,
});

const buildInput = (
  overrides: Partial<InitialAdministratorInput> = {},
): InitialAdministratorInput => ({
  userId: CANDIDATE_ID,
  expectedEmail: CANDIDATE_EMAIL,
  expectedAccessVersion: 3,
  operatorReference: "operator-42",
  ...overrides,
});

const buildGate = (
  overrides: Partial<InitialAdministratorGate> = {},
): InitialAdministratorGate => ({
  candidate: buildCandidate(),
  administratorCount: 0,
  receiptPresent: false,
  ...overrides,
});

describe("the restricted initial-administrator eligibility decision", () => {
  it("accepts a verified, unassigned, pending employee", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate(),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.reason).toBe("ELIGIBLE");
    expect(evaluation.selected?.id).toBe(CANDIDATE_ID);
  });

  it("denies the procedure while any administrator row exists", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({ administratorCount: 1 }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INITIAL_ADMIN_EXISTS");
  });

  it("denies the procedure while the singleton receipt exists", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({ receiptPresent: true }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INITIAL_ADMIN_EXISTS");
  });

  it("denies an absent identity and exposes no other account", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({ candidate: null }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INVALID_CANDIDATE");
    expect(evaluation.selected).toBeNull();
  });

  it("denies an unverified candidate", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({ candidate: buildCandidate({ emailVerifiedAt: null }) }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INVALID_CANDIDATE");
  });

  it("denies a suspended candidate", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({
        candidate: buildCandidate({ status: UserStatus.SUSPENDED }),
      }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INVALID_CANDIDATE");
  });

  it("denies an already active candidate", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({ candidate: buildCandidate({ status: UserStatus.ACTIVE }) }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INVALID_CANDIDATE");
  });

  it("denies a candidate that already carries an employee assignment", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({
        candidate: buildCandidate({
          department: Department.SALES,
          staffApprovedAt: VERIFIED_AT,
          staffApprovedById: "bbbbbbbb-2222-4222-8222-222222222222",
        }),
      }),
      buildInput(),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INVALID_CANDIDATE");
  });

  it("denies a stale expected access version and keeps the selected account", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate(),
      buildInput({ expectedAccessVersion: 2 }),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("STALE_CANDIDATE");
    expect(evaluation.selected?.id).toBe(CANDIDATE_ID);
    expect(evaluation.selected?.accessVersion).toBe(3);
  });

  it("denies a wrong expected email and exposes no other account", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate(),
      buildInput({ expectedEmail: "someone.else@example.com" }),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("STALE_CANDIDATE");
    expect(evaluation.selected).toBeNull();
  });

  it("denies a candidate whose access revision can no longer be incremented", () => {
    const evaluation = evaluateInitialAdministratorEligibility(
      buildGate({
        candidate: buildCandidate({ accessVersion: 2_147_483_647 }),
      }),
      buildInput({ expectedAccessVersion: 2_147_483_647 }),
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("STALE_CANDIDATE");
  });
});

describe("the known denial error", () => {
  it("carries one bounded reason and one fixed safe message", () => {
    const error = new InitialAdministratorError("STALE_CANDIDATE");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InitialAdministratorError");
    expect(error.reason).toBe("STALE_CANDIDATE");
    expect(error.message).toBe(
      "The selected identity is not eligible for initial administrator provisioning.",
    );
  });

  it("never carries a credential or a raw database detail", () => {
    const error = new InitialAdministratorError("INVALID_CANDIDATE");

    expect(error.message).not.toContain("@");
    expect(error.message).not.toContain("postgres");
    expect(error.stack).toBeTypeOf("string");
  });
});
