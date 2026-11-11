import { ApprovalService } from "../approval/approval.service.js";
import { ApprovalCommandExecutor } from "../approval/approval-command-executor.js";
import { SalesOrdersService } from "../sales-orders/sales-orders.service.js";
import { resubmitOrderBodySchema } from "@template/contracts";
import { createHash, randomUUID } from "node:crypto";
import {
  customerCaptureSchema,
  draftCaptureSchema,
  submissionCaptureSchema,
  type SalesOrderDto,
  type SubmitOrderBody,
  type CustomerCommandData,
  type DraftCommandData,
  type CustomerDto,
  type DraftDto,
} from "@template/contracts";
import {
  createDatabaseClient,
  type Customer,
  type DatabaseClient,
} from "@template/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import {
  SalesCommandExecutor,
  hashSalesCommandIntent,
} from "./sales-command-executor.js";
import type {
  CustomerCommandExecution,
  DraftCommandExecution,
  OrderCommandExecution,
} from "./sales-command.types.js";

import { isSalesTransactionConflict } from "./sales-command.errors.js";
import { SalesCommandsService } from "./sales-commands.service.js";

it("retains one order receipt across replay, later root revisions and private observation", async () => {
  const occurredAt = new Date();
  const customer = await database.customer.create({
    data: {
      name: "Order Customer",
      phone: "+966500000001",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
  });
  const source = await database.catalogSource.create({
    data: {
      sha256: "e".repeat(64),
      worksheet: "isolated synthetic source",
      sourceExtent: "A1:AA942",
      mappingVersion: 1,
      loadedAt: occurredAt,
      loadedByReference: "executor test",
      entryCount: 1874,
      manifest: {},
    },
  });
  const decoration = await database.catalogEntry.create({
    data: {
      sourceId: source.id,
      kind: "decoration",
      sourceCell: "Z3",
      displayValue: "Decoration",
      lookupValue: "decoration",
      position: 1,
      unitPrice: "1800.00",
      priceSourceCell: "AA3",
    },
  });
  const unitPrice = decoration.unitPrice;
  if (unitPrice === null) throw new Error("Missing fixture rate");
  const capture = submissionCaptureSchema.parse({
    type: "SHOP",
    customerId: customer.id,
    pieces: [
      {
        id: randomUUID(),
        model: "SM",
        size: "40",
        leatherBase: "Base",
        decoration: "Decoration",
        face: "Face",
      },
    ],
  });
  const body: SubmitOrderBody = {
    origin: "new",
    commandId: randomUUID(),
    capture,
    expectedCustomerVersion: customer.version,
    reviewedQuote: { sourceId: source.id, fingerprint: "a".repeat(64) },
  };
  const hash = (payload: SubmitOrderBody) =>
    hashSalesCommandIntent({
      operation: "SUBMIT_NEW_ORDER",
      targetId: null,
      expectedVersion: null,
      payload,
    });
  const intent: OrderCommandExecution = {
    kind: "order",
    operation: "SUBMIT_NEW_ORDER",
    actorId: salesId,
    commandId: body.commandId,
    targetId: null,
    expectedVersion: null,
    payloadHash: hash(body),
    work: async (tx, actor, instant) => {
      const id = randomUUID();
      await tx.salesDraft.create({
        data: {
          id,
          ownerId: actor.id,
          customerId: customer.id,
          type: "SHOP",
          status: "SUBMITTED",
          createdAt: instant,
          updatedAt: instant,
        },
      });
      for (const piece of capture.pieces) {
        const { catalogSelections: _selections, ...fields } = piece;
        await tx.salesDraftPiece.create({
          data: {
            ...fields,
            draftId: id,
            position: 1,
            createdAt: instant,
            updatedAt: instant,
          },
        });
      }
      await tx.salesOrder.create({
        data: {
          id,
          businessNumber: "SHOP-2026-0001",
          numberSequence: 1n,
          numberYear: 2026,
          submittedAt: instant,
          submittedById: actor.id,
          ownerFullNameAtSubmission: actor.fullName,
          customerName: customer.name,
          customerPhone: customer.phone,
          catalogSourceId: source.id,
          totalAmount: "1800.00",
          paidAmount: "0.00",
        },
      });
      for (const piece of capture.pieces)
        await tx.salesOrderPiece.create({
          data: {
            id: piece.id,
            orderId: id,
            decorationEntryId: decoration.id,
            priceSourceId: source.id,
            decorationLabel: decoration.displayValue,
            unitPrice,
            priceSourceCell: "AA3",
          },
        });
      const { paidAmount: _initialPaid, ...captured } = capture;
      const after: SalesOrderDto = {
        ...captured,
        id,
        version: 1,
        owner: { id: actor.id, fullName: actor.fullName },
        status: "AWAITING_APPROVAL",
        businessNumber: "SHOP-2026-0001",
        businessYear: 2026,
        sequence: "1",
        customerSnapshot: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
        },
        createdAt: instant.toISOString(),
        updatedAt: instant.toISOString(),
        submittedAt: instant.toISOString(),
        money: {
          total: "1800.00",
          paidAmount: "0.00",
          remainingDue: "1800.00",
          surplus: "0.00",
        },
        counts: {
          original: 1,
          active: 1,
          cancelled: 0,
          received: 0,
          completionPercent: 0,
        },
        approval: {
          approvedAt: null,
          returnDecisionId: null,
          returnedAt: null,
          returnReason: null,
          returnRevision: 0,
        },
        allowedActions: { canResubmit: false, canSetPaid: false },
        pieces: capture.pieces.map((piece) => ({
          ...piece,
          position: 1,
          quantity: 1 as const,
          decorationEntryId: decoration.id,
          catalogSourceId: source.id,
          unitPrice: "1800.00",
          stage: "AWAITING_APPROVAL" as const,
          workState: "INCOMING" as const,
          receivedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        })),
      };
      return { before: null, after };
    },
  };
  const accepted = await executor.execute(intent);
  expect(accepted).toMatchObject({
    kind: "order",
    replayed: false,
    receipt: { beforeVersion: null, afterVersion: 1 },
  });
  await new ApprovalService(
    database,
    new ApprovalCommandExecutor(database),
    "UTC",
  ).returnInitial(adminId, accepted.savedOrder.id, {
    commandId: randomUUID(),
    expectedVersion: 1,
    reason: "Actual return for revision",
    notes: null,
  });
  await new SalesOrdersService(database, executor, "UTC").resubmit(
    salesId,
    accepted.savedOrder.id,
    resubmitOrderBodySchema.parse({
      commandId: randomUUID(),
      expectedVersion: 2,
      corrections: {
        deliveryDate: capture.deliveryDate,
        generalNotes: "Later revision",
        responsibleSignature: capture.responsibleSignature,
        repairNote: capture.repairNote,
        adjustmentRequested: capture.adjustmentRequested,
        adjustmentReason: capture.adjustmentReason,
        adjustmentActionTaken: capture.adjustmentActionTaken,
        pieces: capture.pieces.map(
          ({
            decoration: _decoration,
            catalogSelections: _selections,
            ...piece
          }) => piece,
        ),
      },
    }),
  );
  expect(await executor.execute(intent)).toEqual({
    ...accepted,
    replayed: true,
  });
  const observer = new SalesCommandsService(database);
  expect(await observer.get(salesId, body.commandId)).toEqual({
    ...accepted,
    replayed: true,
  });
  await expect(observer.get(otherId, body.commandId)).rejects.toMatchObject({
    code: "SALES_COMMAND_NOT_FOUND",
  });
  await expect(
    executor.execute({
      ...intent,
      payloadHash: hash({
        ...body,
        expectedCustomerVersion: customer.version + 1,
      }),
    }),
  ).rejects.toMatchObject({ code: "SALES_COMMAND_CONFLICT" });
  expect(await database.salesOrder.count()).toBe(1);
  expect(await database.salesOrderPiece.count()).toBe(1);
  expect(await database.salesCommand.count()).toBe(2);
  expect(await database.approvalCommand.count()).toBe(1);
  expect(
    await database.salesDraft.findUnique({
      where: { id: accepted.savedOrder.id },
      select: { version: true, generalNotes: true },
    }),
  ).toEqual({ version: 3, generalNotes: "Later revision" });
});

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri),
  competitor = createDatabaseClient(uri);
