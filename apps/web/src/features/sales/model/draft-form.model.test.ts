import { act, renderHook } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { expect, it } from "vitest";
import { draftReplacementSchema } from "@template/contracts";
import { useZodForm } from "@/shared/forms/form";
import {
  DRAFT_PIECE_CAPTURE_FIELDS,
  applyDraftCommandError,
  draftEditRoute,
  fromDraftPaperLines,
  isDraftPieceCaptureField,
  makeBlankDraftPiece,
  makeDraftDefaults,
  parseDraftEntry,
  parseDraftListEntry,
  toDraftCapture,
  toDraftPaper,
  toDraftPaperLines,
} from "./draft-form.model";

const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
it("creates a complete blank replacement with one distinct physical UUID and no fabricated facts", () => {
  const values = makeDraftDefaults(),
    capture = toDraftCapture(values);
  expect(capture).toMatchObject({
    type: "SHOP",
    customerId: null,
    deliveryDate: null,
    paidAmount: null,
    responsibleSignature: null,
  });
  expect(capture.pieces).toHaveLength(1);
  expect(capture.pieces[0]?.id).not.toBe(makeBlankDraftPiece().id);
  const paper = toDraftPaper(values, {
    ownerName: "Actual sales owner",
    createdAt: null,
    draftId: null,
    customer: null,
  });
  expect(paper.salesperson).toBe("Actual sales owner");
  expect(paper.created).toBe("");
  expect(paper.id).toBe("مسودة غير محفوظة");
  expect(paper.total).toBeUndefined();
  expect(paper.balance).toBeUndefined();
  expect(paper.items[0]?.unitPrice).toBeUndefined();
});
it("round trips every independent capture and excludes price/workflow/display fields", () => {
  const values = makeDraftDefaults();
  const original = values.pieces[0];
  if (original === undefined) throw new Error("Expected blank piece");
  for (const [index, field] of DRAFT_PIECE_CAPTURE_FIELDS.entries())
    original[field] = ` القيمة ${String(index)} `;
  const paper = toDraftPaperLines(values);
  expect(paper[0]).toMatchObject({
    id: original.id,
    quantity: 1,
    soleAddition: " القيمة 10 ",
    additions: " القيمة 12 ",
  });
  const row = paper[0];
  if (row === undefined) throw new Error("Expected view row");
  row.unitPrice = "999";
  row.currentLocation = "في المستودع";
  row.quantity = 50;
  expect(fromDraftPaperLines(paper)).toEqual(values.pieces);
  expect(Object.keys(fromDraftPaperLines(paper)[0] ?? {}).sort()).toEqual(
    ["id", ...DRAFT_PIECE_CAPTURE_FIELDS].sort(),
  );
  expect(isDraftPieceCaptureField("soleAddition")).toBe(true);
  expect(isDraftPieceCaptureField("unitPrice")).toBe(false);
});
it("retains invalid raw editing values until explicit shared-schema validation", () => {
  const values = makeDraftDefaults();
  values.paidAmount = "-1";
  values.deliveryDate = "2026-02-30";
  const paper = toDraftPaperLines(values),
    row = paper[0];
  if (row === undefined) throw new Error("Expected row");
  row.model = "x".repeat(201);
  expect(fromDraftPaperLines(paper)[0]?.model).toHaveLength(201);
  expect(() =>
    toDraftPaper(values, {
      ownerName: "Sales",
      createdAt: null,
      draftId: null,
      customer: null,
    }),
  ).not.toThrow();
  expect(() =>
    toDraftCapture({ ...values, pieces: fromDraftPaperLines(paper) }),
  ).toThrow();
});
it.each([
  ["0001-01-02", "00000100.50", "100.50"],
  ["2000-02-29", "999999999.99", "999999999.99"],
])(
  "uses the shared exact date and decimal semantics",
  (deliveryDate, paidAmount, expected) => {
    const parsed = toDraftCapture({
      ...makeDraftDefaults(),
      deliveryDate,
      paidAmount,
    });
    expect(parsed.deliveryDate).toBe(deliveryDate);
    expect(parsed.paidAmount).toBe(expected);
  },
);
it("rejects wire authority, malformed date and invalid numeric captures without relaxing the contract", () => {
  const values = makeDraftDefaults();
  for (const change of [
    { ownerId: id },
    { status: "SUBMITTED" },
    { price: 0 },
    { deliveryDate: "0000-01-01" },
    { paidAmount: "1000000000.00" },
  ])
    expect(
      draftReplacementSchema.safeParse({ ...values, ...change }).success,
    ).toBe(false);
});
it.each(["", [id], "bad"])(
  "never treats supplied invalid edit %j as a new draft",
  (edit) => {
    expect(parseDraftEntry({ edit })).toEqual({
      kind: "invalid",
      reason: "INVALID_DRAFT_REFERENCE",
    });
  },
);
it("honors path/edit precedence and keeps invalid optional prefill visibly unresolved", () => {
  expect(parseDraftEntry({ edit: "bad", customer: "bad" }, id)).toEqual({
    kind: "edit",
    draftId: id,
  });
  expect(parseDraftEntry({ edit: id, customer: "bad" })).toEqual({
    kind: "edit",
    draftId: id,
  });
  expect(parseDraftEntry({ customer: "٠٥٠٠٠٠٠٠٠١" })).toEqual({
    kind: "new",
    customerPrefill: { kind: "phone", phone: "+966500000001" },
  });
  expect(parseDraftEntry({ customer: ["0500000001"] })).toEqual({
    kind: "new",
    customerPrefill: { kind: "invalid" },
  });
  expect(parseDraftEntry({ customer: " " })).toEqual({
    kind: "new",
    customerPrefill: { kind: "none" },
  });
  expect(draftEditRoute(id)).toBe(`/sales/orders/new?edit=${id}`);
  expect(() => draftEditRoute("/evil")).toThrow();
});
it("separates real draft filters, future status readiness and invalid queries", () => {
  expect(parseDraftListEntry(undefined)).toEqual({
    kind: "drafts",
    status: "ALL",
  });
  expect(parseDraftListEntry("مسودة")).toEqual({
    kind: "drafts",
    status: "DRAFT",
  });
  expect(parseDraftListEntry("في المستودع")).toEqual({
    kind: "unavailable",
    status: "في المستودع",
  });
  for (const value of ["", ["مسودة"], "unknown"])
    expect(parseDraftListEntry(value)).toEqual({
      kind: "invalid",
      reason: "INVALID_STATUS_QUERY",
    });
});
it("maps nested errors by submitted physical identity after reorder and never onto a replacement row", () => {
  const defaults = makeDraftDefaults();
  defaults.pieces = [
    { ...makeBlankDraftPiece(), id },
    { ...makeBlankDraftPiece(), id: other },
  ];
  const capture = toDraftCapture(defaults);
  const editor = renderHook(() =>
    useZodForm(draftReplacementSchema, { defaultValues: defaults }),
  );
  const snapshot = {
    capture,
    formToken: {},
    scope: { actorId: id, accessVersion: 1, epoch: 1 },
  };
  const failure = new AxiosError(
    "invalid",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 400,
      statusText: "bad",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        success: false,
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid",
        requestId: "safe-request",
        timestamp: "2026-11-05T00:00:00.000Z",
        path: "/api/v1/sales-drafts",
        errors: [
          { field: "body.draft.pieces.0.size", message: "Review size" },
          { field: "body.draft.pieces.1.unitPrice", message: "Unsupported" },
        ],
      },
    },
  );
  const firstPiece = defaults.pieces[0],
    secondPiece = defaults.pieces[1];
  if (firstPiece === undefined || secondPiece === undefined)
    throw new Error("Expected two submitted pieces");
  act(() => {
    editor.result.current.setValue("pieces", [secondPiece, firstPiece]);
    applyDraftCommandError(failure, editor.result.current, snapshot);
  });
  expect(
    editor.result.current.getFieldState("pieces.1.size").error?.message,
  ).toBe("Review size");
  expect(
    editor.result.current.getFieldState("pieces.0.size").error,
  ).toBeUndefined();
  act(() => {
    editor.result.current.clearErrors();
    editor.result.current.setValue("pieces", [
      { ...makeBlankDraftPiece(), id: other },
    ]);
    applyDraftCommandError(failure, editor.result.current, snapshot);
  });
  expect(
    editor.result.current.getFieldState("pieces.0.size").error,
  ).toBeUndefined();
  editor.unmount();
});
