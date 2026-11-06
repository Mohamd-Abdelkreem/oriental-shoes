import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(currentDirectory, "..", "..");
const originalMigrationNames = [
  "20260818000000_init_authentication",
  "20261103000100_extend_staff_access_enums",
  "20261103000200_staff_access_state_and_history",
] as const;
const migrationSql = (name: string): string =>
  readFileSync(
    join(packageRoot, "prisma", "migrations", name, "migration.sql"),
    "utf8",
  );
const initialMigrationSql = migrationSql(originalMigrationNames[0]);

const databaseUrl = (): string => {
  const value = process.env["DATABASE_URL"];
  if (value === undefined || value.length === 0) {
    throw new Error("The Testcontainers DATABASE_URL was not provided.");
  }
  return value;
};

const pnpmScript = (): string => {
  const value = process.env["npm_execpath"];
  if (value === undefined) {
    throw new Error("npm_execpath is required to run the Prisma CLI.");
  }
  return value;
};

const runPrisma = async (
  args: readonly string[],
  ownedDatabaseUrl: string,
): Promise<{ stdout: string; stderr: string }> => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [pnpmScript(), "exec", "prisma", ...args],
    {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: ownedDatabaseUrl },
      timeout: 180_000,
      windowsHide: true,
    },
  );
  return { stdout, stderr };
};

const insertTransition = (
  db: Client | Pool,
  transition: readonly [
    operation: string,
    action: string,
    beforeStatus: string,
    afterStatus: string,
    requestedDepartment: string | null,
    beforeDepartment: string | null,
    afterDepartment: string | null,
    beforeApproved: boolean,
    afterApproved: boolean,
  ],
) =>
  db.query(
    `INSERT INTO staff_decisions
     (command_id, target_id, actor_id, target_full_name, target_email,
      actor_full_name, actor_role, actor_status, actor_email_verified_at,
      operation, action, requested_department, before_version, after_version,
      before_status, after_status, before_department, after_department,
      before_approved_at, after_approved_at, before_approved_by_id,
      after_approved_by_id, occurred_at)
   SELECT gen_random_uuid(), target.id, actor.id, target.full_name, target.email,
          actor.full_name, 'ADMIN', 'ACTIVE', actor.email_verified_at,
          $1::staff_operation, $2::staff_decision_action, $5::department, 0, 1,
          $3::user_status, $4::user_status, $6::department, $7::department,
          CASE WHEN $8::boolean THEN actor.email_verified_at END,
          CASE WHEN $9::boolean THEN actor.email_verified_at END,
          CASE WHEN $8::boolean THEN actor.id END,
          CASE WHEN $9::boolean THEN actor.id END, CURRENT_TIMESTAMP
     FROM users AS target CROSS JOIN users AS actor
    WHERE target.email = 'transition-target@example.com'
      AND actor.email = 'transition-admin@example.com'`,
    [...transition],
  );

