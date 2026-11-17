import { expect, it } from "vitest";
import {
  administrationOrderSummarySchema,
  draftSummarySchema,
  salesOrderSummarySchema,
} from "@template/contracts";
import { draftFixture, orderFixture, p03Ids } from "@/test/p03-fixtures";
import { p08DetailFixture, p08DraftDetailFixture } from "@/test/p08-fixtures";
import {
  toAdministrationOrderRow,
  toAdministrationPaper,
  toAdministrationDraftPaper,
  toAdministrationTracking,
} from "./administration-view.model";

it("keeps mixed-root rows truthful without manufacturing facts for a draft", () => {
  const draft = draftSummarySchema
    .strip()
    .parse({ ...draftFixture(), pieceCount: 1 });
  const row = toAdministrationOrderRow({ kind: "draft", draft });
  expect(row).toMatchObject({
    id: p03Ids.order,
    kind: "draft",
    customerName: null,
    phone: null,
    capturedPieceCount: 1,
    counts: null,
    currentDepartments: [],
    isOverdue: false,
    canPrint: false,
  });
  expect(row.reference).toContain("مسودة");
  const order = administrationOrderSummarySchema.parse({
    ...salesOrderSummarySchema
      .strip()
      .parse({ ...orderFixture(), returnInfo: null }),
    currentDepartments: [],
    isOverdue: false,
    hasQualityCorrectionHistory: false,
    hasOpenQualityCorrection: false,
    adminActions: { canCancel: true, canCorrect: true, canPrint: false },
  });
  expect(toAdministrationOrderRow({ kind: "submitted", order })).toMatchObject({
    reference: order.businessNumber,
    customerName: "Frozen contact",
    counts: order.counts,
    ownerName: order.owner.fullName,
  });
  const paper = toAdministrationDraftPaper(p08DraftDetailFixture().draft);
  expect(paper).toMatchObject({
    id: p03Ids.order,
    status: "مسودة",
    segments: [],
    customer: "",
  });
  expect(paper.items).toHaveLength(1);
  expect(paper.total).toBeUndefined();
});
it("keeps paper and tracking at the same actual submitted snapshot and rejects mixed versions", () => {
  const detail = p08DetailFixture(3);
  expect(toAdministrationPaper(detail)).toMatchObject({
    customer: "Frozen contact",
    address: "Frozen address",
    total: "1800.00",
    paid: "0.00",
    segments: [],
  });
  expect(toAdministrationTracking(detail)).toMatchObject({
    orderId: p03Ids.order,
    version: 3,
    ready: false,
    counts: detail.order.counts,
  });
  expect(() =>
    toAdministrationTracking({
      ...detail,
      tracking: { ...detail.tracking, orderVersion: 2 },
    }),
  ).toThrow("Tracking revision");
});
