import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import pino from "pino";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import {
  accountResponseSchemas,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  customerCommandDataSchema,
  customerDataSchema,
  customerListDataSchema,
  customerMeasurementsDataSchema,
  customerDraftsDataSchema,
  draftCommandDataSchema,
  draftDataSchema,
  draftListDataSchema,
  draftChangesDataSchema,
  salesCommandDataSchema,
  createDraftBodySchema,
  type DraftCapture,
  type DraftDto,
} from "@template/contracts";
import { createDatabaseClient } from "@template/database";
import { createApp } from "../../app.js";
import { generateHash } from "../../infrastructure/security/password-hasher.js";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const database = createDatabaseClient(uri);
const logs: string[] = [];
const stream = new Writable({
  write(chunk: Buffer, _encoding, done) {
    logs.push(chunk.toString());
    done();
  },
});
const app = createApp({
  database,
  logger: pino({ level: "info" }, stream),
  emailDelivery: {
    provider: "console",
    send: () => Promise.resolve({ providerMessageId: "unused" }),
  },
});
const admin = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  factory = randomUUID(),
  restricted = randomUUID();
const password = "http-owned-password";
let passwordHash: string;
type Session = { token: string; cookie: string; csrf: string };
const envelope = <T>(
  response: Response,
  schema: z.ZodType<T>,
  status = 200,
): T => {
  expect(response.status, response.text).toBe(status);
  const body: unknown = response.body;
  const parsed = successEnvelopeSchema.safeExtend({ data: schema }).parse(body);
  expect(parsed.requestId).toBeTruthy();
  return parsed.data;
};
const error = (response: Response, status: number, code?: string) => {
  expect(response.status, response.text).toBe(status);
  const body: unknown = response.body;
  const parsed = errorEnvelopeSchema.parse(body);
  if (code !== undefined) expect(parsed.code).toBe(code);
  return parsed;
};
const login = async (id: string): Promise<Session> => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: `${id}@example.test`, password, rememberMe: false });
  const data = envelope(response, accountResponseSchemas.authSessionData);
  const headers: unknown = response.headers["set-cookie"];
  const cookies = z.array(z.string()).parse(headers);
  const cookie = cookies
    .map((value) => value.split(";")[0])
    .find((value) => value?.startsWith("csrfToken="));
  if (cookie === undefined) throw new Error("Missing real login CSRF cookie");
  return {
    token: data.tokens.accessToken,
    cookie,
    csrf: decodeURIComponent(cookie.slice("csrfToken=".length)),
  };
};
const auth = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
  Cookie: session.cookie,
  "x-csrf-token": session.csrf,
});
const blank = () =>
  createDraftBodySchema.parse({
    commandId: randomUUID(),
    draft: { type: "SHOP", pieces: [{ id: randomUUID() }] },
  });
const capture = (draft: DraftDto): DraftCapture => ({
  type: draft.type,
  customerId: draft.customer?.id ?? null,
  deliveryDate: draft.deliveryDate,
  generalNotes: draft.generalNotes,
  responsibleSignature: draft.responsibleSignature,
  paidAmount: draft.paidAmount,
  repairNote: draft.repairNote,
  adjustmentRequested: draft.adjustmentRequested,
  adjustmentReason: draft.adjustmentReason,
  adjustmentActionTaken: draft.adjustmentActionTaken,
  pieces: draft.pieces.map((piece) => ({
    id: piece.id,
    model: piece.model,
    size: piece.size,
    leatherBase: piece.leatherBase,
    decoration: piece.decoration,
    decorationColor: piece.decorationColor,
    faceRight: piece.faceRight,
    faceLeft: piece.faceLeft,
    mixing: piece.mixing,
    face: piece.face,
    sole: piece.sole,
    soleAddition: piece.soleAddition,
    soleColor: piece.soleColor,
    additions: piece.additions,
    aField: piece.aField,
    fField: piece.fField,
    sideNotes: piece.sideNotes,
  })),
});
beforeAll(async () => {
  passwordHash = await generateHash(password);
});
beforeEach(async () => {
  await resetOwnedIdentityTestData(database);
  logs.length = 0;
  const now = new Date();
  await database.user.create({
    data: {
      id: admin,
      email: `${admin}@example.test`,
      fullName: "Admin",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  for (const id of [a, b, factory, restricted])
    await database.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        fullName: id,
        passwordHash,
        status: id === restricted ? "PENDING_APPROVAL" : "ACTIVE",
        emailVerifiedAt: now,
        department:
          id === restricted ? null : id === factory ? "PRODUCTION" : "SALES",
        staffApprovedAt: id === restricted ? null : now,
        staffApprovedById: id === restricted ? null : admin,
      },
    });
});
afterAll(async () => {
  await resetOwnedIdentityTestData(database);
  await database.$disconnect();
});