const executor = new SalesCommandExecutor(database),
  secondExecutor = new SalesCommandExecutor(competitor);
const adminId = randomUUID(),
  salesId = randomUUID(),
  otherId = randomUUID();
const mapCustomer = (row: Customer): CustomerDto => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  address: row.address,
  notes: row.notes,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const createIntent = (
  commandId = randomUUID(),
  actorId = salesId,
): CustomerCommandExecution => {
  const payload = customerCaptureSchema.parse({
    name: "Customer",
    phone: "0500000001",
  });
  return {
    kind: "customer",
    operation: "CREATE_CUSTOMER",
    actorId,
    commandId,
    targetId: null,
    expectedVersion: null,
    payloadHash: hashSalesCommandIntent({
      operation: "CREATE_CUSTOMER",
      targetId: null,
      expectedVersion: null,
      payload,
    }),
    work: async (tx, _actor, occurredAt) => ({
      before: null,
      after: mapCustomer(
        await tx.customer.create({
          data: { ...payload, createdAt: occurredAt, updatedAt: occurredAt },
        }),
      ),
    }),
  };
};
const deferred = () => {
  let resolve: () => void = () => {
    throw new Error("Uninitialized barrier");
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const waitForAdvisoryWaiter = async (observer: DatabaseClient) => {
  await expect
    .poll(
      async () => {
        const rows = await observer.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
        return rows[0]?.count ?? 0;
      },
      { timeout: 3000, interval: 10 },
    )
    .toBeGreaterThan(0);
};
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  const now = new Date();
  await database.user.create({
    data: {
      id: adminId,
      email: "p02-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic-hash",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const [id, email] of [
    [salesId, "p02-sales@example.test"],
    [otherId, "p02-other@example.test"],
  ] as const) {
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
        staffApprovedById: adminId,
      },
    });
  }
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
  await competitor.$disconnect();
});

