import { z } from "zod";
import { MAX_DRAFT_PIECES } from "../sales-drafts/sales-draft-values.schema.ts";

const unitAmountSchema = z.string().regex(/^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/u);
const totalAmountSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u)
  .pipe(
    z
      .string()
      .refine(
        (amount) => BigInt(amount.replace(".", "")) <= 19_999_999_999_800n,
      ),
  );
const countSchema = z.number().int().min(0).max(MAX_DRAFT_PIECES);
const orderCountsShape = z
  .object({
    original: countSchema,
    cancelled: countSchema,
    active: countSchema,
    received: countSchema,
    completionPercent: z.number().int().min(0).max(100),
  })
  .strict();
const countsAgree = (counts: z.infer<typeof orderCountsShape>) =>
  counts.original === counts.active + counts.cancelled &&
  counts.received <= counts.active;
const currentCompletionPercent = (counts: z.infer<typeof orderCountsShape>) =>
  counts.active === 0
    ? 0
    : counts.received === counts.active
      ? 100
      : Math.min(99, Math.round((counts.received / counts.active) * 100));
export const currentOrderCountsSchema = orderCountsShape.refine(
  (counts) =>
    countsAgree(counts) &&
    counts.completionPercent === currentCompletionPercent(counts),
  "Piece counts and current completion must agree",
);
export const retainedOrderCountsSchema = orderCountsShape.refine(
  (counts) =>
    countsAgree(counts) &&
    (counts.completionPercent === currentCompletionPercent(counts) ||
      counts.completionPercent ===
        (counts.active === 0
          ? 0
          : Math.round((counts.received / counts.active) * 100))),
  "Piece counts and retained completion must agree",
);
export const salesOrderMoneySchema = z
  .object({
    total: totalAmountSchema,
    paidAmount: unitAmountSchema,
    remainingDue: totalAmountSchema,
    surplus: unitAmountSchema,
  })
  .strict()
  .refine((money) => {
    if (
      ![money.total, money.paidAmount, money.remainingDue, money.surplus].every(
        (amount) => /^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/u.test(amount),
      )
    )
      return false;
    const totalCents = BigInt(money.total.replace(".", "")),
      paidCents = BigInt(money.paidAmount.replace(".", ""));
    return (
      BigInt(money.remainingDue.replace(".", "")) ===
        (totalCents > paidCents ? totalCents - paidCents : 0n) &&
      BigInt(money.surplus.replace(".", "")) ===
        (paidCents > totalCents ? paidCents - totalCents : 0n)
    );
  }, "Due and surplus must reflect exact total and cumulative paid");
