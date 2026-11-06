import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(currentDirectory, "..");
const schema = readFileSync(
  join(packageRoot, "prisma", "schema.prisma"),
  "utf8",
);

describe("staff access Prisma schema", () => {
  it("keeps the original and convergence migration directories in order", () => {
    const migrationDirectories = readdirSync(
      join(packageRoot, "prisma", "migrations"),
      {
        withFileTypes: true,
      },
    )
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    expect(migrationDirectories).toEqual([
      "20260818000000_init_authentication",
      "20261103000100_extend_staff_access_enums",
      "20261103000150_repair_legacy_verified_users",
      "20261103000200_staff_access_state_and_history",
      "20261104000100_enforce_staff_decision_transitions",
      "20261105000100_shared_customers_sales_drafts",
    ]);
  });

  it("contains exactly the required application models and enums", () => {
    const models = [...schema.matchAll(/^model\s+(\w+)/gmu)].map(
      (match) => match[1],
    );
    const enums = [...schema.matchAll(/^enum\s+(\w+)/gmu)].map(
      (match) => match[1],
    );
    expect(models).toEqual([
      "User",
      "RefreshToken",
      "StaffDecision",
      "InitialAdministratorProvisioning",
      "Customer",
      "SalesDraft",
      "SalesDraftPiece",
      "SalesCommand",
    ]);
    expect(enums).toEqual([
      "UserRole",
      "UserStatus",
      "Department",
      "StaffOperation",
      "StaffDecisionAction",
      "SalesOrderType",
      "SalesDraftStatus",
      "SalesCommandOperation",
    ]);
  });

  it("contains no demo or business-specific model inventory", () => {
    expect(schema).not.toMatch(
      /DemoMessage|Organization|Project|Quotation|Payment/u,
    );
  });

  it("declares the employee assignment and authority version fields", () => {
    expect(schema).toMatch(/department\s+Department\?\s+@map\("department"\)/u);
    expect(schema).toMatch(
      /staffApprovedAt\s+DateTime\?\s+@map\("staff_approved_at"\)/u,
    );
    expect(schema).toMatch(
      /staffApprovedById\s+String\?\s+@map\("staff_approved_by_id"\)\s+@db\.Uuid/u,
    );
    expect(schema).toMatch(
      /accessVersion\s+Int\s+@default\(0\)\s+@map\("access_version"\)/u,
    );
  });

  it("keeps a single scalar department and the retained approval relation", () => {
    const departmentFields = [
      ...schema.matchAll(/department\s+Department\?/gu),
    ];
    expect(departmentFields).toHaveLength(1);
    expect(schema).toMatch(
      /@relation\("UserStaffApproval", fields: \[staffApprovedById\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/u,
    );
  });

  it("declares the bounded directory indexes", () => {
    expect(schema).toContain(
      '@@index([createdAt(sort: Desc), id(sort: Desc)], map: "users_created_id_idx")',
    );
    expect(schema).toContain(
      '@@index([role, status, createdAt(sort: Desc), id(sort: Desc)], map: "users_role_status_created_id_idx")',
    );
  });

  it("binds the retained decision history to its global command identity", () => {
    expect(schema).toMatch(
      /commandId\s+String\s+@unique\s+@map\("command_id"\)\s+@db\.Uuid/u,
    );
    expect(schema).toContain(
      '@@unique([targetId, afterVersion], map: "staff_decisions_target_version_key")',
    );
    expect(schema).toContain(
      '@@index([targetId, occurredAt(sort: Desc), id(sort: Desc)], map: "staff_decisions_target_occurred_id_idx")',
    );
  });

  it("keeps the initial administrator receipt a restricted singleton", () => {
    expect(schema).toMatch(/id\s+String\s+@id\s+@db\.VarChar\(13\)/u);
    expect(schema).toMatch(
      /targetId\s+String\s+@unique\s+@map\("target_id"\)\s+@db\.Uuid/u,
    );
    expect(schema).toContain('@@map("initial_administrator_provisioning")');
  });

  it("never stores a credential or a mutable request payload on history", () => {
    const decisionModel = schema.slice(
      schema.indexOf("model StaffDecision {"),
      schema.indexOf("model InitialAdministratorProvisioning {"),
    );
    expect(decisionModel).not.toMatch(/password|tokenHash|requestBody/u);
  });
});
