import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExcelCatalogWorkbookReader,
  MAX_CATALOG_WORKBOOK_BYTES,
} from "../infrastructure/catalog/workbook-reader.js";
import {
  assertReviewedCatalogPreview,
  CatalogLoadError,
} from "../modules/catalogs/catalog-loader.service.js";
import { REVIEWED_CATALOG_MANIFEST } from "../modules/catalogs/reviewed-catalog.manifest.js";

export type CatalogLoadArguments =
  | Readonly<{ file: string; mode: "preview"; databaseName?: never }>
  | Readonly<{ file: string; mode: "apply"; databaseName: string }>;
export const parseCatalogLoadArguments = (
  argv: readonly string[],
): CatalogLoadArguments => {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index],
      argument = argv[index + 1];
    if (
      name === undefined ||
      !["--file", "--mode", "--database-name"].includes(name) ||
      flags.has(name) ||
      argument === undefined ||
      argument.length === 0 ||
      argument.startsWith("--")
    )
      throw new CatalogLoadError("CATALOG_ARGUMENT_INVALID");
    flags.set(name, argument);
  }
  const file = flags.get("--file"),
    mode = flags.get("--mode"),
    databaseName = flags.get("--database-name");
  if (file === undefined || (mode !== "preview" && mode !== "apply"))
    throw new CatalogLoadError("CATALOG_ARGUMENT_INVALID");
  if (mode === "preview") {
    if (databaseName !== undefined)
      throw new CatalogLoadError("CATALOG_ARGUMENT_INVALID");
    return { file, mode };
  }
  if (databaseName === undefined)
    throw new CatalogLoadError("CATALOG_ARGUMENT_INVALID");
  return { file, mode, databaseName };
};
export const readReviewedCatalogBytes = async (
  path: string,
): Promise<Buffer> => {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_CATALOG_WORKBOOK_BYTES + 1);
    let length = 0;
    while (length < buffer.byteLength) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.byteLength - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_CATALOG_WORKBOOK_BYTES)
      throw new CatalogLoadError("CATALOG_FILE_TOO_LARGE");
    const bytes = buffer.subarray(0, length);
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      REVIEWED_CATALOG_MANIFEST.sha256
    )
      throw new CatalogLoadError("CATALOG_SOURCE_HASH_MISMATCH");
    return bytes;
  } finally {
    await file.close();
  }
};
export const runCatalogLoad = async (
  argv = process.argv.slice(2),
): Promise<number> => {
  try {
    const options = parseCatalogLoadArguments(argv),
      bytes = await readReviewedCatalogBytes(options.file);
    const preview = await new ExcelCatalogWorkbookReader().read(bytes);
    assertReviewedCatalogPreview(preview);
    if (options.mode === "preview") {
      process.stdout.write(
        `${JSON.stringify({ sourceSha256: preview.sourceSha256, valid: preview.valid, counts: preview.counts, diagnostics: preview.diagnostics, totalIssueCount: preview.totalIssueCount })}\n`,
      );
      return 0;
    }
    const [
      { createDatabaseClient },
      { databaseConfig },
      { CatalogLoaderService },
    ] = await Promise.all([
      import("@template/database"),
      import("../core/config/database.config.js"),
      import("../modules/catalogs/catalog-loader.service.js"),
    ]);
    const database = createDatabaseClient(databaseConfig.url);
    try {
      const loaded = await new CatalogLoaderService(database).apply(
        preview,
        options.databaseName,
      );
      process.stdout.write(`${JSON.stringify(loaded)}\n`);
      return 0;
    } finally {
      await database.$disconnect();
    }
  } catch (error) {
    const code =
      error instanceof CatalogLoadError ? error.code : "CATALOG_LOAD_FAILED";
    process.stderr.write(`${JSON.stringify({ code })}\n`);
    return 1;
  }
};
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runCatalogLoad();