const seedTransitionAccounts = (client: Client) =>
  client.query(
    `INSERT INTO users
     (email, password_hash, full_name, role, status, email_verified_at, updated_at)
   VALUES
     ('transition-admin@example.com', 'test-hash', 'Transition Admin',
      'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
     ('transition-target@example.com', 'test-hash', 'Transition Target',
      'USER', 'PENDING_APPROVAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  );

const invalidTransitions = [
  [
    "APPROVE",
    "APPROVE",
    "PENDING_APPROVAL",
    "ACTIVE",
    "SALES",
    null,
    null,
    false,
    true,
  ],
  [
    "SUSPEND",
    "SUSPEND",
    "ACTIVE",
    "SUSPENDED",
    null,
    "SALES",
    "SALES",
    true,
    false,
  ],
  [
    "APPROVE",
    "SUSPEND",
    "ACTIVE",
    "SUSPENDED",
    "SALES",
    "SALES",
    "SALES",
    true,
    true,
  ],
] as const;

describe("fresh staff access migration", () => {
  it("creates exactly the required application tables, columns, and indexes", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const tables = await pool.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND table_name <> '_prisma_migrations'
          ORDER BY table_name`,
      );
      expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
        "customers",
        "initial_administrator_provisioning",
        "refresh_tokens",
        "sales_commands",
        "sales_draft_pieces",
        "sales_drafts",
        "staff_decisions",
        "users",
      ]);

      const columns = await pool.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('users', 'refresh_tokens')
          ORDER BY table_name, ordinal_position`,
      );
      const userColumns = columns.rows
        .filter(({ table_name }) => table_name === "users")
        .map(({ column_name }) => column_name);
      const refreshTokenColumns = columns.rows
        .filter(({ table_name }) => table_name === "refresh_tokens")
        .map(({ column_name }) => column_name);
      expect(userColumns).toEqual([
        "id",
        "email",
        "password_hash",
        "full_name",
        "phone",
        "role",
        "status",
        "email_verified_at",
        "verification_token_hash",
        "verification_token_expires_at",
        "reset_token_hash",
        "reset_token_expires_at",
        "created_at",
        "updated_at",
        "department",
        "staff_approved_at",
        "staff_approved_by_id",
        "access_version",
      ]);
      expect(refreshTokenColumns).toEqual([
        "id",
        "user_id",
        "token_hash",
        "expires_at",
        "created_at",
      ]);

      const indexes = await pool.query<{ indexname: string }>(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (
              'users_status_role_idx',
              'users_created_id_idx',
              'users_role_status_created_id_idx',
              'refresh_tokens_user_idx',
              'refresh_tokens_expiry_idx',
              'staff_decisions_command_id_key',
              'staff_decisions_target_version_key',
              'staff_decisions_target_occurred_id_idx',
              'initial_administrator_provisioning_target_id_key'
            )
          ORDER BY indexname`,
      );
      expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
        "initial_administrator_provisioning_target_id_key",
        "refresh_tokens_expiry_idx",
        "refresh_tokens_user_idx",
        "staff_decisions_command_id_key",
        "staff_decisions_target_occurred_id_idx",
        "staff_decisions_target_version_key",
        "users_created_id_idx",
        "users_role_status_created_id_idx",
        "users_status_role_idx",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("creates exactly the required enum labels and types", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const enums = await pool.query<{
        typname: string;
        enumlabel: string;
      }>(
        `SELECT t.typname, e.enumlabel
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname IN (
            'user_role',
            'user_status',
            'department',
            'staff_operation',
            'staff_decision_action',
            'sales_order_type', 'sales_draft_status', 'sales_command_operation'
          )
          ORDER BY t.typname, e.enumsortorder`,
      );
      const grouped = new Map<string, string[]>();
      for (const { typname, enumlabel } of enums.rows) {
        grouped.set(typname, [...(grouped.get(typname) ?? []), enumlabel]);
      }
      expect(grouped.get("sales_order_type")).toEqual([
        "SHOP",
        "EXTERNAL",
        "REPAIR",
        "GIFT",
        "READY",
        "ACCESSORY",
        "ADJUSTMENT",
      ]);
      expect(grouped.get("sales_draft_status")).toEqual(["DRAFT"]);
      expect(grouped.get("sales_command_operation")).toEqual([
        "CREATE_CUSTOMER",
        "UPDATE_CUSTOMER",
        "CREATE_DRAFT",
        "SAVE_DRAFT",
      ]);
      expect(grouped.get("user_role")?.slice().sort()).toEqual([
        "ADMIN",
        "USER",
      ]);
      // Enum labels are appended by the forward migration, so the set is asserted
      // rather than the physical label order.
      expect(grouped.get("user_status")?.slice().sort()).toEqual([
        "ACTIVE",
        "PENDING_APPROVAL",
        "PENDING_VERIFICATION",
        "REJECTED",
        "SUSPENDED",
      ]);
      expect(grouped.get("department")?.slice().sort()).toEqual([
        "APPROVAL",
        "CUTTING",
        "PRODUCTION",
        "QUALITY",
        "SALES",
        "WAREHOUSE",
      ]);
      expect(grouped.get("staff_operation")?.slice().sort()).toEqual([
        "APPROVE",
        "CHANGE_DEPARTMENT",
        "REACTIVATE",
        "REJECT",
        "SUSPEND",
      ]);
      expect(grouped.get("staff_decision_action")?.slice().sort()).toEqual([
        "APPROVE",
        "CHANGE_DEPARTMENT",
        "PREPARE_APPROVAL",
        "REACTIVATE",
        "RECONSIDER",
        "REJECT",
        "SUSPEND",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("starts with no initial administrator receipt and no retained decision", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const receipts = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM initial_administrator_provisioning`,
      );
      expect(receipts.rows[0]?.count).toBe("0");

      const decisions = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM staff_decisions`,
      );
      expect(decisions.rows[0]?.count).toBe("0");
    } finally {
      await pool.end();
    }
  });

  it("cascades refresh records and deploys idempotently", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const deleteRule = await pool.query<{ delete_rule: string }>(
        `SELECT delete_rule
           FROM information_schema.referential_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'refresh_tokens_user_id_fkey'`,
      );
      expect(deleteRule.rows[0]?.delete_rule).toBe("CASCADE");
    } finally {
      await pool.end();
    }

    const { stdout, stderr } = await runPrisma(
      ["migrate", "deploy"],
      databaseUrl(),
    );
    expect(`${stdout}${stderr}`).toMatch(
      /No pending migrations|already in sync/iu,
    );
  });

  it("installs exactly the approved user checks and enforces their data rules", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const constraints = await pool.query<{ conname: string }>(
        `SELECT conname
           FROM pg_constraint
          WHERE conrelid = 'public.users'::regclass
            AND contype = 'c'
          ORDER BY conname`,
      );
      expect(constraints.rows.map(({ conname }) => conname)).toEqual([
        "ck_users_access_version_nonnegative",
        "ck_users_email_normalized",
        "ck_users_staff_access_consistent",
        "ck_users_staff_approval_pair",
        "ck_users_status_timestamps_consistent",
        "ck_users_verification_state_consistent",
      ]);

      const insert = async (
        email: string,
        status:
          | "ACTIVE"
          | "PENDING_VERIFICATION"
          | "PENDING_APPROVAL"
          | "REJECTED"
          | "SUSPENDED",
        verifiedAt: Date | null,
        overrides: {
          role?: "USER" | "ADMIN";
          department?: string | null;
          staffApprovedAt?: Date | null;
          staffApprovedById?: string | null;
          accessVersion?: number;
        } = {},
      ) => {
        const role = overrides.role ?? "USER";
        const department = overrides.department ?? null;
        const staffApprovedAt = overrides.staffApprovedAt ?? null;
        const staffApprovedById = overrides.staffApprovedById ?? null;
        const accessVersion = overrides.accessVersion ?? 0;
        return pool.query(
          `INSERT INTO users
             (email, password_hash, full_name, role, status, email_verified_at,
              department, staff_approved_at, staff_approved_by_id, access_version, updated_at)
           VALUES ($1, $2, $3, $4::user_role, $5::user_status, $6,
                   $7::department, $8, $9::uuid, $10, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            email,
            "argon2-test-hash",
            "Migration User",
            role,
            status,
            verifiedAt,
            department,
            staffApprovedAt,
            staffApprovedById,
            accessVersion,
          ],
        );
      };

      await expect(
        insert(" Uppercase@example.com ", "PENDING_VERIFICATION", null),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insert("active-unverified@example.com", "ACTIVE", null),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insert(
          "verified-pending@example.com",
          "PENDING_VERIFICATION",
          new Date(),
        ),
      ).rejects.toMatchObject({ code: "23514" });

      const pending = await insert(
        "pending@example.com",
        "PENDING_VERIFICATION",
        null,
      );
      const pendingApproval = await insert(
        "pending-approval@example.com",
        "PENDING_APPROVAL",
        new Date(),
      );
      const rejected = await insert(
        "rejected@example.com",
        "REJECTED",
        new Date(),
      );
      expect(pending.rowCount).toBe(1);
      expect(pendingApproval.rowCount).toBe(1);
      expect(rejected.rowCount).toBe(1);

      // An active employee without an assignment is no longer a valid state.
      await expect(
        insert("active-unassigned@example.com", "ACTIVE", new Date()),
      ).rejects.toMatchObject({ code: "23514" });
      // An administrator may never carry employee assignment fields.
      await expect(
        insert("admin-department@example.com", "ACTIVE", new Date(), {
          role: "ADMIN",
          department: "SALES",
          staffApprovedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      // An administrator may never use an employee review state.
      await expect(
        insert("admin-review@example.com", "REJECTED", new Date(), {
          role: "ADMIN",
        }),
      ).rejects.toMatchObject({ code: "23514" });
      // The approval pair is atomic: an approval time without its actor is invalid.
      await expect(
        insert("half-approved@example.com", "ACTIVE", new Date(), {
          department: "SALES",
          staffApprovedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "23514" });
      // The authority version may never be negative.
      await expect(
        insert("negative-version@example.com", "PENDING_APPROVAL", new Date(), {
          accessVersion: -1,
        }),
      ).rejects.toMatchObject({ code: "23514" });

      await pool.query(
        `DELETE FROM users
          WHERE email IN (
            'pending@example.com',
            'pending-approval@example.com',
            'rejected@example.com'
          )`,
      );
    } finally {
      await pool.end();
    }
  });

  it("accepts a fully assigned active employee and a verified administrator", async () => {
    const pool = new Pool({ connectionString: databaseUrl() });
    try {
      const administrator = await pool.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, full_name, role, status, email_verified_at, updated_at)
         VALUES ('admin-valid@example.com', 'argon2-test-hash', 'Admin',
                 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
      );
      const employee = await pool.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, full_name, role, status, email_verified_at,
            department, staff_approved_at, staff_approved_by_id, updated_at)
         VALUES ('employee-valid@example.com', 'argon2-test-hash', 'Employee',
                 'USER', 'ACTIVE', CURRENT_TIMESTAMP, 'SALES', CURRENT_TIMESTAMP,
                 $1::uuid, CURRENT_TIMESTAMP)
         RETURNING id`,
        [administrator.rows[0]?.id],
      );
      expect(employee.rows[0]?.id).toBeDefined();

      const stored = await pool.query<{
        department: string | null;
        access_version: number;
      }>(`SELECT department, access_version FROM users WHERE id = $1::uuid`, [
        employee.rows[0]?.id,
      ]);
      expect(stored.rows[0]?.department).toBe("SALES");
      expect(stored.rows[0]?.access_version).toBe(0);

      // A referenced historical approver cannot be deleted.
      await expect(
        pool.query(`DELETE FROM users WHERE id = $1::uuid`, [
          administrator.rows[0]?.id,
        ]),
      ).rejects.toMatchObject({ code: "23001" });

      await pool.query(
        `DELETE FROM users WHERE email = 'employee-valid@example.com'`,
      );
      await pool.query(
        `DELETE FROM users WHERE email = 'admin-valid@example.com'`,
      );
    } finally {
      await pool.end();
    }
  });

  it("requires a true transition and binds each action to its operation", async () => {
    const client = new Client({ connectionString: databaseUrl() });
    await client.connect();
    try {
      await client.query("BEGIN");
      await seedTransitionAccounts(client);
      const accounts = await client.query("SELECT * FROM users ORDER BY id");
      const validTransitions = [
        [
          "APPROVE",
          "APPROVE",
          "PENDING_APPROVAL",
          "ACTIVE",
          "SALES",
          null,
          "SALES",
          false,
          true,
        ],
        [
          "APPROVE",
          "RECONSIDER",
          "REJECTED",
          "ACTIVE",
          "SALES",
          null,
          "SALES",
          false,
          true,
        ],
        [
          "APPROVE",
          "PREPARE_APPROVAL",
          "SUSPENDED",
          "SUSPENDED",
          "SALES",
          null,
          "SALES",
          false,
          true,
        ],
        [
          "REJECT",
          "REJECT",
          "PENDING_APPROVAL",
          "REJECTED",
          null,
          null,
          null,
          false,
          false,
        ],
        [
          "CHANGE_DEPARTMENT",
          "CHANGE_DEPARTMENT",
          "ACTIVE",
          "ACTIVE",
          "CUTTING",
          "SALES",
          "CUTTING",
          true,
          true,
        ],
        [
          "SUSPEND",
          "SUSPEND",
          "ACTIVE",
          "SUSPENDED",
          null,
          "SALES",
          "SALES",
          true,
          true,
        ],
        [
          "REACTIVATE",
          "REACTIVATE",
          "SUSPENDED",
          "ACTIVE",
          null,
          "SALES",
          "SALES",
          true,
          true,
        ],
      ] as const;
      for (const transition of validTransitions) {
        await client.query("SAVEPOINT transition_attempt");
        expect((await insertTransition(client, transition)).rowCount).toBe(1);
        await client.query("ROLLBACK TO SAVEPOINT transition_attempt");
        await client.query("RELEASE SAVEPOINT transition_attempt");
      }
      for (const transition of invalidTransitions) {
        await client.query("SAVEPOINT transition_attempt");
        await expect(
          insertTransition(client, transition),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "ck_staff_decisions_transition",
        });
        await client.query("ROLLBACK TO SAVEPOINT transition_attempt");
        await client.query("RELEASE SAVEPOINT transition_attempt");
      }
      expect(
        (await client.query("SELECT * FROM staff_decisions")).rows,
      ).toEqual([]);
      expect(
        (await client.query("SELECT * FROM users ORDER BY id")).rows,
      ).toEqual(accounts.rows);
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        await client.end();
      }
    }
  });

  it("keeps the retained history and the initial administrator receipt append-only", async () => {
    const client = new Client({ connectionString: databaseUrl() });
    await client.connect();
    const readHistory = async () => ({
      decisions: (
        await client.query<{ snapshot: unknown }>(
          "SELECT to_jsonb(d) AS snapshot FROM staff_decisions AS d ORDER BY id",
        )
      ).rows,
      receipts: (
        await client.query<{ snapshot: unknown }>(
          "SELECT to_jsonb(r) AS snapshot FROM initial_administrator_provisioning AS r ORDER BY id",
        )
      ).rows,
    });
    const expectRejected = async (
      statement: () => Promise<unknown>,
      violation: { code: string; constraint?: string },
    ) => {
      await client.query("SAVEPOINT rejected_statement");
      try {
        await expect(statement()).rejects.toMatchObject(violation);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT rejected_statement");
        await client.query("RELEASE SAVEPOINT rejected_statement");
      }
    };
    try {
      const before = await readHistory();
      let fixtureIds: string[];
      await client.query("BEGIN");
      try {
        const administrator = await client.query<{ id: string }>(
          `INSERT INTO users
           (email, password_hash, full_name, role, status, email_verified_at, updated_at)
         VALUES ('history-admin@example.com', 'argon2-test-hash', 'History Admin',
                 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        );
        const target = await client.query<{ id: string }>(
          `INSERT INTO users
           (email, password_hash, full_name, role, status, email_verified_at, updated_at)
         VALUES ('history-target@example.com', 'argon2-test-hash', 'History Target',
                 'USER', 'PENDING_APPROVAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        );
        const administratorId = administrator.rows[0]?.id;
        const targetId = target.rows[0]?.id;
        if (administratorId === undefined || targetId === undefined) {
          throw new Error("The history fixtures were not inserted.");
        }
        fixtureIds = [administratorId, targetId];

        const decision = await client.query<{ id: string }>(
          `INSERT INTO staff_decisions
           (command_id, target_id, actor_id, target_full_name, target_email,
            actor_full_name, actor_role, actor_status, actor_email_verified_at,
            operation, action, requested_department, before_version, after_version,
            before_status, after_status, before_department, after_department,
            before_approved_at, after_approved_at, before_approved_by_id,
            after_approved_by_id, occurred_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'History Target', 'history-target@example.com',
                 'History Admin', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP,
                 'APPROVE', 'APPROVE', 'SALES', 0, 1,
                 'PENDING_APPROVAL', 'ACTIVE', NULL, 'SALES',
                 NULL, CURRENT_TIMESTAMP, NULL, $3::uuid, CURRENT_TIMESTAMP)
         RETURNING id`,
          ["99999999-9999-4999-8999-999999999999", targetId, administratorId],
        );
        expect(decision.rows[0]?.id).toBeDefined();

        await expectRejected(
          () =>
            client.query(
              `UPDATE staff_decisions SET actor_full_name = 'Changed' WHERE id = $1::uuid`,
              [decision.rows[0]?.id],
            ),
          { code: "23001" },
        );
        await expectRejected(
          () =>
            client.query(`DELETE FROM staff_decisions WHERE id = $1::uuid`, [
              decision.rows[0]?.id,
            ]),
          { code: "23001" },
        );

        const receipt = await client.query<{ id: string }>(
          `INSERT INTO initial_administrator_provisioning
           (id, target_id, operator_reference, occurred_at, before_version, after_version)
         VALUES ('INITIAL_ADMIN', $1::uuid, 'operator-1', CURRENT_TIMESTAMP, 0, 1)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
          [targetId],
        );
        expect(receipt.rows.map(({ id }) => id)).toEqual(
          before.receipts.length === 0 ? ["INITIAL_ADMIN"] : [],
        );

        await expectRejected(
          () =>
            client.query(
              `UPDATE initial_administrator_provisioning
              SET operator_reference = 'operator-2'
            WHERE id = 'INITIAL_ADMIN'`,
            ),
          { code: "23001" },
        );

        // The receipt is a singleton: a second receipt is refused.
        await expectRejected(
          () =>
            client.query(
              `INSERT INTO initial_administrator_provisioning
             (id, target_id, operator_reference, occurred_at, before_version, after_version)
           VALUES ('INITIAL_ADMIN', $1::uuid, 'operator-3', CURRENT_TIMESTAMP, 1, 2)`,
              [administratorId],
            ),
          {
            code: "23505",
            constraint: "initial_administrator_provisioning_pkey",
          },
        );
        // Only the literal singleton identifier is permitted.
        await expectRejected(
          () =>
            client.query(
              `INSERT INTO initial_administrator_provisioning
             (id, target_id, operator_reference, occurred_at, before_version, after_version)
           VALUES ('OTHER', $1::uuid, 'operator-3', CURRENT_TIMESTAMP, 1, 2)`,
              [administratorId],
            ),
          { code: "23514", constraint: "ck_initial_admin_singleton" },
        );
        // A blank operator reference is refused.
        await expectRejected(
          () =>
            client.query(
              `INSERT INTO initial_administrator_provisioning
             (id, target_id, operator_reference, occurred_at, before_version, after_version)
           VALUES ('INITIAL_ADMIN', $1::uuid, '   ', CURRENT_TIMESTAMP, 1, 2)`,
              [administratorId],
            ),
          { code: "23514", constraint: "ck_initial_admin_operator_reference" },
        );

        const receiptCount = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM initial_administrator_provisioning`,
        );
        expect(receiptCount.rows[0]?.count).toBe("1");

        expect((await readHistory()).decisions).toHaveLength(
          before.decisions.length + 1,
        );
      } finally {
        await client.query("ROLLBACK");
      }

      const fixtures = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = ANY($1::uuid[])",
        [fixtureIds],
      );
      expect(fixtures.rows).toEqual([]);
      expect(await readHistory()).toEqual(before);
    } finally {
      await client.end();
    }
  });
});

