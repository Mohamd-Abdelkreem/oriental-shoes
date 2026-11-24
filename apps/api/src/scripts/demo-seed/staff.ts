import { randomBytes, randomUUID } from "node:crypto";
import {
  authUserDataSchema,
  departmentSchema,
  staffCommandDataSchema,
  staffUserDataSchema,
  type Department,
} from "@template/contracts";
import { DemoSeedError, type DemoRequest } from "./http.js";

const staffNames = {
  SALES: "محمد السالم",
  APPROVAL: "نواف الشمري",
  CUTTING: "حمد الدوسري",
  PRODUCTION: "وليد الحربي",
  QUALITY: "سامي الغامدي",
  WAREHOUSE: "عبدالله القحطاني",
} satisfies Record<Department, string>;

const registration = (name: string, suffix: string, batch: string) => ({
  fullName: name,
  email: `${suffix}.${batch}@demo.oriental.invalid`,
  password: `Demo!${randomBytes(16).toString("hex")}`,
});

export const demoStaffCredentials = (batch: string) => ({
  accounts: Object.fromEntries(
    departmentSchema.options.map((department) => [
      department,
      registration(staffNames[department], department.toLowerCase(), batch),
    ]),
  ) as Record<Department, ReturnType<typeof registration>>,
  pending: registration("فهد السبيعي", "pending", batch),
  unverified: registration("نايف الزهراني", "unverified", batch),
  rejected: registration("عبدالعزيز الدوسري", "rejected", batch),
  suspended: registration("بدر العتيبي", "suspended", batch),
});

export const createDemoStaff = async (
  accounts: ReturnType<typeof demoStaffCredentials>,
  admin: DemoRequest,
  anonymous: DemoRequest,
  verificationLinks: Map<string, string>,
) => {
  const verify = async (email: string) => {
    const link = verificationLinks.get(email);
    const token = link ? new URL(link).searchParams.get("token") : null;
    if (!token) throw new DemoSeedError("Missing local verification token");
    verificationLinks.delete(email);
    return (
      await anonymous(
        `/auth/verify-email?${new URLSearchParams({ token }).toString()}`,
        authUserDataSchema,
        {},
      )
    ).user;
  };
  const enroll = async (
    identity: ReturnType<typeof registration>,
    department: Department,
  ) => {
    await admin("/staff", staffUserDataSchema, { ...identity, department });
    const staff = await verify(identity.email);
    if (staff.status !== "ACTIVE" || staff.department !== department)
      throw new DemoSeedError(`Enrollment did not activate ${department}`);
    return staff;
  };
  for (const department of departmentSchema.options)
    await enroll(accounts.accounts[department], department);

  await anonymous("/auth/register", authUserDataSchema, accounts.unverified);
  await anonymous("/auth/register", authUserDataSchema, accounts.pending);
  await verify(accounts.pending.email);
  await anonymous("/auth/register", authUserDataSchema, accounts.rejected);
  const rejected = await verify(accounts.rejected.email);
  await admin(`/staff/${rejected.id}/reject`, staffCommandDataSchema, {
    commandId: randomUUID(),
    expectedAccessVersion: rejected.accessVersion,
  });
  const suspended = await enroll(accounts.suspended, "WAREHOUSE");
  await admin(`/staff/${suspended.id}/suspend`, staffCommandDataSchema, {
    commandId: randomUUID(),
    expectedAccessVersion: suspended.accessVersion,
  });
};
