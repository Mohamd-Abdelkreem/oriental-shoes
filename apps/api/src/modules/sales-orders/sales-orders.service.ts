import { randomUUID } from "node:crypto";
import {
  catalogFieldSchema,
  submissionCaptureSchema,
  type ResubmitOrderBody,
  type SetOrderPaidBody,
  type SalesOrderListQuery,
  type SalesOrderActivityQuery,
  type CustomerOrdersQuery,
  type CustomerOrderMeasurementsQuery,
  salesOrderSchema,
  type DraftCapture,
  type SalesOrderCommandData,
  type SubmitOrderBody,
  type PieceCatalogSelections,
  type CatalogField,
  type ReturnedOrderCorrections,
} from "@template/contracts";
import { Department, Prisma, type DatabaseClient } from "@template/database";
import {
  lockAccountRows,
  loadIdentityAccount,
  assertBusinessAuthority,
  type AuthorityAccount,
} from "../auth/account-authority.js";
import {
  isSalesLockTimeout,
  isSalesTransactionConflict,
  SalesTransactionConflictError,
} from "../sales-commands/sales-command.errors.js";
import { CustomerNotFoundError } from "../customers/customers.errors.js";
import {
  hashSalesCommandIntent,
  type SalesCommandExecutor,
} from "../sales-commands/sales-command-executor.js";
import {
  lockActiveCatalog,
  type ActiveCatalog,
} from "../catalogs/catalogs.queries.js";
import {
  calculateCatalogQuote,
  resolveCatalogSelection,
} from "../catalogs/catalogs.rules.js";
import { ValidationException } from "../../core/errors/validation.error.js";
import {
  DraftNotFoundError,
  DraftPieceConflictError,
  isDraftPieceIdConflict,
} from "../sales-drafts/sales-drafts.errors.js";
import { DRAFT_SELECT, mapDraft } from "../sales-drafts/sales-drafts.mapper.js";
import { getDraftReadiness } from "../sales-drafts/sales-drafts.queries.js";
import {
  toDraftCaptureHeaderValues,
  writeDraftCapture,
} from "../sales-drafts/sales-draft-capture.writer.js";
import {
  SALES_ORDER_SELECT,
  mapSalesOrder,
  type SalesOrderRecord,
} from "./sales-orders.mapper.js";
import {
  OrderCatalogUnavailableError,
  OrderCustomerChangedError,
  OrderQuoteChangedError,
  OrderNumberUnavailableError,
  OrderNotFoundError,
  OrderVersionConflictError,
  OrderStateConflictError,
  OrderCorrectionConflictError,
  OrderPaidUnchangedError,
} from "./sales-orders.errors.js";
import {
  findSalesOrderActivity,
  findSalesOrderRevision,
  findSalesOrderList,
  findSalesDashboard,
  findSalesOrderEditor,
  findSalesOrder,
  findCustomerOrders,
  findCustomerOrderMeasurements,
  readCurrentOrderReturnProof,
} from "./sales-orders.queries.js";
import { serializeDecimalToString } from "../../core/serialization/decimal.js";
import { getOrderBusinessYear } from "./sales-orders.calendar.js";
import {
  formatBusinessNumber,
  MAX_ORDER_SEQUENCE,
  parseMoneyCents,
  formatMoneyCents,
} from "./sales-orders.rules.js";