describe("populated upgrade to the staff access migration", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let containerUri: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4")
      .withDatabase("template_upgrade")
      .withUsername("template_test")
      .withPassword("test-only-password")
      .withStartupTimeout(120_000)
      .start();
    containerUri = container.getConnectionUri();
  }, 300_000);

  afterAll(async () => {
    await container?.stop();
  });

  const createDatabase = async (name: string): Promise<string> => {
    const client = new Client({ connectionString: containerUri });
    await client.connect();
    try {
      await client.query(`CREATE DATABASE "${name}"`);
    } finally {
      await client.end();
    }
    const url = new URL(containerUri);
    url.pathname = `/${name}`;
    return url.toString();
  };

  const applyInitialMigration = async (
    ownedDatabaseUrl: string,
  ): Promise<void> => {
    const client = new Client({ connectionString: ownedDatabaseUrl });
    await client.connect();
    try {
      await client.query(initialMigrationSql);
    } finally {
      await client.end();
    }
  };

  it("preserves identities and credentials while deferring employee approval", async () => {
    const ownedDatabaseUrl = await createDatabase("upgrade_ok");
    await applyInitialMigration(ownedDatabaseUrl);
    await runPrisma(
      ["migrate", "resolve", "--applied", "20260818000000_init_authentication"],
      ownedDatabaseUrl,
    );

    const seed = new Client({ connectionString: ownedDatabaseUrl });
    await seed.connect();
    try {
      await seed.query(
        `INSERT INTO users
           (id, email, password_hash, full_name, phone, role, status,
            email_verified_at, created_at, updated_at)
         VALUES
           ('11111111-1111-4111-8111-111111111111', 'active.user@example.com',
            'hash-active', 'Active Legacy', '+201', 'USER', 'ACTIVE',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('22222222-2222-4222-8222-222222222222', 'pending.user@example.com',
            'hash-pending', 'Pending Legacy', NULL, 'USER', 'PENDING_VERIFICATION',
            NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('33333333-3333-4333-8333-333333333333', 'suspended.user@example.com',
            'hash-suspended', 'Suspended Legacy', NULL, 'USER', 'SUSPENDED',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('44444444-4444-4444-8444-444444444444', 'admin@example.com',
            'hash-admin', 'Legacy Admin', NULL, 'ADMIN', 'ACTIVE',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('55555555-5555-4555-8555-555555555555', 'verified.pending@example.com',
            'hash-verified-pending', 'Verified Legacy', '+202', 'USER', 'PENDING_VERIFICATION',
            '2026-10-01T09:00:00Z', '2026-09-30T09:00:00Z', '2026-10-01T10:00:00Z')`,
      );
      await seed.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ('55555555-5555-4555-8555-555555555555', repeat('a', 64),
                 CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      );
    } finally {
      await seed.end();
    }

    await runPrisma(["migrate", "deploy"], ownedDatabaseUrl);

    const pool = new Pool({ connectionString: ownedDatabaseUrl });
    try {
      const rows = await pool.query<{
        email: string;
        role: string;
        status: string;
        verified: boolean;
        department: string | null;
        approved: boolean;
        access_version: number;
        password_hash: string;
        full_name: string;
        phone: string | null;
      }>(
        `SELECT email, role::text AS role, status::text AS status,
                (email_verified_at IS NOT NULL) AS verified,
                department::text AS department,
                (staff_approved_at IS NOT NULL) AS approved,
                access_version, password_hash, full_name, phone
           FROM users
          ORDER BY email`,
      );
      const byEmail = new Map(rows.rows.map((row) => [row.email, row]));

      // A verified, non-suspended employee awaits explicit approval and stays unassigned.
      expect(byEmail.get("active.user@example.com")).toMatchObject({
        role: "USER",
        status: "PENDING_APPROVAL",
        verified: true,
        department: null,
        approved: false,
        access_version: 0,
        password_hash: "hash-active",
        full_name: "Active Legacy",
        phone: "+201",
      });
      expect(byEmail.get("pending.user@example.com")).toMatchObject({
        status: "PENDING_VERIFICATION",
        verified: false,
        department: null,
        approved: false,
      });
      expect(byEmail.get("suspended.user@example.com")).toMatchObject({
        status: "SUSPENDED",
        verified: true,
        department: null,
        approved: false,
      });
      // A valid administrator keeps its role, state and verification.
      expect(byEmail.get("admin@example.com")).toMatchObject({
        role: "ADMIN",
        status: "ACTIVE",
        verified: true,
        department: null,
        approved: false,
        access_version: 0,
        password_hash: "hash-admin",
      });

      const repaired = await pool.query(
        `SELECT id, role, status, email_verified_at, created_at, updated_at,
                department, staff_approved_at, staff_approved_by_id,
                access_version, password_hash, full_name, phone
           FROM users WHERE email = 'verified.pending@example.com'`,
      );
      expect(repaired.rows).toEqual([
        {
          id: "55555555-5555-4555-8555-555555555555",
          role: "USER",
          status: "PENDING_APPROVAL",
          email_verified_at: new Date("2026-10-01T09:00:00Z"),
          created_at: new Date("2026-09-30T09:00:00Z"),
          updated_at: new Date("2026-10-01T10:00:00Z"),
          department: null,
          staff_approved_at: null,
          staff_approved_by_id: null,
          access_version: 0,
          password_hash: "hash-verified-pending",
          full_name: "Verified Legacy",
          phone: "+202",
        },
      ]);
      const refreshTokens = await pool.query(
        `SELECT user_id, token_hash FROM refresh_tokens`,
      );
      expect(refreshTokens.rows).toEqual([
        {
          user_id: "55555555-5555-4555-8555-555555555555",
          token_hash: "a".repeat(64),
        },
      ]);

      // The migration never fabricates an approval or a staff decision.
      const decisions = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM staff_decisions`,
      );
      expect(decisions.rows[0]?.count).toBe("0");
      const receipts = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM initial_administrator_provisioning`,
      );
      expect(receipts.rows[0]?.count).toBe("0");
    } finally {
      await pool.end();
    }
  }, 300_000);

  const applyOriginalP01 = async (client: Client, ownedDatabaseUrl: string) => {
    for (const name of originalMigrationNames) {
      await client.query(migrationSql(name));
      await runPrisma(
        ["migrate", "resolve", "--applied", name],
        ownedDatabaseUrl,
      );
    }
  };

  it("rolls back the stronger check when retained history violates it", async () => {
    const ownedDatabaseUrl = await createDatabase("upgrade_invalid_history");
    const client = new Client({ connectionString: ownedDatabaseUrl });
    await client.connect();
    try {
      await applyOriginalP01(client, ownedDatabaseUrl);
      await seedTransitionAccounts(client);
      expect(
        (await insertTransition(client, invalidTransitions[0])).rowCount,
      ).toBe(1);
      const decisions = () =>
        client.query("SELECT * FROM staff_decisions ORDER BY id");
      const check = () =>
        client.query(
          `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conrelid = 'staff_decisions'::regclass
            AND conname = 'ck_staff_decisions_transition'`,
        );
      const before = await decisions();
      const oldCheck = await check();
      expect(oldCheck.rows).toHaveLength(1);
      await expect(
        runPrisma(["migrate", "deploy"], ownedDatabaseUrl),
      ).rejects.toThrow();
      expect((await check()).rows).toEqual(oldCheck.rows);
      expect((await decisions()).rows).toEqual(before.rows);
      const failure = await client.query(
        `SELECT migration_name FROM _prisma_migrations
          WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
      );
      expect(failure.rows).toEqual([
        {
          migration_name: "20261104000100_enforce_staff_decision_transitions",
        },
      ]);
    } finally {
      await client.end();
    }
  }, 300_000);

  it("adds the repair without rewriting applied P01 history or populated accounts", async () => {
    const ownedDatabaseUrl = await createDatabase("upgrade_applied");
    const client = new Client({ connectionString: ownedDatabaseUrl });
    await client.connect();
    try {
      await applyOriginalP01(client, ownedDatabaseUrl);
      const ledger = () =>
        client.query<{ checksum: string }>(
          `SELECT * FROM _prisma_migrations WHERE migration_name = ANY($1)
           ORDER BY migration_name`,
          [originalMigrationNames],
        );
      const before = await ledger();
      expect(before.rows.map(({ checksum }) => checksum)).toEqual(
        originalMigrationNames.map((name) =>
          createHash("sha256").update(migrationSql(name)).digest("hex"),
        ),
      );
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, status,
                             email_verified_at, updated_at)
          VALUES ('applied@example.com', 'retained-hash', 'Existing Account',
                  'USER', 'REJECTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
      const stored = () => client.query("SELECT * FROM users ORDER BY id");
      const accounts = await stored();
      await runPrisma(["migrate", "deploy"], ownedDatabaseUrl);
      expect((await stored()).rows).toEqual(accounts.rows);
      expect((await ledger()).rows).toEqual(before.rows);
      const repair = await client.query<{ finished_at: Date | null }>(
        `SELECT finished_at FROM _prisma_migrations
          WHERE migration_name = '20261103000150_repair_legacy_verified_users'`,
      );
      expect(repair.rows).toHaveLength(1);
      expect(repair.rows[0]?.finished_at).toBeInstanceOf(Date);
    } finally {
      await client.end();
    }
  }, 300_000);

  it("fails atomically and changes nothing for a contradictory legacy administrator", async () => {
    const ownedDatabaseUrl = await createDatabase("upgrade_anomaly");
    await applyInitialMigration(ownedDatabaseUrl);
    await runPrisma(
      ["migrate", "resolve", "--applied", "20260818000000_init_authentication"],
      ownedDatabaseUrl,
    );

    const seed = new Client({ connectionString: ownedDatabaseUrl });
    await seed.connect();
    try {
      await seed.query(
        `INSERT INTO users
           (id, email, password_hash, full_name, role, status,
            email_verified_at, created_at, updated_at)
         VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anomaly.admin@example.com',
                 'hash-anomaly', 'Anomaly Admin', 'ADMIN', 'PENDING_VERIFICATION',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
                ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'otherwise.repairable@example.com',
                 'hash-legacy', 'Legacy Employee', 'USER', 'PENDING_VERIFICATION',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    } finally {
      await seed.end();
    }

    await expect(
      runPrisma(["migrate", "deploy"], ownedDatabaseUrl),
    ).rejects.toThrow(/preflight failed/u);

    const pool = new Pool({ connectionString: ownedDatabaseUrl });
    try {
      // The failing migration left no column, table, constraint or trigger behind.
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name IN ('department', 'staff_approved_at',
                                'staff_approved_by_id', 'access_version')`,
      );
      expect(columns.rows).toEqual([]);

      const tables = await pool.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('staff_decisions', 'initial_administrator_provisioning')`,
      );
      expect(tables.rows).toEqual([]);

      // The contradictory legacy identity is untouched and still needs operator review.
      const rows = await pool.query<{
        email: string;
        role: string;
        status: string;
        verified: boolean;
      }>(
        `SELECT email, role::text AS role, status::text AS status,
                (email_verified_at IS NOT NULL) AS verified
           FROM users ORDER BY email`,
      );
      expect(rows.rows).toEqual([
        {
          email: "anomaly.admin@example.com",
          role: "ADMIN",
          status: "PENDING_VERIFICATION",
          verified: true,
        },
        {
          email: "otherwise.repairable@example.com",
          role: "USER",
          status: "PENDING_VERIFICATION",
          verified: true,
        },
      ]);
    } finally {
      await pool.end();
    }
  }, 300_000);
});

