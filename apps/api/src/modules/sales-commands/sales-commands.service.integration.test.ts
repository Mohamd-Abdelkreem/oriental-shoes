import { randomUUID } from "node:crypto";
import {
  createDraftBodySchema,
  saveDraftBodySchema,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { SalesDraftsService } from "../sales-drafts/sales-drafts.service.js";
import { SalesCommandExecutor } from "./sales-command-executor.js";
import { SalesCommandsService } from "./sales-commands.service.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri),
  drafts = new SalesDraftsService(database, new SalesCommandExecutor(database)),
  commands = new SalesCommandsService(database);
const admin = randomUUID(),
  secondAdmin = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
const blank = () =>
  createDraftBodySchema.parse({
    commandId: randomUUID(),
    draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
  });
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  const now = new Date();
  for (const id of [admin, secondAdmin])
    await database.user.create({
      data: {
        id,
        email: `receipt-${id}@example.test`,
        fullName: "Admin",
        passwordHash: "synthetic-hash",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: now,
      },
    });
  for (const [id, email] of [
    [a, "receipt-a@example.test"],
    [b, "receipt-b@example.test"],
  ] as const)
    await database.user.create({
      data: {
        id,
        email,
        fullName: email,
        passwordHash: "synthetic-hash",
        status: "ACTIVE",
        emailVerifiedAt: now,
        department: "SALES",
        staffApprovedAt: now,
        staffApprovedById: admin,
      },
    });
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});
it("observes the immutable committed version after a newer save without another write", async () => {
  const input = blank(),
    first = await drafts.create(a, input);
  await drafts.save(
    a,
    first.savedDraft.id,
    saveDraftBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 1,
      draft: { ...input.draft, generalNotes: "later" },
    }),
  );
  const observed = await commands.get(a, input.commandId);
  expect(observed).toMatchObject({
    kind: "draft",
    replayed: true,
    savedDraft: first.savedDraft,
    receipt: first.receipt,
  });
  expect((await drafts.get(a, first.savedDraft.id)).draft.version).toBe(2);
  expect(await database.salesCommand.count()).toBe(2);
});
it("makes absent and another actor's receipt equally missing, including ADMIN", async () => {
  const input = blank();
  await drafts.create(a, input);
  for (const [actorId, id] of [
    [a, randomUUID()],
    [b, input.commandId],
    [admin, input.commandId],
  ] as const)
    await expect(commands.get(actorId, id)).rejects.toMatchObject({
      statusCode: 404,
      code: "SALES_COMMAND_NOT_FOUND",
      message: "The selected command result was not found.",
    });
  expect(await database.salesCommand.count()).toBe(1);
});
it("rechecks current resource visibility for a former ADMIN's own historical command", async () => {
  const input = blank(),
    initial = await drafts.create(b, input);
  const edit = saveDraftBodySchema.parse({
    commandId: randomUUID(),
    expectedVersion: 1,
    draft: { ...input.draft, generalNotes: "ADMIN change" },
  });
  await drafts.save(admin, initial.savedDraft.id, edit);
  expect((await commands.get(admin, edit.commandId)).kind).toBe("draft");
  // A controlled existing-role fixture change proves the receipt's current
  // resource check. It adds no role-changing product endpoint or workflow.
  await database.user.update({
    where: { id: admin },
    data: {
      role: "USER",
      department: "SALES",
      staffApprovedAt: new Date(),
      staffApprovedById: secondAdmin,
      accessVersion: { increment: 1 },
    },
  });
  await expect(commands.get(admin, edit.commandId)).rejects.toMatchObject({
    code: "SALES_COMMAND_NOT_FOUND",
  });
  expect((await drafts.get(b, initial.savedDraft.id)).draft.owner.id).toBe(b);
  expect(await database.salesCommand.count()).toBe(2);
});
it("denies live suspension before observing previously owned data", async () => {
  const input = blank();
  await drafts.create(a, input);
  await database.user.update({
    where: { id: a },
    data: { status: "SUSPENDED" },
  });
  await expect(commands.get(a, input.commandId)).rejects.toMatchObject({
    code: "ACCOUNT_RESTRICTED",
  });
  expect(await database.salesCommand.count()).toBe(1);
});
