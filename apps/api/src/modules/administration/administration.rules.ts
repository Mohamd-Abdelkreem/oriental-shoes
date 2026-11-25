import { isDeepStrictEqual } from "node:util";
import {
  administrationCommandFactsSchema,
  administrationCorrectionValuesSchema,
  type AdministrationCommandFacts,
  type AdministrationOrderFilters,
} from "@template/contracts";
import {
  isDateOnlyString,
  parseDateOnly,
  serializeDateOnly,
} from "../../core/date-only.js";
import { parseOrderBusinessTimeZone } from "../../core/config/order.config.js";
import { InternalServerError } from "../../core/errors/internal-server.error.js";
import { BadRequestException } from "../../core/errors/bad-request.error.js";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import { effectiveOrderContact } from "../sales-orders/order-contact.projection.js";
import { deriveSalesOrderFinancialFacts } from "../sales-orders/sales-orders.mapper.js";
import {
  calculateOrderMoney,
  deriveOrderCounts,
  deriveOrderStatusAfterCancellation,
  parseMoneyCents,
} from "../sales-orders/sales-orders.rules.js";
import {
  OrderCalendarUnavailableError,
  OrderNotFoundError,
  OrderStateConflictError,
  OrderVersionConflictError,
} from "../sales-orders/sales-orders.errors.js";
import {
  AdministrationCorrectionUnchangedError,
  AdministrationSelectionConflictError,
} from "./administration.errors.js";
import type {
  AdministrationCancellationPlan,
  AdministrationCancellationPlanInput,
  AdministrationCorrectionPlan,
  AdministrationCorrectionPlanInput,
  AdministrationResolvedPeriod,
  AdministrationRootRecord,
} from "./administration.types.js";

export const resolveAdministrationPeriod = (
  input: AdministrationOrderFilters,
  instant: Date,
  configuredTimeZone: string | null,
): AdministrationResolvedPeriod => {
  const timeZone = parseOrderBusinessTimeZone(configuredTimeZone ?? undefined);
  if (!timeZone) throw new OrderCalendarUnavailableError();
  if (!Number.isFinite(instant.getTime()))
    throw new InternalServerError("The observation clock is invalid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    era: "short",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (value === undefined) throw new OrderCalendarUnavailableError();
    return value;
  };
  const today = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  if (part("era") !== "AD" || !isDateOnlyString(today))
    throw new OrderCalendarUnavailableError();
  const date = parseDateOnly(today);
  if (input.period === "MONTH") date.setUTCDate(1);
  if (input.period === "YEAR") date.setUTCMonth(0, 1);
  const effectiveFrom =
    input.from ?? (input.period === "ALL" ? null : serializeDateOnly(date));
  const effectiveTo = input.to ?? (input.period === "ALL" ? null : today);
  if (
    (effectiveFrom !== null && !isDateOnlyString(effectiveFrom)) ||
    (effectiveTo !== null && !isDateOnlyString(effectiveTo)) ||
    (effectiveFrom !== null &&
      effectiveTo !== null &&
      effectiveFrom > effectiveTo)
  )
    throw new BadRequestException(
      "The effective date range must contain valid ordered calendar dates.",
    );
  return { timeZone, businessDate: today, effectiveFrom, effectiveTo };
};

