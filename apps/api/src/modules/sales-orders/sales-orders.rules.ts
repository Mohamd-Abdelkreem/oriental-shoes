import type { SalesOrderPiece, SalesOrderType } from "@template/contracts";
import type {
  SalesOrderPiece as PhysicalOrderPiece,
  SalesOrderStatus,
} from "@template/database";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { OrderNumberUnavailableError } from "./sales-orders.errors.js";

export const MAX_ORDER_UNIT_CENTS = 99_999_999_999n;
export const MAX_ORDER_TOTAL_CENTS = 19_999_999_999_800n;
export const MAX_ORDER_SEQUENCE = 9_223_372_036_854_775_807n;

export const deriveOrderStatusAfterCancellation = (
  remaining: readonly Pick<
    PhysicalOrderPiece,
    "stage" | "workState" | "receivedAt" | "issueId"
  >[],
): SalesOrderStatus => {
  if (remaining.length === 0) return "CANCELLED";
  return remaining.every(
    (piece) =>
      piece.stage === "WAREHOUSE" &&
      piece.workState === "COMPLETED" &&
      piece.receivedAt !== null &&
      piece.issueId === null,
  )
    ? "READY_FOR_DELIVERY"
    : "APPROVED";
};

export const parseMoneyCents = (
  amount: string,
  maximum = MAX_ORDER_UNIT_CENTS,
): bigint => {
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/u.test(amount))
    throw new InternalServerError("An order has an invalid exact amount.");
  const [integer = "0", fraction = ""] = amount.split(".");
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > maximum)
    throw new InternalServerError("An order amount exceeds its capacity.");
  return cents;
};
export const formatMoneyCents = (cents: bigint): string => {
  if (cents < 0n || cents > MAX_ORDER_TOTAL_CENTS)
    throw new InternalServerError("An order amount exceeds its capacity.");
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, "0")}`;
};
export const calculateOrderMoney = (
  prices: readonly bigint[],
  paidCents: bigint,
) => {
  if (
    prices.length > 200 ||
    prices.some((price) => price < 0n || price > MAX_ORDER_UNIT_CENTS) ||
    paidCents < 0n ||
    paidCents > MAX_ORDER_UNIT_CENTS
  )
    throw new InternalServerError("An order has invalid monetary terms.");
  const totalCents = prices.reduce((sum, price) => sum + price, 0n);
  return {
    total: formatMoneyCents(totalCents),
    paidAmount: formatMoneyCents(paidCents),
    remainingDue: formatMoneyCents(
      totalCents > paidCents ? totalCents - paidCents : 0n,
    ),
    surplus: formatMoneyCents(
      paidCents > totalCents ? paidCents - totalCents : 0n,
    ),
  };
};
export const deriveOrderCounts = (
  pieces: readonly Pick<SalesOrderPiece, "stage" | "receivedAt">[],
) => {
  const original = pieces.length,
    cancelled = pieces.filter((piece) => piece.stage === "CANCELLED").length;
  const active = original - cancelled,
    received = pieces.filter(
      (piece) => piece.stage !== "CANCELLED" && piece.receivedAt !== null,
    ).length;
  return {
    original,
    cancelled,
    active,
    received,
    completionPercent:
      active === 0
        ? 0
        : received === active
          ? 100
          : Math.min(99, Math.round((received / active) * 100)),
  };
};
export const formatBusinessNumber = (
  type: SalesOrderType,
  year: number,
  sequence: bigint,
): string => {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    sequence < 1n ||
    sequence > MAX_ORDER_SEQUENCE
  )
    throw new OrderNumberUnavailableError();
  return `${type}-${String(year).padStart(4, "0")}-${sequence.toString().padStart(4, "0")}`;
};
