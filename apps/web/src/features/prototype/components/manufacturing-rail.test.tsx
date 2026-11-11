import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { manufacturingDetailFixture } from "@/features/manufacturing/model/manufacturing.fixture";
import { toManufacturingRail } from "@/features/manufacturing/model/manufacturing-view.model";
import { ManufacturingRail } from "./manufacturing-rail";

it("keeps every normal stage without inventing prior completions or warehouse receipt", () => {
  const detail = manufacturingDetailFixture();
  detail.paper.order.type = "REPAIR";
  render(<ManufacturingRail projection={toManufacturingRail(detail)} />);
  for (const name of [
    "القص",
    "الإنتاج والإصلاح",
    "الجودة والتغليف",
    "المستودع",
  ])
    expect(screen.getByText(name)).toBeInTheDocument();
  expect(screen.getByText("1 قطعة حالياً")).toBeInTheDocument();
  expect(screen.queryByText(/يتجاوز/u)).not.toBeInTheDocument();
});