describe("P02 additive persistence invariants", () => {
  it("enforces customer, aggregate, identity and retained-command rules without retaining fixtures", async () => {
    const client = new Client({ connectionString: databaseUrl() });
    await client.connect();
    const readCounts = async () =>
      (
        await client.query<{
          customers: string;
          drafts: string;
          pieces: string;
          commands: string;
        }>(`SELECT
      (SELECT count(*) FROM customers) AS customers,
      (SELECT count(*) FROM sales_drafts) AS drafts,
      (SELECT count(*) FROM sales_draft_pieces) AS pieces,
      (SELECT count(*) FROM sales_commands) AS commands`)
      ).rows;
    const before = await readCounts();
    const reject = async (sql: string, code: string, constraint: string) => {
      await client.query("SAVEPOINT p02_invariant");
      try {
        await expect(client.query(sql)).rejects.toMatchObject({
          code,
          constraint,
        });
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT p02_invariant");
        await client.query("RELEASE SAVEPOINT p02_invariant");
      }
    };
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO users (id,email,password_hash,full_name,role,status,email_verified_at,updated_at)
        VALUES ('90000000-0000-4000-8000-000000000001','p02-migration@example.test','synthetic-hash','P02 Admin','ADMIN','ACTIVE',now(),now())`);
      await client.query(`INSERT INTO customers (id,name,phone,created_at,updated_at)
        VALUES ('90000000-0000-4000-8000-000000000002','Customer','+966500000001',now(),now())`);
      await client.query(`INSERT INTO sales_drafts (id,owner_id,customer_id,type,created_at,updated_at)
        VALUES ('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','SHOP',now(),now())`);
      await client.query(`INSERT INTO sales_draft_pieces (id,draft_id,position,created_at,updated_at)
        VALUES ('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000003',1,now(),now())`);
      await client.query(`INSERT INTO sales_commands (command_id,operation,actor_id,actor_full_name,actor_role,draft_id,after_version,payload_hash,"after",occurred_at)
        VALUES ('90000000-0000-4000-8000-000000000005','CREATE_DRAFT','90000000-0000-4000-8000-000000000001','P02 Admin','ADMIN','90000000-0000-4000-8000-000000000003',1,repeat('a',64),'{}',now())`);
      for (const [sql, code, constraint] of [
        [
          "UPDATE customers SET phone = '+201000000001'",
          "23514",
          "ck_customers_phone_saudi",
        ],
        [
          "UPDATE customers SET name = ' '",
          "23514",
          "ck_customers_name_nonblank",
        ],
        [
          "UPDATE customers SET email = 'UPPER@example.test'",
          "23514",
          "ck_customers_email_normalized",
        ],
        ["UPDATE customers SET version = 0", "23514", "ck_customers_version"],
        [
          "UPDATE sales_drafts SET version = 0",
          "23514",
          "ck_sales_drafts_version",
        ],
        [
          "UPDATE sales_drafts SET paid_amount = -1",
          "23514",
          "ck_sales_drafts_paid_amount",
        ],
        [
          "UPDATE sales_draft_pieces SET quantity = 2",
          "23514",
          "ck_sales_draft_pieces_quantity",
        ],
        [
          "UPDATE sales_draft_pieces SET position = 0",
          "23514",
          "ck_sales_draft_pieces_position",
        ],
        [
          "UPDATE sales_drafts SET id = gen_random_uuid()",
          "23514",
          "ck_sales_draft_identity_immutable",
        ],
        [
          "UPDATE sales_drafts SET owner_id = gen_random_uuid()",
          "23514",
          "ck_sales_draft_identity_immutable",
        ],
        [
          "UPDATE sales_draft_pieces SET id = gen_random_uuid()",
          "23514",
          "ck_sales_draft_piece_identity_immutable",
        ],
        [
          "UPDATE sales_draft_pieces SET draft_id = gen_random_uuid()",
          "23514",
          "ck_sales_draft_piece_identity_immutable",
        ],
        [
          "UPDATE sales_commands SET payload_hash = repeat('b',64)",
          "23514",
          "ck_sales_command_immutable",
        ],
        ["DELETE FROM sales_commands", "23514", "ck_sales_command_immutable"],
        [
          "INSERT INTO customers(id,name,phone,created_at,updated_at) VALUES(gen_random_uuid(),'Duplicate','+966500000001',now(),now())",
          "23505",
          "customers_phone_key",
        ],
        [
          "INSERT INTO sales_draft_pieces(id,draft_id,position,created_at,updated_at) VALUES(gen_random_uuid(),'90000000-0000-4000-8000-000000000003',1,now(),now())",
          "23505",
          "sales_draft_pieces_active_position_key",
        ],
        [
          "INSERT INTO sales_commands(command_id,operation,actor_id,actor_full_name,actor_role,customer_id,expected_version,after_version,payload_hash,\"after\",occurred_at) VALUES(gen_random_uuid(),'CREATE_CUSTOMER','90000000-0000-4000-8000-000000000001','P02 Admin','ADMIN','90000000-0000-4000-8000-000000000002',1,1,repeat('a',64),'{}',now())",
          "23514",
          "ck_sales_commands_binding",
        ],
        [
          "INSERT INTO sales_commands(command_id,operation,actor_id,actor_full_name,actor_role,customer_id,after_version,payload_hash,\"after\",occurred_at) VALUES(gen_random_uuid(),'CREATE_CUSTOMER','90000000-0000-4000-8000-000000000001','P02 Admin','ADMIN','90000000-0000-4000-8000-000000000002',1,'BAD','{}',now())",
          "23514",
          "ck_sales_commands_hash",
        ],
      ] as const) {
        await reject(sql, code, constraint);
      }
      await client.query("UPDATE sales_draft_pieces SET removed_at = now()");
      await reject(
        "UPDATE sales_draft_pieces SET removed_at = NULL",
        "23514",
        "ck_sales_draft_piece_identity_immutable",
      );
      await reject(
        "UPDATE sales_draft_pieces SET model = 'changed'",
        "23514",
        "ck_sales_draft_piece_identity_immutable",
      );
      await client.query(
        `INSERT INTO sales_draft_pieces(id,draft_id,position,created_at,updated_at) VALUES(gen_random_uuid(),'90000000-0000-4000-8000-000000000003',1,now(),now())`,
      );
      const retained = await client.query(
        "SELECT count(*)::int AS count FROM sales_draft_pieces",
      );
      expect(retained.rows).toEqual([{ count: 2 }]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    const verify = new Client({ connectionString: databaseUrl() });
    await verify.connect();
    try {
      expect(
        (
          await verify.query(
            `SELECT (SELECT count(*) FROM customers) AS customers,(SELECT count(*) FROM sales_drafts) AS drafts,(SELECT count(*) FROM sales_draft_pieces) AS pieces,(SELECT count(*) FROM sales_commands) AS commands`,
          )
        ).rows,
      ).toEqual(before);
    } finally {
      await verify.end();
    }
  });

  it("upgrades populated P01 with unchanged accounts, history and checksums, then redeploys idempotently", async () => {
    const container = await new PostgreSqlContainer("postgres:18.4")
      .withDatabase("template_p02_upgrade")
      .withUsername("template_test")
      .withPassword("test-only-password")
      .start();
    const uri = container.getConnectionUri();
    const client = new Client({ connectionString: uri });
    try {
      await client.connect();
      const priorNames = [
        "20260818000000_init_authentication",
        "20261103000100_extend_staff_access_enums",
        "20261103000150_repair_legacy_verified_users",
        "20261103000200_staff_access_state_and_history",
        "20261104000100_enforce_staff_decision_transitions",
      ];
      for (const name of priorNames) {
        await client.query(migrationSql(name));
        await runPrisma(["migrate", "resolve", "--applied", name], uri);
      }
      await seedTransitionAccounts(client);
      await insertTransition(client, [
        "APPROVE",
        "APPROVE",
        "PENDING_APPROVAL",
        "ACTIVE",
        "SALES",
        null,
        "SALES",
        false,
        true,
      ]);
      await client.query(
        `UPDATE users SET status='ACTIVE',department='SALES',staff_approved_at=now(),staff_approved_by_id=(SELECT id FROM users WHERE email='transition-admin@example.com'),access_version=1 WHERE email='transition-target@example.com'`,
      );
      await client.query(
        `INSERT INTO refresh_tokens(user_id,token_hash,expires_at) SELECT id,repeat('c',64),now()+interval '1 day' FROM users WHERE email='transition-target@example.com'`,
      );
      const readPrior = async () =>
        (
          await client.query<{
            rows: unknown;
          }>(`SELECT jsonb_agg(row_value ORDER BY row_value::text) AS rows FROM (
        SELECT to_jsonb(u) AS row_value FROM users u UNION ALL SELECT to_jsonb(r) FROM refresh_tokens r UNION ALL SELECT to_jsonb(d) FROM staff_decisions d
      ) preserved`)
        ).rows;
      const readLedger = async () =>
        (
          await client.query<{ checksum: string; [key: string]: unknown }>(
            "SELECT * FROM _prisma_migrations WHERE migration_name = ANY($1) ORDER BY migration_name",
            [priorNames],
          )
        ).rows;
      const prior = await readPrior(),
        ledger = await readLedger();
      expect(ledger.map((row: { checksum: string }) => row.checksum)).toEqual(
        priorNames
          .slice()
          .sort()
          .map((name) =>
            createHash("sha256").update(migrationSql(name)).digest("hex"),
          ),
      );
      await runPrisma(["migrate", "deploy"], uri);
      expect(await readPrior()).toEqual(prior);
      expect(await readLedger()).toEqual(ledger);
      expect(
        (await client.query("SELECT count(*)::int AS count FROM customers"))
          .rows,
      ).toEqual([{ count: 0 }]);
      const applied = (
        await client.query(
          "SELECT * FROM _prisma_migrations ORDER BY migration_name",
        )
      ).rows;
      await runPrisma(["migrate", "deploy"], uri);
      expect(
        (
          await client.query(
            "SELECT * FROM _prisma_migrations ORDER BY migration_name",
          )
        ).rows,
      ).toEqual(applied);
    } finally {
      await client.end();
      await container.stop();
    }
  });
});