it("commits incomplete drafts over real auth/CSRF HTTP, replaces capture and observes original receipts", async () => {
  const session = await login(a),
    input = blank();
  const first = envelope(
    await request(app)
      .post("/api/v1/sales-drafts")
      .set(auth(session))
      .send(input),
    draftCommandDataSchema,
    201,
  );
  expect(first.savedDraft).toMatchObject({
    version: 1,
    status: "DRAFT",
    customer: null,
    deliveryDate: null,
    pricing: { availability: "unavailable" },
    submission: { available: false },
  });
  const replacement = capture(first.savedDraft);
  replacement.generalNotes = "persistent note";
  replacement.paidAmount = "12.50";
  replacement.deliveryDate = "0001-01-02";
  const replacementPiece = replacement.pieces[0];
  if (replacementPiece === undefined) throw new Error("Expected initial piece");
  replacementPiece.faceRight = "right";
  const save = {
    commandId: randomUUID(),
    expectedVersion: 1,
    draft: replacement,
  };
  const second = envelope(
    await request(app)
      .put(`/api/v1/sales-drafts/${first.savedDraft.id}`)
      .set(auth(session))
      .send(save),
    draftCommandDataSchema,
  );
  expect(second.savedDraft).toMatchObject({
    version: 2,
    generalNotes: "persistent note",
    paidAmount: "12.50",
    deliveryDate: "0001-01-02",
  });
  expect(
    envelope(
      await request(app)
        .get(`/api/v1/sales-drafts/${first.savedDraft.id}`)
        .set(auth(session)),
      draftDataSchema,
    ).draft,
  ).toEqual(second.savedDraft);
  const replay = envelope(
    await request(app)
      .post("/api/v1/sales-drafts")
      .set(auth(session))
      .send(input),
    draftCommandDataSchema,
    201,
  );
  expect(replay.savedDraft).toEqual(first.savedDraft);
  expect(replay.replayed).toBe(true);
  const observed = envelope(
    await request(app)
      .get(`/api/v1/sales-commands/${input.commandId}`)
      .set(auth(session)),
    salesCommandDataSchema,
  );
  expect(observed).toMatchObject({
    kind: "draft",
    savedDraft: first.savedDraft,
    replayed: true,
  });
  error(
    await request(app)
      .put(`/api/v1/sales-drafts/${first.savedDraft.id}`)
      .set(auth(session))
      .send({ ...save, commandId: randomUUID() }),
    409,
  );
  error(
    await request(app)
      .put(`/api/v1/sales-drafts/${first.savedDraft.id}`)
      .set(auth(session))
      .send({ ...save, draft: { ...replacement, price: 1 } }),
    400,
  );
  error(
    await request(app)
      .post(`/api/v1/sales-drafts/${first.savedDraft.id}/submit`)
      .set(auth(session))
      .send({}),
    404,
  );
  expect(await database.salesCommand.count()).toBe(2);
  expect(await database.salesDraft.count()).toBe(1);
});
it("shares customer identity while isolating drafts, counts, measurements, activity and command receipts", async () => {
  const sa = await login(a),
    sb = await login(b),
    adm = await login(admin);
  const created = envelope(
    await request(app)
      .post("/api/v1/customers")
      .set(auth(sa))
      .send({
        commandId: randomUUID(),
        customer: { name: "Shared", phone: "٠٥٠٠٠٠٠٠٠١" },
      }),
    customerCommandDataSchema,
    201,
  );
  const cid = created.savedCustomer.id;
  expect(
    envelope(
      await request(app)
        .get("/api/v1/customers/by-phone/%2B966500000001")
        .set(auth(sb)),
      customerDataSchema,
    ).customer.id,
  ).toBe(cid);
  error(
    await request(app)
      .post("/api/v1/customers")
      .set(auth(sb))
      .send({
        commandId: randomUUID(),
        customer: { name: "Duplicate", phone: "00966500000001" },
      }),
    409,
  );
  const patch = envelope(
    await request(app)
      .patch(`/api/v1/customers/${cid}`)
      .set(auth(sb))
      .send({
        commandId: randomUUID(),
        expectedVersion: 1,
        patch: { notes: "shared edit" },
      }),
    customerCommandDataSchema,
  );
  expect(patch.savedCustomer.version).toBe(2);
  const input = blank();
  input.draft.customerId = cid;
  const inputPiece = input.draft.pieces[0];
  if (inputPiece === undefined) throw new Error("Expected initial piece");
  inputPiece.size = "private size";
  const draft = envelope(
    await request(app).post("/api/v1/sales-drafts").set(auth(sa)).send(input),
    draftCommandDataSchema,
    201,
  );
  error(
    await request(app)
      .get(`/api/v1/sales-drafts/${draft.savedDraft.id}`)
      .set(auth(sb)),
    404,
  );
  error(
    await request(app)
      .get(`/api/v1/sales-drafts/${draft.savedDraft.id}/changes`)
      .set(auth(sb)),
    404,
  );
  error(
    await request(app)
      .get(`/api/v1/sales-commands/${input.commandId}`)
      .set(auth(sb)),
    404,
  );
  error(
    await request(app)
      .get(`/api/v1/sales-commands/${input.commandId}`)
      .set(auth(adm)),
    404,
  );
  for (const [session, count] of [
    [sa, 1],
    [sb, 0],
    [adm, 1],
  ] as const) {
    const list = envelope(
      await request(app).get("/api/v1/customers").set(auth(session)),
      customerListDataSchema,
    );
    expect(list.customers[0]?.draftCount).toBe(count);
    expect(
      envelope(
        await request(app)
          .get(`/api/v1/customers/${cid}/measurements`)
          .set(auth(session)),
        customerMeasurementsDataSchema,
      ).measurements,
    ).toHaveLength(count);
    expect(
      envelope(
        await request(app)
          .get("/api/v1/sales-drafts/changes")
          .set(auth(session)),
        draftChangesDataSchema,
      ).changes,
    ).toHaveLength(count);
    expect(
      envelope(
        await request(app).get("/api/v1/sales-drafts").set(auth(session)),
        draftListDataSchema,
      ).totalDrafts,
    ).toBe(count);
  }
  expect(
    envelope(
      await request(app)
        .get(`/api/v1/sales-drafts/${draft.savedDraft.id}`)
        .set(auth(adm)),
      draftDataSchema,
    ).draft.owner.id,
  ).toBe(a);
});
it("enforces live department/eligibility and strict parsing before mutation", async () => {
  const sa = await login(a),
    nonSales = await login(factory),
    pending = await login(restricted);
  error(await request(app).get("/api/v1/customers"), 401);
  for (const session of [nonSales, pending])
    error(await request(app).get("/api/v1/customers").set(auth(session)), 403);
  error(
    await request(app)
      .post("/api/v1/sales-drafts")
      .set("Authorization", `Bearer ${sa.token}`)
      .send(blank()),
    403,
  );
  error(
    await request(app).get("/api/v1/sales-drafts?page=0").set(auth(sa)),
    400,
  );
  error(
    await request(app)
      .post("/api/v1/sales-drafts")
      .set(auth(sa))
      .send({ ...blank(), status: "SUBMITTED" }),
    400,
  );
  await database.user.update({
    where: { id: a },
    data: { status: "SUSPENDED", accessVersion: { increment: 1 } },
  });
  error(
    await request(app).post("/api/v1/sales-drafts").set(auth(sa)).send(blank()),
    403,
  );
  expect(await database.salesDraft.count()).toBe(0);
  expect(await database.salesCommand.count()).toBe(0);
});
it("maps actual malformed and oversized JSON safely through createApp", async () => {
  const marker = "private-parser-marker";
  const malformed = await request(app)
    .post("/api/v1/sales-drafts")
    .set("Content-Type", "application/json")
    .send(`{"${marker}":`);
  error(malformed, 400, "INVALID_JSON");
  const oversized = await request(app)
    .post("/api/v1/sales-drafts")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ [marker]: "x".repeat(1_100_000) }));
  error(oversized, 413, "PAYLOAD_TOO_LARGE");
  for (const response of [malformed, oversized]) {
    expect(response.text).not.toContain(marker);
    expect(response.text).not.toContain("stack");
  }
  expect(logs.join("\n")).not.toContain(marker);
  expect(await database.salesCommand.count()).toBe(0);
});

