import { createDatabaseClient } from "@template/database";
import { afterAll, beforeEach, it, expect } from "vitest";
import { resetOwnedIdentityTestData } from "../../test-support/reset-test-data.js";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";
import { CatalogLoaderService } from "./catalog-loader.service.js";

const uri = process.env["DATABASE_URL"];
if (!uri) throw new Error("Owned integration database required");
const db = createDatabaseClient(uri),
  other = createDatabaseClient(uri),
  observer = createDatabaseClient(uri);
const loader = new CatalogLoaderService(db);
const databaseName = async () => {
  const [row] = await db.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (!row) throw new Error("Missing database");
  return row.name;
};
beforeEach(() => resetOwnedIdentityTestData(db));
afterAll(async () => {
  await resetOwnedIdentityTestData(db);
  await Promise.all([
    db.$disconnect(),
    other.$disconnect(),
    observer.$disconnect(),
  ]);
});
it("rejects wrong target without writes and repeats immutable source IDs", async () => {
  const preview = syntheticCatalogPreview();
  await expect(loader.apply(preview, "wrong_target")).rejects.toThrow(
    "CATALOG_TARGET_MISMATCH",
  );
  expect(await db.catalogSource.count()).toBe(0);
  const first = await loader.apply(preview, await databaseName());
  const rows = await db.catalogEntry.findMany({ orderBy: { id: "asc" } });
  const again = await loader.apply(preview, await databaseName());
  expect(first).toMatchObject({
    reused: false,
    entryCount: 1874,
    activated: true,
  });
  expect(again).toEqual({ ...first, reused: true });
  expect(await db.catalogEntry.findMany({ orderBy: { id: "asc" } })).toEqual(
    rows,
  );
});
it("serializes identical applies on the activation row", async () => {
  const name = await databaseName();
  let release!: () => void, acquired!: () => void;
  const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  const blocker = observer.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM catalog_activation WHERE id='active' FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  const attempts = [
    loader.apply(syntheticCatalogPreview(), name),
    new CatalogLoaderService(other).apply(syntheticCatalogPreview(), name),
  ];
  try {
    const deadline = Date.now() + 4000;
    let waiting = 0;
    while (Date.now() < deadline && waiting < 2) {
      const [row] = await observer.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%catalog_activation%'`;
      waiting = row?.count ?? 0;
    }
    expect(waiting).toBe(2);
  } finally {
    release();
  }
  await blocker;
  const results = await Promise.all(attempts);
  expect(new Set(results.map((row) => row.sourceId)).size).toBe(1);
  expect(results.map((row) => row.reused).sort()).toEqual([false, true]);
  expect(await db.catalogEntry.count()).toBe(1874);
  expect(await db.catalogSource.count()).toBe(1);
});
it("rolls back source, batches and activation after an insertion-stage failure", async () => {
  await db.$executeRawUnsafe(
    "CREATE FUNCTION p03_test_reject_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_cell='I104' THEN RAISE EXCEPTION 'owned injected failure'; END IF; RETURN NEW; END $$",
  );
  await db.$executeRawUnsafe(
    "CREATE TRIGGER p03_test_reject_entry BEFORE INSERT ON catalog_entries FOR EACH ROW EXECUTE FUNCTION p03_test_reject_entry()",
  );
  try {
    await expect(
      loader.apply(syntheticCatalogPreview(), await databaseName()),
    ).rejects.toThrow();
    expect(await db.catalogSource.count()).toBe(0);
    expect(await db.catalogEntry.count()).toBe(0);
    expect(
      await db.catalogActivation.findUnique({ where: { id: "active" } }),
    ).toMatchObject({ sourceId: null, activatedAt: null });
  } finally {
    await db.$executeRawUnsafe(
      "DROP TRIGGER p03_test_reject_entry ON catalog_entries",
    );
    await db.$executeRawUnsafe("DROP FUNCTION p03_test_reject_entry()");
  }
});

