import { expect, it } from "vitest";
import { Prisma } from "@template/database";
import {
  deriveSalesOrderFinancialFacts,
  type SalesOrderFinancialRecord,
} from "./sales-orders.mapper.js";

const orderId = "00000000-0000-4000-8000-000000000001";
const financialRecord = (): SalesOrderFinancialRecord => ({
  id: orderId,
  status: "SUBMITTED",
  customerId: "00000000-0000-4000-8000-000000000002",
  order: {
    id: orderId,
    totalAmount: new Prisma.Decimal("1800"),
    paidAmount: new Prisma.Decimal("100.50"),
  },
  pieces: [
    {
      id: "p1",
      quantity: 1,
      orderPiece: {
        id: "p1",
        orderId,
        unitPrice: new Prisma.Decimal("1800"),
        stage: "WAREHOUSE",
        receivedAt: new Date("2026-11-12T10:00:00Z"),
      },
    },
    {
      id: "p2",
      quantity: 1,
      orderPiece: {
        id: "p2",
        orderId,
        unitPrice: new Prisma.Decimal("1500"),
        stage: "CANCELLED",
        receivedAt: null,
      },
    },
  ],
});
const firstPhysical = (record: SalesOrderFinancialRecord) => {
  const physical = record.pieces[0]?.orderPiece;
  if (!physical) throw new Error("Physical fixture required");
  return physical;
};
it("derives exact retained money and physical receipt counts from the minimal persisted fact projection", () => {
  expect(deriveSalesOrderFinancialFacts(financialRecord())).toEqual({
    money: {
      total: "1800.00",
      paidAmount: "100.50",
      remainingDue: "1699.50",
      surplus: "0.00",
    },
    counts: {
      original: 2,
      active: 1,
      cancelled: 1,
      received: 1,
      completionPercent: 100,
    },
  });
});
const corruptions: Array<
  [string, (record: SalesOrderFinancialRecord) => void]
> = [
  [
    "non-submitted root",
    (record) => {
      record.status = "DRAFT";
    },
  ],
  [
    "missing header",
    (record) => {
      record.order = null;
    },
  ],
  [
    "wrong header identity",
    (record) => {
      if (record.order) record.order.id = "foreign";
    },
  ],
  [
    "missing customer",
    (record) => {
      record.customerId = null;
    },
  ],
  [
    "empty membership",
    (record) => {
      record.pieces = [];
    },
  ],
  [
    "over-200 membership",
    (record) => {
      const piece = record.pieces[0];
      if (!piece) throw new Error("Piece required");
      record.pieces = Array.from({ length: 201 }, () => piece);
    },
  ],
  [
    "missing physical terms",
    (record) => {
      const piece = record.pieces[0];
      if (piece) piece.orderPiece = null;
    },
  ],
  [
    "wrong physical identity",
    (record) => {
      firstPhysical(record).id = "foreign";
    },
  ],
  [
    "wrong physical order",
    (record) => {
      firstPhysical(record).orderId = "foreign";
    },
  ],
  [
    "non-unit quantity",
    (record) => {
      const piece = record.pieces[0];
      if (piece) piece.quantity = 2;
    },
  ],
  [
    "fractional money",
    (record) => {
      firstPhysical(record).unitPrice = new Prisma.Decimal("1800.001");
    },
  ],
  [
    "inconsistent retained total",
    (record) => {
      if (record.order) record.order.totalAmount = new Prisma.Decimal("3300");
    },
  ],
];
it.each(corruptions)(
  "retains the %s guard without UI fields",
  (_name, corrupt) => {
    const record = financialRecord();
    corrupt(record);
    expect(() => deriveSalesOrderFinancialFacts(record)).toThrow();
  },
);

it("projects 199 initial receipts as current99 without changing exact financial facts", () => {
  const record = financialRecord();
  const physical = firstPhysical(record);
  record.pieces = Array.from({ length: 200 }, (_, index) => ({
    id: `p${index.toString()}`,
    quantity: 1,
    orderPiece: {
      ...physical,
      id: `p${index.toString()}`,
      receivedAt: index < 199 ? physical.receivedAt : null,
    },
  }));
  if (!record.order) throw new Error("Header required");
  record.order.totalAmount = new Prisma.Decimal("360000");
  expect(deriveSalesOrderFinancialFacts(record)).toEqual({
    money: {
      total: "360000.00",
      paidAmount: "100.50",
      remainingDue: "359899.50",
      surplus: "0.00",
    },
    counts: {
      original: 200,
      active: 200,
      cancelled: 0,
      received: 199,
      completionPercent: 99,
    },
  });
});
