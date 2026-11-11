import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { FactoryOrderPaper } from "./factory-order-paper";

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