it("reads exact bounded catalog values and quotes all reviewed rates without writes", async () => {
  const { randomUUID } = await import("node:crypto");
  const { CatalogsService } = await import("./catalogs.service.js");
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      email: "catalog-admin@example.test",
      fullName: "Admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const service = new CatalogsService(db);
  expect(await service.get(id)).toEqual({
    availability: "unavailable",
    reason: "CATALOG_NOT_LOADED",
  });
  await loader.apply(syntheticCatalogPreview(), await databaseName());
  const catalog = await service.get(id);
  expect(catalog.availability).toBe("available");
  if (catalog.availability !== "available") throw new Error("Expected catalog");
  expect(catalog.entries).toHaveLength(1874);
  expect(catalog.entries.filter((e) => e.family !== null)).toHaveLength(1010);
  const decorations = catalog.entries.filter((e) => e.kind === "decoration");
  const before = {
    sources: await db.catalogSource.findMany(),
    entries: await db.catalogEntry.findMany({ orderBy: { id: "asc" } }),
    counter: await db.businessOrderCounter.findMany(),
    commands: await db.salesCommand.count(),
    roots: await db.salesDraft.count(),
  };
  const quote = await service.quote(id, {
    requestId: randomUUID(),
    pieces: decorations.map((e) => ({
      id: randomUUID(),
      decoration: e.displayValue,
      catalogSelections: { decoration: e.id },
    })),
  });
  expect(quote.availability).toBe("available");
  expect(
    quote.items
      .filter((e) => e.availability === "available")
      .map((e) => ("unitPrice" in e ? e.unitPrice : null)),
  ).toEqual([
    "1800.00",
    "1500.00",
    "1500.00",
    "1500.00",
    "850.00",
    "950.00",
    "950.00",
    "800.00",
    "750.00",
    "650.00",
    "650.00",
    "950.00",
    "1100.00",
    "500.00",
  ]);
  expect(before).toEqual({
    sources: await db.catalogSource.findMany(),
    entries: await db.catalogEntry.findMany({ orderBy: { id: "asc" } }),
    counter: await db.businessOrderCounter.findMany(),
    commands: await db.salesCommand.count(),
    roots: await db.salesDraft.count(),
  });
  await db.user.update({
    where: { id },
    data: { status: "SUSPENDED" },
  });
  await expect(service.get(id)).rejects.toThrow();
  await expect(
    service.quote(id, {
      requestId: randomUUID(),
      pieces: [{ id: randomUUID(), decoration: "زبيري - z" }],
    }),
  ).rejects.toThrow();
});

it("exposes catalog and stateless quote through real HTTP guards and strict contracts", async () => {
  const { randomUUID } = await import("node:crypto"),
    { createApp } = await import("../../app.js"),
    { default: pino } = await import("pino"),
    { default: request } = await import("supertest"),
    { businessTestHeaders } =
      await import("../../test-support/business-http.fixture.js"),
    { catalogDataSchema, catalogQuoteDataSchema, successEnvelopeSchema } =
      await import("@template/contracts");
  const actor = randomUUID(),
    factory = randomUUID();
  const now = new Date();
  await db.user.create({
    data: {
      id: actor,
      email: "catalog-http@example.test",
      fullName: "Admin",
      passwordHash: "synthetic",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: now,
    },
  });
  await db.user.create({
    data: {
      id: factory,
      email: "catalog-factory@example.test",
      fullName: "Factory",
      passwordHash: "synthetic",
      status: "ACTIVE",
      department: "PRODUCTION",
      staffApprovedAt: now,
      staffApprovedById: actor,
      emailVerifiedAt: now,
    },
  });
  const app = createApp({
      database: db,
      logger: pino({ level: "silent" }),
      emailDelivery: {
        provider: "console",
        send: () => Promise.resolve({ providerMessageId: "unused" }),
      },
    }),
    headers = businessTestHeaders(actor);
  expect((await request(app).get("/api/v1/catalogs")).status).toBe(401);
  expect(
    (
      await request(app)
        .get("/api/v1/catalogs")
        .set(businessTestHeaders(factory))
    ).status,
  ).toBe(403);
  const unavailable = await request(app).get("/api/v1/catalogs").set(headers);
  expect(unavailable.status).toBe(200);
  expect(
    successEnvelopeSchema
      .safeExtend({ data: catalogDataSchema })
      .parse(unavailable.body as unknown).data.availability,
  ).toBe("unavailable");
  await loader.apply(syntheticCatalogPreview(), await databaseName());
  const available = await request(app).get("/api/v1/catalogs").set(headers);
  expect(available.status).toBe(200);
  expect(
    successEnvelopeSchema
      .safeExtend({ data: catalogDataSchema })
      .parse(available.body as unknown).data.availability,
  ).toBe("available");
  const input = {
    requestId: randomUUID(),
    pieces: [{ id: randomUUID(), decoration: "زبيري - z" }],
  };
  expect(
    (
      await request(app)
        .post("/api/v1/catalogs/quotes")
        .set({ Authorization: headers.Authorization })
        .send(input)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/v1/catalogs/quotes")
        .set(headers)
        .send({ ...input, unitPrice: "1.00" })
    ).status,
  ).toBe(400);
  expect(
    (await request(app).get("/api/v1/catalogs?unexpected=yes").set(headers))
      .status,
  ).toBe(400);
  const quote = await request(app)
    .post("/api/v1/catalogs/quotes")
    .set(headers)
    .send(input);
  expect(quote.status).toBe(200);
  expect(
    successEnvelopeSchema
      .safeExtend({ data: catalogQuoteDataSchema })
      .parse(quote.body as unknown).data.total,
  ).toBe("1800.00");
  expect(quote.headers["cache-control"]).toContain("no-store");
  await db.user.update({ where: { id: actor }, data: { status: "SUSPENDED" } });
  expect((await request(app).get("/api/v1/catalogs").set(headers)).status).toBe(
    403,
  );
  expect(await db.salesDraft.count()).toBe(0);
  expect(await db.salesCommand.count()).toBe(0);
  expect(
    (
      await db.businessOrderCounter.findUniqueOrThrow({
        where: { id: "global" },
      })
    ).lastIssued,
  ).toBe(0n);
});