const bindActiveSelections = (
  capture: DraftCapture,
  active: ActiveCatalog,
): DraftCapture => ({
  ...capture,
  pieces: capture.pieces.map((piece, index) => {
    const catalogSelections: PieceCatalogSelections = {};
    for (const field of catalogFieldSchema.options) {
      const selection = resolveCatalogSelection(
        active.entries,
        active.sourceId,
        {
          kind: field,
          display: piece[field],
          entryId: piece.catalogSelections?.[field],
        },
      );
      if (selection.status === "invalid")
        throw new ValidationException([
          {
            field: `body.capture.pieces.${String(index)}.${field}`,
            message: "Select one exact current catalog entry.",
          },
        ]);
      if (selection.status === "resolved")
        catalogSelections[field] = selection.entry.id;
    }
    return { ...piece, catalogSelections };
  }),
});
const lockSubmissionCustomer = async (
  tx: Prisma.TransactionClient,
  input: SubmitOrderBody,
) => {
  await tx.$queryRaw`SELECT id FROM customers WHERE id=${input.capture.customerId}::uuid FOR SHARE`;
  const customer = await tx.customer.findUnique({
    where: { id: input.capture.customerId },
    select: {
      id: true,
      version: true,
      name: true,
      phone: true,
      email: true,
      address: true,
    },
  });
  if (customer === null) throw new CustomerNotFoundError();
  if (customer.version !== input.expectedCustomerVersion)
    throw new OrderCustomerChangedError();
  return customer;
};
const allocateOrderNumber = async (
  tx: Prisma.TransactionClient,
  type: DraftCapture["type"],
  year: number,
) => {
  const [counter] = await tx.$queryRaw<
    Array<{ last_issued: bigint }>
  >`SELECT last_issued FROM business_order_counter WHERE id='global' FOR UPDATE`;
  if (counter === undefined || counter.last_issued >= MAX_ORDER_SEQUENCE)
    throw new OrderNumberUnavailableError();
  const sequence = counter.last_issued + 1n;
  await tx.businessOrderCounter.update({
    where: { id: "global" },
    data: { lastIssued: sequence },
  });
  return {
    sequence,
    businessNumber: formatBusinessNumber(type, year, sequence),
  };
};
const prepareSubmissionTerms = async (
  tx: Prisma.TransactionClient,
  input: SubmitOrderBody,
  occurredAt: Date,
  businessTimeZone: string | null,
) => {
  const customer = await lockSubmissionCustomer(tx, input),
    active = await lockActiveCatalog(tx);
  if (active === null) throw new OrderCatalogUnavailableError();
  if (active.sourceId !== input.reviewedQuote.sourceId)
    throw new OrderQuoteChangedError();
  const capture = bindActiveSelections(input.capture, active);
  const quote = calculateCatalogQuote(active, {
    requestId: input.commandId,
    pieces: capture.pieces.map((piece) => ({
      id: piece.id,
      decoration: piece.decoration,
      catalogSelections: {
        decoration: piece.catalogSelections?.decoration ?? null,
      },
    })),
  });
  if (quote.availability !== "available")
    throw new OrderCatalogUnavailableError();
  if (
    quote.sourceId !== input.reviewedQuote.sourceId ||
    quote.fingerprint !== input.reviewedQuote.fingerprint
  )
    throw new OrderQuoteChangedError();
  const year = getOrderBusinessYear(occurredAt, businessTimeZone),
    number = await allocateOrderNumber(tx, capture.type, year);
  return { customer, active, capture, quote, year, number };
};
type FirstSubmissionContext = {
  id: string;
  input: SubmitOrderBody;
  actor: AuthorityAccount;
  occurredAt: Date;
  terms: Awaited<ReturnType<typeof prepareSubmissionTerms>>;
};
const writeSubmittedRoot = async (
  tx: Prisma.TransactionClient,
  context: FirstSubmissionContext,
) => {
  const {
    id,
    input,
    actor,
    occurredAt,
    terms: { capture },
  } = context;
  if (input.origin === "new")
    await tx.salesDraft.create({
      data: {
        id,
        ownerId: actor.id,
        status: "SUBMITTED",
        version: 1,
        ...toDraftCaptureHeaderValues(capture),
        createdAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
  await writeDraftCapture(tx, {
    draftId: id,
    capture,
    occurredAt,
    mode: input.origin === "new" ? "create" : "replace",
  });
  if (input.origin === "draft") {
    const updated = await tx.salesDraft.updateMany({
      where: {
        id,
        ownerId: actor.id,
        status: "DRAFT",
        version: input.expectedVersion,
      },
      data: {
        status: "SUBMITTED",
        version: { increment: 1 },
        updatedAt: occurredAt,
      },
    });
    if (updated.count !== 1) throw new OrderVersionConflictError();
  }
};
const writeFrozenOrderTerms = async (
  tx: Prisma.TransactionClient,
  context: FirstSubmissionContext,
) => {
  const {
    id,
    actor,
    occurredAt,
    terms: { customer, active, capture, quote, year, number },
  } = context;
  await tx.salesOrder.create({
    data: {
      id,
      businessNumber: number.businessNumber,
      numberSequence: number.sequence,
      numberYear: year,
      submittedAt: occurredAt,
      submittedById: actor.id,
      ownerFullNameAtSubmission: actor.fullName,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerAddress: customer.address,
      catalogSourceId: active.sourceId,
      totalAmount: quote.total,
      paidAmount: capture.paidAmount ?? "0.00",
    },
  });
  const entries = new Map(active.entries.map((entry) => [entry.id, entry]));
  await tx.salesOrderPiece.createMany({
    data: quote.items.map((item) => {
      const entry = entries.get(item.decorationEntryId);
      if (entry?.priceSourceCell === null || entry === undefined)
        throw new OrderCatalogUnavailableError();
      return {
        id: item.pieceId,
        orderId: id,
        decorationEntryId: item.decorationEntryId,
        priceSourceId: active.sourceId,
        decorationLabel: item.decoration,
        unitPrice: item.unitPrice,
        priceSourceCell: entry.priceSourceCell,
      };
    }),
  });
};

type ReturnedSelectionInput = {
  field: CatalogField;
  previous: SalesOrderRecord["pieces"][number];
  correction: ReturnedOrderCorrections["pieces"][number];
  pieceIndex: number;
};
const resolveReturnedSelection = (
  active: ActiveCatalog | null,
  input: ReturnedSelectionInput,
): string | undefined => {
  const { field, previous, correction, pieceIndex } = input;
  const retained = previous.catalogSelections.find(
    (selection) => selection.field === field,
  )?.entryId;
  if (field === "decoration") return retained;
  const requested = correction.catalogSelections?.[field];
  if (
    correction[field] === previous[field] &&
    (requested == null || requested === retained)
  )
    return retained;
  if (active === null) {
    if (correction[field] === null && requested == null) return undefined;
    throw new OrderCatalogUnavailableError();
  }
  const resolved = resolveCatalogSelection(active.entries, active.sourceId, {
    kind: field,
    display: correction[field],
    entryId: requested,
  });
  if (resolved.status === "invalid")
    throw new ValidationException([
      {
        field: `body.corrections.pieces.${String(pieceIndex)}.${requested == null ? field : `catalogSelections.${field}`}`,
        message: "Select one exact current catalog entry.",
      },
    ]);
  return resolved.status === "resolved" ? resolved.entry.id : undefined;
};
const resolveReturnedCapture = (
  root: SalesOrderRecord & { paidAmount: Prisma.Decimal | null },
  input: ResubmitOrderBody,
  active: ActiveCatalog | null,
) => {
  const parsed = submissionCaptureSchema.safeParse({
    type: root.type,
    customerId: root.customerId,
    paidAmount:
      root.paidAmount === null
        ? null
        : serializeDecimalToString(root.paidAmount),
    ...input.corrections,
    pieces: input.corrections.pieces.map((piece, index) => {
      const previous = root.pieces[index];
      if (previous === undefined) throw new OrderCorrectionConflictError();
      const references: PieceCatalogSelections = {};
      for (const field of catalogFieldSchema.options) {
        const entryId = resolveReturnedSelection(active, {
          field,
          previous,
          correction: piece,
          pieceIndex: index,
        });
        if (entryId !== undefined) references[field] = entryId;
      }
      return {
        ...piece,
        decoration: previous.decoration,
        catalogSelections: references,
      };
    }),
  });
  if (!parsed.success)
    throw new ValidationException(
      parsed.error.issues.map((issue) => ({
        field: `body.corrections.${issue.path.map(String).join(".")}`,
        message: issue.message,
      })),
    );
  return parsed.data;
};

export class SalesOrdersService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly commands: SalesCommandExecutor,
    private readonly businessTimeZone: string | null,
  ) {}
  list(actorId: string, query: SalesOrderListQuery) {
    return this.read(actorId, (tx, actor) =>
      findSalesOrderList(tx, actor, query),
    );
  }
  dashboard(actorId: string) {
    return this.read(actorId, (tx, actor) => findSalesDashboard(tx, actor));
  }
  editor(actorId: string, orderId: string) {
    return this.read(actorId, (tx, actor) =>
      findSalesOrderEditor(tx, actor, orderId),
    );
  }
  get(actorId: string, orderId: string) {
    return this.read(actorId, async (tx, actor) => ({
      order: await findSalesOrder(tx, actor, orderId),
    }));
  }
  tracking(actorId: string, orderId: string) {
    return this.read(actorId, async (tx, actor) => {
      const order = await findSalesOrder(tx, actor, orderId);
      return {
        orderId,
        orderVersion: order.version,
        counts: order.counts,
        pieces: order.pieces.map((piece) => ({
          pieceId: piece.id,
          stage: piece.stage,
          workState: piece.workState,
          receivedAt: piece.receivedAt,
          cancelledAt: piece.cancelledAt,
          cancellationReason: piece.cancellationReason,
        })),
      };
    });
  }
  customerOrders(
    actorId: string,
    customerId: string,
    query: CustomerOrdersQuery,
  ) {
    return this.read(actorId, async (tx, actor) => {
      await this.requireCustomer(tx, customerId);
      return findCustomerOrders(tx, actor, customerId, query);
    });
  }
  customerMeasurements(
    actorId: string,
    customerId: string,
    query: CustomerOrderMeasurementsQuery,
  ) {
    return this.read(actorId, async (tx, actor) => {
      await this.requireCustomer(tx, customerId);
      return findCustomerOrderMeasurements(tx, actor, customerId, query);
    });
  }
  private async requireCustomer(
    tx: Prisma.TransactionClient,
    customerId: string,
  ) {
    if (
      (await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      })) === null
    )
      throw new CustomerNotFoundError();
  }
  activity(actorId: string, query: SalesOrderActivityQuery, orderId?: string) {
    return this.read(actorId, async (tx, actor) => {
      if (orderId !== undefined) await findSalesOrderEditor(tx, actor, orderId);
      return findSalesOrderActivity(tx, actor, query, orderId);
    });
  }
  revision(actorId: string, orderId: string, eventId: string) {
    return this.read(actorId, (tx, actor) =>
      findSalesOrderRevision(tx, actor, orderId, eventId),
    );
  }
  submit(
    actorId: string,
    input: SubmitOrderBody,
  ): Promise<SalesOrderCommandData> {
    const operation =
        input.origin === "new" ? "SUBMIT_NEW_ORDER" : "SUBMIT_DRAFT",
      targetId = input.origin === "new" ? null : input.draftId,
      expectedVersion = input.origin === "new" ? null : input.expectedVersion;
    return this.commands
      .execute({
        kind: "order",
        operation,
        actorId,
        commandId: input.commandId,
        targetId,
        expectedVersion,
        payloadHash: hashSalesCommandIntent({
          operation,
          targetId,
          expectedVersion,
          payload: input,
        }),
        work: async (tx, actor, occurredAt) => {
          const id = input.origin === "new" ? randomUUID() : input.draftId;
          const before = await this.submissionBefore(tx, actor, input);
          const terms = await prepareSubmissionTerms(
            tx,
            input,
            occurredAt,
            this.businessTimeZone,
          );
          const context = { id, input, actor, occurredAt, terms };
          await writeSubmittedRoot(tx, context);
          await writeFrozenOrderTerms(tx, context);
          return {
            before,
            after: salesOrderSchema.parse(
              mapSalesOrder(
                await tx.salesDraft.findUniqueOrThrow({
                  where: { id },
                  select: SALES_ORDER_SELECT,
                }),
                actor,
              ),
            ),
          };
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof DraftNotFoundError ||
          error instanceof DraftPieceConflictError ||
          isDraftPieceIdConflict(error)
        )
          throw new OrderNotFoundError();
        throw error;
      });
  }
  resubmit(
    actorId: string,
    orderId: string,
    input: ResubmitOrderBody,
  ): Promise<SalesOrderCommandData> {
    return this.commands.execute({
      kind: "order",
      operation: "RESUBMIT_ORDER",
      actorId,
      commandId: input.commandId,
      targetId: orderId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashSalesCommandIntent({
        operation: "RESUBMIT_ORDER",
        targetId: orderId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await this.lockOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          ownerOnly: true,
        });
        const proof = await readCurrentOrderReturnProof(tx, orderId);
        if (proof === null) throw new OrderStateConflictError();
        const before = mapSalesOrder(root, actor);
        if (
          input.corrections.pieces.length !== root.pieces.length ||
          input.corrections.pieces.some(
            (piece, index) => piece.id !== root.pieces[index]?.id,
          )
        )
          throw new OrderCorrectionConflictError();
        const active = await lockActiveCatalog(tx);
        const capture = resolveReturnedCapture(root, input, active);
        await writeDraftCapture(tx, {
          draftId: orderId,
          capture,
          mode: "replace",
          occurredAt,
        });
        await tx.salesDraft.update({
          where: { id: orderId, version: input.expectedVersion },
          data: { version: { increment: 1 }, updatedAt: occurredAt },
        });
        await tx.salesOrder.update({
          where: { id: orderId },
          data: {
            status: "AWAITING_APPROVAL",
            currentReturnDecisionId: null,
            currentReturnOrderVersion: null,
            currentReturnReason: null,
            currentReturnedAt: null,
          },
        });
        return {
          before,
          after: salesOrderSchema.parse(
            mapSalesOrder(
              await tx.salesDraft.findUniqueOrThrow({
                where: { id: orderId },
                select: SALES_ORDER_SELECT,
              }),
              actor,
            ),
          ),
        };
      },
    });
  }
  setPaid(
    actorId: string,
    orderId: string,
    input: SetOrderPaidBody,
  ): Promise<SalesOrderCommandData> {
    return this.commands.execute({
      kind: "order",
      operation: "SET_ORDER_PAID",
      actorId,
      commandId: input.commandId,
      targetId: orderId,
      expectedVersion: input.expectedVersion,
      payloadHash: hashSalesCommandIntent({
        operation: "SET_ORDER_PAID",
        targetId: orderId,
        expectedVersion: input.expectedVersion,
        payload: input,
      }),
      work: async (tx, actor, occurredAt) => {
        const root = await this.lockOrder(tx, {
          actor,
          orderId,
          expectedVersion: input.expectedVersion,
          ownerOnly: false,
        });
        const before = mapSalesOrder(root, actor);
        if (!before.allowedActions.canSetPaid)
          throw new OrderStateConflictError();
        const amount = formatMoneyCents(parseMoneyCents(input.paidAmount));
        if (amount === before.money.paidAmount)
          throw new OrderPaidUnchangedError();
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: amount },
        });
        await tx.salesDraft.update({
          where: { id: orderId, version: input.expectedVersion },
          data: { version: { increment: 1 }, updatedAt: occurredAt },
        });
        return {
          before,
          after: salesOrderSchema.parse(
            mapSalesOrder(
              await tx.salesDraft.findUniqueOrThrow({
                where: { id: orderId },
                select: SALES_ORDER_SELECT,
              }),
              actor,
            ),
          ),
        };
      },
    });
  }
  private async lockOrder(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthorityAccount;
      orderId: string;
      expectedVersion: number;
      ownerOnly: boolean;
    },
  ) {
    const rows =
      input.ownerOnly || input.actor.role !== "ADMIN"
        ? await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM sales_drafts WHERE id=${input.orderId}::uuid AND owner_id=${input.actor.id}::uuid AND status='SUBMITTED' FOR UPDATE`
        : await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM sales_drafts WHERE id=${input.orderId}::uuid AND status='SUBMITTED' FOR UPDATE`;
    if (rows.length !== 1) throw new OrderNotFoundError();
    const root = await tx.salesDraft.findUniqueOrThrow({
      where: { id: input.orderId },
      select: { ...SALES_ORDER_SELECT, paidAmount: true },
    });
    if (root.version !== input.expectedVersion || root.version >= 2147483647)
      throw new OrderVersionConflictError();
    return root;
  }
  private async submissionBefore(
    tx: Prisma.TransactionClient,
    actor: AuthorityAccount,
    input: SubmitOrderBody,
  ) {
    if (input.origin === "new") return null;
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM sales_drafts WHERE id=${input.draftId}::uuid AND owner_id=${actor.id}::uuid FOR UPDATE`;
    if (locked.length !== 1) throw new OrderNotFoundError();
    const draft = await tx.salesDraft.findUniqueOrThrow({
      where: { id: input.draftId },
      select: DRAFT_SELECT,
    });
    if (draft.status !== "DRAFT") throw new OrderStateConflictError();
    if (draft.version !== input.expectedVersion || draft.version >= 2147483647)
      throw new OrderVersionConflictError();
    return mapDraft(draft, await getDraftReadiness(tx, this.businessTimeZone));
  }
  private async read<T>(
    actorId: string,
    work: (tx: Prisma.TransactionClient, actor: AuthorityAccount) => Promise<T>,
  ): Promise<T> {
    let retried = false;
    for (;;) {
      try {
        return await this.database.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT set_config('lock_timeout', '5000ms', true)`;
            await lockAccountRows(tx, [actorId], "read");
            const actor = await loadIdentityAccount(tx, actorId);
            assertBusinessAuthority(actor, Department.SALES);
            return work(tx, actor);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isSalesLockTimeout(error))
          throw new SalesTransactionConflictError();
        if (isSalesTransactionConflict(error)) {
          if (!retried) {
            retried = true;
            continue;
          }
          throw new SalesTransactionConflictError();
        }
        throw error;
      }
    }
  }
}