describe("retained sales commands on migrated PostgreSQL", () => {
  it("serializes identical creates before phone uniqueness and returns one retained result", async () => {
    const entered = deferred(),
      release = deferred(),
      input = createIntent();
    const first = executor.execute({
      ...input,
      work: async (tx, actor, occurredAt) => {
        const result = await input.work(tx, actor, occurredAt);
        entered.resolve();
        await release.promise;
        return result;
      },
    });
    let second: Promise<CustomerCommandData> | undefined;
    try {
      await Promise.race([entered.promise, first]);
      second = secondExecutor.execute(input);
      await waitForAdvisoryWaiter(database);
    } finally {
      release.resolve();
      await Promise.allSettled([first, second]);
    }
    const [a, b] = await Promise.all([first, second]);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b).toMatchObject({
      savedCustomer: a.savedCustomer,
      receipt: a.receipt,
    });
    expect(await database.customer.count()).toBe(1);
    expect(await database.salesCommand.count()).toBe(1);
    expect(a.savedCustomer.updatedAt).toBe(a.receipt.occurredAt);
  });
  it("keeps immutable replay after a later revision and rejects changed binding or actor", async () => {
    const input = createIntent();
    const first = await executor.execute(input);
    const id = first.savedCustomer.id,
      patch = { address: "new address" };
    await executor.execute({
      kind: "customer",
      operation: "UPDATE_CUSTOMER",
      actorId: salesId,
      commandId: randomUUID(),
      targetId: id,
      expectedVersion: 1,
      payloadHash: hashSalesCommandIntent({
        operation: "UPDATE_CUSTOMER",
        targetId: id,
        expectedVersion: 1,
        payload: patch,
      }),
      work: async (tx, _actor, occurredAt) => ({
        before: first.savedCustomer,
        after: mapCustomer(
          await tx.customer.update({
            where: { id },
            data: { ...patch, version: 2, updatedAt: occurredAt },
          }),
        ),
      }),
    });
    expect((await executor.execute(input)).savedCustomer.version).toBe(1);
    expect(
      (await database.customer.findUniqueOrThrow({ where: { id } })).version,
    ).toBe(2);
    for (const changed of [
      { ...input, actorId: otherId },
      { ...input, payloadHash: "b".repeat(64) },
      { ...input, targetId: randomUUID() },
    ]) {
      await expect(executor.execute(changed)).rejects.toMatchObject({
        code: "SALES_COMMAND_CONFLICT",
      });
    }
    expect(await database.salesCommand.count()).toBe(2);
  });
  it("rolls back resource writes when the work callback fails", async () => {
    const input = createIntent();
    await expect(
      executor.execute({
        ...input,
        work: async (tx, actor, occurredAt) => {
          await input.work(tx, actor, occurredAt);
          throw new Error("synthetic callback failure");
        },
      }),
    ).rejects.toThrow("synthetic callback failure");
    expect(await database.customer.count()).toBe(0);
    expect(await database.salesCommand.count()).toBe(0);
  });
  it("rechecks current eligibility before replay or new resource work", async () => {
    const input = createIntent();
    await executor.execute(input);
    await database.user.update({
      where: { id: salesId },
      data: { status: "SUSPENDED" },
    });
    await expect(executor.execute(input)).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
    });
    expect(await database.customer.count()).toBe(1);
    expect(await database.salesCommand.count()).toBe(1);
  });
  it("serializes identical draft saves before stale-version checks with one revision and receipt", async () => {
    const capture = draftCaptureSchema.parse({
      type: "SHOP",
      pieces: [{ id: randomUUID() }],
    });
    const created = await executor.execute({
      kind: "draft",
      operation: "CREATE_DRAFT",
      actorId: salesId,
      commandId: randomUUID(),
      targetId: null,
      expectedVersion: null,
      payloadHash: hashSalesCommandIntent({
        operation: "CREATE_DRAFT",
        targetId: null,
        expectedVersion: null,
        payload: capture,
      }),
      work: async (tx, actor, occurredAt) => {
        const draft = await tx.salesDraft.create({
          data: {
            ownerId: actor.id,
            type: "SHOP",
            createdAt: occurredAt,
            updatedAt: occurredAt,
          },
        });
        const piece = capture.pieces[0];
        if (!piece) throw new Error("Missing fixture piece");
        const { catalogSelections: _catalogSelections, ...pieceFields } = piece;
        await tx.salesDraftPiece.create({
          data: {
            ...pieceFields,
            draftId: draft.id,
            position: 1,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          },
        });
        const { customerId, ...header } = capture;
        expect(customerId).toBeNull();
        const after: DraftDto = {
          ...header,
          id: draft.id,
          version: 1,
          status: "DRAFT",
          owner: { id: actor.id, fullName: actor.fullName },
          customer: null,
          pieces: [{ ...piece, position: 1, quantity: 1 }],
          createdAt: occurredAt.toISOString(),
          updatedAt: occurredAt.toISOString(),
          pricing: {
            availability: "unavailable",
            reason: "P03_NOT_IMPLEMENTED",
          },
          submission: { available: false, reason: "P03_NOT_READY" },
        };
        return { before: null, after };
      },
    });
    const entered = deferred(),
      release = deferred(),
      commandId = randomUUID(),
      targetId = created.savedDraft.id;
    const payload = { ...capture, generalNotes: "saved once" };
    const input: DraftCommandExecution = {
      kind: "draft",
      operation: "SAVE_DRAFT",
      actorId: salesId,
      commandId,
      targetId,
      expectedVersion: 1,
      payloadHash: hashSalesCommandIntent({
        operation: "SAVE_DRAFT",
        targetId,
        expectedVersion: 1,
        payload,
      }),
      work: async (tx, _actor, occurredAt) => {
        const changed = await tx.salesDraft.updateMany({
          where: { id: targetId, version: 1 },
          data: {
            generalNotes: payload.generalNotes,
            version: { increment: 1 },
            updatedAt: occurredAt,
          },
        });
        if (changed.count !== 1)
          throw new Error("Unexpected stale callback execution");
        return {
          before: created.savedDraft,
          after: {
            ...created.savedDraft,
            version: 2,
            generalNotes: payload.generalNotes,
            updatedAt: occurredAt.toISOString(),
          },
        };
      },
    };
    const first = executor.execute({
      ...input,
      work: async (tx, actor, occurredAt) => {
        const result = await input.work(tx, actor, occurredAt);
        entered.resolve();
        await release.promise;
        return result;
      },
    });
    let second: Promise<DraftCommandData> | undefined;
    try {
      await Promise.race([entered.promise, first]);
      second = secondExecutor.execute(input);
      await waitForAdvisoryWaiter(database);
    } finally {
      release.resolve();
      await Promise.allSettled([first, second]);
    }
    const [a, b] = await Promise.all([first, second]);
    expect(b).toMatchObject({ replayed: true, savedDraft: a.savedDraft });
    expect(
      (await database.salesDraft.findUniqueOrThrow({ where: { id: targetId } }))
        .version,
    ).toBe(2);
    expect(await database.salesCommand.count()).toBe(2);
    expect(await database.salesDraftPiece.count()).toBe(1);
  });
});

