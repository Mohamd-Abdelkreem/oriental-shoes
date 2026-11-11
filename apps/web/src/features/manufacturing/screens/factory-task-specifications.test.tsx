import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "../model/manufacturing.fixture";
import { FactoryTaskSpecifications } from "./factory-task-specifications";

it("renders retained specifications without demo defaults or private order headers", () => {
  const detail = manufacturingDetailFixture();
  for (const piece of detail.paper.order.pieces) {
    piece.leatherBase = null;
    piece.decoration = null;
    piece.sole = null;
    piece.additions = null;
  }
  render(
    <FactoryTaskSpecifications source="persisted" data={detail} rows={[]} />,
  );
  expect(screen.queryByText("جلد طبيعي أسود")).not.toBeInTheDocument();
  expect(screen.queryByText("فرشة طبية")).not.toBeInTheDocument();
  expect(screen.queryByText("Frozen address")).not.toBeInTheDocument();
  expect(screen.getByText("SM")).toBeInTheDocument();
});
