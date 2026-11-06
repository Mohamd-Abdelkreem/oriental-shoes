import {
  authUserDataSchema,
  catalogDataSchema,
  draftCaptureSchema,
  draftSchema,
  salesOrderSchema,
  type CatalogField,
} from "@template/contracts";

export const p03Ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  order: "22222222-2222-4222-8222-222222222222",
  piece: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  source: "55555555-5555-4555-8555-555555555555",
  command: "66666666-6666-4666-8666-666666666666",
};
export const p03Instant = "2026-11-06T00:00:00.000Z";
// Synthetic wire fixtures. These do not establish real workbook or downstream lifecycle admission.
export const catalogFixture = () => {
  const fields: readonly CatalogField[] = [
    "model",
    "size",
    "leatherBase",
    "decoration",
    "decorationColor",
    "sole",
    "soleAddition",
    "soleColor",
    "aField",
    "fField",
  ];
  const counts = [7, 55, 590, 14, 1010, 12, 5, 40, 81, 60];
  let sequence = 1;
  return catalogDataSchema.parse({
    availability: "available",
    sourceId: p03Ids.source,
    sourceSha256: "a".repeat(64),
    activatedAt: p03Instant,
    entries: fields.flatMap((kind, index) =>
      Array.from({ length: counts[index] ?? 0 }, (_, position) => {
        const id = `99999999-9999-4999-8999-${String(sequence++).padStart(12, "0")}`;
        return {
          id,
          kind,
          sourceCell: `${String.fromCharCode(65 + index)}${String(position + 1)}`,
          displayValue:
            kind === "decoration"
              ? position === 0
                ? "زبيري - z"
                : position === 1
                  ? "نعام - O"
                  : position === 9
                    ? "سادة - S"
                    : `decoration ${String(position)}`
              : kind === "size"
                ? String(25 + position * 0.5)
                : kind === "model" && position === 0
                  ? "SM"
                  : `${kind} ${String(position)}`,
          family:
            kind === "decorationColor" ? { key: "L", label: "نعام - O" } : null,
          position: position + 1,
        };
      }),
    ),
  });
};
export const p03Session = (actor = p03Ids.actor) =>
  authUserDataSchema.parse({
    user: {
      id: actor,
      fullName: "Sales",
      email: "sales@example.test",
      phone: null,
      role: "USER",
      status: "ACTIVE",
      department: "SALES",
      staffApprovedAt: p03Instant,
      emailVerifiedAt: p03Instant,
      accessVersion: 1,
      createdAt: p03Instant,
      updatedAt: p03Instant,
    },
  });
export const draftFixture = (version = 1) => {
  const { customerId: _customerId, ...capture } = draftCaptureSchema.parse({
    type: "SHOP",
    pieces: [{ id: p03Ids.piece }],
  });
  return draftSchema.parse({
    ...capture,
    id: p03Ids.order,
    version,
    status: "DRAFT",
    owner: { id: p03Ids.actor, fullName: "Sales" },
    customer: null,
    pieces: capture.pieces.map((piece) => ({
      ...piece,
      position: 1,
      quantity: 1,
    })),
    createdAt: p03Instant,
    updatedAt: p03Instant,
    pricing: { availability: "unavailable", reason: "CATALOG_NOT_LOADED" },
    submission: { available: false, reason: "CATALOG_NOT_LOADED" },
  });
};
export const orderFixture = (version = 1) => {
  const draft = draftFixture(),
    catalog = catalogFixture(),
    entry =
      catalog.availability === "available"
        ? catalog.entries.find((e) => e.kind === "decoration")
        : undefined;
  if (!entry) throw new Error("Missing fixture decoration");
  return salesOrderSchema.parse({
    id: p03Ids.order,
    version,
    owner: draft.owner,
    type: "SHOP",
    status: "AWAITING_APPROVAL",
    businessNumber: "SHOP-2026-0001",
    businessYear: 2026,
    sequence: "1",
    customerId: p03Ids.customer,
    customerSnapshot: {
      name: "Frozen contact",
      phone: "+966501234567",
      email: null,
      address: "Frozen address",
    },
    createdAt: p03Instant,
    updatedAt: p03Instant,
    submittedAt: p03Instant,
    deliveryDate: null,
    generalNotes: null,
    responsibleSignature: null,
    repairNote: null,
    adjustmentRequested: null,
    adjustmentReason: null,
    adjustmentActionTaken: null,
    money: {
      total: "1800.00",
      paidAmount: "0.00",
      remainingDue: "1800.00",
      surplus: "0.00",
    },
    counts: {
      original: 1,
      cancelled: 0,
      active: 1,
      received: 0,
      completionPercent: 0,
    },
    approval: {
      approvedAt: null,
      returnDecisionId: null,
      returnedAt: null,
      returnReason: null,
      returnRevision: 0,
    },
    allowedActions: { canResubmit: false, canSetPaid: false },
    pieces: draft.pieces.map((piece) => ({
      ...piece,
      model: "SM",
      size: "40",
      leatherBase: "leatherBase 0",
      decoration: entry.displayValue,
      face: "standard",
      catalogSelections: { decoration: entry.id },
      decorationEntryId: entry.id,
      catalogSourceId: p03Ids.source,
      unitPrice: "1800.00",
      stage: "AWAITING_APPROVAL",
      workState: "INCOMING",
      receivedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    })),
  });
};
export const p03Envelope = (data: unknown, statusCode = 200) => ({
  data: {
    success: true,
    statusCode,
    message: "OK",
    data,
    requestId: "p03-test",
    timestamp: p03Instant,
    path: "/api/v1/test",
  },
});
export const p03Pagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
