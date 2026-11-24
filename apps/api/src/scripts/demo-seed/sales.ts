import { randomInt, randomUUID } from "node:crypto";
import {
  catalogDataSchema,
  type catalogEntrySchema,
  catalogQuoteDataSchema,
  customerCommandDataSchema,
  draftCommandDataSchema,
  draftCaptureSchema,
  formatDraftReference,
  returnedOrderCorrectionsSchema,
  salesOrderCommandDataSchema,
  salesOrderDataSchema,
  type CustomerDto,
  type SalesOrderCommandData,
  type SalesOrderType,
} from "@template/contracts";
import type { z } from "zod";
import {
  formatMoneyCents,
  parseMoneyCents,
} from "../../modules/sales-orders/sales-orders.rules.js";
import { DemoSeedError, type DemoRequest } from "./http.js";

type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type DemoOrder = {
  id: string;
  number: string;
  version: number;
  pieceIds: string[];
};
const fromSavedOrder = (
  saved: SalesOrderCommandData["savedOrder"],
): DemoOrder => ({
  id: saved.id,
  number: saved.businessNumber,
  version: saved.version,
  pieceIds: saved.pieces.map(({ id }) => id),
});

const customerDetails = [
  ["محمد العتيبي", "حي الروضة، الرياض"],
  ["أحمد القحطاني", "حي الشفا، الرياض"],
  ["خالد الحربي", "حي الروابي، الرياض"],
  ["يوسف الدوسري", "حي المونسية، الرياض"],
  ["عمر الزهراني", "حي السلامة، جدة"],
  ["عبدالله الشهراني", "حي الصفا، جدة"],
  ["عبدالرحمن الغامدي", "حي النسيم، جدة"],
  ["سلمان المطيري", "حي النزهة، جدة"],
  ["إبراهيم السبيعي", "حي الفيصلية، الدمام"],
  ["حسن العمري", "حي الشاطئ، الدمام"],
  ["ماجد العنزي", "حي الغدير، الرياض"],
  ["عبدالعزيز المالكي", "حي العارض، الرياض"],
  ["طلال اليامي", "حي المروج، الرياض"],
  ["راشد التميمي", "حي الرائد، الرياض"],
  ["فيصل الشهري", "حي اليرموك، الرياض"],
  ["سعد الشمري", "حي القيروان، الرياض"],
] as const;

const createCustomers = async (sales: DemoRequest, batch: string) => {
  const customers: CustomerDto[] = [];
  for (const [index, [name, address]] of customerDetails.entries()) {
    const customer = await sales("/customers", customerCommandDataSchema, {
      commandId: randomUUID(),
      customer: {
        name,
        phone: `05${pick(["0", "3", "4", "5", "6", "8", "9"], index)}${randomInt(0, 10_000_000).toString().padStart(7, "0")}`,
        email: `customer${String(index + 1)}.${batch}@demo.oriental.invalid`,
        address,
      },
    });
    customers.push(customer.savedCustomer);
  }
  return customers;
};

const pick = <T>(entries: readonly T[], index: number): T => {
  const choice = entries[index % entries.length];
  if (choice === undefined)
    throw new DemoSeedError(
      "Required catalog or customer selection is missing",
    );
  return choice;
};