export const mapAdministrationCommandFacts = (
  root: AdministrationRootRecord,
): AdministrationCommandFacts => {
  const header = root.order;
  if (root.status !== "SUBMITTED" || header === null)
    throw new OrderStateConflictError();
  const facts = {
    version: root.version,
    status: header.status,
    ...deriveSalesOrderFinancialFacts(root),
    correction: {
      generalNotes: root.generalNotes,
      ...effectiveOrderContact(
        header,
        header.administrationCorrections[0] ?? null,
      ),
    },
    pieces: root.pieces.map((piece) => {
      const physical = piece.orderPiece;
      if (!physical)
        throw new InternalServerError("A submitted physical piece is missing.");
      return {
        id: physical.id,
        stage: physical.stage,
        workState: physical.workState,
        issueId: physical.issueId,
        currentWorkVisitId: physical.currentWorkVisitId,
        receivedAt: physical.receivedAt?.toISOString() ?? null,
        cancelledAt: physical.cancelledAt?.toISOString() ?? null,
        cancellationReason: physical.cancellationReason,
      };
    }),
    returnProof:
      header.status === "RETURNED"
        ? {
            decisionId: header.currentReturnDecisionId,
            reason: header.currentReturnReason,
            returnedAt: header.currentReturnedAt?.toISOString(),
            version: header.currentReturnOrderVersion,
          }
        : null,
  };
  const parsed = administrationCommandFactsSchema.safeParse(facts);
  if (!parsed.success)
    throw new InternalServerError(
      "The retained administration facts are inconsistent.",
    );
  return parsed.data;
};

export const isAdministrationCancellationEligible = (
  root: Pick<AdministrationRootRecord, "status" | "order"> & {
    pieces: readonly {
      orderPiece: Pick<
        NonNullable<AdministrationRootRecord["pieces"][number]["orderPiece"]>,
        "stage" | "cancelledAt"
      > | null;
    }[];
  },
): boolean => {
  const header = root.order;
  if (
    root.status !== "SUBMITTED" ||
    !header ||
    ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(header.status) ||
    !root.pieces.some(
      (piece) =>
        piece.orderPiece?.stage !== "CANCELLED" &&
        piece.orderPiece?.cancelledAt === null,
    )
  )
    return false;
  const attempt = header.warehouseCommandOrders[0]?.attempt;
  if (
    attempt &&
    (!attempt.outcome ||
      attempt.outcome.kind !== "FAILED" ||
      !attempt.outcome.returnedToWarehouse)
  )
    return false;
  if (
    header.status === "DELIVERY_FAILED" &&
    (!attempt ||
      attempt.outcome?.kind !== "FAILED" ||
      !attempt.outcome.returnedToWarehouse ||
      attempt.retry !== null)
  )
    return false;
  return true;
};
const assertVersion = (
  root: AdministrationRootRecord,
  expectedVersion: number,
) => {
  if (root.version !== expectedVersion || root.version >= 2_147_483_647)
    throw new OrderVersionConflictError();
};
const resultFor = (
  orderId: string,
  after: AdministrationCommandFacts,
  pieceIds: string[],
): AdministrationCancellationPlan["result"] => ({
  orderId,
  version: after.version,
  status: after.status,
  counts: after.counts,
  money: after.money,
  correction: after.correction,
  pieceIds,
});

