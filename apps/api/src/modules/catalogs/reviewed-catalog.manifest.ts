import type { CatalogField } from "@template/contracts";

export type ReviewedCatalogRange = Readonly<{
  kind: CatalogField;
  column: string;
  from: number;
  to: number;
  numbers?: Readonly<{ start: number; step: number }>;
  family?: Readonly<{ cell: string; label: string }>;
}>;
export const REVIEWED_CATALOG_MANIFEST = {
  sha256: "88acb9b4b0389b86d75c191fa7a3201a27f0d387dd1098f45562a8ff02753e9b",
  mappingVersion: 1,
  worksheet: "القوائم",
  sourceExtent: "A1:AA942",
  counts: {
    model: 7,
    size: 55,
    leatherBase: 590,
    decoration: 14,
    decorationColor: 1010,
    sole: 12,
    soleAddition: 5,
    soleColor: 40,
    aField: 81,
    fField: 60,
  },
  fixedLabels: {
    A3: "SM",
    A4: "STN",
    A5: "ST",
    A6: "SH",
    A7: "R15",
    A8: "SLEEPR",
    A9: "SF",
    B3: "روضة - H",
    B4: "مكسي - X",
    B5: "مربع - S",
    B6: "كعب - K",
    B7: "تكتك - T",
    C3: "RD1/2",
    C4: "RD",
    C5: "N",
    C6: "RO",
    C7: "RP",
    C8: "روضه - H",
    C9: "طبي - TAPI",
    C10: "RC",
    C11: "RM1/2",
    C12: "R.R",
    C13: "N.D",
    C14: "N1/2",
  },
  ranges: [
    {
      kind: "model",
      column: "A",
      from: 3,
      to: 9,
    },
    {
      kind: "soleAddition",
      column: "B",
      from: 3,
      to: 7,
    },
    {
      kind: "sole",
      column: "C",
      from: 3,
      to: 14,
    },
    {
      kind: "soleColor",
      column: "D",
      from: 3,
      to: 42,
      numbers: {
        start: 1,
        step: 1,
      },
    },
    {
      kind: "size",
      column: "E",
      from: 3,
      to: 57,
      numbers: {
        start: 25,
        step: 0.5,
      },
    },
    {
      kind: "aField",
      column: "F",
      from: 3,
      to: 83,
      numbers: {
        start: 10,
        step: 0.5,
      },
    },
    {
      kind: "fField",
      column: "G",
      from: 3,
      to: 62,
      numbers: {
        start: 1,
        step: 0.5,
      },
    },
    {
      kind: "leatherBase",
      column: "I",
      from: 3,
      to: 592,
    },
    {
      kind: "decoration",
      column: "Z",
      from: 3,
      to: 16,
    },
    {
      kind: "decorationColor",
      column: "L",
      from: 3,
      to: 72,
      family: {
        cell: "L2",
        label: "نعام - O",
      },
    },
    {
      kind: "decorationColor",
      column: "M",
      from: 3,
      to: 72,
      family: {
        cell: "M2",
        label: "تمساح - مطفي ",
      },
    },
    {
      kind: "decorationColor",
      column: "N",
      from: 3,
      to: 72,
      family: {
        cell: "N2",
        label: "تمساح - C",
      },
    },
    {
      kind: "decorationColor",
      column: "O",
      from: 3,
      to: 72,
      family: {
        cell: "O2",
        label: "لازار - L",
      },
    },
    {
      kind: "decorationColor",
      column: "P",
      from: 3,
      to: 72,
      family: {
        cell: "P2",
        label: "ثعبان - مطفي",
      },
    },
    {
      kind: "decorationColor",
      column: "Q",
      from: 3,
      to: 72,
      family: {
        cell: "Q2",
        label: "ثعبان - P",
      },
    },
    {
      kind: "decorationColor",
      column: "R",
      from: 3,
      to: 72,
      family: {
        cell: "R2",
        label: "سمك - F",
      },
    },
    {
      kind: "decorationColor",
      column: "S",
      from: 3,
      to: 72,
      family: {
        cell: "S2",
        label: "نابا - N",
      },
    },
    {
      kind: "decorationColor",
      column: "T",
      from: 3,
      to: 102,
      family: {
        cell: "T2",
        label: "سادة - S",
      },
    },
    {
      kind: "decorationColor",
      column: "U",
      from: 3,
      to: 72,
      family: {
        cell: "U2",
        label: "سادة مطفي - M",
      },
    },
    {
      kind: "decorationColor",
      column: "V",
      from: 3,
      to: 72,
      family: {
        cell: "V2",
        label: "حصان - H",
      },
    },
    {
      kind: "decorationColor",
      column: "W",
      from: 3,
      to: 72,
      family: {
        cell: "W2",
        label: "ساق نعام - OL",
      },
    },
    {
      kind: "decorationColor",
      column: "X",
      from: 3,
      to: 72,
      family: {
        cell: "X2",
        label: "شمواه - V",
      },
    },
    {
      kind: "decorationColor",
      column: "Y",
      from: 3,
      to: 72,
      family: {
        cell: "Y2",
        label: "تمساح بيبي - CB",
      },
    },
  ],
  rates: [
    {
      sourceCell: "Z3",
      priceSourceCell: "AA3",
      label: "زبيري - z",
      unitPrice: "1800.00",
    },
    {
      sourceCell: "Z4",
      priceSourceCell: "AA4",
      label: "نعام - O",
      unitPrice: "1500.00",
    },
    {
      sourceCell: "Z5",
      priceSourceCell: "AA5",
      label: "تمساح - مطفي ",
      unitPrice: "1500.00",
    },
    {
      sourceCell: "Z6",
      priceSourceCell: "AA6",
      label: "تمساح - C",
      unitPrice: "1500.00",
    },
    {
      sourceCell: "Z7",
      priceSourceCell: "AA7",
      label: "لازار - L",
      unitPrice: "850.00",
    },
    {
      sourceCell: "Z8",
      priceSourceCell: "AA8",
      label: "ثعبان - مطفي",
      unitPrice: "950.00",
    },
    {
      sourceCell: "Z9",
      priceSourceCell: "AA9",
      label: "ثعبان - P",
      unitPrice: "950.00",
    },
    {
      sourceCell: "Z10",
      priceSourceCell: "AA10",
      label: "سمك - F",
      unitPrice: "800.00",
    },
    {
      sourceCell: "Z11",
      priceSourceCell: "AA11",
      label: "نابا - N",
      unitPrice: "750.00",
    },
    {
      sourceCell: "Z12",
      priceSourceCell: "AA12",
      label: "سادة - S",
      unitPrice: "650.00",
    },
    {
      sourceCell: "Z13",
      priceSourceCell: "AA13",
      label: "سادة مطفي - M",
      unitPrice: "650.00",
    },
    {
      sourceCell: "Z14",
      priceSourceCell: "AA14",
      label: "حصان - H",
      unitPrice: "950.00",
    },
    {
      sourceCell: "Z15",
      priceSourceCell: "AA15",
      label: "ساق نعام - OL",
      unitPrice: "1100.00",
    },
    {
      sourceCell: "Z16",
      priceSourceCell: "AA16",
      label: "شمواه - v",
      unitPrice: "500.00",
    },
  ],
  asymmetries: [
    {
      cell: "Z3",
      code: "NO_COLOR_FAMILY",
    },
    {
      cell: "Y2",
      code: "NO_DECORATION_RATE",
    },
  ],
} as const;