const makePiece = (
  catalog: CatalogEntry[],
  decorations: CatalogEntry[],
  index: number,
) => {
  const choose = (kind: CatalogEntry["kind"], entries = catalog) =>
    pick(
      entries.filter((entry) => entry.kind === kind),
      index,
    );
  const model = choose("model");
  const size = choose(
    "size",
    catalog.filter((entry) =>
      /^(39|40|41|42|43|44|45)$/u.test(entry.displayValue),
    ),
  );
  const leatherBase = choose("leatherBase");
  const decoration = pick(decorations, index);
  const sole = choose("sole");
  const aField = choose("aField");
  const fField = choose("fField");
  return {
    id: randomUUID(),
    model: model.displayValue,
    size: size.displayValue,
    leatherBase: leatherBase.displayValue,
    decoration: decoration.displayValue,
    sole: sole.displayValue,
    aField: aField.displayValue,
    fField: fField.displayValue,
    face: pick(
      ["وجه سادة", "وجه بخياطة مزدوجة", "وجه بخياطة بلون الجلد"],
      index,
    ),
    catalogSelections: {
      model: model.id,
      size: size.id,
      leatherBase: leatherBase.id,
      decoration: decoration.id,
      sole: sole.id,
      aField: aField.id,
      fField: fField.id,
    },
  };
};

const quote = (
  sales: DemoRequest,
  pieces: {
    id: string;
    decoration: string;
    catalogSelections: { decoration: string };
  }[],
) =>
  sales("/catalogs/quotes", catalogQuoteDataSchema, {
    requestId: randomUUID(),
    pieces: pieces.map(({ id, decoration, catalogSelections }) => ({
      id,
      decoration,
      catalogSelections: { decoration: catalogSelections.decoration },
    })),
  });

const pricedDecorations = async (
  sales: DemoRequest,
  catalog: CatalogEntry[],
) => {
  const candidates = catalog.filter(({ kind }) => kind === "decoration");
  const prices = await quote(
    sales,
    candidates.map((entry) => ({
      id: entry.id,
      decoration: entry.displayValue,
      catalogSelections: { decoration: entry.id },
    })),
  );
  const priced = new Set(
    prices.items
      .filter((item) => item.availability === "available")
      .map(({ pieceId }) => pieceId),
  );
  return candidates.filter(({ id }) => priced.has(id));
};

