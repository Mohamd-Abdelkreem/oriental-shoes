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

it("renders the closed Quality projection with physical receipt separate", () => {
  render(
    <ManufacturingRail
      projection={{
        orderId: "quality-root",
        orderStatus: "APPROVED",
        currentDepartment: "QUALITY",
        countsByStage: {
          AWAITING_APPROVAL: 0,
          CUTTING: 1,
          PRODUCTION: 0,
          QUALITY: 2,
          WAREHOUSE: 1,
          CANCELLED: 0,
        },
        isReturned: true,
      }}
    />,
  );
  expect(screen.getByText(/استلام المستودع إجراء/)).toBeInTheDocument();
  expect(screen.getByText("2 قطعة حالياً")).toBeInTheDocument();
});
