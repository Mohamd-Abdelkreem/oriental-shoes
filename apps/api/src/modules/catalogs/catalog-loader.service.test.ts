import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  parseCatalogLoadArguments,
  readReviewedCatalogBytes,
} from "../../scripts/load-catalog.js";
import { assertReviewedCatalogPreview } from "./catalog-loader.service.js";
import { syntheticCatalogPreview } from "../../test-support/reviewed-catalog.fixture.js";

describe("guarded catalog loader", () => {
  it("requires exact explicit flags without duplicates or preview database configuration", () => {
    expect(
      parseCatalogLoadArguments(["--file", "owned.xlsx", "--mode", "preview"]),
    ).toEqual({ file: "owned.xlsx", mode: "preview" });
    expect(
      parseCatalogLoadArguments([
        "--mode",
        "apply",
        "--file",
        "owned.xlsx",
        "--database-name",
        "owned",
      ]),
    ).toEqual({ file: "owned.xlsx", mode: "apply", databaseName: "owned" });
    for (const args of [
      [],
      ["--file", "a", "--mode", "apply"],
      ["--file", "a", "--mode", "preview", "--database-name", "db"],
      ["--file", "a", "--mode", "preview", "--file", "b"],
      ["--file", "a", "--mode", "preview", "--override", "yes"],
    ])
      expect(() => parseCatalogLoadArguments(args)).toThrow(
        "CATALOG_ARGUMENT_INVALID",
      );
  });
  it("reconciles every identity, count, rate and policy before persistence", () => {
    const valid = syntheticCatalogPreview();
    expect(() => {
      assertReviewedCatalogPreview(valid);
    }).not.toThrow();
    for (const bad of [
      { ...valid, valid: false },
      { ...valid, sourceSha256: "0".repeat(64) },
      { ...valid, entries: valid.entries.slice(1) },
      {
        ...valid,
        rates: valid.rates.map((rate) => ({ ...rate, unitPrice: "0.00" })),
      },
      {
        ...valid,
        entries: valid.entries.map((entry, index) =>
          index === 0 ? { ...entry, displayValue: "wrong" } : entry,
        ),
      },
    ])
      expect(() => {
        assertReviewedCatalogPreview(bad);
      }).toThrow("CATALOG_PREVIEW_INVALID");
  });
  it("bounds input and rejects unreviewed bytes before parsing or database configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "catalog-loader-"));
    try {
      const file = join(dir, "fixture.xlsx");
      await writeFile(file, "not a workbook");
      await expect(readReviewedCatalogBytes(file)).rejects.toThrow(
        "CATALOG_SOURCE_HASH_MISMATCH",
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        RAILWAY_ENVIRONMENT: "owned-test",
      };
      delete env["DATABASE_URL"];
      try {
        await promisify(execFile)(
          process.execPath,
          [
            "--conditions=development",
            "--import",
            "tsx",
            "src/scripts/load-catalog.ts",
            "--file",
            file,
            "--mode",
            "preview",
          ],
          { env },
        );
        throw new Error("Expected CLI rejection");
      } catch (error) {
        expect(error).toMatchObject({
          code: 1,
          stdout: "",
          stderr: '{"code":"CATALOG_SOURCE_HASH_MISMATCH"}\n',
        });
      }
      await writeFile(file, Buffer.alloc(16 * 1024 * 1024 + 1));
      await expect(readReviewedCatalogBytes(file)).rejects.toThrow(
        "CATALOG_FILE_TOO_LARGE",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