export const planAdministrativeCancellation = ({
  root,
  body,
  occurredAt,
}: AdministrationCancellationPlanInput): AdministrationCancellationPlan => {
  if (
    root.id !== body.orderId ||
    body.pieceIds.some((id) => !root.pieces.some((piece) => piece.id === id))
  )
    throw new OrderNotFoundError();
  assertVersion(root, body.expectedVersion);
  if (!isAdministrationCancellationEligible(root))
    throw new OrderStateConflictError();
  const before = mapAdministrationCommandFacts(root),
    selected = new Set(body.pieceIds);
  const active = before.pieces.filter((piece) => piece.stage !== "CANCELLED");
  if (
    selected.size === 0 ||
    selected.size !== body.pieceIds.length ||
    (body.scope === "ITEM" && selected.size !== 1) ||
    body.pieceIds.some((id) => !active.some((piece) => piece.id === id)) ||
    (body.scope === "ORDER" &&
      (selected.size !== active.length ||
        active.some((piece) => !selected.has(piece.id))))
  )
    throw new AdministrationSelectionConflictError();
  const reason =
    body.reason ??
    (body.scope === "ORDER"
      ? "إلغاء إداري شامل لكامل أمر التفصيل"
      : body.scope === "QUANTITY"
        ? "إلغاء إداري جزئي للكمية"
        : `إلغاء بند ${root.pieces.find((piece) => piece.id === body.pieceIds[0])?.model ?? ""}`);
  const pieces = before.pieces.map((piece) =>
    selected.has(piece.id)
      ? {
          ...piece,
          stage: "CANCELLED" as const,
          workState: "BLOCKED" as const,
          issueId: null,
          currentWorkVisitId: null,
          cancelledAt: occurredAt.toISOString(),
          cancellationReason: reason,
        }
      : piece,
  );
  const remaining = pieces.filter((piece) => piece.stage !== "CANCELLED");
  let status = before.status;
  if (remaining.length === 0) status = "CANCELLED";
  else if (
    status !== "AWAITING_APPROVAL" &&
    status !== "RETURNED" &&
    status !== "DELIVERY_FAILED"
  ) {
    status = deriveOrderStatusAfterCancellation(
      root.pieces.flatMap((piece) =>
        piece.orderPiece &&
        !selected.has(piece.id) &&
        piece.orderPiece.stage !== "CANCELLED"
          ? [piece.orderPiece]
          : [],
      ),
    );
    if (
      status === "READY_FOR_DELIVERY" &&
      root.pieces.some(
        (piece) =>
          !selected.has(piece.id) &&
          piece.orderPiece?.qualityCorrections.length,
      )
    )
      status = "APPROVED";
  }
  const money = calculateOrderMoney(
    root.pieces
      .filter(
        (piece) =>
          !selected.has(piece.id) && piece.orderPiece?.stage !== "CANCELLED",
      )
      .map((piece) => {
        if (!piece.orderPiece)
          throw new InternalServerError("Physical price is missing.");
        return parseMoneyCents(
          serializeDecimalToString(piece.orderPiece.unitPrice),
        );
      }),
    parseMoneyCents(before.money.paidAmount),
  );
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: before.version + 1,
    status,
    pieces,
    counts: deriveOrderCounts(pieces),
    money,
    returnProof:
      status === "RETURNED" && before.returnProof
        ? { ...before.returnProof, version: before.version + 1 }
        : null,
  });
  return {
    body,
    reason,
    before,
    after,
    result: resultFor(root.id, after, [...selected].sort()),
  };
};

export const planAdministrativeCorrection = ({
  root,
  effective,
  body,
  paper,
}: AdministrationCorrectionPlanInput): AdministrationCorrectionPlan => {
  if (root.id !== body.orderId) throw new OrderNotFoundError();
  assertVersion(root, body.expectedVersion);
  const initial = mapAdministrationCommandFacts(root);
  const current = administrationCorrectionValuesSchema.parse(effective);
  if (!isDeepStrictEqual(current, initial.correction))
    throw new InternalServerError(
      "The effective correction snapshot is inconsistent.",
    );
  const { paper: _paperPatch, ...contactPatch } = body.patch;
  const before = {
    ...initial,
    correction: { ...current, ...(paper && { paper: paper.before }) },
  };
  const correction = administrationCorrectionValuesSchema.parse({
    ...current,
    ...Object.fromEntries(
      Object.entries(contactPatch).filter(([, value]) => value !== undefined),
    ),
    ...(paper && { paper: paper.after }),
  });
  const changedFields = (Object.keys(correction) as (keyof typeof correction)[])
    .filter(
      (key) => !isDeepStrictEqual(correction[key], before.correction[key]),
    )
    .sort();
  if (changedFields.length === 0)
    throw new AdministrationCorrectionUnchangedError();
  const after = administrationCommandFactsSchema.parse({
    ...before,
    version: before.version + 1,
    correction,
    returnProof: before.returnProof
      ? { ...before.returnProof, version: before.version + 1 }
      : null,
  });
  return {
    body,
    reason: body.reason,
    changedFields,
    before,
    after,
    result: resultFor(root.id, after, []),
  };
};