it("recovers an aborted HTTP response body by command observation without another effect", async () => {
  const session = await login(a),
    input = blank(),
    server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Expected owned loopback address");
    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/v1/sales-drafts`,
      {
        method: "POST",
        headers: { ...auth(session), "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );
    // The application loses the response body after the server has committed it.
    controller.abort();
    await expect(response.json()).rejects.toThrow();
    const observed = envelope(
      await request(app)
        .get(`/api/v1/sales-commands/${input.commandId}`)
        .set(auth(session)),
      salesCommandDataSchema,
    );
    if (observed.kind !== "draft")
      throw new Error("Expected retained draft receipt");
    const replay = envelope(
      await request(app)
        .post("/api/v1/sales-drafts")
        .set(auth(session))
        .send(input),
      draftCommandDataSchema,
      201,
    );
    expect(replay.savedDraft).toEqual(observed.savedDraft);
    expect(replay.replayed).toBe(true);
    expect(await database.salesDraft.count()).toBe(1);
    expect(await database.salesCommand.count()).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      });
    });
  }
});

it("serves bounded customer cards over real authenticated HTTP with owner scope, current captures and strict filters", async () => {
  const sa = await login(a),
    sb = await login(b),
    adm = await login(admin),
    sf = await login(factory),
    sr = await login(restricted);
  const customer = envelope(
    await request(app)
      .post("/api/v1/customers")
      .set(auth(sa))
      .send({
        commandId: randomUUID(),
        customer: { name: "Card customer", phone: "0500000001" },
      }),
    customerCommandDataSchema,
    201,
  ).savedCustomer;

  for (const [session, model] of [
    [sa, "A model"],
    [sb, "B model"],
  ] as const) {
    const input = blank();
    input.draft.customerId = customer.id;
    input.draft.generalNotes = model;
    const piece = input.draft.pieces[0];
    if (piece === undefined) throw new Error("Expected blank piece");
    piece.model = model;
    piece.leatherBase = "Captured leather";
    envelope(
      await request(app)
        .post("/api/v1/sales-drafts")
        .set(auth(session))
        .send(input),
      draftCommandDataSchema,
      201,
    );
  }
  const url = `/api/v1/customers/${customer.id}/drafts`;
  const aCards = envelope(
    await request(app).get(url).set(auth(sa)),
    customerDraftsDataSchema,
  );
  expect(aCards.drafts.map((draft) => draft.owner.id)).toEqual([a]);
  expect(aCards.drafts[0]).toMatchObject({
    generalNotes: "A model",
    pieces: [{ model: "A model", size: null, leatherBase: "Captured leather" }],
  });
  const bCards = envelope(
    await request(app).get(url).set(auth(sb)),
    customerDraftsDataSchema,
  );
  expect(bCards.drafts.map((draft) => draft.owner.id)).toEqual([b]);
  expect(
    envelope(
      await request(app).get(url).set(auth(adm)),
      customerDraftsDataSchema,
    ).pagination.total,
  ).toBe(2);
  expect(
    envelope(
      await request(app).get(`${url}?page=2&limit=1`).set(auth(adm)),
      customerDraftsDataSchema,
    ).drafts,
  ).toHaveLength(1);
  for (const query of ["limit=26", `ownerId=${b}`, "page=1&page=2"]) {
    error(await request(app).get(`${url}?${query}`).set(auth(sa)), 400);
  }
  error(await request(app).get(url), 401);
  error(await request(app).get(url).set(auth(sf)), 403);
  error(await request(app).get(url).set(auth(sr)), 403);
  error(
    await request(app)
      .get(`/api/v1/customers/${randomUUID()}/drafts`)
      .set(auth(sa)),
    404,
    "CUSTOMER_NOT_FOUND",
  );
  expect(await database.salesDraft.count()).toBe(2);
  expect(await database.salesCommand.count()).toBe(3);
});
