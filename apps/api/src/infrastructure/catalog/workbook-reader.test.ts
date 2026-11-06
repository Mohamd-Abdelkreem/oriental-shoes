import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import {
  REVIEWED_CATALOG_MANIFEST,
  type ReviewedCatalogRange,
} from "../../modules/catalogs/reviewed-catalog.manifest.js";
import {
  ExcelCatalogWorkbookReader,
  MAX_CATALOG_WORKBOOK_BYTES,
} from "./workbook-reader.js";

const syntheticWorkbook = () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet(REVIEWED_CATALOG_MANIFEST.worksheet);
  const fixed: Readonly<Record<string, string>> =
    REVIEWED_CATALOG_MANIFEST.fixedLabels;
  const ranges: readonly ReviewedCatalogRange[] =
    REVIEWED_CATALOG_MANIFEST.ranges;
  for (const range of ranges) {
    if (range.family)
      sheet.getCell(range.family.cell).value = range.family.label;
    for (let row = range.from; row <= range.to; row += 1) {
      const cell = `${range.column}${String(row)}`;
      sheet.getCell(cell).value =
        range.numbers === undefined
          ? (fixed[cell] ?? `synthetic ${cell}`)
          : range.numbers.start + (row - range.from) * range.numbers.step;
    }
  }
  for (const rate of REVIEWED_CATALOG_MANIFEST.rates) {
    sheet.getCell(rate.sourceCell).value = rate.label;
    sheet.getCell(rate.priceSourceCell).value = Number(rate.unitPrice);
  }
  sheet.getCell("AA942").value = "synthetic extent";
  return { book, sheet };
};
const inspect = async (book: ExcelJS.Workbook) =>
  new ExcelCatalogWorkbookReader().read(
    Buffer.from(await book.xlsx.writeBuffer()),
  );

it("reads the reviewed ranges, cached formulas, rich text and half-step sets while refusing unreviewed bytes", async () => {
  const { book, sheet } = syntheticWorkbook();
  sheet.getCell("A3").value = { richText: [{ text: "S" }, { text: "M" }] };
  sheet.getCell("I104").value = {
    formula: '"001 - جلد "',
    result: "001 - جلد ",
  };
  sheet.getCell("Z3").value = { formula: '"زبيري - z"', result: "زبيري - z" };
  sheet.getCell("E3").value = { formula: "25", result: 25 };
  sheet.getCell("L104").value = 999;
  sheet.getCell("T103").value = "not a source option";
  const bytes = Buffer.from(await book.xlsx.writeBuffer()),
    preview = await new ExcelCatalogWorkbookReader().read(bytes);
  expect(preview.sourceSha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(preview.valid).toBe(false);
  expect(preview.counts).toEqual(REVIEWED_CATALOG_MANIFEST.counts);
  expect(preview.entries).toHaveLength(1874);
  expect(
    preview.entries.find((entry) => entry.sourceCell === "I104"),
  ).toMatchObject({ displayValue: "001 - جلد ", kind: "leatherBase" });
  expect(
    preview.entries.some(
      (entry) => entry.sourceCell === "L104" || entry.sourceCell === "T103",
    ),
  ).toBe(false);
  expect(
    preview.entries.find((entry) => entry.sourceCell === "E4")?.displayValue,
  ).toBe("25.5");
  expect(
    preview.entries.find((entry) => entry.sourceCell === "G62")?.displayValue,
  ).toBe("30.5");
  expect(
    preview.entries.find((entry) => entry.sourceCell === "M3")?.familyLabel,
  ).toBe("تمساح - مطفي ");
  expect(preview.rates).toEqual(REVIEWED_CATALOG_MANIFEST.rates);
  expect(preview.diagnostics).toEqual([
    { cell: "workbook", code: "SOURCE_HASH_MISMATCH" },
    ...REVIEWED_CATALOG_MANIFEST.asymmetries,
  ]);
});

it.each([
  ["missing formula cache", { formula: '"value"' }, "FORMULA_CACHE_MISSING"],
  [
    "numeric label cache",
    { formula: "1", result: 1 },
    "LABEL_TYPE_OR_VALUE_INVALID",
  ],
  [
    "date label",
    new Date("2026-11-06T00:00:00Z"),
    "LABEL_TYPE_OR_VALUE_INVALID",
  ],
  ["boolean label", true, "LABEL_TYPE_OR_VALUE_INVALID"],
  ["error label", { error: "#VALUE!" }, "LABEL_TYPE_OR_VALUE_INVALID"],
  ["numeric code label", 1, "LABEL_TYPE_OR_VALUE_INVALID"],
] as const)(
  "rejects %s instead of guessing a display value",
  async (_scenario, invalid, code) => {
    const { book, sheet } = syntheticWorkbook();
    sheet.getCell("I104").value = invalid;
    const preview = await inspect(book);
    expect(preview.valid).toBe(false);
    expect(preview.entries.some((entry) => entry.sourceCell === "I104")).toBe(
      false,
    );
    expect(preview.diagnostics).toContainEqual({ cell: "I104", code });
  },
);

it("retains duplicate labels by source identity and never invents a matching color family", async () => {
  const { book, sheet } = syntheticWorkbook();
  sheet.getCell("I3").value = "duplicate ";
  sheet.getCell("I4").value = "duplicate ";
  const preview = await inspect(book);
  expect(
    preview.entries
      .filter((entry) => entry.displayValue === "duplicate ")
      .map((entry) => entry.sourceCell),
  ).toEqual(["I3", "I4"]);
  expect(preview.diagnostics).toContainEqual({
    cell: "I4",
    code: "DUPLICATE_LABEL_RETAINED",
  });
  expect(preview.diagnostics).toContainEqual({
    cell: "Z3",
    code: "NO_COLOR_FAMILY",
  });
  expect(preview.diagnostics).toContainEqual({
    cell: "Y2",
    code: "NO_DECORATION_RATE",
  });
});

it("rejects changed rates and numeric sets while retaining bounded diagnostics", async () => {
  const { book, sheet } = syntheticWorkbook();
  sheet.getCell("AA3").value = 0;
  sheet.getCell("E3").value = 25.25;
  for (let row = 3; row <= 592; row += 1)
    sheet.getCell(`I${String(row)}`).value = false;
  const preview = await inspect(book);
  expect(preview.valid).toBe(false);
  expect(preview.counts.leatherBase).toBe(0);
  expect(preview.rates.some((rate) => rate.sourceCell === "Z3")).toBe(false);
  expect(preview.diagnostics).toHaveLength(100);
  expect(preview.totalIssueCount).toBeGreaterThan(590);
});

it("classifies malformed, oversized and wrong-sheet workbooks without exposing their payload", async () => {
  const reader = new ExcelCatalogWorkbookReader();
  const malformed = await reader.read(Buffer.from("not a workbook"));
  expect(malformed.valid).toBe(false);
  expect(malformed.diagnostics).toContainEqual({
    cell: "workbook",
    code: "WORKBOOK_PARSE_FAILED",
  });
  const oversized = await reader.read(
    Buffer.alloc(MAX_CATALOG_WORKBOOK_BYTES + 1),
  );
  expect(oversized.valid).toBe(false);
  expect(oversized.diagnostics).toContainEqual({
    cell: "workbook",
    code: "WORKBOOK_TOO_LARGE",
  });
  const wrong = new ExcelJS.Workbook();
  wrong.addWorksheet("wrong");
  const absentSheet = await inspect(wrong);
  expect(absentSheet.valid).toBe(false);
  expect(absentSheet.diagnostics).toContainEqual({
    cell: "workbook",
    code: "WORKSHEET_MISSING",
  });
});