const waitForBlockedUserLock = async () => {
  await expect
    .poll(
      async () => {
        const rows = await database.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%FOR %'`;
        return rows[0]?.count ?? 0;
      },
      { timeout: 3000, interval: 10 },
    )
    .toBeGreaterThan(0);
};

it("denies a domain write when a real actor revocation owns the row lock first", async () => {
  const entered = deferred(),
    release = deferred();
  const revoking = competitor.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${salesId}::uuid FOR UPDATE`;
      await tx.user.update({
        where: { id: salesId },
        data: { status: "SUSPENDED", accessVersion: { increment: 1 } },
      });
      entered.resolve();
      await release.promise;
    },
    { timeout: 10000 },
  );
  const settledRevocation = Promise.allSettled([revoking]);
  let settledWrite: Promise<unknown> = Promise.resolve();
  try {
    await Promise.race([entered.promise, revoking]);
    const writing = executor.execute(createIntent());
    settledWrite = Promise.allSettled([writing]);
    await waitForBlockedUserLock();
    release.resolve();
    await revoking;
    await expect(writing).rejects.toMatchObject({ statusCode: 403 });
    expect(await database.customer.count()).toBe(0);
    expect(await database.salesCommand.count()).toBe(0);
  } finally {
    release.resolve();
    await settledRevocation;
    await settledWrite;
  }
});
it("commits a valid domain write before a later revocation and denies the next write", async () => {
  const entered = deferred(),
    release = deferred(),
    input = createIntent();
  const writing = executor.execute({
    ...input,
    work: async (tx, actor, at) => {
      const result = await input.work(tx, actor, at);
      entered.resolve();
      await release.promise;
      return result;
    },
  });
  const settledWrite = Promise.allSettled([writing]);
  let settledRevocation: Promise<unknown> = Promise.resolve();
  try {
    await Promise.race([entered.promise, writing]);
    const revoking = competitor.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${salesId}::uuid FOR UPDATE`;
        await tx.user.update({
          where: { id: salesId },
          data: { status: "SUSPENDED", accessVersion: { increment: 1 } },
        });
      },
      { timeout: 10000 },
    );
    settledRevocation = Promise.allSettled([revoking]);
    await waitForBlockedUserLock();
    release.resolve();
    const committed = await writing;
    await revoking;
    expect(committed.receipt.actor.id).toBe(salesId);
    await expect(
      executor.execute(createIntent(randomUUID())),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await database.customer.count()).toBe(1);
    expect(await database.salesCommand.count()).toBe(1);
  } finally {
    release.resolve();
    await settledWrite;
    await settledRevocation;
  }
});
it("bounds a real command lock timeout and preserves the untouched graph", async () => {
  const entered = deferred(),
    release = deferred(),
    input = createIntent();
  const hex = createHash("sha256")
    .update(`p02-sales-command:${input.commandId}`)
    .digest("hex")
    .slice(0, 16);
  const key = BigInt.asIntN(64, BigInt(`0x${hex}`)).toString();
  const holding = competitor.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${key}::bigint)`;
      entered.resolve();
      await release.promise;
    },
    { timeout: 15000 },
  );
  const settled = Promise.allSettled([holding]);
  try {
    await Promise.race([entered.promise, holding]);
    await expect(executor.execute(input)).rejects.toMatchObject({
      code: "SALES_TRANSACTION_CONFLICT",
      statusCode: 409,
    });
    expect(await database.customer.count()).toBe(0);
    expect(await database.salesCommand.count()).toBe(0);
  } finally {
    release.resolve();
    await settled;
  }
}, 20000);
it("classifies the real adapter serialization failure without classifying unrelated errors", async () => {
  const entered = deferred(),
    release = deferred();
  const stale = competitor.$transaction(
    async (tx) => {
      await tx.user.findUniqueOrThrow({ where: { id: salesId } });
      entered.resolve();
      await release.promise;
      return tx.user.update({
        where: { id: salesId },
        data: { fullName: "stale" },
      });
    },
    { isolationLevel: "Serializable", timeout: 10000 },
  );
  const settled = Promise.allSettled([stale]);
  try {
    await Promise.race([entered.promise, stale]);
    await database.user.update({
      where: { id: salesId },
      data: { fullName: "winner" },
    });
    release.resolve();
    const [result] = await settled;
    if (result.status !== "rejected")
      throw new Error("Expected real serialization failure");
    const failure: unknown = result.reason;
    expect(isSalesTransactionConflict(failure)).toBe(true);
    expect(isSalesTransactionConflict(new Error("unrelated"))).toBe(false);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: salesId } }))
        .fullName,
    ).toBe("winner");
  } finally {
    release.resolve();
    await settled;
  }
});
