import { render, screen, within } from "@testing-library/react";
import { factoryOrderPaperDataSchema } from "@template/contracts";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { orderFixture } from "@/test/p03-fixtures";
import {
  toAuthoritativePaperState,
  toSubmittedPaper,
} from "@/features/sales/model/order-view.model";
import {
  FactoryWorkInstructions,
  FactoryOrderPaper,
} from "./factory-order-paper";
import { OrderPaperForm } from "./order-paper-form";

it("retains safe approved fields while omitting financial columns and private actions", () => {
  const { paper } = manufacturingDetailFixture(),
    first = paper.order.pieces[0];
  if (!first) throw new Error("Missing piece");
  first.soleAddition = "Middle sole addition";
  first.additions = "Final addition";
  first.aField = "40.5";
  first.fField = "39.5";
  first.faceRight = "Right face";
  first.sideNotes = "Approved side instruction";
  render(<FactoryOrderPaper data={paper} />);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(
    screen.getByRole("img", { name: "شعار مصنع الحذاء الشرقي" }),
  ).toBeInTheDocument();
  for (const text of [
    "Middle sole addition",
    "Final addition",
    "40.5",
    "39.5",
    "Right face",
    "Approved side instruction",
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "السعر" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "الإجمالي" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Frozen contact")).not.toBeInTheDocument();
  expect(screen.queryByText("1800.00")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /طباعة/u }),
  ).not.toBeInTheDocument();
});

it("keeps one measurement table for a multi-piece order and keeps factory instructions beside the paper", () => {
  const { paper } = manufacturingDetailFixture();
  const first = paper.order.pieces[0];
  const submitted = orderFixture(2);
  const submittedFirst = submitted.pieces[0];
  if (!first || !submittedFirst) throw new Error("Missing piece");
  first.aField = submittedFirst.aField = "23";
  first.fField = submittedFirst.fField = "14";
  const companion = {
    ...first,
    id: "acacacac-acac-4cac-8cac-acacacacacac",
    position: 2,
    aField: "40.5",
    fField: "39.5",
    sideNotes: "ملاحظة خاصة بالقطعة الثانية",
    paperCodes: ["X", "R.D1/2"] as const,
  };
  const factoryPaper = factoryOrderPaperDataSchema.parse({
    order: {
      ...paper.order,
      type: "GIFT",
      businessNumber: "GIFT-2026-0001",
      generalNotes: "ضع كل زوج في علبة منفصلة",
      pieces: [first, companion],
      counts: { ...paper.order.counts, original: 2, active: 2 },
    },
    issues: [
      {
        issueId: "abababab-abab-4bab-8bab-abababababab",
        pieceId: companion.id,
        state: "RESOLVED",
        reason: "مراجعة بطانة القطعة",
        reportNotes: "تم فحص البطانة",
        approvedInstructions: "استخدم البطانة المعتمدة",
        target: "CUTTING",
      },
    ],
  });
  const salesOrder = {
    ...submitted,
    type: factoryPaper.order.type,
    businessNumber: factoryPaper.order.businessNumber,
    generalNotes: factoryPaper.order.generalNotes,
    pieces: [
      submittedFirst,
      {
        ...submittedFirst,
        ...companion,
        paperCodes: [...companion.paperCodes],
      },
    ],
  };
  render(
    <>
      <OrderPaperForm
        order={toSubmittedPaper(salesOrder)}
        displayReference={salesOrder.businessNumber}
        dataState={toAuthoritativePaperState(salesOrder, null)}
      />
      <FactoryWorkInstructions data={factoryPaper} />
      <FactoryOrderPaper data={factoryPaper} />
    </>,
  );
  for (const sheet of screen.getAllByRole("article")) {
    const paper = within(sheet);
    expect(paper.getByText("أمر هدية")).toBeVisible();
    expect(paper.getByText(/يلزم عمل الكمية الموضحة أعلاه/u)).toBeVisible();
    expect(
      paper.getAllByText(factoryPaper.order.generalNotes ?? ""),
    ).toHaveLength(1);
    expect(
      paper.getAllByRole("columnheader", { name: /^المقاس$/u }),
    ).toHaveLength(1);
    expect(paper.getByText("23", { exact: true })).toBeVisible();
    expect(paper.getByText("14", { exact: true })).toBeVisible();
    expect(
      paper.queryByRole("caption", { name: /قياسات القطعة/u }),
    ).not.toBeInTheDocument();
    expect(paper.queryByText("40.5", { exact: true })).not.toBeInTheDocument();
    expect(paper.queryByText(companion.sideNotes)).not.toBeInTheDocument();
    expect(paper.getByText("X · R.D1/2")).toBeVisible();
    expect(paper.getByText(factoryPaper.order.createdAt)).toBeVisible();
    expect(paper.getByText(/المركز الرئيسي/u)).toBeVisible();
    expect(paper.queryByText(/استخدم البطانة المعتمدة/u)).toBeNull();
  }
  const instructions = screen.getByRole("status");
  expect(instructions).toHaveTextContent("القطعة 02");
  expect(instructions).toHaveTextContent("استخدم البطانة المعتمدة");
  expect(instructions).not.toHaveTextContent(companion.id);
});