export const dateAfter = (businessDate: string, days: number) => {
  const date = new Date(`${businessDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const prepareDemoSales = async (
  sales: DemoRequest,
  options: {
    batch: string;
    businessDate: string;
    sellerName: string;
  },
) => {
  const catalog = await sales("/catalogs", catalogDataSchema);
  if (catalog.availability !== "available")
    throw new DemoSeedError(
      "Load the reviewed catalog before running the demo seed",
    );
  const decorations = await pricedDecorations(sales, catalog.entries);
  makePiece(catalog.entries, decorations, 0);
  const customers = await createCustomers(sales, options.batch);
  const capture = (index: number, type: SalesOrderType, quantity: number) => {
    const customer = pick(customers, index);
    return {
      customer,
      fields: {
        type,
        customerId: customer.id,
        deliveryDate: dateAfter(options.businessDate, (index % 12) - 2),
        generalNotes: pick(
          [
            "يرجى الاتصال قبل التجهيز للتسليم.",
            "التغليف في علبة منفصلة لكل زوج.",
            "الاستلام من المعرض بعد إشعار العميل.",
            "التأكد من المقاس ومراجعة لون الخياطة قبل التغليف.",
          ],
          index,
        ),
        responsibleSignature: options.sellerName,
        repairNote:
          type === "REPAIR"
            ? "إعادة تثبيت النعل وإصلاح الخياطة الجانبية."
            : null,
        adjustmentRequested:
          type === "ADJUSTMENT" ? "توسيع بسيط عند مشط القدم." : null,
        adjustmentReason:
          type === "ADJUSTMENT" ? "ضيق في مقدمة الحذاء عند القياس." : null,
        pieces: Array.from({ length: quantity }, (_, position) =>
          makePiece(catalog.entries, decorations, index + position),
        ),
      },
    };
  };
  const draft = (fields: ReturnType<typeof capture>["fields"]) =>
    sales("/sales-drafts", draftCommandDataSchema, {
      commandId: randomUUID(),
      draft: fields,
    });

  const submit = async (
    index: number,
    type: SalesOrderType,
    quantity: number,
  ) => {
    const { customer, fields } = capture(index, type, quantity);
    const reviewed = await quote(sales, fields.pieces);
    if (reviewed.availability !== "available")
      throw new DemoSeedError("A selected decoration could not be quoted");
    const total = parseMoneyCents(reviewed.total);
    const paidAmount = formatMoneyCents(pick([0n, total / 2n, total], index));
    const savedDraft =
      index % 4 === 0 ? (await draft(fields)).savedDraft : null;
    const submitted = await sales(
      "/sales-orders",
      salesOrderCommandDataSchema,
      {
        ...(savedDraft
          ? {
              origin: "draft",
              draftId: savedDraft.id,
              expectedVersion: savedDraft.version,
            }
          : { origin: "new" }),
        commandId: randomUUID(),
        expectedCustomerVersion: customer.version,
        capture: { ...fields, paidAmount },
        reviewedQuote: {
          sourceId: reviewed.sourceId,
          fingerprint: reviewed.fingerprint,
        },
      },
    );
    return fromSavedOrder(submitted.savedOrder);
  };

  const saveDraft = async (index: number, type: SalesOrderType) => {
    const { fields } = capture(index, type, 2);
    const { savedDraft } = await draft(fields);
    const updated = await sales(
      `/sales-drafts/${savedDraft.id}`,
      draftCommandDataSchema,
      {
        commandId: randomUUID(),
        expectedVersion: savedDraft.version,
        draft: draftCaptureSchema.parse({
          ...fields,
          generalNotes:
            "أكد العميل اللون ومقاس الحذاء. في انتظار تأكيد موعد الاستلام.",
        }),
      },
      "PUT",
    );
    return formatDraftReference(
      updated.savedDraft.id,
      updated.savedDraft.draftSequence,
    );
  };

  return {
    submit,
    saveDraft,
    customers,
    contactSize: async (order: DemoOrder, pieceId: string) => {
      const { order: current } = await sales(
        `/sales-orders/${order.id}`,
        salesOrderDataSchema,
      );
      const piece = current.pieces.find(({ id }) => id === pieceId);
      if (!piece) throw new DemoSeedError("Piece missing from the sales order");
      return pick(
        catalog.entries.filter(
          ({ kind, displayValue }) =>
            kind === "size" &&
            /^(39|40|41|42|43|44|45)$/u.test(displayValue) &&
            displayValue !== piece.size,
        ),
        3,
      ).id;
    },
  };
};

export const resubmitDemoOrder = async (
  sales: DemoRequest,
  order: DemoOrder,
) => {
  const current = (
    await sales(`/sales-orders/${order.id}`, salesOrderDataSchema)
  ).order;
  const corrections = returnedOrderCorrectionsSchema.parse({
    deliveryDate: current.deliveryDate,
    generalNotes: "تم تأكيد تعليمات التغليف وموعد الاستلام مع العميل.",
    responsibleSignature: current.responsibleSignature,
    repairNote: current.repairNote,
    adjustmentRequested: current.adjustmentRequested,
    adjustmentReason: current.adjustmentReason,
    adjustmentActionTaken: current.adjustmentActionTaken,
    pieces: current.pieces.map(
      ({
        position: _position,
        quantity: _quantity,
        decoration: _decoration,
        catalogSelections,
        stage: _stage,
        workState: _workState,
        unitPrice: _price,
        receivedAt: _received,
        decorationEntryId: _entry,
        catalogSourceId: _source,
        cancelledAt: _cancelled,
        cancellationReason: _reason,
        ...piece
      }) => {
        const { decoration: _locked, ...selections } = catalogSelections ?? {};
        return { ...piece, catalogSelections: selections };
      },
    ),
  });
  const submitted = await sales(
    `/sales-orders/${order.id}/resubmit`,
    salesOrderCommandDataSchema,
    {
      commandId: randomUUID(),
      expectedVersion: current.version,
      corrections,
    },
  );
  order.version = submitted.savedOrder.version;
};
